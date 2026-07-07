import { AgentState } from '../state.js';
import { CustomChatClient } from '../llm-client.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Recovery Node
 *
 * Triggered when the executor reports >= 2 consecutive failures.
 * Strategy:
 *   1. If failures < MAX: ask LLM for an alternative approach (injects hint into messages)
 *   2. If failures >= MAX: abort the run entirely with a clear error trace
 *
 * The recovery node injects a corrective HumanMessage into state.messages
 * so the planner on the next cycle knows what went wrong and tries a different tool.
 */
export async function recoveryNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log('--- ENTERING RECOVERY NODE ---');
  const failureCount = state.consecutiveFailures;

  // Track total recovery steps from the trace
  const totalRecoveryAttempts = state.trace.filter((t) => t.nodeName === 'recovery').length;

  if (totalRecoveryAttempts >= 3) {
    console.error(`[Recovery] Max recovery attempts (3) reached. Aborting agent run.`);
    return {
      nextToolCall: undefined,
      consecutiveFailures: 0,
      goalStatus: 'ABORTED',
      trace: [{
        id: 'rec-' + Date.now(),
        nodeName: 'recovery',
        timestamp: new Date().toISOString(),
        message: `❌ Abort: Reached maximum limit of 3 recovery attempts. Agent run halted.`,
        details: { failureCount, totalRecoveryAttempts, action: 'aborted_max_recoveries' },
      }],
    };
  }

  // Check for duplicate tool execution loop (same tool, args, and output repeated)
  const executorTraces = state.trace.filter((t) => t.nodeName === 'executor');
  let hasDuplicateLoop = false;
  if (executorTraces.length >= 2) {
    const lastTrace = executorTraces[executorTraces.length - 1];
    const lastCall = lastTrace.toolCalls?.[0];
    if (lastCall) {
      for (let i = 0; i < executorTraces.length - 1; i++) {
        const prevCall = executorTraces[i].toolCalls?.[0];
        if (!prevCall) continue;

        if (
          prevCall.server === lastCall.server &&
          prevCall.tool === lastCall.tool &&
          JSON.stringify(prevCall.arguments) === JSON.stringify(lastCall.arguments) &&
          prevCall.output === lastCall.output
        ) {
          hasDuplicateLoop = true;
          break;
        }
      }
    }
  }

  if (hasDuplicateLoop) {
    console.error(`[Recovery] Duplicate execution loop detected. Aborting agent run.`);
    return {
      nextToolCall: undefined,
      consecutiveFailures: 0,
      goalStatus: 'ABORTED',
      trace: [{
        id: 'rec-' + Date.now(),
        nodeName: 'recovery',
        timestamp: new Date().toISOString(),
        message: `❌ Abort: Duplicate execution loop detected (tool returned identical output repeatedly).`,
        details: { failureCount, action: 'aborted_duplicate_loop' },
      }],
    };
  }

  // Hard abort: too many failures in a row
  if (failureCount >= MAX_CONSECUTIVE_FAILURES) {
    console.error(`[Recovery] ${failureCount} consecutive failures. Aborting run.`);
    return {
      nextToolCall: undefined,
      consecutiveFailures: 0,
      goalStatus: 'ABORTED',
      trace: [{
        id: 'rec-' + Date.now(),
        nodeName: 'recovery',
        timestamp: new Date().toISOString(),
        message: `❌ Abort: ${failureCount} consecutive tool failures. No further recovery possible.`,
        details: { failureCount, action: 'aborted' },
      }],
    };
  }

  // Ask LLM for a corrective suggestion
  const model = new CustomChatClient({ temperature: 0.3 }); // Slightly higher temp for creative recovery

  // Build a summary of recent failures from trace
  const recentFailures = state.trace
    .filter((t) => t.toolCalls?.some((tc) => tc.status === 'failed'))
    .slice(-3)
    .map((t) => {
      const failedCall = t.toolCalls?.find((tc) => tc.status === 'failed');
      return `Tool: ${failedCall?.server}__${failedCall?.tool}, Error: ${failedCall?.error ?? 'unknown'}`;
    })
    .join('\n');

  const systemPrompt = `You are a recovery specialist for an AI agent. The agent has encountered ${failureCount} consecutive tool failures.
Your job is to suggest a DIFFERENT approach or alternative tool to try next.
Be concise. Output a single corrective instruction as plain text (not JSON).`;

  const userPrompt = `Original Goal: "${state.goal}"

Recent failures:
${recentFailures || 'Tool execution failed with unknown error.'}

What should the agent try differently? Provide a short corrective instruction.`;

  try {
    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);

    const suggestion = typeof response.content === 'string'
      ? response.content.trim()
      : 'Try an alternative approach or different tool arguments.';

    console.log(`[Recovery] LLM suggestion: ${suggestion}`);

    return {
      consecutiveFailures: 0, // Reset failure counter after recovery attempt
      trace: [{
        id: 'rec-' + Date.now(),
        nodeName: 'recovery',
        timestamp: new Date().toISOString(),
        message: `🔁 Recovery attempt ${failureCount}: ${suggestion}`,
        details: { failureCount, suggestion, action: 'rerouted_to_planner' },
      }],
    };
  } catch (err) {
    console.error('[Recovery] LLM recovery call failed:', err);
    return {
      consecutiveFailures: 0,
      trace: [{
        id: 'rec-' + Date.now(),
        nodeName: 'recovery',
        timestamp: new Date().toISOString(),
        message: `Recovery LLM call failed. Resetting failure count and returning to planner.`,
        details: { error: String(err) },
      }],
    };
  }
}

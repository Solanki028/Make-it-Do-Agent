import { AgentState } from '../state.js';
import { CustomChatClient } from '../llm-client.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

/**
 * Evaluator Node
 * 
 * Asks the LLM whether the original goal has been fully accomplished
 * based on the execution history. This prevents premature termination
 * (stopping just because nextToolCall is null) and also catches cases
 * where the planner loops without making real progress.
 *
 * Returns:
 *   - goalAchieved: true  → graph routes to END
 *   - goalAchieved: false → graph routes back to planner for another cycle
 */
export async function evaluatorNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log('--- ENTERING EVALUATOR NODE ---');

  // Hard ceiling: if we've exceeded maxSteps, terminate regardless of LLM verdict
  if (state.stepCount >= state.maxSteps) {
    console.warn(`[Evaluator] Hard stop: stepCount (${state.stepCount}) >= maxSteps (${state.maxSteps})`);
    return {
      nextToolCall: undefined,
      trace: [
        {
          id: 'eval-' + Date.now(),
          nodeName: 'evaluator',
          timestamp: new Date().toISOString(),
          message: `Hard stop triggered: reached maximum step limit of ${state.maxSteps}.`,
          details: { goalAchieved: false, reason: 'max_steps_exceeded' },
        },
      ],
    };
  }

  // Build detailed execution summary from trace history for the LLM to assess
  const executionSummary = state.trace
    .map((t) => {
      let str = `[${t.nodeName.toUpperCase()}] ${t.message}`;
      if (t.toolCalls && t.toolCalls.length > 0) {
        t.toolCalls.forEach((tc) => {
          str += `\n  - Tool Call: ${tc.server}__${tc.tool} -> status: ${tc.status}`;
          if (tc.arguments && Object.keys(tc.arguments).length > 0) {
            str += `\n    Arguments: ${JSON.stringify(tc.arguments).slice(0, 220)}`;
          }
          if (tc.output) {
            // Include a snippet of the tool output (first 300 chars) to prevent context bloat
            const truncatedOutput = typeof tc.output === 'string' ? tc.output : JSON.stringify(tc.output);
            str += `\n    Output: ${truncatedOutput.slice(0, 300)}`;
          }
          if (tc.error) {
            str += `\n    Error: ${tc.error}`;
          }
        });
      }
      return str;
    })
    .join('\n');

  const model = new CustomChatClient({ temperature: 0, jsonMode: true });

  const systemPrompt = `You are an evaluator for an AI agent. Your ONLY job is to determine whether the user's original goal has been fully accomplished based on the agent's execution history.

Respond with ONLY a JSON object in this exact format:
{
  "goalAchieved": true | false,
  "reason": "One sentence explanation"
}`;

  const userPrompt = `Original Goal: "${state.goal}"

Agent Execution History:
${executionSummary || 'No steps executed yet.'}

Has the goal been fully accomplished? Reply with ONLY the JSON object.`;

  try {
    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);

    const text = typeof response.content === 'string' ? response.content : '';
    const cleanJson = text.replace(/```json\n?|```/g, '').trim();
    const result = JSON.parse(cleanJson);

    const goalAchieved = result.goalAchieved === true;
    const reason = result.reason || (goalAchieved ? 'Goal accomplished.' : 'Goal not yet accomplished.');

    console.log(`[Evaluator] goalAchieved=${goalAchieved} — ${reason}`);

    // ── Generate human-readable run summary when goal is achieved ───────────
    let summary: string | undefined;
    if (goalAchieved) {
      try {
        const summaryResponse = await model.invoke([
          new SystemMessage('You are a concise reporter. Summarize what the AI agent accomplished in 2-3 sentences. Be specific about what was done, not just that it was done.'),
          new HumanMessage(
            `Goal: "${state.goal}"\n\nAgent execution history:\n${executionSummary}\n\nWrite a concise, user-friendly summary of what was accomplished.`
          ),
        ]);
        summary = typeof summaryResponse.content === 'string'
          ? summaryResponse.content.trim()
          : undefined;
      } catch {
        // Non-fatal — summary is optional
      }
    }

    let goalStatus: 'COMPLETED_SUCCESS' | 'COMPLETED_NO_RESULTS' | undefined;
    if (goalAchieved) {
      const executorTraces = state.trace.filter((t) => t.nodeName === 'executor');
      const lastExecutorTrace = executorTraces[executorTraces.length - 1];
      const lastObservation = lastExecutorTrace?.details?.observation;

      if (
        lastObservation &&
        lastObservation.successMetrics.businessSuccess === false &&
        lastObservation.error === 'No matching results found.'
      ) {
        goalStatus = 'COMPLETED_NO_RESULTS';
      } else {
        goalStatus = 'COMPLETED_SUCCESS';
      }
    }

    return {
      // Signal the graph router: null nextToolCall + goalAchieved=true → END
      nextToolCall: goalAchieved ? undefined : state.nextToolCall,
      goalStatus,
      trace: [
        {
          id: 'eval-' + Date.now(),
          nodeName: 'evaluator',
          timestamp: new Date().toISOString(),
          message: goalAchieved
            ? `✅ Goal achieved (${goalStatus}): ${reason}`
            : `🔄 Continuing: ${reason}`,
          details: { goalAchieved, reason, summary },
        },
      ],
    };
  } catch (err) {
    // On parse failure, be conservative: don't terminate — let planner decide
    console.error('[Evaluator] Failed to parse LLM response, deferring to planner:', err);
    return {
      trace: [
        {
          id: 'eval-' + Date.now(),
          nodeName: 'evaluator',
          timestamp: new Date().toISOString(),
          message: 'Evaluator parse error — deferring to planner for safety.',
          details: { error: String(err) },
        },
      ],
    };
  }
}

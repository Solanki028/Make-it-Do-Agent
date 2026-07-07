import { env } from '../../config/env.js';
import { AgentState } from '../state.js';
import { mcpClientManager } from '../../mcp/client-manager.js';
import { HumanMessage, SystemMessage, AIMessage, ToolMessage, BaseMessage } from '@langchain/core/messages';
import { CustomChatClient } from '../llm-client.js';
import crypto from 'crypto';

/**
 * Generates a stable fingerprint for a tool call (server + tool + args).
 * Used by loop detection to identify repeated identical calls.
 */
function toolCallFingerprint(server: string, tool: string, args: Record<string, any>): string {
  const payload = `${server}__${tool}:${JSON.stringify(args)}`;
  return crypto.createHash('md5').update(payload).digest('hex').slice(0, 8);
}

export async function plannerNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log('--- ENTERING PLANNER NODE ---');

  // ── Guard: Tool call already scheduled (e.g. from HITL resume or recovery node) ──
  if (state.nextToolCall) {
    console.log('[Planner] Tool call already scheduled, passing through to executor.');
    return {};
  }

  // ── Guard: API key missing ────────────────────────────────────────────────
  const hasKey = !!env.GITHUB_TOKEN || !!process.env.GITHUB_TOKEN;
  if (!hasKey) {
    console.warn('GITHUB_TOKEN is missing! Using Mock Planner Output.');
    const mockPlan = ['Analyze workspace', 'Mock list directory content', 'Produce report'];
    if (state.stepCount === 0) {
      const toolCallId = 'mock-tool-id';
      const aiMsg = new AIMessage({
        content: 'Using mock planner output.',
        tool_calls: [{
          id: toolCallId,
          name: 'local-filesystem__list_directory',
          args: { path: '.' }
        }]
      });
      return {
        plan: mockPlan,
        currentStepIndex: 0,
        nextToolCall: {
          id: toolCallId,
          server: 'local-filesystem',
          tool: 'list_directory',
          arguments: { path: '.' },
        },
        messages: [aiMsg],
        stepCount: state.stepCount + 1,
      };
    }
    return {
      currentStepIndex: state.currentStepIndex + 1,
      nextToolCall: undefined,
      messages: [new AIMessage('Completed mock planning steps.')],
      stepCount: state.stepCount + 1,
    };
  }

  // ── Guard: Max steps ceiling ───────────────────────────────────────────────
  if (state.stepCount >= state.maxSteps) {
    console.warn(`[Planner] Max steps (${state.maxSteps}) reached. Halting.`);
    return {
      nextToolCall: undefined,
      messages: [new AIMessage('Max steps ceiling reached. Exiting.')],
      stepCount: state.stepCount + 1,
      trace: [{
        id: 'plan-' + Date.now(),
        nodeName: 'planner',
        timestamp: new Date().toISOString(),
        message: `Hard stop: reached maximum of ${state.maxSteps} steps.`,
      }],
    };
  }

  const model = new CustomChatClient({ temperature: 0, jsonMode: true });
  const availableTools = mcpClientManager.getTools();

  const toolsCompact = availableTools
    .map((t) => `Server: ${t.serverName}\nTool: ${t.name}\nDescription: ${(t.description ?? '').slice(0, 120)}\n`)
    .join('\n');

  const systemPrompt = `You are the brain of "Make It Do", an agentic host.
Your goal is to accomplish: "${state.goal}"

Available tools:
${toolsCompact}

Current Plan: ${JSON.stringify(state.plan)}
Step index: ${state.currentStepIndex}

Output ONLY valid JSON (no markdown):
{
  "plan": ["step 1", "step 2", ...],
  "nextStepIndex": number,
  "nextToolCall": { "server": "server_name", "tool": "tool_name", "arguments": { ... } } | null,
  "reasoning": "why you chose this action"
}

The "server" field of "nextToolCall" MUST match the "Server" value of the tool exactly (e.g. "local-filesystem").
The "tool" field of "nextToolCall" MUST match the "Tool" value of the tool exactly (e.g. "read_file").
Do NOT prefix the tool name with the server name or combine them (do NOT use "local-filesystem__read_file" or "local-filesystem__local-filesystem__read_file"). Keep them strictly separate.

If the goal is fully accomplished, set "nextToolCall" to null.`;

  // ── Build message payload with rolling summarization ─────────────────
  // Compress older messages into a summary once history grows beyond threshold.
  // Lowered from 10 → 6 so that large tool outputs (files, .env) don’t stack up.
  const MESSAGE_SUMMARY_THRESHOLD = 6;
  let messagesToProcess = state.messages;

  if (state.messages.length > MESSAGE_SUMMARY_THRESHOLD) {
    const oldMessages = state.messages.slice(0, state.messages.length - MESSAGE_SUMMARY_THRESHOLD);
    const recentMessages = state.messages.slice(-MESSAGE_SUMMARY_THRESHOLD);

    const summaryText = oldMessages
      .map((m) => {
        const type = m._getType().toUpperCase();
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        // Cap each message snippet tightly to avoid the summary call itself being too large
        return `[${type}]: ${content.slice(0, 300)}`;
      })
      .join('\n');

    let compressedSummary = `[HISTORY SUMMARY]: Summarized ${oldMessages.length} earlier messages.\n${summaryText.slice(0, 1000)}`;

    try {
      const sumResp = await model.invoke([
        new SystemMessage('Summarize the following agent conversation history in 3-5 sentences, focusing on what tools were used and what results were obtained.'),
        new HumanMessage(summaryText.slice(0, 2000)),
      ]);
      if (typeof sumResp.content === 'string') {
        compressedSummary = `[HISTORY SUMMARY]: ${sumResp.content.trim()}`;
      }
    } catch {
      // Fall back to raw truncated summary on LLM failure
    }

    messagesToProcess = [
      new AIMessage(compressedSummary),
      ...recentMessages,
    ];
    console.log(`[Planner] Compressed ${oldMessages.length} old messages into rolling summary.`);
  }

  const formattedMessages: BaseMessage[] = [new SystemMessage(systemPrompt)];

  for (const m of messagesToProcess) {
    const rawContent = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    const contentText = rawContent.trim() || 'Tool executed successfully, but returned no data.';

    if (m._getType() === 'tool') {
      formattedMessages.push(new ToolMessage({
        content: contentText,
        name: (m as ToolMessage).name || 'mcp_tool',
        tool_call_id: (m as ToolMessage).tool_call_id || 'tc_call',
      }));
    } else if (m._getType() === 'ai') {
      const aiMsg = m as AIMessage;
      formattedMessages.push(new AIMessage({
        content: contentText,
        tool_calls: aiMsg.tool_calls,
      }));
    } else {
      formattedMessages.push(new HumanMessage(contentText || 'Please determine the next step.'));
    }
  }

  // Seed first human turn if no history
  if (formattedMessages.length === 1) {
    formattedMessages.push(new HumanMessage(state.goal.trim() || 'Please determine the next step.'));
  }

  // ── Call LLM ──────────────────────────────────────────────────────────────
  const response = await model.invoke(formattedMessages);

  // ── Token usage tracking ──────────────────────────────────────────────────
  const usage = (response as any).response_metadata?.usage ?? (response as any).usage_metadata;
  const promptTokens = usage?.input_tokens ?? usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.output_tokens ?? usage?.completion_tokens ?? 0;
  // GitHub Models / gpt-4o-mini pricing: ~$0.00015 per 1K input, ~$0.0006 per 1K output
  const runCost = (promptTokens / 1000) * 0.00015 + (completionTokens / 1000) * 0.0006;

  try {
    const text = typeof response.content === 'string' ? response.content : '';
    const cleanJson = text.replace(/```json\n?|```/g, '').trim();
    const result = JSON.parse(cleanJson);

    // ── Loop detection ────────────────────────────────────────────────────
    let nextToolCall = result.nextToolCall;
    if (nextToolCall) {
      const fp = toolCallFingerprint(nextToolCall.server, nextToolCall.tool, nextToolCall.arguments);
      const callCount = (state.loopHistory[fp] ?? 0) + 1;

      if (callCount >= 3) {
        console.warn(`[Planner] Loop detected! Tool call fingerprint "${fp}" seen ${callCount} times. Aborting tool call to break cycle.`);
        nextToolCall = null;
      }

      const updatedLoopHistory = { ...state.loopHistory, [fp]: callCount };

      // ── Risky action detection ─────────────────────────────────────────
      // If the tool involves destructive or write operations, pause for human approval.
      const RISKY_TOOLS = [
        'write_file', 'create_file', 'delete_file', 'move_file', 'rename_file',
        'edit_file', 'overwrite_file', 'delete_directory', 'remove_file',
        // GitHub destructive actions
        'create_pull_request', 'merge_pull_request', 'delete_branch',
        'push_files', 'create_repository', 'delete_repository',
        // Filesystem edits
        'apply_diff', 'patch_file',
      ];
      const isRiskyAction = nextToolCall && RISKY_TOOLS.some(
        (r) => nextToolCall!.tool.toLowerCase().includes(r.replace('_', ''))
               || nextToolCall!.tool.toLowerCase() === r
      );

      const toolCallId = 'tc_' + Date.now();
      const aiMsg = new AIMessage({
        content: result.reasoning || 'Planning next move.',
        tool_calls: nextToolCall ? [
          {
            id: toolCallId,
            name: `${nextToolCall.server}__${nextToolCall.tool}`,
            args: nextToolCall.arguments,
          }
        ] : undefined
      });

      if (isRiskyAction && nextToolCall) {
        const argsPreview = JSON.stringify(nextToolCall.arguments, null, 2).slice(0, 400);
        const approvalReason = `The agent wants to run a potentially destructive action:\n\nTool: ${nextToolCall.server}/${nextToolCall.tool}\n\nArguments:\n${argsPreview}\n\nReasoning: ${result.reasoning || 'No reasoning provided.'}`;
        console.warn(`[Planner] Risky action detected — requesting human approval for: ${nextToolCall.tool}`);

        return {
          plan: result.plan,
          currentStepIndex: result.nextStepIndex,
          nextToolCall: undefined,                    // DO NOT execute yet
          humanInputRequired: true,
          pendingApprovalToolCall: {
            id: toolCallId,
            server: nextToolCall.server,
            tool: nextToolCall.tool,
            arguments: nextToolCall.arguments,
          },
          approvalReason,
          messages: [aiMsg],
          stepCount: state.stepCount + 1,
          loopHistory: updatedLoopHistory,
          metrics: {
            promptTokens: (state.metrics?.promptTokens ?? 0) + promptTokens,
            completionTokens: (state.metrics?.completionTokens ?? 0) + completionTokens,
            totalCost: parseFloat(((state.metrics?.totalCost ?? 0) + runCost).toFixed(6)),
          },
          trace: [{
            id: 'plan-' + Date.now(),
            nodeName: 'planner',
            timestamp: new Date().toISOString(),
            message: `⏸ Pausing for approval: ${nextToolCall.server}/${nextToolCall.tool}`,
            details: {
              humanInputRequired: true,
              pendingToolCall: nextToolCall,
              approvalReason,
              tokens: { promptTokens, completionTokens, runCost },
            },
          }],
        };
      }

      return {
        plan: result.plan,
        currentStepIndex: result.nextStepIndex,
        nextToolCall: nextToolCall ? {
          id: toolCallId,
          server: nextToolCall.server,
          tool: nextToolCall.tool,
          arguments: nextToolCall.arguments,
        } : undefined,
        humanInputRequired: false,
        pendingApprovalToolCall: undefined,
        approvalReason: undefined,
        messages: [aiMsg],
        stepCount: state.stepCount + 1,
        loopHistory: updatedLoopHistory,
        metrics: {
          promptTokens: (state.metrics?.promptTokens ?? 0) + promptTokens,
          completionTokens: (state.metrics?.completionTokens ?? 0) + completionTokens,
          totalCost: parseFloat(((state.metrics?.totalCost ?? 0) + runCost).toFixed(6)),
        },
        trace: [{
          id: 'plan-' + Date.now(),
          nodeName: 'planner',
          timestamp: new Date().toISOString(),
          message: 'Planner reasoning: ' + (result.reasoning || 'Planning next move.'),
          details: {
            nextToolCall: nextToolCall,
            loopGuard: callCount >= 3 ? `Blocked repeat call (seen ${callCount}x)` : undefined,
            tokens: { promptTokens, completionTokens, runCost },
          },
        }],
      };
    }

    const simpleAiMsg = new AIMessage({
      content: result.reasoning || 'Goal completed.',
    });

    return {
      plan: result.plan,
      currentStepIndex: result.nextStepIndex,
      nextToolCall: undefined,
      messages: [simpleAiMsg],
      stepCount: state.stepCount + 1,
      metrics: {
        promptTokens: (state.metrics?.promptTokens ?? 0) + promptTokens,
        completionTokens: (state.metrics?.completionTokens ?? 0) + completionTokens,
        totalCost: parseFloat(((state.metrics?.totalCost ?? 0) + runCost).toFixed(6)),
      },
      trace: [{
        id: 'plan-' + Date.now(),
        nodeName: 'planner',
        timestamp: new Date().toISOString(),
        message: 'Planner reasoning: ' + (result.reasoning || 'Planning next move.'),
        details: { nextToolCall: null, tokens: { promptTokens, completionTokens, runCost } },
      }],
    };
  } catch (err) {
    console.error('[Planner] Failed to parse LLM output:', err);
    return {
      stepCount: state.stepCount + 1,
      trace: [{
        id: 'plan-' + Date.now(),
        nodeName: 'planner',
        timestamp: new Date().toISOString(),
        message: 'Planner failed to parse LLM output. Will retry or terminate.',
        details: { error: String(err) },
      }],
    };
  }
}

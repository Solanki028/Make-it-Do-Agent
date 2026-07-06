import { env } from '../../config/env.js';
import { AgentState } from '../state.js';
import { mcpClientManager } from '../../mcp/client-manager.js';
import { HumanMessage, SystemMessage, AIMessage, ToolMessage, BaseMessage } from '@langchain/core/messages';
import { CustomChatClient } from '../llm-client.js';

export async function plannerNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log('--- ENTERING PLANNER NODE ---');

  const hasKey = !!env.GITHUB_TOKEN || !!process.env.GITHUB_TOKEN;
  if (!hasKey) {
    console.warn('GITHUB_TOKEN is missing! Using Mock Planner Output.');
    const mockPlan = ['Analyze workspace', 'Mock list directory content', 'Produce report'];
    
    if (state.stepCount === 0) {
      return {
        plan: mockPlan,
        currentStepIndex: 0,
        nextToolCall: {
          id: 'mock-tool-id',
          server: 'local-filesystem',
          tool: 'list_directory',
          arguments: { path: '.' },
        },
        stepCount: state.stepCount + 1,
      };
    } else {
      return {
        currentStepIndex: state.currentStepIndex + 1,
        nextToolCall: undefined,
        stepCount: state.stepCount + 1,
      };
    }
  }

  const model = new CustomChatClient({
    temperature: 0,
  });

  const availableTools = mcpClientManager.getTools();
  const toolsFormatted = availableTools.map((t) => ({
    namespacedName: `${t.serverName}__${t.name}`,
    description: t.description,
    schema: t.inputSchema,
  }));

  const systemPrompt = `You are the brain of "Make It Do", an agentic host.
Your goal is to accomplish: "${state.goal}"

Available tools to execute actions:
${JSON.stringify(toolsFormatted, null, 2)}

Current Plan steps:
${JSON.stringify(state.plan, null, 2)}
Current Step Index: ${state.currentStepIndex}

Based on the goal and execution history, you must output a JSON structure:
{
  "plan": ["step 1", "step 2", ...],
  "nextStepIndex": number,
  "nextToolCall": {
    "server": "server_name",
    "tool": "tool_name",
    "arguments": { ... }
  } | null,
  "reasoning": "Explain why you chose this action"
}

If the goal is fully accomplished, set "nextToolCall" to null.
Ensure your response is valid JSON.`;

  const formattedMessages: BaseMessage[] = [
    new SystemMessage(systemPrompt)
  ];

  for (const m of state.messages) {
    const rawContent = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    const contentText = rawContent.trim() || "Tool executed successfully, but returned no data.";

    if (m._getType() === 'tool') {
      formattedMessages.push(new ToolMessage({
        content: contentText,
        name: (m as ToolMessage).name || 'mcp_tool',
        tool_call_id: (m as ToolMessage).tool_call_id || 'tc_call',
      }));
    } else if (m._getType() === 'ai') {
      formattedMessages.push(new AIMessage(contentText));
    } else {
      const promptText = contentText || "Please determine the next step.";
      formattedMessages.push(new HumanMessage(promptText));
    }
  }

  // Ensure there is at least one HumanMessage turn at the end if history is empty
  if (formattedMessages.length === 1) {
    const promptText = state.goal.trim() || "Please determine the next step.";
    formattedMessages.push(new HumanMessage(promptText));
  }

  const response = await model.invoke(formattedMessages);

  try {
    const text = typeof response.content === 'string' ? response.content : '';
    const cleanJson = text.replace(/```json\n?|```/g, '').trim();
    const result = JSON.parse(cleanJson);

    return {
      plan: result.plan,
      currentStepIndex: result.nextStepIndex,
      nextToolCall: result.nextToolCall ? {
        id: 'tc_' + Date.now(),
        server: result.nextToolCall.server,
        tool: result.nextToolCall.tool,
        arguments: result.nextToolCall.arguments,
      } : undefined,
      stepCount: state.stepCount + 1,
      trace: [
        {
          id: 'step-' + Date.now(),
          nodeName: 'planner',
          timestamp: new Date().toISOString(),
          message: 'Planner reasoning: ' + (result.reasoning || 'Planning next move.'),
          details: { nextToolCall: result.nextToolCall },
        }
      ]
    };
  } catch (err) {
    console.error('Failed to parse planner output:', err);
    return {
      stepCount: state.stepCount + 1,
    };
  }
}

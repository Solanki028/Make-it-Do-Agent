import { StateGraph, START, END } from '@langchain/langgraph';
import { AgentState, agentStateChannels } from './state.js';
import { plannerNode } from './nodes/planner.js';
import { executorNode } from './nodes/executor.js';
import { evaluatorNode } from './nodes/evaluator.js';
import { recoveryNode } from './nodes/recovery.js';
import { HumanMessage } from '@langchain/core/messages';
import { mcpClientManager } from '../mcp/client-manager.js';

// ─────────────────────────────────────────────
// Tool Validator Node
// Checks if the planned tool call actually exists in the dynamic MCP registry.
// If it is hallucinated, blocks it and feeds corrective system context to the planner.
// ─────────────────────────────────────────────
async function toolValidatorNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log('--- TOOL VALIDATOR NODE ---');
  const toolCall = state.nextToolCall;
  if (!toolCall) {
    return {};
  }

  const availableTools = mcpClientManager.getTools();
  const exists = availableTools.some(
    (t) => t.serverName === toolCall.server && t.name === toolCall.tool
  );

  if (!exists) {
    console.warn(`[Validator] Hallucinated tool call blocked: ${toolCall.server}__${toolCall.tool}`);
    const warningMsg = new HumanMessage({
      content: `System Alert: The tool "${toolCall.server}__${toolCall.tool}" does not exist. Please choose ONLY from the list of available tools. Do not hallucinate names.`,
    });

    const traceStep = {
      id: 'val-' + Date.now(),
      nodeName: 'validator',
      timestamp: new Date().toISOString(),
      message: `Blocked hallucinated tool call: ${toolCall.server}/${toolCall.tool}`,
      toolCalls: [
        {
          server: toolCall.server,
          tool: toolCall.tool,
          arguments: toolCall.arguments,
          status: 'failed' as const,
          error: `Tool "${toolCall.server}__${toolCall.tool}" is not registered on the host.`,
        },
      ],
    };

    return {
      nextToolCall: undefined, // Clear the hallucinated tool
      messages: [warningMsg],  // Inject corrective instructions into LLM context
      consecutiveFailures: state.consecutiveFailures + 1,
      trace: [traceStep],
    };
  }

  console.log(`[Validator] Tool call validated: ${toolCall.server}__${toolCall.tool}`);
  return {};
}

// ─────────────────────────────────────────────
// Human Gate Node — pauses the run, waiting for external /approve call
// The execution controller will save state to approvalStore and re-run
// the graph when the user approves or denies.
// ─────────────────────────────────────────────
async function humanGateNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log('--- HUMAN GATE NODE — pausing for approval ---');
  // Just ensure the flag is set; the controller handles the actual pause
  return {
    humanInputRequired: true,
  };
}

// ─────────────────────────────────────────────
// Router: Planner → Validator | HumanGate | Evaluator
// ─────────────────────────────────────────────
function routeAfterPlanner(state: AgentState): 'validator' | 'human_gate' | 'evaluator' {
  // Hard safety: if stepCount already at ceiling, skip straight to evaluation
  if (state.stepCount >= state.maxSteps) {
    return 'evaluator';
  }
  if (state.nextToolCall) {
    return 'validator'; // Must validate before execution
  }
  if (state.humanInputRequired) {
    return 'human_gate';
  }
  return 'evaluator';
}

// ─────────────────────────────────────────────
// Router: Validator → Executor | Planner | Recovery
// ─────────────────────────────────────────────
function routeAfterValidator(state: AgentState): 'executor' | 'human_gate' | 'recovery' | 'planner' {
  // If validator rejected the tool call, redirect to planner or recovery
  if (!state.nextToolCall) {
    if (state.consecutiveFailures >= 2) {
      return 'recovery';
    }
    return 'planner';
  }
  
  if (state.humanInputRequired) {
    return 'human_gate';
  }
  return 'executor';
}

// ─────────────────────────────────────────────
// Router: Evaluator → END | Planner
// Decision is driven by the LLM evaluator's verdict written into state.
// We inspect the last evaluator trace entry for the goalAchieved flag.
// ─────────────────────────────────────────────
function routeAfterEvaluator(state: AgentState): typeof END | 'planner' {
  // Hard stop: exceeded max steps
  if (state.stepCount >= state.maxSteps) {
    console.log('[Router] Max steps reached — terminating.');
    return END;
  }

  // Find the last evaluator trace entry to read its verdict
  const lastEvalTrace = [...state.trace]
    .reverse()
    .find((t) => t.nodeName === 'evaluator');

  const goalAchieved = lastEvalTrace?.details?.goalAchieved === true;

  if (goalAchieved) {
    console.log('[Router] Goal achieved — routing to END.');
    return END;
  }

  // Safety fallback: if planner explicitly cleared nextToolCall and no eval trace, end
  if (!state.nextToolCall && !lastEvalTrace) {
    return END;
  }

  console.log('[Router] Goal not yet achieved — routing back to planner.');
  return 'planner';
}

// ─────────────────────────────────────────────
// Router: Executor → Evaluator | Recovery
// ─────────────────────────────────────────────
function routeAfterExecutor(state: AgentState): 'evaluator' | 'recovery' {
  // More than 2 consecutive failures → trigger recovery strategy
  if (state.consecutiveFailures >= 2) {
    return 'recovery';
  }
  return 'evaluator';
}

// ─────────────────────────────────────────────
// Build the LangGraph Workflow
// ─────────────────────────────────────────────
const workflow = new StateGraph<AgentState>({
  channels: agentStateChannels,
})
  .addNode('planner', plannerNode)
  .addNode('validator', toolValidatorNode)
  .addNode('executor', executorNode)
  .addNode('human_gate', humanGateNode)
  .addNode('recovery', recoveryNode)
  .addNode('evaluator', evaluatorNode)

  .addEdge(START, 'planner')

  .addConditionalEdges('planner', routeAfterPlanner, {
    validator: 'validator',
    human_gate: 'human_gate',
    evaluator: 'evaluator',
  })

  .addConditionalEdges('validator', routeAfterValidator, {
    executor: 'executor',
    human_gate: 'human_gate',
    recovery: 'recovery',
    planner: 'planner',
  })

  .addConditionalEdges('executor', routeAfterExecutor, {
    evaluator: 'evaluator',
    recovery: 'recovery',
  })

  .addEdge('recovery', 'planner')
  .addEdge('human_gate', END)  // Pause here — /approve endpoint re-runs graph

  .addConditionalEdges('evaluator', routeAfterEvaluator, {
    [END]: END,
    planner: 'planner',
  });

export const graph = workflow.compile();

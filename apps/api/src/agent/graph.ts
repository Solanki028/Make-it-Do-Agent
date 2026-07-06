import { StateGraph, START, END } from '@langchain/langgraph';
import { AgentState, agentStateChannels } from './state.js';
import { plannerNode } from './nodes/planner.js';
import { executorNode } from './nodes/executor.js';
import { evaluatorNode } from './nodes/evaluator.js';
import { recoveryNode } from './nodes/recovery.js';

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
// Router: Planner → Executor | HumanGate | Evaluator
// ─────────────────────────────────────────────
function routeAfterPlanner(state: AgentState): 'executor' | 'human_gate' | 'evaluator' {
  // Hard safety: if stepCount already at ceiling, skip straight to evaluation
  if (state.stepCount >= state.maxSteps) {
    return 'evaluator';
  }
  if (state.nextToolCall) {
    return 'executor';
  }
  if (state.humanInputRequired) {
    return 'human_gate';
  }
  return 'evaluator';
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
  .addNode('executor', executorNode)
  .addNode('human_gate', humanGateNode)
  .addNode('recovery', recoveryNode)
  .addNode('evaluator', evaluatorNode)

  .addEdge(START, 'planner')

  .addConditionalEdges('planner', routeAfterPlanner, {
    executor: 'executor',
    human_gate: 'human_gate',
    evaluator: 'evaluator',
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

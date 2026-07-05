import { StateGraph, START, END } from '@langchain/langgraph';
import { AgentState, agentStateChannels } from './state.js';
import { plannerNode } from './nodes/planner.js';
import { executorNode } from './nodes/executor.js';
import { evaluatorNode } from './nodes/evaluator.js';
import { recoveryNode } from './nodes/recovery.js';

async function humanGateNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log('--- HUMAN GATE NODE ---');
  return {
    humanInputRequired: true,
  };
}

// Router functions for conditional edges
function routeAfterPlanner(state: AgentState): 'executor' | 'human_gate' | 'evaluator' {
  if (state.nextToolCall) {
    return 'executor';
  }
  if (state.humanInputRequired) {
    return 'human_gate';
  }
  return 'evaluator';
}

function routeAfterEvaluator(state: AgentState): typeof END | 'planner' {
  const isGoalMet = state.currentStepIndex >= state.plan.length && state.plan.length > 0;
  if (isGoalMet) {
    return END;
  }
  return 'planner';
}

// Build the Graph
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
  
  .addEdge('executor', 'evaluator')
  .addEdge('recovery', 'planner')
  .addEdge('human_gate', 'planner')
  
  .addConditionalEdges('evaluator', routeAfterEvaluator, {
    [END]: END,
    planner: 'planner',
  });

export const graph = workflow.compile();

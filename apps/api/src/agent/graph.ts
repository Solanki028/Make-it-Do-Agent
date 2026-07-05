import { StateGraph, START, END } from '@langchain/langgraph';
import { AgentState, agentStateChannels } from './state.js';

// Node implementations
async function plannerNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log('--- PLANNER NODE ---');
  // Dynamic planning logic goes here
  return {
    stepCount: state.stepCount + 1,
  };
}

async function executorNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log('--- EXECUTOR NODE ---');
  // Dynamic tool execution goes here
  return {};
}

async function humanGateNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log('--- HUMAN GATE NODE ---');
  // Pause state and flag humanInputRequired
  return {
    humanInputRequired: true,
  };
}

async function recoveryNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log('--- RECOVERY NODE ---');
  // Recover from failures
  return {
    consecutiveFailures: state.consecutiveFailures + 1,
  };
}

async function evaluatorNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log('--- EVALUATOR NODE ---');
  // Check if target goal is met
  return {};
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
  // Check if evaluation is successful
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

import { AgentState } from '../state.js';

export async function evaluatorNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log('--- ENTERING EVALUATOR NODE ---');
  return {
    trace: [
      {
        id: 'eval-' + Date.now(),
        nodeName: 'evaluator',
        timestamp: new Date().toISOString(),
        message: 'Evaluating run completion against user goals...',
      }
    ]
  };
}

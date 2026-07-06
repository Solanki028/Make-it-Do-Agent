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

  // Build execution summary from trace history for the LLM to assess
  const executionSummary = state.trace
    .map((t) => `[${t.nodeName.toUpperCase()}] ${t.message}`)
    .join('\n');

  const model = new CustomChatClient({ temperature: 0 });

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

    return {
      // Signal the graph router: null nextToolCall + goalAchieved=true → END
      nextToolCall: goalAchieved ? undefined : state.nextToolCall,
      trace: [
        {
          id: 'eval-' + Date.now(),
          nodeName: 'evaluator',
          timestamp: new Date().toISOString(),
          message: goalAchieved
            ? `✅ Goal achieved: ${reason}`
            : `🔄 Continuing: ${reason}`,
          details: { goalAchieved, reason },
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

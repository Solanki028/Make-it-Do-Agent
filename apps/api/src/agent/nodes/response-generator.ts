import { AgentState } from '../state.js';
import { CustomChatClient } from '../llm-client.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

/**
 * Final Response Generator Node
 *
 * Runs after evaluation has confirmed the goal is either accomplished or halted.
 * Synthesizes all execution steps and successful tool observations into a highly polished,
 * conversational answer matching the original user goal.
 */
export async function responseGeneratorNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log('--- ENTERING FINAL RESPONSE GENERATOR NODE ---');

  // 1. Gather all observations from the execution trace
  const observations = state.trace
    .filter((t) => t.nodeName === 'executor')
    .map((t) => {
      const obs = t.details?.observation;
      if (!obs) return null;
      return {
        tool: `${obs.server}/${obs.tool}`,
        arguments: obs.arguments,
        success: obs.successMetrics?.transportSuccess && obs.successMetrics?.toolSuccess,
        output: obs.output,
        images: obs.images,
        error: obs.error,
      };
    })
    .filter((o): o is NonNullable<typeof o> => o !== null);

  // 2. Format observations into compact text, truncating large outputs (>2000 chars) to prevent context bloat
  const compactObservations = observations
    .map((obs, idx) => {
      let outputText = typeof obs.output === 'string' ? obs.output : JSON.stringify(obs.output);
      if (outputText.length > 2000) {
        outputText = outputText.slice(0, 2000) + `\n\n[...output truncated to save tokens...]`;
      }

      const hasScreenshot = obs.images && obs.images.length > 0;

      return `Observation ${idx + 1}:
Tool: ${obs.tool}
Arguments: ${JSON.stringify(obs.arguments)}
Status: ${obs.success ? 'Success' : 'Failed'}
Has Screenshot: ${hasScreenshot ? 'Yes' : 'No'}
Output:
${outputText}
${obs.error ? `Error: ${obs.error}` : ''}
`;
    })
    .join('\n---\n');

  // 3. Extract any screenshot metadata (to verify references)
  const screenshots: { data: string; mimeType: string }[] = [];
  observations.forEach((obs) => {
    if (obs.images && Array.isArray(obs.images)) {
      obs.images.forEach((img) => {
        screenshots.push({
          data: img.data,
          mimeType: img.mimeType || 'image/png',
        });
      });
    }
  });

  // 4. Construct prompts and invoke model
  const model = new CustomChatClient({ temperature: 0.2 });

  const systemPrompt = `You are a helpful, conversational AI Assistant. Your task is to provide the final response to the user's goal based on the tool observations.
Do NOT simply list the steps the agent took. Speak directly to the user's goal and provide the requested information in a polished, conversational format (like ChatGPT or Gemini).
If a file was read, expose its contents or a meaningful summary. If code was searched, list the matching files and summarize the results.
If no results were found for a search, explain that clearly. If a screenshot was taken, acknowledge it and mention that they can view it.`;

  const userPrompt = `Original Goal: "${state.goal}"

Tool Observations:
${compactObservations || 'No tool actions were executed.'}

Please generate the final response to the user.`;

  let finalResponse = '';
  try {
    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);
    finalResponse = typeof response.content === 'string' ? response.content.trim() : 'Goal execution finished.';
  } catch (err: any) {
    console.error('[Response Generator] LLM call failed:', err);
    finalResponse = `Goal execution finished, but failed to generate conversational response.`;
  }

  // 5. Append final response step to trace
  const traceStep = {
    id: 'final-' + Date.now(),
    nodeName: 'response_generator',
    timestamp: new Date().toISOString(),
    message: finalResponse,
    details: {
      screenshots: screenshots.length > 0 ? screenshots : undefined,
    },
  };

  return {
    finalResponse,
    trace: [traceStep],
  };
}

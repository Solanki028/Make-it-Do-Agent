import { AgentState } from '../state.js';
import { mcpClientManager } from '../../mcp/client-manager.js';
import { ToolMessage } from '@langchain/core/messages';

export async function executorNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log('--- ENTERING EXECUTOR NODE ---');
  const toolCall = state.nextToolCall;

  if (!toolCall) {
    console.log('No tool call scheduled, skipping execution.');
    return {};
  }

  const { id, server, tool, arguments: args } = toolCall;
  console.log(`Executing tool: ${server}__${tool} with args:`, args);

  let transportSuccess = false;
  let toolSuccess = false;
  let businessSuccess = false;
  let resultStr = '';
  let errorStr = '';

  try {
    if (id === 'mock-tool-id') {
      transportSuccess = true;
      toolSuccess = true;
      businessSuccess = true;
      resultStr = JSON.stringify({
        status: 'success',
        files: ['package.json', 'README.md', 'apps/', 'tsconfig.json'],
        message: 'Mock file list retrieved successfully.',
      });
    } else {
      // 1. Transport Success: connection & invocation completed without throwing exception
      const response = await mcpClientManager.executeTool(server, tool, args);
      transportSuccess = true;

      // 2. Tool Success: MCP server returned result without isError flag
      toolSuccess = response.isError !== true;

      if (response.content && Array.isArray(response.content)) {
        const texts = response.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text);
        resultStr = texts.join('\n');
      } else {
        resultStr = JSON.stringify(response);
      }

      if (!resultStr || resultStr.trim() === '') {
        resultStr = "Tool executed successfully, but returned no data.";
      }

      // 3. Business Success outcome evaluation
      if (toolSuccess) {
        const errorKeywords = ['error:', 'failed', 'invalid', 'denied', 'exception'];
        const hasErrorKeyword = errorKeywords.some(keyword => resultStr.toLowerCase().includes(keyword));
        
        const emptyKeywords = ['no matches', 'no files', 'not found', 'no results', 'empty directory', '0 files'];
        const hasEmptyKeyword = emptyKeywords.some(keyword => resultStr.toLowerCase().includes(keyword));
        const isEmpty = resultStr.trim().length === 0 || hasEmptyKeyword;

        if (hasErrorKeyword) {
          businessSuccess = false;
          errorStr = 'Business error keywords detected in output.';
        } else if (isEmpty) {
          businessSuccess = false; // Empty search is transportSuccess=true, toolSuccess=true, businessSuccess=false
          errorStr = 'No matching results found.';
        } else {
          businessSuccess = true;
        }
      } else {
        errorStr = resultStr || 'MCP tool execution returned an error flag.';
      }
    }
  } catch (err: any) {
    transportSuccess = false;
    toolSuccess = false;
    businessSuccess = false;
    errorStr = err.message || 'Transport connection/execution error';
    resultStr = `Error (Transport): ${errorStr}`;
  }

  // ── Truncate output sent to the LLM ───────────────────────────────────
  const MAX_LLM_OUTPUT_CHARS = 3000;
  const fullOutput = resultStr;
  const llmOutput = resultStr.length > MAX_LLM_OUTPUT_CHARS
    ? resultStr.slice(0, MAX_LLM_OUTPUT_CHARS)
      + `\n\n[...output truncated — ${resultStr.length - MAX_LLM_OUTPUT_CHARS} more chars not shown to save tokens. Full content is available above.]`
    : resultStr;

  // Structured Observation Object
  const observation = {
    toolCallId: id,
    server,
    tool,
    arguments: args,
    successMetrics: {
      transportSuccess,
      toolSuccess,
      businessSuccess,
    },
    output: fullOutput,
    error: errorStr || undefined,
  };

  // Tool execution status: succeeds if transport & tool succeeded, and no business errors occurred
  const hasBusinessError = !businessSuccess && errorStr !== 'No matching results found.' && errorStr !== '';
  const toolExecutionSucceeded = transportSuccess && toolSuccess && !hasBusinessError;

  const traceStep = {
    id: 'exec-' + Date.now(),
    nodeName: 'executor',
    timestamp: new Date().toISOString(),
    message: toolExecutionSucceeded
      ? (businessSuccess ? `Successfully executed tool ${tool} on server ${server}` : `Executed tool ${tool} on server ${server}: ${errorStr}`)
      : `Failed executing tool ${tool} on server ${server}: ${errorStr}`,
    details: {
      observation, // Exposed as structured observation
    },
    toolCalls: [
      {
        server,
        tool,
        arguments: args,
        status: toolExecutionSucceeded ? ('success' as const) : ('failed' as const),
        output: fullOutput,
        error: toolExecutionSucceeded ? undefined : errorStr,
      },
    ],
  };

  const toolMsg = new ToolMessage({
    content: toolExecutionSucceeded ? llmOutput : `Error: ${errorStr}\nDetails: ${llmOutput}`,
    name: `${server}__${tool}`,
    tool_call_id: id,
  });

  return {
    messages: [toolMsg],
    nextToolCall: undefined,
    consecutiveFailures: toolExecutionSucceeded ? 0 : state.consecutiveFailures + 1,
    trace: [traceStep],
  };
}

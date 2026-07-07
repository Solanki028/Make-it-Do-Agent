import { AgentState } from '../state.js';
import { mcpClientManager } from '../../mcp/client-manager.js';
import { ToolMessage } from '@langchain/core/messages';
import { buildStructuredObservation } from '../observation-builder.js';

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
  let imageContent: { data: string; mimeType: string }[] = [];
  let toolDisplayText = '';
  let toolImageNote = '';
  const startedAt = Date.now();
  let filesCreated: string[] = [];
  let filesModified: string[] = [];

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
        
        imageContent = response.content
          .filter((c: any) => c.type === 'image')
          .map((c: any) => ({
            data: c.data,
            mimeType: c.mimeType || 'image/png',
          }));

        if (imageContent.length > 0) {
          toolImageNote = `[${imageContent.length} image(s) omitted from LLM context]`;
        }

        const imageStr = imageContent
          .map((c) => `data:${c.mimeType};base64,${c.data}`)
          .join('\n');

        toolDisplayText = texts.join('\n');
        resultStr = [toolDisplayText, imageStr].filter(Boolean).join('\n');
      } else {
        toolDisplayText = JSON.stringify(response);
        resultStr = JSON.stringify(response);
      }

      if (!resultStr || resultStr.trim() === '') {
        resultStr = "Tool executed successfully, but returned no data.";
      }

      if (typeof response?.content === 'object' && response.content) {
        const content = Array.isArray(response.content) ? response.content : [response.content];
        for (const item of content) {
          if (item?.type === 'text' && typeof item.text === 'string') {
            const lower = item.text.toLowerCase();
            if (lower.includes('created')) {
              const match = item.text.match(/([A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|json|md|txt|html|css))/gi);
              if (match) filesCreated.push(...match);
            }
            if (lower.includes('updated') || lower.includes('modified')) {
              const match = item.text.match(/([A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|json|md|txt|html|css))/gi);
              if (match) filesModified.push(...match);
            }
          }
        }
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
  const MAX_LLM_OUTPUT_CHARS = 1200;
  const fullOutput = resultStr;
  const llmPayload = [toolDisplayText, toolImageNote].filter(Boolean).join('\n\n');
  const llmOutput = llmPayload.length > MAX_LLM_OUTPUT_CHARS
    ? llmPayload.slice(0, MAX_LLM_OUTPUT_CHARS - 80)
      + `\n\n[...output truncated — ${llmPayload.length - MAX_LLM_OUTPUT_CHARS} more chars not shown to save tokens...]`
    : llmPayload;

  const observation = buildStructuredObservation({
    toolCallId: id,
    server,
    tool,
    arguments: args,
    output: fullOutput,
    successMetrics: {
      transportSuccess,
      toolSuccess,
      businessSuccess,
    },
    error: errorStr || undefined,
    executionDurationMs: Date.now() - startedAt,
    filesCreated,
    filesModified,
    images: imageContent.length > 0 ? imageContent : undefined,
  });

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
      observation,
      observationSummary: observation.summary,
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

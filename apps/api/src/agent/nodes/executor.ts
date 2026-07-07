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

  try {
    let resultStr = '';
    if (id === 'mock-tool-id') {
      resultStr = JSON.stringify({
        status: 'success',
        files: ['package.json', 'README.md', 'apps/', 'tsconfig.json'],
        message: 'Mock file list retrieved successfully.',
      });
    } else {
      const response = await mcpClientManager.executeTool(server, tool, args);
      const isMcpError = response.isError === true;
      
      if (response.content && Array.isArray(response.content)) {
        const texts = response.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text);
        resultStr = texts.join('\n');
      } else {
        resultStr = JSON.stringify(response);
      }

      if (isMcpError) {
        throw new Error(resultStr || 'MCP tool execution failed.');
      }
    }

    if (!resultStr || resultStr.trim() === '') {
      resultStr = "Tool executed successfully, but returned no data.";
    }

    // ── Truncate output sent to the LLM ───────────────────────────────────
    // Large file reads (e.g. .env, big JSON) blow past gpt-4o-mini's 8k limit.
    // The full content is stored in trace for the UI; the LLM gets a trimmed version.
    const MAX_LLM_OUTPUT_CHARS = 3000;
    const fullOutput = resultStr;
    const llmOutput = resultStr.length > MAX_LLM_OUTPUT_CHARS
      ? resultStr.slice(0, MAX_LLM_OUTPUT_CHARS)
        + `\n\n[...output truncated — ${resultStr.length - MAX_LLM_OUTPUT_CHARS} more chars not shown to save tokens. Full content is available above.]`
      : resultStr;

    const traceStep = {
      id: 'exec-' + Date.now(),
      nodeName: 'executor',
      timestamp: new Date().toISOString(),
      message: `Successfully executed tool ${tool} on server ${server}`,
      toolCalls: [
        {
          server,
          tool,
          arguments: args,
          status: 'success' as const,
          output: fullOutput,  // Full output shown in UI
        },
      ],
    };

    const toolMsg = new ToolMessage({
      content: llmOutput,       // Truncated output sent to LLM
      name: `${server}__${tool}`,
      tool_call_id: id,
    });

    return {
      messages: [toolMsg],
      nextToolCall: undefined,
      consecutiveFailures: 0,
      trace: [traceStep],
    };
  } catch (err: any) {
    console.error(`Tool execution failed for ${server}__${tool}:`, err);
    
    const traceStep = {
      id: 'exec-' + Date.now(),
      nodeName: 'executor',
      timestamp: new Date().toISOString(),
      message: `Failed to execute tool ${tool} on server ${server}`,
      toolCalls: [
        {
          server,
          tool,
          arguments: args,
          status: 'failed' as const,
          error: err.message || 'Execution error',
        },
      ],
    };

    return {
      consecutiveFailures: state.consecutiveFailures + 1,
      nextToolCall: undefined,
      trace: [traceStep],
    };
  }
}

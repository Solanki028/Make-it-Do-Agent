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
      if (response.content && Array.isArray(response.content)) {
        const texts = response.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text);
        resultStr = texts.join('\n');
      } else {
        resultStr = JSON.stringify(response);
      }
    }

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
          output: resultStr,
        },
      ],
    };

    const toolMsg = new ToolMessage({
      content: resultStr,
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

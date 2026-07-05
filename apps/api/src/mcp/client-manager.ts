import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { prisma } from '../db/prisma.js';

export interface MCPToolMetadata {
  name: string;
  description?: string;
  inputSchema: any;
  serverName: string;
}

export class MCPClientManager {
  private clients: Map<string, Client> = new Map();
  private tools: Map<string, MCPToolMetadata> = new Map();

  async initialize() {
    // 1. Fetch active servers from db
    const configs = await prisma.mCPConfig.findMany({
      where: { isEnabled: true },
    });

    for (const config of configs) {
      try {
        console.log(`Connecting to MCP Server: ${config.name} (${config.transportType})...`);
        let transport;

        if (config.transportType === 'STDIO') {
          // connectionString contains command arguments (JSON array)
          const args = JSON.parse(config.connectionString);
          const command = args.shift();
          
          transport = new StdioClientTransport({
            command,
            args,
            env: config.envVariables as Record<string, string>,
          });
        } else {
          // SSE transport
          transport = new SSEClientTransport(new URL(config.connectionString));
        }

        const client = new Client({
          name: 'make-it-do-host',
          version: '1.0.0',
        }, {
          capabilities: {},
        });

        await client.connect(transport);
        this.clients.set(config.name, client);

        // Fetch tools list
        const response = await client.listTools();
        for (const tool of response.tools) {
          const namespacedName = `${config.name}__${tool.name}`;
          this.tools.set(namespacedName, {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            serverName: config.name,
          });
        }
        console.log(`Successfully connected to ${config.name} with ${response.tools.length} tools.`);
      } catch (err) {
        console.error(`Failed to connect to MCP Server ${config.name}:`, err);
      }
    }
  }

  getTools(): MCPToolMetadata[] {
    return Array.from(this.tools.values());
  }

  async executeTool(serverName: string, toolName: string, args: Record<string, any>) {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP Client for server '${serverName}' is not connected.`);
    }

    const result = await client.callTool({
      name: toolName,
      arguments: args,
    });

    return result;
  }

  async shutdown() {
    for (const [name, client] of this.clients) {
      try {
        await client.close();
      } catch (err) {
        console.error(`Error closing client ${name}:`, err);
      }
    }
    this.clients.clear();
    this.tools.clear();
  }
}

export const mcpClientManager = new MCPClientManager();

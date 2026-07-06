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

export interface MCPConfigRecord {
  name: string;
  transportType: string;
  connectionString: string;
  envVariables: any;
  isEnabled: boolean;
}

export class MCPClientManager {
  private clients: Map<string, Client> = new Map();
  private tools: Map<string, MCPToolMetadata> = new Map();
  // Track tool count per server for status reporting
  private serverToolCounts: Map<string, number> = new Map();

  // ── Initialize all enabled servers from DB ──────────────────────────────
  async initialize() {
    const configs = await prisma.mCPConfig.findMany({
      where: { isEnabled: true },
    });

    for (const config of configs) {
      try {
        await this.connectSingle(config);
      } catch (err) {
        console.error(`Failed to connect to MCP Server ${config.name}:`, err);
      }
    }
  }

  // ── Connect a single server config ─────────────────────────────────────
  async connectSingle(config: MCPConfigRecord): Promise<void> {
    // Disconnect existing connection for this server if any
    if (this.clients.has(config.name)) {
      await this.disconnectSingle(config.name);
    }

    console.log(`Connecting to MCP Server: ${config.name} (${config.transportType})...`);
    let transport;

    if (config.transportType === 'STDIO') {
      const args = JSON.parse(config.connectionString) as string[];
      const command = args.shift()!;
      transport = new StdioClientTransport({
        command,
        args,
        env: config.envVariables as Record<string, string>,
      });
    } else {
      transport = new SSEClientTransport(new URL(config.connectionString));
    }

    const client = new Client(
      { name: 'make-it-do-host', version: '1.0.0' },
      { capabilities: {} }
    );

    await client.connect(transport);
    this.clients.set(config.name, client);

    const response = await client.listTools();
    let count = 0;
    for (const tool of response.tools) {
      const namespacedName = `${config.name}__${tool.name}`;
      this.tools.set(namespacedName, {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        serverName: config.name,
      });
      count++;
    }
    this.serverToolCounts.set(config.name, count);
    console.log(`Successfully connected to ${config.name} with ${count} tools.`);
  }

  // ── Disconnect a single server by name ─────────────────────────────────
  async disconnectSingle(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    if (client) {
      try { await client.close(); } catch {}
      this.clients.delete(serverName);
    }
    // Remove all tools that belonged to this server
    for (const [key, meta] of this.tools.entries()) {
      if (meta.serverName === serverName) {
        this.tools.delete(key);
      }
    }
    this.serverToolCounts.delete(serverName);
    console.log(`Disconnected MCP server: ${serverName}`);
  }

  // ── Query methods ───────────────────────────────────────────────────────
  getTools(): MCPToolMetadata[] {
    return Array.from(this.tools.values());
  }

  getConnectedServerNames(): string[] {
    return Array.from(this.clients.keys());
  }

  getToolCountForServer(serverName: string): number {
    return this.serverToolCounts.get(serverName) ?? 0;
  }

  async executeTool(serverName: string, toolName: string, args: Record<string, any>) {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP Client for server '${serverName}' is not connected.`);
    }
    return client.callTool({ name: toolName, arguments: args });
  }

  // ── Graceful shutdown ───────────────────────────────────────────────────
  async shutdown() {
    for (const [name] of this.clients) {
      await this.disconnectSingle(name);
    }
  }
}

export const mcpClientManager = new MCPClientManager();

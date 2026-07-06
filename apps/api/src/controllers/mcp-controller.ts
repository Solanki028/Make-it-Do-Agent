import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { mcpClientManager } from '../mcp/client-manager.js';

const createMcpSchema = z.object({
  name: z.string().min(1).max(64),
  transportType: z.enum(['STDIO', 'SSE']),
  connectionString: z.string().min(1),
  envVariables: z.record(z.string()).optional().default({}),
  isEnabled: z.boolean().optional().default(true),
});

const updateMcpSchema = createMcpSchema.partial();

export async function registerMcpRoutes(fastify: FastifyInstance) {

  // GET /api/mcp — list all MCP server configs with live connection status
  fastify.get('/api/mcp', async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const configs = await prisma.mCPConfig.findMany({
        orderBy: { name: 'asc' },
      });

      const connectedNames = mcpClientManager.getConnectedServerNames();

      const result = configs.map((c) => ({
        id: c.id,
        name: c.name,
        transportType: c.transportType,
        connectionString: c.connectionString,
        envVariables: c.envVariables,
        isEnabled: c.isEnabled,
        updatedAt: c.updatedAt.toISOString(),
        isConnected: connectedNames.includes(c.name),
        toolCount: mcpClientManager.getToolCountForServer(c.name),
      }));

      return result;
    } catch (err: any) {
      return reply.status(500).send({ error: 'Failed to list MCP configs', message: err.message });
    }
  });

  // POST /api/mcp — create a new MCP server config
  fastify.post('/api/mcp', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = createMcpSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.format() });
    }

    const { name, transportType, connectionString, envVariables, isEnabled } = parsed.data;

    try {
      const existing = await prisma.mCPConfig.findUnique({ where: { name } });
      if (existing) {
        return reply.status(409).send({ error: `MCP server with name "${name}" already exists.` });
      }

      const config = await prisma.mCPConfig.create({
        data: {
          name,
          transportType,
          connectionString,
          envVariables: envVariables ?? {},
          isEnabled,
        },
      });

      // Attempt live connection immediately if enabled
      if (isEnabled) {
        try {
          await mcpClientManager.connectSingle(config);
        } catch (connErr: any) {
          console.warn(`[MCP] Created config for ${name} but live connection failed:`, connErr.message);
        }
      }

      return reply.status(201).send({
        ...config,
        isConnected: mcpClientManager.getConnectedServerNames().includes(name),
        toolCount: mcpClientManager.getToolCountForServer(name),
      });
    } catch (err: any) {
      return reply.status(500).send({ error: 'Failed to create MCP config', message: err.message });
    }
  });

  // PATCH /api/mcp/:id — update a config (enable/disable, update connection string, etc.)
  fastify.patch('/api/mcp/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const parsed = updateMcpSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.format() });
    }

    try {
      const existing = await prisma.mCPConfig.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: 'MCP config not found' });
      }

      const updated = await prisma.mCPConfig.update({
        where: { id },
        data: parsed.data,
      });

      // If toggling, reconnect or disconnect
      if (parsed.data.isEnabled === true) {
        try { await mcpClientManager.connectSingle(updated); } catch {}
      } else if (parsed.data.isEnabled === false) {
        await mcpClientManager.disconnectSingle(updated.name);
      }

      return {
        ...updated,
        isConnected: mcpClientManager.getConnectedServerNames().includes(updated.name),
        toolCount: mcpClientManager.getToolCountForServer(updated.name),
      };
    } catch (err: any) {
      return reply.status(500).send({ error: 'Failed to update MCP config', message: err.message });
    }
  });

  // DELETE /api/mcp/:id — remove a config and disconnect
  fastify.delete('/api/mcp/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    try {
      const existing = await prisma.mCPConfig.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: 'MCP config not found' });
      }

      await mcpClientManager.disconnectSingle(existing.name);
      await prisma.mCPConfig.delete({ where: { id } });

      return reply.status(204).send();
    } catch (err: any) {
      return reply.status(500).send({ error: 'Failed to delete MCP config', message: err.message });
    }
  });

  // POST /api/mcp/:id/test — test a connection without persisting anything
  fastify.post('/api/mcp/:id/test', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    try {
      const config = await prisma.mCPConfig.findUnique({ where: { id } });
      if (!config) {
        return reply.status(404).send({ error: 'MCP config not found' });
      }

      const isConnected = mcpClientManager.getConnectedServerNames().includes(config.name);
      const toolCount = mcpClientManager.getToolCountForServer(config.name);

      if (isConnected) {
        return { success: true, message: `Connected. ${toolCount} tools available.`, toolCount };
      }

      // Try a live connection
      try {
        await mcpClientManager.connectSingle(config);
        const newCount = mcpClientManager.getToolCountForServer(config.name);
        return { success: true, message: `Connected successfully. ${newCount} tools available.`, toolCount: newCount };
      } catch (connErr: any) {
        return reply.status(422).send({ success: false, message: connErr.message });
      }
    } catch (err: any) {
      return reply.status(500).send({ error: 'Failed to test connection', message: err.message });
    }
  });
}

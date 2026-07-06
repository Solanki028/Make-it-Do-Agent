import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { registerExecutionRoutes } from './controllers/execution-controller.js';
import { registerMcpRoutes } from './controllers/mcp-controller.js';
import { mcpClientManager } from './mcp/client-manager.js';

const fastify = Fastify({ logger: true });

// CORS — allow Next.js dev server and any origin in development
await fastify.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});

// Health check
fastify.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  mcpServers: mcpClientManager.getConnectedServerNames(),
}));

// Route plugins
await fastify.register(registerExecutionRoutes);
await fastify.register(registerMcpRoutes);

const start = async () => {
  try {
    await mcpClientManager.initialize();
    await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(` Make It Do API running on http://0.0.0.0:${env.PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

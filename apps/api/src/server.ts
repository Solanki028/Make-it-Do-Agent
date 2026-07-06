import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env.js';
import { registerExecutionRoutes } from './controllers/execution-controller.js';
import { mcpClientManager } from './mcp/client-manager.js';

const fastify = Fastify({
  logger: true
});

// Register CORS
await fastify.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

// Health check route
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Register execution routes
await fastify.register(registerExecutionRoutes);

const start = async () => {
  try {
    // Connect to all registered MCP servers
    await mcpClientManager.initialize();

    await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

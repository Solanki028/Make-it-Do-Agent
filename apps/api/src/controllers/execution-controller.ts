import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { streamManager } from '../streams/stream-manager.js';
import { graph } from '../agent/graph.js';
import { prisma } from '../db/prisma.js';

const executeSchema = z.object({
  goal: z.string().min(1),
  conversationId: z.string().uuid().optional(),
});

export async function registerExecutionRoutes(fastify: FastifyInstance) {
  fastify.post('/api/execute', async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = executeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.format() });
    }

    const { goal, conversationId } = parsed.data;
    const executionId = randomUUID();

    // 1. Ensure conversation exists
    let activeConversationId = conversationId;
    if (!activeConversationId) {
      let user = await prisma.user.findFirst();
      if (!user) {
        user = await prisma.user.create({
          data: {
            email: 'default@makeitdo.ai',
            passwordHash: 'placeholder_password',
          },
        });
      }

      const conversation = await prisma.conversation.create({
        data: {
          title: goal.substring(0, 40) + '...',
          userId: user.id,
        },
      });
      activeConversationId = conversation.id;
    }

    // 2. Create the task in database
    await prisma.taskGoal.create({
      data: {
        id: executionId,
        conversationId: activeConversationId,
        originalGoal: goal,
        status: 'RUNNING',
      },
    });

    // 3. Create streaming emitter
    streamManager.createStream(executionId);

    // 4. Trigger LangGraph execution asynchronously
    runAgentGraph(executionId, goal).catch((err) => {
      console.error(`Error in background agent execution ${executionId}:`, err);
      prisma.taskGoal.update({
        where: { id: executionId },
        data: { status: 'FAILED', endedAt: new Date() },
      }).catch(console.error);
    });

    return reply.status(202).send({
      message: 'Agent execution started',
      executionId,
      conversationId: activeConversationId,
    });
  });

  fastify.get('/api/execute/stream', async (req: FastifyRequest, reply: FastifyReply) => {
    const { executionId } = req.query as { executionId: string };
    if (!executionId) {
      return reply.status(400).send({ error: 'Missing executionId parameter' });
    }

    streamManager.setupSSE(executionId, reply);
  });
}

// Background agent execution wrapper
async function runAgentGraph(executionId: string, goal: string) {
  await prisma.executionStep.create({
    data: {
      taskGoalId: executionId,
      nodeName: 'init',
      logs: 'Initializing execution context...',
      stepOrder: 0,
    },
  });

  streamManager.sendEvent(executionId, 'plan_created', {
    message: 'Analyzing goal...',
    plan: ['Understand goal', 'Query tools', 'Execute plan', 'Verify result'],
  });

  const initialState = {
    goal,
    plan: ['Understand goal', 'Query tools', 'Execute plan', 'Verify result'],
    currentStepIndex: 0,
    messages: [],
    trace: [
      {
        id: randomUUID(),
        nodeName: 'init',
        timestamp: new Date().toISOString(),
        message: 'Goal received: ' + goal,
      },
    ],
    stepCount: 0,
    maxSteps: 15,
    consecutiveFailures: 0,
    loopHistory: {},
    humanInputRequired: false,
    metrics: { promptTokens: 0, completionTokens: 0, totalCost: 0 },
  };

  streamManager.sendEvent(executionId, 'reasoning_chunk', {
    chunk: 'Planner node started. Initiating search pattern...\n',
  });

  const result = await graph.invoke(initialState);

  await prisma.taskGoal.update({
    where: { id: executionId },
    data: {
      status: result.consecutiveFailures > 3 ? 'FAILED' : 'COMPLETED',
      endedAt: new Date(),
    },
  });

  streamManager.sendEvent(executionId, 'task_completed', {
    status: 'completed',
    result: 'Task finished successfully.',
  });
}

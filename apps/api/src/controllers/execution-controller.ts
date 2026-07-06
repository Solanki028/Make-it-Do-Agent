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

  fastify.get('/api/conversations', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const conversations = await prisma.conversation.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          tasks: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          }
        }
      });
      return conversations;
    } catch (err: any) {
      return reply.status(500).send({ error: 'Failed to fetch conversations', message: err.message });
    }
  });

  fastify.get('/api/executions/:executionId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { executionId } = req.params as { executionId: string };
    try {
      const steps = await prisma.executionStep.findMany({
        where: { taskGoalId: executionId },
        orderBy: { stepOrder: 'asc' },
        include: {
          toolCalls: true,
        }
      });

      const formattedSteps = steps.map(s => {
        return {
          id: s.id,
          nodeName: s.nodeName,
          timestamp: s.timestamp.toISOString(),
          message: s.logs,
          status: 'success' as const,
          toolCalls: s.toolCalls.map(tc => ({
            server: tc.serverName,
            tool: tc.toolName,
            arguments: tc.arguments as Record<string, any>,
            status: tc.status === 'SUCCESS' ? 'success' as const : 'failed' as const,
            output: tc.result,
            error: tc.errorMessage || undefined,
          }))
        };
      });

      return formattedSteps;
    } catch (err: any) {
      return reply.status(500).send({ error: 'Failed to fetch execution history', message: err.message });
    }
  });
}

// Background agent execution wrapper
async function runAgentGraph(executionId: string, goal: string) {
  // 1. Log initial execution step in Database
  await prisma.executionStep.create({
    data: {
      taskGoalId: executionId,
      nodeName: 'init',
      logs: 'Initializing execution context...',
      stepOrder: 0,
    },
  });

  const initialState = {
    goal,
    plan: [],
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

  try {
    // 2. Execute LangGraph in Streaming mode
    const stream = await graph.stream(initialState, {
      streamMode: 'updates',
    });

    let stepOrder = 1;

    for await (const chunk of stream) {
      // Extract active node changes
      const nodeName = Object.keys(chunk)[0];
      const updates = chunk[nodeName];

      console.log(`[Stream Event] Completed node: ${nodeName}`);

      // 3. Persist step logs in Database
      let logsContent = `Node ${nodeName} execution finished.`;
      if (updates.trace && updates.trace.length > 0) {
        logsContent = updates.trace[updates.trace.length - 1].message;
      }

      const dbStep = await prisma.executionStep.create({
        data: {
          taskGoalId: executionId,
          nodeName: nodeName,
          logs: logsContent,
          stepOrder: stepOrder++,
        },
      });

      // 4. Log tool calls and dispatch client streams
      if (updates.trace && updates.trace.length > 0) {
        const latestTrace = updates.trace[updates.trace.length - 1];
        if (latestTrace.toolCalls && latestTrace.toolCalls.length > 0) {
          for (const tc of latestTrace.toolCalls) {
            await prisma.toolCall.create({
              data: {
                executionStepId: dbStep.id,
                serverName: tc.server,
                toolName: tc.tool,
                arguments: tc.arguments,
                result: tc.output ? tc.output : null,
                status: tc.status === 'success' ? 'SUCCESS' : 'FAILED',
                errorMessage: tc.error || null,
                durationMs: 0,
              },
            });

            streamManager.sendEvent(executionId, 'tool_start', {
              serverName: tc.server,
              toolName: tc.tool,
              args: tc.arguments,
            });

            streamManager.sendEvent(executionId, 'tool_end', {
              status: tc.status,
              result: tc.output,
              error: tc.error,
            });
          }
        }
      }

      // 5. Stream plan and reasoning events
      if (nodeName === 'planner') {
        if (updates.plan) {
          streamManager.sendEvent(executionId, 'plan_created', {
            message: 'Planner updated the roadmap.',
            plan: updates.plan,
          });
        }
        if (updates.trace && updates.trace.length > 0) {
          const reasoning = updates.trace[updates.trace.length - 1].message;
          streamManager.sendEvent(executionId, 'reasoning_chunk', {
            chunk: reasoning + '\n',
          });
        }
      } else {
        streamManager.sendEvent(executionId, 'reasoning_chunk', {
          chunk: `Finished node: ${nodeName}. ${logsContent}\n`,
        });
      }
    }

    // 6. Mark goal complete
    await prisma.taskGoal.update({
      where: { id: executionId },
      data: {
        status: 'COMPLETED',
        endedAt: new Date(),
      },
    });

    streamManager.sendEvent(executionId, 'task_completed', {
      status: 'completed',
      result: 'Goal completed successfully.',
    });

  } catch (err: any) {
    console.error('Error during streaming graph execution:', err);
    await prisma.taskGoal.update({
      where: { id: executionId },
      data: {
        status: 'FAILED',
        endedAt: new Date(),
      },
    });

    streamManager.sendEvent(executionId, 'error', {
      message: err.message || 'An error occurred during agent execution.',
    });
  }
}

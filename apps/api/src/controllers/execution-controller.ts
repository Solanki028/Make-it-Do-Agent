import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { streamManager } from '../streams/stream-manager.js';
import { graph } from '../agent/graph.js';
import { prisma } from '../db/prisma.js';
import { approvalStore } from '../agent/approval-store.js';

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

  // POST /api/execute/:id/approve — resume or cancel a human-gated run
  fastify.post('/api/execute/:id/approve', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id: executionId } = req.params as { id: string };
    const { approved } = req.body as { approved: boolean };

    const pending = approvalStore.get(executionId);
    if (!pending) {
      return reply.status(404).send({ error: 'No pending approval found for this execution.' });
    }

    approvalStore.delete(executionId);

    if (!approved) {
      // User denied — cancel the run
      await prisma.taskGoal.update({
        where: { id: executionId },
        data: { status: 'FAILED', endedAt: new Date() },
      }).catch(console.error);

      streamManager.sendEvent(executionId, 'task_completed', {
        status: 'cancelled',
        result: '❌ Action denied by user. Agent run cancelled.',
      });

      return reply.send({ message: 'Run cancelled.' });
    }

    // User approved — promote pendingApprovalToolCall → nextToolCall and re-run graph
    const resumeState = {
      ...pending.state,
      humanInputRequired: false,
      nextToolCall: pending.state.pendingApprovalToolCall,
      pendingApprovalToolCall: undefined,
      approvalReason: undefined,
    };

    streamManager.sendEvent(executionId, 'reasoning_chunk', {
      chunk: '✅ Action approved by user — resuming execution...\n',
    });

    // Re-run graph from resumed state in background
    runAgentGraph(executionId, pending.goal, resumeState).catch((err) => {
      console.error(`[Approve] Error resuming graph for ${executionId}:`, err);
    });

    return reply.send({ message: 'Approved — resuming agent execution.' });
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
// resumeState: provided when re-starting after human approval
async function runAgentGraph(executionId: string, goal: string, resumeState?: any) {
  // 1. Log initial execution step in Database (skipped on resume)
  if (!resumeState) {
    await prisma.executionStep.create({
      data: {
        taskGoalId: executionId,
        nodeName: 'init',
        logs: 'Initializing execution context...',
        stepOrder: 0,
      },
    });
  }

  const initialState = resumeState ?? {
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

      // ── 5a. Handle human gate — pause for approval ──────────────────────
      if (nodeName === 'human_gate') {
        // Capture the full accumulated state by reading the last known state
        // We use the initialState + updates to reconstruct what the agent planned
        const pendingCall = updates.pendingApprovalToolCall
          ?? (initialState as any).pendingApprovalToolCall;
        const reason = updates.approvalReason
          ?? (initialState as any).approvalReason
          ?? 'The agent wants to perform a potentially destructive action.';

        // Save accumulated state snapshot (with pending tool call) to approval store
        const snapshotState = {
          ...(initialState as any),
          pendingApprovalToolCall: pendingCall,
          approvalReason: reason,
          humanInputRequired: true,
          nextToolCall: undefined,
        };
        approvalStore.save(executionId, snapshotState, goal);

        // Emit human_approval_required SSE event to frontend
        streamManager.sendEvent(executionId, 'human_approval_required', {
          executionId,
          tool: pendingCall?.tool,
          server: pendingCall?.server,
          arguments: pendingCall?.arguments,
          reason,
        });

        // Set trigger flag so the completion block knows not to mark as completed
        if (!(runAgentGraph as any).__humanGateTriggered__) {
          (runAgentGraph as any).__humanGateTriggered__ = {};
        }
        (runAgentGraph as any).__humanGateTriggered__[executionId] = true;

        console.log(`[Controller] Human gate triggered for ${executionId} — pausing.`);
        break; // Stop consuming the stream — graph already routed to END
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
      } else if (nodeName === 'response_generator') {
        streamManager.sendEvent(executionId, 'final_response', {
          response: updates.finalResponse || logsContent,
        });
      } else {
        streamManager.sendEvent(executionId, 'reasoning_chunk', {
          chunk: `Finished node: ${nodeName}. ${logsContent}\n`,
        });
      }
    }

    // 6. Check if graph paused for human approval
    const graphState = await graph.getState({ configurable: { thread_id: executionId } }).catch(() => null);
    const lastTrace = (initialState as any).trace ?? [];
    const humanRequired = initialState.humanInputRequired
      || lastTrace.some((t: any) => t.details?.humanInputRequired === true);

    // Detect humanInputRequired from stream output by checking the last streamed chunk
    // We track this via a flag set during streaming below
    if ((runAgentGraph as any).__humanGateTriggered__?.[executionId]) {
      delete (runAgentGraph as any).__humanGateTriggered__[executionId];
      // SSE and approvalStore already handled in streaming loop — just return
      return;
    }

    // 7. Mark goal complete
    await prisma.taskGoal.update({
      where: { id: executionId },
      data: {
        status: 'COMPLETED',
        endedAt: new Date(),
      },
    });

    const finalState = graphState?.values as any;
    const finalResult = finalState?.finalResponse || 'Goal completed successfully.';

    streamManager.sendEvent(executionId, 'task_completed', {
      status: 'completed',
      result: finalResult,
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

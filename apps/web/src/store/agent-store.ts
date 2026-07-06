import { create } from 'zustand';

export interface TraceStep {
  id: string;
  nodeName: string;
  timestamp: string;
  message: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  details?: Record<string, any>;
  reasoning?: string;
  toolCalls?: {
    server: string;
    tool: string;
    arguments: Record<string, any>;
    status: 'pending' | 'success' | 'failed';
    output?: any;
    error?: string;
  }[];
}

interface PendingApproval {
  executionId: string;
  tool: string;
  server: string;
  arguments: Record<string, any>;
  reason: string;
}

interface AgentStore {
  conversationId: string | null;
  executionId: string | null;
  activeGoal: string | null;
  plan: string[];
  currentStepIndex: number;
  steps: TraceStep[];
  isStreaming: boolean;
  error: string | null;
  eventSource: EventSource | null;
  conversations: any[];
  pendingApproval: PendingApproval | null;

  setConversationId: (id: string | null) => void;
  setExecutionId: (id: string | null) => void;
  setActiveGoal: (goal: string | null) => void;
  startExecution: (goal: string) => Promise<void>;
  stopExecution: () => void;
  reset: () => void;
  loadConversations: () => Promise<void>;
  loadExecutionHistory: (executionId: string, goalText: string) => Promise<void>;
  approveAction: (approved: boolean) => Promise<void>;
}

const API_BASE_URL = 'http://localhost:4000';

export const useAgentStore = create<AgentStore>((set, get) => ({
  conversationId: null,
  executionId: null,
  activeGoal: null,
  plan: [],
  currentStepIndex: 0,
  steps: [],
  isStreaming: false,
  error: null,
  eventSource: null,
  conversations: [],
  pendingApproval: null,

  setConversationId: (id) => set({ conversationId: id }),
  setExecutionId: (id) => set({ executionId: id }),
  setActiveGoal: (goal) => set({ activeGoal: goal }),

  startExecution: async (goal) => {
    get().stopExecution();

    set({
      activeGoal: goal,
      isStreaming: true,
      error: null,
      plan: [],
      currentStepIndex: 0,
      steps: [
        {
          id: 'init',
          nodeName: 'init',
          timestamp: new Date().toISOString(),
          message: 'Sending goal to server...',
          status: 'running',
        },
      ],
    });

    try {
      const response = await fetch(`${API_BASE_URL}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal,
          conversationId: get().conversationId || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      const { executionId, conversationId } = data;

      set({ executionId, conversationId });
      get().loadConversations(); // Update list

      set((state) => ({
        steps: state.steps.map((s) =>
          s.id === 'init' ? { ...s, message: 'Execution initiated. Streaming trace...', status: 'success' } : s
        ),
      }));

      const es = new EventSource(`${API_BASE_URL}/api/execute/stream?executionId=${executionId}`);
      set({ eventSource: es });

      es.addEventListener('plan_created', (e: MessageEvent) => {
        const payload = JSON.parse(e.data);
        set({
          plan: payload.plan || [],
          steps: [
            ...get().steps,
            {
              id: 'plan-' + Date.now(),
              nodeName: 'planner',
              timestamp: new Date().toISOString(),
              message: 'Plan established: ' + (payload.plan || []).join(' → '),
              status: 'success',
            },
          ],
        });
      });

      es.addEventListener('reasoning_chunk', (e: MessageEvent) => {
        const payload = JSON.parse(e.data);
        set((state) => {
          const steps = [...state.steps];
          const lastStep = steps[steps.length - 1];

          if (lastStep && lastStep.nodeName === 'reasoning') {
            lastStep.reasoning = (lastStep.reasoning || '') + payload.chunk;
          } else {
            steps.push({
              id: 'reasoning-' + Date.now(),
              nodeName: 'reasoning',
              timestamp: new Date().toISOString(),
              message: 'Analyzing step and planning tool parameters...',
              status: 'running',
              reasoning: payload.chunk,
            });
          }
          return { steps };
        });
      });

      es.addEventListener('tool_start', (e: MessageEvent) => {
        const payload = JSON.parse(e.data);
        set((state) => {
          const steps = state.steps.map((s) =>
            s.nodeName === 'reasoning' && s.status === 'running' ? { ...s, status: 'success' as const } : s
          );
          steps.push({
            id: 'tool-' + Date.now(),
            nodeName: 'executor',
            timestamp: new Date().toISOString(),
            message: `Invoking tool ${payload.toolName} on server ${payload.serverName}`,
            status: 'running',
            toolCalls: [
              {
                server: payload.serverName,
                tool: payload.toolName,
                arguments: payload.args,
                status: 'pending',
              },
            ],
          });
          return { steps };
        });
      });

      es.addEventListener('tool_end', (e: MessageEvent) => {
        const payload = JSON.parse(e.data);
        set((state) => ({
          steps: state.steps.map((s) => {
            if (s.nodeName === 'executor' && s.status === 'running') {
              return {
                ...s,
                status: payload.status === 'success' ? 'success' as const : 'failed' as const,
                message: payload.status === 'success' ? 'Tool execution completed' : 'Tool execution failed',
                toolCalls: s.toolCalls?.map((tc) => ({
                  ...tc,
                  status: payload.status === 'success' ? 'success' as const : 'failed' as const,
                  output: payload.result,
                  error: payload.error,
                })),
              };
            }
            return s;
          }),
        }));
      });

      es.addEventListener('human_approval_required', (e: MessageEvent) => {
        const payload = JSON.parse(e.data);
        // Pause streaming UI — keep SSE open so we can resume after approval
        set({
          isStreaming: false,
          pendingApproval: {
            executionId: payload.executionId,
            tool: payload.tool,
            server: payload.server,
            arguments: payload.arguments ?? {},
            reason: payload.reason,
          },
          steps: [
            ...get().steps,
            {
              id: 'approval-' + Date.now(),
              nodeName: 'planner',
              timestamp: new Date().toISOString(),
              message: `⏸️ Paused: Waiting for approval to run ${payload.server}/${payload.tool}`,
              status: 'running' as const,
            },
          ],
        });
      });

      es.addEventListener('task_completed', (e: MessageEvent) => {
        const payload = JSON.parse(e.data);
        set((state) => ({
          isStreaming: false,
          pendingApproval: null,
          steps: [
            ...state.steps.map((s) => (s.status === 'running' ? { ...s, status: 'success' as const } : s)),
            {
              id: 'complete',
              nodeName: 'evaluator',
              timestamp: new Date().toISOString(),
              message: payload.result || 'Task completed successfully!',
              status: 'success',
            },
          ],
        }));
        es.close();
      });

      es.addEventListener('error', (e) => {
        console.error('SSE Error:', e);
        if (get().isStreaming || get().pendingApproval) {
          set({
            error: 'Streaming connection interrupted or error from server.',
            isStreaming: false,
            pendingApproval: null,
          });
        }
        es.close();
      });
    } catch (err: any) {
      set({
        error: err.message || 'Failed to start task execution.',
        isStreaming: false,
        steps: [
          ...get().steps,
          {
            id: 'error',
            nodeName: 'init',
            timestamp: new Date().toISOString(),
            message: 'Failed to initialize execution: ' + err.message,
            status: 'failed',
          },
        ],
      });
    }
  },

  stopExecution: () => {
    const { eventSource } = get();
    if (eventSource) {
      eventSource.close();
    }
    set({ isStreaming: false, eventSource: null, pendingApproval: null });
  },

  approveAction: async (approved: boolean) => {
    const { pendingApproval, executionId } = get();
    if (!pendingApproval || !executionId) return;

    // Clear the card immediately for snappy UX
    set({ pendingApproval: null, isStreaming: true });

    try {
      const res = await fetch(`${API_BASE_URL}/api/execute/${executionId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Approval request failed');
      }

      if (!approved) {
        set({ isStreaming: false });
      }
      // If approved: SSE stream is still open — it will receive reasoning_chunk and task_completed
    } catch (err: any) {
      set({ error: err.message, isStreaming: false });
    }
  },

  reset: () => {
    get().stopExecution();
    set({
      executionId: null,
      activeGoal: null,
      plan: [],
      currentStepIndex: 0,
      steps: [],
      isStreaming: false,
      error: null,
    });
  },

  loadConversations: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/conversations`);
      if (response.ok) {
        const data = await response.json();
        set({ conversations: data });
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  },

  loadExecutionHistory: async (executionId, goalText) => {
    get().stopExecution();
    set({
      executionId,
      activeGoal: goalText,
      isStreaming: false,
      error: null,
      plan: [],
      steps: [
        {
          id: 'loading',
          nodeName: 'history',
          timestamp: new Date().toISOString(),
          message: 'Loading historical trace steps...',
          status: 'running',
        },
      ],
    });

    try {
      const response = await fetch(`${API_BASE_URL}/api/executions/${executionId}`);
      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }
      const data = await response.json();
      set({
        steps: data,
        plan: data.find((s: any) => s.nodeName === 'planner')?.message?.split(' Plan established: ')[1]?.split(' → ') || [],
      });
    } catch (err: any) {
      set({
        error: err.message || 'Failed to load execution history.',
        steps: [
          {
            id: 'error',
            nodeName: 'history',
            timestamp: new Date().toISOString(),
            message: 'Failed to load trace: ' + err.message,
            status: 'failed',
          },
        ],
      });
    }
  },
}));

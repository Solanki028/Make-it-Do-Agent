import { BaseMessage } from '@langchain/core/messages';

export interface ExecutionStep {
  id: string;
  nodeName: string;
  timestamp: string;
  message: string;
  details?: Record<string, any>;
  toolCalls?: {
    server: string;
    tool: string;
    arguments: Record<string, any>;
    status: 'pending' | 'success' | 'failed';
    output?: any;
    error?: string;
  }[];
}

export interface AgentState {
  goal: string;
  plan: string[];
  currentStepIndex: number;
  messages: BaseMessage[];
  nextToolCall?: {
    id: string;
    server: string;
    tool: string;
    arguments: Record<string, any>;
  };
  trace: ExecutionStep[];
  stepCount: number;
  maxSteps: number;
  consecutiveFailures: number;
  loopHistory: Record<string, number>;
  humanInputRequired: boolean;
  humanResponse?: string;
  // Set by planner when a risky action needs user confirmation before execution
  pendingApprovalToolCall?: {
    id: string;
    server: string;
    tool: string;
    arguments: Record<string, any>;
  };
  approvalReason?: string; // Why approval is being requested
  goalStatus?: 'COMPLETED_SUCCESS' | 'COMPLETED_NO_RESULTS' | 'FAILED' | 'ABORTED' | 'CANCELLED';
  metrics: {
    promptTokens: number;
    completionTokens: number;
    totalCost: number;
  };
}

export const agentStateChannels = {
  goal: {
    value: (x: string, y: string) => y ?? x,
    default: () => '',
  },
  plan: {
    value: (x: string[], y: string[]) => y ?? x,
    default: () => [] as string[],
  },
  currentStepIndex: {
    value: (x: number, y: number) => y ?? x,
    default: () => 0,
  },
  messages: {
    value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
    default: () => [] as BaseMessage[],
  },
  nextToolCall: {
    value: (x: any, y: any) => y === null ? undefined : (y ?? x),
    default: () => undefined,
  },
  trace: {
    value: (x: ExecutionStep[], y: ExecutionStep[]) => x.concat(y),
    default: () => [] as ExecutionStep[],
  },
  stepCount: {
    value: (x: number, y: number) => y ?? x,
    default: () => 0,
  },
  maxSteps: {
    value: (x: number, y: number) => y ?? x,
    default: () => 15,
  },
  consecutiveFailures: {
    value: (x: number, y: number) => y ?? x,
    default: () => 0,
  },
  loopHistory: {
    value: (x: Record<string, number>, y: Record<string, number>) => ({ ...x, ...y }),
    default: () => ({} as Record<string, number>),
  },
  humanInputRequired: {
    value: (x: boolean, y: boolean) => y ?? x,
    default: () => false,
  },
  humanResponse: {
    value: (x: string | undefined, y: string | undefined) => y ?? x,
    default: () => undefined,
  },
  pendingApprovalToolCall: {
    value: (x: any, y: any) => y ?? x,
    default: () => undefined,
  },
  approvalReason: {
    value: (x: string | undefined, y: string | undefined) => y ?? x,
    default: () => undefined,
  },
  goalStatus: {
    value: (x: any, y: any) => y ?? x,
    default: () => undefined,
  },
  metrics: {
    value: (x: any, y: any) => ({ ...x, ...y }),
    default: () => ({ promptTokens: 0, completionTokens: 0, totalCost: 0 }),
  },
};

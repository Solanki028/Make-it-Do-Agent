/**
 * Pending Approval Store
 *
 * When the planner detects a destructive tool call, it pauses the graph
 * by emitting humanInputRequired=true. The execution controller saves the
 * full agent state here, keyed by executionId. The /approve endpoint
 * retrieves the state, applies the user's decision, and re-runs the graph.
 */

import { AgentState } from '../agent/state.js';

interface PendingApproval {
  state: AgentState;
  goal: string;
  savedAt: Date;
}

class ApprovalStore {
  private store = new Map<string, PendingApproval>();

  save(executionId: string, state: AgentState, goal: string) {
    this.store.set(executionId, { state, goal, savedAt: new Date() });
    console.log(`[ApprovalStore] Saved pending approval for execution: ${executionId}`);
  }

  get(executionId: string): PendingApproval | undefined {
    return this.store.get(executionId);
  }

  delete(executionId: string) {
    this.store.delete(executionId);
  }

  has(executionId: string): boolean {
    return this.store.has(executionId);
  }
}

export const approvalStore = new ApprovalStore();

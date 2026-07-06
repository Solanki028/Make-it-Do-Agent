'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';
import { useAgentStore } from '@/store/agent-store';

// ─── Components ───────────────────────────────────────────────────────────────
import { Sidebar }       from '@/components/agent/Sidebar';
import { StatusHeader }  from '@/components/agent/StatusHeader';
import { TraceCard }     from '@/components/agent/TraceCard';
import { PlanProgressBar } from '@/components/agent/PlanProgressBar';
import { ApprovalCard }  from '@/components/agent/ApprovalCard';
import { TypingIndicator } from '@/components/agent/shared';
import {
  SuccessBanner,
  ErrorBanner,
  ActiveGoalCard,
  EmptyState,
  GoalInput,
} from '@/components/agent/GoalPane';

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [goalInput, setGoalInput]     = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [runDuration, setRunDuration] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const traceEndRef  = useRef<HTMLDivElement>(null);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const {
    startExecution, stopExecution, reset,
    isStreaming, plan, steps, error, activeGoal,
    executionId, currentStepIndex,
    conversations, loadConversations, loadExecutionHistory,
    pendingApproval, approveAction,
  } = useAgentStore();

  // Load history on mount
  useEffect(() => { loadConversations(); }, []);

  // Auto-scroll trace to bottom
  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps.length]);

  // Run duration timer + success flash
  useEffect(() => {
    if (isStreaming) {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setRunDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (steps.some((s) => s.nodeName === 'evaluator' && s.status === 'success')) {
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
      }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isStreaming]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const goal = goalInput.trim();
    if (!goal || isStreaming) return;
    setGoalInput('');
    setRunDuration(0);
    setShowSuccess(false);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    await startExecution(goal);
  };

  // Compute token metrics from step details
  const totalTokens = steps.reduce((acc, s) => {
    const t = s.details?.tokens;
    return acc + (t?.promptTokens ?? 0) + (t?.completionTokens ?? 0);
  }, 0);
  const totalCost = steps.reduce((acc, s) => acc + (s.details?.tokens?.runCost ?? 0), 0);
  const activeMcpCount = 1; // Could be fetched dynamically

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-base)]">

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewGoal={reset}
        executionId={executionId}
        conversations={conversations}
        onSelectHistory={loadExecutionHistory}
      />

      {/* Main area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Sticky header bar */}
        <StatusHeader
          activeMcpCount={activeMcpCount}
          isStreaming={isStreaming}
          runDuration={runDuration}
          totalTokens={totalTokens}
          totalCost={totalCost}
          steps={steps}
          activeGoal={activeGoal}
          onOpenSidebar={() => setSidebarOpen(true)}
          onStop={stopExecution}
        />

        {/* ── Two-pane workspace ──────────────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden">

          {/* ── Left pane: Status + Input ─────────────────────────────── */}
          <div className="flex-1 flex flex-col min-w-0 border-r border-[var(--border-subtle)] overflow-y-auto">

            {/* Success flash + summary card */}
            {showSuccess && <SuccessBanner steps={steps} />}

            {/* Human-in-the-loop approval card */}
            {pendingApproval && (
              <ApprovalCard
                pendingApproval={pendingApproval}
                onApprove={approveAction}
              />
            )}

            {/* Error banner */}
            {error && (
              <ErrorBanner
                error={error}
                onRetry={() => activeGoal && startExecution(activeGoal)}
              />
            )}

            {/* Active goal or empty state */}
            {activeGoal ? (
              <ActiveGoalCard
                goal={activeGoal}
                executionId={executionId}
                isStreaming={isStreaming}
              />
            ) : (
              <EmptyState onChipClick={(p) => { setGoalInput(p); textareaRef.current?.focus(); }} />
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Goal input */}
            <GoalInput
              value={goalInput}
              onChange={setGoalInput}
              onSubmit={handleSubmit}
              isStreaming={isStreaming}
              activeGoal={activeGoal}
              textareaRef={textareaRef}
            />
          </div>

          {/* ── Right pane: Execution Trace ───────────────────────────── */}
          <div className="hidden md:flex flex-col w-[420px] shrink-0 bg-[var(--bg-surface)]/40 overflow-hidden">
            {/* Pane header */}
            <div className="shrink-0 flex items-center gap-2.5 px-5 py-3.5 border-b border-[var(--border-subtle)]">
              <Terminal className="h-4 w-4 text-indigo-400" />
              <span className="text-sm font-semibold text-zinc-200">Execution Trace</span>
              {isStreaming && (
                <div className="ml-auto flex gap-1">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              )}
              {!isStreaming && steps.length > 0 && (
                <span className="ml-auto text-[10px] text-zinc-600 font-mono">
                  {steps.length} steps
                </span>
              )}
            </div>

            {/* Scrollable trace */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {/* Plan progress */}
              {plan.length > 0 && (
                <div className="mb-4">
                  <PlanProgressBar plan={plan} currentIndex={currentStepIndex} />
                </div>
              )}

              {/* Empty trace state */}
              {steps.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center py-16 space-y-3">
                  <div className="h-12 w-12 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] flex items-center justify-center">
                    <Terminal className="h-5 w-5 text-zinc-600" />
                  </div>
                  <p className="text-sm text-zinc-600">Trace appears here when a goal is running</p>
                </div>
              )}

              {/* Steps timeline */}
              {steps.map((step, i) => (
                <TraceCard key={step.id} step={step} index={i} />
              ))}

              {/* Live typing indicator */}
              {isStreaming && steps.length > 0 && (
                <div className="pl-[52px] animate-fade-in">
                  <div className="glass rounded-xl px-4 py-2 inline-flex">
                    <TypingIndicator />
                  </div>
                </div>
              )}

              <div ref={traceEndRef} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

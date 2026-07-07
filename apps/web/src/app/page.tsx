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

        {/* ── Unified Single-Pane Workspace ───────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden relative">

          {/* Central conversation scroll view */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <div className="max-w-3xl mx-auto w-full px-4 py-6 flex flex-col gap-5 min-h-full">
              
              {/* Success flash banner & run summary */}
              {showSuccess && <SuccessBanner steps={steps} />}

              {/* Human-in-the-loop approval request */}
              {pendingApproval && (
                <ApprovalCard
                  pendingApproval={pendingApproval}
                  onApprove={approveAction}
                />
              )}

              {/* Execution Error Banner */}
              {error && (
                <ErrorBanner
                  error={error}
                  onRetry={() => activeGoal && startExecution(activeGoal)}
                />
              )}

              {/* Goal presentation card or idle empty state */}
              {activeGoal ? (
                <>
                  {/* Top Header Active Goal Card */}
                  <ActiveGoalCard
                    goal={activeGoal}
                    executionId={executionId}
                    isStreaming={isStreaming}
                  />

                  {/* Plan Roadmapping Stepper */}
                  {plan.length > 0 && (
                    <div className="animate-fade-in mt-1">
                      <PlanProgressBar plan={plan} currentIndex={currentStepIndex} />
                    </div>
                  )}

                  {/* Inline Execution Trace Steps */}
                  {steps.length > 0 && (
                    <div className="space-y-4 mt-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 pl-1">
                        Execution History
                      </p>
                      {steps.map((step, i) => (
                        <TraceCard key={step.id} step={step} index={i} />
                      ))}
                    </div>
                  )}

                  {/* Live typing indicator */}
                  {isStreaming && (
                    <div className="pl-[52px] animate-fade-in mt-1">
                      <div className="glass rounded-xl px-4 py-2 inline-flex">
                        <TypingIndicator />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <EmptyState onChipClick={(p) => { setGoalInput(p); textareaRef.current?.focus(); }} />
              )}

              {/* Scroll anchor */}
              <div ref={traceEndRef} className="h-4" />
            </div>
          </div>

          {/* Bottom input area */}
          <div className="shrink-0">
            <GoalInput
              value={goalInput}
              onChange={setGoalInput}
              onSubmit={handleSubmit}
              isStreaming={isStreaming}
              activeGoal={activeGoal}
              textareaRef={textareaRef}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

'use client';

import React from 'react';
import { CheckCircle2, FileText, AlertCircle, RefreshCw, Sparkles, ArrowRight, Play, Loader2 } from 'lucide-react';
import { TraceStep } from '@/store/agent-store';
import { EXAMPLE_PROMPTS } from './shared';

// ─── Success + Run Summary Card ───────────────────────────────────────────────
interface SuccessBannerProps {
  steps: TraceStep[];
}

export function SuccessBanner({ steps }: SuccessBannerProps) {
  const evalStep = [...steps].reverse().find((s) => s.nodeName === 'evaluator' && s.details?.goalAchieved);
  const summary  = evalStep?.details?.summary as string | undefined;

  return (
    <div className="m-4 mb-0 space-y-3">
      <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 animate-success-pop">
        <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-emerald-300">Goal Achieved!</p>
          <p className="text-xs text-emerald-400/70">The agent completed your goal successfully.</p>
        </div>
      </div>
      {summary && (
        <div className="p-4 rounded-xl glass border-indigo-500/20 animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-3.5 w-3.5 text-indigo-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Run Summary</span>
          </div>
          <p className="text-sm text-zinc-200 leading-relaxed">{summary}</p>
        </div>
      )}
    </div>
  );
}

// ─── Error Banner ─────────────────────────────────────────────────────────────
interface ErrorBannerProps {
  error: string;
  onRetry: () => void;
}

export function ErrorBanner({ error, onRetry }: ErrorBannerProps) {
  return (
    <div className="m-4 mb-0 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3 animate-fade-in">
      <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-rose-300">Execution Error</p>
        <p className="text-xs text-rose-400/70 mt-1 break-words">{error}</p>
        <button
          onClick={onRetry}
          className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-rose-300 hover:text-rose-200 transition-colors"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      </div>
    </div>
  );
}

// ─── Active Goal Card ─────────────────────────────────────────────────────────
interface ActiveGoalCardProps {
  goal: string;
  executionId: string | null;
  isStreaming: boolean;
}

export function ActiveGoalCard({ goal, executionId, isStreaming }: ActiveGoalCardProps) {
  return (
    <div className="m-4 mb-0 p-4 rounded-xl bg-indigo-500/[0.07] border border-indigo-500/20 animate-fade-in">
      <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-widest mb-2">
        <Sparkles className="h-3.5 w-3.5" /> Active Goal
        {isStreaming && (
          <div className="ml-auto flex gap-1">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        )}
      </div>
      <p className="text-zinc-100 text-sm leading-relaxed">{goal}</p>
      {executionId && (
        <p className="text-[10px] text-zinc-600 font-mono mt-2">RUN · {executionId}</p>
      )}
    </div>
  );
}

// ─── Empty / Idle State ───────────────────────────────────────────────────────
interface EmptyStateProps {
  onChipClick: (prompt: string) => void;
}

export function EmptyState({ onChipClick }: EmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-16 space-y-5">
      <div className="relative">
        <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 flex items-center justify-center animate-glow-pulse">
          <Sparkles className="h-9 w-9 text-indigo-400" />
        </div>
      </div>
      <div>
        <h2 className="text-xl font-bold text-zinc-100">Ready to execute</h2>
        <p className="text-sm text-zinc-500 max-w-xs mt-2 leading-relaxed">
          Describe any goal. The agent will plan, use tools, self-correct, and get it done.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 justify-center max-w-sm">
        {EXAMPLE_PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => onChipClick(p)}
            className="px-3 py-1.5 rounded-full border border-[var(--border-default)] text-xs text-zinc-400 hover:text-zinc-100 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Goal Input Form ──────────────────────────────────────────────────────────
interface GoalInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isStreaming: boolean;
  activeGoal: string | null;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}

export function GoalInput({ value, onChange, onSubmit, isStreaming, activeGoal, textareaRef }: GoalInputProps) {
  const handleChipClick = (p: string) => {
    onChange(p);
    textareaRef.current?.focus();
  };

  return (
    <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 backdrop-blur-sm">
      {/* Quick prompt chips */}
      {activeGoal && !isStreaming && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {EXAMPLE_PROMPTS.slice(0, 2).map((p) => (
            <button
              key={p}
              onClick={() => handleChipClick(p)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-[var(--border-subtle)] text-[10px] text-zinc-500 hover:text-zinc-200 hover:border-[var(--border-default)] transition-all"
            >
              <ArrowRight className="h-2.5 w-2.5" />{p}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={onSubmit} className="relative">
        <div className={`relative flex items-end gap-3 rounded-2xl border bg-[var(--bg-elevated)] transition-all duration-200 ${
          value.trim() ? 'border-indigo-500/40 shadow-lg shadow-indigo-500/5' : 'border-[var(--border-default)]'
        }`}>
          <textarea
            ref={textareaRef}
            placeholder="Describe what you want the agent to do..."
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSubmit(e as any);
              }
            }}
            disabled={isStreaming}
            rows={1}
            className="auto-textarea flex-1 px-4 py-3.5 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none disabled:opacity-50 focus-ring rounded-2xl"
          />
          <div className="flex items-center gap-2 px-3 pb-3">
            {value.length > 0 && (
              <span className="text-[10px] text-zinc-600 font-mono">{value.length}</span>
            )}
            <button
              type="submit"
              disabled={isStreaming || !value.trim()}
              className="h-9 w-9 flex items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-40 disabled:bg-zinc-700 disabled:shadow-none active:scale-95"
            >
              {isStreaming
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Play className="h-4 w-4 fill-current" />
              }
            </button>
          </div>
        </div>
        <p className="text-[10px] text-zinc-600 mt-1.5 ml-1">
          Press Enter to run · Shift+Enter for new line
        </p>
      </form>
    </div>
  );
}

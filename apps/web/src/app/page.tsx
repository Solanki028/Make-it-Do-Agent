'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useAgentStore, TraceStep } from '@/store/agent-store';
import {
  Play, Sparkles, Server, CheckCircle2, XCircle, Loader2,
  History, Cpu, ChevronDown, ChevronUp, AlertCircle, RefreshCw,
  Square, Zap, Brain, RotateCcw, Menu, X, Clock, Coins,
  ArrowRight, Terminal, ShieldCheck, TrendingUp, Settings, Download, FileText,
} from 'lucide-react';

// ─── Node metadata ────────────────────────────────────────────────────────────
const NODE_META: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  planner:  { label: 'Planner',   icon: <Brain className="h-4 w-4" />,        color: 'text-indigo-400',  bg: 'bg-indigo-500/10 border-indigo-500/20' },
  executor: { label: 'Executor',  icon: <Terminal className="h-4 w-4" />,      color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20' },
  evaluator:{ label: 'Evaluator', icon: <ShieldCheck className="h-4 w-4" />,   color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  recovery: { label: 'Recovery',  icon: <RotateCcw className="h-4 w-4" />,     color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/20' },
  reasoning:{ label: 'Reasoning', icon: <Zap className="h-4 w-4" />,           color: 'text-purple-400',  bg: 'bg-purple-500/10 border-purple-500/20' },
  init:     { label: 'Init',      icon: <Play className="h-4 w-4" />,          color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20' },
  history:  { label: 'History',   icon: <History className="h-4 w-4" />,       color: 'text-zinc-400',    bg: 'bg-zinc-500/10 border-zinc-500/20' },
};

const EXAMPLE_PROMPTS = [
  'List all files in the current directory',
  'Read the package.json and summarize the project',
  'Find all TypeScript files in the src folder',
  'Check what MCP tools are available and list them',
];

// ─── Export run as markdown ───────────────────────────────────────────────────
function exportToMarkdown(
  goal: string,
  steps: TraceStep[],
  summary?: string
) {
  const lines: string[] = [
    `# Make It Do — Run Report`,
    ``,
    `**Goal:** ${goal}`,
    `**Date:** ${new Date().toLocaleString()}`,
    `**Steps:** ${steps.length}`,
    ``,
  ];

  if (summary) {
    lines.push(`## Summary`, ``, summary, ``);
  }

  lines.push(`## Execution Trace`, '');

  steps.forEach((step, i) => {
    const meta = NODE_META[step.nodeName];
    lines.push(`### Step ${i + 1} — ${meta?.label ?? step.nodeName}`);
    lines.push(`**Status:** ${step.status}  |  **Time:** ${new Date(step.timestamp).toLocaleTimeString()}`);
    lines.push(``);
    lines.push(step.message);
    if (step.reasoning) {
      lines.push(``, `**Reasoning:**`, ``, '```', step.reasoning, '```');
    }
    step.toolCalls?.forEach((tc) => {
      lines.push(``, `**Tool:** \`${tc.server}/${tc.tool}\` → ${tc.status}`);
      if (Object.keys(tc.arguments ?? {}).length) {
        lines.push('```json', JSON.stringify(tc.arguments, null, 2), '```');
      }
      if (tc.output) {
        const out = typeof tc.output === 'string' ? tc.output : JSON.stringify(tc.output, null, 2);
        lines.push(`**Output:**`, '```', out.slice(0, 1000), '```');
      }
      if (tc.error) lines.push(`**Error:** ${tc.error}`);
    });
    lines.push('');
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `make-it-do-run-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="text-xs text-zinc-500 ml-1">Agent thinking...</span>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  if (status === 'running') return <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />;
  if (status === 'success') return <div className="h-2 w-2 rounded-full bg-emerald-400" />;
  if (status === 'failed')  return <div className="h-2 w-2 rounded-full bg-rose-400" />;
  return <div className="h-2 w-2 rounded-full bg-zinc-600" />;
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`skeleton h-4 ${className}`} />;
}

function TraceCard({ step, index }: { step: TraceStep; index: number }) {
  const [open, setOpen] = useState(index === 0);
  const meta = NODE_META[step.nodeName] ?? NODE_META['init'];

  return (
    <div
      className="relative timeline-item animate-fade-in"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex gap-3">
        {/* Timeline icon */}
        <div className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center border ${meta.bg} ${meta.color} z-10`}>
          {step.status === 'running'
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : meta.icon}
        </div>

        {/* Card body */}
        <div className="flex-1 min-w-0 glass rounded-xl overflow-hidden mb-3">
          {/* Header */}
          <button
            onClick={() => setOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors text-left"
          >
            <div className="min-w-0">
              <div className={`text-[10px] font-bold uppercase tracking-widest ${meta.color} font-mono`}>
                {meta.label}
              </div>
              <div className="text-sm font-medium text-zinc-200 truncate mt-0.5">
                {step.message}
              </div>
            </div>
            <div className="flex items-center gap-2 ml-3 shrink-0">
              {step.status === 'running' && (
                <span className="text-[10px] text-amber-400 font-semibold animate-pulse">RUNNING</span>
              )}
              {step.status === 'success' && (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              )}
              {step.status === 'failed' && (
                <XCircle className="h-4 w-4 text-rose-400" />
              )}
              {open
                ? <ChevronUp className="h-4 w-4 text-zinc-500" />
                : <ChevronDown className="h-4 w-4 text-zinc-500" />
              }
            </div>
          </button>

          {/* Expandable details */}
          {open && (
            <div className="border-t border-white/[0.06] px-4 py-3 space-y-3 animate-fade-in">
              {step.reasoning && (
                <div className="p-3 rounded-lg bg-zinc-950/60 font-mono text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap border border-white/[0.04]">
                  {step.reasoning}
                </div>
              )}

              {step.toolCalls?.map((tc, i) => (
                <div key={i} className="rounded-lg border border-white/[0.06] overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/50">
                    <div className="flex items-center gap-2">
                      <Server className="h-3.5 w-3.5 text-indigo-400" />
                      <span className="text-xs font-semibold text-zinc-200">
                        {tc.server} <span className="text-zinc-500">/</span> {tc.tool}
                      </span>
                    </div>
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                      tc.status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      tc.status === 'failed'  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                                'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}>
                      {tc.status}
                    </span>
                  </div>

                  {Object.keys(tc.arguments ?? {}).length > 0 && (
                    <div className="px-3 py-2 border-t border-white/[0.04]">
                      <div className="text-[9px] font-bold uppercase text-zinc-600 mb-1.5 tracking-wider">
                        Parameters
                      </div>
                      <pre className="text-[10px] text-zinc-400 font-mono overflow-x-auto">
                        {JSON.stringify(tc.arguments, null, 2)}
                      </pre>
                    </div>
                  )}

                  {tc.output && (
                    <div className="px-3 py-2 border-t border-white/[0.04]">
                      <div className="text-[9px] font-bold uppercase text-zinc-600 mb-1.5 tracking-wider">
                        Result
                      </div>
                      <pre className="text-[10px] text-zinc-400 font-mono overflow-x-auto max-h-36 whitespace-pre-wrap">
                        {typeof tc.output === 'string' ? tc.output : JSON.stringify(tc.output, null, 2)}
                      </pre>
                    </div>
                  )}

                  {tc.error && (
                    <div className="px-3 py-2 border-t border-rose-500/10 bg-rose-950/10">
                      <pre className="text-[10px] text-rose-400 font-mono whitespace-pre-wrap">
                        {tc.error}
                      </pre>
                    </div>
                  )}
                </div>
              ))}

              {step.details && Object.keys(step.details).length > 0 && (
                <details className="group">
                  <summary className="text-[10px] text-zinc-600 cursor-pointer hover:text-zinc-400 transition-colors list-none flex items-center gap-1">
                    <ChevronDown className="h-3 w-3 group-open:rotate-180 transition-transform" />
                    Raw details
                  </summary>
                  <pre className="mt-2 text-[10px] text-zinc-500 font-mono overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(step.details, null, 2)}
                  </pre>
                </details>
              )}

              <div className="text-[10px] text-zinc-600 font-mono text-right">
                {new Date(step.timestamp).toLocaleTimeString()}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PlanProgressBar({ plan, currentIndex }: { plan: string[]; currentIndex: number }) {
  if (!plan.length) return null;
  return (
    <div className="glass rounded-xl p-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-3.5 w-3.5 text-indigo-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
          Execution Plan
        </span>
        <span className="ml-auto text-[10px] text-zinc-500 font-mono">
          {Math.min(currentIndex, plan.length)}/{plan.length}
        </span>
      </div>
      <div className="space-y-2">
        {plan.map((step, i) => {
          const done    = i < currentIndex;
          const active  = i === currentIndex;
          const pending = i > currentIndex;
          return (
            <div key={i} className={`flex items-start gap-2.5 transition-opacity ${pending ? 'opacity-40' : 'opacity-100'}`}>
              <div className={`shrink-0 h-5 w-5 rounded-full flex items-center justify-center border text-[9px] font-bold mt-0.5 ${
                done   ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' :
                active ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400 animate-glow-pulse' :
                         'bg-zinc-800 border-zinc-700 text-zinc-500'
              }`}>
                {done ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
              </div>
              <span className={`text-xs leading-snug pt-0.5 ${
                done   ? 'text-zinc-500 line-through' :
                active ? 'text-zinc-100 font-medium' :
                         'text-zinc-500'
              }`}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
  } = useAgentStore();

  // Load history on mount
  useEffect(() => { loadConversations(); }, []);

  // Auto-scroll trace to bottom
  useEffect(() => {
    traceEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps.length]);

  // Run duration timer
  useEffect(() => {
    if (isStreaming) {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setRunDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      // Show success flash when a run just finished
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

  const handleChipClick = (prompt: string) => {
    setGoalInput(prompt);
    textareaRef.current?.focus();
  };

  const formatDuration = (s: number) =>
    s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;

  // Compute token metrics from steps (pulled from planner step details)
  const totalTokens = steps.reduce((acc, s) => {
    const t = s.details?.tokens;
    return acc + (t?.promptTokens ?? 0) + (t?.completionTokens ?? 0);
  }, 0);

  const totalCost = steps.reduce((acc, s) => {
    return acc + (s.details?.tokens?.runCost ?? 0);
  }, 0);

  const activeMcpCount = 1; // Could be fetched dynamically

  // ─── Sidebar ──────────────────────────────────────────────────────────────
  const Sidebar = (
    <aside className={`
      flex flex-col w-72 shrink-0 border-r bg-[var(--bg-surface)]
      border-[var(--border-subtle)] h-full
      transition-transform duration-300 ease-in-out
      md:relative md:translate-x-0
      fixed inset-y-0 left-0 z-40
      ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
    `}>
      {/* Logo */}
      <div className="flex items-center justify-between p-5 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Cpu className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold brand-text">Make It Do</h1>
            <p className="text-[10px] text-zinc-500">Agent Host v1.0</p>
          </div>
        </div>
        <button
          onClick={() => setSidebarOpen(false)}
          className="md:hidden h-7 w-7 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-500"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* MCP Server Status */}
      <div className="p-4 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2 mb-3">
          <Server className="h-3.5 w-3.5 text-indigo-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            MCP Servers
          </span>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-zinc-300 font-medium">local-filesystem</span>
            </div>
            <span className="text-[9px] text-emerald-500 font-semibold uppercase">Live</span>
          </div>
        </div>
      </div>

      {/* New Goal button */}
      <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
        <button
          onClick={() => { reset(); setSidebarOpen(false); }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
        >
          <Sparkles className="h-4 w-4" />
          New Goal
        </button>
      </div>

      {/* History list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        <div className="flex items-center gap-2 mb-3">
          <History className="h-3.5 w-3.5 text-indigo-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            History
          </span>
        </div>

        {conversations.length === 0 ? (
          <div className="space-y-2">
            {[1,2,3].map((i) => (
              <div key={i} className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                <SkeletonBlock className="w-3/4 mb-2" />
                <SkeletonBlock className="w-1/2 h-3" />
              </div>
            ))}
          </div>
        ) : (
          conversations.map((conv: any) => {
            const task = conv.tasks?.[0];
            if (!task) return null;
            const selected = executionId === task.id;
            return (
              <button
                key={conv.id}
                onClick={() => { loadExecutionHistory(task.id, task.originalGoal); setSidebarOpen(false); }}
                className={`w-full text-left p-3 rounded-lg border transition-all text-xs ${
                  selected
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-200'
                    : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] hover:border-[var(--border-default)] text-zinc-300 hover:text-zinc-100'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${selected ? 'bg-indigo-400' : 'bg-zinc-600'}`} />
                  <span className="font-medium truncate">{task.originalGoal}</span>
                </div>
                <span className="text-zinc-600 text-[10px] pl-3.5 block">
                  {new Date(conv.updatedAt || conv.createdAt).toLocaleDateString()}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[var(--border-subtle)] space-y-2">
        <Link
          href="/settings"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all text-xs"
        >
          <Settings className="h-3.5 w-3.5" />
          MCP Server Settings
        </Link>
        <div className="flex items-center gap-2 px-1">
          <div className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-[10px] text-zinc-500">gpt-4o-mini · GitHub Models</span>
        </div>
      </div>
    </aside>
  );

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

      {Sidebar}

      {/* Main area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Sticky Status Header ─────────────────────────────────────────── */}
        <header className="shrink-0 flex items-center gap-4 px-4 md:px-6 h-12 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/80 backdrop-blur-md">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden h-8 w-8 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400"
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono">{activeMcpCount} MCP active</span>
          </div>

          <div className="h-3 w-px bg-zinc-800" />

          {isStreaming && (
            <>
              <div className="flex items-center gap-1.5 text-[11px] text-amber-400">
                <Clock className="h-3 w-3" />
                <span className="font-mono">{formatDuration(runDuration)}</span>
              </div>
              <div className="h-3 w-px bg-zinc-800" />
            </>
          )}

          {totalTokens > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <Coins className="h-3 w-3 text-indigo-400" />
              <span className="font-mono">{totalTokens.toLocaleString()} tokens</span>
              {totalCost > 0 && (
                <span className="text-zinc-600 font-mono">(${totalCost.toFixed(5)})</span>
              )}
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            {/* Export button — visible when run has steps and is not streaming */}
            {steps.length > 0 && !isStreaming && activeGoal && (
              <button
                onClick={() => {
                  const summary = steps
                    .find((s) => s.nodeName === 'evaluator' && s.details?.summary)
                    ?.details?.summary;
                  exportToMarkdown(activeGoal, steps, summary);
                }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs font-semibold hover:bg-zinc-700 hover:text-zinc-100 transition-all"
              >
                <Download className="h-3 w-3" /> Export
              </button>
            )}
            {isStreaming && (
              <button
                onClick={stopExecution}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold hover:bg-rose-500/20 transition-all"
              >
                <Square className="h-3 w-3 fill-current" /> Stop
              </button>
            )}
          </div>
        </header>

        {/* ── Two-pane workspace ───────────────────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden">

          {/* Left pane: Goal input + Goal display */}
          <div className="flex-1 flex flex-col min-w-0 border-r border-[var(--border-subtle)] overflow-y-auto">

            {/* Success flash + Summary card */}
            {showSuccess && (() => {
              const evalStep = [...steps].reverse().find((s) => s.nodeName === 'evaluator' && s.details?.goalAchieved);
              const summary  = evalStep?.details?.summary as string | undefined;
              return (
                <div className="m-4 mb-0 space-y-3">
                  {/* Flash banner */}
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 animate-success-pop">
                    <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-emerald-300">Goal Achieved!</p>
                      <p className="text-xs text-emerald-400/70">The agent completed your goal successfully.</p>
                    </div>
                  </div>
                  {/* Summary result card */}
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
            })()}

            {/* Error banner */}
            {error && (
              <div className="m-4 mb-0 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3 animate-fade-in">
                <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-rose-300">Execution Error</p>
                  <p className="text-xs text-rose-400/70 mt-1 break-words">{error}</p>
                  <button
                    onClick={() => activeGoal && startExecution(activeGoal)}
                    className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-rose-300 hover:text-rose-200 transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" /> Retry
                  </button>
                </div>
              </div>
            )}

            {/* Active goal card */}
            {activeGoal ? (
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
                <p className="text-zinc-100 text-sm leading-relaxed">{activeGoal}</p>
                {executionId && (
                  <p className="text-[10px] text-zinc-600 font-mono mt-2">RUN · {executionId}</p>
                )}
              </div>
            ) : (
              /* Empty state */
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
                      onClick={() => handleChipClick(p)}
                      className="px-3 py-1.5 rounded-full border border-[var(--border-default)] text-xs text-zinc-400 hover:text-zinc-100 hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Goal input */}
            <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 backdrop-blur-sm">
              {/* Prompt chips (when active) */}
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

              <form onSubmit={handleSubmit} className="relative">
                <div className={`relative flex items-end gap-3 rounded-2xl border bg-[var(--bg-elevated)] transition-all duration-200 ${
                  goalInput.trim() ? 'border-indigo-500/40 shadow-lg shadow-indigo-500/5' : 'border-[var(--border-default)]'
                }`}>
                  <textarea
                    ref={textareaRef}
                    placeholder="Describe what you want the agent to do..."
                    value={goalInput}
                    onChange={(e) => {
                      setGoalInput(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e as any);
                      }
                    }}
                    disabled={isStreaming}
                    rows={1}
                    className="auto-textarea flex-1 px-4 py-3.5 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none disabled:opacity-50 focus-ring rounded-2xl"
                  />
                  <div className="flex items-center gap-2 px-3 pb-3">
                    {goalInput.length > 0 && (
                      <span className="text-[10px] text-zinc-600 font-mono">
                        {goalInput.length}
                      </span>
                    )}
                    <button
                      type="submit"
                      disabled={isStreaming || !goalInput.trim()}
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
          </div>

          {/* Right pane: Execution Trace */}
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

              {/* Empty state */}
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

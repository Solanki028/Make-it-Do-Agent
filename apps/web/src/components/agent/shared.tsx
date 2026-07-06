'use client';

import React from 'react';
import { Brain, Terminal, ShieldCheck, RotateCcw, Zap, Play, History } from 'lucide-react';
import type { TraceStep } from '@/store/agent-store';

// ─── Node metadata shared across all components ───────────────────────────────
export const NODE_META: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  planner:  { label: 'Planner',   icon: <Brain className="h-4 w-4" />,        color: 'text-indigo-400',  bg: 'bg-indigo-500/10 border-indigo-500/20' },
  executor: { label: 'Executor',  icon: <Terminal className="h-4 w-4" />,      color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20' },
  evaluator:{ label: 'Evaluator', icon: <ShieldCheck className="h-4 w-4" />,   color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  recovery: { label: 'Recovery',  icon: <RotateCcw className="h-4 w-4" />,     color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/20' },
  reasoning:{ label: 'Reasoning', icon: <Zap className="h-4 w-4" />,           color: 'text-purple-400',  bg: 'bg-purple-500/10 border-purple-500/20' },
  init:     { label: 'Init',      icon: <Play className="h-4 w-4" />,          color: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/20' },
  history:  { label: 'History',   icon: <History className="h-4 w-4" />,       color: 'text-zinc-400',    bg: 'bg-zinc-500/10 border-zinc-500/20' },
};

export const EXAMPLE_PROMPTS = [
  'List all files in the current directory',
  'Read the package.json and summarize the project',
  'Find all TypeScript files in the src folder',
  'Check what MCP tools are available and list them',
];

// ─── Tiny shared primitives ───────────────────────────────────────────────────

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="text-xs text-zinc-500 ml-1">Agent thinking...</span>
    </div>
  );
}

export function StatusDot({ status }: { status: string }) {
  if (status === 'running') return <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />;
  if (status === 'success') return <div className="h-2 w-2 rounded-full bg-emerald-400" />;
  if (status === 'failed')  return <div className="h-2 w-2 rounded-full bg-rose-400" />;
  return <div className="h-2 w-2 rounded-full bg-zinc-600" />;
}

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`skeleton h-4 ${className}`} />;
}

// ─── Export run as markdown ───────────────────────────────────────────────────
export function exportToMarkdown(goal: string, steps: TraceStep[], summary?: string) {
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

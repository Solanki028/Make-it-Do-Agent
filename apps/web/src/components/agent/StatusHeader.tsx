'use client';

import React from 'react';
import { Menu, Clock, Coins, Square, Download } from 'lucide-react';
import { TraceStep } from '@/store/agent-store';
import { exportToMarkdown } from './shared';

interface StatusHeaderProps {
  activeMcpCount: number;
  isStreaming: boolean;
  runDuration: number;
  totalTokens: number;
  totalCost: number;
  steps: TraceStep[];
  activeGoal: string | null;
  onOpenSidebar: () => void;
  onStop: () => void;
}

function formatDuration(s: number): string {
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

export function StatusHeader({
  activeMcpCount, isStreaming, runDuration, totalTokens, totalCost,
  steps, activeGoal, onOpenSidebar, onStop,
}: StatusHeaderProps) {
  return (
    <header className="shrink-0 flex items-center gap-4 px-4 md:px-6 h-12 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/80 backdrop-blur-md">
      {/* Mobile menu trigger */}
      <button
        onClick={onOpenSidebar}
        className="md:hidden h-8 w-8 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-400"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* MCP count */}
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="font-mono">{activeMcpCount} MCP active</span>
      </div>

      <div className="h-3 w-px bg-zinc-800" />

      {/* Run timer */}
      {isStreaming && (
        <>
          <div className="flex items-center gap-1.5 text-[11px] text-amber-400">
            <Clock className="h-3 w-3" />
            <span className="font-mono">{formatDuration(runDuration)}</span>
          </div>
          <div className="h-3 w-px bg-zinc-800" />
        </>
      )}

      {/* Token usage */}
      {totalTokens > 0 && (
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <Coins className="h-3 w-3 text-indigo-400" />
          <span className="font-mono">{totalTokens.toLocaleString()} tokens</span>
          {totalCost > 0 && (
            <span className="text-zinc-600 font-mono">(${totalCost.toFixed(5)})</span>
          )}
        </div>
      )}

      {/* Right: Export + Stop */}
      <div className="ml-auto flex items-center gap-2">
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
            onClick={onStop}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold hover:bg-rose-500/20 transition-all"
          >
            <Square className="h-3 w-3 fill-current" /> Stop
          </button>
        )}
      </div>
    </header>
  );
}

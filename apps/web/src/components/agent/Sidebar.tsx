'use client';

import React from 'react';
import Link from 'next/link';
import {
  Cpu, Server, Sparkles, History, Settings, X,
} from 'lucide-react';
import { SkeletonBlock } from './shared';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  onNewGoal: () => void;
  executionId: string | null;
  conversations: any[];
  onSelectHistory: (taskId: string, goal: string) => void;
}

export function Sidebar({
  open, onClose, onNewGoal, executionId, conversations, onSelectHistory,
}: SidebarProps) {
  return (
    <aside className={`
      flex flex-col w-72 shrink-0 border-r bg-[var(--bg-surface)]
      border-[var(--border-subtle)] h-full
      transition-transform duration-300 ease-in-out
      md:relative md:translate-x-0
      fixed inset-y-0 left-0 z-40
      ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
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
          onClick={onClose}
          className="md:hidden h-7 w-7 flex items-center justify-center rounded-lg hover:bg-zinc-800 text-zinc-500"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* MCP Server Status */}
      <div className="p-4 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2 mb-3">
          <Server className="h-3.5 w-3.5 text-indigo-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">MCP Servers</span>
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
          onClick={() => { onNewGoal(); onClose(); }}
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
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">History</span>
        </div>

        {conversations.length === 0 ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
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
                onClick={() => { onSelectHistory(task.id, task.originalGoal); onClose(); }}
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
}

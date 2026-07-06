'use client';

import React from 'react';
import { CheckCircle2, XCircle, Terminal, ShieldAlert } from 'lucide-react';

interface PendingApproval {
  executionId: string;
  tool: string;
  server: string;
  arguments: Record<string, any>;
  reason: string;
}

interface ApprovalCardProps {
  pendingApproval: PendingApproval;
  onApprove: (approved: boolean) => void;
}

export function ApprovalCard({ pendingApproval, onApprove }: ApprovalCardProps) {
  return (
    <div className="m-4 mb-0 rounded-2xl border border-amber-500/30 bg-amber-500/5 animate-fade-in overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-amber-500/20 bg-amber-500/10">
        <div className="h-8 w-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
          <ShieldAlert className="h-4 w-4 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-amber-300">Action Approval Required</p>
          <p className="text-[11px] text-amber-400/70 mt-0.5">
            The agent wants to perform a write or destructive operation
          </p>
        </div>
        <div className="shrink-0 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30">
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Paused</span>
        </div>
      </div>

      {/* Tool details */}
      <div className="p-4 space-y-3">
        {/* Tool badge */}
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
          <span className="text-xs text-zinc-400">Tool:</span>
          <code className="text-xs font-mono text-amber-300 bg-zinc-900 px-2 py-0.5 rounded-lg border border-zinc-800">
            {pendingApproval.server}/{pendingApproval.tool}
          </code>
        </div>

        {/* Arguments preview */}
        {Object.keys(pendingApproval.arguments).length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Arguments</p>
            <pre className="text-[11px] font-mono text-zinc-300 bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 overflow-x-auto max-h-32 scrollbar-thin">
              {JSON.stringify(pendingApproval.arguments, null, 2)}
            </pre>
          </div>
        )}

        {/* Agent reasoning snippet */}
        {pendingApproval.reason && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Agent reasoning</p>
            <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">
              {pendingApproval.reason.split('\n').slice(-2).join(' ')}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={() => onApprove(true)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-bold hover:bg-emerald-500/25 hover:border-emerald-400/50 transition-all active:scale-95"
          >
            <CheckCircle2 className="h-4 w-4" /> Approve &amp; Continue
          </button>
          <button
            onClick={() => onApprove(false)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm font-bold hover:bg-rose-500/20 hover:border-rose-400/40 transition-all active:scale-95"
          >
            <XCircle className="h-4 w-4" /> Deny &amp; Stop
          </button>
        </div>
      </div>
    </div>
  );
}

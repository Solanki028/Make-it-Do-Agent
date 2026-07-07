'use client';

import React, { useState } from 'react';
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, Server } from 'lucide-react';
import { TraceStep } from '@/store/agent-store';
import { NODE_META } from './shared';

export function TraceCard({ step, index }: { step: TraceStep; index: number }) {
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
              {step.status === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
              {step.status === 'failed'  && <XCircle className="h-4 w-4 text-rose-400" />}
              {open ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
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
                      <div className="text-[9px] font-bold uppercase text-zinc-600 mb-1.5 tracking-wider">Parameters</div>
                      <pre className="text-[10px] text-zinc-400 font-mono overflow-x-auto">
                        {JSON.stringify(tc.arguments, null, 2)}
                      </pre>
                    </div>
                  )}

                  {tc.output && (
                    <div className="px-3 py-2 border-t border-white/[0.04]">
                      <div className="text-[9px] font-bold uppercase text-zinc-600 mb-1.5 tracking-wider">Result</div>
                      {typeof tc.output === 'string' && tc.output.startsWith('data:image/') ? (
                        <div className="my-2 max-w-full overflow-hidden rounded-lg border border-white/10">
                          <img src={tc.output} alt="Tool output screenshot" className="w-full h-auto object-contain max-h-[300px]" />
                        </div>
                      ) : (
                        <pre className="text-[10px] text-zinc-400 font-mono overflow-x-auto max-h-36 whitespace-pre-wrap">
                          {typeof tc.output === 'string' ? tc.output : JSON.stringify(tc.output, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}

                  {tc.error && (
                    <div className="px-3 py-2 border-t border-rose-500/10 bg-rose-950/10">
                      <pre className="text-[10px] text-rose-400 font-mono whitespace-pre-wrap">{tc.error}</pre>
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

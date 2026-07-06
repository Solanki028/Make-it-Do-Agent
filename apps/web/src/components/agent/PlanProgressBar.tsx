'use client';

import React from 'react';
import { CheckCircle2, TrendingUp } from 'lucide-react';

interface PlanProgressBarProps {
  plan: string[];
  currentIndex: number;
}

export function PlanProgressBar({ plan, currentIndex }: PlanProgressBarProps) {
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

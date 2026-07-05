'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAgentStore, TraceStep } from '@/store/agent-store';
import { 
  Play, Sparkles, Server, CheckCircle2, XCircle, Loader2, 
  HelpCircle, History, Cpu, ChevronDown, ChevronUp, AlertCircle, RefreshCw 
} from 'lucide-react';

export default function Home() {
  const [goalInput, setGoalInput] = useState('');
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { 
    startExecution, stopExecution, reset, 
    isStreaming, plan, steps, error, activeGoal, executionId 
  } = useAgentStore();

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalInput.trim() || isStreaming) return;
    const currentGoal = goalInput;
    setGoalInput('');
    await startExecution(currentGoal);
  };

  // Auto-scroll chat window to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  // Keep latest steps open by default
  useEffect(() => {
    if (steps.length > 0) {
      const latestStep = steps[steps.length - 1];
      setOpenSteps(prev => ({ ...prev, [latestStep.id]: true }));
    }
  }, [steps.length]);

  const toggleStep = (id: string) => {
    setOpenSteps(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-50 font-sans overflow-hidden">
      
      {/* 1. Sidebar - History & MCP Status */}
      <aside className="w-80 border-r border-zinc-800 bg-zinc-900/50 flex flex-col hidden md:flex">
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="h-6 w-6 text-indigo-400" />
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Make It Do
            </h1>
          </div>
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            v1.0
          </span>
        </div>

        {/* MCP Server List Status */}
        <div className="p-4 border-b border-zinc-800">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-2">
            <Server className="h-4 w-4 text-indigo-400" /> Active MCP Servers
          </h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-800/40 border border-zinc-800">
              <span className="text-sm font-medium text-zinc-200">local-filesystem</span>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-800/40 border border-zinc-800">
              <span className="text-sm font-medium text-zinc-200">web-scraper-mcp</span>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
          </div>
        </div>

        {/* History Log List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
            <History className="h-4 w-4 text-indigo-400" /> Goal History
          </h2>
          <div className="space-y-1">
            {activeGoal && (
              <button className="w-full text-left p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-sm font-medium truncate">
                {activeGoal}
              </button>
            )}
            <div className="p-3 text-center text-xs text-zinc-500 italic">
              No historical runs found
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950/40 text-center">
          <p className="text-xs text-zinc-500">Model Context Protocol Host Engine</p>
        </div>
      </aside>

      {/* 2. Main Workstation Space */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* Left Pane: Agent Dialog & Goal Interface */}
        <div className="flex-1 flex flex-col border-r border-zinc-800 bg-zinc-950 overflow-y-auto p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
            <div>
              <h2 className="text-xl font-bold">Goal Workspace</h2>
              <p className="text-xs text-zinc-400 mt-1">Describe open-ended targets for the agent to figure out and execute.</p>
            </div>
            {isStreaming && (
              <button 
                onClick={stopExecution} 
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition-all flex items-center gap-2"
              >
                <Loader2 className="h-3 w-3 animate-spin" /> Stop Execution
              </button>
            )}
          </div>

          {/* Goal Display Card */}
          {activeGoal ? (
            <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-2">
              <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
                <Sparkles className="h-4 w-4" /> ACTIVE GOAL
              </div>
              <p className="text-zinc-200 text-md leading-relaxed">{activeGoal}</p>
              {executionId && (
                <div className="text-[10px] text-zinc-500 font-mono mt-1">
                  RUN ID: {executionId}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4">
              <div className="h-16 w-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-indigo-400 shadow-xl">
                <Sparkles className="h-8 w-8 animate-pulse" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Ready to Begin</h3>
                <p className="text-sm text-zinc-500 max-w-sm mt-1">
                  Type a goal to watch the agent plan, fetch tools dynamically, auto-recover from exceptions, and show its work.
                </p>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm">Execution Error Encountered</h4>
                <p className="text-xs text-rose-200/80 mt-1">{error}</p>
                <button 
                  onClick={() => startExecution(activeGoal || '')} 
                  className="mt-3 px-3 py-1 bg-rose-500/20 text-rose-300 rounded border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 hover:bg-rose-500/30 transition-all"
                >
                  <RefreshCw className="h-3 w-3" /> Retry Run
                </button>
              </div>
            </div>
          )}

          {/* Form Input (Stick to bottom of workspace) */}
          <div className="mt-auto">
            <form onSubmit={handleStart} className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. Find the three largest PDF files in downloads and summarize them..."
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                disabled={isStreaming}
                className="flex-1 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isStreaming || !goalInput.trim()}
                className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-zinc-50 font-semibold shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2 disabled:opacity-50 disabled:bg-zinc-800 disabled:shadow-none"
              >
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" /> Run
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right Pane: Reasoning Trace Visualizer */}
        <div className="w-full md:w-[480px] flex flex-col bg-zinc-900/30 border-t md:border-t-0 border-zinc-800 overflow-hidden">
          <div className="p-6 border-b border-zinc-900 bg-zinc-950/40">
            <h2 className="text-md font-bold tracking-wide flex items-center gap-2">
              <Cpu className="h-5 w-5 text-indigo-400" /> Agent Execution Trace
            </h2>
            <p className="text-xs text-zinc-500 mt-1">Live reasoning steps, model evaluations, and MCP tool payloads.</p>
          </div>

          {/* Trace Steps Scroll Space */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            
            {/* Timeline Progress Tracker */}
            {plan.length > 0 && (
              <div className="mb-6 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 space-y-3">
                <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Dynamic Run Plan</div>
                <div className="flex flex-wrap gap-2">
                  {plan.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-md bg-zinc-800 text-xs font-semibold text-zinc-300 border border-zinc-700/60">
                        {p}
                      </span>
                      {idx < plan.length - 1 && <span className="text-zinc-600">→</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Trace List */}
            {steps.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-zinc-600 text-sm italic">
                Awaiting agent startup...
              </div>
            ) : (
              steps.map((step) => {
                const isOpen = openSteps[step.id];
                return (
                  <div key={step.id} className="border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-950/60">
                    
                    {/* Header */}
                    <div 
                      onClick={() => toggleStep(step.id)}
                      className="p-4 flex items-center justify-between cursor-pointer hover:bg-zinc-800/20 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        {step.status === 'running' && <Loader2 className="h-4 w-4 text-amber-500 animate-spin" />}
                        {step.status === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                        {step.status === 'failed' && <XCircle className="h-4 w-4 text-rose-500" />}
                        
                        <div>
                          <span className="text-[10px] font-bold tracking-wider text-indigo-400 uppercase font-mono block">
                            {step.nodeName}
                          </span>
                          <span className="text-sm font-semibold text-zinc-200">
                            {step.nodeName === 'reasoning' ? 'Analyzing and planning...' : step.message}
                          </span>
                        </div>
                      </div>
                      {isOpen ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
                    </div>

                    {/* Expandable Body */}
                    {isOpen && (
                      <div className="px-4 pb-4 border-t border-zinc-900 bg-zinc-950/20 space-y-3 pt-3">
                        
                        {/* 1. Reasoning Token Stream block */}
                        {step.reasoning && (
                          <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-850 font-mono text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
                            {step.reasoning}
                          </div>
                        )}

                        {/* 2. Tool Calls details */}
                        {step.toolCalls && step.toolCalls.map((tc, idx) => (
                          <div key={idx} className="space-y-2 border border-indigo-500/10 rounded-lg p-3 bg-indigo-500/[0.01]">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
                                <Server className="h-3 w-3 text-indigo-400" />
                                {tc.server} / {tc.tool}
                              </span>
                              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                                tc.status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                                tc.status === 'failed' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 
                                'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              }`}>
                                {tc.status}
                              </span>
                            </div>

                            {/* Arguments payload */}
                            <div>
                              <div className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Parameters</div>
                              <pre className="p-2 rounded bg-zinc-950 text-[10px] text-zinc-400 font-mono overflow-x-auto">
                                {JSON.stringify(tc.arguments, null, 2)}
                              </pre>
                            </div>

                            {/* Outputs or Error */}
                            {tc.output && (
                              <div>
                                <div className="text-[10px] font-bold uppercase text-zinc-500 mb-1">Result</div>
                                <pre className="p-2 rounded bg-zinc-950 text-[10px] text-zinc-400 font-mono overflow-x-auto whitespace-pre-wrap max-h-40">
                                  {JSON.stringify(tc.output, null, 2)}
                                </pre>
                              </div>
                            )}

                            {tc.error && (
                              <div className="p-2 rounded bg-rose-950/20 border border-rose-500/20 text-rose-400 text-xs font-mono">
                                {tc.error}
                              </div>
                            )}
                          </div>
                        ))}

                        <div className="text-[10px] text-zinc-500 font-mono text-right">
                          {new Date(step.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </main>
    </div>
  );
}

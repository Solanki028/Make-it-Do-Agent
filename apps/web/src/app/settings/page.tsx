'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Server, Plus, Trash2, ToggleLeft, ToggleRight, Zap, CheckCircle2,
  XCircle, Loader2, ArrowLeft, AlertCircle, Terminal, Globe,
  ChevronDown, ChevronUp, Cpu, RefreshCw,
} from 'lucide-react';

const API_BASE = 'http://localhost:4000';

interface MCPServer {
  id: string;
  name: string;
  transportType: 'STDIO' | 'SSE';
  connectionString: string;
  envVariables: Record<string, string>;
  isEnabled: boolean;
  isConnected: boolean;
  toolCount: number;
  updatedAt: string;
}

// ─── Server Card ──────────────────────────────────────────────────────────────
function ServerCard({
  server,
  onToggle,
  onDelete,
  onTest,
}: {
  server: MCPServer;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onDelete: (id: string, name: string) => Promise<void>;
  onTest: (id: string) => Promise<{ success: boolean; message: string }>;
}) {
  const [expanded, setExpanded]     = useState(false);
  const [togglingId, setTogglingId] = useState(false);
  const [testing, setTesting]       = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [deleting, setDeleting]     = useState(false);

  const handleToggle = async () => {
    setTogglingId(true);
    try { await onToggle(server.id, !server.isEnabled); }
    finally { setTogglingId(false); }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await onTest(server.id);
      setTestResult(result);
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Remove MCP server "${server.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    await onDelete(server.id, server.name);
  };

  const envEntries = Object.entries(server.envVariables ?? {});

  return (
    <div className={`glass rounded-2xl overflow-hidden transition-all ${
      server.isConnected ? 'border-emerald-500/20' : server.isEnabled ? 'border-amber-500/20' : 'border-[var(--border-subtle)]'
    }`}>
      {/* Header row */}
      <div className="flex items-center gap-4 px-5 py-4">
        {/* Icon */}
        <div className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center border ${
          server.isConnected
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-zinc-800 border-zinc-700 text-zinc-500'
        }`}>
          {server.transportType === 'SSE' ? <Globe className="h-4 w-4" /> : <Terminal className="h-4 w-4" />}
        </div>

        {/* Name + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-zinc-100">{server.name}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-500 font-mono uppercase">
              {server.transportType}
            </span>
            {server.isConnected && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold">
                {server.toolCount} tools
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-0.5 truncate font-mono">
            {server.connectionString.slice(0, 60)}{server.connectionString.length > 60 ? '…' : ''}
          </p>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-1.5 shrink-0">
          {server.isConnected
            ? <><div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" /><span className="text-xs text-emerald-400 font-semibold">Live</span></>
            : server.isEnabled
              ? <><div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" /><span className="text-xs text-amber-400 font-semibold">Connecting</span></>
              : <><div className="h-2 w-2 rounded-full bg-zinc-600" /><span className="text-xs text-zinc-500">Disabled</span></>
          }
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleToggle}
            disabled={togglingId}
            className="text-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-50"
            title={server.isEnabled ? 'Disable server' : 'Enable server'}
          >
            {togglingId
              ? <Loader2 className="h-5 w-5 animate-spin" />
              : server.isEnabled
                ? <ToggleRight className="h-5 w-5 text-indigo-400" />
                : <ToggleLeft className="h-5 w-5" />
            }
          </button>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-[var(--border-subtle)] px-5 py-4 space-y-4 animate-fade-in">
          {/* Connection string */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-1.5">Connection String</p>
            <pre className="p-3 rounded-lg bg-zinc-950/60 text-xs text-zinc-400 font-mono overflow-x-auto">
              {server.connectionString}
            </pre>
          </div>

          {/* Env variables */}
          {envEntries.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-1.5">Environment Variables</p>
              <div className="space-y-1.5">
                {envEntries.map(([k, v]) => (
                  <div key={k} className="flex items-center gap-3 p-2 rounded-lg bg-zinc-950/40 font-mono text-xs">
                    <span className="text-indigo-400 shrink-0">{k}</span>
                    <span className="text-zinc-600">=</span>
                    <span className="text-zinc-500 truncate">
                      {v ? `${v.slice(0, 8)}${'•'.repeat(Math.max(0, v.length - 8))}` : <span className="italic text-rose-500">not set</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Test result */}
          {testResult && (
            <div className={`flex items-start gap-2 p-3 rounded-lg border text-xs ${
              testResult.success
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
            }`}>
              {testResult.success
                ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
              {testResult.message}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold hover:bg-indigo-500/20 transition-all disabled:opacity-50"
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Test Connection
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold hover:bg-rose-500/20 transition-all disabled:opacity-50 ml-auto"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Remove
            </button>
          </div>

          <p className="text-[10px] text-zinc-700 font-mono">
            Last updated: {new Date(server.updatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Add Server Form ──────────────────────────────────────────────────────────
function AddServerForm({ onAdd }: { onAdd: () => void }) {
  const [open, setOpen]                   = useState(false);
  const [name, setName]                   = useState('');
  const [transport, setTransport]         = useState<'STDIO' | 'SSE'>('STDIO');
  const [connectionStr, setConnectionStr] = useState('');
  const [envKey, setEnvKey]               = useState('');
  const [envValue, setEnvValue]           = useState('');
  const [envPairs, setEnvPairs]           = useState<[string, string][]>([]);
  const [submitting, setSubmitting]       = useState(false);
  const [error, setError]                 = useState('');

  const addEnvPair = () => {
    if (envKey.trim()) {
      setEnvPairs((p) => [...p, [envKey.trim(), envValue.trim()]]);
      setEnvKey(''); setEnvValue('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !connectionStr.trim()) {
      setError('Name and connection string are required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          transportType: transport,
          connectionString: connectionStr.trim(),
          envVariables: Object.fromEntries(envPairs),
          isEnabled: true,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to create server');
      }
      setName(''); setConnectionStr(''); setEnvPairs([]); setOpen(false);
      onAdd();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-[var(--border-default)] text-zinc-500 hover:text-zinc-200 hover:border-indigo-500/40 hover:bg-indigo-500/[0.03] transition-all text-sm font-medium"
      >
        <Plus className="h-4 w-4" /> Add MCP Server
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass rounded-2xl p-5 space-y-4 animate-fade-in border-indigo-500/20">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
          <Plus className="h-4 w-4 text-indigo-400" /> New MCP Server
        </h3>
        <button type="button" onClick={() => setOpen(false)} className="text-zinc-600 hover:text-zinc-300 text-xs">
          Cancel
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1.5">Server Name</label>
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. brave-search"
            className="w-full px-3 py-2 rounded-lg bg-zinc-950/60 border border-[var(--border-default)] text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50 font-mono"
          />
        </div>

        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1.5">Transport</label>
          <select
            value={transport} onChange={(e) => setTransport(e.target.value as 'STDIO' | 'SSE')}
            className="w-full px-3 py-2 rounded-lg bg-zinc-950/60 border border-[var(--border-default)] text-sm text-zinc-100 focus:outline-none focus:border-indigo-500/50"
          >
            <option value="STDIO">STDIO</option>
            <option value="SSE">SSE</option>
          </select>
        </div>

        <div className="col-span-2">
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1.5">
            Connection String {transport === 'STDIO' ? '(JSON array: [command, ...args])' : '(URL)'}
          </label>
          <input
            value={connectionStr} onChange={(e) => setConnectionStr(e.target.value)}
            placeholder={transport === 'STDIO' ? '["npx", "-y", "@scope/server-name"]' : 'http://localhost:3333/sse'}
            className="w-full px-3 py-2 rounded-lg bg-zinc-950/60 border border-[var(--border-default)] text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50 font-mono"
          />
        </div>
      </div>

      {/* Env variable builder */}
      <div>
        <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block mb-1.5">
          Environment Variables
        </label>
        <div className="space-y-1.5 mb-2">
          {envPairs.map(([k, v], i) => (
            <div key={i} className="flex items-center gap-2 text-xs font-mono">
              <span className="text-indigo-400">{k}</span>
              <span className="text-zinc-600">=</span>
              <span className="text-zinc-500 flex-1 truncate">{v || '(empty)'}</span>
              <button type="button" onClick={() => setEnvPairs((p) => p.filter((_, j) => j !== i))}
                className="text-rose-500 hover:text-rose-400">×</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={envKey} onChange={(e) => setEnvKey(e.target.value)}
            placeholder="KEY" className="flex-1 px-2 py-1.5 rounded-lg bg-zinc-950/60 border border-[var(--border-default)] text-xs text-zinc-300 font-mono focus:outline-none" />
          <input value={envValue} onChange={(e) => setEnvValue(e.target.value)}
            placeholder="VALUE" className="flex-1 px-2 py-1.5 rounded-lg bg-zinc-950/60 border border-[var(--border-default)] text-xs text-zinc-300 font-mono focus:outline-none" />
          <button type="button" onClick={addEnvPair}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs hover:bg-zinc-700 transition-all">
            Add
          </button>
        </div>
      </div>

      <button
        type="submit" disabled={submitting}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Add Server
      </button>
    </form>
  );
}

// ─── Settings Page ────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [servers, setServers]   = useState<MCPServer[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  const fetchServers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/mcp`);
      if (!res.ok) throw new Error('Failed to load servers');
      setServers(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchServers(); }, [fetchServers]);

  const handleToggle = async (id: string, enabled: boolean) => {
    await fetch(`${API_BASE}/api/mcp/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isEnabled: enabled }),
    });
    await fetchServers();
  };

  const handleDelete = async (id: string) => {
    await fetch(`${API_BASE}/api/mcp/${id}`, { method: 'DELETE' });
    await fetchServers();
  };

  const handleTest = async (id: string) => {
    const res = await fetch(`${API_BASE}/api/mcp/${id}/test`, { method: 'POST' });
    return res.json();
  };

  const connectedCount = servers.filter((s) => s.isConnected).length;
  const totalTools     = servers.reduce((acc, s) => acc + s.toolCount, 0);

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-zinc-500 hover:text-zinc-200 transition-colors text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Agent
          </Link>
          <div className="h-4 w-px bg-zinc-800" />
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Cpu className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-sm font-bold brand-text">Make It Do</span>
          </div>
          <span className="text-sm text-zinc-500">/ Settings</span>
          <div className="ml-auto">
            <button
              onClick={fetchServers}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        {/* Page title */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">MCP Server Settings</h1>
          <p className="text-sm text-zinc-500 mt-1.5">
            Manage the Model Context Protocol servers that give the agent its tools.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Servers', value: servers.length, icon: <Server className="h-4 w-4" />, color: 'text-zinc-400' },
            { label: 'Connected', value: connectedCount, icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-emerald-400' },
            { label: 'Total Tools', value: totalTools, icon: <Zap className="h-4 w-4" />, color: 'text-indigo-400' },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className="glass rounded-xl p-4">
              <div className={`flex items-center gap-2 ${color} mb-2`}>
                {icon}
                <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
              </div>
              <div className="text-2xl font-bold text-zinc-100">{value}</div>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
          </div>
        )}

        {/* Server list */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-zinc-400 flex items-center gap-2 uppercase tracking-wider">
            <Server className="h-4 w-4" /> Registered Servers
          </h2>

          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map((i) => (
                <div key={i} className="glass rounded-2xl p-5">
                  <div className="flex items-center gap-4">
                    <div className="skeleton h-10 w-10 rounded-xl" />
                    <div className="flex-1 space-y-2">
                      <div className="skeleton h-4 w-40" />
                      <div className="skeleton h-3 w-64" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {servers.map((srv) => (
                <ServerCard
                  key={srv.id}
                  server={srv}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onTest={handleTest}
                />
              ))}
            </div>
          )}

          <AddServerForm onAdd={fetchServers} />
        </div>

        {/* Docs section */}
        <div className="glass rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-zinc-300 flex items-center gap-2">
            <Zap className="h-4 w-4 text-indigo-400" /> Quick Setup Guides
          </h2>
          <div className="space-y-2 text-xs text-zinc-500">
            <p>
              <span className="text-zinc-300 font-semibold">Brave Search:</span>{' '}
              Get a free API key at{' '}
              <a href="https://brave.com/search/api/" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
                brave.com/search/api
              </a>
              , add it to <code className="text-zinc-400 font-mono">BRAVE_API_KEY</code> in{' '}
              <code className="text-zinc-400 font-mono">apps/api/.env</code>, then enable the server here.
            </p>
            <p>
              <span className="text-zinc-300 font-semibold">GitHub MCP:</span>{' '}
              Your <code className="text-zinc-400 font-mono">GITHUB_TOKEN</code> is already in your{' '}
              <code className="text-zinc-400 font-mono">.env</code>. Enable the GitHub server here to give the agent
              access to read repos, list PRs, and create issues.
            </p>
            <p>
              <span className="text-zinc-300 font-semibold">Custom STDIO server:</span>{' '}
              Any npm package following the MCP spec can be added by entering its npx command as a JSON array, e.g.{' '}
              <code className="text-zinc-400 font-mono">{"[\"npx\", \"-y\", \"@your/mcp-server\"]"}</code>.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

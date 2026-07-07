# Project Diagnostic & Context Summary

This document summarizes the current state of **Make It Do**, including the APIs/models tried, errors encountered, solutions applied, and the layout adjustments required to align with user expectations.

---

## 📋 1. Project Overview & Architecture
**Make It Do** is an autonomous agentic platform built using **LangGraph** (StateGraph) on the backend and **Next.js** on the frontend. The agent operates in a cyclic loop:
```
[User Goal] ──> [Planner (LLM)] ──> [Executor (Runs MCP Tools)] ──> [Evaluator (LLM Verification)]
                     ▲                                                    │
                     └────────────────── [No: Loop Back] ◄────────────────┘
```
- **State Management:** Managed by a Zustand store (`agent-store.ts`) streaming updates from the backend via Server-Sent Events (SSE).
- **Tooling Interface:** Connects to Model Context Protocol (MCP) servers (e.g., `local-filesystem`, `github`, `puppeteer`) to read/write files, manage git repositories, and browse the web.

---

## ⚙️ 2. APIs & LLM Providers Tried
To optimize cost, speed, and accuracy, we have integrated and experimented with multiple API endpoints:
1. **GitHub Models (Current):** Using `gpt-4o-mini` via the OpenAI SDK pointing to the GitHub Models endpoint. Extremely strict on API contract requirements (specifically message ordering and token limits).
2. **Gemini:** Used for multi-modal capability and high context limits.
3. **Grok / Cohere:** Explored for general instruction tuning and low-latency planning.

---

## ❌ 3. Key Issues & Resolved Errors

Below is the chronological history of errors encountered during development and how they were patched:

### 1. The "Connecting..." Status Indicator Bug
- **Symptom:** UI settings panel displayed disabled or inactive servers as permanently "Connecting".
- **Root Cause:** The UI status badge mapped `enabled: true` to "Connecting" even if the server connection process was idle.
- **Fix:** Patched the status badge logic in `settings/page.tsx` to correctly display "Disconnected" for inactive servers.

### 2. Brave Search MCP Cost & Fetch MCP Package Failure
- **Symptom:** The agent couldn't fetch web pages, and `@modelcontextprotocol/server-fetch` failed to install because it does not exist on npm.
- **Fix:** Swapped out the fetch package and replaced it with a free, fully sandbox-compatible browser tool using `@modelcontextprotocol/server-puppeteer`.

### 3. API Error: `413 Request body too large for gpt-4o-mini`
- **Symptom:** When reading large files (like `.env` or configuration files), the agent crashed with a `413` error from the OpenAI endpoint.
- **Root Cause:** 
  1. The filesystem tool returned massive outputs (e.g., the complete `.env` file) which were injected directly into the `ToolMessage` context.
  2. The system prompt serialized the full JSON schema of all 47 tools on every request (~4,500 tokens of bloat).
- **Fix:**
  - Added a `MAX_LLM_OUTPUT_CHARS = 3000` truncation limit in `executor.ts` for tool messages sent to the LLM (while preserving the full output in the UI trace step).
  - Compacted the tool schemas in the system prompt down to one-line descriptions (cutting prompt size by ~85%).
  - Lowered the rolling history summarization threshold from 10 to 6 messages to compress context sooner.

### 4. API Error: `400 Invalid parameter: messages with role 'tool' must be a response to a preceding message with 'tool_calls'`
- **Symptom:** The graph crashed on the second step of any tool execution with a Bad Request error.
- **Root Cause:** The OpenAI API strictly requires any `ToolMessage` to follow an `AIMessage` containing a matching `tool_calls` structure. Previously, the planner was outputting raw JSON and discarding the corresponding assistant tool-call payload.
- **Fix:** 
  - Rewrote the planner node to generate a stable `toolCallId` and append an `AIMessage` with a formal `tool_calls` array containing the planned tool, server, and arguments.
  - Implemented a **pass-through guard** at the top of the planner node so that if a tool execution is resumed or already scheduled, it passes control straight to the executor.

---

## 🧪 4. Testing Inputs & Prompts Tried
The following user goals were used to validate the agent's loop, loop guards, and filesystem actions:
- `List all files in the current directory` (Verifies basic directory listing)
- `Read the file apps/api/package.json` (Verifies file reading)
- `Create a file called test.txt with content Hello World` (Verifies Human-in-the-Loop gate for write actions)
- `What is inside the apps/api/.env file?` (Verifies large file reading and truncation safety)

---

## 🎨 5. UI/UX Design Goals (Next Step)
The user has requested a pivot from the multi-pane/sidebar layout to a **clean, single-dashboard interface** similar to ChatGPT or Gemini:

### ⚠️ Current Layout Concerns:
- The right sidebar displaying the step timeline and loop steps (`Execution Trace`) feels separated and cluttered.
- The user wants the agent's core activity and thoughts to be rendered directly within the central chat area.

### 🎯 Proposed ChatGPT/Gemini-Style Layout:
- **Left Sidebar:** Keeps goal history, MCP server list, settings link, and the "New Goal" button (remains as is).
- **Central Dashboard:**
  - **Upper Conversation Area:** Renders the user's initial Goal, followed by the agent's real-time thinking process, plan progress, and inline tool executions.
  - **Bottom Centered Input Box:** A clean text area with a play/submit button.
- **Inline Activity Stream:** The execution steps (e.g. "Planner deciding next step...", "Running `read_file` tool...") will appear inside the central viewport as a chat flow, eliminating the need for a separate right sidebar.

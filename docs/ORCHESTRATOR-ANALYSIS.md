# Orchestrator-Agent Analysis

Analysis of the [anthropics/anthropic-cookbook/patterns/agents/orchestrator-agent](https://github.com/anthropics/anthropic-cookbook) project and transferable ideas for Claudeck.

---

## 1. Overview

The orchestrator-agent is a TypeScript/React reference implementation demonstrating multi-agent orchestration with Claude. It features a central "meta-agent" that delegates tasks to specialist sub-agents, each operating within isolated "Agent Desktop Workspaces" (ADWs). The system provides real-time visibility into agent activity, token usage, and tool execution.

**Tech Stack**: TypeScript, React, Tailwind CSS, Claude SDK
**Architecture**: Meta-Agent + Expert Agents + ADWs + Event Streaming

---

## 2. Key Concepts

| Concept | Description |
|---------|-------------|
| **ADW (Agent Desktop Workspace)** | Isolated sandboxed environment per agent with its own filesystem, tools, and context |
| **Agent Experts** | Specialized sub-agents (coder, researcher, planner) spawned by the meta-agent |
| **Meta-Agent** | Orchestrator that decomposes tasks, assigns to experts, and synthesizes results |
| **Hook Observability** | Lifecycle hooks that emit events for every agent action (tool call, response, error) |
| **Event Streaming** | Real-time SSE/WebSocket stream of all agent activity for UI consumption |
| **Context Window Tracking** | Per-agent token usage gauge showing consumption against model limits |

---

## 3. Feature Breakdown

### UI Features
- **Three-Panel Layout**: Left (agent list), Center (event stream), Right (workspace/output)
- **Context Window Gauge**: Per-agent `X/200k` bar with color coding (green/yellow/red)
- **Per-Agent Token Breakdown**: Input tokens, output tokens, cache read/creation tokens
- **Event Stream**: Filterable log of all agent activity (tools, responses, errors, hooks)
- **Agent Status Cards**: Real-time status per agent (idle, thinking, tool use, complete)
- **Workspace Viewer**: File browser showing ADW contents per agent

### Backend Features
- **Multi-Agent Orchestration**: Task decomposition and parallel agent execution
- **Tool Routing**: Per-agent tool availability based on expertise
- **Cost Tracking**: Cumulative and per-agent cost breakdowns
- **Conversation History**: Full message history per agent with role attribution

---

## 4. Transferable Ideas

### Idea 1: Context Window Indicator
**Effort**: Low | **Impact**: High

Show cumulative session token usage as a gauge in the header. Data already flows through WebSocket (`input_tokens`, `output_tokens`, `cache_read_tokens`). Just needs accumulation + UI.

### Idea 2: Per-Message Token Display
**Effort**: Minimal | **Impact**: Medium

Change result summary from `"5.2k tokens"` to `"1.2k in / 3.4k out"`. All data already exists in the result message — purely a formatting change.

### Idea 3: Event Stream Panel
**Effort**: Medium | **Impact**: High

Structured, filterable activity log in the right panel. Shows tool calls, results, errors, and completions as compact timestamped rows. Enables users to quickly scan what happened during a session without scrolling through chat.

### Idea 4: Enhanced Workflow Visualization
**Effort**: High | **Impact**: High

Visual workflow builder with drag-and-drop steps, branching logic, and real-time progress indicators. Would require significant UI work and new backend endpoints.

### Idea 5: Agent Profiles / Personas
**Effort**: Medium | **Impact**: Medium

Configurable agent personas with different system prompts, tool permissions, and model preferences. Could be implemented as named presets in the session settings dropdown.

### Idea 6: AI-Generated Session Summaries
**Effort**: Medium | **Impact**: Medium

Auto-generate a brief summary of what was accomplished in a session using a lightweight model call. Could appear in the session list as a subtitle or on hover.

---

## 5. Phase A Selection

We're implementing Ideas 1-3 first because:

1. **Per-Message Token Display** — 5-line code change, zero new files, instant value
2. **Context Window Indicator** — Self-contained new module, data already available via WebSocket, high visibility
3. **Event Stream Panel** — Follows existing right-panel tab pattern, reuses WebSocket events, provides major new capability

All three are independent (no dependencies on each other) and require no backend changes.

---

## 6. Future Phases

### Phase B: Enhanced Workflows (Idea 4)
- Visual workflow editor with step-by-step debugging
- Requires new backend API for workflow state management
- Estimated: 2-3 development sessions

### Phase C: Agent Profiles (Idea 5)
- Named presets for system prompt + model + permission mode
- Stored in SQLite alongside projects
- Estimated: 1-2 development sessions

### Phase D: AI Summaries (Idea 6)
- Lightweight summarization call on session end or on-demand
- Cache summaries in sessions table
- Estimated: 1 development session

# Competitive Analysis — Claude Code Web UIs

**Date**: March 6, 2026
**Purpose**: Map the landscape of web-based interfaces for Claude Code and identify feature gaps in CodeDeck.

---

## Market Context

The Claude Code web UI ecosystem has grown significantly. Key developments:

- **Anthropic's Remote Control** (Feb 2026): Official mobile/web access to local Claude Code sessions. Run `claude remote-control` to get a QR code / URL, then control from phone or browser via claude.ai/code. Currently Max-only ($100-$200/mo), Pro coming soon. Limitation: terminal must stay open, no file explorer, no analytics, no multi-session management. This is a **direct threat** to all third-party web UIs but remains limited in scope.

- **Desktop-native apps rising**: Opcode (Tauri, 20K+ stars) and CodePilot (Electron, 3.1K stars) show strong developer preference for native GUIs.

- **Multi-CLI convergence**: CloudCLI now supports Claude Code, Cursor CLI, Codex, and Gemini CLI — no longer Claude-specific.

---

## Competitors Overview

### Tier 1 — Major Competitors (1K+ stars)

#### 1. Opcode (winfunc/opcode, formerly Claudia)
- **GitHub**: https://github.com/winfunc/opcode
- **Stars**: ~20,800 | **Forks**: ~2,000+
- **Stack**: React 18 + TypeScript (Vite 6) frontend, Rust + Tauri 2 backend, Tailwind CSS v4
- **Status**: Very active. YC-backed (via Asterisk). Rebranded from "Claudia" to "Opcode."
- **Platform**: Desktop (macOS, Windows, Linux)

**Features:**
- Full project and session management
- Custom AI agent creation with sandboxed execution
- Real-time usage analytics dashboards (tokens, costs by project/model/time)
- MCP server management
- Timeline checkpoints for session versioning
- CLAUDE.md file editing
- Process isolation, permission controls
- Local-only data storage, no telemetry

**Does NOT have:** Web-based (desktop only), multi-CLI support, AI workflows, parallel chat mode, prompt templates, code diff viewer.

---

#### 2. CloudCLI (siteboon/claudecodeui)
- **GitHub**: https://github.com/siteboon/claudecodeui
- **Stars**: ~7,900 | **Forks**: ~1,006
- **Stack**: TypeScript (65.8%), JavaScript (31%), HTML, CSS
- **Status**: Very active. Releasing updates daily. CloudCLI Cloud ($7/mo hosted).

**Features:**
- Multi-CLI support (Claude Code, Cursor CLI, Codex, Gemini CLI)
- File explorer with syntax highlighting and live editing
- Git integration (stage, commit, branch switching)
- Integrated shell terminal
- MCP server management through UI
- Multi-session resume and history tracking
- TaskMaster AI integration (Kanban, PRD parsing)
- Cross-platform: desktop, tablet, mobile responsive
- PWA support
- PM2 background service

**Does NOT have:** Cost dashboard/analytics, AI workflows, parallel mode, prompt templates, code diff viewer, session pinning, streaming token counter, repos management.

---

#### 3. CodePilot (op7418/CodePilot)
- **GitHub**: https://github.com/op7418/CodePilot
- **Stars**: ~3,100 | **Forks**: ~236
- **Stack**: Electron + Next.js 16 + Radix UI + Tailwind CSS 4 + SQLite
- **Status**: Very active. Latest release v0.27.0 (March 6, 2026).
- **Platform**: Desktop (macOS arm64/x64, Windows, Linux)

**Features:**
- Model switching mid-conversation (Opus, Sonnet, Haiku)
- Multiple interaction modes (Code, Plan, Ask)
- Permission controls (approve/deny/auto-allow per action)
- Image/vision support (multimodal)
- Live file tree and preview panel
- Token usage tracking (input/output per response)
- MCP server management
- Custom skills (reusable prompt-based commands)
- Slash commands (/help, /clear, /cost, /compact)
- Resizable panels
- Visual settings editor for ~/.claude/settings.json
- Auto-update checking

**Does NOT have:** Web-based (desktop only), parallel mode, AI workflows, cost dashboard with charts, prompt templates with `{{variables}}`, session pinning, repos management.

---

#### 4. Pilot Shell (maxritter/claude-pilot)
- **GitHub**: https://github.com/maxritter/claude-pilot
- **Stars**: ~1,500 | **Forks**: ~123
- **Stack**: CLI + web dashboard hybrid
- **Status**: Active.

**Features:**
- Spec-driven development (plan -> implement -> verify)
- Mandatory TDD with enforced linting/formatting hooks
- Opus for planning + Sonnet for implementation
- Persistent memory across sessions
- Web dashboard for specs, history, metrics
- Worktree isolation
- Quality automation

**Does NOT have:** Full web UI, file explorer, multi-session, analytics dashboard, MCP management.

---

#### 5. CUI — Common Agent UI (wbopan/cui)
- **GitHub**: https://github.com/wbopan/cui
- **Stars**: ~1,100 | **Forks**: ~113
- **Stack**: TypeScript (97.4%)
- **Status**: Last release August 2025.

**Features:**
- Parallel background agents streaming simultaneously
- Task management (fork/archive/resume)
- Zero-downtime resume (session files on disk)
- Push notifications for agent completion
- Voice dictation (Gemini 2.5 Flash)
- Multi-model support
- Auto-scan ~/.claude/ history

**Does NOT have:** File explorer, git integration, analytics, MCP management, cost tracking.

---

#### 6. Sniffly (chiphuyen/sniffly)
- **GitHub**: https://github.com/chiphuyen/sniffly
- **Stars**: ~1,153 | **Forks**: ~102
- **Stack**: CLI + dashboard
- **Status**: Analytics-focused tool, not a full web UI.

**Features:**
- Analytics visualization (cost breakdown, error distribution, interruption rate, tool usage)
- Error pattern analysis ("Content Not Found" is 20-30% of errors)
- Shareable stats with coworkers
- Local log analysis

---

### Tier 2 — Smaller Competitors

#### 7. claude-code-webui (sugyan)
- **GitHub**: https://github.com/sugyan/claude-code-webui
- **Stars**: ~945
- **Status**: Slowing. Last release September 2025.

**Features:** Real-time streaming, permission mode switching, tool management, dark/light theme, mobile responsive, pre-compiled binaries.

---

#### 8. Agentrooms (baryhuang/claude-code-by-agents)
- **GitHub**: https://github.com/baryhuang/claude-code-by-agents
- **Stars**: ~799
- **Status**: Active. Electron desktop app.

**Features:** Multi-agent orchestration with @mentions, local + remote agents on different machines, OAuth authentication, cross-platform.

---

#### 9. claude-run (kamranahmedse)
- **GitHub**: https://github.com/kamranahmedse/claude-run
- **Stars**: ~532
- **Status**: Active. **Read-only** conversation history browser.

**Features:** Session list by recency, project filtering, conversation view with tool calls, real-time SSE streaming, resume command copying.

---

#### 10. Codeman (Ark0N)
- **GitHub**: https://github.com/Ark0N/Codeman
- **Stars**: ~199
- **Status**: Active. Tmux-based.

**Features:** Tmux session management, multi-CLI (Claude Code + OpenCode), QR-code authentication, mobile-optimized, auto-respawn for 24hr autonomous work, up to 20 concurrent sessions, Cloudflare Tunnel.

---

#### 11. claude-code-open (kill136)
- **GitHub**: https://github.com/kill136/claude-code-open
- **Stars**: ~151
- **Status**: Active.

**Features:** Web IDE with Monaco Editor, VS Code-style file tree, 37+ built-in tools, MCP protocol, self-evolution (AI modifies own code), multi-deployment (local, Docker, cloud).

---

#### 12. sunpix/claude-code-web
- **GitHub**: https://github.com/sunpix/claude-code-web
- **Stars**: ~60
- **Status**: Inactive since August 2025.

**Features:** Nuxt 4, voice input (Whisper), text-to-speech, drag-and-drop images, mobile-first PWA, todo sidebar.

---

### Adjacent Tools (Not Direct Competitors)

| Tool | Stars | Purpose |
|------|-------|---------|
| davila7/claude-code-templates | ~22,200 | Plugin dashboard, templates, real-time monitoring |
| automazeio/ccpm | ~7,571 | Project management via GitHub Issues + Git worktrees |
| Claude-Code-Usage-Monitor | ~6,800 | Real-time usage monitoring with ML predictions |
| d-kimuson/claude-code-viewer | ~948 | Web-based session viewer |

---

## Feature Comparison Matrix

| Feature | CodeDeck | Opcode | CloudCLI | CodePilot | Pilot Shell | CUI |
|---------|:----------:|:------:|:--------:|:---------:|:-----------:|:---:|
| **Chat & Streaming** |
| Real-time WebSocket streaming | Yes | Yes | Yes | Yes | -- | Yes |
| Session persistence | Yes | Yes | Yes | Yes | Yes | Yes |
| Session search | Yes | No | No | No | No | No |
| Session pinning | Yes | No | No | No | No | No |
| Session rename | Yes | Yes | Yes | Yes | No | No |
| Auto-generated titles | Yes | No | No | No | No | No |
| Parallel 2x2 chat mode | **Yes** | No | No | No | No | Partial |
| **AI Features** |
| AI workflows (multi-step) | **Yes** | No | No | No | Partial | No |
| Prompt templates with variables | **Yes** | No | No | No | No | No |
| Project commands (`.claude/commands/`) | **Yes** | No | No | No | No | No |
| Project skills (`.claude/skills/`) | **Yes** | No | No | Partial | No | No |
| Per-project system prompts | Yes | No | No | No | No | No |
| Model switching (Opus/Sonnet/Haiku) | **Yes** | No | No | **Yes** | Partial | Yes |
| Plan/Code/Ask modes | **Yes** | No | No | **Yes** | Yes | No |
| Multi-agent/CLI support | No | No | **Yes** | No | No | Yes |
| Image/vision support | **Yes** | No | No | **Yes** | No | No |
| Tips feed (curated + RSS) | **Yes** | No | No | No | No | No |
| Floating assistant bot (linked/free) | **Yes** | No | No | No | No | No |
| Custom AI agents | No | **Yes** | No | No | No | No |
| Voice dictation | No | No | No | No | No | **Yes** |
| **Code & Files** |
| Code diff viewer (LCS-based) | **Yes** | No | No | No | No | No |
| File attachments | Yes | No | Partial | Yes | No | No |
| File explorer / tree panel | **Yes** | No | **Yes** | **Yes** | No | No |
| Live file editing in UI | No | No | **Yes** | No | No | No |
| File preview | **Yes** | No | No | **Yes** | No | No |
| Git integration (stage/commit) | **Yes** | No | **Yes** | No | No | No |
| Repos management (groups, URLs) | **Yes** | No | No | No | No | No |
| **Monitoring & Cost** |
| Cost dashboard with charts | **Yes** | **Yes** | No | No | No | No |
| Per-session cost tracking | **Yes** | **Yes** | No | Partial | Partial | No |
| Input/output token breakdown | **Yes** | **Yes** | No | **Yes** | No | No |
| Streaming token counter | Yes | No | No | No | No | No |
| Analytics (error patterns) | **Yes** | No | No | No | No | No |
| **UI & UX** |
| Dark/light theme | Yes | Yes | No | Yes | No | No |
| Terminal aesthetic | Yes | No | No | No | No | No |
| Syntax highlighting | Yes | No | Yes | Yes | No | No |
| Mermaid diagram rendering | Yes | No | No | No | No | No |
| Copy button on code blocks | Yes | No | No | No | No | No |
| Keyboard shortcuts | Yes | No | No | No | No | No |
| Mobile responsive | No | N/A | **Yes** | N/A | No | No |
| Resizable panels | **Yes** | Yes | No | **Yes** | No | No |
| Export (MD/HTML) | Yes | No | No | No | No | No |
| Push notifications (with sound) | **Yes** | No | No | No | No | **Yes** |
| Offline fallback page | **Yes** | N/A | No | N/A | No | No |
| **Security & Access** |
| Permission/tool approval UI | **Yes** | **Yes** | **Yes** | **Yes** | No | No |
| Authentication | No | N/A | Cloud | N/A | No | No |
| **Infrastructure** |
| MCP server management | **Yes** | **Yes** | **Yes** | **Yes** | No | No |
| PWA / home screen | **Yes** | N/A | **Yes** | N/A | No | No |
| NPX one-command launch | No | No | Yes | No | No | No |
| **Tech** |
| Framework | Vanilla JS | React+Tauri | TypeScript | Electron+Next | CLI+Web | TypeScript |
| npm dependencies | 4 | ~50+ | ~40+ | ~50+ | ~20+ | ~30+ |
| Platform | Web | Desktop | Web+Cloud | Desktop | CLI | Web |

---

## Feature Gap Analysis for CodeDeck

### Completed Since Last Analysis

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Permission/tool approval UI | Done | Three modes, approval modal, queue, `canUseTool` callback |
| 2 | Model switching | Done | Dropdown in header (Opus/Sonnet/Haiku) |
| 3 | Plan mode toggle | Done | Plan/Code/Ask modes |
| 4 | Input/output token capture | Done | Token breakdown in dashboard |
| 5 | File explorer panel | Done | Collapsible tree, search, file preview |
| 6 | Git integration panel | Done | Status, diff, stage, commit in right panel |
| 7 | MCP server management | Done | Add/edit/remove MCP servers via UI |
| 8 | Resizable panels | Done | Drag handles on sidebar and preview pane |
| 9 | Repos management | Done | Groups, URLs, context menus, manual add |
| 10 | Image/vision support | Done | Paste, drag-drop, picker; base64 content blocks; preview strip + chat thumbnails |
| 11 | Push notifications | Done | Browser Notification API for bg session completion/error + permission requests |
| 12 | Notification sound | Done | Two-tone chime (C5→E5) via AudioContext, plays on push + local notifications |
| 13 | PWA offline fallback | Done | Arabic-styled offline page, SW caching strategy, network-first with fallback |
| 14 | Custom Arabic-style logo | Done | SVG bot logo with Islamic geometric patterns, generated PNG icons (192+512) |
| 15 | Error pattern analytics | Done | 9 error categories, timeline, per-tool breakdown, recent errors list |
| 16 | Tips feed panel | Done | Curated AI tips (20 tips, 5 categories) + 8 RSS feeds, tip-of-the-day, category tabs, resize, source links |

### Tier 1 — High Impact (address next)

#### 1. Authentication & Security
**Found in**: Codeman (QR tokens), CloudCLI (cloud auth), Anthropic Remote Control (TLS credentials)
**Current state**: No auth — anyone on the network can access.
**What to build**: Token-based auth middleware. Auto-generate random token on first run. Optional HTTPS.
**Effort**: Low. Express middleware + token generation.
**Priority**: HIGH — security is a prerequisite for any remote/team usage.

#### 2. Mobile Responsive Layout
**Found in**: CloudCLI, Codeman, sugyan/webui, sunpix
**Current state**: Fixed desktop layout. Unusable on mobile.
**What to build**: Responsive breakpoints, collapsible sidebar, full-width chat on mobile, touch targets, bottom nav.
**Effort**: Medium — mostly CSS changes plus sidebar toggle.
**Priority**: HIGH — mobile is table stakes. Anthropic Remote Control targets mobile specifically.

#### ~~3. Image / Vision Support~~ (DONE)
**Found in**: CodePilot, sunpix
**Implemented**: Paste (Cmd+V), drag-and-drop, or image button to attach PNG/JPEG/GIF/WebP. Base64-encoded, sent as SDK image content blocks via async iterable. Thumbnails in preview strip + chat messages. Click-to-expand overlay. 5MB limit. Images saved in DB for session history replay.

#### 4. Push Notifications
**Found in**: CUI
**Current state**: No notifications when background/parallel sessions complete.
**What to build**: Browser Notification API for session completion, error alerts, permission requests.
**Effort**: Low — browser API is simple, just needs integration points.

---

### Tier 2 — Medium Impact

#### 5. Multi-Agent / Agent Teams Support
**Found in**: Agentrooms, CUI, Codeman, CloudCLI (multi-CLI)
**Context**: Anthropic shipped "Agent Teams" with Opus 4.6 (Feb 2026). Multiple Claude agents collaborating is becoming standard.
**What to build**: Agent hierarchy visualization, coordinate multiple sessions working on related tasks, show agent dependencies.
**Effort**: High — requires rethinking session architecture.

#### 6. Voice Input / Dictation
**Found in**: CUI (Gemini 2.5 Flash), sunpix (Whisper)
**What to build**: Microphone button, speech-to-text via Web Speech API or Whisper, insert transcription into chat.
**Effort**: Medium — Web Speech API is built-in to browsers.

#### ~~7. Error Pattern Analytics~~ (DONE)
**Found in**: Sniffly
**Implemented**: SQL CASE-based error categorization into 9 categories (File Not Found, User Denied, Timeout, File State Error, Directory Error, Multiple Matches, Command Not Found, Build/Runtime Error, Other). Analytics dashboard shows 4 new sections: Error Categories (bar chart with percentages), Error Timeline (daily errors over 30 days), Top Failing Tools (per-tool breakdown with category badges), Recent Errors (expandable list of last 20 errors). Error card enhanced with total count + rate + top category. All sections support project filtering.

#### 8. Timeline Checkpoints / Session Versioning
**Found in**: Opcode
**What to build**: Snapshot session state at key points, allow rollback to previous checkpoints.
**Effort**: High — need to capture file system state at each checkpoint.

---

### Tier 3 — Nice to Have

#### 9. NPX One-Command Launch
**What to build**: Publish to npm, support `npx CodeDeck`.
**Effort**: Low.

#### 10. Auto-Update Notifications
**Found in**: CodePilot
**Effort**: Low.

#### 11. Rate Limiting
**Found in**: vultuk/claude-code-web
**Effort**: Low.

#### 12. HTTPS Support
**Effort**: Low.

#### 13. CLAUDE.md Editor
**Found in**: Opcode
**What to build**: Edit CLAUDE.md files directly in the UI.
**Effort**: Low — extend existing file preview to support editing.

#### 14. Multi-CLI Support (Cursor, Codex, Gemini)
**Found in**: CloudCLI, Codeman
**Effort**: High — different SDKs and protocols.

---

## Unique Advantages of CodeDeck

These features are **not found in any competitor** (or found in very few):

| Feature | Description | Found elsewhere? |
|---------|-------------|:----------------:|
| **Parallel 2x2 chat mode** | 4 independent Claude conversations in grid layout | CUI has parallel but no grid |
| **AI workflows** | Multi-step chained prompts (Review PR, Onboard Repo, Migration Plan) | No |
| **Prompt templates with `{{variables}}`** | Fill-in form UI for parameterized prompts | No |
| **Project command/skill discovery** | Auto-reads `.claude/commands/*.md` and `.claude/skills/*/SKILL.md` | No |
| **Code diff viewer** | LCS-based line diff with green/red highlighting | No |
| **Session pinning** | Pin important sessions to sidebar top | No |
| **Streaming token counter** | Live `~N tokens` estimation during streaming | No |
| **Export to MD/HTML** | Download conversation as Markdown or styled HTML | No |
| **Mermaid diagram rendering** | Renders ` ```mermaid ` blocks as SVG inline | No |
| **Repos management** | Grouped repos with URLs, context menus, VS Code integration | No |
| **Per-project system prompts** | Custom system prompts per project | No |
| **Notification audio chime** | Two-tone sound on push/local notifications via AudioContext | No |
| **PWA offline fallback** | Arabic-styled offline page with geometric patterns | No |
| **Custom Arabic-style branding** | Bot logo with Islamic geometric star patterns | No |
| **Tips feed panel** | Inline AI tips + RSS aggregation (8 feeds) with category tabs, tip-of-the-day, source links | No |
| **Floating assistant bot** | Independent chat bubble with custom system prompt, linked/free mode toggle | No |
| **Zero-framework architecture** | Vanilla JS, 4 npm dependencies — lightest footprint | No |
| **Error pattern analytics** | 9-category error classification, timeline, per-tool breakdown, recent errors | Sniffly has CLI-only analysis |
| **Cost dashboard with daily chart** | Full analytics dashboard with bar chart + session table | Opcode has basic analytics |

---

## Implementation Progress

**Last updated**: March 7, 2026
**Completed**: 14 / 14 (Phase 1-3) + 7 / 7 (Phase 5)

### Phase 1 — Quick Wins (Low Effort, High Impact)
- [x] 1. Model switching (dropdown in header)
- [x] 2. Input/output token capture (save from SDK, display in dashboard)
- [x] 3. Plan mode toggle
- [ ] 4. Authentication (token-based middleware)

### Phase 2 — Core Gaps
- [x] 5. **Permission/tool approval UI** — Three modes, approval modal, queue, background session support
- [ ] 6. Mobile responsive CSS
- [x] 7. Image/vision support

### Phase 3 — Power Features
- [x] 8. **File explorer panel** — Tree view, search, file preview with syntax highlighting
- [x] 9. **Git integration panel** — Status, diff, stage, commit in right panel tab
- [x] 10. **MCP server management** — Add/edit/remove MCP servers via UI

### Phase 4 — Distribution & Polish
- [ ] 11. NPX publishing
- [ ] 12. Auto-update notifications
- [ ] 13. Rate limiting
- [ ] 14. HTTPS support

### Phase 5 — New (Based on Competitive Analysis)
- [x] 15. **Resizable panels** — Drag handles on sidebar and preview pane
- [x] 16. **Repos management** — Groups, URLs, context menus, manual add, VS Code integration
- [x] 17. Push notifications (browser Notification API + audio chime)
- [x] 18a. PWA offline fallback (Arabic-styled offline page, SW caching)
- [x] 18b. Custom Arabic-style bot logo (SVG + PNG icons)
- [ ] 18. Voice input / dictation
- [x] 19. **Error pattern analytics** — 9 error categories, timeline, per-tool breakdown, recent errors
- [x] 20. **Tips feed panel** — Curated AI tips + 8 RSS feeds (DEV.to, Substack, Simon Willison), category tabs, tip-of-the-day, source links, resizable
- [ ] 21. CLAUDE.md editor

---

## Recommended Next Features (Priority Order)

Based on competitive gaps and market trends:

1. **Authentication** (Phase 1 #4) — Security prerequisite. Every serious competitor has some form of auth. Low effort, high impact.

2. **Mobile responsive** (Phase 2 #6) — CloudCLI's #1 differentiator. Anthropic Remote Control targets mobile. Table stakes for 2026.

3. ~~**Image/vision support** (Phase 2 #7)~~ — **DONE.** Paste, drag-drop, picker. Base64 content blocks via async iterable.

4. ~~**Push notifications** (#17)~~ — **DONE.** Browser Notification API for bg sessions + permission requests. Enhanced with audio chime and offline fallback page.

5. **NPX publishing** (#11) — CloudCLI, sugyan, and vultuk all offer `npx` launch. Low effort, big distribution win.

---

## Competitive Positioning

### Where CodeDeck leads:
- **Deepest AI features**: Workflows, prompt templates, project commands/skills, parallel mode — no competitor matches this depth
- **Best cost analytics**: Only Opcode comes close, but CodeDeck has daily charts + session-level tracking + streaming counter
- **Most unique features**: 15 features not found in any competitor (see table above)
- **Lightest footprint**: 4 npm deps vs 20-50+ for competitors

### Where CodeDeck trails:
- **No auth/security**: Blocks remote and team usage
- **No mobile support**: CloudCLI, Codeman, sugyan all have responsive layouts
- ~~No image support~~: Now supports multimodal (PNG/JPEG/GIF/WebP via paste, drop, or picker)
- **No multi-CLI**: CloudCLI supports 4 CLIs (Claude, Cursor, Codex, Gemini)
- **No desktop app**: Opcode (20K stars) and CodePilot (3.1K) show demand for native desktop

### Strategic threats:
- **Anthropic Remote Control**: Official mobile/web access. Currently limited (Max-only, no IDE features) but will expand.
- **CloudCLI's growth**: 7.9K stars, multi-CLI, CloudCLI Cloud ($7/mo) — becoming the default web UI.
- **Opcode's dominance**: 20K+ stars, YC-backed — the de facto desktop GUI standard.

### Strategic advantages:
- Zero-framework vanilla JS means faster iteration with no build step
- Unique AI workflow engine is a strong moat
- Cost dashboard fills a gap that even Anthropic doesn't address
- Repos management is a new category no competitor has

---

## Summary

CodeDeck remains the most feature-rich Claude Code web UI in AI-powered features (workflows, parallel mode, prompt templates, project commands, diff viewer). Phase 3 power features (file explorer, git integration, MCP management) are now complete, closing the biggest feature gaps versus CloudCLI and CodePilot. The repos management feature opens a new category. PWA support now includes offline fallback with Arabic-styled branding, notification audio chimes, and a custom bot logo — giving CodeDeck a distinctive identity among competitors. The new tips feed panel adds an AI learning layer unique in the market — curated tips across 5 categories plus 8 live RSS feeds from DEV.to, Substack, and Simon Willison's blog, helping users sharpen their AI skills while working.

**Immediate priorities**: Authentication (#4) to enable remote usage, mobile responsive (#6) to compete with CloudCLI and Anthropic Remote Control.

The biggest strategic question is whether to go deeper on unique AI features (workflows, analytics, repos) or broader on platform coverage (mobile, multi-CLI, desktop app). Given Anthropic's Remote Control and CloudCLI's multi-CLI approach, **doubling down on unique AI features + analytics** is the recommended differentiation strategy, while adding auth and mobile as table-stakes hygiene.

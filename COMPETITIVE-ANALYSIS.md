# Competitive Analysis — Claude Code Web UIs

**Date**: March 2026
**Purpose**: Map the landscape of web-based interfaces for Claude Code and identify feature gaps in shawkat-ai.

---

## Competitors Overview

### 1. claude-code-webui (sugyan)
- **GitHub**: https://github.com/sugyan/claude-code-webui
- **Stack**: Deno/Node.js + Vite + TypeScript
- **Approach**: Lightweight frontend wrapper for Claude CLI
- **License**: MIT

**Features:**
- Real-time streaming responses
- Permission mode switching (normal vs plan mode)
- Project directory selection
- Conversation history browsing
- Tool permission management (granular approve/deny dialogs)
- Dark/light theme with system preference detection
- Mobile-responsive, touch-optimized
- Pre-compiled binary releases (macOS ARM64/x86, Linux, Windows — no Node.js required)
- Custom port, host binding, Claude CLI path override
- Debug mode, MCP config file support
- Local-only default binding (127.0.0.1)

**Does NOT have:** Session persistence, cost tracking, workflows, parallel mode, file attachments, code diff viewer, prompt templates, project commands.

---

### 2. claude-code-web (vultuk)
- **GitHub**: https://github.com/vultuk/claude-code-web
- **Stack**: Node.js + Express + xterm.js (full terminal emulator)
- **Approach**: Terminal emulation in the browser with multi-session management
- **License**: MIT

**Features:**
- Full terminal emulation with ANSI color support via xterm.js
- Multi-session support (create, join, leave, delete)
- Multi-device access (connect to same session from different browsers)
- Session persistence with output buffering (last 1,000 lines)
- VS Code-style split view (drag tabs for side-by-side terminals)
- Token-based authentication (auto-generated, custom, or disabled)
- Rate limiting (100 requests/minute per IP)
- HTTPS support (SSL/TLS with cert/key paths)
- Subscription plan detection (pro, max5, max20)
- Named sessions with custom working directories
- Folder selection/browsing
- Dark/light themes, customizable font size
- Responsive design (desktop + mobile)
- NPX support (`npx claude-code-web` — zero install)
- API endpoints: health, config, sessions, folders

**Does NOT have:** Cost dashboard, AI workflows, parallel mode, project commands/skills, code diff viewer, prompt templates, file attachments, session pinning.

---

### 3. CloudCLI / Claude Code UI (siteboon)
- **GitHub**: https://github.com/siteboon/claudecodeui
- **Stack**: React 18 + Vite + Tailwind CSS + CodeMirror + Express
- **Approach**: Full-featured IDE-like web UI with multi-agent support
- **License**: MIT

**Features:**
- Multi-agent support (Claude Code, Cursor CLI, Codex, Gemini-CLI)
- File explorer with interactive tree, expand/collapse navigation
- Live file editing with syntax highlighting (CodeMirror)
- File operations (create, rename, delete files/directories)
- Git integration (view changes, stage, commit, branch switching)
- Session management (rename, delete, export, cross-device sync)
- Integrated shell terminal
- MCP server integration through UI
- Tool management (disabled by default, selective enabling)
- Mobile responsive with PWA support (home screen shortcut)
- Touch-friendly with swipe gestures, bottom tab bar
- TaskMaster AI integration (optional — PRD parsing, Kanban task boards, dependency management)
- Auto-discovery of CLI sessions
- Project grouping, rename, delete
- PM2 background service support
- Auto-startup on system boot

**Does NOT have:** Cost tracking/dashboard, AI workflows, parallel mode, project commands/skills from `.claude/`, code diff viewer, prompt templates with variables, session pinning, streaming token counter.

---

### 4. CodePilot (op7418)
- **GitHub**: https://github.com/op7418/CodePilot
- **Stack**: Electron + Next.js + SQLite (desktop app)
- **Approach**: Desktop GUI client for Claude Code
- **License**: MIT

**Features:**
- Model switching mid-conversation (Opus, Sonnet, Haiku)
- Multiple interaction modes (Code, Plan, Ask)
- Permission controls (approve/deny/auto-allow per action)
- Image/vision support (multimodal — send images for analysis)
- File and image attachments in chat
- Live file tree display in right panel
- File preview functionality
- Token usage tracking (input/output counts per response)
- Estimated cost calculation per response
- MCP server management (add, configure, remove — stdio/sse/http)
- Custom skills (reusable prompt-based commands, global + per-project)
- Slash commands (/help, /clear, /cost, /compact, /doctor, /review)
- Resizable panels (drag to adjust chat/sidebar/file panels)
- Dark/light theme
- Visual settings editor for ~/.claude/settings.json
- JSON settings editor for advanced users
- Auto-update checking with release notifications
- Local SQLite persistence
- Session create, rename, archive
- Working directory picker per session
- Cross-platform: macOS (arm64/x64), Windows (x64/arm64), Linux (x64/arm64)

**Does NOT have:** Web-based (desktop only), parallel mode, AI workflows (multi-step), cost dashboard with charts, prompt templates with `{{variables}}`, session pinning, streaming token counter.

---

### 5. AgentOS
- **Source**: https://news.ycombinator.com/item?id=46533405
- **Approach**: Self-hosted web UI for managing multiple Claude Code sessions
- **Details**: Limited public documentation. Focused on session orchestration.

---

## Feature Comparison Matrix

| Feature | shawkat-ai | webui | code-web | CloudCLI | CodePilot |
|---------|:----------:|:-----:|:--------:|:--------:|:---------:|
| **Chat & Streaming** |
| Real-time WebSocket streaming | Yes | Yes | Yes | Yes | Yes |
| Session persistence | Yes | No | Yes | Yes | Yes |
| Session search | Yes | No | No | No | No |
| Session pinning | Yes | No | No | No | No |
| Session rename | Yes | No | Yes | Yes | Yes |
| Auto-generated titles | Yes | No | No | No | No |
| Parallel 2x2 chat mode | **Yes** | No | No | No | No |
| **AI Features** |
| AI workflows (multi-step) | **Yes** | No | No | No | No |
| Prompt templates with variables | **Yes** | No | No | No | No |
| Project commands (`.claude/commands/`) | **Yes** | No | No | No | No |
| Project skills (`.claude/skills/`) | **Yes** | No | No | No | Partial |
| Per-project system prompts | Yes | No | No | No | No |
| Model switching (Opus/Sonnet/Haiku) | **Yes** | No | No | No | **Yes** |
| Plan/Code/Ask modes | **Yes** | Yes | No | No | **Yes** |
| Multi-agent (Cursor, Codex, Gemini) | No | No | No | **Yes** | No |
| Image/vision support | No | No | No | No | **Yes** |
| **Code & Files** |
| Code diff viewer (LCS-based) | **Yes** | No | No | No | No |
| File attachments | Yes | No | Partial | Yes | Yes |
| File explorer / tree panel | No | No | No | **Yes** | **Yes** |
| Live file editing in UI | No | No | No | **Yes** | No |
| File preview | No | No | No | No | **Yes** |
| Git integration (stage/commit) | No | No | No | **Yes** | No |
| **Monitoring & Cost** |
| Cost dashboard with charts | **Yes** | No | No | No | No |
| Per-session cost tracking | **Yes** | No | No | No | Partial |
| Input/output token breakdown | **Yes** | No | No | No | **Yes** |
| Streaming token counter | Yes | No | No | No | No |
| **UI & UX** |
| Dark/light theme | Yes | Yes | Yes | No | Yes |
| Terminal aesthetic | Yes | No | Yes | No | No |
| Syntax highlighting | Yes | No | No | Yes | Yes |
| Mermaid diagram rendering | Yes | No | No | No | No |
| Copy button on code blocks | Yes | No | No | No | No |
| Keyboard shortcuts | Yes | No | No | No | No |
| Mobile responsive | No | Yes | Yes | **Yes** | N/A |
| Resizable panels | No | No | No | No | **Yes** |
| Export (MD/HTML) | Yes | No | No | No | No |
| **Security & Access** |
| Permission/tool approval UI | **Yes** | **Yes** | No | **Yes** | **Yes** |
| Authentication (tokens) | No | No | **Yes** | No | N/A |
| HTTPS support | No | No | **Yes** | No | N/A |
| Rate limiting | No | No | **Yes** | No | N/A |
| **Infrastructure** |
| MCP server management | No | No | No | **Yes** | **Yes** |
| Multi-device session access | No | No | **Yes** | Yes | No |
| Binary releases (no Node.js) | No | **Yes** | No | No | **Yes** |
| NPX one-command launch | No | Yes | **Yes** | Yes | No |
| PWA / home screen | No | No | No | **Yes** | N/A |
| Auto-update notifications | No | No | No | No | **Yes** |
| **Tech** |
| Framework | Vanilla JS | Vite+TS | xterm.js | React 18 | Electron+Next |
| npm dependencies | 4 | ~20+ | ~15+ | ~40+ | ~50+ |
| Platform | Web | Web | Web | Web | Desktop |

---

## Feature Gap Analysis for shawkat-ai

### Tier 1 — High Impact (address first)

#### 1. ~~Permission / Tool Approval UI~~ DONE
**Found in**: webui, CloudCLI, CodePilot
**Implemented**: Three permission modes (bypass, confirm writes, confirm all) with approve/deny modal, always-allow per session, background session support, and queued requests for parallel mode. Uses Claude SDK's `canUseTool` callback with WebSocket-based approval flow.

#### 2. Model Switching
**Found in**: CodePilot
**Current state**: Uses whatever model the SDK defaults to.
**What to build**: Dropdown in header or settings to select Opus / Sonnet / Haiku. Pass `model` option to the SDK `query()` call.
**Effort**: Low — SDK supports `model` option, just need a UI selector and pass-through.

#### 3. File Explorer Panel
**Found in**: CloudCLI, CodePilot
**Current state**: File picker exists for attachments (depth 3, max 500) but no persistent tree panel.
**What to build**: Collapsible right-side panel showing project file tree. Click to preview file contents. Could reuse existing `/api/files` endpoint with deeper traversal.
**Effort**: Medium-High — new panel layout, tree component, file preview rendering.

#### 4. Mobile Responsive Layout
**Found in**: webui, CloudCLI, claude-code-web
**Current state**: Fixed desktop layout (272px sidebar, 820px chat). Unusable on mobile.
**What to build**: Responsive breakpoints — collapsible sidebar, full-width chat on mobile, touch-friendly targets, bottom nav bar.
**Effort**: Medium — CSS-only changes plus a sidebar toggle button.

---

### Tier 2 — Medium Impact

#### 5. Image / Vision Support
**Found in**: CodePilot
**Current state**: Only text file attachments. No image upload or paste.
**What to build**: Accept image files (PNG, JPG, etc.) via file picker or paste. Convert to base64, send as content blocks to the SDK. Display images inline in chat.
**Effort**: Medium — SDK supports image content, need upload UI and inline rendering.

#### 6. Git Integration
**Found in**: CloudCLI
**Current state**: No git UI. Users must use `/run git status` etc.
**What to build**: Git panel in sidebar or modal — show status, staged/unstaged files, commit with message, branch switching. Use existing `/api/exec` endpoint.
**Effort**: Medium — UI-heavy, but backend (`/api/exec`) already supports shell commands.

#### 7. Plan Mode Toggle
**Found in**: webui, CodePilot
**Current state**: No concept of plan vs code mode.
**What to build**: Toggle button for interaction mode. In plan mode, Claude creates plans without executing. Could map to SDK's `permissionMode` options.
**Effort**: Low — pass different options to SDK query.

#### 8. Input/Output Token Breakdown
**Found in**: CodePilot
**Current state**: Only `cost_usd` is saved. Token counts are dropped from SDK results.
**What to build**: Capture `input_tokens` and `output_tokens` from SDK results. Save to costs table. Display in cost dashboard and per-message.
**Effort**: Low — data is available in SDK response, just needs capture and display.

#### 9. Authentication
**Found in**: claude-code-web
**Current state**: No auth — anyone on the network can access.
**What to build**: Token-based auth. Auto-generate a random token on first run, require it via header or query param. Optional HTTPS.
**Effort**: Low — Express middleware + token generation.

---

### Tier 3 — Nice to Have

#### 10. MCP Server Management
**Found in**: CloudCLI, CodePilot
**What to build**: UI to view/add/remove MCP servers. Read/write `~/.claude/settings.json`.
**Effort**: Medium.

#### 11. Multi-Agent Support
**Found in**: CloudCLI
**What to build**: Support Cursor CLI, Codex, Gemini alongside Claude.
**Effort**: High — different SDKs and protocols.

#### 12. Resizable Panels
**Found in**: CodePilot
**What to build**: Drag handles on sidebar and (future) file explorer panel.
**Effort**: Low — CSS resize or JS drag handler.

#### 13. NPX One-Command Launch
**What to build**: Publish to npm, support `npx shawkat-ai` for instant use.
**Effort**: Low — package.json `bin` field + publish.

#### 14. Auto-Update Notifications
**Found in**: CodePilot
**What to build**: Check GitHub releases API on startup, show banner if newer version exists.
**Effort**: Low.

#### 15. Multi-Device Session Access
**Found in**: claude-code-web
**What to build**: Sessions already in SQLite. Need auth + session sharing logic.
**Effort**: Medium — depends on auth implementation.

#### 16. Rate Limiting
**Found in**: claude-code-web
**What to build**: Express middleware, per-IP request counting.
**Effort**: Low.

---

## Unique Advantages of shawkat-ai

These features are **not found in any competitor**:

| Feature | Description |
|---------|-------------|
| **Parallel 2x2 chat mode** | Run 4 independent Claude conversations simultaneously in a grid layout |
| **AI workflows** | Multi-step chained prompts (Review PR, Onboard Repo, Migration Plan) with step progress |
| **Cost dashboard** | Full dashboard with daily bar chart, per-session table, summary cards |
| **Project command/skill discovery** | Auto-reads `.claude/commands/*.md` and `.claude/skills/*/SKILL.md` from selected project |
| **Code diff viewer** | LCS-based line diff with green/red highlighting for Edit and Write tool output |
| **Prompt templates with `{{variables}}`** | Fill-in form UI for parameterized prompts |
| **Session pinning** | Pin important sessions to top of sidebar |
| **Streaming token counter** | Live `~N tokens` estimation in header during streaming |
| **Export to MD/HTML** | Download conversation as Markdown or styled HTML |
| **Mermaid diagram rendering** | Renders ` ```mermaid ` blocks as SVG inline |
| **Zero-framework architecture** | Vanilla JS, 4 npm dependencies — lightest footprint by far |

---

## Implementation Progress

**Last updated**: March 3, 2026
**Completed**: 4 / 14

### Phase 1 — Quick Wins (Low Effort, High Impact)
- [x] 1. Model switching (dropdown in header)
- [x] 2. Input/output token capture (save from SDK, display in dashboard)
- [x] 3. Plan mode toggle
- [ ] 4. Authentication (token-based middleware)

### Phase 2 — Core Gaps
- [x] 5. **Permission/tool approval UI** — DONE (three modes, approval modal, queue, background session support, `canUseTool` callback)
- [ ] 6. Mobile responsive CSS
- [ ] 7. Image/vision support

### Phase 3 — Power Features
- [ ] 8. File explorer panel
- [ ] 9. Git integration panel
- [ ] 10. MCP server management

### Phase 4 — Distribution
- [ ] 11. NPX publishing
- [ ] 12. Auto-update notifications
- [ ] 13. Rate limiting
- [ ] 14. HTTPS support

---

## Summary

shawkat-ai is the most feature-rich Claude Code web UI in several dimensions (workflows, parallel mode, cost tracking, project commands, diff viewer). Phase 1 quick wins are nearly complete (model switching, token capture, plan mode all done — auth remaining). The primary remaining gaps are **security/access control** (no auth), **mobile support**, and **IDE-like features** (file explorer, git integration). Next recommended: authentication (Phase 1 #4), then Phase 2 (mobile responsive, image/vision).

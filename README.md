# CodeDeck

A terminal-style web UI for Claude Code. Chat with Claude, run workflows, manage projects, track costs — all from a local browser interface.

```
> claude connected hamed@wakecap.com [max]
```

## Quick Start

```bash
npm install
cp .env.example .env   # configure LINEAR_API_KEY etc.
npm start
# Open http://localhost:9009
```

Requires Node.js 18+ and a valid Claude Code CLI authentication (`claude auth login`). Installable as a PWA from Chrome's address bar.

---

## Technical Stack

| Layer     | Technology                                                        |
| --------- | ----------------------------------------------------------------- |
| Runtime   | Node.js 18+ (ESM)                                                |
| Backend   | Express 4, WebSocket (ws 8), web-push 3, dotenv                  |
| AI SDK    | @anthropic-ai/claude-code ^1                                     |
| Database  | SQLite 3 via better-sqlite3 ^11, WAL mode, prepared statements   |
| Frontend  | Vanilla JavaScript ES modules (no bundler), CSS custom properties |
| PWA       | Web App Manifest, Service Worker (offline fallback + push + caching), standalone display |
| Rendering | highlight.js 11.9 (syntax), Mermaid 10 (diagrams) — both via CDN |

## Architecture

```
browser ──────── WebSocket ──────── server.js ──────── Claude Code SDK
   |                                    |
   ├── js/main.js (entry point)       ├── server/routes/ (15 route modules)
   │   ├── core/                      ├── server/ws-handler.js
   │   │   ├── store.js (reactive)    ├── server/agent-loop.js
   │   │   ├── ws.js (WebSocket)      ├── server/telegram-sender.js
   │   │   ├── api.js (fetch calls)   ├── db.js (SQLite)
   │   │   ├── events.js (event bus)  ├── folders.json (projects)
   │   │   ├── dom.js (DOM refs)      ├── repos.json (repositories)
   │   │   ├── constants.js           ├── prompts.json (16 templates)
   │   │   ├── utils.js               ├── bot-prompt.json (assistant bot prompt)
   │   │   └── plugin-loader.js       ├── agents.json (4 autonomous agents)
   │   ├── ui/   (shared UI modules)  ├── workflows.json (4 workflows)
   │   ├── features/ (chat, sessions) └── telegram-config.json
   │   ├── panels/  (bot, tips, docs)
   │   └── plugins/ (tab-sdk plugins)
   ├── css/
   │   ├── core/       (variables, reset, responsive)
   │   ├── ui/         (messages, sessions, layout)
   │   └── panels/     (bot, tips, docs)
   └── index.html
```

- **WebSocket** streams assistant text, tool calls, and results in real time
- **Reconnect with backoff** — exponential backoff (2s → 4s → 8s → ... → 30s cap, 0-25% jitter), distinct `ws:reconnected` event triggers state sync
- **State sync on reconnect** — reconciles background sessions, resets streaming panes, reloads messages from DB, refreshes session list
- **Modular frontend** — 40+ ES modules organized into `core/`, `ui/`, `features/`, `panels/`, `plugins/` with no bundler
- **Plugin system** — auto-discovery of tab-sdk plugins from `public/js/plugins/` via `GET /api/plugins`; enable/disable/reorder in marketplace UI
- **Reactive store** — centralized pub/sub state management across modules
- **Event bus** — decoupled cross-module communication
- **Modular backend** — 15 Express Router modules + shared WS handler + agent loop + Telegram sender
- **SQLite + WAL** persists sessions, messages, costs, and Claude session mappings
- **Indexed queries** — 6 indexes for fast lookups on messages, costs, sessions
- **Prepared statements** for all DB queries (no SQL injection risk)
- **Session resumption** via stored Claude session IDs (survives page reloads)
- **Stale session auto-retry** — if a Claude session no longer exists, automatically retries without `--resume`
- **SDK stderr capture** — stderr output from Claude CLI is captured and included in error messages for better diagnostics
- **Session ID persistence** — active session saved to `localStorage`, restored on page load with auto-message loading
- **AbortController** for mid-stream cancellation
- **Server-side abort on disconnect** — all active SDK streams are aborted when a client disconnects (no lingering processes)
- **Global active query tracking** — server tracks which sessions have running queries; exposed via `GET /api/sessions/active`
- **Background sessions** — streams continue server-side when switching away; client routes messages by `sessionId`; persisted to `localStorage` and reconciled on reconnect

---

## Database Schema

### sessions
| Column            | Type    | Description                          |
| ----------------- | ------- | ------------------------------------ |
| id                | TEXT PK | UUID                                 |
| claude_session_id | TEXT    | Claude SDK session for resumption    |
| project_name      | TEXT    | Display name                         |
| project_path      | TEXT    | Filesystem path (used as CWD)        |
| title             | TEXT    | Auto-generated or manually edited    |
| pinned            | INTEGER | 0 or 1, pinned sessions sort to top  |
| summary           | TEXT    | AI-generated session summary (via Claude Haiku) |
| created_at        | INTEGER | Unix timestamp                       |
| last_used_at      | INTEGER | Unix timestamp, updated on each use  |

### messages
| Column     | Type    | Description                                    |
| ---------- | ------- | ---------------------------------------------- |
| id         | INTEGER | Auto-increment PK                              |
| session_id | TEXT FK | References sessions.id                         |
| role       | TEXT    | user, assistant, tool, tool_result, result      |
| content    | TEXT    | JSON-serialized payload                        |
| chat_id    | TEXT    | NULL for single mode, chat-0..3 for parallel   |
| created_at | INTEGER | Unix timestamp                                 |

### costs
| Column                | Type    | Description              |
| --------------------- | ------- | ------------------------ |
| id                    | INTEGER | Auto-increment PK        |
| session_id            | TEXT FK | References sessions.id   |
| cost_usd              | REAL    | Cost of this query       |
| duration_ms           | INTEGER | Query wall-clock time    |
| num_turns             | INTEGER | Number of agent turns    |
| input_tokens          | INTEGER | Input token count        |
| output_tokens         | INTEGER | Output token count       |
| model                 | TEXT    | Model used (e.g. claude-sonnet-4-20250514) |
| stop_reason           | TEXT    | Why generation stopped   |
| is_error              | INTEGER | 0 or 1                   |
| cache_read_tokens     | INTEGER | Cache read token count   |
| cache_creation_tokens | INTEGER | Cache creation token count |
| created_at            | INTEGER | Unix timestamp           |

### claude_sessions
| Column            | Type | Description                        |
| ----------------- | ---- | ---------------------------------- |
| session_id        | TEXT | Our session UUID                   |
| chat_id           | TEXT | Parallel pane ID (composite PK)    |
| claude_session_id | TEXT | Claude SDK session ID              |

### push_subscriptions
| Column      | Type    | Description                              |
| ----------- | ------- | ---------------------------------------- |
| endpoint    | TEXT PK | Push service URL (unique per browser)    |
| keys_p256dh | TEXT    | Client public key for encryption         |
| keys_auth   | TEXT    | Client auth secret                       |
| created_at  | INTEGER | Unix timestamp                           |

### todos
| Column      | Type    | Description                            |
| ----------- | ------- | -------------------------------------- |
| id          | INTEGER | Auto-increment PK                      |
| text        | TEXT    | Todo item text                         |
| done        | INTEGER | 0 or 1                                 |
| position    | INTEGER | Sort order (auto-incremented on create)|
| archived    | INTEGER | 0 (active) or 1 (archived)             |
| priority    | INTEGER | 0=none, 1=low, 2=medium, 3=high       |
| created_at  | INTEGER | Unix timestamp                         |
| updated_at  | INTEGER | Unix timestamp                         |

### brags
| Column      | Type    | Description                            |
| ----------- | ------- | -------------------------------------- |
| id          | INTEGER | Auto-increment PK                      |
| todo_id     | INTEGER | References todos.id                    |
| text        | TEXT    | Original todo text (snapshot)          |
| summary     | TEXT    | User-written brag summary (max 500)   |
| created_at  | INTEGER | Unix timestamp                         |

Migrations run automatically on startup (ADD COLUMN with try/catch).

---

## API Endpoints

### Sessions
| Method | Path                        | Description                            |
| ------ | --------------------------- | -------------------------------------- |
| GET    | /api/sessions               | List sessions (filtered by project)    |
| GET    | /api/sessions/search        | Search sessions by title               |
| GET    | /api/sessions/active        | List session IDs with in-flight queries|
| DELETE | /api/sessions/:id           | Delete session + all related data      |
| PUT    | /api/sessions/:id/title     | Rename session                         |
| PUT    | /api/sessions/:id/pin       | Toggle pin/unpin                       |
| POST   | /api/sessions/:id/summary   | Generate/regenerate AI summary         |

### Messages
| Method | Path                              | Description                     |
| ------ | --------------------------------- | ------------------------------- |
| GET    | /api/sessions/:id/messages        | All messages                    |
| GET    | /api/sessions/:id/messages/:chat  | Messages for a parallel pane    |
| GET    | /api/sessions/:id/messages-single | Single-mode messages only       |

### Projects & Configuration
| Method | Path                          | Description                                  |
| ------ | ----------------------------- | -------------------------------------------- |
| GET    | /api/projects                 | List projects from folders.json              |
| POST   | /api/projects                 | Add new project (name + path, validates dir exists, 409 on duplicate) |
| DELETE | /api/projects                 | Remove project by path (entry only, not files)|
| GET    | /api/projects/browse          | Browse server directories (defaults to $HOME, skips hidden dirs) |
| PUT    | /api/projects/system-prompt   | Save per-project system prompt               |
| GET    | /api/projects/commands        | Load commands & skills from project `.claude/`|

### Prompts
| Method | Path                 | Description           |
| ------ | -------------------- | --------------------- |
| GET    | /api/prompts         | List saved prompts    |
| POST   | /api/prompts         | Add new prompt        |
| DELETE | /api/prompts/:index  | Delete prompt         |

### Agents
| Method | Path               | Description                              |
| ------ | ------------------ | ---------------------------------------- |
| GET    | /api/agents        | List autonomous agents from agents.json  |
| GET    | /api/agents/:id    | Get a single agent by ID                 |

### Workflows & Files
| Method | Path               | Description                              |
| ------ | ------------------ | ---------------------------------------- |
| GET    | /api/workflows     | List workflows                           |
| GET    | /api/files         | Recursive file listing (depth 3, max 500)|
| GET    | /api/files/content | Read file content (50KB limit)           |
| PUT    | /api/files/content | Write file content (allowlisted paths only) |
| GET    | /api/files/tree    | Lazy tree listing (immediate children)   |
| GET    | /api/files/search  | Recursive name search (LIKE %query%, max 50) |

### Repos
| Method | Path                   | Description                                      |
| ------ | ---------------------- | ------------------------------------------------ |
| GET    | /api/repos             | Fetch all groups + repos                         |
| POST   | /api/repos/repos       | Add repo (name required, path + url optional, validates .git if path given) |
| PUT    | /api/repos/repos/:id   | Update repo (rename, move to group, set URL)     |
| DELETE | /api/repos/repos/:id   | Remove repo                                      |
| POST   | /api/repos/groups      | Create group (supports nesting via parentId)     |
| PUT    | /api/repos/groups/:id  | Rename or reparent group (circular ref protection)|
| DELETE | /api/repos/groups/:id  | Delete group (children reparented to parent)     |

### MCP Server Management
| Method | Path                    | Description                            |
| ------ | ----------------------- | -------------------------------------- |
| GET    | /api/mcp/servers        | List mcpServers from ~/.claude/settings.json |
| PUT    | /api/mcp/servers/:name  | Create or update MCP server config     |
| DELETE | /api/mcp/servers/:name  | Remove MCP server                      |

### Linear Integration
| Method | Path                              | Description                                      |
| ------ | --------------------------------- | ------------------------------------------------ |
| GET    | /api/linear/issues                | List assigned open issues for the authenticated user |
| GET    | /api/linear/teams                 | List Linear teams                                |
| GET    | /api/linear/teams/:teamId/states  | List workflow states for a team                  |
| POST   | /api/linear/issues                | Create a new issue (title, teamId, description, stateId) |

### Tips Feed
| Method | Path                 | Description                              |
| ------ | -------------------- | ---------------------------------------- |
| GET    | /api/tips            | Serve curated tips + feed definitions    |
| GET    | /api/tips/rss        | Proxy RSS/Atom feed (15-min cache, limit 20 items) |

### Assistant Bot
| Method | Path                 | Description                              |
| ------ | -------------------- | ---------------------------------------- |
| GET    | /api/bot/prompt      | Get bot system prompt from bot-prompt.json |
| PUT    | /api/bot/prompt      | Update bot system prompt                 |

### Todos & Brags
| Method | Path                    | Description                              |
| ------ | ----------------------- | ---------------------------------------- |
| GET    | /api/todos              | List active todos (add `?archived=1` for archived) |
| GET    | /api/todos/counts       | Get counts for active, archived, and brags |
| POST   | /api/todos              | Create todo `{ text }`                   |
| PUT    | /api/todos/:id          | Update todo `{ text?, done?, priority? }`|
| PUT    | /api/todos/:id/archive  | Archive/unarchive `{ archived }`         |
| POST   | /api/todos/:id/brag     | Brag a todo `{ summary }` (max 500 chars, auto-archives) |
| DELETE | /api/todos/:id          | Delete todo                              |
| GET    | /api/todos/brags        | List all brags                           |
| DELETE | /api/todos/brags/:id    | Delete a brag                            |

### Stats & System
| Method | Path                 | Description                              |
| ------ | -------------------- | ---------------------------------------- |
| GET    | /api/stats           | Total + project cost                     |
| GET    | /api/stats/dashboard | Full dashboard (timeline, per-session)   |
| GET    | /api/stats/analytics | Analytics with error patterns, tool usage, trends |
| GET    | /api/account         | Cached account info (email, plan)        |
| POST   | /api/exec            | Execute shell command (30s timeout)      |

### Plugins
| Method | Path                 | Description                              |
| ------ | -------------------- | ---------------------------------------- |
| GET    | /api/plugins         | Auto-discover tab-sdk plugins from public/js/plugins/ |

### Telegram
| Method | Path                    | Description                              |
| ------ | ----------------------- | ---------------------------------------- |
| GET    | /api/telegram/config    | Get Telegram notification config         |
| PUT    | /api/telegram/config    | Update Telegram config (botToken, chatId, enabled) |
| POST   | /api/telegram/test      | Send a test Telegram notification        |

### WebSocket (`/ws`)

**Outgoing** (client to server):
- `{ type: "chat", message, cwd, sessionId, projectName, chatId, permissionMode, model, maxTurns, images?, systemPrompt? }` — send a message (images: `[{ name, data, mimeType }]` base64-encoded; systemPrompt appended to project prompt)
- `{ type: "workflow", workflow, cwd, sessionId, projectName, permissionMode, model }` — run a workflow
- `{ type: "agent", agentId, cwd, sessionId, projectName, permissionMode, model, userContext? }` — run an autonomous agent
- `{ type: "abort", chatId? }` — stop generation
- `{ type: "permission_response", id, behavior }` — approve (`"allow"`) or deny (`"deny"`) a tool call

**Incoming** (server to client):
- `session` — session created/resumed
- `text` — streamed assistant text
- `tool` — tool called (id + name + input)
- `tool_result` — tool execution result (linked to tool by id)
- `result` — query complete (cost, duration, turns)
- `error` / `aborted` / `done` — terminal states
- `workflow_started` / `workflow_step` / `workflow_completed` — workflow progress
- `agent_started` / `agent_progress` / `agent_completed` / `agent_error` / `agent_aborted` — agent lifecycle
- `permission_request` — tool approval needed (id, toolName, input)

All streamed messages include `sessionId` so the client can route background session messages correctly.

---

## Features

### 1. Home Page
The default landing view before selecting a project:
- **AI Activity Grid** — GitHub-style contribution heatmap showing daily AI usage over the past year (green intensity based on query count)
- **Month labels** and day-of-week labels for orientation
- **Legend** — Less/More scale with 5 intensity levels
- **Stat cards** — total sessions, total cost, queries today, active projects
- **Inline Analytics** — embedded analytics dashboard with project filter, daily cost chart, and key metrics
- Selecting a project or session transitions to the chat view; home button returns to this view

### 2. Real-Time Chat
- Bidirectional WebSocket streaming with exponential backoff reconnection
- Single-mode and parallel-mode (2x2 grid) conversations
- Session persistence with message history
- Auto-generated session titles from first message
- Session resumption across page reloads
- Active session persisted to `localStorage` — page refresh returns to the same session with messages auto-loaded
- State sync on reconnect — background sessions reconciled, streaming panes reset, messages reloaded from DB

### 2. Per-Project System Prompts
- Custom instructions per project (stored in folders.json)
- Edit via sidebar gear icon or `/system-prompt` command
- SP badge indicates when a prompt is configured
- Injected into every query for that project
- Hint in modal: if a `CLAUDE.md` file exists in the project root, the SDK includes it automatically

### 3. Add Project via UI
- "+" button in the sidebar project picker opens a folder browser modal
- "Open in VS Code" button in the project selector header — opens the selected project in VS Code
- Server-side directory browsing — navigates the host filesystem (defaults to `$HOME`)
- Clickable breadcrumb path segments for quick navigation up
- Directory list with parent directory (..) navigation
- Hidden directories (`.git`, `.cache`, etc.) are excluded from listing
- Project name auto-populated from the selected folder's basename
- Duplicate path detection (client + server side, 409 response)
- Path validation — server verifies the directory exists via `stat()`
- New project immediately appears in the dropdown and is auto-selected
- Security: resolved paths validated, no traversal beyond filesystem root

### 4. Tool Execution Indicators
- Spinning loader on tool indicators while executing (e.g. Bash, Read, Grep)
- Pulsing left border animation during "running" state
- In-place result update — spinner replaced by checkmark (or X for errors)
- Tool use ID linking — server sends `block.id`, client matches `tool_result` back to the originating indicator
- Result preview shown inline under the tool name (first 150 chars)
- Green/red left border for success/error states
- Expandable body shows full tool input + result
- Saved messages load without spinners (already complete)

### 5. AI Workflows
Four pre-built multi-step workflows:
- **Review PR** — analyze changes, identify issues, suggest improvements
- **Onboard Repo** — map structure, explain architecture, dev guide
- **Migration Plan** — audit deps, assess impact, create plan
- **Code Health** — analyze codebase health, identify tech debt, suggest improvements

Each workflow chains prompts sequentially with context passing and step progress indicators.

### 6. Code Diff Viewer
- LCS-based line diff algorithm for Edit tool output
- Green/red highlighting (additions/removals)
- Additions-only view for Write tool output
- Collapsible tool indicators for other tools

### 7. File Attachments
- File picker modal with recursive tree (depth 3, max 500 files)
- Search/filter files by name
- Multi-select with badge count
- Files prepended as `<file path="...">` blocks
- Attached file paths displayed as pills in user messages (RTL direction so filename is always visible when truncated)
- File paths extracted from saved messages and re-rendered on session replay
- 50KB per-file limit with path traversal protection

### 7b. Image / Vision Support
- Attach images via **image button** (file picker), **paste** (Cmd+V), or **drag-and-drop** onto the message input
- Supported formats: PNG, JPEG, GIF, WebP (Claude API supported types)
- 5MB per-image size limit with user-facing error toast
- **Preview strip** — horizontal thumbnail strip above the input bar with remove (x) buttons
- **Chat display** — image thumbnails rendered inline in user messages
- **Click-to-expand** — click any chat thumbnail for a full-size overlay (click to dismiss)
- **Multimodal SDK integration** — images sent as base64 content blocks via `AsyncIterable<SDKUserMessage>` (async generator)
- **Session history** — images saved in DB message JSON and re-rendered when loading past sessions
- Badge count combines file attachments + image attachments

### 8. Session Management
- Title and project name search with debounced input (200ms)
- Double-click to rename sessions inline
- Pin/unpin sessions (pinned sort to top)
- Delete sessions with cascade (messages, costs, claude mappings)
- Mode detection badges: single, parallel, both

### 9. Cost Dashboard
- Click the cost display in the header to open
- Summary cards: total, project, today
- Per-session cost table (sortable by title, turns, cost)
- Daily cost bar chart (30-day rolling window)

### 9b. Analytics Dashboard (Error Pattern Analytics)
Open via **Tools > Analytics** or `/analytics` slash command. Full analytics with error pattern analysis inspired by Sniffly:
- **Overview cards** — total cost, sessions, queries, turns, output tokens, error count with rate and top category
- **Daily activity** — 30-day bar chart of cost per day
- **Hourly activity** — queries by hour of day
- **Tool usage** — bar chart with per-tool error badges
- **Error Categories** — SQL CASE-based classification into 9 categories: File Not Found, User Denied, Timeout, File State Error, Directory Error, Multiple Matches, Command Not Found, Build/Runtime Error, Other. Red bar chart with percentages
- **Error Timeline** — daily error count over 30 days with red bars
- **Top Failing Tools** — per-tool error breakdown with top 2 error category badges per tool
- **Recent Errors** — scrollable list of last 20 errors with tool name (red), session title, timestamp, and content preview. Click to expand full error text
- **Project filter** — dropdown to scope all sections to a specific project
- Additional sections: project breakdown, top sessions, session depth, message length distribution, top bash commands, top files

### 10. Keyboard Shortcuts
| Shortcut       | Action                    |
| -------------- | ------------------------- |
| `Cmd+K`        | Focus session search      |
| `Cmd+N`        | New session               |
| `Cmd+/`        | Show shortcuts modal      |
| `Cmd+B`        | Toggle right panel        |
| `Cmd+Shift+E`  | Open Files tab            |
| `Cmd+Shift+G`  | Open Git tab              |
| `Cmd+Shift+R`  | Open Repos tab            |
| `Cmd+Shift+V`  | Open Events tab           |
| `Cmd+Shift+T`  | Toggle tips feed          |
| `Cmd+1`–`4`    | Focus parallel pane 1–4   |
| `Escape`       | Close any open modal      |
| `Enter`        | Send message              |
| `Shift+Enter`  | New line in input         |

### 11. Response Formatting
- Syntax highlighting via highlight.js (language auto-detection for all code blocks)
- Code blocks with language header bar (e.g. "JAVASCRIPT", "PYTHON", "BASH") — 50+ language labels
- Copy button in the header bar ("Copied!" feedback)
- Mermaid diagram rendering (```mermaid blocks → SVG)
- Rich markdown: bold, italic, strikethrough, headers (h1–h4 with border styling), inline code (purple with subtle border)
- Unordered and ordered lists with green accent markers
- Blockquotes with green left border and accent background
- Tables with header row, column alignment, and hover highlighting
- Horizontal rules, links (open in new tab)
- User messages styled with "YOU" label badge, blue accent bar and background (distinct from green assistant theme), and attached file path pills

### 12. Export
- `/export md` — download as Markdown
- `/export html` — download as styled HTML document
- `@media print` CSS for clean browser PDF export

### 13. Session Pinning
- Pushpin icon on each session in the sidebar
- Pinned sessions always sort above unpinned
- Toggle via click or `PUT /api/sessions/:id/pin`

### 14. Prompt Variables / Templates
- Prompts with `{{variable}}` placeholders
- Clicking a prompt with variables shows a fill-in form
- Each variable gets a labeled input field
- On submit, variables are replaced and the message is sent
- Works from both toolbox cards and slash commands

### 15. Streaming Token Counter
- `~N tokens` estimation appears in the header during streaming
- Calculates as `chars / 4` (standard estimation)
- Pulsing accent-colored animation
- Auto-hides on stream completion

### 16. Project Commands & Skills
- Recursively reads `.claude/commands/**/*.md` and `.claude/skills/*/SKILL.md` from the selected project
- Registered as slash commands with `project` (red) and `skill` (blue) badges in autocomplete
- Commands with `$ARGUMENTS` wait for user input (e.g. `/deploy testing`)
- Skills with YAML frontmatter are parsed for `name`, `description`, and `argument-hint`
- Commands reload on project switch — each project gets its own set
- Project/skill commands sort first in autocomplete for quick access

### 17. Active Project in Header
- Selected project name displayed bold and centered in the header bar
- Uppercase accent-colored text
- Updates dynamically on project switch

### 18. Dark/Light Theme Toggle
- Sun/moon toggle button in sidebar header
- Dark theme: deep blacks (#050508) with terminal green (#33d17a) accents
- Light theme: warm off-white (#fafaf8) with muted greens
- Persists via `localStorage`
- Switches highlight.js theme (github-dark / github)
- Switches Mermaid theme (dark / default)
- `/theme` slash command

### 19. Permission / Tool Approval
Three permission modes selectable from the header dropdown:
- **Bypass** — all tool calls auto-approved (original behavior)
- **Confirm Writes** (default) — read-only tools (Read, Glob, Grep, WebSearch, etc.) auto-approve; write/execute tools (Bash, Edit, Write, etc.) show an approval modal
- **Confirm All** — every tool call requires manual approval

Approval modal shows:
- Tool name and summary (file path, command, or pattern)
- Collapsible full JSON input
- "Always allow {tool} this session" checkbox — auto-approves that tool for the rest of the session
- Deny (red) and Allow (green) buttons
- Background session badge when the request comes from a backgrounded session

Behavior:
- Multiple permission requests queue up — one modal at a time (important for parallel mode)
- Escape key sends deny response
- Always-allow set is per browser session only (cleared on refresh or `/new`) for security
- 5-minute timeout for unanswered requests
- Mode persisted to `localStorage`
- WebSocket disconnect auto-denies all pending approvals

### 20. PWA / Install as App
- Installable from Chrome's address bar (⊕ icon) on localhost
- Runs in a standalone window (no browser chrome)
- Web App Manifest with app name, theme color, and Whaly icons (192x192 + 512x512)
- **Favicon** — 32x32 Whaly on transparent background (`favicon.png`)
- Service worker with offline fallback — pre-caches offline page and icons; navigation requests fall back to a styled offline page (`offline.html`) when network is unavailable
- Cache-first strategy for static icon assets; network-only for everything else
- Offline page features geometric star pattern and retry button
- Apple touch icon and `apple-mobile-web-app-capable` meta for iOS/Safari

### 21. Background Sessions
When switching sessions or projects while Claude is mid-stream, a confirmation dialog offers three options:
- **Cancel** — stay on the current session, revert the project dropdown
- **Abort Session** — stop generation immediately, then switch
- **Continue in Background** — the stream continues server-side while you work elsewhere

Background session behavior:
- Header indicator shows count of active background sessions with blinking dot (e.g. `1 bg`)
- Session list shows a blinking green dot next to backgrounded sessions
- On completion, a toast notification slides in at the bottom-right with the session title
- Toast does **not** auto-close — click the arrow (→) to switch back, or × to dismiss
- Switching via toast restores the correct project context (dropdown, system prompt, commands)
- All messages are saved to DB during background streaming — nothing is lost
- Background sessions persisted to `localStorage` — survive page refreshes and disconnects
- On WebSocket reconnect, background sessions are reconciled against the server's active query list (`GET /api/sessions/active`). Sessions no longer running get a completion toast; still-active sessions remain in the map
- Server aborts all active SDK streams on client disconnect — no orphaned processes
- Send/Stop buttons and thinking indicators reset correctly when backgrounding

The guard dialog intercepts session clicks, project switches, and the New Session button.

### 22. Linear Integration
Side panel for viewing and creating Linear issues directly from the app:
- **Tasks panel** — top half of the Tasks tab; shows assigned open issues with priority, state, labels, due date
- **Create issue** — modal with title, description, team selector, and workflow state (loaded dynamically per team)
- **Auto-assign** — new issues auto-assigned via `LINEAR_ASSIGNEE_EMAIL` env var
- 60-second client-side cache with manual refresh
- Panel state (open/closed) persisted to `localStorage`
- Requires `LINEAR_API_KEY` env var (gracefully degrades with hint if missing)

### 23. Tabbed Right Panel (with Tab SDK)
The right side of the UI hosts a resizable tabbed panel with built-in and plugin tabs:
- **Tasks** — split view with Linear issues (top) and local Todo list (bottom), separated by a draggable resize handle
- **Files** — file explorer
- **Git** — git integration
- **Repos** — repository management
- **Events** — structured activity log (plugin tab via Tab SDK)
- **"+" button** — opens Developer Documentation, guiding developers to add new tabs

**Tab SDK plugin system** — developers can register new tabs with a single `registerTab()` call in a JS module, with no HTML or `dom.js` changes required:
- `registerTab({ id, title, icon, init(ctx) })` — creates tab button and pane dynamically
- **Context object (ctx)** — provides event bus (`on`/`emit`), reactive store (`getState`/`onState`), API module, badge/title helpers
- **Lifecycle hooks** — `onActivate`, `onDeactivate`, `onDestroy`
- **Lazy initialization** — `lazy: true` defers `init()` until the tab is first opened
- **Positional insert** — `position` option to control tab order
- **Auto-discovery** — drop `.js` + `.css` files in `public/js/plugins/`, server exposes them via `GET /api/plugins`
- **Plugin marketplace** — enable/disable/reorder plugins from the "+" button; state persisted to `localStorage`
- **Built-in plugins**: Tasks (Linear + Todo), Repos, Events, CLAUDE.md Editor, Sudoku, Tic-Tac-Toe

Panel state (open/closed), active tab, and width are persisted to `localStorage`. Resizable by dragging the left edge. Toggle via header button or `Cmd+B`.

### 24. File Explorer
Lazy-loaded tree view in the Files tab:
- **Lazy loading** — root dirs load on tab open; subdirs load on click (cached in memory)
- **Tree items** — chevron (rotates on expand) + folder/file SVG icon + name, indented by depth
- **File preview** — click a file to see syntax-highlighted content in a resizable split preview pane (bottom half, drag handle to resize)
- **Image preview** — image files (png, jpg, gif, svg, webp) render inline via `/api/files/raw` endpoint instead of text
- **Server-side search** — type in the filter input to search file/folder names recursively (LIKE %query%, debounced 250ms, max 50 results)
- **Search results** — flat list with filename prominent + relative path dimmed
- **Refresh button** — clears cache and reloads tree from disk (picks up newly created files)
- **Context menu** — right-click any file/folder for "Copy Full Path" and "Copy Relative Path"
- **Drag to chat** — drag files from the tree into the message input to insert the file path
- Resets on project switch; skips .git, node_modules, dist, build, etc.

### 25. Git Integration
Git panel in the Git tab — all operations via `POST /api/exec`:
- **Branch selector** — dropdown lists all branches, current branch pre-selected, change triggers `git checkout`
- **Status groups** — "Staged Changes", "Changes", "Untracked" with color-coded badges (M/A/D/R/?)
- **Stage/unstage** — click +/- buttons to `git add` or `git reset HEAD` individual files
- **Commit** — textarea + button, shows error feedback, clears on success
- **Log** — last 10 commits with hash (accent), subject, and relative time
- **Refresh** — spinning refresh button reloads branches, status, and log
- Auto-refreshes on tab switch and project switch

### 26. Repos Panel
Repository management panel in the Repos tab — backed by `repos.json`:
- **Groups** — create nested groups as collapsible containers (folder icon + chevron + badge count)
- **Repos** — add repositories with name, local path (optional), and GitHub URL (optional)
- **Two add modes** — "Browse Folder" reuses the folder browser to select a local git repo; "Add Manually" shows an inline form for remote-only repos (no local folder needed)
- **Add to group** — right-click a group → "Add Repo Here (Browse)" or "Add Repo Here (Manual)"
- **Move to group** — right-click a repo → "Move to Group" submenu lists all groups + "Ungrouped"
- **GitHub URL** — right-click a repo → "Set GitHub URL" / "Edit GitHub URL"; once set, "Open in Browser" appears at the top of the context menu
- **Context menus** — repos: Open in Browser, Open in VS Code, Copy Path, Set GitHub URL, Move to Group, Remove; groups: Add Repo Here, Open All in VS Code, Rename, Delete Group
- **Inline editing** — rename groups in-place (click, type, Enter/Escape)
- **Search filter** — debounced (200ms) filter across repo names, paths, and group names
- **Expand/collapse** — group state persisted per group in `localStorage`
- **Double-click** — repos with path open in VS Code; repos with URL only open in browser
- **Delete group** — child groups and repos are reparented to the deleted group's parent
- **Validation** — path checked for `.git` (walks parent dirs for subdirectories), duplicate path detection, circular parent ref protection
- **Keyboard shortcut** — `Cmd+Shift+R` opens Repos tab; `/repos` slash command
- IDs use `g_`/`r_` prefix + `Date.now()`

### 27. MCP Server Management
Modal UI for managing MCP servers in `~/.claude/settings.json`:
- **Server cards** — name, type badge (stdio/sse/http), command/URL detail, edit/delete buttons
- **Add form** — type selector toggles between stdio fields (command, args, env) and URL fields (url, headers)
- **Edit** — pre-fills form, name field disabled
- **Delete** — confirmation dialog
- Open via header MCP button or `/mcp` slash command

### 28. Max Turns Selector
Configurable max turns per query via header dropdown:
- Options: 10, 30 (default), 50, 100, unlimited
- Sent from client to server with each query
- "Unlimited" omits the `maxTurns` option (no cap)
- `error_max_turns` handled gracefully — shows cost summary + "Reached max turns limit (N). Send another message to continue."
- Persisted to `localStorage`

### 29. Session Context Menu
Right-click any session card in the sidebar for developer info:
- Copy Session ID (our internal UUID)
- Copy Claude Session ID (SDK session for `--resume`)
- Copy Project Path
- Copy Title
- Click to copy with "Copied!" confirmation; closes on outside click or Escape

### 30. Header Control Labels
All header dropdowns now have uppercase labels for clarity:
- **approval** — tool approval mode
- **model** — model selector
- **turns** — max turns per query

### 32. Push Notifications
Browser notifications for events that happen while the tab is unfocused, **including when the browser tab is closed**:

**Local notifications** (tab open but unfocused):
- Background session completed — title of the finished session
- Background session error — session title + error message
- Permission request — tool name + background session label (if applicable)

**Web Push notifications** (works even with the tab/browser closed):
- Server sends push via `web-push` library when a chat query or workflow completes
- Uses VAPID keys (auto-generated on first run, saved to `.env`)
- Push subscriptions stored in SQLite (`push_subscriptions` table)
- Service worker `push` event handler checks `clients.matchAll()` — only shows notification when no app window is focused (avoids duplicates with local notifications)
- Stale/expired subscriptions (404/410) auto-cleaned from DB

**Notification sound:**
- Two-tone chime (C5 → E5) plays when notifications fire
- AudioContext created lazily, unlocked on first user click/keypress (browser autoplay policy)
- Client-side notifications play sound directly via `sendNotification()`
- Push notifications trigger sound via service worker `postMessage` to the client page
- OS notification sound suppressed (`silent: true`) to avoid double-chime
- Sound preference stored in `localStorage` (`codedeck-notifications-sound`)

**Setup & testing:**
1. Enable notifications via `/notifications` command or **Tools > Notifications** toggle
2. Accept the browser permission prompt
3. Verify in DevTools → Application → Service Workers → Push subscription exists
4. Start a background session, close/unfocus the tab — notification appears on completion with audio chime
5. Click the notification → app opens/focuses
6. **Important**: macOS users must enable Chrome notifications in **System Settings → Notifications → Google Chrome**

**API endpoints:**
- `GET /api/notifications/vapid-public-key` — returns VAPID public key for client subscription
- `POST /api/notifications/subscribe` — stores PushSubscription in DB
- `POST /api/notifications/unsubscribe` — removes subscription from DB

**General behavior:**
- Toggle via `/notifications` slash command or **Tools > Notifications** in the header dropdown
- Click any notification to focus the app window
- Service worker `notificationclick` handler focuses or opens the app tab
- Preference persisted to `localStorage`
- Dedup tags prevent notification spam (e.g. same session won't stack)
- Graceful degradation: if VAPID keys are missing, push is a no-op; if PushManager is unavailable, local notifications still work

### 34. Tips Feed Panel
Inline tips panel that sits side-by-side with chat messages to help sharpen AI skills while working:
- **Curated tips** — 20 tips across 5 categories: Prompting (`>`), MCP (`#`), Workflows (`~`), Commands (`/`), CLAUDE.md (`@`)
- **Tip of the day** — rotates daily from the curated set, highlighted with accent border
- **RSS feed aggregation** — proxied server-side with 15-min cache, supports RSS 2.0 and Atom formats
- **8 RSS sources**: DEV.to (MCP, AI Agents, Prompting, Claude, LLM, AI), Build to Launch (Substack), Simon Willison's blog
- **Category filter tabs** — click to filter by category, wrapping layout, persisted to `localStorage`
- **External source links** — each tip and RSS item has an external link icon pointing to reference/source URL
- **Resizable** — drag the left edge to resize (260px–600px), width persisted to `localStorage`
- **Toggle**: header lightbulb button, `Cmd+Shift+T`, or `/tips` slash command
- **Parallel mode safety** — auto-closes when entering parallel mode, toggle button disabled
- **State persistence** — open/closed state, category filter, and width all saved to `localStorage`
- Data stored in `public/data/tips.json` (no database), served via `GET /api/tips`
- RSS proxy via `GET /api/tips/rss?url=<encoded>` with regex XML parser (no dependencies)

### 33. Persistent Confirmation Modals
The background-session and permission approval modals are persistent — they can only be dismissed via their action buttons. Overlay clicks, Escape key, and close buttons are disabled to prevent accidental dismissal of critical decisions.

### 35. Context Gauge
A progress bar in the header showing cumulative session token usage against the model's context window (200k default):
- Tracks input, output, cache read, and cache creation tokens across all queries in a session
- Color-coded: green (normal), yellow (>50%), red (>80%)
- Hover tooltip shows token breakdown by category
- Resets on new session, loads from history when switching sessions
- Auto-hidden when no tokens recorded

### 36. Event Stream Panel (Tab SDK Plugin)
A structured activity log registered as a plugin tab via the Tab SDK (`event-stream-tab.js`):
- Logs all tool calls, results, errors, and completion events in real time
- Each event shows timestamp, type badge (TOOL/OK/ERR/DONE), and summary
- Click to expand and see full event details (JSON input, full output)
- Filter by type: All, Tools, Errors, Results
- Search across event text
- Auto-scroll toggle to follow latest events
- Clear button to reset the log
- Loads historical events when switching sessions
- Badge count on tab button showing total events
- Fully self-contained — all DOM built in `init(ctx)`, no HTML template needed
- Open via `Cmd+Shift+V` or `/events`

### 37. AI-Generated Session Summaries
After a query completes, Claude Haiku automatically generates a 1-sentence summary of the conversation:
- Uses the Claude Code SDK with `claude-haiku-4-5-20251001` model (fire-and-forget, ~$0.0001/call)
- Summary stored in `sessions.summary` column
- Hover over a session card in the sidebar to see the summary as a tooltip
- Right-click any session and select "Generate Summary" to manually generate or regenerate
- On-demand endpoint: `POST /api/sessions/:id/summary`
- Graceful degradation: if the API call fails, no crash — just no summary

### 38. Floating Assistant Bot
A floating chat bubble widget (bottom-left corner) that provides a personal AI assistant with its own independent conversation thread:
- **Chat bubble** — 48px circle featuring the Whaly mascot (pixel-art whale), click to expand the bot panel
- **Independent session** — separate from the main chat, per-project session stored in `localStorage`
- **Linked / Free toggle** — switch between "Linked" mode (uses project context, session, and permission mode) and "Free" mode (no project context, bypass permissions, just answers questions)
- **Custom system prompt** — editable via gear icon in the bot header; stored server-side in `bot-prompt.json`; default is an expert prompt engineering assistant
- **REST API** — `GET /api/bot/prompt` and `PUT /api/bot/prompt` for system prompt management
- **Streaming responses** — uses the same WebSocket infrastructure with `chatId: 'assistant-bot'`; main chat ignores bot messages via early return filter
- **Markdown rendering** — full markdown support with merged ordered lists, syntax highlighting, copy buttons
- **Session management** — "New chat" button clears the thread; conversation history loads on panel open
- **Theme compatible** — follows dark/light theme via CSS custom properties
- **Responsive** — desktop: offset by sidebar width; tablet: snaps to left edge; mobile: full-screen panel, bubble hidden when chat is active

### 39. Per-Message Token Breakdown
Result summaries on each message now show input and output tokens separately (`Xk in / Yk out`) instead of a single total, giving better visibility into token distribution per query.

### 40. Local Todo List
A persistent todo list in the bottom half of the Tasks tab, stored in SQLite:
- **Split layout** — Tasks tab is split vertically: Linear issues on top, Todo list on bottom
- **Draggable divider** — 6px drag handle between sections to adjust the split ratio; ratio persisted to `localStorage`
- **Add todos** — click "+" button, type in the input bar, press Enter
- **Toggle done** — checkbox marks items as done (strikethrough + dimmed)
- **Inline edit** — double-click text to edit in place, Enter to save, Escape to cancel
- **Priority levels** — clickable colored dot cycles through 4 levels: none (empty), low (blue), medium (orange), high (red). Color-coded left border on prioritized items
- **Archive** — per-item archive button (box icon) moves completed items out of the active list
- **Archive view** — toggle archive icon in the header to switch between active and archived todos; unarchive button to restore items
- **Brag list** — star button on each todo opens a modal to write a summary (max 500 chars) of what was accomplished. Bragged items are archived and moved to the brag list. Star toggle in header to view all brags with original task text, summary, and date
- **List counts** — header title dynamically shows count for the current view ("Todo (5)", "Archived (2)", "Brags (1)"). Small count badges on archive and brag toggle buttons
- **Delete** — per-item × button to permanently remove
- **Persistent** — todos stored in SQLite `todos` table, brags in `brags` table, survive server restarts
- **Lazy loading** — todos fetched from API when the Tasks tab is first shown

### 41. Autonomous Agents
Four pre-built autonomous agents that run as single high-maxTurns SDK queries (unlike workflows which chain multiple sequential queries):
- **PR Reviewer** — deep code review with actionable feedback
- **Bug Hunter** — scan codebase for bugs, vulnerabilities, and edge cases
- **Test Writer** — generate comprehensive test suites
- **Refactoring Agent** — identify and apply refactoring opportunities

Agent behavior:
- Defined in `agents.json` with goal prompt, constraints (maxTurns, timeoutMs)
- Single `query()` call with high maxTurns allows Claude to autonomously decide tool usage
- Agent panel in the toolbox area with agent cards (icon, title, description)
- Agent header card shows live stats: elapsed time, turn count, status (running/completed/error)
- Slash commands auto-registered: `/agent-pr-reviewer`, `/agent-bug-hunter`, etc.
- AbortController-based timeout and cancellation
- Reuses existing permission system via `makeCanUseTool`
- WebSocket messages: `agent_started`, `agent_progress`, `agent_completed`, `agent_error`, `agent_aborted`
- Panel toggle with mutual exclusion (closes workflow/toolbox panels)

### 42. VS Code-Style Status Bar
A 24px footer bar at the bottom of the page showing key information at a glance:
- **Connection status** — green/red dot with "connected"/"disconnected" label, synced via event bus
- **Git branch** — current branch name with git icon, fetched via `git rev-parse`, click to open Git panel
- **Project** — selected project name with folder icon, synced via MutationObserver on project dropdown, click to focus project selector
- **Activity indicator** — flashes "active" during WebSocket message streaming
- **Background sessions** — count of active background sessions
- **Model** — current model selection with hover tooltip ("Model: controls which Claude model is used"), synced via MutationObserver on header model display, click to open Session dropdown
- **Permission mode** — current permission mode with hover tooltip ("Approval: controls when tool calls require your confirmation"), click to open Session dropdown
- **Max Turns** — current max turns value (or ∞ for unlimited) with hover tooltip ("Max Turns: maximum agentic turns per query"), synced via MutationObserver, click to open Session dropdown
- **Cost** — total session cost, synced via MutationObserver on header cost elements, click to open cost dashboard
- **Tooltips** — model, approval, and max turns items show descriptive tooltips on hover (arrow-pointed, themed)
- All reactive syncing uses MutationObservers to avoid duplicating logic from other modules

### 43. Developer Documentation
An in-app documentation modal for developers extending the application, accessible via **Tools > Dev Docs** or the **"+" button** in the right panel tab bar:
- **Sidebar navigation** — left nav with icons, active state highlighting, extensible section list
- **3 built-in sections**: Tab SDK guide (quick start, config table, ctx reference, lifecycle), Architecture overview (module loading, patterns, events, store keys), Adding Features (step-by-step guides for tabs, API endpoints, DB tables, CSS modules)
- **Extensible** — new sections added via `registerDocSection({ id, title, icon, render })` from any module
- **Cached rendering** — each section's HTML is rendered once and cached
- **Keyboard** — Escape to close, click outside to close
- **Responsive** — sidebar collapses to icon-only on narrow viewports
- Opens directly to Tab SDK section from the "+" button in the right panel

### 44. Telegram Notifications
Push notifications to Telegram as an alternative to browser push:
- **Bot integration** — configure a Telegram bot token and chat ID via **Tools > Telegram** settings modal
- **Event triggers** — notifications sent on chat completion, workflow completion, and agent completion
- **Enable/disable toggle** — per-instance setting stored in `telegram-config.json`
- **Test button** — send a test notification to verify configuration
- **Server-side sender** — `server/telegram-sender.js` uses the Telegram Bot API directly (no dependencies)
- **Graceful degradation** — if not configured, Telegram notifications are silently skipped

### 45. Plugin Marketplace
A built-in marketplace UI for managing tab-sdk plugins:
- **Auto-discovery** — server scans `public/js/plugins/` and exposes `GET /api/plugins` with JS/CSS file paths
- **Marketplace panel** — accessible from the "+" button in the right panel tab bar or the plugin icon
- **Enable/disable** — toggle plugins on/off; state persisted to `localStorage`
- **Reorder tabs** — drag handle to reorder plugin tabs; order persisted to `localStorage`
- **Built-in plugins**: Tasks (Linear + Todo), Repos, Events, CLAUDE.md Editor, Sudoku, Tic-Tac-Toe
- **Hot reload** — enable a plugin and it loads immediately without page refresh; disable removes the tab

### 46. Whaly Mascot & Empty States
The CodeDeck mascot "Whaly" (a pixel-art whale) appears as a friendly placeholder:
- **Chat empty state** — Whaly with floating animation + "start chatting with claude" text when no messages are loaded
- **Assistant bot empty state** — smaller Whaly in the bot panel when no conversation exists
- **Parallel pane empty state** — compact Whaly in each empty pane
- Auto-removed when the first message is added

### 47. Input Bar Meta Labels
Redesigned input bar with contextual meta information:
- **Meta labels row** — displays active model, permission mode, and max turns above the input textarea
- **Compact layout** — labels shown as small pills for at-a-glance context without opening dropdowns
- **Streaming token counter** — moved to the status bar for a cleaner input area

### 48. Session Controls Visibility
Session management controls (search, new session, parallel toggle) are hidden until a project is selected:
- Controls appear automatically when a project is chosen
- Controls hide when project selection is cleared
- Reduces visual noise on the home/empty state

### 49. Mobile Responsive Layout
Full mobile and tablet responsiveness with two breakpoints (CSS-first approach):

**Tablet (≤1024px):**
- Sidebar converts to a fixed overlay that slides in from the left via hamburger menu button
- Semi-transparent backdrop overlay behind sidebar (click to dismiss)
- Auto-close sidebar when selecting a session
- Hide secondary header info (user, plan, project name labels)
- Reduced home page padding

**Mobile (≤640px):**
- Sidebar capped at 85vw width (max 320px)
- Right panel becomes a full-screen overlay
- Compact input bar — toolbox toggle hidden, 16px textarea font (prevents iOS zoom)
- Bottom-sheet style modals and header dropdown menus (slide up from bottom)
- Simplified status bar — hides branch, project, and center section
- Home cards switch to 2-column grid with smaller activity cells
- Touch targets minimum 44px on all interactive elements (Apple HIG)
- Session list items taller with always-visible action buttons
- Tips feed and right panel become full-screen overlays
- Bot bubble hidden when chat is active
- Analytics tables horizontally scrollable
- iOS safe area padding on status bar

**Files:** `css/core/responsive.css` (all media queries), `js/ui/sidebar-toggle.js` (hamburger toggle logic)

### 50. CLAUDE.md Editor Plugin
A Tab SDK plugin for editing CLAUDE.md project files directly in the right panel:
- **In-app editor** — textarea with monospace font for editing the project's `CLAUDE.md` file
- **Save with Cmd+S** — keyboard shortcut and save button with dirty state indicator
- **Reload from disk** — refresh button to re-read the file from the filesystem
- **Project-aware** — automatically reloads when switching projects
- **File dropdown** — selector for supported files (CLAUDE.md, .claude/settings.json)
- **Status feedback** — loading, success, error, and warning indicators
- **Backend security** — allowlisted file paths only; path traversal protection on the write endpoint (`PUT /api/files/content`)
- **Auto-discovered** — plugin loaded automatically from `public/js/plugins/claude-editor-tab.js`

### 51. Enhanced Visual Design
Distinctive typography and visual depth refinements:
- Refined font stacks and type scale for headings, body text, and code
- Visual depth through subtle shadows, border treatments, and layered backgrounds
- Smooth micro-animations on interactive elements
- Cleaned up unused CSS for leaner stylesheets

---

## Slash Commands

### Application
| Command          | Description                    |
| ---------------- | ------------------------------ |
| /clear           | Clear current pane messages    |
| /new             | Start a new session            |
| /parallel        | Toggle parallel mode           |
| /export [md/html]| Download chat                  |
| /help            | Show all commands              |
| /system-prompt   | Edit project system prompt     |
| /attach          | Open file picker               |
| /shortcuts       | Show keyboard shortcuts        |
| /theme           | Toggle dark/light theme        |
| /costs           | Open cost dashboard            |
| /analytics       | Open analytics dashboard       |
| /files           | Open Files tab in right panel  |
| /git             | Open Git tab in right panel    |
| /repos           | Open Repos tab in right panel  |
| /events          | Open Events tab in right panel |
| /mcp             | Open MCP server manager modal  |
| /notifications   | Toggle browser notifications   |
| /tips            | Toggle tips feed panel         |

### CLI
| Command       | Description                     |
| ------------- | ------------------------------- |
| /run `<cmd>`  | Execute shell command on server |

### Workflows
| Command          | Description                     |
| ---------------- | ------------------------------- |
| /review-pr       | Run PR review workflow          |
| /onboard-repo    | Run repo onboarding workflow    |
| /migration-plan  | Run migration planning workflow |
| /code-health     | Run code health analysis workflow |

### Agents
| Command              | Description                     |
| -------------------- | ------------------------------- |
| /agent-pr-reviewer   | Run PR reviewer agent           |
| /agent-bug-hunter    | Run bug hunter agent            |
| /agent-test-writer   | Run test writer agent           |
| /agent-refactoring   | Run refactoring agent           |

### Prompts (16 auto-registered)
| Command            | Description                    |
| ------------------ | ------------------------------ |
| /code-review       | Deep code review               |
| /explain-codebase  | Architecture overview          |
| /find-bugs         | Scan for bugs                  |
| /write-tests       | Generate unit tests            |
| /refactor          | Refactoring suggestions        |
| /security-audit    | OWASP vulnerability check      |
| /performance-check | Performance bottlenecks        |
| /add-types         | TypeScript/JSDoc annotations   |
| /dead-code         | Find unused code               |
| /api-docs          | Generate API documentation     |
| /dependency-check  | Audit dependencies             |
| /error-handling    | Improve error handling         |
| /git-summary       | Summarize recent commits       |
| /todo-cleanup      | Resolve TODOs and FIXMEs       |
| /env-setup         | Verify environment setup       |
| /quick-fix         | Fix linting errors             |

### Project Commands & Skills (auto-discovered)
Loaded from the selected project's `.claude/` directory:
- `.claude/commands/**/*.md` → registered as `project` commands (recursive, nested dirs use `:` separator)
- `.claude/skills/*/SKILL.md` → registered as `skill` commands
- Supports `$ARGUMENTS` for parameterized commands (e.g. `/deploy testing`)
- Reload automatically on project switch

Autocomplete triggers on `/` with keyboard navigation (arrow keys, Tab, Enter). Project commands and skills sort first.

---

## Configuration

### .env — Environment Variables
```bash
PORT=9009                        # Server port (default 9009)
LINEAR_API_KEY=                  # Linear API key for issue integration
LINEAR_ASSIGNEE_EMAIL=           # Auto-assign new issues to this email
VAPID_PUBLIC_KEY=                # Auto-generated on first run if missing
VAPID_PRIVATE_KEY=               # Auto-generated on first run if missing
```
Copy `.env.example` to `.env` and fill in values. The app works without any env vars configured.

### folders.json — Projects
```json
[
  {
    "name": "My Project",
    "path": "/absolute/path/to/project",
    "systemPrompt": "Optional custom instructions for Claude"
  }
]
```

### repos.json — Repository Management
```json
{
  "groups": [
    { "id": "g_1709900000", "name": "Frontend", "parentId": null }
  ],
  "repos": [
    { "id": "r_1709900000", "name": "Web App", "path": "/Users/me/web-app", "groupId": "g_1709900000", "url": "https://github.com/org/web-app" },
    { "id": "r_1709900001", "name": "API Docs", "path": null, "groupId": null, "url": "https://github.com/org/api-docs" }
  ]
}
```
Groups support nesting via `parentId`. Repos can have a local `path`, a `url`, both, or just a name. IDs use `g_`/`r_` prefix + `Date.now()`.

### bot-prompt.json — Assistant Bot System Prompt
```json
{
  "systemPrompt": "You are an expert prompt engineer and AI assistant. Help users craft effective prompts, improve existing ones, and explain prompt engineering techniques. Be concise and actionable."
}
```
Editable via the bot panel's settings gear icon or `PUT /api/bot/prompt`.

### prompts.json — Prompt Templates
```json
[
  {
    "title": "Code Review",
    "description": "Deep review of recent changes",
    "prompt": "Review the codebase for {{concern}}"
  }
]
```
Supports `{{variable}}` placeholders that show a fill-in form.

### workflows.json — Multi-Step Workflows
```json
[
  {
    "id": "review-pr",
    "title": "Review PR",
    "description": "Analyze changes and suggest improvements",
    "steps": [
      { "label": "Analyze", "prompt": "Run git diff and analyze..." },
      { "label": "Issues", "prompt": "Based on your analysis..." },
      { "label": "Improve", "prompt": "Suggest improvements..." }
    ]
  }
]
```

### telegram-config.json — Telegram Notifications
```json
{
  "botToken": "",
  "chatId": "",
  "enabled": false
}
```
Configure via **Tools > Telegram** in the header or edit directly. Requires a Telegram bot token (from @BotFather) and a chat ID.

---

## UI Design

### Terminal Aesthetic
- All-monospace typography (SF Mono, Fira Code, JetBrains Mono)
- Deep black backgrounds with green accent glow
- Subtle CRT scanline overlay (dark mode only)
- Green caret and input text
- Left-border accents on messages, code blocks, and tool indicators
- 4px border radius for sharp terminal feel
- User messages: "YOU" label badge header with blue-dim background, 3px blue left border, distinct from green assistant theme. Attached file paths shown as pill badges
- Assistant messages: clean flowing text with styled headings (h1/h2 with bottom borders), purple inline code, green list markers
- Code blocks: language header bar with uppercase label + copy button, rounded corners, deep background

### Theming
All colors are CSS custom properties on `:root` (defined in `css/variables.css`). The light theme overrides them via `html[data-theme="light"]`. No page reload required.

### Layout
- **Header** (36px): background session indicator, **Session dropdown** (approval, model, max turns submenus), **Tools dropdown** (MCP servers, notifications, Telegram, dev docs), panel toggle — all right-aligned. Active project name centered. Token counter at far right
- **Sidebar** (272px): project selector (with add project button), session controls (search, new session, parallel toggle — hidden until project selected), session list (with right-click context menu)
- **Main area**: messages (820px max-width), input bar (with tooltipped action buttons), toolbox/workflow/agent panels
- **Right panel** (300px, resizable): tabbed container with Tasks (Linear + Todo), Files (explorer + preview), Git (status + commit + log), Repos (repository management), Events (SDK plugin), "+" button (dev docs)
- **Status bar** (24px): connection dot, git branch, project name, activity, background sessions, model (tooltip), permission mode (tooltip), max turns (tooltip), cost — all reactive via MutationObservers and event bus
- **Responsive**: tablet (≤1024px) — sidebar becomes slide-in overlay with hamburger toggle; mobile (≤640px) — right panel and modals become full-screen overlays, bottom-sheet dropdowns, compact input bar, 44px touch targets

---

## File Structure

```
CodeDeck/
├── server.js              Express entry point (~70 lines)
├── db.js                  SQLite layer with indexes + prepared statements
├── .env.example           Environment variable template
├── server/
│   ├── ws-handler.js      WebSocket handler with stale session retry + stderr capture
│   ├── agent-loop.js      Autonomous agent execution (single high-maxTurns query)
│   ├── summarizer.js      AI session summary generation via Claude Haiku
│   ├── push-sender.js     Web Push notification sender
│   ├── telegram-sender.js Telegram Bot API notification sender
│   └── routes/
│       ├── projects.js    Project CRUD + system prompts + commands
│       ├── sessions.js    Session CRUD + pin/unpin
│       ├── messages.js    Message queries (all, by chat, single-mode)
│       ├── prompts.js     Prompt template CRUD
│       ├── stats.js       Cost stats + dashboard + analytics + account info
│       ├── files.js       File listing + content + tree + search
│       ├── workflows.js   Workflow listing
│       ├── exec.js        Shell command execution
│       ├── linear.js      Linear API proxy (issues, teams, states)
│       ├── mcp.js         MCP server CRUD (~/.claude/settings.json)
│       ├── repos.js       Repos CRUD (groups + repos from repos.json)
│       ├── notifications.js Push subscription management + VAPID key
│       ├── tips.js        Tips feed API + RSS proxy (15-min cache)
│       ├── bot.js         Assistant bot system prompt API (GET/PUT)
│       ├── agents.js      Agents listing API
│       ├── todos.js       Todo + brag CRUD (priority, counts, archive)
│       └── telegram.js    Telegram notification config + test
├── package.json           5 runtime dependencies
├── folders.json           Project configurations
├── repos.json             Repository groups + repos
├── prompts.json           16 prompt templates
├── workflows.json         4 multi-step workflows
├── agents.json            4 autonomous agent definitions
├── bot-prompt.json        Assistant bot system prompt
├── telegram-config.json   Telegram notification settings
├── data.db                SQLite database (auto-created)
├── public/data/
│   └── tips.json          20 curated tips + RSS feed definitions
└── public/
    ├── index.html         HTML structure + modals + SW registration
    ├── manifest.json      PWA Web App Manifest
    ├── sw.js              Service worker (offline fallback + push + caching)
    ├── offline.html       Offline fallback page (Arabic geometric design)
    ├── icons/
    │   ├── whaly.png      Whaly mascot (pixel-art whale, source asset)
    │   ├── favicon.png    Browser favicon 32x32 (Whaly, transparent bg)
    │   ├── icon-192.png   PWA icon 192x192 (Whaly on dark bg)
    │   └── icon-512.png   PWA icon 512x512 (Whaly on dark bg)
    ├── style.css          CSS entry point (@import hub)
    ├── css/
    │   ├── core/
    │   │   ├── variables.css      CSS custom properties + light theme
    │   │   ├── reset.css          Box-sizing reset + body
    │   │   └── responsive.css     Mobile/tablet responsive media queries
    │   ├── ui/
    │   │   ├── layout.css         Header bar + main layout
    │   │   ├── sessions.css       Sidebar, session list, session context menu
    │   │   ├── messages.css       Chat area, messages, Whaly placeholder, input bar
    │   │   ├── parallel.css       2x2 chat grid + pane overrides
    │   │   ├── modals.css         Modal overlay + form styles
    │   │   ├── toolbox.css        Toolbox panel + prompt variables form
    │   │   ├── commands.css       Slash autocomplete, CLI output, workflows, diff view
    │   │   ├── file-picker.css    File picker modal + attach badge
    │   │   ├── cost-dashboard.css Cost dashboard cards, table, chart
    │   │   ├── background-sessions.css Confirm dialog, toast notifications
    │   │   ├── permissions.css    Permission modal styles
    │   │   ├── right-panel.css    Tabbed right panel + resize handle
    │   │   ├── file-explorer.css  File tree, search, preview, context menu
    │   │   ├── git-panel.css      Git status, staging, commit, log
    │   │   ├── mcp-manager.css    MCP server modal, cards, form
    │   │   ├── image-attachments.css Image preview strip, thumbnails, overlay
    │   │   ├── context-gauge.css  Context window usage gauge
    │   │   ├── agents.css         Autonomous agent panel + status cards
    │   │   ├── status-bar.css     VS Code-style footer status bar
    │   │   ├── home.css           Home page activity grid + cards
    │   │   ├── theme.css          Scanline overlay, animations, scrollbar
    │   │   └── print.css          Print-friendly styles
    │   └── panels/
    │       ├── assistant-bot.css  Floating bot panel + Whaly bubble
    │       ├── tips-feed.css      Tips feed panel, cards, tabs
    │       ├── dev-docs.css       Developer docs modal + nav
    │       └── telegram.css       Telegram settings modal
    └── js/
        ├── main.js               Entry point — imports all modules
        ├── core/
        │   ├── store.js           Centralized reactive state (pub/sub)
        │   ├── dom.js             DOM element references
        │   ├── constants.js       Shared constants (CHAT_IDS, limits)
        │   ├── events.js          Event bus for cross-module communication
        │   ├── utils.js           Pure utilities (escapeHtml, slugify, etc.)
        │   ├── api.js             All fetch() calls as named async functions
        │   ├── ws.js              WebSocket connection + backoff reconnection
        │   └── plugin-loader.js   Auto-discovery plugin loader + marketplace
        ├── ui/
        │   ├── messages.js        Message rendering + Whaly placeholder
        │   ├── formatting.js      Markdown, syntax highlighting, mermaid
        │   ├── diff.js            LCS-based diff algorithm + diff view
        │   ├── export.js          Export as Markdown / HTML
        │   ├── theme.js           Dark/light theme toggle
        │   ├── commands.js        Slash command registry + autocomplete
        │   ├── parallel.js        Parallel mode (2x2 pane grid)
        │   ├── right-panel.js     Tabbed right panel + resize
        │   ├── tab-sdk.js         Tab SDK — plugin API + marketplace UI
        │   ├── notifications.js   Browser notifications + sound
        │   ├── permissions.js     Permission modes, approval queue
        │   ├── model-selector.js  Model selection (auto/sonnet/opus/haiku)
        │   ├── max-turns.js       Max turns selector
        │   ├── context-gauge.js   Session token usage bar
        │   ├── status-bar.js      VS Code-style footer status bar
        │   ├── input-meta.js      Input bar meta labels (model, mode, turns)
        │   ├── shortcuts.js       Global keyboard shortcuts
        │   └── sidebar-toggle.js  Sidebar hamburger toggle for mobile/tablet
        ├── features/
        │   ├── chat.js            Send/stop logic, WS handler, boot
        │   ├── sessions.js        Session list, search, load, rename
        │   ├── projects.js        Project selection, system prompts
        │   ├── home.js            Home page activity grid + analytics
        │   ├── attachments.js     File picker + attachment management
        │   ├── prompts.js         Prompt toolbox + variable templates
        │   ├── workflows.js       Workflow panel + execution
        │   ├── agents.js          Agent panel + execution + slash commands
        │   ├── cost-dashboard.js  Cost dashboard (cards, table, chart)
        │   └── background-sessions.js Guard switch, bg tracking, toasts
        ├── panels/
        │   ├── assistant-bot.js   Floating bot (Whaly bubble + chat panel)
        │   ├── tips-feed.js       Tips feed panel + RSS rendering
        │   ├── dev-docs.js        Developer documentation modal
        │   ├── file-explorer.js   File tree, lazy loading, search
        │   ├── git-panel.js       Git status, staging, commit, log
        │   └── mcp-manager.js     MCP server CRUD modal
        └── plugins/               Auto-discovered tab-sdk plugins
            ├── tasks-tab.js       Tasks tab (Linear + Todo)
            ├── tasks-tab.css
            ├── repos-tab.js       Repos tab (repository management)
            ├── repos-tab.css
            ├── event-stream-tab.js Event stream (activity log)
            ├── event-stream-tab.css
            ├── sudoku.js          Sudoku game plugin
            ├── sudoku.css
            ├── tic-tac-toe.js     Tic-Tac-Toe game plugin
            ├── tic-tac-toe.css
            ├── claude-editor-tab.js  CLAUDE.md editor plugin
            └── claude-editor-tab.css
```

---

## Security

- **Tool approval** — three permission modes (bypass, confirm writes, confirm all) with approve/deny modal for dangerous tool calls
- **Path traversal protection** on file read and browse endpoints
- **Browse endpoint security** — resolved path validation, hidden directory filtering, directory existence check via `stat()`
- **File size limits** (50KB) on content reading
- **Directory depth limits** (3 levels on listing, 8 levels on search)
- **Skipped directories**: .git, node_modules, dist, build, __pycache__, .venv, coverage, .cache, .turbo, .nyc_output
- **CWD validation** — verifies working directory exists before spawning SDK process (fallback to HOME)
- **CLI timeout**: 30 seconds, 512KB buffer limit
- **Prepared statements**: All SQL queries use parameterized statements
- **CORS**: Not explicitly configured (local-only use)

---

## Data Not Persisted (Known Gaps)

The following data flows through the app at runtime but is **not** saved to the database. These are documented for future improvement.

### SDK Result Fields
| Field | Notes |
| ----- | ----- |
| `model` | Now recorded in costs table |
| `stop_reason` | Now recorded in costs table |
| `cache_read_tokens` | Now recorded in costs table and sent to client for context gauge |
| `cache_creation_tokens` | Now recorded in costs table and sent to client for context gauge |

### Message-Level Data
- **Tool results truncated** to 2,000 characters before saving — full output is lost
- **File attachment metadata** (paths, sizes, count) is never persisted — only injected inline into the prompt
- **Image attachments** are fully persisted (base64 data + mimeType + name) in the user message JSON — images replay correctly from history
- **System prompt at time of message** — the active system prompt is not saved per-message, so historical context is lost if the prompt changes
- **Parallel mode state** — whether a session used single or parallel mode is not stored per-session

### Error & Abort Events
- **Error messages and stack traces** from failed queries are sent to the client but not logged in the database
- **User cancellations** (abort events) are not recorded at all

### Workflow Telemetry
- **Workflow identity** — which workflow was run is not tagged on the resulting messages
- **Step-level data** — which steps completed or failed, per-step timing, and step count are not saved
- Workflow results are saved as regular messages with no workflow metadata

### Client-Side Only (localStorage)
| Key | Data |
| --- | ---- |
| `codedeck-theme` | Dark/light theme preference |
| `codedeck-perm-mode` | Permission mode (bypass / confirmDangerous / confirmAll) |
| `codedeck-model` | Selected model (auto/sonnet/opus/haiku) |
| `codedeck-max-turns` | Max turns per query (10/30/50/100/0) |
| `codedeck-right-panel` | Right panel open/closed state |
| `codedeck-right-panel-tab` | Active right panel tab (tasks/files/git/repos/events + plugin tabs) |
| `codedeck-right-panel-width` | Right panel width in pixels |
| `codedeck-session-id` | Active session ID (restored on page load with auto-message loading) |
| `codedeck-bg-sessions` | Background sessions map (serialized, survives disconnects and page refreshes) |
| `codedeck-cwd` | Last selected project path |
| `codedeck-notifications` | Browser notifications enabled (1/0) |
| `codedeck-notifications-sound` | Notification sound enabled (default on, set to 0 to disable) |
| `codedeck-tips-feed` | Tips feed panel open/closed state (1/0) |
| `codedeck-tips-category` | Active tips category filter (all/prompting/mcp/workflows/commands/claude-md) |
| `codedeck-tips-width` | Tips feed panel width in pixels |
| `codedeck-bot-sessions` | Bot session IDs per project (JSON map: path → UUID, `__free__` for free mode) |
| `codedeck-enabled-plugins` | Enabled plugin names (JSON array) |
| `codedeck-plugin-order` | Plugin tab order (JSON array) |

There is no server-side user preferences table — all client preferences are lost if localStorage is cleared or a different browser is used.

### Performance Metrics
- **Time to first token** — not measured or stored
- **Per-turn latency** — not tracked
- **WebSocket connection health** — reconnect count, downtime duration not logged

---

## License

Private project.

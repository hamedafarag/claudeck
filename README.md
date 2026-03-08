# shawkat-ai

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
   ├── js/main.js (entry point)       ├── server/routes/ (12 route modules)
   │   ├── store.js (reactive state)  ├── server/ws-handler.js
   │   ├── ws.js (WebSocket client)   ├── db.js (SQLite)
   │   ├── api.js (fetch calls)       ├── folders.json (projects)
   │   ├── chat.js, messages.js ...   ├── repos.json (repositories)
   │   └── 30+ more modules           ├── prompts.json (16 templates)
   │                                   ├── bot-prompt.json (assistant bot prompt)
   │                                   └── workflows.json (3 workflows)
   ├── css/ (26 focused stylesheets)
   └── index.html
```

- **WebSocket** streams assistant text, tool calls, and results in real time
- **Reconnect with backoff** — exponential backoff (2s → 4s → 8s → ... → 30s cap, 0-25% jitter), distinct `ws:reconnected` event triggers state sync
- **State sync on reconnect** — reconciles background sessions, resets streaming panes, reloads messages from DB, refreshes session list
- **Modular frontend** — 32+ ES modules (`<script type="module">`) with no bundler
- **Reactive store** — centralized pub/sub state management across modules
- **Event bus** — decoupled cross-module communication
- **Modular backend** — 14 Express Router modules + shared WS handler
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
| Column      | Type    | Description              |
| ----------- | ------- | ------------------------ |
| id          | INTEGER | Auto-increment PK        |
| session_id  | TEXT FK | References sessions.id   |
| cost_usd    | REAL    | Cost of this query       |
| duration_ms | INTEGER | Query wall-clock time    |
| num_turns   | INTEGER | Number of agent turns    |
| created_at  | INTEGER | Unix timestamp           |

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
| created_at  | INTEGER | Unix timestamp                         |
| updated_at  | INTEGER | Unix timestamp                         |

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

### Workflows & Files
| Method | Path               | Description                              |
| ------ | ------------------ | ---------------------------------------- |
| GET    | /api/workflows     | List workflows                           |
| GET    | /api/files         | Recursive file listing (depth 3, max 500)|
| GET    | /api/files/content | Read file content (50KB limit)           |
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

### Todos
| Method | Path                    | Description                              |
| ------ | ----------------------- | ---------------------------------------- |
| GET    | /api/todos              | List active todos (add `?archived=1` for archived) |
| POST   | /api/todos              | Create todo `{ text }`                   |
| PUT    | /api/todos/:id          | Update todo `{ text?, done? }`           |
| PUT    | /api/todos/:id/archive  | Archive/unarchive `{ archived }`         |
| DELETE | /api/todos/:id          | Delete todo                              |

### Stats & System
| Method | Path                 | Description                              |
| ------ | -------------------- | ---------------------------------------- |
| GET    | /api/stats           | Total + project cost                     |
| GET    | /api/stats/dashboard | Full dashboard (timeline, per-session)   |
| GET    | /api/stats/analytics | Analytics with error patterns, tool usage, trends |
| GET    | /api/account         | Cached account info (email, plan)        |
| POST   | /api/exec            | Execute shell command (30s timeout)      |

### WebSocket (`/ws`)

**Outgoing** (client to server):
- `{ type: "chat", message, cwd, sessionId, projectName, chatId, permissionMode, model, maxTurns, images?, systemPrompt? }` — send a message (images: `[{ name, data, mimeType }]` base64-encoded; systemPrompt appended to project prompt)
- `{ type: "workflow", workflow, cwd, sessionId, projectName, permissionMode, model }` — run a workflow
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
- `permission_request` — tool approval needed (id, toolName, input)

All streamed messages include `sessionId` so the client can route background session messages correctly.

---

## Features

### 1. Real-Time Chat
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
Three pre-built multi-step workflows:
- **Review PR** — analyze changes, identify issues, suggest improvements
- **Onboard Repo** — map structure, explain architecture, dev guide
- **Migration Plan** — audit deps, assess impact, create plan

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
- User messages styled with "YOU" label badge, accent bar, and distinct background

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
- Web App Manifest with app name, theme color, and icons (192x192 + 512x512)
- Custom Arabic-style bot logo (SVG source at `icons/logo.svg`, auto-generated PNGs)
- Service worker with offline fallback — pre-caches offline page and icons; navigation requests fall back to a styled offline page (`offline.html`) when network is unavailable
- Cache-first strategy for static icon assets; network-only for everything else
- Offline page features Arabic geometric star pattern, bilingual messaging (English + Arabic), and retry button
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

### 23. Tabbed Right Panel
The right side of the UI hosts a resizable tabbed panel with four tabs:
- **Tasks** — split view with Linear issues (top) and local Todo list (bottom), separated by a draggable resize handle
- **Files** — file explorer
- **Git** — git integration
- **Repos** — repository management

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
- Sound preference stored in `localStorage` (`shawkat-notifications-sound`)

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

### 36. Event Stream Panel
A structured activity log in the right panel's "Events" tab:
- Logs all tool calls, results, errors, and completion events in real time
- Each event shows timestamp, type badge (TOOL/OK/ERR/DONE), and summary
- Click to expand and see full event details (JSON input, full output)
- Filter by type: All, Tools, Errors, Results
- Search across event text
- Auto-scroll toggle to follow latest events
- Clear button to reset the log
- Loads historical events when switching sessions
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
- **Chat bubble** — 48px green circle with robot emoji, click to expand the bot panel
- **Independent session** — separate from the main chat, per-project session stored in `localStorage`
- **Linked / Free toggle** — switch between "Linked" mode (uses project context, session, and permission mode) and "Free" mode (no project context, bypass permissions, just answers questions)
- **Custom system prompt** — editable via gear icon in the bot header; stored server-side in `bot-prompt.json`; default is an expert prompt engineering assistant
- **REST API** — `GET /api/bot/prompt` and `PUT /api/bot/prompt` for system prompt management
- **Streaming responses** — uses the same WebSocket infrastructure with `chatId: 'assistant-bot'`; main chat ignores bot messages via early return filter
- **Markdown rendering** — full markdown support with merged ordered lists, syntax highlighting, copy buttons
- **Session management** — "New chat" button clears the thread; conversation history loads on panel open
- **Theme compatible** — follows dark/light theme via CSS custom properties
- **Responsive** — full-screen on mobile (`<480px`)

### 39. Per-Message Token Breakdown
Result summaries on each message now show input and output tokens separately (`Xk in / Yk out`) instead of a single total, giving better visibility into token distribution per query.

### 40. Local Todo List
A persistent todo list in the bottom half of the Tasks tab, stored in SQLite:
- **Split layout** — Tasks tab is split vertically: Linear issues on top, Todo list on bottom
- **Draggable divider** — 6px drag handle between sections to adjust the split ratio; ratio persisted to `localStorage`
- **Add todos** — click "+" button, type in the input bar, press Enter
- **Toggle done** — checkbox marks items as done (strikethrough + dimmed)
- **Inline edit** — double-click text to edit in place, Enter to save, Escape to cancel
- **Archive** — per-item archive button (box icon) moves completed items out of the active list
- **Archive view** — toggle archive icon in the header to switch between active and archived todos; unarchive button to restore items
- **Delete** — per-item × button to permanently remove
- **Persistent** — todos stored in SQLite `todos` table, survive server restarts
- **Lazy loading** — todos fetched from API when the Tasks tab is first shown

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

---

## UI Design

### Terminal Aesthetic
- All-monospace typography (SF Mono, Fira Code, JetBrains Mono)
- Deep black backgrounds with green accent glow
- Subtle CRT scanline overlay (dark mode only)
- Green caret and input text
- Left-border accents on messages, code blocks, and tool indicators
- 4px border radius for sharp terminal feel
- User messages: "YOU" label badge header with accent-dim background, 3px green left border, secondary background
- Assistant messages: clean flowing text with styled headings (h1/h2 with bottom borders), purple inline code, green list markers
- Code blocks: language header bar with uppercase label + copy button, rounded corners, deep background

### Theming
All colors are CSS custom properties on `:root` (defined in `css/variables.css`). The light theme overrides them via `html[data-theme="light"]`. No page reload required.

### Layout
- **Header** (36px): connection status, background session indicator, **Session dropdown** (approval, model, max turns submenus), **Tools dropdown** (MCP servers, analytics), panel toggle — all right-aligned. Active project name centered. Cost display + token counter at far right
- **Sidebar** (272px): project selector (with add project button), session search, session list (with right-click context menu), parallel toggle
- **Main area**: messages (820px max-width), input bar, toolbox/workflow panels
- **Right panel** (300px, resizable): tabbed container with Tasks (Linear), Files (explorer + preview), Git (status + commit + log), Repos (repository management)

---

## File Structure

```
shawkat-ai/
├── server.js              Express entry point (~70 lines)
├── db.js                  SQLite layer with indexes + prepared statements
├── .env.example           Environment variable template
├── server/
│   ├── ws-handler.js      WebSocket handler with stale session retry + stderr capture
│   ├── summarizer.js      AI session summary generation via Claude Haiku
│   └── routes/
│       ├── projects.js    Project CRUD + system prompts + commands
│       ├── sessions.js    Session CRUD + pin/unpin
│       ├── messages.js    Message queries (all, by chat, single-mode)
│       ├── prompts.js     Prompt template CRUD
│       ├── stats.js       Cost stats + dashboard + account info
│       ├── files.js       File listing + content + tree + search
│       ├── workflows.js   Workflow listing
│       ├── exec.js        Shell command execution
│       ├── linear.js      Linear API proxy (issues, teams, states)
│       ├── mcp.js         MCP server CRUD (~/.claude/settings.json)
│       ├── repos.js       Repos CRUD (groups + repos from repos.json)
│       ├── tips.js        Tips feed API + RSS proxy (15-min cache)
│       └── bot.js         Assistant bot system prompt API (GET/PUT)
├── package.json           5 runtime dependencies
├── folders.json           Project configurations
├── repos.json             Repository groups + repos
├── prompts.json           16 prompt templates
├── workflows.json         3 multi-step workflows
├── bot-prompt.json        Assistant bot system prompt
├── data.db                SQLite database (auto-created)
├── public/data/
│   └── tips.json          20 curated tips + RSS feed definitions
└── public/
    ├── index.html         HTML structure + modals + SW registration
    ├── manifest.json      PWA Web App Manifest
    ├── sw.js              Service worker (offline fallback + push + caching)
    ├── offline.html       Offline fallback page (Arabic geometric design)
    ├── icons/
    │   ├── logo.svg       Source SVG logo (Arabic-style bot)
    │   ├── icon-192.png   App icon 192x192 (generated from logo.svg)
    │   └── icon-512.png   App icon 512x512 (generated from logo.svg)
    ├── style.css          CSS entry point (@import hub)
    ├── css/
    │   ├── variables.css      CSS custom properties + light theme
    │   ├── reset.css          Box-sizing reset + body
    │   ├── layout.css         Header bar + main layout
    │   ├── sessions.css       Sidebar, session list, session context menu
    │   ├── messages.css       Chat area, messages, tools, input bar, code blocks
    │   ├── parallel.css       2x2 chat grid + pane overrides
    │   ├── modals.css         Modal overlay + form styles
    │   ├── toolbox.css        Toolbox panel + prompt variables form
    │   ├── commands.css       Slash autocomplete, CLI output, workflows, diff view
    │   ├── file-picker.css    File picker modal + attach badge
    │   ├── cost-dashboard.css Cost dashboard cards, table, chart
    │   ├── background-sessions.css Confirm dialog, toast notifications, bg indicator
    │   ├── permissions.css    Header control labels + permission modal styles
    │   ├── right-panel.css    Tabbed right panel + resize handle
    │   ├── file-explorer.css  File tree, search, preview, context menu, refresh
    │   ├── repos-panel.css    Repos tree, groups, context menu, manual form
    │   ├── git-panel.css      Git status, staging, commit, log, branches
    │   ├── mcp-manager.css    MCP server modal, cards, form
    │   ├── image-attachments.css Image preview strip, chat thumbnails, overlay
    │   ├── tips-feed.css      Tips feed panel, cards, tabs, resize handle
    │   ├── linear-panel.css   Linear tasks panel + create issue modal
    │   ├── context-gauge.css  Context window usage gauge
    │   ├── event-stream.css   Event stream panel styles
    │   ├── assistant-bot.css  Floating assistant bot panel styles
    │   ├── theme.css          Scanline overlay, animations, scrollbar
    │   └── print.css          Print-friendly styles
    └── js/
        ├── main.js            Entry point — imports all modules, boot sequence
        ├── store.js           Centralized reactive state (pub/sub)
        ├── dom.js             DOM element references
        ├── constants.js       Shared constants (CHAT_IDS, limits)
        ├── events.js          Event bus for cross-module communication
        ├── utils.js           Pure utilities (escapeHtml, slugify, etc.)
        ├── formatting.js      Markdown rendering, syntax highlighting, mermaid
        ├── diff.js            LCS-based diff algorithm + diff view renderer
        ├── export.js          Export as Markdown / HTML
        ├── theme.js           Dark/light theme toggle + persistence
        ├── api.js             All fetch() calls as named async functions
        ├── ws.js              WebSocket connection + exponential backoff reconnection
        ├── commands.js        Slash command registry + autocomplete
        ├── messages.js        Message rendering (user, assistant, tool, status)
        ├── parallel.js        Parallel mode (2x2 pane grid)
        ├── sessions.js        Session list, search, load, delete, rename, context menu
        ├── projects.js        Project selection, system prompts, commands
        ├── attachments.js     File picker + attachment management
        ├── prompts.js         Prompt toolbox + variable templates
        ├── workflows.js       Workflow panel + execution
        ├── cost-dashboard.js  Cost dashboard (cards, table, bar chart)
        ├── notifications.js       Browser notification API + toggle + sound + persistence
        ├── background-sessions.js Guard switch, bg tracking, toasts, indicator
        ├── permissions.js     Permission modes, approval queue, modal logic
        ├── model-selector.js  Model selection dropdown (auto/sonnet/opus/haiku)
        ├── max-turns.js       Max turns selector (10/30/50/100/unlimited)
        ├── right-panel.js     Tabbed right panel (Tasks/Files/Git) + resize
        ├── file-explorer.js   File tree, lazy loading, search, context menu, drag
        ├── repos-panel.js     Repos tree, groups, add/remove, context menus, search
        ├── git-panel.js       Git status, staging, commit, branch, log
        ├── mcp-manager.js     MCP server CRUD modal
        ├── tips-feed.js       Tips feed panel + RSS rendering + resize
        ├── linear-panel.js    Linear tasks panel + create issue modal
        ├── shortcuts.js       Global keyboard shortcuts
        ├── context-gauge.js   Session token usage progress bar
        ├── event-stream.js    Event stream panel (structured activity log)
        ├── assistant-bot.js   Floating assistant bot (chat bubble + panel)
        └── chat.js            Send/stop logic, WS message handler, boot
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
| `model` | Which model was used (e.g. claude-sonnet-4-20250514) is not recorded |
| `stop_reason` | Why generation stopped (end_turn, max_tokens, tool_use) is not logged |

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
| `shawkat-ai-theme` | Dark/light theme preference |
| `shawkat-perm-mode` | Permission mode (bypass / confirmDangerous / confirmAll) |
| `shawkat-model` | Selected model (auto/sonnet/opus/haiku) |
| `shawkat-max-turns` | Max turns per query (10/30/50/100/0) |
| `shawkat-right-panel` | Right panel open/closed state |
| `shawkat-right-panel-tab` | Active right panel tab (tasks/files/git/repos) |
| `shawkat-right-panel-width` | Right panel width in pixels |
| `shawkat-ai-session-id` | Active session ID (restored on page load with auto-message loading) |
| `shawkat-ai-bg-sessions` | Background sessions map (serialized, survives disconnects and page refreshes) |
| `shawkat-ai-cwd` | Last selected project path |
| `shawkat-repos-expanded` | Expanded group IDs in repos panel |
| `shawkat-notifications` | Browser notifications enabled (1/0) |
| `shawkat-notifications-sound` | Notification sound enabled (default on, set to 0 to disable) |
| `shawkat-tips-feed` | Tips feed panel open/closed state (1/0) |
| `shawkat-tips-category` | Active tips category filter (all/prompting/mcp/workflows/commands/claude-md) |
| `shawkat-tips-width` | Tips feed panel width in pixels |
| `shawkat-bot-sessions` | Bot session IDs per project (JSON map: path → UUID, `__free__` for free mode) |
| `shawkat-bot-mode` | Bot context mode (`linked` or `free`) |

There is no server-side user preferences table — all client preferences are lost if localStorage is cleared or a different browser is used.

### Performance Metrics
- **Time to first token** — not measured or stored
- **Per-turn latency** — not tracked
- **WebSocket connection health** — reconnect count, downtime duration not logged

---

## License

Private project.

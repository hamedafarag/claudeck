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
| Backend   | Express 4, WebSocket (ws 8), dotenv                              |
| AI SDK    | @anthropic-ai/claude-code ^1                                     |
| Database  | SQLite 3 via better-sqlite3 ^11, WAL mode, prepared statements   |
| Frontend  | Vanilla JavaScript ES modules (no bundler), CSS custom properties |
| PWA       | Web App Manifest, Service Worker (pass-through), standalone display |
| Rendering | highlight.js 11.9 (syntax), Mermaid 10 (diagrams) — both via CDN |

## Architecture

```
browser ──────── WebSocket ──────── server.js ──────── Claude Code SDK
   |                                    |
   ├── js/main.js (entry point)       ├── server/routes/ (9 route modules)
   │   ├── store.js (reactive state)  ├── server/ws-handler.js
   │   ├── ws.js (WebSocket client)   ├── db.js (SQLite)
   │   ├── api.js (fetch calls)       ├── folders.json (projects)
   │   ├── chat.js, messages.js ...   ├── prompts.json (16 templates)
   │   └── 19 more modules            └── workflows.json (3 workflows)
   ├── css/ (16 focused stylesheets)
   └── index.html
```

- **WebSocket** streams assistant text, tool calls, and results in real time
- **Reconnect with backoff** — exponential backoff (2s → 4s → 8s → ... → 30s cap, 0-25% jitter), distinct `ws:reconnected` event triggers state sync
- **State sync on reconnect** — reconciles background sessions, resets streaming panes, reloads messages from DB, refreshes session list
- **Modular frontend** — 26 ES modules (`<script type="module">`) with no bundler
- **Reactive store** — centralized pub/sub state management across modules
- **Event bus** — decoupled cross-module communication
- **Modular backend** — 9 Express Router modules + shared WS handler
- **SQLite + WAL** persists sessions, messages, costs, and Claude session mappings
- **Indexed queries** — 6 indexes for fast lookups on messages, costs, sessions
- **Prepared statements** for all DB queries (no SQL injection risk)
- **Session resumption** via stored Claude session IDs (survives page reloads)
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

### Linear Integration
| Method | Path                              | Description                                      |
| ------ | --------------------------------- | ------------------------------------------------ |
| GET    | /api/linear/issues                | List assigned open issues for the authenticated user |
| GET    | /api/linear/teams                 | List Linear teams                                |
| GET    | /api/linear/teams/:teamId/states  | List workflow states for a team                  |
| POST   | /api/linear/issues                | Create a new issue (title, teamId, description, stateId) |

### Stats & System
| Method | Path                 | Description                              |
| ------ | -------------------- | ---------------------------------------- |
| GET    | /api/stats           | Total + project cost                     |
| GET    | /api/stats/dashboard | Full dashboard (timeline, per-session)   |
| GET    | /api/account         | Cached account info (email, plan)        |
| POST   | /api/exec            | Execute shell command (30s timeout)      |

### WebSocket (`/ws`)

**Outgoing** (client to server):
- `{ type: "chat", message, cwd, sessionId, projectName, chatId, permissionMode }` — send a message
- `{ type: "workflow", workflow, cwd, sessionId, projectName, permissionMode }` — run a workflow
- `{ type: "abort", chatId? }` — stop generation
- `{ type: "permission_response", id, behavior }` — approve (`"allow"`) or deny (`"deny"`) a tool call

**Incoming** (server to client):
- `session` — session created/resumed
- `text` — streamed assistant text
- `tool` — tool called (name + input)
- `tool_result` — tool execution result
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

### 3. AI Workflows
Three pre-built multi-step workflows:
- **Review PR** — analyze changes, identify issues, suggest improvements
- **Onboard Repo** — map structure, explain architecture, dev guide
- **Migration Plan** — audit deps, assess impact, create plan

Each workflow chains prompts sequentially with context passing and step progress indicators.

### 4. Code Diff Viewer
- LCS-based line diff algorithm for Edit tool output
- Green/red highlighting (additions/removals)
- Additions-only view for Write tool output
- Collapsible tool indicators for other tools

### 5. File Attachments
- File picker modal with recursive tree (depth 3, max 500 files)
- Search/filter files by name
- Multi-select with badge count
- Files prepended as `<file path="...">` blocks
- 50KB per-file limit with path traversal protection

### 6. Session Management
- Title search with debounced input (200ms)
- Double-click to rename sessions inline
- Pin/unpin sessions (pinned sort to top)
- Delete sessions with cascade (messages, costs, claude mappings)
- Mode detection badges: single, parallel, both

### 7. Cost Dashboard
- Click the cost display in the header to open
- Summary cards: total, project, today
- Per-session cost table (sortable by title, turns, cost)
- Daily cost bar chart (30-day rolling window)

### 8. Keyboard Shortcuts
| Shortcut     | Action                    |
| ------------ | ------------------------- |
| `Cmd+K`      | Focus session search      |
| `Cmd+N`      | New session               |
| `Cmd+/`      | Show shortcuts modal      |
| `Cmd+1`–`4`  | Focus parallel pane 1–4   |
| `Escape`     | Close any open modal      |
| `Enter`      | Send message              |
| `Shift+Enter`| New line in input         |

### 9. Response Formatting
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

### 10. Export
- `/export md` — download as Markdown
- `/export html` — download as styled HTML document
- `@media print` CSS for clean browser PDF export

### 11. Session Pinning
- Pushpin icon on each session in the sidebar
- Pinned sessions always sort above unpinned
- Toggle via click or `PUT /api/sessions/:id/pin`

### 12. Prompt Variables / Templates
- Prompts with `{{variable}}` placeholders
- Clicking a prompt with variables shows a fill-in form
- Each variable gets a labeled input field
- On submit, variables are replaced and the message is sent
- Works from both toolbox cards and slash commands

### 13. Streaming Token Counter
- `~N tokens` estimation appears in the header during streaming
- Calculates as `chars / 4` (standard estimation)
- Pulsing accent-colored animation
- Auto-hides on stream completion

### 15. Project Commands & Skills
- Recursively reads `.claude/commands/**/*.md` and `.claude/skills/*/SKILL.md` from the selected project
- Registered as slash commands with `project` (red) and `skill` (blue) badges in autocomplete
- Commands with `$ARGUMENTS` wait for user input (e.g. `/deploy testing`)
- Skills with YAML frontmatter are parsed for `name`, `description`, and `argument-hint`
- Commands reload on project switch — each project gets its own set
- Project/skill commands sort first in autocomplete for quick access

### 16. Active Project in Header
- Selected project name displayed bold and centered in the header bar
- Uppercase accent-colored text
- Updates dynamically on project switch

### 17. Dark/Light Theme Toggle
- Sun/moon toggle button in sidebar header
- Dark theme: deep blacks (#050508) with terminal green (#33d17a) accents
- Light theme: warm off-white (#fafaf8) with muted greens
- Persists via `localStorage`
- Switches highlight.js theme (github-dark / github)
- Switches Mermaid theme (dark / default)
- `/theme` slash command

### 18. Permission / Tool Approval
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

### 19. PWA / Install as App
- Installable from Chrome's address bar (⊕ icon) on localhost
- Runs in a standalone window (no browser chrome)
- Web App Manifest with app name, theme color, and icons (192x192 + 512x512)
- Minimal service worker with fetch pass-through (no offline caching — localhost app)
- Apple touch icon and `apple-mobile-web-app-capable` meta for iOS/Safari

### 20. Background Sessions
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

### 21. Linear Integration
Side panel for viewing and creating Linear issues directly from the app:
- **Tasks panel** — toggle via header button; shows assigned open issues with priority, state, labels, due date
- **Create issue** — modal with title, description, team selector, and workflow state (loaded dynamically per team)
- **Auto-assign** — new issues auto-assigned via `LINEAR_ASSIGNEE_EMAIL` env var
- 60-second client-side cache with manual refresh
- Panel state (open/closed) persisted to `localStorage`
- Requires `LINEAR_API_KEY` env var (gracefully degrades with hint if missing)

### 22. Persistent Confirmation Modals
The background-session and permission approval modals are persistent — they can only be dismissed via their action buttons. Overlay clicks, Escape key, and close buttons are disabled to prevent accidental dismissal of critical decisions.

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
- **Header** (36px): connection status, background session indicator, permission mode selector, account info, active project name (centered), cost display, token counter
- **Sidebar** (272px): project selector, session search, session list, parallel toggle
- **Main area**: messages (820px max-width), input bar, toolbox/workflow panels

---

## File Structure

```
shawkat-ai/
├── server.js              Express entry point (~70 lines)
├── db.js                  SQLite layer with indexes + prepared statements
├── .env.example           Environment variable template
├── server/
│   ├── ws-handler.js      WebSocket handler with shared processSdkStream()
│   └── routes/
│       ├── projects.js    Project CRUD + system prompts + commands
│       ├── sessions.js    Session CRUD + pin/unpin
│       ├── messages.js    Message queries (all, by chat, single-mode)
│       ├── prompts.js     Prompt template CRUD
│       ├── stats.js       Cost stats + dashboard + account info
│       ├── files.js       File listing + content reading
│       ├── workflows.js   Workflow listing
│       ├── exec.js        Shell command execution
│       └── linear.js      Linear API proxy (issues, teams, states)
├── package.json           5 dependencies
├── folders.json           Project configurations
├── prompts.json           16 prompt templates
├── workflows.json         3 multi-step workflows
├── data.db                SQLite database (auto-created)
└── public/
    ├── index.html         HTML structure + modals + SW registration
    ├── manifest.json      PWA Web App Manifest
    ├── sw.js              Service worker (fetch pass-through)
    ├── icons/
    │   ├── icon-192.png   App icon 192x192
    │   └── icon-512.png   App icon 512x512
    ├── style.css          CSS entry point (@import hub)
    ├── css/
    │   ├── variables.css      CSS custom properties + light theme
    │   ├── reset.css          Box-sizing reset + body
    │   ├── layout.css         Header bar + main layout
    │   ├── sessions.css       Sidebar, folder picker, session list, mode toggle
    │   ├── messages.css       Chat area, messages, tools, input bar, code blocks
    │   ├── parallel.css       2x2 chat grid + pane overrides
    │   ├── modals.css         Modal overlay + form styles
    │   ├── toolbox.css        Toolbox panel + prompt variables form
    │   ├── commands.css       Slash autocomplete, CLI output, workflows, diff view
    │   ├── file-picker.css    File picker modal + attach badge
    │   ├── cost-dashboard.css Cost dashboard cards, table, chart
    │   ├── background-sessions.css Confirm dialog, toast notifications, bg indicator
    │   ├── permissions.css    Permission modal + mode selector styles
    │   ├── linear-panel.css   Linear tasks panel + create issue modal
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
        ├── sessions.js        Session list, search, load, delete, rename
        ├── projects.js        Project selection, system prompts, commands
        ├── attachments.js     File picker + attachment management
        ├── prompts.js         Prompt toolbox + variable templates
        ├── workflows.js       Workflow panel + execution
        ├── cost-dashboard.js  Cost dashboard (cards, table, bar chart)
        ├── background-sessions.js Guard switch, bg tracking, toasts, indicator
        ├── permissions.js     Permission modes, approval queue, modal logic
        ├── linear-panel.js    Linear tasks panel + create issue modal
        ├── shortcuts.js       Global keyboard shortcuts
        ├── model-selector.js  Model selection dropdown (auto/sonnet/opus/haiku)
        └── chat.js            Send/stop logic, WS message handler, boot
```

---

## Security

- **Tool approval** — three permission modes (bypass, confirm writes, confirm all) with approve/deny modal for dangerous tool calls
- **Path traversal protection** on file read endpoint
- **File size limits** (50KB) on content reading
- **Directory depth limits** (3 levels) on file listing
- **Skipped directories**: .git, node_modules, dist, build, __pycache__, .venv, coverage
- **CLI timeout**: 30 seconds, 512KB buffer limit
- **Prepared statements**: All SQL queries use parameterized statements
- **CORS**: Not explicitly configured (local-only use)

---

## Data Not Persisted (Known Gaps)

The following data flows through the app at runtime but is **not** saved to the database. These are documented for future improvement.

### SDK Result Fields
| Field | Notes |
| ----- | ----- |
| `input_tokens` / `output_tokens` | Only `cost_usd` is saved — raw token counts are dropped |
| `model` | Which model was used (e.g. claude-sonnet-4-20250514) is not recorded |
| `stop_reason` | Why generation stopped (end_turn, max_tokens, tool_use) is not logged |

### Message-Level Data
- **Tool results truncated** to 2,000 characters before saving — full output is lost
- **File attachment metadata** (paths, sizes, count) is never persisted — only injected inline into the prompt
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
| `shawkat-linear-panel` | Linear panel open/closed state |
| `shawkat-ai-session-id` | Active session ID (restored on page load with auto-message loading) |
| `shawkat-ai-bg-sessions` | Background sessions map (serialized, survives disconnects and page refreshes) |
| `shawkat-ai-cwd` | Last selected project path |

There is no server-side user preferences table — all client preferences are lost if localStorage is cleared or a different browser is used.

### Performance Metrics
- **Time to first token** — not measured or stored
- **Per-turn latency** — not tracked
- **WebSocket connection health** — reconnect count, downtime duration not logged

---

## License

Private project.

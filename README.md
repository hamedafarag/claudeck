# shawkat-ai

A terminal-style web UI for Claude Code. Chat with Claude, run workflows, manage projects, track costs — all from a local browser interface.

```
> claude connected hamed@wakecap.com [max]
```

## Quick Start

```bash
npm install
npm start
# Open http://localhost:9009
```

Requires Node.js 18+ and a valid Claude Code CLI authentication (`claude auth login`).

---

## Technical Stack

| Layer     | Technology                                                        |
| --------- | ----------------------------------------------------------------- |
| Runtime   | Node.js 18+ (ESM)                                                |
| Backend   | Express 4, WebSocket (ws 8)                                      |
| AI SDK    | @anthropic-ai/claude-code ^1                                     |
| Database  | SQLite 3 via better-sqlite3 ^11, WAL mode, prepared statements   |
| Frontend  | Vanilla JavaScript (no frameworks), CSS custom properties         |
| Rendering | highlight.js 11.9 (syntax), Mermaid 10 (diagrams) — both via CDN |

## Architecture

```
browser ──────── WebSocket ──────── server.js ──────── Claude Code SDK
   |                                    |
   ├── app.js (2,300 lines)           ├── db.js (SQLite)
   ├── style.css (1,950 lines)        ├── folders.json (projects)
   └── index.html                      ├── prompts.json (16 templates)
                                       └── workflows.json (3 workflows)
```

- **WebSocket** streams assistant text, tool calls, and results in real time
- **SQLite + WAL** persists sessions, messages, costs, and Claude session mappings
- **Prepared statements** for all DB queries (no SQL injection risk)
- **Session resumption** via stored Claude session IDs (survives page reloads)
- **AbortController** for mid-stream cancellation

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
| Method | Path                        | Description                          |
| ------ | --------------------------- | ------------------------------------ |
| GET    | /api/sessions               | List sessions (filtered by project)  |
| GET    | /api/sessions/search        | Search sessions by title             |
| DELETE | /api/sessions/:id           | Delete session + all related data    |
| PUT    | /api/sessions/:id/title     | Rename session                       |
| PUT    | /api/sessions/:id/pin       | Toggle pin/unpin                     |

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

### Stats & System
| Method | Path                 | Description                              |
| ------ | -------------------- | ---------------------------------------- |
| GET    | /api/stats           | Total + project cost                     |
| GET    | /api/stats/dashboard | Full dashboard (timeline, per-session)   |
| GET    | /api/account         | Cached account info (email, plan)        |
| POST   | /api/exec            | Execute shell command (30s timeout)      |

### WebSocket (`/ws`)

**Outgoing** (client to server):
- `{ type: "chat", message, cwd, sessionId, projectName, chatId }` — send a message
- `{ type: "workflow", workflow, cwd, sessionId, projectName }` — run a workflow
- `{ type: "abort", chatId? }` — stop generation

**Incoming** (server to client):
- `session` — session created/resumed
- `text` — streamed assistant text
- `tool` — tool called (name + input)
- `tool_result` — tool execution result
- `result` — query complete (cost, duration, turns)
- `error` / `aborted` / `done` — terminal states
- `workflow_started` / `workflow_step` / `workflow_completed` — workflow progress

---

## Features

### 1. Real-Time Chat
- Bidirectional WebSocket streaming
- Single-mode and parallel-mode (2x2 grid) conversations
- Session persistence with message history
- Auto-generated session titles from first message
- Session resumption across page reloads

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
- Syntax highlighting via highlight.js (language auto-detection)
- Copy button on every code block ("Copied!" feedback)
- Mermaid diagram rendering (```mermaid blocks → SVG)
- Markdown: bold, italic, headers, inline code, code blocks

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
- Automatically reads `.claude/commands/*.md` and `.claude/skills/*/SKILL.md` from the selected project
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
- `.claude/commands/*.md` → registered as `project` commands
- `.claude/skills/*/SKILL.md` → registered as `skill` commands
- Supports `$ARGUMENTS` for parameterized commands (e.g. `/deploy testing`)
- Reload automatically on project switch

Autocomplete triggers on `/` with keyboard navigation (arrow keys, Tab, Enter). Project commands and skills sort first.

---

## Configuration

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

### Theming
All colors are CSS custom properties on `:root`. The light theme overrides them via `html[data-theme="light"]`. No page reload required.

### Layout
- **Header** (36px): connection status, account info, active project name (centered), cost display, token counter
- **Sidebar** (272px): project selector, session search, session list, parallel toggle
- **Main area**: messages (820px max-width), input bar, toolbox/workflow panels

---

## File Structure

```
shawkat-ai/
├── server.js           Express + WebSocket server (719 lines)
├── db.js               SQLite layer with prepared statements (302 lines)
├── package.json        4 dependencies
├── folders.json        Project configurations
├── prompts.json        16 prompt templates
├── workflows.json      3 multi-step workflows
├── RECOMMENDATIONS.md  Feature tracking
├── data.db             SQLite database (auto-created)
└── public/
    ├── index.html      HTML structure + modals
    ├── app.js          Frontend logic (2,299 lines)
    └── style.css       Terminal-style CSS (1,947 lines)
```

---

## Security

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
| Last selected project | Remembered via the project `<select>` |

There is no server-side user preferences table — all client preferences are lost if localStorage is cleared or a different browser is used.

### Performance Metrics
- **Time to first token** — not measured or stored
- **Per-turn latency** — not tracked
- **WebSocket connection health** — reconnect count, downtime duration not logged

---

## License

Private project.

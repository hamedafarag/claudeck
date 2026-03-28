# Claudeck

A browser-based UI for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — chat, run workflows, manage MCP servers, track costs, and orchestrate autonomous agents from a local web interface. Installable as a PWA. Cross-platform (macOS, Linux, Windows).

- **GitHub**: [github.com/hamedafarag/claudeck](https://github.com/hamedafarag/claudeck)
- **npm**: [npmjs.com/package/claudeck](https://www.npmjs.com/package/claudeck)

## Quick Start

```bash
# One-command launch (no install needed)
npx claudeck

# Custom port (saved to ~/.claudeck/.env for future runs)
npx claudeck --port 3000

# Enable authentication (for remote access via Cloudflare Tunnel, etc.)
npx claudeck --auth

# Or install globally
npm install -g claudeck
claudeck

# Or clone and run from source
git clone https://github.com/hamedafarag/claudeck.git
cd claudeck
npm install
npm start
```

On first run, Claudeck prompts you to choose a port (default: `9009`). The port is saved to `~/.claudeck/.env` and reused automatically on future launches.

Requires Node.js 18+ and a valid Claude Code CLI authentication (`claude auth login`). Installable as a PWA from Chrome's address bar.

On first run, Claudeck creates `~/.claudeck/` with your config files, database, and plugins directory. This keeps user data separate from the package — safe for NPX installs and upgrades.

---

## Technical Stack

| Layer     | Technology                                                        |
| --------- | ----------------------------------------------------------------- |
| Runtime   | Node.js 18+ (ESM)                                                |
| Backend   | Express 4, WebSocket (ws 8), web-push 3, dotenv                  |
| AI SDK    | @anthropic-ai/claude-code ^1                                     |
| Database  | SQLite 3 via better-sqlite3 ^11, WAL mode, adapter pattern (async interface, multi-DB ready) |
| Frontend  | Vanilla JavaScript ES modules (no bundler), CSS custom properties |
| PWA       | Web App Manifest, Service Worker (offline fallback + push + caching), standalone display |
| Rendering | highlight.js 11.9 (syntax), Mermaid 10 (diagrams) — both via CDN |
| Onboarding| Driver.js 1.3.6 (guided tour) — via CDN                          |

## Architecture

```
browser ──────── WebSocket ──────── server.js ──────── Claude Code SDK
   |                                    |
   ├── js/main.js (entry point)       ├── server/paths.js (centralized path resolution)
   │   ├── core/                      ├── server/routes/ (route modules)
   │   │   ├── store.js (reactive)    ├── server/plugin-mount.js (auto-mount plugin routes)
   │   │   ├── ws.js (WebSocket)      ├── server/ws-handler.js
   │   │   ├── api.js (fetch calls)   ├── server/auth.js (token auth middleware)
   │   │   │                          ├── server/agent-loop.js
   │   │   │                          ├── server/telegram-sender.js (two-way)
   │   │   ├── events.js (event bus)  ├── server/telegram-poller.js (callback listener)
   │   │   ├── dom.js (DOM refs)      ├── db.js (adapter proxy → db/sqlite.js)
   │   │   ├── constants.js           ├── config/ (default configs, copied to ~/.claudeck/)
   │   │   ├── utils.js               ├── plugins/ (full-stack plugins)
   │   │   └── plugin-loader.js       │   ├── linear/ (client.js, server.js, config.json)
   │   ├── components/ (Web Components) │   ├── repos/ (client.js, server.js)
   │   ├── ui/   (shared UI modules)  │   ├── tasks/ (client.js, server.js)
   │   ├── features/ (chat, voice, welcome, tour) │   ├── claude-editor/ (client.js, client.css)
   │   │                              │   ├── event-stream/ (client.js, client.css)
   │   └── panels/  (bot, tips, docs) │   └── ... (tic-tac-toe, sudoku)
   ├── css/
   │   ├── core/       (variables, reset, responsive)
   │   ├── ui/         (messages, sessions, layout)
   │   ├── features/   (voice-input, easter-egg)
   │   └── panels/     (bot, tips, docs)
   └── index.html

~/.claudeck/                          User data directory (persists across updates)
   ├── config/                        JSON config files (copied from defaults on first run)
   ├── plugins/                       User-installed plugins
   ├── data.db                        SQLite database
   └── .env                           Environment variables (VAPID keys, API keys, auth token)
```

- **WebSocket** streams assistant text, tool calls, and results in real time
- **Reconnect with backoff** — exponential backoff (2s → 4s → 8s → ... → 30s cap, 0-25% jitter), distinct `ws:reconnected` event triggers state sync
- **State sync on reconnect** — reconciles background sessions, resets streaming panes, reloads messages from DB, refreshes session list
- **Modular frontend** — 40+ ES modules organized into `core/`, `components/`, `ui/`, `features/`, `panels/`, `plugins/` with no bundler
- **Web Components** — 19 Light DOM Custom Elements in `components/` encapsulate modal and section HTML, keeping `index.html` lean (~540 lines)
- **Plugin system** — full-stack plugin architecture: `plugins/<name>/` directories with `client.js`, optional `server.js` (auto-mounted at `/api/plugins/<name>/`), `client.css`, and `config.json`. Also supports user plugins from `~/.claudeck/plugins/`. All discovered via `GET /api/plugins`
- **Reactive store** — centralized pub/sub state management across modules
- **Event bus** — decoupled cross-module communication
- **Modular backend** — 15 Express Router modules + shared WS handler + agent loop + Telegram sender
- **Centralized path resolution** — `server/paths.js` manages all user data paths, sync bootstrap creates dirs and copies defaults on first run
- **Database adapter pattern** — `db.js` is a thin proxy that re-exports from `db/sqlite.js`. All 84 database functions are `async`, enabling future PostgreSQL support without changing any consumer files. See [PLAN-sqlite-adapter.md](PLAN-sqlite-adapter.md) for full architecture docs.
- **SQLite + WAL** persists sessions, messages, costs, Claude session mappings, and persistent memories
- **Indexed queries** — 18 indexes for fast lookups on messages, costs, sessions, memories, notifications, worktrees
- **Cursor-based pagination** — `getRecentMessages` / `getOlderMessages` variants for all message query types (all, by chatId, single-mode) using `WHERE id < ?` with `LIMIT` for efficient scroll-back
- **Prepared statements** for all DB queries (no SQL injection risk)
- **Session resumption** via stored Claude session IDs (survives page reloads)
- **Stale session auto-retry** — if a Claude session no longer exists, automatically retries without `--resume`
- **SDK stderr capture** — stderr output from Claude CLI is captured and included in error messages for better diagnostics
- **Session ID persistence** — active session saved to `localStorage`, restored on page load with auto-message loading
- **AbortController** for mid-stream cancellation
- **Server-side abort on disconnect** — all active SDK streams are aborted when a client disconnects (no lingering processes)
- **Global active query tracking** — server tracks which sessions have running queries; exposed via `GET /api/sessions/active`
- **Background sessions** — streams continue server-side when switching away; client routes messages by `sessionId`; persisted to `localStorage` and reconciled on reconnect
- **Cross-platform** — `os.homedir()`, `path.isAbsolute()`, normalized path traversal checks, multi-platform Claude binary lookup (macOS, Linux, Windows)

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
| parent_session_id | TEXT    | Parent session ID (NULL if not a fork) |
| fork_message_id   | INTEGER | Message ID at which the fork was created |
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

### agent_runs
| Column       | Type    | Description                                |
| ------------ | ------- | ------------------------------------------ |
| id           | INTEGER | Auto-increment PK                          |
| run_id       | TEXT    | UUID grouping chain/DAG runs               |
| agent_id     | TEXT    | Agent definition ID                        |
| agent_title  | TEXT    | Agent display name                         |
| run_type     | TEXT    | "single", "chain", "dag", or "orchestrator"|
| parent_id    | TEXT    | Chain/DAG ID (null for single runs)        |
| status       | TEXT    | "running", "completed", "error", "aborted" |
| turns        | INTEGER | Number of agent turns                      |
| cost_usd     | REAL    | Cost in USD                                |
| duration_ms  | INTEGER | Wall-clock time                            |
| input_tokens | INTEGER | Input token count                          |
| output_tokens| INTEGER | Output token count                         |
| error        | TEXT    | Error message (if failed)                  |
| started_at   | INTEGER | Unix timestamp                             |
| completed_at | INTEGER | Unix timestamp                             |

### agent_context
| Column    | Type    | Description                                |
| --------- | ------- | ------------------------------------------ |
| id        | INTEGER | Auto-increment PK                          |
| run_id    | TEXT    | UUID grouping related agent runs           |
| agent_id  | TEXT    | Agent that produced this context           |
| key       | TEXT    | Context key (e.g. "summary")               |
| value     | TEXT    | Context value (agent output)               |
| created_at| INTEGER | Unix timestamp                             |

### memories
| Column            | Type    | Description                                    |
| ----------------- | ------- | ---------------------------------------------- |
| id                | INTEGER | Auto-increment PK                              |
| project_path      | TEXT    | Project this memory belongs to                 |
| category          | TEXT    | convention, decision, discovery, or warning     |
| content           | TEXT    | Memory content text                            |
| content_hash      | TEXT    | SHA-256 hash for deduplication (unique per project) |
| source_session_id | TEXT    | Session that produced this memory              |
| source_agent_id   | TEXT    | Agent that produced this memory (if any)       |
| relevance_score   | REAL    | Relevance score (boosted on access, decayed over time) |
| created_at        | INTEGER | Unix timestamp                                 |
| accessed_at       | INTEGER | Unix timestamp (updated on each retrieval)     |
| expires_at        | INTEGER | Optional expiration timestamp                  |

**FTS5 index:** `memories_fts` virtual table for full-text search on `content`, kept in sync via INSERT/UPDATE/DELETE triggers.

### notifications
| Column            | Type    | Description                                    |
| ----------------- | ------- | ---------------------------------------------- |
| id                | INTEGER | Auto-increment PK                              |
| type              | TEXT    | session, agent, workflow, chain, dag, error, approval |
| title             | TEXT    | Notification title                             |
| body              | TEXT    | Optional body text                             |
| metadata          | TEXT    | Optional JSON metadata (cost, tokens, etc.)    |
| source_session_id | TEXT    | Session that triggered this notification       |
| source_agent_id   | TEXT    | Agent that triggered this notification         |
| read_at           | INTEGER | Unix timestamp when marked as read (NULL = unread) |
| created_at        | INTEGER | Unix timestamp                                 |

**Indexes:** `idx_notif_created` (created_at DESC), `idx_notif_unread` (partial index on read_at WHERE read_at IS NULL).

### worktrees
| Column        | Type    | Description                                    |
| ------------- | ------- | ---------------------------------------------- |
| id            | TEXT PK | Worktree UUID                                  |
| session_id    | TEXT    | Session that spawned this worktree             |
| project_path  | TEXT    | Original project path                          |
| worktree_path | TEXT    | Path to the worktree directory                 |
| branch_name   | TEXT    | Git branch created for this worktree           |
| base_branch   | TEXT    | Branch the worktree was created from           |
| status        | TEXT    | active, completed, merged, or discarded        |
| user_prompt   | TEXT    | Original user prompt that triggered worktree   |
| created_at    | INTEGER | Unix timestamp                                 |
| completed_at  | INTEGER | Unix timestamp (set on merge/discard)          |

**Indexes:** `idx_wt_project` (project_path), `idx_wt_status` (status).

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
| POST   | /api/sessions/:id/fork      | Fork session at a message (body: `{ messageId }`) |
| GET    | /api/sessions/:id/branches  | List direct child forks of a session   |
| GET    | /api/sessions/:id/lineage   | Get ancestor chain + siblings          |

### Messages
| Method | Path                              | Description                     |
| ------ | --------------------------------- | ------------------------------- |
| GET    | /api/sessions/:id/messages        | All messages (supports `?limit=N&before=ID` for cursor-based pagination) |
| GET    | /api/sessions/:id/messages/:chat  | Messages for a parallel pane (supports `?limit=N&before=ID`)    |
| GET    | /api/sessions/:id/messages-single | Single-mode messages only (supports `?limit=N&before=ID`)       |

**Pagination query parameters:**
- `limit` — max number of messages to return (default: all). When set without `before`, returns the N most recent messages.
- `before` — cursor: return messages with `id < before`. Used with `limit` for scroll-back pagination.

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
| POST   | /api/agents        | Create a new agent definition            |
| PUT    | /api/agents/:id    | Update an existing agent                 |
| DELETE | /api/agents/:id    | Delete an agent by ID                    |

### Agent Chains
| Method | Path               | Description                              |
| ------ | ------------------ | ---------------------------------------- |
| GET    | /api/chains        | List agent chains from agent-chains.json |
| POST   | /api/chains        | Create a new chain (sequential pipeline) |
| PUT    | /api/chains/:id    | Update a chain                           |
| DELETE | /api/chains/:id    | Delete a chain by ID                     |

### Agent DAGs
| Method | Path               | Description                              |
| ------ | ------------------ | ---------------------------------------- |
| GET    | /api/dags          | List agent DAGs from agent-dags.json     |
| POST   | /api/dags          | Create a new DAG (dependency graph)      |
| PUT    | /api/dags/:id      | Update a DAG                             |
| DELETE | /api/dags/:id      | Delete a DAG by ID                       |

### Agent Metrics
| Method | Path                    | Description                              |
| ------ | ----------------------- | ---------------------------------------- |
| GET    | /api/stats/agent-metrics | Overview, per-agent summary, by-type breakdown, daily activity, recent runs |

### Agent Context (Shared State)
| Method | Path                           | Description                              |
| ------ | ------------------------------ | ---------------------------------------- |
| GET    | /api/agent-context/:runId      | Get shared context entries for a run     |

### Workflows & Files
| Method | Path               | Description                              |
| ------ | ------------------ | ---------------------------------------- |
| GET    | /api/workflows     | List workflows                           |
| POST   | /api/workflows     | Create a new workflow                    |
| PUT    | /api/workflows/:id | Update an existing workflow              |
| DELETE | /api/workflows/:id | Delete a workflow                        |
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

### Skills Marketplace (SkillsMP)
| Method | Path                        | Description                                      |
| ------ | --------------------------- | ------------------------------------------------ |
| GET    | /api/skills/config          | Get marketplace config (activated status, masked key, defaults) |
| PUT    | /api/skills/config          | Save config (apiKey, defaultScope, searchMode) — validates key with SkillsMP |
| GET    | /api/skills/search          | Proxy keyword search to SkillsMP (`q`, `page`, `limit`, `sortBy`) |
| GET    | /api/skills/ai-search       | Proxy AI semantic search to SkillsMP (`q`) |
| GET    | /api/skills/installed       | List installed skills from global + project scopes |
| POST   | /api/skills/install         | Install skill from GitHub (`githubUrl`, `name`, `scope`, `projectPath`, `description`) |
| DELETE | /api/skills/:name           | Uninstall skill (`scope`, `projectPath` query params) |
| PUT    | /api/skills/:name/toggle    | Enable/disable skill by renaming SKILL.md ↔ SKILL.md.disabled |

All endpoints except `GET /config` and `PUT /config` are gated behind a valid SkillsMP API key (`requireApiKey` middleware — returns 403 with `NO_API_KEY` code if not activated).

### MCP Server Management
| Method | Path                    | Description                            |
| ------ | ----------------------- | -------------------------------------- |
| GET    | /api/mcp/servers        | List MCP servers (global or per-project via `?project=<path>`) |
| PUT    | /api/mcp/servers/:name  | Create or update MCP server config     |
| DELETE | /api/mcp/servers/:name  | Remove MCP server                      |

All MCP endpoints accept an optional `?project=<path>` query parameter. Without it, they operate on `~/.claude/settings.json` (global). With it, they operate on `<project>/.claude/settings.json` (project-scoped).

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
| GET    | /api/stats/home      | Home page data (yearly activity + overview) |
| GET    | /api/account         | Cached account info (email, plan)        |
| POST   | /api/exec            | Execute shell command (30s timeout)      |

### Plugins
| Method | Path                 | Description                              |
| ------ | -------------------- | ---------------------------------------- |
| GET    | /api/plugins         | Auto-discover plugins from built-in + user directories |

### Telegram
| Method | Path                    | Description                              |
| ------ | ----------------------- | ---------------------------------------- |
| GET    | /api/telegram/config    | Get config (token masked, includes notify prefs + AFK timeout) |
| PUT    | /api/telegram/config    | Update config (botToken, chatId, enabled, afkTimeoutMinutes, notify). Restarts poller on change |
| POST   | /api/telegram/test      | Send a rich test notification with sample metrics |

### Memory
| Method | Path                    | Description                              |
| ------ | ----------------------- | ---------------------------------------- |
| GET    | /api/memory             | List memories for a project (`?project=`) |
| GET    | /api/memory/search      | FTS5 search (`?project=&q=&limit=`)      |
| GET    | /api/memory/top         | Top relevant memories for prompt injection (`?project=&limit=`) |
| GET    | /api/memory/stats       | Memory stats and category counts (`?project=`) |
| POST   | /api/memory             | Create a memory (`{ project, category, content, sourceSessionId?, sourceAgentId? }`) |
| PUT    | /api/memory/:id         | Update memory content and category        |
| DELETE | /api/memory/:id         | Delete a memory                          |
| POST   | /api/memory/maintain    | Run maintenance (decay scores, delete expired) |
| POST   | /api/memory/optimize    | AI-powered optimization preview (Claude Haiku consolidation) |
| POST   | /api/memory/optimize/apply | Apply optimization results              |

### Worktrees
| Method | Path                        | Description                              |
| ------ | --------------------------- | ---------------------------------------- |
| POST   | /api/worktrees              | Create a new worktree (`{ projectPath, baseBranch?, branchName?, sessionId?, userPrompt? }`) |
| GET    | /api/worktrees              | List worktrees for a project (`?project=`) |
| GET    | /api/worktrees/active       | List all active worktrees                |
| POST   | /api/worktrees/:id/merge    | Merge worktree branch back and clean up  |
| GET    | /api/worktrees/:id/diff     | Show diff between worktree and base branch |
| DELETE | /api/worktrees/:id          | Discard worktree (remove + delete branch)|

### Version
| Method | Path                    | Description                              |
| ------ | ----------------------- | ---------------------------------------- |
| GET    | /api/version            | Returns `{ version }` from package.json  |

### WebSocket (`/ws`)

**Outgoing** (client to server):
- `{ type: "chat", message, cwd, sessionId, projectName, chatId, permissionMode, model, maxTurns, images?, systemPrompt?, worktree? }` — send a message (images: `[{ name, data, mimeType }]` base64-encoded; systemPrompt appended to project prompt; worktree: `{ enabled, branchName? }` for worktree isolation)
- `{ type: "workflow", workflow, cwd, sessionId, projectName, permissionMode, model }` — run a workflow
- `{ type: "agent", agentDef, cwd, sessionId, projectName, permissionMode, model, userContext? }` — run an autonomous agent
- `{ type: "agent_chain", chain, agents, cwd, sessionId, projectName, permissionMode, model }` — run an agent chain
- `{ type: "agent_dag", dag, agents, cwd, sessionId, projectName, permissionMode, model }` — run an agent DAG
- `{ type: "orchestrate", task, cwd, sessionId, projectName, permissionMode, model }` — run orchestrator
- `{ type: "abort", chatId? }` — stop generation (aborts agents, chains, DAGs, and orchestrator)
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
- `agent_chain_started` / `agent_chain_step` / `agent_chain_completed` — chain progress
- `dag_started` / `dag_level` / `dag_node` / `dag_completed` / `dag_error` — DAG execution
- `orchestrator_started` / `orchestrator_phase` / `orchestrator_dispatching` / `orchestrator_dispatch` / `orchestrator_completed` / `orchestrator_error` — orchestrator lifecycle
- `worktree_created` — worktree created for this session (id, branchName, worktreePath)
- `worktree_completed` — worktree task finished (id, branchName, diff summary)
- `permission_request` — tool approval needed (id, toolName, input). Also sent to Telegram with inline Approve/Deny buttons if configured.
- `permission_response_external` — approval/denial from an external source (Telegram). Includes `id`, `behavior`, `source`. Frontend auto-dismisses the permission modal.

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
- **Message pagination** — initial load capped to 30 messages; older messages lazy-loaded on scroll-up with cursor-based pagination (`?limit=N&before=ID`). Each parallel pane maintains its own pagination state independently. Loading spinner shown during fetch.
- Auto-generated session titles from first message
- Session resumption across page reloads
- Active session persisted to `localStorage` — page refresh returns to the same session with messages auto-loaded
- State sync on reconnect — background sessions reconciled, streaming panes reset, messages reloaded from DB

### 3. Per-Project System Prompts
- Custom instructions per project (stored in folders.json)
- Edit via sidebar gear icon or `/system-prompt` command
- SP badge indicates when a prompt is configured
- Injected into every query for that project
- Hint in modal: if a `CLAUDE.md` file exists in the project root, the SDK includes it automatically

### 4. Add Project via UI
- "+" button in the sidebar project picker opens a folder browser modal
- "Open in VS Code" button in the project selector header — opens the selected project in VS Code
- Server-side directory browsing — navigates the host filesystem (defaults to user home via `os.homedir()`)
- Clickable breadcrumb path segments for quick navigation up
- Directory list with parent directory (..) navigation
- Hidden directories (`.git`, `.cache`, etc.) are excluded from listing
- Project name auto-populated from the selected folder's basename
- Duplicate path detection (client + server side, 409 response)
- Path validation — server verifies the directory exists via `stat()`
- New project immediately appears in the dropdown and is auto-selected
- Security: resolved paths validated, no traversal beyond filesystem root

### 5. Tool Execution Indicators
- Spinning loader on tool indicators while executing (e.g. Bash, Read, Grep)
- Pulsing left border animation during "running" state
- In-place result update — spinner replaced by checkmark (or X for errors)
- Tool use ID linking — server sends `block.id`, client matches `tool_result` back to the originating indicator
- Result preview shown inline under the tool name (first 150 chars)
- Green/red left border for success/error states
- Expandable body shows full tool input + result
- Saved messages load without spinners (already complete)

### 6. AI Workflows
Four pre-built multi-step workflows:
- **Review PR** — analyze changes, identify issues, suggest improvements
- **Onboard Repo** — map structure, explain architecture, dev guide
- **Migration Plan** — audit deps, assess impact, create plan
- **Code Health** — analyze codebase health, identify tech debt, suggest improvements

Each workflow chains prompts sequentially with context passing and step progress indicators.

### 7. Code Diff Viewer
- LCS-based line diff algorithm for Edit tool output
- Green/red highlighting (additions/removals)
- Additions-only view for Write tool output
- Collapsible tool indicators for other tools

### 8. File Attachments
- File picker modal with recursive tree (depth 3, max 500 files)
- Search/filter files by name with search icon
- Multi-select with badge count and selected file chips strip
- File type color dots (code, config, markup, docs, data, binary)
- Binary file detection with warning label (non-selectable)
- Info banner showing 50KB text file constraint
- Inline error states (too large, not found, permission denied) with auto-dismiss
- Loading spinners during file content fetch
- Empty state when no files match search
- Files prepended as `<file path="...">` blocks
- Attached file paths displayed as pills in user messages (RTL direction so filename is always visible when truncated)
- File paths extracted from saved messages and re-rendered on session replay
- 50KB per-file limit with path traversal protection
- Files and images cleared automatically on project switch

### 9. Image / Vision Support
- Attach images via **image button** (file picker), **paste** (Cmd+V), or **drag-and-drop** onto the message input
- Supported formats: PNG, JPEG, GIF, WebP (Claude API supported types)
- 5MB per-image size limit with user-facing error toast
- **Preview strip** — horizontal thumbnail strip above the input bar with remove (x) buttons
- **Chat display** — image thumbnails rendered inline in user messages
- **Click-to-expand** — click any chat thumbnail for a full-size overlay (click to dismiss)
- **Multimodal SDK integration** — images sent as base64 content blocks via `AsyncIterable<SDKUserMessage>` (async generator)
- **Session history** — images saved in DB message JSON and re-rendered when loading past sessions
- Badge count combines file attachments + image attachments

### 10. Voice Input (Speech-to-Text)
- **Mic button** in the input bar — click to start/stop recording
- Uses the browser's built-in **Web Speech API** (`SpeechRecognition`) — zero dependencies
- Real-time interim transcription appears in the textarea as you speak
- English only (`en-US`), continuous mode with automatic restart on Chrome's 60s silence cutoff
- **Graceful degradation** — button hidden on unsupported browsers (Firefox, Edge)
- Recording stops automatically on: send, Enter, session switch, parallel mode toggle, tab hidden
- Pulsing red mic icon and "Listening..." indicator bar while recording
- Mobile-friendly: 44px touch target preserved on small screens

### 11. Session Management
- Title and project name search with debounced input (200ms)
- Double-click to rename sessions inline
- Pin/unpin sessions (pinned sort to top)
- Delete sessions with cascade (messages, costs, claude mappings)
- Mode detection badges: single, parallel, both
- **Session Branching / Forking** — fork a conversation at any assistant message to explore alternative approaches
  - Fork button (git-branch icon) appears on hover over assistant messages
  - Deep-copies messages up to the fork point into a new session
  - Forked sessions show a branch icon in the session list
  - Context menu: "View Parent Session", "View Forks" with back navigation
  - Fork of fork supported (unlimited depth)
  - Deleting a parent orphans its forks (they remain fully functional)

### 12. Cost Dashboard
- Click the cost display in the header to open
- Summary cards: total, project, today
- Per-session cost table (sortable by title, turns, cost)
- Daily cost bar chart (30-day rolling window)

### 13. Analytics Dashboard
Open via **Tools > Analytics** or `/analytics` slash command. Full analytics with error pattern analysis:
- **Overview cards** — total cost, sessions, queries, turns, output tokens, error count with rate and top category
- **Daily activity** — 30-day bar chart of cost per day
- **Hourly activity** — queries by hour of day
- **Tool usage** — bar chart with per-tool error badges
- **Error Categories** — SQL CASE-based classification into 9 categories: File Not Found, User Denied, Timeout, File State Error, Directory Error, Multiple Matches, Command Not Found, Build/Runtime Error, Other
- **Error Timeline** — daily error count over 30 days
- **Top Failing Tools** — per-tool error breakdown with top 2 error category badges per tool
- **Recent Errors** — scrollable list of last 20 errors with tool name, session title, timestamp, and content preview
- **Project filter** — dropdown to scope all sections to a specific project
- Additional sections: project breakdown, top sessions, session depth, message length distribution, top bash commands, top files

### 14. Keyboard Shortcuts
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
| `Escape`       | Close any open modal / cancel history navigation |
| `Enter`        | Send message              |
| `Shift+Enter`  | New line in input         |
| `↑` (ArrowUp)  | Recall previous message (empty input) |
| `↓` (ArrowDown)| Recall next message (while navigating history) |

### 15. Response Formatting
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

### 16. Export
- `/export md` — download as Markdown
- `/export html` — download as styled HTML document
- `@media print` CSS for clean browser PDF export

### 17. Session Pinning
- Pushpin icon on each session in the sidebar
- Pinned sessions always sort above unpinned
- Toggle via click or `PUT /api/sessions/:id/pin`

### 18. Prompt Variables / Templates
- Prompts with `{{variable}}` placeholders
- Clicking a prompt with variables shows a fill-in form
- Each variable gets a labeled input field
- On submit, variables are replaced and the message is sent
- Works from both toolbox cards and slash commands

### 19. Streaming Token Counter
- `~N tokens` estimation appears in the header during streaming
- Calculates as `chars / 4` (standard estimation)
- Pulsing accent-colored animation
- Auto-hides on stream completion

### 20. Project Commands & Skills
- Recursively reads `.claude/commands/**/*.md` and `.claude/skills/*/SKILL.md` from the selected project
- Registered as slash commands with `project` (red) and `skill` (blue) badges in autocomplete
- Commands with `$ARGUMENTS` wait for user input (e.g. `/deploy testing`)
- Skills with YAML frontmatter are parsed for `name`, `description`, and `argument-hint`
- Commands reload on project switch — each project gets its own set
- Project/skill commands sort first in autocomplete for quick access

### 21. Dark/Light Theme Toggle
- Sun/moon toggle button in sidebar header
- Dark theme: deep blacks (#050508) with terminal green (#33d17a) accents
- Light theme: warm off-white (#fafaf8) with muted greens
- Persists via `localStorage`
- Switches highlight.js theme (github-dark / github)
- Switches Mermaid theme (dark / default)
- `/theme` slash command

### 22. Permission / Tool Approval
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

### 23. PWA / Install as App
- Installable from Chrome's address bar (⊕ icon) on localhost
- Runs in a standalone window (no browser chrome)
- Web App Manifest with app name, theme color, and Whaly icons (192x192 + 512x512)
- **Favicon** — 32x32 Whaly on transparent background (`favicon.png`)
- Service worker with offline fallback — pre-caches offline page and icons; navigation requests fall back to a styled offline page (`offline.html`) when network is unavailable
- Cache-first strategy for static icon assets; network-only for everything else
- Offline page features geometric star pattern and retry button
- Apple touch icon and `apple-mobile-web-app-capable` meta for iOS/Safari

### 24. Background Sessions
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
- **Notification bell integration** — background session events (completed, errored, input needed) are persisted as in-app notifications via `POST /api/notifications/create`, visible in the header bell dropdown with click-through to switch back to the session

The guard dialog intercepts session clicks, project switches, and the New Session button.

### 25. Linear Integration
Side panel for viewing and creating Linear issues directly from the app:
- **Tasks panel** — top half of the Tasks tab; shows assigned open issues with priority, state, labels, due date
- **Create issue** — modal with title, description, team selector, and workflow state (loaded dynamically per team)
- **Auto-assign** — new issues auto-assigned via assignee email in Linear settings
- 60-second client-side cache with manual refresh
- Panel state (open/closed) persisted to `localStorage`
- Configure via Linear tab in the right panel (API key, assignee email, enable toggle)

### 26. Tabbed Right Panel (with Tab SDK)
The right side of the UI hosts a resizable tabbed panel with built-in and plugin tabs:
- **Tasks** — split view with Linear issues (top) and local Todo list (bottom), separated by a draggable resize handle
- **Files** — file explorer
- **Git** — git integration
- **Repos** — repository management
- **Events** — structured activity log (plugin tab via Tab SDK)
- **"+" button** — opens Plugin Marketplace for enabling, disabling, and reordering plugins

**Tab SDK plugin system** — developers can register new tabs with a single `registerTab()` call in a JS module, with no HTML or `dom.js` changes required:
- `registerTab({ id, title, icon, init(ctx) })` — creates tab button and pane dynamically
- **Context object (ctx)** — provides event bus (`on`/`emit`), reactive store (`getState`/`onState`), API module, badge/title helpers, `getProjectPath()`, and `on('projectChanged', fn)` event
- **Lifecycle hooks** — `onActivate`, `onDeactivate`, `onDestroy`
- **Lazy initialization** — `lazy: true` defers `init()` until the tab is first opened
- **Positional insert** — `position` option to control tab order
- **Auto-discovery** — full-stack plugins live in `plugins/<name>/` (with `client.js`, optional `server.js`, `client.css`, `config.json`). User plugins go in `~/.claudeck/plugins/`. All discovered via `GET /api/plugins`
- **Plugin creator skill** — install via `npx skills add https://github.com/hamedafarag/claudeck-skills`, then run `/claudeck-plugin-create <name> <description>` in Claude Code to scaffold plugins automatically
- **Plugin marketplace** — enable/disable/reorder plugins from the "+" button; state persisted to `localStorage`
- **Built-in plugins**: Linear (issues + settings), Tasks (todo + brags), Repos, Events, CLAUDE.md Editor, Sudoku, Tic-Tac-Toe

Panel state (open/closed), active tab, and width are persisted to `localStorage`. Resizable by dragging the left edge. Toggle via header button or `Cmd+B`.

### 27. File Explorer
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

### 28. Git Integration
Git panel in the Git tab — all operations via `POST /api/exec`:
- **Branch selector** — dropdown lists all branches, current branch pre-selected, change triggers `git checkout`
- **Status groups** — "Staged Changes", "Changes", "Untracked" with color-coded badges (M/A/D/R/?)
- **Stage/unstage** — click +/- buttons to `git add` or `git reset HEAD` individual files
- **Commit** — textarea + button, shows error feedback, clears on success
- **Log** — last 10 commits with hash (accent), subject, and relative time
- **Inline diff** — click any file name to view a colored diff modal (per-file collapsible sections with +/- stats)
- **Branch info bar** — shows current branch, ahead/behind tracking, bulk stage/unstage actions
- **Discard changes** — per-file discard button with confirmation
- **Worktrees** — list active worktrees with status badges (running/ready), merge/diff/discard actions per worktree
- **Refresh** — spinning refresh button reloads branches, status, and log
- Auto-refreshes on tab switch and project switch

### 29. Repos Panel
Repository management panel in the Repos tab — backed by `repos.json`:
- **Groups** — create nested groups as collapsible containers (folder icon + chevron + badge count)
- **Repos** — add repositories with name, local path (optional), and GitHub URL (optional)
- **Browse button** — "Add Repository" dialog includes a Browse button that opens an inline folder browser (reuses `/api/projects/browse`); users click through directories instead of typing paths manually
- **Add to group** — right-click a group → "Add Repo Here"
- **Move to group** — right-click a repo → "Move to Group" submenu lists all groups + "Ungrouped"
- **GitHub URL** — right-click a repo → "Set GitHub URL" / "Edit GitHub URL"; once set, "Open in Browser" appears at the top of the context menu
- **Context menus** — repos: Open in Browser, Open in VS Code, Open in Terminal (cross-platform: cmd on Windows, Terminal on macOS, x-terminal-emulator on Linux), Copy Path, Set GitHub URL, Move to Group, Remove; groups: Add Repo Here, Open All in VS Code, Rename, Delete Group
- **Inline editing** — rename groups in-place (click, type, Enter/Escape)
- **Search filter** — debounced (200ms) filter across repo names, paths, and group names
- **Expand/collapse** — group state persisted per group in `localStorage`
- **Double-click** — repos with path open in VS Code; repos with URL only open in browser
- **Delete group** — child groups and repos are reparented to the deleted group's parent
- **Validation** — path checked for `.git` (walks parent dirs for subdirectories), duplicate path detection, circular parent ref protection
- **Keyboard shortcut** — `Cmd+Shift+R` opens Repos tab; `/repos` slash command

### 30. MCP Server Management
Modal UI for managing MCP servers — supports both global (`~/.claude/settings.json`) and per-project (`<project>/.claude/settings.json`) scopes:
- **Dual-scope display** — when a project is selected, shows "Project" and "Global" sections with count badges
- **Scope selector** — choose Global or Project scope when adding a new server
- **Server cards** — name, type badge (stdio/sse/http), command/URL detail, edit/delete buttons
- **Add form** — type selector toggles between stdio fields (command, args, env) and URL fields (url, headers)
- **Edit** — pre-fills form, name and scope locked
- **Delete** — confirmation dialog, scope-aware
- **Global-only fallback** — when no project is selected, only global servers are shown and scope selector is hidden
- Open via header MCP button or `/mcp` slash command

### 31. Max Turns Selector
Configurable max turns per query via header dropdown:
- Options: 10, 30 (default), 50, 100, unlimited
- Sent from client to server with each query
- "Unlimited" omits the `maxTurns` option (no cap)
- `error_max_turns` handled gracefully — shows cost summary + "Reached max turns limit (N). Send another message to continue."
- Persisted to `localStorage`

### 32. Push Notifications
Browser notifications for events that happen while the tab is unfocused, **including when the browser tab is closed**:

**Local notifications** (tab open but unfocused):
- Background session completed — title of the finished session
- Background session error — session title + error message
- Permission request — tool name + background session label (if applicable)

**User feedback** — clear alerts when notifications can't be enabled:
- Browser doesn't support Notification API
- Permission previously denied (directs user to browser settings)
- Non-HTTPS/non-localhost access (browser security requirement)

**Web Push notifications** (works even with the tab/browser closed):
- Server sends push via `web-push` library when a chat query or workflow completes
- Uses VAPID keys (auto-generated on first run, saved to `~/.claudeck/.env`)
- Push subscriptions stored in SQLite (`push_subscriptions` table)
- Service worker `push` event handler checks `clients.matchAll()` — only shows notification when no app window is focused (avoids duplicates with local notifications)
- Stale/expired subscriptions (404/410) auto-cleaned from DB

**Notification sound:**
- Two-tone chime (C5 → E5) plays when notifications fire
- AudioContext created lazily, unlocked on first user click/keypress (browser autoplay policy)
- Client-side notifications play sound directly via `sendNotification()`
- Push notifications trigger sound via service worker `postMessage` to the client page
- OS notification sound suppressed (`silent: true`) to avoid double-chime
- Sound preference stored in `localStorage` (`claudeck-notifications-sound`)

### 32b. Notification Bell & History

Persistent in-app notification system with a bell icon in the header toolbar. Events are stored in the `notifications` SQLite table and survive page reloads.

**Bell icon:**
- Positioned in `.header-right` before the Session settings dropdown
- Red badge shows unread count (hidden when 0, shows `99+` for large counts)
- Bell icon turns accent-colored when unread notifications exist
- Click toggles a dropdown panel with the 15 most recent notifications

**Dropdown:**
- Each row shows: type emoji icon, title, body, relative time ("2m", "1h", "3d"), unread dot
- Type icons: session (💬), agent (🤖), workflow (⚙️), chain (🔗), dag (🌐), error (⚠️), approval (🔒)
- Footer with "Mark all read" and "View All" buttons
- Empty state with muted bell icon and "No notifications yet" message

**Events that create notifications:**

| Source | Type | When |
|--------|------|------|
| Agent completion | `agent` | After `recordAgentRunComplete` in `agent-loop.js` |
| Agent error | `error` | After agent error handling in `agent-loop.js` |
| Background session done | `session` | Toast in `background-sessions.js` |
| Background session error | `error` | Toast in `background-sessions.js` |
| Background session input needed | `approval` | Toast in `background-sessions.js` |

**Read/unread management (4 strategies):**
1. **Explicit click** — click the unread dot on a notification row
2. **Mark all** — footer button marks all as read
3. **Auto on view** — 1.5s timer on dropdown open marks visible items as read
4. **Click-through** — clicking a notification marks it read + switches to the source session
5. **Age-based** — unreads older than 7 days auto-marked as read during daily cleanup

**Full history modal:**
- Opened via "View All" in dropdown footer
- Filter bar: type dropdown, read status (all/unread/read)
- Checkbox column for multi-select with "Mark Selected Read" and "Purge Old" bulk actions
- "Load More" pagination (30 items per page)
- Escape key closes modal

**Real-time sync:**
- `notification:new` WS broadcast updates badge + dropdown across all tabs
- `notification:read` WS broadcast syncs read state across tabs
- Badge re-fetched on WS reconnect

**API routes** (on `/api/notifications` router):
- `POST /create` — create notification (type, title, body, metadata, sourceSessionId)
- `GET /history?limit=20&offset=0&unread_only=false&type=` — paginated fetch
- `GET /unread-count` — lightweight count for badge
- `POST /read` — mark read: `{ ids: [...] }`, `{ all: true }`, or `{ before: timestamp }`
- `DELETE /old` — purge notifications older than 90 days

**Cleanup:** `purgeOldNotifications(90)` runs daily via `setInterval` in `server.js`. Marks stale unreads (>7 days) as read and deletes rows older than 90 days.

**Key files:** `server/notification-logger.js`, `server/routes/notifications.js`, `public/js/ui/notification-bell.js`, `public/js/ui/notification-history.js`, `public/css/ui/notification-bell.css`

### 33. Telegram Integration (Two-Way)
Full two-way Telegram bot integration for AFK developers — rich notifications outbound, tool approval inbound:

**Outbound — Rich Notifications:**
- **Event-specific icons** — session (💬), workflow (⚙️), chain (🔗), agent (🤖), orchestrator (🎯), DAG (🌐), error (⚠️), start (▶️), permission (🔒)
- **Metrics in every message** — duration, cost, token usage (input/output), model, turn count
- **Contextual content** — session messages include user query + answer snippet; agent messages include goal + result summary; workflow/chain/DAG messages list step names and node status
- **Error notifications** — failures send immediately with error details (workflow step failures, chain agent failures, agent errors)
- **Start notifications** — workflows, chains, and DAGs announce when they begin (with step/agent/node list)

**Inbound — AFK Tool Approval:**
- **Inline keyboard buttons** — permission requests appear with Approve / Deny buttons on the developer's phone
- **Race condition handling** — whichever channel responds first (web UI or Telegram) wins; the other is auto-dismissed
- **Telegram → Web** — when approved via Telegram, the web UI permission modal auto-dismisses via `permission_response_external` WebSocket message
- **Web → Telegram** — when approved via web, the Telegram message is edited to show "Approved via Web" with strikethrough
- **Long-poll listener** — `server/telegram-poller.js` polls `getUpdates` for callback queries, routes to `pendingApprovals` Map

**Configuration:**
- **Bot setup** — configure bot token and chat ID via **Tools > Telegram** settings modal
- **AFK timeout** — configurable approval timeout (default 15 minutes, vs 5 minutes for web-only)
- **Per-event toggles** — 9 notification categories: session, workflow, chain, agent, orchestrator, DAG, errors, permission requests, task start
- **Config stored** in `~/.claudeck/config/telegram-config.json`
- **Test button** — sends a sample rich notification with metrics to verify configuration
- **Graceful degradation** — if not configured, all Telegram features are silently skipped

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

### 35. Context Gauge
A progress bar in the header showing cumulative session token usage against the model's context window (200k default):
- Tracks input, output, cache read, and cache creation tokens across all queries in a session
- Color-coded: green (normal), yellow (>50%), red (>80%)
- Hover tooltip shows token breakdown by category
- Resets on new session, loads from history when switching sessions
- Auto-hidden when no tokens recorded

### 36. Event Stream Panel (Tab SDK Plugin)
A structured activity log registered as a plugin tab via the Tab SDK (`plugins/event-stream/client.js`):
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
- **Custom system prompt** — editable via gear icon in the bot header; stored server-side in `~/.claudeck/config/bot-prompt.json`; default is an expert prompt engineering assistant
- **Streaming responses** — uses the same WebSocket infrastructure with `chatId: 'assistant-bot'`; main chat ignores bot messages via early return filter
- **Markdown rendering** — full markdown support with merged ordered lists, syntax highlighting, copy buttons
- **Session management** — "New chat" button clears the thread; conversation history loads on panel open
- **Theme compatible** — follows dark/light theme via CSS custom properties
- **Responsive** — desktop: offset by sidebar width; tablet: snaps to left edge; mobile: full-screen panel, bubble hidden when chat is active

### 39. Autonomous Agents
Four pre-built autonomous agents that run as single high-maxTurns SDK queries (unlike workflows which chain multiple sequential queries):
- **PR Reviewer** — deep code review with actionable feedback
- **Bug Hunter** — scan codebase for bugs, vulnerabilities, and edge cases
- **Test Writer** — generate comprehensive test suites
- **Refactoring Agent** — identify and apply refactoring opportunities

Agent behavior:
- Defined in `~/.claudeck/config/agents.json` with goal prompt, constraints (maxTurns, timeoutMs)
- Single `query()` call with high maxTurns allows Claude to autonomously decide tool usage
- Agent panel in the toolbox area with agent cards (icon, title, description)
- Agent header card shows live stats: elapsed time, turn count, status (running/completed/error)
- Slash commands auto-registered: `/agent-pr-reviewer`, `/agent-bug-hunter`, etc.
- AbortController-based timeout and cancellation
- Reuses existing permission system via `makeCanUseTool`
- WebSocket messages: `agent_started`, `agent_progress`, `agent_completed`, `agent_error`, `agent_aborted`

### 40. Agent Chains (Sequential Pipelines)
Sequential multi-agent pipelines that pass context between steps:
- **Pipeline builder** — modal form with numbered agent steps, reorderable with up/down controls
- **Context passing modes** — `summary` (recommended), `full` (entire output), or `none`
- **Shared context** — each agent's output is stored in the `agent_context` SQLite table, keyed by `runId`
- **Live progress** — pipeline visualization shows numbered steps with running/completed/error status
- **Config** — defined in `~/.claudeck/config/agent-chains.json`
- **2 defaults** — "Bug Hunt + Review" (Bug Hunter → PR Reviewer), "Test + Refactor" (Test Writer → Refactoring Agent)
- **Slash commands** — auto-registered as `/chain-{id}`
- **WebSocket messages** — `agent_chain_started`, `agent_chain_step`, `agent_chain_completed`

### 41. Agent DAGs (Dependency Graphs)
Visual dependency graph editor for running agents in parallel or sequentially:
- **SVG canvas editor** — drag agents from a palette onto the canvas, draw connections between output/input ports
- **Topological execution** — nodes grouped by level; same-level nodes run in parallel (max 3 concurrent), dependent nodes wait
- **Click-to-delete edges** — hover turns edges red, click to remove; wide invisible hit area for easy targeting
- **Auto Layout** — button to automatically arrange nodes in a clean left-to-right layout
- **Explainer section** — "What is a DAG?" with numbered steps explaining the visual editor
- **Config** — defined in `~/.claudeck/config/agent-dags.json` with node positions and edge definitions
- **1 default** — "Full Review Pipeline" (Bug Hunter + Test Writer in parallel → PR Reviewer)
- **Slash commands** — auto-registered as `/dag-{id}`
- **WebSocket messages** — `dag_started`, `dag_level`, `dag_node`, `dag_completed`, `dag_error`

### 42. Orchestrator (Auto-Decompose)
Describe a task in plain language and the orchestrator auto-decomposes it:
- **Orchestrate modal** — "How it Works" explainer with 4 numbered steps, textarea for task description
- **3-phase execution** — Planning (analyzes task + available agents) → Dispatching (runs agents) → Synthesis (combines results)
- **Agent dispatch** — parses `agent-dispatch` code blocks from planner output, delegates to matching agents
- **Shared context** — dispatched agents share context via `agent_context` table
- **Slash command** — `/orchestrate`
- **WebSocket messages** — `orchestrator_started`, `orchestrator_phase`, `orchestrator_dispatching`, `orchestrator_dispatch`, `orchestrator_completed`, `orchestrator_error`

### 43. Agent Monitor Dashboard
Real-time metrics and cost analysis across all agent runs:
- **Summary cards** — total runs, total cost, average duration, success rate, average turns, total tokens
- **Run type breakdown** — bar chart showing single/chain/DAG/orchestrator run distribution
- **Agent leaderboard** — table ranking agents by runs, success rate, cost, and average duration
- **Daily activity** — sparkline chart of runs per day
- **Recent runs** — list of latest agent executions with status, type, duration, and cost
- **Empty state** — helpful message when no runs have been recorded yet
- **Slash command** — `/monitor`
- **API** — `GET /api/stats/agent-metrics`

### 44. Agent Sidebar
Dedicated left sidebar panel for all agent-related features:
- **Collapsible sidebar** — 280px width, opens/closes via "Agents" button below the input bar
- **Sections** — Orchestrate card, Agent Monitor card, Chains, DAGs, Agents — each with add/edit/delete controls
- **Mutual exclusion** — opening Agents sidebar closes Workflows panel and vice versa
- **Enhanced forms** — all CRUD modals use sectioned layouts (af-section with cyan labels, af-grid-2 for 2-column fields)
- **Mobile overlay** — sidebar overlays as absolute panel on screens < 768px

### 45. Local Todo List
A persistent todo list in the bottom half of the Tasks tab, stored in SQLite:
- **Split layout** — Tasks tab is split vertically: Linear issues on top, Todo list on bottom
- **Draggable divider** — 6px drag handle between sections to adjust the split ratio; ratio persisted to `localStorage`
- **Add todos** — click "+" button, type in the input bar, press Enter
- **Toggle done** — checkbox marks items as done (strikethrough + dimmed)
- **Inline edit** — double-click text to edit in place, Enter to save, Escape to cancel
- **Priority levels** — clickable colored dot cycles through 4 levels: none (empty), low (blue), medium (orange), high (red). Color-coded left border on prioritized items
- **Archive** — per-item archive button (box icon) moves completed items out of the active list
- **Archive view** — toggle archive icon in the header to switch between active and archived todos; unarchive button to restore items
- **Brag list** — star button on each todo opens a modal to write a summary (max 500 chars) of what was accomplished. Bragged items are archived and moved to the brag list
- **List counts** — header title dynamically shows count for the current view
- **Persistent** — todos stored in SQLite `todos` table, brags in `brags` table, survive server restarts

### 46. VS Code-Style Status Bar
A 24px footer bar at the bottom of the page showing key information at a glance:
- **Connection status** — green/red dot with "connected"/"disconnected" label
- **Git branch** — current branch name with git icon, click to open Git panel
- **Project** — selected project name with folder icon, click to focus project selector
- **Version** — Claudeck version badge (accent colored) fetched from `/api/version`
- **Activity indicator** — flashes "active" during WebSocket message streaming
- **Background sessions** — count of active background sessions
- **Model** — current model selection with hover tooltip
- **Permission mode** — current permission mode with hover tooltip
- **Max Turns** — current max turns value with hover tooltip
- **Cost** — total session cost, click to open cost dashboard
- All reactive syncing uses MutationObservers to avoid duplicating logic

### 47. Plugin Marketplace
A built-in marketplace UI for managing tab-sdk plugins:
- **Auto-discovery** — server scans built-in plugins (`plugins/`) and user plugins (`~/.claudeck/plugins/`), merges results with `source: "builtin"` or `source: "user"` field
- **Marketplace panel** — accessible from the "+" button in the right panel tab bar
- **Enable/disable** — toggle plugins on/off; state persisted to `localStorage`
- **Reorder tabs** — drag handle to reorder plugin tabs; order persisted to `localStorage`
- **Built-in plugins**: Linear (issues + settings), Tasks (todo + brags), Repos, Events, CLAUDE.md Editor, Sudoku, Tic-Tac-Toe
- **Hot reload** — enable a plugin and it loads immediately without page refresh; disable removes the tab

### 48. Mobile Responsive Layout
Full mobile and tablet responsiveness with two breakpoints (CSS-first approach):

**Tablet (≤1024px):**
- Sidebar converts to a fixed overlay that slides in from the left via hamburger menu button
- Semi-transparent backdrop overlay behind sidebar (click to dismiss)
- Auto-close sidebar when selecting a session

**Mobile (≤640px):**
- Sidebar capped at 85vw width (max 320px)
- Right panel becomes a full-screen overlay
- Compact input bar — toolbox toggle hidden, 16px textarea font (prevents iOS zoom)
- Bottom-sheet style modals and header dropdown menus
- Touch targets minimum 44px on all interactive elements (Apple HIG)
- iOS safe area padding on status bar

### 49. Welcome Screen & Guided Tour
- **Welcome overlay** — shown once on first visit (persisted via `localStorage` key `claudeck-welcome-seen`)
- Displays the Whaly mascot with a floating animation, platform introduction, and 3 feature highlight cards (AI Chat, Agents & Workflows, Dev Tools)
- **Get Started** button dismisses the overlay; **Take a Tour** button dismisses and launches the guided tour
- Keyboard shortcuts: `Enter` or `Esc` to skip
- **Guided tour** — powered by Driver.js (CDN, ~5 KB gzipped, MIT license)
- 18 steps covering: sidebar navigation (home, projects, sessions, parallel mode, theme), header controls (session settings, tools dropdown, tips, right panel), chat area (agents, attachments, voice input, prompts, input, send), and status bar
- Voice Input step is conditionally skipped on Edge or browsers without Speech API
- Light overlay (35% opacity) keeps the UI visible while highlighting the active element with an accent-green glowing ring
- Custom dark theme for Driver.js popovers matching Claudeck's design tokens (fonts, colors, kbd styling)
- Tour completion is persisted via `localStorage` key `claudeck-tour-completed`
- To replay: `localStorage.removeItem('claudeck-welcome-seen'); location.reload()` then click "Take a Tour"

### 50. Easter Egg
Click the Whaly mascot 5 times rapidly on the empty chat screen — Whaly wiggles and pops up a comic-book-style speech bubble with a sassy greeting. Try it!

### 51. Persistent Memory System
Cross-session project knowledge that survives server restarts and upgrades:
- **SQLite-backed** — `memories` table with content-hash deduplication, relevance scoring, and time-decay
- **FTS5 full-text search** — `memories_fts` virtual table with triggers for automatic index sync
- **Auto-capture** — pattern-based heuristic extraction from assistant responses (conventions, decisions, discoveries, warnings)
- **Manual creation** — `/remember` command for user-driven memory capture from chat
- **Code block capture** — Claude can save memories via ` ```memory ` code blocks in responses
- **Smart retrieval** — combines top-N relevance with query-matched FTS results for prompt injection
- **Memory injection** — loaded memories are injected into Claude's context with a collapsible UI indicator
- **AI optimization** — two-phase optimizer: heuristic pre-filter + Claude Haiku consolidation with before/after diff preview
- **Memory panel** — right sidebar tab with search, category filtering, inline edit, and optimize button
- **Categories**: convention, decision, discovery, warning
- **Relevance scoring** — accessed memories get a 0.1 boost (capped at 2.0); idle memories decay by 5% over configurable period

### 52. Tab SDK `projectChanged` Event
- Centralizes project-select change handling in the Tab SDK
- Plugins use `ctx.on('projectChanged', fn)` and `ctx.getProjectPath()` instead of accessing the DOM element directly
- Updated plugin scaffold and claude-editor plugin follow the new pattern

### 53. Git Worktree Support
Run any chat or agent task in an isolated git worktree without touching the working branch:
- **Worktree toggle** — tree icon button in the chat input bar; when active, the next message runs in a new worktree
- **Confirmation card** — before sending, shows the branch name and base branch with "Run in Worktree" / "Run in Current" buttons
- **Worktree creation** — creates a git worktree at `<project>/../.claudeck-worktrees/<branch>` with branch `claudeck/wt-<shortid>`
- **Active banner** — while running, shows a banner with branch name, base branch, and worktree status
- **Completion card** — on task completion, shows merge/diff/discard action buttons
- **Merge** — merges worktree branch back into the base branch, removes worktree and branch
- **Diff** — shows a colored diff modal between worktree changes and base branch
- **Discard** — removes worktree and deletes branch without merging
- **Git panel section** — "Worktrees" section in the Git tab listing active worktrees with status badges (running/ready) and per-worktree merge/diff/discard actions
- **Database tracking** — `worktrees` table tracks id, session, paths, branch, status, and user prompt
- **WebSocket integration** — `worktree_created` and `worktree_completed` messages for real-time UI updates

### 54. Skills Marketplace (SkillsMP)
Browse, search, install, and manage agent skills from the [SkillsMP](https://skillsmp.com/) registry directly within Claudeck:
- **Token-gated activation** — panel shows an activation form until user enters a valid SkillsMP API key (free from skillsmp.com). All marketplace features unlock after activation
- **Browse tab** — keyword search (~200ms) and AI semantic search (~2.5s) with mode toggle; sort by stars or recency; paginated results; clickable skill cards with detail expansion (GitHub link, SkillsMP page, last updated)
- **Initial state** — "Discover agent skills" with clickable example tags (code-review, commit-message, testing) that pre-fill the search
- **Search hint** — contextual hint below the search bar that updates based on the selected mode
- **Install flow** — one-click install with scope selector (Global / Project); downloads SKILL.md + assets from GitHub; normalizes names to valid directory format; injects YAML frontmatter (name + description) if missing; toast notification on success/failure
- **Duplicate detection** — if installing a skill that already exists in the same scope, shows a custom confirm dialog to overwrite or cancel
- **Installed tab** — lists installed skills grouped by scope (Project / Global); toggle switch to enable/disable; trash icon to uninstall with custom confirm dialog
- **Settings tab** — view/change/remove API key, daily quota display, default scope and search mode selectors
- **Deactivation flow** — remove key from Settings reverts panel to activation form
- **Skill used messages** — system info messages in chat area when a skill is triggered:
  - **User-invoked** — detected when user executes a skill slash command (`category: "skill"`)
  - **Model-invoked** — detected via WebSocket `{ type: "tool", name: "Skill" }` with skill lookup map
  - **Persistence** — model-invoked skill events render on session reload via `renderMessagesIntoPane`
- **Post-install integration** — re-triggers `loadProjectCommands()` so new skills appear in `/` autocomplete immediately
- **Keyboard navigation** — ArrowDown from search to results, ArrowUp/Down between cards, Enter to expand
- **Error handling** — banners for invalid/expired API key (with re-enter button), quota exceeded, network errors (with retry button)
- **Files**: `server/routes/skills.js`, `public/js/panels/skills-manager.js`, `public/css/panels/skills-manager.css`, `config/skillsmp-config.json`

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
| /skills          | Open Skills Marketplace panel  |
| /remember        | Save a memory from chat        |

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

### Multi-Agent
| Command              | Description                     |
| -------------------- | ------------------------------- |
| /orchestrate         | Open orchestrator modal — describe a task to auto-decompose and delegate |
| /monitor             | Open agent monitor dashboard with run metrics and cost analysis |
| /chain-{id}          | Run a specific agent chain (auto-registered per chain) |
| /dag-{id}            | Run a specific agent DAG (auto-registered per DAG) |

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

### Message Recall (Input History)
Two complementary mechanisms for recalling previously sent messages:
- **Up-arrow recall** — press `↑` on an empty input to cycle through previous messages; `↓` to move forward; `Escape` to cancel
- **History button** — clock icon below the Send button opens a popover listing all recent messages (newest first); click to insert into input
- Per-project localStorage persistence (`claudeck-input-history-<projectPath>`, max 100 entries)
- Slash commands are included in history; messages with attachments store text only
- Consecutive duplicate messages are deduplicated

---

## Configuration

### User Data Directory (`~/.claudeck/`)

On first run, Claudeck creates `~/.claudeck/` and copies default config files there. All user data lives in this directory:

```
~/.claudeck/
├── config/              JSON config files
│   ├── folders.json     Projects
│   ├── repos.json       Repository groups + repos
│   ├── prompts.json     16 prompt templates
│   ├── workflows.json   4 multi-step workflows
│   ├── agents.json      4 autonomous agent definitions
│   ├── agent-chains.json 2 agent chains (sequential pipelines)
│   ├── agent-dags.json  1 agent DAG (dependency graph)
│   ├── bot-prompt.json  Assistant bot system prompt
│   ├── telegram-config.json  Telegram bot config + notification preferences
│   └── skillsmp-config.json  SkillsMP marketplace config (apiKey, defaultScope, searchMode)
├── plugins/             User-installed tab-sdk plugins
├── data.db              SQLite database
└── .env                 Environment variables
```

Override the location with `CLAUDECK_HOME` environment variable.

### .env — Environment Variables
```bash
PORT=9009                        # Server port (default 9009)
VAPID_PUBLIC_KEY=                # Auto-generated on first run if missing
VAPID_PRIVATE_KEY=               # Auto-generated on first run if missing
```

The app works without any env vars configured. VAPID keys are auto-generated on first run.

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
    { "id": "r_1709900000", "name": "Web App", "path": "/Users/me/web-app", "groupId": "g_1709900000", "url": "https://github.com/org/web-app" }
  ]
}
```
Groups support nesting via `parentId`. Repos can have a local `path`, a `url`, both, or just a name.

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

### telegram-config.json — Telegram Integration
```json
{
  "enabled": false,
  "botToken": "",
  "chatId": "",
  "afkTimeoutMinutes": 15,
  "notify": {
    "sessionComplete": true,
    "workflowComplete": true,
    "chainComplete": true,
    "agentComplete": true,
    "orchestratorComplete": true,
    "dagComplete": true,
    "errors": true,
    "permissionRequests": true,
    "taskStart": true
  }
}
```
Configure via **Tools > Telegram** in the header or edit directly. Requires a Telegram bot token (from @BotFather) and a chat ID. See feature section 33 for full two-way integration details.

---

## UI Design

### Terminal Aesthetic
- All-monospace typography (SF Mono, Fira Code, JetBrains Mono)
- Deep black backgrounds with green accent glow
- Subtle CRT scanline overlay (dark mode only)
- Green caret and input text
- Left-border accents on messages, code blocks, and tool indicators
- 4px border radius for sharp terminal feel
- User messages: "YOU" label badge header with blue-dim background, 3px blue left border, distinct from green assistant theme
- Assistant messages: clean flowing text with styled headings (h1/h2 with bottom borders), purple inline code, green list markers
- Code blocks: language header bar with uppercase label + copy button, rounded corners, deep background

### Theming
All colors are CSS custom properties on `:root` (defined in `css/variables.css`). The light theme overrides them via `html[data-theme="light"]`. No page reload required.

### Layout
- **Header** (36px): background session indicator, **Notification bell** (badge + dropdown + history modal), **Session dropdown** (approval, model, max turns submenus), **Tools dropdown** (MCP servers, notifications, Telegram, dev docs), panel toggle
- **Sidebar** (272px): project selector (with add project button), session controls (search, new session, parallel toggle), session list (with right-click context menu)
- **Main area**: messages (820px max-width), input bar with inline toolbar strip (attach, images, agents, voice, worktree, prompts) below textarea, toolbox/workflow/agent panels
- **Right panel** (300px, resizable): tabbed container with Tasks, Files, Git, Repos, Events, plugin tabs
- **Status bar** (24px): connection dot, git branch, project name, version badge, activity, background sessions, model, permission mode, max turns, cost
- **Responsive**: tablet (≤1024px) — sidebar becomes slide-in overlay; mobile (≤640px) — full-screen overlays, bottom-sheet dropdowns, compact input bar

---

## File Structure

```
Claudeck/
├── server.js              Express entry point
├── db.js                  SQLite layer with indexes + prepared statements
├── server/
│   ├── paths.js           Centralized path resolution (~/.claudeck/ bootstrap)
│   ├── ws-handler.js      WebSocket handler with stale session retry
│   ├── agent-loop.js      Autonomous agent execution
│   ├── summarizer.js      AI session summary generation via Claude Haiku
│   ├── notification-logger.js  In-app notification creation + WS broadcast
│   ├── push-sender.js     Web Push notification sender
│   ├── telegram-sender.js Telegram Bot API (rich messages, inline keyboards, permissions)
│   ├── telegram-poller.js Telegram callback listener (long-poll getUpdates, routes approvals)
│   ├── memory-optimizer.js AI memory optimization (Claude Haiku consolidation)
│   └── routes/
│       ├── projects.js    Project CRUD + system prompts + commands
│       ├── sessions.js    Session CRUD + pin/unpin
│       ├── messages.js    Message queries (all, by chat, single-mode) with cursor-based pagination
│       ├── prompts.js     Prompt template CRUD
│       ├── stats.js       Cost stats + dashboard + analytics + account info
│       ├── files.js       File listing + content + tree + search
│       ├── workflows.js   Workflow listing
│       ├── exec.js        Shell command execution
│       ├── linear.js      Linear API proxy (issues, teams, states)
│       ├── mcp.js         MCP server CRUD (global + per-project)
│       ├── repos.js       Repos CRUD (groups + repos)
│       ├── notifications.js Push subscriptions + notification bell API (history, read, create)
│       ├── tips.js        Tips feed API + RSS proxy
│       ├── bot.js         Assistant bot system prompt API
│       ├── agents.js      Agents listing API
│       ├── todos.js       Todo + brag CRUD
│       ├── telegram.js    Telegram notification config + test
│       ├── memory.js      Memory CRUD, search, stats, optimize
│       └── skills.js      SkillsMP marketplace (search, install, uninstall, toggle, config)
├── config/                Default JSON configs (copied to ~/.claudeck/ on first run)
│   ├── folders.json       Project configurations
│   ├── repos.json         Repository groups + repos
│   ├── prompts.json       16 prompt templates
│   ├── workflows.json     4 multi-step workflows
│   ├── agents.json        4 autonomous agent definitions
│   ├── bot-prompt.json    Assistant bot system prompt
│   ├── telegram-config.json Telegram bot config + notification preferences
│   └── skillsmp-config.json SkillsMP marketplace config
├── package.json           6 runtime dependencies
├── cli.js                 CLI entry point (npx/global install)
├── vitest.config.js       Unit test config
├── vitest.config.perf.js  Performance benchmark config
├── tests/
│   ├── setup.js           Global test setup (temp dir for CLAUDECK_HOME)
│   ├── unit/              2,494+ unit tests (frontend + backend)
│   └── perf/              WebSocket performance benchmarks (4 scenarios)
│       ├── ws-perf.test.js  Approval latency, throughput, scaling, broadcast
│       └── helpers/         Test harness + stats utilities
├── .github/
│   └── workflows/
│       └── publish.yml    GitHub Actions — auto-publish to npm on release
└── public/
    ├── index.html         HTML layout skeleton + Web Component tags (~540 lines)
    ├── manifest.json      PWA Web App Manifest
    ├── sw.js              Service worker (offline fallback + push + caching)
    ├── offline.html       Offline fallback page
    ├── icons/             Whaly mascot + PWA icons + favicon
    ├── style.css          CSS entry point (@import hub)
    ├── css/
    │   ├── core/          variables.css, reset.css, responsive.css
    │   ├── ui/            layout, sessions, messages, parallel, modals, input-history, etc.
    │   ├── features/      welcome.css, tour.css, voice-input.css, retro-terminal.css
    │   └── panels/        assistant-bot, tips-feed, dev-docs, telegram, mcp-manager, skills-manager
    ├── data/
    │   └── tips.json      20 curated tips + RSS feed definitions
    └── js/
        ├── main.js        Entry point — imports components then all modules
        ├── components/    19 Web Components (Light DOM Custom Elements for modals + sections)
        ├── core/          store, dom, constants, events, utils, api, ws, plugin-loader
        ├── ui/            messages, formatting, diff, export, theme, commands, parallel, etc.
        ├── features/      chat, sessions, projects, input-history, home, welcome, tour, attachments, voice-input, easter-egg, etc.
        └── panels/        assistant-bot, tips-feed, dev-docs, file-explorer, git-panel, mcp-manager, skills-manager
plugins/                   Full-stack plugins (client.js, server.js, config.json)
    ├── linear/            Issues + settings with server-side API routes
    ├── repos/             Repository management with server-side routes
    ├── tasks/             Todo + brags with server-side routes
    ├── claude-editor/     CLAUDE.md editor (client-only)
    ├── event-stream/      WebSocket event viewer (client-only)
    ├── tic-tac-toe/       Tic-tac-toe game (client-only)
    └── sudoku/            Sudoku game (client-only)
```

---

## Security

- **Authentication** — opt-in token-based auth via `--auth` flag. 256-bit hex token auto-generated on first use. Login page at `/login`. `HttpOnly` + `SameSite=strict` cookie. WebSocket connections verified via `verifyClient`. Localhost bypasses auth by default (proxy-aware — requests with `X-Forwarded-For` or `X-Real-IP` headers are not treated as localhost). Programmatic access via `Authorization: Bearer <token>` header. Timing-safe token comparison (`crypto.timingSafeEqual`). Zero new dependencies.
- **Tool approval** — three permission modes (bypass, confirm writes, confirm all) with approve/deny modal for dangerous tool calls
- **Path traversal protection** — normalized `resolve()` + `sep` comparison on all file endpoints (cross-platform safe)
- **Browse endpoint security** — `path.isAbsolute()` validation, hidden directory filtering, directory existence check via `stat()`
- **File size limits** (50KB) on content reading
- **Directory depth limits** (3 levels on listing, 8 levels on search)
- **Skipped directories**: .git, node_modules, dist, build, __pycache__, .venv, coverage, .cache, .turbo, .nyc_output
- **CWD validation** — verifies working directory exists before spawning SDK process (fallback to `os.homedir()`)
- **CLI execution** — simple commands use `execFile()` (no shell injection); complex commands use `exec()` with 30s timeout and 512KB buffer limit
- **MCP path validation** — project path must be absolute with no `..` traversal segments
- **Prepared statements**: All SQL queries use parameterized statements
- **CORS**: Not explicitly configured (local-only use unless auth is enabled)

---

## License

MIT

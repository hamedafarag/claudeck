# Configuration & User Data Directory

Claudeck separates **package defaults** (read-only, ships with npm) from **user data** (persists across updates). This document explains how the system works and how to extend it.

---

## Directory Layout

```
~/.claudeck/                          Created on first run
├── config/                           JSON config files (editable)
│   ├── folders.json                  Projects list + system prompts
│   ├── repos.json                    Repository groups + repos
│   ├── prompts.json                  Prompt templates (16 defaults)
│   ├── workflows.json                Multi-step workflows (4 defaults, CRUD via UI)
│   ├── agents.json                   Autonomous agent definitions (4 defaults)
│   ├── agent-chains.json             Agent chains — sequential pipelines (2 defaults)
│   ├── agent-dags.json               Agent DAGs — dependency graphs (1 default)
│   ├── bot-prompt.json               Assistant bot system prompt
│   └── telegram-config.json          Telegram notification settings
├── plugins/                          User-installed plugins
│   └── my-plugin/                    Plugin directory
│       ├── client.js                 Plugin JS module (required)
│       ├── client.css                Plugin stylesheet (optional)
│       └── server.js                 Server-side routes (optional, requires CLAUDECK_USER_SERVER_PLUGINS=true)
├── data.db                           SQLite database (sessions, messages, costs, todos)
└── .env                              Environment variables (VAPID keys, API keys)
```

```
<package-root>/config/                Default configs (read-only reference)
├── folders.json                      Empty array []
├── repos.json                        { groups: [], repos: [] }
├── prompts.json                      16 built-in prompt templates
├── workflows.json                    4 built-in workflows
├── agents.json                       4 built-in agents
├── agent-chains.json                 2 built-in chains
├── agent-dags.json                   1 built-in DAG
├── bot-prompt.json                   Default bot system prompt
└── telegram-config.json              Telegram bot + notification preferences
```

---

## How Bootstrap Works

All path resolution is centralized in `server/paths.js`. On first import (synchronous, before any route or DB module loads):

1. **Create directories** — `~/.claudeck/config/` and `~/.claudeck/plugins/` are created via `mkdirSync({ recursive: true })`
2. **Copy defaults** — each `.json` file in `<package>/config/` is copied to `~/.claudeck/config/` **only if it doesn't already exist**. User edits are never overwritten.
3. **Migrate database** — if `data.db` exists in the package root but not in `~/.claudeck/`, it's copied (including `-shm` and `-wal` WAL files). This handles users upgrading from a pre-NPX install.
4. **Migrate `.env`** — same logic as the database migration.

```
First run:
  <package>/config/prompts.json  ──copy──>  ~/.claudeck/config/prompts.json

Second run:
  ~/.claudeck/config/prompts.json exists  ──skip──  (user edits preserved)

NPX upgrade:
  New package installed with updated defaults
  ~/.claudeck/ untouched  ──  user keeps their config, database, plugins
```

### Key Exports from `server/paths.js`

| Export | Value | Description |
|--------|-------|-------------|
| `packageRoot` | `<package-install-dir>` | Where the npm package lives |
| `userDir` | `~/.claudeck` | User data root |
| `userConfigDir` | `~/.claudeck/config` | User's JSON config files |
| `userPluginsDir` | `~/.claudeck/plugins` | User-installed plugins |
| `dbPath` | `~/.claudeck/data.db` | SQLite database path |
| `defaultConfigDir` | `<package>/config` | Built-in default configs |
| `configPath(filename)` | `~/.claudeck/config/<filename>` | Helper to resolve a config file |

---

## Overriding the User Directory

Set the `CLAUDECK_HOME` environment variable to change where user data is stored:

```bash
# Use a custom directory
CLAUDECK_HOME=/tmp/claudeck-test npm start

# Useful for:
# - Running multiple instances with separate data
# - Testing/CI environments
# - Portable installs (e.g., USB drive)
```

---

## Adding a New Config File

To add a new JSON config file that follows the default-copy pattern:

### 1. Create the default file

Add your default config to `config/`:

```bash
# config/my-feature.json
{
  "enabled": false,
  "settings": {}
}
```

The bootstrap will automatically copy it to `~/.claudeck/config/` on next startup (for users who don't have it yet).

### 2. Use it in your route

```javascript
import { configPath } from "../paths.js";
import { readFile, writeFile } from "fs/promises";

const dataFile = configPath("my-feature.json");

async function readConfig() {
  try {
    return JSON.parse(await readFile(dataFile, "utf-8"));
  } catch {
    return { enabled: false, settings: {} };
  }
}

async function writeConfig(data) {
  await writeFile(dataFile, JSON.stringify(data, null, 2) + "\n");
}
```

That's it. No changes needed to `paths.js` — the bootstrap copies all `.json` files from `config/` automatically.

---

## User Plugins

Plugins can live in two directories:

| Directory | Source | Writable |
|-----------|--------|----------|
| `<package>/plugins/` | Ships with Claudeck (full-stack) | No (package-managed) |
| `~/.claudeck/plugins/` | User-installed | Yes |

The `GET /api/plugins` endpoint merges both directories. Each plugin gets a `source` field (`"builtin"` or `"user"`) so the marketplace UI can distinguish them.

### Plugin directory structure

Each plugin is a directory with at minimum a `client.js` file:

```
plugins/my-plugin/
├── client.js       # Tab-sdk module (required) — must call registerTab()
├── client.css      # Styles (optional, auto-injected if present)
├── server.js       # Express router (optional, auto-mounted at /api/plugins/my-plugin/)
└── config.json     # Default config (optional, copied to ~/.claudeck/config/ on first run)
```

### Installing a user plugin

Create a directory in `~/.claudeck/plugins/` with a `client.js` file:

```bash
mkdir -p ~/.claudeck/plugins/my-plugin
cp client.js ~/.claudeck/plugins/my-plugin/
cp client.css ~/.claudeck/plugins/my-plugin/  # optional
```

The plugin appears in the marketplace on next page load. No server restart needed.

**Server-side user plugins**: To allow user plugins with `server.js`, set `CLAUDECK_USER_SERVER_PLUGINS=true` in your `.env`. This is disabled by default for security.

### Static serving

User plugins are served from `/user-plugins/` URL path:
- `~/.claudeck/plugins/my-plugin/client.js` → `http://localhost:9009/user-plugins/my-plugin/client.js`

Built-in plugins are served from `/plugins/` URL path:
- `plugins/linear/client.js` → `http://localhost:9009/plugins/linear/client.js`

---

## Environment Variables (`.env`)

The `.env` file lives at `~/.claudeck/.env`. On first run, if a `.env` exists in the package root (pre-NPX install), it's migrated automatically.

```bash
# ~/.claudeck/.env
PORT=9009                        # Server port (default 9009)
VAPID_PUBLIC_KEY=                # Auto-generated on first run
VAPID_PRIVATE_KEY=               # Auto-generated on first run
```

VAPID keys are generated automatically if missing — no manual setup needed for push notifications.

---

## Database

The SQLite database lives at `~/.claudeck/data.db`. It stores:

- Sessions (id, claude_session_id, title, project_path, timestamps)
- Messages (role, content, chat_id for parallel mode)
- Costs (per-query cost, tokens, model, duration)
- Claude session mappings (for SDK session resumption)
- Push subscriptions (for web push notifications)
- Todos and brags

The database is created automatically on first run with WAL mode enabled. Schema migrations run on startup via try/catch `ADD COLUMN` statements.

### Backup

```bash
# The database is a single file (plus WAL files if active)
cp ~/.claudeck/data.db ~/.claudeck/data.db.backup
```

### Reset

```bash
# Delete the database to start fresh (sessions, messages, costs all lost)
rm ~/.claudeck/data.db

# Or reset everything
rm -rf ~/.claudeck
# Next startup will recreate with defaults
```

---

## MCP Server Configuration

MCP servers are stored in Claude CLI's own settings files, not in `~/.claudeck/`:

| Scope | File | Description |
|-------|------|-------------|
| Global | `~/.claude/settings.json` | Available to all projects |
| Project | `<project>/.claude/settings.json` | Available only in that project |

Claudeck's MCP manager reads/writes both scopes. The API uses `?project=<path>` to select the scope:

```
GET  /api/mcp/servers                    → global servers
GET  /api/mcp/servers?project=/my/app    → project-level servers
PUT  /api/mcp/servers/myserver           → save to global
PUT  /api/mcp/servers/myserver?project=… → save to project
```

---

## Config File Reference

### folders.json — Projects
```json
[
  {
    "name": "My App",
    "path": "/absolute/path/to/project",
    "systemPrompt": "Optional per-project instructions for Claude"
  }
]
```
Managed via the UI project picker. System prompts injected into every query for that project.

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
`{{variable}}` placeholders show a fill-in form in the UI. Auto-registered as `/code-review` slash commands.

### workflows.json — Multi-Step Workflows
```json
[
  {
    "id": "review-pr",
    "title": "Review PR",
    "description": "Analyze changes and suggest improvements",
    "steps": [
      { "label": "Analyze", "prompt": "Run git diff and analyze..." },
      { "label": "Suggest", "prompt": "Based on your analysis..." }
    ]
  }
]
```
Steps execute sequentially with context passing. Auto-registered as `/review-pr` slash command. Workflows support full CRUD — create, edit, and delete from the Agents & Workflows sidebar. Running workflows can be stopped via the Stop button.

### agents.json — Autonomous Agents
```json
[
  {
    "id": "pr-reviewer",
    "title": "PR Reviewer",
    "icon": "🔍",
    "description": "Deep code review with actionable feedback",
    "goal": "Review the current git diff thoroughly...",
    "constraints": {
      "maxTurns": 50,
      "timeoutMs": 300000
    }
  }
]
```
Agents run as a single SDK `query()` call with high maxTurns. Auto-registered as `/agent-pr-reviewer`.

### agent-chains.json — Agent Chains (Sequential Pipelines)
```json
[
  {
    "id": "bug-hunt-review",
    "title": "Bug Hunt + Review",
    "description": "Find bugs, then review the fixes",
    "agents": ["bug-hunter", "pr-reviewer"],
    "contextPassing": "summary"
  }
]
```
Chains run agents sequentially, passing shared context between steps. `contextPassing` can be `"summary"` (recommended), `"full"`, or `"none"`. Auto-registered as `/chain-bug-hunt-review`.

### agent-dags.json — Agent DAGs (Dependency Graphs)
```json
[
  {
    "id": "full-review-pipeline",
    "title": "Full Review Pipeline",
    "description": "Find bugs and write tests in parallel, then review everything",
    "nodes": [
      { "id": "n1", "agentId": "bug-hunter", "x": 80, "y": 60 },
      { "id": "n2", "agentId": "test-writer", "x": 80, "y": 160 },
      { "id": "n3", "agentId": "pr-reviewer", "x": 320, "y": 110 }
    ],
    "edges": [
      { "from": "n1", "to": "n3" },
      { "from": "n2", "to": "n3" }
    ]
  }
]
```
DAGs run agents in topological order — nodes with no dependencies run in parallel (max 3 concurrent), dependent nodes wait. Edited via a visual SVG canvas with drag-to-add and connection drawing. Auto-registered as `/dag-full-review-pipeline`.

### repos.json — Repository Groups
```json
{
  "groups": [
    { "id": "g_1709900000", "name": "Frontend", "parentId": null }
  ],
  "repos": [
    {
      "id": "r_1709900000",
      "name": "Web App",
      "path": "/Users/me/web-app",
      "groupId": "g_1709900000",
      "url": "https://github.com/org/web-app"
    }
  ]
}
```
Groups support nesting via `parentId`. Repos can have a local path, URL, both, or just a name.

### bot-prompt.json — Assistant Bot
```json
{
  "systemPrompt": "You are an expert prompt engineer..."
}
```
The floating Whaly bot's system prompt. Editable via the bot panel gear icon.

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
Configure via **Tools > Telegram** in the UI. Requires a bot token from [@BotFather](https://t.me/BotFather).

**Two-way communication:**
- **Outbound** — Rich notifications with metrics (duration, cost, tokens, model) for all event types. Messages include context: user query, agent goal, step names, result summary.
- **Inbound** — Permission requests appear as inline keyboard buttons (Approve / Deny). Developers can approve tool calls from their phone while AFK. Whichever channel responds first (web UI or Telegram) wins — the other is auto-dismissed.
- **AFK timeout** — Configurable approval timeout (default 15 minutes, vs 5 minutes for web-only).
- **Per-event toggles** — Enable/disable notifications per event type via the `notify` object.
- **Poller** — `server/telegram-poller.js` long-polls the Telegram Bot API for callback queries. Starts automatically on server boot.

# Configuration & User Data Directory

CodeDeck separates **package defaults** (read-only, ships with npm) from **user data** (persists across updates). This document explains how the system works and how to extend it.

---

## Directory Layout

```
~/.codedeck/                          Created on first run
├── config/                           JSON config files (editable)
│   ├── folders.json                  Projects list + system prompts
│   ├── repos.json                    Repository groups + repos
│   ├── prompts.json                  Prompt templates (16 defaults)
│   ├── workflows.json                Multi-step workflows (4 defaults)
│   ├── agents.json                   Autonomous agent definitions (4 defaults)
│   ├── bot-prompt.json               Assistant bot system prompt
│   └── telegram-config.json          Telegram notification settings
├── plugins/                          User-installed tab-sdk plugins
│   ├── my-plugin.js                  Plugin JS module
│   └── my-plugin.css                 Plugin stylesheet (optional)
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
├── bot-prompt.json                   Default bot system prompt
└── telegram-config.json              { enabled: false, botToken: "", chatId: "" }
```

---

## How Bootstrap Works

All path resolution is centralized in `server/paths.js`. On first import (synchronous, before any route or DB module loads):

1. **Create directories** — `~/.codedeck/config/` and `~/.codedeck/plugins/` are created via `mkdirSync({ recursive: true })`
2. **Copy defaults** — each `.json` file in `<package>/config/` is copied to `~/.codedeck/config/` **only if it doesn't already exist**. User edits are never overwritten.
3. **Migrate database** — if `data.db` exists in the package root but not in `~/.codedeck/`, it's copied (including `-shm` and `-wal` WAL files). This handles users upgrading from a pre-NPX install.
4. **Migrate `.env`** — same logic as the database migration.

```
First run:
  <package>/config/prompts.json  ──copy──>  ~/.codedeck/config/prompts.json

Second run:
  ~/.codedeck/config/prompts.json exists  ──skip──  (user edits preserved)

NPX upgrade:
  New package installed with updated defaults
  ~/.codedeck/ untouched  ──  user keeps their config, database, plugins
```

### Key Exports from `server/paths.js`

| Export | Value | Description |
|--------|-------|-------------|
| `packageRoot` | `<package-install-dir>` | Where the npm package lives |
| `userDir` | `~/.codedeck` | User data root |
| `userConfigDir` | `~/.codedeck/config` | User's JSON config files |
| `userPluginsDir` | `~/.codedeck/plugins` | User-installed plugins |
| `dbPath` | `~/.codedeck/data.db` | SQLite database path |
| `defaultConfigDir` | `<package>/config` | Built-in default configs |
| `builtinPluginsDir` | `<package>/public/js/plugins` | Built-in plugin directory |
| `configPath(filename)` | `~/.codedeck/config/<filename>` | Helper to resolve a config file |

---

## Overriding the User Directory

Set the `CODEDECK_HOME` environment variable to change where user data is stored:

```bash
# Use a custom directory
CODEDECK_HOME=/tmp/codedeck-test npm start

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

The bootstrap will automatically copy it to `~/.codedeck/config/` on next startup (for users who don't have it yet).

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
| `<package>/public/js/plugins/` | Ships with CodeDeck | No (package-managed) |
| `~/.codedeck/plugins/` | User-installed | Yes |

The `GET /api/plugins` endpoint merges both directories. Each plugin gets a `source` field (`"builtin"` or `"user"`) so the marketplace UI can distinguish them.

### Installing a user plugin

Drop a `.js` file (and optional `.css` file) into `~/.codedeck/plugins/`:

```bash
cp my-plugin.js ~/.codedeck/plugins/
cp my-plugin.css ~/.codedeck/plugins/  # optional
```

The plugin appears in the marketplace on next page load. No server restart needed.

### Plugin file naming

The JS and CSS files must share the same base name:

```
~/.codedeck/plugins/
├── weather-tab.js      # Plugin module (required)
└── weather-tab.css     # Styles (optional, auto-loaded if present)
```

### Static serving

User plugins are served from `/user-plugins/` URL path:
- `~/.codedeck/plugins/weather-tab.js` → `http://localhost:9009/user-plugins/weather-tab.js`

Built-in plugins are served from the normal static path:
- `public/js/plugins/tasks-tab.js` → `http://localhost:9009/js/plugins/tasks-tab.js`

---

## Environment Variables (`.env`)

The `.env` file lives at `~/.codedeck/.env`. On first run, if a `.env` exists in the package root (pre-NPX install), it's migrated automatically.

```bash
# ~/.codedeck/.env
PORT=9009                        # Server port (default 9009)
LINEAR_API_KEY=                  # Linear API key for issue integration
LINEAR_ASSIGNEE_EMAIL=           # Auto-assign new issues to this email
VAPID_PUBLIC_KEY=                # Auto-generated on first run
VAPID_PRIVATE_KEY=               # Auto-generated on first run
```

VAPID keys are generated automatically if missing — no manual setup needed for push notifications.

---

## Database

The SQLite database lives at `~/.codedeck/data.db`. It stores:

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
cp ~/.codedeck/data.db ~/.codedeck/data.db.backup
```

### Reset

```bash
# Delete the database to start fresh (sessions, messages, costs all lost)
rm ~/.codedeck/data.db

# Or reset everything
rm -rf ~/.codedeck
# Next startup will recreate with defaults
```

---

## MCP Server Configuration

MCP servers are stored in Claude CLI's own settings files, not in `~/.codedeck/`:

| Scope | File | Description |
|-------|------|-------------|
| Global | `~/.claude/settings.json` | Available to all projects |
| Project | `<project>/.claude/settings.json` | Available only in that project |

CodeDeck's MCP manager reads/writes both scopes. The API uses `?project=<path>` to select the scope:

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
Steps execute sequentially with context passing. Auto-registered as `/review-pr` slash command.

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

### telegram-config.json — Telegram Notifications
```json
{
  "enabled": false,
  "botToken": "",
  "chatId": ""
}
```
Configure via **Tools > Telegram** in the UI. Requires a bot token from [@BotFather](https://t.me/BotFather).

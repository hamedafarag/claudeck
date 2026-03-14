# CodeDeck

A browser-based UI for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — chat, run workflows, manage MCP servers, track costs, and orchestrate autonomous agents from a local web interface.

Cross-platform (macOS, Linux, Windows). Installable as a PWA. Zero bundler, vanilla JS.

## Quick Start

```bash
npm install
npm start
# Open http://localhost:9009
```

Requires **Node.js 18+** and Claude Code CLI authentication (`claude auth login`).

On first run, CodeDeck creates `~/.codedeck/` with your config, database, and plugins directory — safe for NPX upgrades.

## Features

| Feature | Description |
|---------|-------------|
| **Real-Time Chat** | WebSocket streaming with session persistence, parallel mode (2x2 grid), background sessions |
| **Workflows** | Multi-step workflows with full CRUD — create, edit, delete from the UI. 4 pre-built (PR Review, Onboard Repo, Migration Plan, Code Health) |
| **Autonomous Agents** | 4 agents (PR Reviewer, Bug Hunter, Test Writer, Refactoring) with live progress tracking |
| **Agent Chains** | Sequential multi-agent pipelines with context passing between steps |
| **Agent DAGs** | Visual dependency graph editor — run agents in parallel or sequentially based on connections |
| **Orchestrator** | Describe a task in plain language — auto-decomposes and delegates to specialist agents |
| **Agent Monitor** | Dashboard with run metrics, cost aggregation, success rates, and per-agent leaderboard |
| **MCP Manager** | CRUD for global + per-project MCP servers with scope selector |
| **Cost & Analytics** | Per-session cost tracking, daily charts, error pattern analysis, tool usage stats |
| **File Explorer** | Lazy-loaded tree, file preview with syntax highlighting, search, drag-to-chat |
| **Git Panel** | Branch switching, staging, commit, log — all in-app |
| **Voice Input** | Speech-to-text via Web Speech API (Chrome/Safari) |
| **Permission System** | Bypass, Confirm Writes, or Confirm All — approve/deny tool calls with "always allow" option |
| **Plugin System** | Tab SDK for custom panels — auto-discovered from `public/js/plugins/` and `~/.codedeck/plugins/` |
| **PWA** | Install as a standalone app, push notifications (even with browser closed), offline fallback |
| **Prompt Templates** | 16 built-in prompts with `{{variable}}` placeholder support |
| **Project Commands** | Auto-discovers `.claude/commands/` and `.claude/skills/` from your project |
| **Linear Integration** | View and create issues directly from the sidebar |
| **Telegram Alerts** | Notifications via Telegram Bot API on session/workflow/agent completion |
| **Todo & Brags** | Local task list with priority, archive, and brag tracking |
| **Repos Manager** | Organize repositories in nested groups with GitHub URL linking |
| **Dark/Light Theme** | Terminal aesthetic with CRT scanlines (dark) or warm off-white (light) |
| **Mobile Responsive** | Full tablet/mobile layout with sidebar overlay, bottom-sheet modals, 44px touch targets |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 18+ (ESM) |
| Backend | Express 4, WebSocket (ws 8), web-push 3 |
| AI SDK | @anthropic-ai/claude-code |
| Database | SQLite via better-sqlite3, WAL mode |
| Frontend | Vanilla JS ES modules, CSS custom properties |
| Rendering | highlight.js (syntax), Mermaid (diagrams) — CDN |

## Architecture

```
browser ──── WebSocket ──── server.js ──── Claude Code SDK
                               │
                          server/paths.js ──── ~/.codedeck/
                               │                  ├── config/     (JSON configs)
                          server/routes/           ├── plugins/    (user plugins)
                          (15 modules)             ├── data.db     (SQLite)
                                                   └── .env        (keys)
```

- 40+ frontend ES modules (`core/`, `ui/`, `features/`, `panels/`, `plugins/`)
- Reactive store + event bus for cross-module communication
- Session resumption via stored Claude session IDs
- Background sessions continue server-side when switching away

## Slash Commands

```
/clear /new /parallel /export /theme /shortcuts     Application
/costs /analytics                                    Dashboards
/files /git /repos /events /mcp /tips                Panels
/review-pr /onboard-repo /migration-plan /code-health Workflows
/agent-pr-reviewer /agent-bug-hunter /agent-test-writer Agents
/orchestrate /monitor /chain-* /dag-*                   Multi-Agent
/code-review /find-bugs /write-tests /refactor ...   Prompts (16)
/run <cmd>                                           Shell execution
```

Project commands from `.claude/commands/` and `.claude/skills/` are auto-registered on project switch.

## Configuration

All user data lives in `~/.codedeck/` (override with `CODEDECK_HOME`):

```
~/.codedeck/
├── config/              JSON config files (copied from defaults on first run)
│   ├── folders.json     Projects
│   ├── prompts.json     Prompt templates
│   ├── workflows.json   Workflows
│   ├── agents.json      Autonomous agents
│   ├── agent-chains.json Agent chains (sequential pipelines)
│   ├── agent-dags.json  Agent DAGs (dependency graphs)
│   ├── repos.json       Repository groups
│   ├── bot-prompt.json  Assistant bot prompt
│   └── telegram-config.json
├── plugins/             User-installed tab-sdk plugins
├── data.db              SQLite database
└── .env                 VAPID keys, LINEAR_API_KEY, etc.
```

Defaults are copied once on first run — user edits are never overwritten on upgrade.

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for the full configuration guide.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Focus session search |
| `Cmd+N` | New session |
| `Cmd+B` | Toggle right panel |
| `Cmd+/` | Show all shortcuts |
| `Cmd+Shift+E/G/R/V/T` | Files / Git / Repos / Events / Tips |
| `Cmd+1`–`4` | Focus parallel pane |

## Documentation

| Document | Description |
|----------|-------------|
| [DOCUMENTATION.md](docs/DOCUMENTATION.md) | Full feature documentation, API reference, database schema |
| [CONFIGURATION.md](docs/CONFIGURATION.md) | User data directory, config files, plugin system |
| [CROSS-PLATFORM-AUDIT.md](docs/CROSS-PLATFORM-AUDIT.md) | Windows/Linux compatibility fixes |
| [COMPETITIVE-ANALYSIS.md](docs/COMPETITIVE-ANALYSIS.md) | Feature comparison with similar tools |

## License

MIT

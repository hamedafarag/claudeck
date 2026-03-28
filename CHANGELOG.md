# Changelog

All notable changes to Claudeck are documented in this file.

## [1.3.2] — 2026-03-28

### Added
- **Message Pagination** — Cursor-based lazy loading for messages in both single and parallel modes. Initial load capped to 30 messages; older messages load on scroll-up with loading spinner. Each parallel pane tracks its own pagination cursor independently.
- **Database Adapter Pattern** — Extracted monolithic `db.js` (1690 lines) into `db/sqlite.js` adapter behind a thin proxy. Enables future multi-database support (PostgreSQL) without changing any consumer files.
- **Async Database Interface** — All 84 database functions are now `async`, preparing the interface for async drivers like `pg`. SQLite adapter wraps sync calls in resolved Promises with zero behavioral changes.

### Improved
- **Parallel pane loading** — Switched from sequential to concurrent `Promise.all` for faster pane initialization
- **Unit tests** — Updated ~30 files for async/await; 2,494 total tests passing

---

## [1.3.0] — 2026-03-25

### Added
- **Authentication** — Token-based auth for remote access (`--auth`, `--token`, `--no-auth` flags). Login page, HttpOnly cookie sessions, WebSocket verification, proxy-aware localhost bypass (detects `X-Forwarded-For`/`X-Real-IP` from ngrok/Cloudflare Tunnel), `Authorization: Bearer` header support. Zero new dependencies.
- **File Picker Redesign** — Type-indicator dots, binary file detection, search, selected file chips, reorganized input bar layout
- **Product Hunt Badge** — Added to nav bar and README

### Improved
- **Web Components** — Extracted 19 components from index.html into self-contained Custom Elements (Light DOM)
- **Login page** — Redesigned to match app DNA (header, Whaly empty state, chat-style input bar, status bar, theme support)
- **Offline page** — Redesigned to match app DNA with auto-retry, theme support, and Whaly mascot
- **Unit tests** — Added 1,100+ frontend tests (ui/, features/, panels/, components/) and 59 auth tests; 2,470 total tests passing
- **WebSocket performance benchmarks** — New `test:perf` suite measuring approval round-trip latency (p99 < 800 µs at 25 sessions), message throughput (435k msg/s at 50 clients), connection scaling (35 KB/conn at 100 connections), and broadcast fan-out (p50 < 1 ms at 100 clients). Real TCP connections over localhost, no mocked sockets.
- Updated docs to reflect file picker redesign, input bar layout, authentication, and performance benchmarks

---

## [1.2.0] — 2026-03-22

### Added
- **Skills Marketplace (SkillsMP)** — Browse, install, toggle, search skills, and skill-used chat indicators
- **Git Worktree Isolation** — Chat-level worktree toggle with merge/diff/discard and enhanced git panel
- **Message Recall** — Up-arrow history navigation and history button popover
- **Session Branching** — Conversation forking with fork button and branch navigation
- **Notification Bell** — Persistent notification history with background session events

### Improved
- Comprehensive unit test suite with 98% line coverage
- Refactored WebSocket handler for better reliability

---

## [1.1.1] — 2026-03-20

### Added
- Ko-fi support link
- Landing page SEO improvements
- Social links

### Docs
- Updated docs for v1.1.0 covering memory system, Tab SDK events, and Windows fixes

---

## [1.1.0] — 2026-03-19

### Added
- **Persistent Memory System** — Auto-capture with FTS5 full-text search and AI optimization
- **Tab SDK `projectChanged` Event** — New event for plugin API
- **Landing Page** — GitHub Pages landing page for the project

### Fixed
- Landing page skills install command and plugin code snippet

---

## [1.0.7] — 2026-03-16

### Added
- Version display in status bar

### Fixed
- Windows git branch display

---

## [1.0.6] — 2026-03-15

### Fixed
- Windows `claude` binary resolution
- Windows auth status command

---

## [1.0.5] — 2026-03-15

### Fixed
- Windows `claude` binary resolution and auth status command

---

## [1.0.4] — 2026-03-15

### Added
- Repos browse button
- Dev Docs overhaul

### Fixed
- Cross-platform compatibility fixes
- Plugin skill updates

---

## [1.0.3] — 2026-03-15

### Added
- ASCII art banner on startup
- Interactive port prompt
- `--port` CLI flag

---

## [1.0.2] — 2026-03-15

### Added
- Remove project button with confirmation dialog

---

## [1.0.1] — 2026-03-15

### Added
- **Full-Stack Plugin System** with Linear plugin and NPX publishing
- **Telegram Integration** — Two-way rich notifications and AFK tool approval via inline keyboard
- **Multi-Agent Support** — Chains, DAGs, orchestrator, monitor dashboard, and sidebar UI
- **Workflow CRUD** — Create, edit, delete workflows from UI with stop support
- **Welcome Screen** — Whaly mascot with 18-step guided tour (Driver.js)
- **Voice Input** — Speech-to-text with mic button via Web Speech API
- **Mobile Responsive Layout** — Sidebar toggle, tablet/mobile breakpoints
- **CLAUDE.md Editor Plugin** — File write endpoint and project-aware loading
- **Home Page** — AI activity grid and inline analytics dashboard
- **Tab SDK** — Dev docs, input-waiting indicator, and offline page redesign
- **Autonomous Agents System** — User message styling and input bar tooltips
- **Local Todo List** — Archive support in split Tasks tab
- **Floating Assistant Bot** — Linked/free mode toggle
- **Context Gauge** — Event stream panel, AI session summaries, and session card redesign
- **Tips Feed Panel** — Curated AI tips and RSS aggregation
- **Error Pattern Analytics** — PWA offline fallback and custom branding
- **Web Push Notifications** — Image attachments and UI refinements
- **Repos Panel** — Group management, GitHub URLs, and manual repo entry
- **File Explorer & Git Integration** — Tabbed right panel and MCP management
- **Permission/Tool Approval** — 3 modes, approval modal, queue, and background support
- **Background Sessions** — Continue streaming when switching sessions/projects
- **PWA Support** — Browser-installable standalone app
- **Linear Issue Creation** — Persistent confirmation modals, env/dotenv setup
- GitHub Actions npm publish workflow
- Horizontal tab scrolling
- Cost hint tooltip and disabled tools setting
- WebSocket reconnect with state sync
- Project commands/skills and header project name

### Improved
- Unified UI components: consistent inputs, buttons, forms, tooltips
- Enhanced typography, visual depth, and animations
- Modularized codebase: split monolithic files into focused ES modules
- Reorganized frontend into core/ui/features/panels/plugins with auto-discovery plugin system

---

## [1.0.0] — 2026-03-01

### Added
- Initial release of Claudeck — the browser UI for Claude Code

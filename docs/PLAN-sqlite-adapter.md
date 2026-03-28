# Database Adapter Pattern — Architecture

> **Status:** Implemented (Phase 1: SQLite adapter + async interface)

## Overview

Claudeck's database layer uses an adapter pattern to support future multi-database backends. Currently, SQLite is the only adapter. All database functions are async, making the interface compatible with both synchronous drivers (better-sqlite3) and asynchronous drivers (pg for PostgreSQL).

## File Structure

```
db.js                     ← 3-line proxy: re-exports from the active adapter
db/
└── sqlite.js             ← SQLite implementation (better-sqlite3)
```

Future (when PostgreSQL is added):
```
db.js                     ← Reads config, conditionally imports sqlite or pg
db/
├── sqlite.js             ← SQLite adapter
└── pg.js                 ← PostgreSQL adapter
```

## How It Works

### Proxy (`db.js`)

A thin re-export file at the project root. All 35+ consumer files import from `db.js` — they never reference the adapter directly.

```js
export * from "./db/sqlite.js";
```

### Adapter (`db/sqlite.js`)

Contains everything:
- Schema creation (13 tables + 1 FTS5 virtual table)
- Migrations (18+ ALTER TABLE statements)
- Indexes and triggers
- 60+ prepared statements
- 84 exported `async` functions across 12 domains
- 2 transaction wrappers (`deleteSession`, `forkSession`)

### Async Interface

All 84 exported functions are `async`. For SQLite, this means sync return values are auto-wrapped in resolved Promises. This allows PostgreSQL (natively async) to implement the same interface.

```js
// SQLite adapter — sync internally, async externally
export async function getMessages(sessionId) {
  return stmts.getMessages.all(sessionId);
}

// Future PostgreSQL adapter — async internally and externally
export async function getMessages(sessionId) {
  const { rows } = await pool.query("SELECT * FROM messages WHERE session_id = $1", [sessionId]);
  return rows;
}
```

### Special Cases

- **`getDb()`** — Stays sync. Returns the raw better-sqlite3 instance for SQLite-specific operations. Marked with `@sqlite-specific`. Will need a different abstraction when PostgreSQL is added.
- **Transactions** — `deleteSession` and `forkSession` use `db.transaction()` internally (sync) but are wrapped in async functions externally.
- **`hashContent()`** — Private helper, stays sync (pure crypto, no db call).

## Function Domains (84 functions)

| Domain | Count | Examples |
|--------|-------|---------|
| Sessions | 13 | `createSession`, `listSessions`, `deleteSession`, `forkSession` |
| Messages | 10 | `addMessage`, `getMessages`, `getRecentMessages`, `getOlderMessages` |
| Costs & Tokens | 7 | `addCost`, `getTotalCost`, `getCostTimeline` |
| Claude Sessions | 3 | `setClaudeSession`, `getClaudeSessionId` |
| Analytics | 18 | `getAnalyticsOverview`, `getDailyBreakdown`, `getToolUsage` |
| Todos & Brags | 9 | `listTodos`, `createTodo`, `createBrag` |
| Push Subscriptions | 3 | `upsertPushSubscription`, `getAllPushSubscriptions` |
| Agent Context | 5 | `setAgentContext`, `getAllAgentContext` |
| Agent Runs | 7 | `recordAgentRunStart`, `getAgentRunsRecent` |
| Notifications | 7 | `createNotification`, `markNotificationsRead` |
| Worktrees | 7 | `createWorktreeRecord`, `listWorktreesByProject` |
| Memories | 11 | `createMemory`, `searchMemories`, `maintainMemories` |
| DB Access | 1 | `getDb()` (sync, SQLite-specific) |

## Adding a New Database Adapter

To add PostgreSQL support:

1. Create `db/pg.js` implementing all 84 `async` function signatures
2. Translate SQLite schema to PostgreSQL DDL (`AUTOINCREMENT` → `SERIAL`, `unixepoch()` → `NOW()`, etc.)
3. Replace `PRAGMA` introspection with `information_schema` queries
4. Replace FTS5 with `tsvector`/`tsquery` + GIN index
5. Update `db.js` proxy to read a config and conditionally import the right adapter
6. No changes needed in any consumer file — they all import from `db.js`

## Testing

The integration test `tests/unit/backend/db.test.js` exercises all 84+ exports against a real database. It validates the full `db.js (proxy) → db/sqlite.js (adapter)` chain. All 2494 tests pass.

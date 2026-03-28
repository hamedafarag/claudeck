import Database from "better-sqlite3";
import { createHash } from "crypto";
import { dbPath } from "./server/paths.js";

const db = new Database(dbPath);

// Enable WAL mode for better concurrent performance
db.pragma("journal_mode = WAL");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    claude_session_id TEXT,
    project_name TEXT,
    project_path TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    last_used_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT REFERENCES sessions(id),
    cost_usd REAL,
    duration_ms INTEGER,
    num_turns INTEGER,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT REFERENCES sessions(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS claude_sessions (
    session_id TEXT NOT NULL,
    chat_id TEXT NOT NULL DEFAULT '',
    claude_session_id TEXT NOT NULL,
    PRIMARY KEY (session_id, chat_id)
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    keys_p256dh TEXT NOT NULL,
    keys_auth TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    done INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );
`);

// Migrations
try { db.exec(`ALTER TABLE messages ADD COLUMN chat_id TEXT DEFAULT NULL`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE sessions ADD COLUMN title TEXT DEFAULT NULL`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE sessions ADD COLUMN pinned INTEGER DEFAULT 0`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE costs ADD COLUMN input_tokens INTEGER DEFAULT 0`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE costs ADD COLUMN output_tokens INTEGER DEFAULT 0`); } catch { /* exists */ }
// New columns for costs table
try { db.exec(`ALTER TABLE costs ADD COLUMN model TEXT DEFAULT NULL`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE costs ADD COLUMN stop_reason TEXT DEFAULT NULL`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE costs ADD COLUMN is_error INTEGER DEFAULT 0`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE costs ADD COLUMN cache_read_tokens INTEGER DEFAULT 0`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE costs ADD COLUMN cache_creation_tokens INTEGER DEFAULT 0`); } catch { /* exists */ }
// New columns for messages table (workflow metadata)
try { db.exec(`ALTER TABLE messages ADD COLUMN workflow_id TEXT DEFAULT NULL`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE messages ADD COLUMN workflow_step_index INTEGER DEFAULT NULL`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE messages ADD COLUMN workflow_step_label TEXT DEFAULT NULL`); } catch { /* exists */ }
// AI-generated session summary
try { db.exec(`ALTER TABLE sessions ADD COLUMN summary TEXT DEFAULT NULL`); } catch { /* exists */ }
// Todo archive
try { db.exec(`ALTER TABLE todos ADD COLUMN archived INTEGER DEFAULT 0`); } catch { /* exists */ }
// Todo priority (0=none, 1=low, 2=medium, 3=high)
try { db.exec(`ALTER TABLE todos ADD COLUMN priority INTEGER DEFAULT 0`); } catch { /* exists */ }
// Session branching / conversation forking
try { db.exec(`ALTER TABLE sessions ADD COLUMN parent_session_id TEXT DEFAULT NULL`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE sessions ADD COLUMN fork_message_id INTEGER DEFAULT NULL`); } catch { /* exists */ }

// Agent context (shared memory between agents in a chain/orchestration run)
db.exec(`
  CREATE TABLE IF NOT EXISTS agent_context (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(run_id, agent_id, key)
  );
  CREATE INDEX IF NOT EXISTS idx_agent_context_run ON agent_context(run_id);
`);

// Agent runs table (monitoring dashboard)
db.exec(`
  CREATE TABLE IF NOT EXISTS agent_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    agent_title TEXT NOT NULL,
    run_type TEXT NOT NULL DEFAULT 'single',
    parent_id TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    turns INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    error TEXT,
    started_at INTEGER DEFAULT (unixepoch()),
    completed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_id);
  CREATE INDEX IF NOT EXISTS idx_agent_runs_started ON agent_runs(started_at);
  CREATE INDEX IF NOT EXISTS idx_agent_runs_run_id ON agent_runs(run_id);
`);

// Persistent memories table (cross-session context)
db.exec(`
  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_path TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'discovery',
    content TEXT NOT NULL,
    content_hash TEXT,
    source_session_id TEXT,
    source_agent_id TEXT,
    relevance_score REAL DEFAULT 1.0,
    created_at INTEGER DEFAULT (unixepoch()),
    accessed_at INTEGER DEFAULT (unixepoch()),
    expires_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_path);
  CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
  CREATE INDEX IF NOT EXISTS idx_memories_relevance ON memories(relevance_score DESC);
`);

// Migration: add content_hash column if missing (existing DBs)
try { db.exec(`ALTER TABLE memories ADD COLUMN content_hash TEXT`); } catch { /* already exists */ }
try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_hash ON memories(project_path, content_hash)`); } catch { /* already exists */ }

// FTS5 full-text search for memories
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    content,
    content='memories',
    content_rowid='id'
  );
`);

// Triggers to keep FTS in sync
db.exec(`
  CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
  END;
  CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.id, old.content);
  END;
  CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE OF content ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.id, old.content);
    INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
  END;
`);

// ── Notifications table ──────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    metadata TEXT,
    source_session_id TEXT,
    source_agent_id TEXT,
    read_at INTEGER DEFAULT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(read_at) WHERE read_at IS NULL;
`);

// ── Worktrees table ──────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS worktrees (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    project_path TEXT NOT NULL,
    worktree_path TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    base_branch TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    user_prompt TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    completed_at INTEGER DEFAULT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_wt_project ON worktrees(project_path);
  CREATE INDEX IF NOT EXISTS idx_wt_status ON worktrees(status);
`);

// Backfill content_hash for existing rows
const unhashed = db.prepare(`SELECT id, project_path, content FROM memories WHERE content_hash IS NULL`).all();
if (unhashed.length > 0) {
  const backfill = db.prepare(`UPDATE memories SET content_hash = ? WHERE id = ?`);
  const backfillTx = db.transaction((rows) => {
    for (const row of rows) {
      const hash = createHash("sha256").update(`${row.project_path}:${row.content}`).digest("hex");
      backfill.run(hash, row.id);
    }
  });
  backfillTx(unhashed);
}

// Backfill FTS index for existing memories not yet indexed
try {
  const ftsCount = db.prepare(`SELECT COUNT(*) as c FROM memories_fts`).get();
  const memCount = db.prepare(`SELECT COUNT(*) as c FROM memories`).get();
  if (ftsCount.c < memCount.c) {
    db.exec(`INSERT INTO memories_fts(memories_fts) VALUES ('rebuild')`);
  }
} catch { /* ignore */ }

// Brags table
db.exec(`
  CREATE TABLE IF NOT EXISTS brags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    todo_id INTEGER REFERENCES todos(id),
    text TEXT NOT NULL,
    summary TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );
`);

// Indexes for query performance
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_messages_session_chat ON messages(session_id, chat_id);
  CREATE INDEX IF NOT EXISTS idx_costs_session_id ON costs(session_id);
  CREATE INDEX IF NOT EXISTS idx_costs_created_at ON costs(created_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_project_path ON sessions(project_path);
  CREATE INDEX IF NOT EXISTS idx_sessions_pinned_last_used ON sessions(pinned DESC, last_used_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id) WHERE parent_session_id IS NOT NULL;
`);

// Deduplicated mode CASE subquery — used in 4 session listing queries
const MODE_CASE = `
  CASE
    WHEN EXISTS (SELECT 1 FROM messages m WHERE m.session_id = s.id AND m.chat_id IS NOT NULL)
         AND EXISTS (SELECT 1 FROM messages m WHERE m.session_id = s.id AND m.chat_id IS NULL)
      THEN 'both'
    WHEN EXISTS (SELECT 1 FROM messages m WHERE m.session_id = s.id AND m.chat_id IS NOT NULL)
      THEN 'parallel'
    ELSE 'single'
  END AS mode`;

// Prepared statements
const stmts = {
  createSession: db.prepare(
    `INSERT OR IGNORE INTO sessions (id, claude_session_id, project_name, project_path)
     VALUES (?, ?, ?, ?)`
  ),
  updateClaudeSessionId: db.prepare(
    `UPDATE sessions SET claude_session_id = ? WHERE id = ?`
  ),
  getSession: db.prepare(`SELECT * FROM sessions WHERE id = ?`),
  listSessions: db.prepare(
    `SELECT s.*, ${MODE_CASE}
     FROM sessions s ORDER BY s.pinned DESC, s.last_used_at DESC LIMIT ?`
  ),
  listSessionsByProject: db.prepare(
    `SELECT s.*, ${MODE_CASE}
     FROM sessions s WHERE s.project_path = ? ORDER BY s.pinned DESC, s.last_used_at DESC LIMIT ?`
  ),
  touchSession: db.prepare(
    `UPDATE sessions SET last_used_at = unixepoch() WHERE id = ?`
  ),
  addCost: db.prepare(
    `INSERT INTO costs (session_id, cost_usd, duration_ms, num_turns, input_tokens, output_tokens, model, stop_reason, is_error, cache_read_tokens, cache_creation_tokens) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ),
  addMessage: db.prepare(
    `INSERT INTO messages (session_id, role, content, chat_id, workflow_id, workflow_step_index, workflow_step_label) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ),
  getMessages: db.prepare(
    `SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC`
  ),
  getMessagesByChatId: db.prepare(
    `SELECT * FROM messages WHERE session_id = ? AND chat_id = ? ORDER BY id ASC`
  ),
  getMessagesNoChatId: db.prepare(
    `SELECT * FROM messages WHERE session_id = ? AND chat_id IS NULL ORDER BY id ASC`
  ),
  // Paginated variants — fetch last N messages (DESC then reverse client-side)
  getRecentMessages: db.prepare(
    `SELECT * FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT ?`
  ),
  getRecentMessagesByChatId: db.prepare(
    `SELECT * FROM messages WHERE session_id = ? AND chat_id = ? ORDER BY id DESC LIMIT ?`
  ),
  getRecentMessagesNoChatId: db.prepare(
    `SELECT * FROM messages WHERE session_id = ? AND chat_id IS NULL ORDER BY id DESC LIMIT ?`
  ),
  // Cursor-based: messages older than a given ID
  getOlderMessages: db.prepare(
    `SELECT * FROM messages WHERE session_id = ? AND id < ? ORDER BY id DESC LIMIT ?`
  ),
  getOlderMessagesByChatId: db.prepare(
    `SELECT * FROM messages WHERE session_id = ? AND chat_id = ? AND id < ? ORDER BY id DESC LIMIT ?`
  ),
  getOlderMessagesNoChatId: db.prepare(
    `SELECT * FROM messages WHERE session_id = ? AND chat_id IS NULL AND id < ? ORDER BY id DESC LIMIT ?`
  ),
  getTotalCost: db.prepare(`SELECT COALESCE(SUM(cost_usd), 0) AS total FROM costs`),
  getProjectCost: db.prepare(
    `SELECT COALESCE(SUM(c.cost_usd), 0) AS total
     FROM costs c JOIN sessions s ON c.session_id = s.id
     WHERE s.project_path = ?`
  ),
  setClaudeSession: db.prepare(
    `INSERT OR REPLACE INTO claude_sessions (session_id, chat_id, claude_session_id) VALUES (?, ?, ?)`
  ),
  getClaudeSessionId: db.prepare(
    `SELECT claude_session_id FROM claude_sessions WHERE session_id = ? AND chat_id = ?`
  ),
  allClaudeSessions: db.prepare(
    `SELECT * FROM claude_sessions`
  ),
  updateSessionTitle: db.prepare(
    `UPDATE sessions SET title = ? WHERE id = ?`
  ),
  toggleSessionPin: db.prepare(
    `UPDATE sessions SET pinned = CASE WHEN pinned = 1 THEN 0 ELSE 1 END WHERE id = ?`
  ),
  updateSessionSummary: db.prepare(
    `UPDATE sessions SET summary = ? WHERE id = ?`
  ),
  searchSessions: db.prepare(
    `SELECT s.*, ${MODE_CASE}
     FROM sessions s WHERE s.project_path = ? AND (s.title LIKE ? OR s.project_name LIKE ?) ORDER BY s.pinned DESC, s.last_used_at DESC LIMIT ?`
  ),
  searchSessionsAll: db.prepare(
    `SELECT s.*, ${MODE_CASE}
     FROM sessions s WHERE (s.title LIKE ? OR s.project_name LIKE ?) ORDER BY s.pinned DESC, s.last_used_at DESC LIMIT ?`
  ),
  // Session branching
  getMessagesByIdRange: db.prepare(
    `SELECT role, content, created_at FROM messages WHERE session_id = ? AND id <= ? AND chat_id IS NULL ORDER BY id ASC`
  ),
  getLastMessageId: db.prepare(
    `SELECT MAX(id) as maxId FROM messages WHERE session_id = ? AND chat_id IS NULL`
  ),
  getBranches: db.prepare(
    `SELECT s.*, ${MODE_CASE} FROM sessions s WHERE s.parent_session_id = ? ORDER BY s.created_at DESC`
  ),
  getBranchCount: db.prepare(
    `SELECT COUNT(*) as count FROM sessions WHERE parent_session_id = ?`
  ),
  orphanChildren: db.prepare(
    `UPDATE sessions SET parent_session_id = NULL WHERE parent_session_id = ?`
  ),
  getSessionCosts: db.prepare(
    `SELECT s.id, s.title, s.project_name, s.last_used_at,
            COALESCE(SUM(c.cost_usd), 0) AS total_cost,
            COALESCE(SUM(c.num_turns), 0) AS turns,
            COALESCE(SUM(c.input_tokens), 0) AS input_tokens,
            COALESCE(SUM(c.output_tokens), 0) AS output_tokens
     FROM sessions s
     LEFT JOIN costs c ON c.session_id = s.id
     WHERE s.project_path = ?
     GROUP BY s.id
     ORDER BY total_cost DESC`
  ),
  getSessionCostsAll: db.prepare(
    `SELECT s.id, s.title, s.project_name, s.last_used_at,
            COALESCE(SUM(c.cost_usd), 0) AS total_cost,
            COALESCE(SUM(c.num_turns), 0) AS turns,
            COALESCE(SUM(c.input_tokens), 0) AS input_tokens,
            COALESCE(SUM(c.output_tokens), 0) AS output_tokens
     FROM sessions s
     LEFT JOIN costs c ON c.session_id = s.id
     GROUP BY s.id
     ORDER BY total_cost DESC`
  ),
  getCostTimeline: db.prepare(
    `SELECT date(c.created_at, 'unixepoch') AS date,
            SUM(c.cost_usd) AS cost
     FROM costs c
     WHERE c.created_at >= unixepoch() - 30 * 86400
     GROUP BY date(c.created_at, 'unixepoch')
     ORDER BY date ASC`
  ),
  // Todo CRUD
  listTodos: db.prepare(`SELECT * FROM todos WHERE archived = 0 ORDER BY position ASC, id ASC`),
  listArchivedTodos: db.prepare(`SELECT * FROM todos WHERE archived = 1 ORDER BY updated_at DESC`),
  createTodo: db.prepare(`INSERT INTO todos (text, position) VALUES (?, (SELECT COALESCE(MAX(position),0)+1 FROM todos))`),
  updateTodo: db.prepare(`UPDATE todos SET text = COALESCE(?, text), done = COALESCE(?, done), priority = COALESCE(?, priority), updated_at = unixepoch() WHERE id = ?`),
  archiveTodo: db.prepare(`UPDATE todos SET archived = ?, updated_at = unixepoch() WHERE id = ?`),
  deleteTodo: db.prepare(`DELETE FROM todos WHERE id = ?`),
  todoCounts: db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM todos WHERE archived = 0) AS active,
      (SELECT COUNT(*) FROM todos WHERE archived = 1) AS archived,
      (SELECT COUNT(*) FROM brags) AS brags
  `),

  // Brag CRUD
  createBrag: db.prepare(`INSERT INTO brags (todo_id, text, summary) VALUES (?, ?, ?)`),
  listBrags: db.prepare(`SELECT * FROM brags ORDER BY created_at DESC`),
  deleteBrag: db.prepare(`DELETE FROM brags WHERE id = ?`),

  yearlyActivity: db.prepare(
    `SELECT
      date(c.created_at, 'unixepoch') AS date,
      COUNT(DISTINCT c.session_id) AS sessions,
      COUNT(*) AS queries,
      COALESCE(SUM(c.cost_usd), 0) AS cost,
      COALESCE(SUM(c.input_tokens), 0) AS input_tokens,
      COALESCE(SUM(c.output_tokens), 0) AS output_tokens,
      COALESCE(SUM(c.num_turns), 0) AS turns
    FROM costs c
    WHERE c.created_at >= unixepoch() - 365 * 86400
    GROUP BY date(c.created_at, 'unixepoch')
    ORDER BY date ASC`
  ),
  getCostTimelineByProject: db.prepare(
    `SELECT date(c.created_at, 'unixepoch') AS date,
            SUM(c.cost_usd) AS cost
     FROM costs c
     JOIN sessions s ON c.session_id = s.id
     WHERE s.project_path = ? AND c.created_at >= unixepoch() - 30 * 86400
     GROUP BY date(c.created_at, 'unixepoch')
     ORDER BY date ASC`
  ),
  getTotalTokens: db.prepare(
    `SELECT COALESCE(SUM(input_tokens), 0) AS input_tokens,
            COALESCE(SUM(output_tokens), 0) AS output_tokens
     FROM costs`
  ),
  getProjectTokens: db.prepare(
    `SELECT COALESCE(SUM(c.input_tokens), 0) AS input_tokens,
            COALESCE(SUM(c.output_tokens), 0) AS output_tokens
     FROM costs c JOIN sessions s ON c.session_id = s.id
     WHERE s.project_path = ?`
  ),
};

export function createSession(id, claudeSessionId, projectName, projectPath) {
  stmts.createSession.run(id, claudeSessionId, projectName, projectPath);
}

export function updateClaudeSessionId(id, claudeSessionId) {
  stmts.updateClaudeSessionId.run(claudeSessionId, id);
}

export function getSession(id) {
  return stmts.getSession.get(id);
}

export function listSessions(limit = 20, projectPath) {
  if (projectPath) {
    return stmts.listSessionsByProject.all(projectPath, limit);
  }
  return stmts.listSessions.all(limit);
}

export function touchSession(id) {
  stmts.touchSession.run(id);
}

export function addCost(sessionId, costUsd, durationMs, numTurns, inputTokens = 0, outputTokens = 0, { model = null, stopReason = null, isError = 0, cacheReadTokens = 0, cacheCreationTokens = 0 } = {}) {
  stmts.addCost.run(sessionId, costUsd, durationMs, numTurns, inputTokens, outputTokens, model, stopReason, isError, cacheReadTokens, cacheCreationTokens);
}

export function getTotalCost() {
  return stmts.getTotalCost.get().total;
}

export function getProjectCost(projectPath) {
  return stmts.getProjectCost.get(projectPath).total;
}

export function addMessage(sessionId, role, content, chatId = null, workflowMeta = null) {
  stmts.addMessage.run(sessionId, role, content, chatId, workflowMeta?.workflowId ?? null, workflowMeta?.stepIndex ?? null, workflowMeta?.stepLabel ?? null);
}

export function getMessages(sessionId) {
  return stmts.getMessages.all(sessionId);
}

export function getMessagesByChatId(sessionId, chatId) {
  return stmts.getMessagesByChatId.all(sessionId, chatId);
}

export function getMessagesNoChatId(sessionId) {
  return stmts.getMessagesNoChatId.all(sessionId);
}

// Paginated message fetchers — return messages in ASC order
export function getRecentMessages(sessionId, limit) {
  return stmts.getRecentMessages.all(sessionId, limit).reverse();
}

export function getRecentMessagesByChatId(sessionId, chatId, limit) {
  return stmts.getRecentMessagesByChatId.all(sessionId, chatId, limit).reverse();
}

export function getRecentMessagesNoChatId(sessionId, limit) {
  return stmts.getRecentMessagesNoChatId.all(sessionId, limit).reverse();
}

export function getOlderMessages(sessionId, beforeId, limit) {
  return stmts.getOlderMessages.all(sessionId, beforeId, limit).reverse();
}

export function getOlderMessagesByChatId(sessionId, chatId, beforeId, limit) {
  return stmts.getOlderMessagesByChatId.all(sessionId, chatId, beforeId, limit).reverse();
}

export function getOlderMessagesNoChatId(sessionId, beforeId, limit) {
  return stmts.getOlderMessagesNoChatId.all(sessionId, beforeId, limit).reverse();
}

export function setClaudeSession(sessionId, chatId, claudeSessionId) {
  stmts.setClaudeSession.run(sessionId, chatId, claudeSessionId);
}

export function getClaudeSessionId(sessionId, chatId) {
  const row = stmts.getClaudeSessionId.get(sessionId, chatId);
  return row ? row.claude_session_id : null;
}

export function allClaudeSessions() {
  return stmts.allClaudeSessions.all();
}

export function updateSessionTitle(id, title) {
  stmts.updateSessionTitle.run(title, id);
}

export function toggleSessionPin(id) {
  stmts.toggleSessionPin.run(id);
}

export function updateSessionSummary(id, summary) {
  stmts.updateSessionSummary.run(summary, id);
}

export function searchSessions(query, limit = 20, projectPath) {
  const pattern = `%${query}%`;
  if (projectPath) {
    return stmts.searchSessions.all(projectPath, pattern, pattern, limit);
  }
  return stmts.searchSessionsAll.all(pattern, pattern, limit);
}

export const deleteSession = db.transaction((id) => {
  // Orphan child forks before deleting parent
  stmts.orphanChildren.run(id);
  db.prepare("DELETE FROM claude_sessions WHERE session_id = ?").run(id);
  db.prepare("DELETE FROM costs WHERE session_id = ?").run(id);
  db.prepare("DELETE FROM messages WHERE session_id = ?").run(id);
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
});

// ── Session Branching / Forking ─────────────────────────
export const forkSession = db.transaction((parentSessionId, forkMessageId) => {
  const parent = stmts.getSession.get(parentSessionId);
  if (!parent) throw new Error("Session not found");

  if (!forkMessageId) {
    const last = stmts.getLastMessageId.get(parentSessionId);
    forkMessageId = last?.maxId;
    if (!forkMessageId) throw new Error("No messages to fork");
  }

  const newId = createHash("sha256")
    .update(parentSessionId + Date.now() + Math.random())
    .digest("hex")
    .slice(0, 36);
  const title = `Fork of: ${parent.title || parent.project_name || "Untitled"}`;

  db.prepare(
    `INSERT INTO sessions (id, project_name, project_path, title, parent_session_id, fork_message_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(newId, parent.project_name, parent.project_path, title, parentSessionId, forkMessageId);

  const messages = stmts.getMessagesByIdRange.all(parentSessionId, forkMessageId);
  const insertMsg = db.prepare(
    "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)"
  );
  for (const msg of messages) {
    insertMsg.run(newId, msg.role, msg.content, msg.created_at);
  }

  return stmts.getSession.get(newId);
});

export function getSessionBranches(sessionId) {
  return stmts.getBranches.all(sessionId);
}

export function getSessionBranchCount(sessionId) {
  return stmts.getBranchCount.get(sessionId).count;
}

export function getSessionLineage(sessionId) {
  const ancestors = [];
  let current = stmts.getSession.get(sessionId);
  while (current && current.parent_session_id) {
    const parent = stmts.getSession.get(current.parent_session_id);
    if (!parent) break;
    ancestors.unshift(parent);
    current = parent;
  }
  // Get siblings (other forks of the same parent)
  const session = stmts.getSession.get(sessionId);
  let siblings = [];
  if (session?.parent_session_id) {
    siblings = stmts.getBranches.all(session.parent_session_id)
      .filter(s => s.id !== sessionId);
  }
  return { ancestors, siblings };
}

export function getSessionCosts(projectPath) {
  if (projectPath) {
    return stmts.getSessionCosts.all(projectPath);
  }
  return stmts.getSessionCostsAll.all();
}

export function getCostTimeline(projectPath) {
  if (projectPath) {
    return stmts.getCostTimelineByProject.all(projectPath);
  }
  return stmts.getCostTimeline.all();
}

export function getTotalTokens() {
  return stmts.getTotalTokens.get();
}

export function getProjectTokens(projectPath) {
  return stmts.getProjectTokens.get(projectPath);
}

// ── Error categorization CASE (reused in multiple queries) ────
const ERROR_CATEGORY_CASE = `
  CASE
    WHEN json_extract(tr.content, '$.content') LIKE '%ENOENT%'
      OR json_extract(tr.content, '$.content') LIKE '%does not exist%'
      OR json_extract(tr.content, '$.content') LIKE '%No such file%'
      THEN 'File Not Found'
    WHEN json_extract(tr.content, '$.content') LIKE '%Denied by user%'
      OR json_extract(tr.content, '$.content') LIKE '%Aborted by user%'
      THEN 'User Denied'
    WHEN json_extract(tr.content, '$.content') LIKE '%timed out%'
      THEN 'Timeout'
    WHEN json_extract(tr.content, '$.content') LIKE '%File has not been read%'
      OR json_extract(tr.content, '$.content') LIKE '%File has been modified%'
      THEN 'File State Error'
    WHEN json_extract(tr.content, '$.content') LIKE '%EISDIR%'
      OR json_extract(tr.content, '$.content') LIKE '%illegal operation on a directory%'
      THEN 'Directory Error'
    WHEN json_extract(tr.content, '$.content') LIKE '%Found % matches%'
      THEN 'Multiple Matches'
    WHEN json_extract(tr.content, '$.content') LIKE '%command not found%'
      THEN 'Command Not Found'
    WHEN json_extract(tr.content, '$.content') LIKE '%npm error%'
      OR json_extract(tr.content, '$.content') LIKE '%SyntaxError%'
      OR json_extract(tr.content, '$.content') LIKE '%error TS%'
      THEN 'Build/Runtime Error'
    ELSE 'Other'
  END`;

// ── Analytics queries ──────────────────────────────────────────

const analyticsStmts = {
  overviewAll: db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM sessions) AS sessions,
      COUNT(*) AS queries,
      COALESCE(SUM(cost_usd), 0) AS totalCost,
      COALESCE(SUM(num_turns), 0) AS totalTurns,
      COALESCE(SUM(output_tokens), 0) AS totalOutputTokens
    FROM costs
  `),
  overviewByProject: db.prepare(`
    SELECT
      COUNT(DISTINCT s.id) AS sessions,
      COUNT(c.id) AS queries,
      COALESCE(SUM(c.cost_usd), 0) AS totalCost,
      COALESCE(SUM(c.num_turns), 0) AS totalTurns,
      COALESCE(SUM(c.output_tokens), 0) AS totalOutputTokens
    FROM sessions s
    LEFT JOIN costs c ON c.session_id = s.id
    WHERE s.project_path = ?
  `),
  errorRateAll: db.prepare(`
    SELECT
      COUNT(CASE WHEN json_extract(content, '$.isError') = 1 THEN 1 END) AS errors,
      COUNT(*) AS total
    FROM messages WHERE role = 'tool_result'
  `),
  errorRateByProject: db.prepare(`
    SELECT
      COUNT(CASE WHEN json_extract(m.content, '$.isError') = 1 THEN 1 END) AS errors,
      COUNT(*) AS total
    FROM messages m
    JOIN sessions s ON m.session_id = s.id
    WHERE m.role = 'tool_result' AND s.project_path = ?
  `),
  dailyBreakdownAll: db.prepare(`
    SELECT
      date(c.created_at, 'unixepoch') AS date,
      COUNT(*) AS queries,
      SUM(c.cost_usd) AS cost,
      SUM(c.num_turns) AS turns,
      SUM(c.output_tokens) AS output_tok
    FROM costs c
    WHERE c.created_at >= unixepoch() - 30 * 86400
    GROUP BY date(c.created_at, 'unixepoch')
    ORDER BY date ASC
  `),
  dailyBreakdownByProject: db.prepare(`
    SELECT
      date(c.created_at, 'unixepoch') AS date,
      COUNT(*) AS queries,
      SUM(c.cost_usd) AS cost,
      SUM(c.num_turns) AS turns,
      SUM(c.output_tokens) AS output_tok
    FROM costs c
    JOIN sessions s ON c.session_id = s.id
    WHERE s.project_path = ? AND c.created_at >= unixepoch() - 30 * 86400
    GROUP BY date(c.created_at, 'unixepoch')
    ORDER BY date ASC
  `),
  hourlyActivityAll: db.prepare(`
    SELECT
      CAST(strftime('%H', c.created_at, 'unixepoch', 'localtime') AS INTEGER) AS hour,
      COUNT(*) AS queries,
      SUM(c.cost_usd) AS cost
    FROM costs c
    GROUP BY strftime('%H', c.created_at, 'unixepoch', 'localtime')
    ORDER BY hour ASC
  `),
  hourlyActivityByProject: db.prepare(`
    SELECT
      CAST(strftime('%H', c.created_at, 'unixepoch', 'localtime') AS INTEGER) AS hour,
      COUNT(*) AS queries,
      SUM(c.cost_usd) AS cost
    FROM costs c
    JOIN sessions s ON c.session_id = s.id
    WHERE s.project_path = ?
    GROUP BY strftime('%H', c.created_at, 'unixepoch', 'localtime')
    ORDER BY hour ASC
  `),
  projectBreakdown: db.prepare(`
    SELECT
      s.project_name AS name,
      s.project_path AS path,
      COUNT(DISTINCT s.id) AS sessions,
      COUNT(c.id) AS queries,
      COALESCE(SUM(c.cost_usd), 0) AS totalCost,
      CASE WHEN COUNT(DISTINCT s.id) > 0
        THEN COALESCE(SUM(c.cost_usd), 0) / COUNT(DISTINCT s.id)
        ELSE 0 END AS avgCost,
      CASE WHEN COUNT(DISTINCT s.id) > 0
        THEN COALESCE(SUM(c.num_turns), 0) / COUNT(DISTINCT s.id)
        ELSE 0 END AS avgTurns
    FROM sessions s
    LEFT JOIN costs c ON c.session_id = s.id
    GROUP BY s.project_path
    ORDER BY totalCost DESC
  `),
  topSessionsAll: db.prepare(`
    SELECT
      s.title,
      s.project_name AS project,
      COALESCE(SUM(c.cost_usd), 0) AS cost,
      COALESCE(SUM(c.num_turns), 0) AS turns,
      COUNT(c.id) AS queries,
      COALESCE(SUM(c.duration_ms), 0) / 60000.0 AS duration_min
    FROM sessions s
    LEFT JOIN costs c ON c.session_id = s.id
    GROUP BY s.id
    HAVING cost > 0
    ORDER BY cost DESC
    LIMIT 10
  `),
  topSessionsByProject: db.prepare(`
    SELECT
      s.title,
      s.project_name AS project,
      COALESCE(SUM(c.cost_usd), 0) AS cost,
      COALESCE(SUM(c.num_turns), 0) AS turns,
      COUNT(c.id) AS queries,
      COALESCE(SUM(c.duration_ms), 0) / 60000.0 AS duration_min
    FROM sessions s
    LEFT JOIN costs c ON c.session_id = s.id
    WHERE s.project_path = ?
    GROUP BY s.id
    HAVING cost > 0
    ORDER BY cost DESC
    LIMIT 10
  `),
  toolUsageAll: db.prepare(`
    SELECT
      json_extract(content, '$.name') AS name,
      COUNT(*) AS count
    FROM messages
    WHERE role = 'tool' AND json_extract(content, '$.name') IS NOT NULL
    GROUP BY json_extract(content, '$.name')
    ORDER BY count DESC
  `),
  toolUsageByProject: db.prepare(`
    SELECT
      json_extract(m.content, '$.name') AS name,
      COUNT(*) AS count
    FROM messages m
    JOIN sessions s ON m.session_id = s.id
    WHERE m.role = 'tool' AND s.project_path = ? AND json_extract(m.content, '$.name') IS NOT NULL
    GROUP BY json_extract(m.content, '$.name')
    ORDER BY count DESC
  `),
  toolErrorsAll: db.prepare(`
    SELECT
      json_extract(t.content, '$.name') AS name,
      COUNT(CASE WHEN json_extract(tr.content, '$.isError') = 1 THEN 1 END) AS errors,
      COUNT(*) AS total,
      CAST(COUNT(CASE WHEN json_extract(tr.content, '$.isError') = 1 THEN 1 END) AS REAL) / NULLIF(COUNT(*), 0) * 100 AS errorRate
    FROM messages t
    JOIN messages tr ON tr.session_id = t.session_id
      AND tr.role = 'tool_result'
      AND json_extract(tr.content, '$.toolUseId') = json_extract(t.content, '$.id')
    WHERE t.role = 'tool'
    GROUP BY json_extract(t.content, '$.name')
    HAVING errors > 0
    ORDER BY errors DESC
  `),
  toolErrorsByProject: db.prepare(`
    SELECT
      json_extract(t.content, '$.name') AS name,
      COUNT(CASE WHEN json_extract(tr.content, '$.isError') = 1 THEN 1 END) AS errors,
      COUNT(*) AS total,
      CAST(COUNT(CASE WHEN json_extract(tr.content, '$.isError') = 1 THEN 1 END) AS REAL) / NULLIF(COUNT(*), 0) * 100 AS errorRate
    FROM messages t
    JOIN messages tr ON tr.session_id = t.session_id
      AND tr.role = 'tool_result'
      AND json_extract(tr.content, '$.toolUseId') = json_extract(t.content, '$.id')
    JOIN sessions s ON t.session_id = s.id
    WHERE t.role = 'tool' AND s.project_path = ?
    GROUP BY json_extract(t.content, '$.name')
    HAVING errors > 0
    ORDER BY errors DESC
  `),
  sessionDepthAll: db.prepare(`
    SELECT
      CASE
        WHEN cnt = 1 THEN '1 query'
        WHEN cnt BETWEEN 2 AND 3 THEN '2-3'
        WHEN cnt BETWEEN 4 AND 6 THEN '4-6'
        WHEN cnt BETWEEN 7 AND 10 THEN '7-10'
        ELSE '10+'
      END AS bucket,
      COUNT(*) AS count,
      AVG(total_cost) AS avgCost
    FROM (
      SELECT s.id, COUNT(c.id) AS cnt, COALESCE(SUM(c.cost_usd), 0) AS total_cost
      FROM sessions s
      LEFT JOIN costs c ON c.session_id = s.id
      GROUP BY s.id
      HAVING cnt > 0
    )
    GROUP BY bucket
    ORDER BY MIN(cnt)
  `),
  sessionDepthByProject: db.prepare(`
    SELECT
      CASE
        WHEN cnt = 1 THEN '1 query'
        WHEN cnt BETWEEN 2 AND 3 THEN '2-3'
        WHEN cnt BETWEEN 4 AND 6 THEN '4-6'
        WHEN cnt BETWEEN 7 AND 10 THEN '7-10'
        ELSE '10+'
      END AS bucket,
      COUNT(*) AS count,
      AVG(total_cost) AS avgCost
    FROM (
      SELECT s.id, COUNT(c.id) AS cnt, COALESCE(SUM(c.cost_usd), 0) AS total_cost
      FROM sessions s
      LEFT JOIN costs c ON c.session_id = s.id
      WHERE s.project_path = ?
      GROUP BY s.id
      HAVING cnt > 0
    )
    GROUP BY bucket
    ORDER BY MIN(cnt)
  `),
  msgLengthAll: db.prepare(`
    SELECT
      CASE
        WHEN len < 100 THEN '<100'
        WHEN len BETWEEN 100 AND 499 THEN '100-499'
        WHEN len BETWEEN 500 AND 999 THEN '500-999'
        WHEN len BETWEEN 1000 AND 4999 THEN '1k-5k'
        ELSE '5k+'
      END AS bucket,
      COUNT(*) AS count,
      CAST(AVG(len) AS INTEGER) AS avgChars
    FROM (
      SELECT LENGTH(json_extract(content, '$.text')) AS len
      FROM messages
      WHERE role = 'user' AND json_extract(content, '$.text') IS NOT NULL
    )
    WHERE len > 0
    GROUP BY bucket
    ORDER BY MIN(len)
  `),
  msgLengthByProject: db.prepare(`
    SELECT
      CASE
        WHEN len < 100 THEN '<100'
        WHEN len BETWEEN 100 AND 499 THEN '100-499'
        WHEN len BETWEEN 500 AND 999 THEN '500-999'
        WHEN len BETWEEN 1000 AND 4999 THEN '1k-5k'
        ELSE '5k+'
      END AS bucket,
      COUNT(*) AS count,
      CAST(AVG(len) AS INTEGER) AS avgChars
    FROM (
      SELECT LENGTH(json_extract(m.content, '$.text')) AS len
      FROM messages m
      JOIN sessions s ON m.session_id = s.id
      WHERE m.role = 'user' AND s.project_path = ? AND json_extract(m.content, '$.text') IS NOT NULL
    )
    WHERE len > 0
    GROUP BY bucket
    ORDER BY MIN(len)
  `),
  topBashCommandsAll: db.prepare(`
    SELECT
      SUBSTR(json_extract(content, '$.input.command'), 1, 80) AS command,
      COUNT(*) AS count
    FROM messages
    WHERE role = 'tool' AND json_extract(content, '$.name') = 'Bash'
      AND json_extract(content, '$.input.command') IS NOT NULL
    GROUP BY SUBSTR(json_extract(content, '$.input.command'), 1, 80)
    ORDER BY count DESC
    LIMIT 10
  `),
  topBashCommandsByProject: db.prepare(`
    SELECT
      SUBSTR(json_extract(m.content, '$.input.command'), 1, 80) AS command,
      COUNT(*) AS count
    FROM messages m
    JOIN sessions s ON m.session_id = s.id
    WHERE m.role = 'tool' AND s.project_path = ? AND json_extract(m.content, '$.name') = 'Bash'
      AND json_extract(m.content, '$.input.command') IS NOT NULL
    GROUP BY SUBSTR(json_extract(m.content, '$.input.command'), 1, 80)
    ORDER BY count DESC
    LIMIT 10
  `),
  topFilesAll: db.prepare(`
    SELECT
      json_extract(content, '$.input.file_path') AS path,
      COUNT(*) AS count,
      json_extract(content, '$.name') AS tool
    FROM messages
    WHERE role = 'tool'
      AND json_extract(content, '$.name') IN ('Read', 'Write', 'Edit')
      AND json_extract(content, '$.input.file_path') IS NOT NULL
    GROUP BY json_extract(content, '$.input.file_path'), json_extract(content, '$.name')
    ORDER BY count DESC
    LIMIT 15
  `),
  topFilesByProject: db.prepare(`
    SELECT
      json_extract(m.content, '$.input.file_path') AS path,
      COUNT(*) AS count,
      json_extract(m.content, '$.name') AS tool
    FROM messages m
    JOIN sessions s ON m.session_id = s.id
    WHERE m.role = 'tool' AND s.project_path = ?
      AND json_extract(m.content, '$.name') IN ('Read', 'Write', 'Edit')
      AND json_extract(m.content, '$.input.file_path') IS NOT NULL
    GROUP BY json_extract(m.content, '$.input.file_path'), json_extract(m.content, '$.name')
    ORDER BY count DESC
    LIMIT 15
  `),

  // ── Error pattern analytics ──────────────────────────────────
  errorCategoriesAll: db.prepare(`
    SELECT ${ERROR_CATEGORY_CASE} AS category, COUNT(*) AS count
    FROM messages tr
    WHERE tr.role = 'tool_result' AND json_extract(tr.content, '$.isError') = 1
    GROUP BY category
    ORDER BY count DESC
  `),
  errorCategoriesByProject: db.prepare(`
    SELECT ${ERROR_CATEGORY_CASE} AS category, COUNT(*) AS count
    FROM messages tr
    JOIN sessions s ON tr.session_id = s.id
    WHERE tr.role = 'tool_result' AND json_extract(tr.content, '$.isError') = 1
      AND s.project_path = ?
    GROUP BY category
    ORDER BY count DESC
  `),
  errorTimelineAll: db.prepare(`
    SELECT date(tr.created_at, 'unixepoch') AS date, COUNT(*) AS errors
    FROM messages tr
    WHERE tr.role = 'tool_result' AND json_extract(tr.content, '$.isError') = 1
      AND tr.created_at >= unixepoch() - 30 * 86400
    GROUP BY date(tr.created_at, 'unixepoch')
    ORDER BY date ASC
  `),
  errorTimelineByProject: db.prepare(`
    SELECT date(tr.created_at, 'unixepoch') AS date, COUNT(*) AS errors
    FROM messages tr
    JOIN sessions s ON tr.session_id = s.id
    WHERE tr.role = 'tool_result' AND json_extract(tr.content, '$.isError') = 1
      AND s.project_path = ? AND tr.created_at >= unixepoch() - 30 * 86400
    GROUP BY date(tr.created_at, 'unixepoch')
    ORDER BY date ASC
  `),
  errorsByToolAll: db.prepare(`
    SELECT
      COALESCE(json_extract(t.content, '$.name'), 'Unknown') AS tool,
      ${ERROR_CATEGORY_CASE} AS category,
      COUNT(*) AS errors
    FROM messages tr
    LEFT JOIN messages t ON t.session_id = tr.session_id
      AND t.role = 'tool'
      AND json_extract(t.content, '$.id') = json_extract(tr.content, '$.toolUseId')
    WHERE tr.role = 'tool_result' AND json_extract(tr.content, '$.isError') = 1
    GROUP BY tool, category
    ORDER BY errors DESC
  `),
  errorsByToolByProject: db.prepare(`
    SELECT
      COALESCE(json_extract(t.content, '$.name'), 'Unknown') AS tool,
      ${ERROR_CATEGORY_CASE} AS category,
      COUNT(*) AS errors
    FROM messages tr
    JOIN sessions s ON tr.session_id = s.id
    LEFT JOIN messages t ON t.session_id = tr.session_id
      AND t.role = 'tool'
      AND json_extract(t.content, '$.id') = json_extract(tr.content, '$.toolUseId')
    WHERE tr.role = 'tool_result' AND json_extract(tr.content, '$.isError') = 1
      AND s.project_path = ?
    GROUP BY tool, category
    ORDER BY errors DESC
  `),
  recentErrorsAll: db.prepare(`
    SELECT
      COALESCE(json_extract(t.content, '$.name'), 'Unknown') AS tool,
      SUBSTR(json_extract(tr.content, '$.content'), 1, 200) AS preview,
      json_extract(tr.content, '$.content') AS full_content,
      s.title AS session_title,
      tr.created_at AS timestamp
    FROM messages tr
    JOIN sessions s ON tr.session_id = s.id
    LEFT JOIN messages t ON t.session_id = tr.session_id
      AND t.role = 'tool'
      AND json_extract(t.content, '$.id') = json_extract(tr.content, '$.toolUseId')
    WHERE tr.role = 'tool_result' AND json_extract(tr.content, '$.isError') = 1
    ORDER BY tr.created_at DESC
    LIMIT 20
  `),
  recentErrorsByProject: db.prepare(`
    SELECT
      COALESCE(json_extract(t.content, '$.name'), 'Unknown') AS tool,
      SUBSTR(json_extract(tr.content, '$.content'), 1, 200) AS preview,
      json_extract(tr.content, '$.content') AS full_content,
      s.title AS session_title,
      tr.created_at AS timestamp
    FROM messages tr
    JOIN sessions s ON tr.session_id = s.id
    LEFT JOIN messages t ON t.session_id = tr.session_id
      AND t.role = 'tool'
      AND json_extract(t.content, '$.id') = json_extract(tr.content, '$.toolUseId')
    WHERE tr.role = 'tool_result' AND json_extract(tr.content, '$.isError') = 1
      AND s.project_path = ?
    ORDER BY tr.created_at DESC
    LIMIT 20
  `),

  // ── Model usage & cache efficiency ─────────────────────────
  modelUsageAll: db.prepare(`
    SELECT
      COALESCE(model, 'unknown') AS model,
      COUNT(*) AS count,
      COALESCE(SUM(cost_usd), 0) AS cost,
      COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
    FROM costs
    GROUP BY COALESCE(model, 'unknown')
    ORDER BY cost DESC
  `),
  modelUsageByProject: db.prepare(`
    SELECT
      COALESCE(c.model, 'unknown') AS model,
      COUNT(*) AS count,
      COALESCE(SUM(c.cost_usd), 0) AS cost,
      COALESCE(SUM(c.input_tokens + c.output_tokens), 0) AS tokens
    FROM costs c
    JOIN sessions s ON c.session_id = s.id
    WHERE s.project_path = ?
    GROUP BY COALESCE(c.model, 'unknown')
    ORDER BY cost DESC
  `),
  cacheEfficiencyAll: db.prepare(`
    SELECT
      date(c.created_at, 'unixepoch') AS date,
      COALESCE(SUM(c.cache_read_tokens), 0) AS cache_read,
      COALESCE(SUM(c.cache_creation_tokens), 0) AS cache_creation,
      COALESCE(SUM(c.input_tokens), 0) AS total_input
    FROM costs c
    WHERE c.created_at >= unixepoch() - 30 * 86400
    GROUP BY date(c.created_at, 'unixepoch')
    ORDER BY date ASC
  `),
  cacheEfficiencyByProject: db.prepare(`
    SELECT
      date(c.created_at, 'unixepoch') AS date,
      COALESCE(SUM(c.cache_read_tokens), 0) AS cache_read,
      COALESCE(SUM(c.cache_creation_tokens), 0) AS cache_creation,
      COALESCE(SUM(c.input_tokens), 0) AS total_input
    FROM costs c
    JOIN sessions s ON c.session_id = s.id
    WHERE s.project_path = ? AND c.created_at >= unixepoch() - 30 * 86400
    GROUP BY date(c.created_at, 'unixepoch')
    ORDER BY date ASC
  `),
};

export function getAnalyticsOverview(projectPath) {
  const overview = projectPath
    ? analyticsStmts.overviewByProject.get(projectPath)
    : analyticsStmts.overviewAll.get();
  const errors = projectPath
    ? analyticsStmts.errorRateByProject.get(projectPath)
    : analyticsStmts.errorRateAll.get();
  return {
    ...overview,
    errorRate: errors.total > 0 ? (errors.errors / errors.total * 100) : 0,
  };
}

export function getDailyBreakdown(projectPath) {
  return projectPath
    ? analyticsStmts.dailyBreakdownByProject.all(projectPath)
    : analyticsStmts.dailyBreakdownAll.all();
}

export function getHourlyActivity(projectPath) {
  return projectPath
    ? analyticsStmts.hourlyActivityByProject.all(projectPath)
    : analyticsStmts.hourlyActivityAll.all();
}

export function getProjectBreakdown() {
  return analyticsStmts.projectBreakdown.all();
}

export function getTopSessionsByCost(projectPath) {
  return projectPath
    ? analyticsStmts.topSessionsByProject.all(projectPath)
    : analyticsStmts.topSessionsAll.all();
}

export function getToolUsage(projectPath) {
  return projectPath
    ? analyticsStmts.toolUsageByProject.all(projectPath)
    : analyticsStmts.toolUsageAll.all();
}

export function getToolErrors(projectPath) {
  return projectPath
    ? analyticsStmts.toolErrorsByProject.all(projectPath)
    : analyticsStmts.toolErrorsAll.all();
}

export function getSessionDepth(projectPath) {
  return projectPath
    ? analyticsStmts.sessionDepthByProject.all(projectPath)
    : analyticsStmts.sessionDepthAll.all();
}

export function getMsgLengthDistribution(projectPath) {
  return projectPath
    ? analyticsStmts.msgLengthByProject.all(projectPath)
    : analyticsStmts.msgLengthAll.all();
}

export function getTopBashCommands(projectPath) {
  return projectPath
    ? analyticsStmts.topBashCommandsByProject.all(projectPath)
    : analyticsStmts.topBashCommandsAll.all();
}

export function getTopFiles(projectPath) {
  return projectPath
    ? analyticsStmts.topFilesByProject.all(projectPath)
    : analyticsStmts.topFilesAll.all();
}

export function getErrorCategories(projectPath) {
  return projectPath
    ? analyticsStmts.errorCategoriesByProject.all(projectPath)
    : analyticsStmts.errorCategoriesAll.all();
}

export function getErrorTimeline(projectPath) {
  return projectPath
    ? analyticsStmts.errorTimelineByProject.all(projectPath)
    : analyticsStmts.errorTimelineAll.all();
}

export function getErrorsByTool(projectPath) {
  return projectPath
    ? analyticsStmts.errorsByToolByProject.all(projectPath)
    : analyticsStmts.errorsByToolAll.all();
}

export function getRecentErrors(projectPath) {
  return projectPath
    ? analyticsStmts.recentErrorsByProject.all(projectPath)
    : analyticsStmts.recentErrorsAll.all();
}

export function getModelUsage(projectPath) {
  return projectPath
    ? analyticsStmts.modelUsageByProject.all(projectPath)
    : analyticsStmts.modelUsageAll.all();
}

export function getYearlyActivity() {
  return stmts.yearlyActivity.all();
}

export function getCacheEfficiency(projectPath) {
  return projectPath
    ? analyticsStmts.cacheEfficiencyByProject.all(projectPath)
    : analyticsStmts.cacheEfficiencyAll.all();
}

// ── Todo CRUD ────────────────────────────────────────────────
export function listTodos(archived = false) {
  return archived ? stmts.listArchivedTodos.all() : stmts.listTodos.all();
}
export function createTodo(text) { return stmts.createTodo.run(text); }
export function updateTodo(id, text, done, priority) { return stmts.updateTodo.run(text, done, priority, id); }
export function archiveTodo(id, archived) { return stmts.archiveTodo.run(archived ? 1 : 0, id); }
export function deleteTodo(id) { return stmts.deleteTodo.run(id); }

export function getTodoCounts() { return stmts.todoCounts.get(); }

// ── Brag CRUD ─────────────────────────────────────────────────
export function createBrag(todoId, text, summary) { return stmts.createBrag.run(todoId, text, summary); }
export function listBrags() { return stmts.listBrags.all(); }
export function deleteBrag(id) { return stmts.deleteBrag.run(id); }

// ── Push subscription queries ────────────────────────────────
const pushStmts = {
  upsert: db.prepare(
    `INSERT INTO push_subscriptions (endpoint, keys_p256dh, keys_auth)
     VALUES (?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET keys_p256dh = excluded.keys_p256dh, keys_auth = excluded.keys_auth`
  ),
  delete: db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`),
  getAll: db.prepare(`SELECT * FROM push_subscriptions`),
};

export function upsertPushSubscription(endpoint, p256dh, auth) {
  pushStmts.upsert.run(endpoint, p256dh, auth);
}

export function deletePushSubscription(endpoint) {
  pushStmts.delete.run(endpoint);
}

export function getAllPushSubscriptions() {
  return pushStmts.getAll.all();
}

// ── Agent context (shared memory) ─────────────────────────
const ctxStmts = {
  set: db.prepare(
    `INSERT INTO agent_context (run_id, agent_id, key, value)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(run_id, agent_id, key) DO UPDATE SET value = excluded.value`
  ),
  get: db.prepare(
    `SELECT value FROM agent_context WHERE run_id = ? AND agent_id = ? AND key = ?`
  ),
  getAllForRun: db.prepare(
    `SELECT agent_id, key, value, created_at FROM agent_context WHERE run_id = ? ORDER BY created_at ASC`
  ),
  getByKey: db.prepare(
    `SELECT agent_id, value FROM agent_context WHERE run_id = ? AND key = ?`
  ),
  deleteRun: db.prepare(
    `DELETE FROM agent_context WHERE run_id = ?`
  ),
};

export function setAgentContext(runId, agentId, key, value) {
  ctxStmts.set.run(runId, agentId, key, typeof value === "string" ? value : JSON.stringify(value));
}

export function getAgentContext(runId, agentId, key) {
  const row = ctxStmts.get.get(runId, agentId, key);
  return row ? row.value : null;
}

export function getAllAgentContext(runId) {
  return ctxStmts.getAllForRun.all(runId);
}

export function getAgentContextByKey(runId, key) {
  return ctxStmts.getByKey.all(runId, key);
}

export function deleteAgentContext(runId) {
  ctxStmts.deleteRun.run(runId);
}

// ── Agent runs (monitoring) ────────────────────────────
const runStmts = {
  insert: db.prepare(
    `INSERT INTO agent_runs (run_id, agent_id, agent_title, run_type, parent_id, status)
     VALUES (?, ?, ?, ?, ?, 'running')`
  ),
  complete: db.prepare(
    `UPDATE agent_runs SET status = ?, turns = ?, cost_usd = ?, duration_ms = ?,
     input_tokens = ?, output_tokens = ?, error = ?, completed_at = unixepoch()
     WHERE run_id = ? AND agent_id = ?`
  ),
  listRecent: db.prepare(
    `SELECT * FROM agent_runs ORDER BY started_at DESC LIMIT ?`
  ),
  agentSummary: db.prepare(
    `SELECT
      agent_id, agent_title,
      COUNT(*) AS runs,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS successes,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errors,
      COALESCE(SUM(cost_usd), 0) AS total_cost,
      COALESCE(AVG(CASE WHEN status = 'completed' THEN cost_usd END), 0) AS avg_cost,
      COALESCE(AVG(CASE WHEN status = 'completed' THEN duration_ms END), 0) AS avg_duration,
      COALESCE(AVG(CASE WHEN status = 'completed' THEN turns END), 0) AS avg_turns,
      COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
      COALESCE(SUM(output_tokens), 0) AS total_output_tokens
    FROM agent_runs
    GROUP BY agent_id
    ORDER BY total_cost DESC`
  ),
  overview: db.prepare(
    `SELECT
      COUNT(*) AS total_runs,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errored,
      COALESCE(SUM(cost_usd), 0) AS total_cost,
      COALESCE(AVG(CASE WHEN status = 'completed' THEN duration_ms END), 0) AS avg_duration,
      COALESCE(AVG(CASE WHEN status = 'completed' THEN turns END), 0) AS avg_turns,
      COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
      COALESCE(SUM(output_tokens), 0) AS total_output_tokens
    FROM agent_runs`
  ),
  byType: db.prepare(
    `SELECT
      run_type,
      COUNT(*) AS runs,
      COALESCE(SUM(cost_usd), 0) AS cost,
      COALESCE(AVG(duration_ms), 0) AS avg_duration
    FROM agent_runs
    GROUP BY run_type
    ORDER BY runs DESC`
  ),
  dailyRuns: db.prepare(
    `SELECT
      date(started_at, 'unixepoch') AS date,
      COUNT(*) AS runs,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS errored,
      COALESCE(SUM(cost_usd), 0) AS cost
    FROM agent_runs
    WHERE started_at >= unixepoch() - 30 * 86400
    GROUP BY date(started_at, 'unixepoch')
    ORDER BY date ASC`
  ),
};

export function recordAgentRunStart(runId, agentId, agentTitle, runType = 'single', parentId = null) {
  runStmts.insert.run(runId, agentId, agentTitle, runType, parentId);
}

export function recordAgentRunComplete(runId, agentId, status, turns, costUsd, durationMs, inputTokens, outputTokens, error = null) {
  runStmts.complete.run(status, turns, costUsd, durationMs, inputTokens, outputTokens, error, runId, agentId);
}

export function getAgentRunsRecent(limit = 50) {
  return runStmts.listRecent.all(limit);
}

export function getAgentRunsSummary() {
  return runStmts.agentSummary.all();
}

export function getAgentRunsOverview() {
  return runStmts.overview.get();
}

export function getAgentRunsByType() {
  return runStmts.byType.all();
}

export function getAgentRunsDaily() {
  return runStmts.dailyRuns.all();
}

// ── Notifications ────────────────────────────────────────
const notifStmts = {
  insert: db.prepare(
    `INSERT INTO notifications (type, title, body, metadata, source_session_id, source_agent_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ),
  history: db.prepare(
    `SELECT * FROM notifications ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ),
  historyUnread: db.prepare(
    `SELECT * FROM notifications WHERE read_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ),
  historyByType: db.prepare(
    `SELECT * FROM notifications WHERE type = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ),
  historyByTypeUnread: db.prepare(
    `SELECT * FROM notifications WHERE type = ? AND read_at IS NULL ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ),
  unreadCount: db.prepare(
    `SELECT COUNT(*) as count FROM notifications WHERE read_at IS NULL`
  ),
  markRead: db.prepare(
    `UPDATE notifications SET read_at = unixepoch() WHERE id = ? AND read_at IS NULL`
  ),
  markAllRead: db.prepare(
    `UPDATE notifications SET read_at = unixepoch() WHERE read_at IS NULL`
  ),
  markReadBefore: db.prepare(
    `UPDATE notifications SET read_at = unixepoch() WHERE read_at IS NULL AND created_at < ?`
  ),
  purgeOld: db.prepare(
    `DELETE FROM notifications WHERE created_at < unixepoch() - (? * 86400)`
  ),
  markStaleRead: db.prepare(
    `UPDATE notifications SET read_at = unixepoch() WHERE read_at IS NULL AND created_at < unixepoch() - (7 * 86400)`
  ),
};

export function createNotification(type, title, body = null, metadata = null, sourceSessionId = null, sourceAgentId = null) {
  const result = notifStmts.insert.run(type, title, body, metadata, sourceSessionId, sourceAgentId);
  return {
    id: result.lastInsertRowid,
    type, title, body, metadata,
    source_session_id: sourceSessionId,
    source_agent_id: sourceAgentId,
    read_at: null,
    created_at: Math.floor(Date.now() / 1000),
  };
}

export function getNotificationHistory(limit = 20, offset = 0, unreadOnly = false, type = null) {
  if (type && unreadOnly) return notifStmts.historyByTypeUnread.all(type, limit, offset);
  if (type) return notifStmts.historyByType.all(type, limit, offset);
  if (unreadOnly) return notifStmts.historyUnread.all(limit, offset);
  return notifStmts.history.all(limit, offset);
}

export function getUnreadNotificationCount() {
  return notifStmts.unreadCount.get().count;
}

export function markNotificationsRead(ids) {
  const tx = db.transaction((idList) => {
    for (const id of idList) notifStmts.markRead.run(id);
  });
  tx(ids);
}

export function markAllNotificationsRead() {
  notifStmts.markAllRead.run();
}

export function markNotificationsReadBefore(timestamp) {
  notifStmts.markReadBefore.run(timestamp);
}

export function purgeOldNotifications(days = 90) {
  notifStmts.markStaleRead.run();
  notifStmts.purgeOld.run(days);
}

// ── Worktrees ─────────────────────────────────────────────
const wtStmts = {
  create: db.prepare(
    `INSERT INTO worktrees (id, session_id, project_path, worktree_path, branch_name, base_branch, status, user_prompt)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`
  ),
  get: db.prepare(`SELECT * FROM worktrees WHERE id = ?`),
  listByProject: db.prepare(
    `SELECT * FROM worktrees WHERE project_path = ? ORDER BY created_at DESC`
  ),
  listActive: db.prepare(
    `SELECT * FROM worktrees WHERE status IN ('active', 'completed') ORDER BY created_at DESC`
  ),
  updateStatus: db.prepare(
    `UPDATE worktrees SET status = ?, completed_at = unixepoch() WHERE id = ?`
  ),
  updateSession: db.prepare(
    `UPDATE worktrees SET session_id = ? WHERE id = ?`
  ),
  delete: db.prepare(`DELETE FROM worktrees WHERE id = ?`),
};

export function createWorktreeRecord(id, sessionId, projectPath, worktreePath, branchName, baseBranch, userPrompt) {
  wtStmts.create.run(id, sessionId, projectPath, worktreePath, branchName, baseBranch, userPrompt);
}

export function getWorktreeRecord(id) {
  return wtStmts.get.get(id);
}

export function listWorktreesByProject(projectPath) {
  return wtStmts.listByProject.all(projectPath);
}

export function listActiveWorktrees() {
  return wtStmts.listActive.all();
}

export function updateWorktreeStatus(id, status) {
  wtStmts.updateStatus.run(status, id);
}

export function updateWorktreeSession(id, sessionId) {
  wtStmts.updateSession.run(sessionId, id);
}

export function deleteWorktreeRecord(id) {
  wtStmts.delete.run(id);
}

// ── Memories (persistent cross-session context) ──────────
function hashContent(projectPath, content) {
  return createHash("sha256").update(`${projectPath}:${content}`).digest("hex");
}

const memStmts = {
  insert: db.prepare(
    `INSERT OR IGNORE INTO memories (project_path, category, content, content_hash, source_session_id, source_agent_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ),
  findByHash: db.prepare(
    `SELECT id FROM memories WHERE project_path = ? AND content_hash = ?`
  ),
  list: db.prepare(
    `SELECT * FROM memories WHERE project_path = ?
     ORDER BY relevance_score DESC, accessed_at DESC`
  ),
  listByCategory: db.prepare(
    `SELECT * FROM memories WHERE project_path = ? AND category = ?
     ORDER BY relevance_score DESC, accessed_at DESC`
  ),
  searchFts: db.prepare(
    `SELECT m.* FROM memories m
     JOIN memories_fts fts ON fts.rowid = m.id
     WHERE m.project_path = ? AND memories_fts MATCH ?
     ORDER BY rank, m.relevance_score DESC LIMIT ?`
  ),
  searchLike: db.prepare(
    `SELECT * FROM memories WHERE project_path = ? AND content LIKE ?
     ORDER BY relevance_score DESC LIMIT ?`
  ),
  topRelevant: db.prepare(
    `SELECT * FROM memories WHERE project_path = ?
     ORDER BY relevance_score DESC, accessed_at DESC LIMIT ?`
  ),
  update: db.prepare(
    `UPDATE memories SET content = ?, category = ? WHERE id = ?`
  ),
  touch: db.prepare(
    `UPDATE memories SET accessed_at = unixepoch(),
     relevance_score = MIN(relevance_score + 0.1, 2.0) WHERE id = ?`
  ),
  decay: db.prepare(
    `UPDATE memories SET relevance_score = MAX(relevance_score * 0.95, 0.1)
     WHERE project_path = ? AND accessed_at < unixepoch() - ?`
  ),
  delete: db.prepare(`DELETE FROM memories WHERE id = ?`),
  deleteExpired: db.prepare(
    `DELETE FROM memories WHERE expires_at IS NOT NULL AND expires_at < unixepoch()`
  ),
  count: db.prepare(
    `SELECT category, COUNT(*) as count FROM memories
     WHERE project_path = ? GROUP BY category`
  ),
  stats: db.prepare(
    `SELECT COUNT(*) as total,
     SUM(CASE WHEN accessed_at > unixepoch() - 86400 THEN 1 ELSE 0 END) as accessed_today,
     AVG(relevance_score) as avg_relevance
     FROM memories WHERE project_path = ?`
  ),
};

export function createMemory(projectPath, category, content, sourceSessionId = null, sourceAgentId = null) {
  const hash = hashContent(projectPath, content);
  // Dedup: if identical content already exists, just touch it
  const existing = memStmts.findByHash.get(projectPath, hash);
  if (existing) {
    memStmts.touch.run(existing.id);
    return { lastInsertRowid: existing.id, changes: 0, isDuplicate: true };
  }
  return memStmts.insert.run(projectPath, category, content, hash, sourceSessionId, sourceAgentId);
}

export function listMemories(projectPath, category = null) {
  if (category) return memStmts.listByCategory.all(projectPath, category);
  return memStmts.list.all(projectPath);
}

export function searchMemories(projectPath, queryText, limit = 20) {
  // Try FTS5 first, fall back to LIKE for non-FTS-compatible queries
  try {
    const ftsQuery = queryText.split(/\s+/).filter(Boolean).map(w => `"${w}"`).join(" OR ");
    if (ftsQuery) {
      return memStmts.searchFts.all(projectPath, ftsQuery, limit);
    }
  } catch {
    // FTS parse error — fall back
  }
  return memStmts.searchLike.all(projectPath, `%${queryText}%`, limit);
}

export function getTopMemories(projectPath, limit = 10) {
  return memStmts.topRelevant.all(projectPath, limit);
}

export function updateMemory(id, content, category) {
  return memStmts.update.run(content, category, id);
}

export function touchMemory(id) {
  return memStmts.touch.run(id);
}

export function decayMemories(projectPath, olderThanSecs = 604800) {
  return memStmts.decay.run(projectPath, olderThanSecs);
}

export function deleteMemory(id) {
  return memStmts.delete.run(id);
}

export function deleteExpiredMemories() {
  return memStmts.deleteExpired.run();
}

export function getMemoryCounts(projectPath) {
  return memStmts.count.all(projectPath);
}

export function getMemoryStats(projectPath) {
  return memStmts.stats.get(projectPath);
}

// Run decay + cleanup for a project (call on session start)
export function maintainMemories(projectPath) {
  decayMemories(projectPath, 604800); // 7 days
  deleteExpiredMemories();
}

export function getDb() {
  return db;
}

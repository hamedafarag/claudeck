import Database from "better-sqlite3";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const db = new Database(join(__dirname, "data.db"));

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
`);

// Migrations
try { db.exec(`ALTER TABLE messages ADD COLUMN chat_id TEXT DEFAULT NULL`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE sessions ADD COLUMN title TEXT DEFAULT NULL`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE sessions ADD COLUMN pinned INTEGER DEFAULT 0`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE costs ADD COLUMN input_tokens INTEGER DEFAULT 0`); } catch { /* exists */ }
try { db.exec(`ALTER TABLE costs ADD COLUMN output_tokens INTEGER DEFAULT 0`); } catch { /* exists */ }

// Indexes for query performance
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_messages_session_chat ON messages(session_id, chat_id);
  CREATE INDEX IF NOT EXISTS idx_costs_session_id ON costs(session_id);
  CREATE INDEX IF NOT EXISTS idx_costs_created_at ON costs(created_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_project_path ON sessions(project_path);
  CREATE INDEX IF NOT EXISTS idx_sessions_pinned_last_used ON sessions(pinned DESC, last_used_at DESC);
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
    `INSERT INTO costs (session_id, cost_usd, duration_ms, num_turns, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?, ?)`
  ),
  addMessage: db.prepare(
    `INSERT INTO messages (session_id, role, content, chat_id) VALUES (?, ?, ?, ?)`
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
  searchSessions: db.prepare(
    `SELECT s.*, ${MODE_CASE}
     FROM sessions s WHERE s.project_path = ? AND (s.title LIKE ? OR s.project_name LIKE ?) ORDER BY s.pinned DESC, s.last_used_at DESC LIMIT ?`
  ),
  searchSessionsAll: db.prepare(
    `SELECT s.*, ${MODE_CASE}
     FROM sessions s WHERE (s.title LIKE ? OR s.project_name LIKE ?) ORDER BY s.pinned DESC, s.last_used_at DESC LIMIT ?`
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

export function addCost(sessionId, costUsd, durationMs, numTurns, inputTokens = 0, outputTokens = 0) {
  stmts.addCost.run(sessionId, costUsd, durationMs, numTurns, inputTokens, outputTokens);
}

export function getTotalCost() {
  return stmts.getTotalCost.get().total;
}

export function getProjectCost(projectPath) {
  return stmts.getProjectCost.get(projectPath).total;
}

export function addMessage(sessionId, role, content, chatId = null) {
  stmts.addMessage.run(sessionId, role, content, chatId);
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

export function searchSessions(query, limit = 20, projectPath) {
  const pattern = `%${query}%`;
  if (projectPath) {
    return stmts.searchSessions.all(projectPath, pattern, pattern, limit);
  }
  return stmts.searchSessionsAll.all(pattern, pattern, limit);
}

export const deleteSession = db.transaction((id) => {
  db.prepare("DELETE FROM claude_sessions WHERE session_id = ?").run(id);
  db.prepare("DELETE FROM costs WHERE session_id = ?").run(id);
  db.prepare("DELETE FROM messages WHERE session_id = ?").run(id);
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
});

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

export function getDb() {
  return db;
}

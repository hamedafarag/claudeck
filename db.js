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

export function getDb() {
  return db;
}

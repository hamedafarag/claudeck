import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getDb, allClaudeSessions } from "./db.js";

// Route modules
import projectsRouter from "./server/routes/projects.js";
import sessionsRouter, { setSessionIds } from "./server/routes/sessions.js";
import messagesRouter from "./server/routes/messages.js";
import promptsRouter from "./server/routes/prompts.js";
import statsRouter from "./server/routes/stats.js";
import filesRouter from "./server/routes/files.js";
import workflowsRouter from "./server/routes/workflows.js";
import execRouter from "./server/routes/exec.js";
import linearRouter from "./server/routes/linear.js";
import mcpRouter from "./server/routes/mcp.js";
import { setupWebSocket } from "./server/ws-handler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

app.use(express.static(join(__dirname, "public")));
app.use(express.json());

// Restore session mappings from DB on startup
const sessionIds = new Map();
{
  const db = getDb();
  const rows = db
    .prepare("SELECT id, claude_session_id FROM sessions WHERE claude_session_id IS NOT NULL")
    .all();
  for (const row of rows) {
    sessionIds.set(row.id, row.claude_session_id);
  }
  const csRows = allClaudeSessions();
  for (const row of csRows) {
    const key = row.chat_id ? `${row.session_id}::${row.chat_id}` : row.session_id;
    sessionIds.set(key, row.claude_session_id);
  }
  console.log(`Restored ${sessionIds.size} session mappings from DB`);
}

// Share sessionIds with sessions router
setSessionIds(sessionIds);

// Mount routes
app.use("/api/projects", projectsRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/sessions", messagesRouter);
app.use("/api/prompts", promptsRouter);
app.use("/api/stats", statsRouter);
app.get("/api/account", (req, res, next) => {
  // Forward to stats router which handles /account
  req.url = "/account";
  statsRouter(req, res, next);
});
app.use("/api/files", filesRouter);
app.use("/api/workflows", workflowsRouter);
app.use("/api/exec", execRouter);
app.use("/api/linear", linearRouter);
app.use("/api/mcp", mcpRouter);

// WebSocket
setupWebSocket(wss, sessionIds);

const PORT = process.env.PORT || 9009;
server.listen(PORT, () => {
  console.log(`shawkat-ai running at http://localhost:${PORT}`);
});

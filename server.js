import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { appendFileSync, readdirSync, existsSync } from "fs";
import webpush from "web-push";
import { getDb, allClaudeSessions } from "./db.js";
import { initPushSender } from "./server/push-sender.js";
import { initTelegramSender } from "./server/telegram-sender.js";
import telegramRouter from "./server/routes/telegram.js";

// Route modules
import projectsRouter from "./server/routes/projects.js";
import sessionsRouter, { setSessionIds } from "./server/routes/sessions.js";
import messagesRouter from "./server/routes/messages.js";
import promptsRouter from "./server/routes/prompts.js";
import statsRouter from "./server/routes/stats.js";
import filesRouter from "./server/routes/files.js";
import workflowsRouter from "./server/routes/workflows.js";
import agentsRouter from "./server/routes/agents.js";
import execRouter from "./server/routes/exec.js";
import linearRouter from "./server/routes/linear.js";
import mcpRouter from "./server/routes/mcp.js";
import reposRouter from "./server/routes/repos.js";
import tipsRouter from "./server/routes/tips.js";
import botRouter from "./server/routes/bot.js";
import todosRouter from "./server/routes/todos.js";
import notificationsRouter, { setVapidPublicKey } from "./server/routes/notifications.js";
import { setupWebSocket } from "./server/ws-handler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

app.use(express.static(join(__dirname, "public")));
app.use(express.json());

// ── Web Push (VAPID) setup ──────────────────────────────────
{
  let vapidPublic = process.env.VAPID_PUBLIC_KEY;
  let vapidPrivate = process.env.VAPID_PRIVATE_KEY;

  if (!vapidPublic || !vapidPrivate) {
    const generated = webpush.generateVAPIDKeys();
    vapidPublic = generated.publicKey;
    vapidPrivate = generated.privateKey;
    // Persist to .env so keys survive restarts
    appendFileSync(join(__dirname, ".env"), `\nVAPID_PUBLIC_KEY="${vapidPublic}"\nVAPID_PRIVATE_KEY="${vapidPrivate}"\n`);
    console.log("Generated and saved VAPID keys to .env");
  }

  webpush.setVapidDetails("mailto:push@codedeck.local", vapidPublic, vapidPrivate);
  setVapidPublicKey(vapidPublic);
  initPushSender(webpush);
}

// ── Telegram notifications ──
initTelegramSender();

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
app.use("/api/agents", agentsRouter);
app.use("/api/exec", execRouter);
app.use("/api/linear", linearRouter);
app.use("/api/mcp", mcpRouter);
app.use("/api/repos", reposRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/tips", tipsRouter);
app.use("/api/bot", botRouter);
app.use("/api/todos", todosRouter);
app.use("/api/telegram", telegramRouter);

// Plugin discovery — auto-detect tab-sdk plugins in public/js/plugins/
app.get("/api/plugins", (req, res) => {
  const pluginsDir = join(__dirname, "public/js/plugins");
  if (!existsSync(pluginsDir)) return res.json([]);
  const files = readdirSync(pluginsDir);
  const plugins = files
    .filter(f => f.endsWith(".js"))
    .map(f => {
      const name = f.replace(/\.js$/, "");
      const hasCss = files.includes(name + ".css");
      return { name, js: `js/plugins/${f}`, css: hasCss ? `js/plugins/${name}.css` : null };
    });
  res.json(plugins);
});

// WebSocket
setupWebSocket(wss, sessionIds);

const PORT = process.env.PORT || 9009;
server.listen(PORT, () => {
  console.log(`CodeDeck running at http://localhost:${PORT}`);
});

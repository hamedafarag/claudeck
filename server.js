import { userDir, userPluginsDir } from "./server/paths.js";
import { mountPluginRoutes } from "./server/plugin-mount.js";
import dotenv from "dotenv";
dotenv.config({ path: join(userDir, ".env") });
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { appendFileSync, readdirSync, existsSync, statSync } from "fs";
import webpush from "web-push";
import { getDb, allClaudeSessions } from "./db.js";
import { initPushSender } from "./server/push-sender.js";
import { initTelegramSender } from "./server/telegram-sender.js";
import { startTelegramPoller, stopTelegramPoller } from "./server/telegram-poller.js";
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
import mcpRouter from "./server/routes/mcp.js";
import tipsRouter from "./server/routes/tips.js";
import botRouter from "./server/routes/bot.js";
import notificationsRouter, { setVapidPublicKey } from "./server/routes/notifications.js";
import memoryRouter from "./server/routes/memory.js";
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
    appendFileSync(join(userDir, ".env"), `\nVAPID_PUBLIC_KEY="${vapidPublic}"\nVAPID_PRIVATE_KEY="${vapidPrivate}"\n`);
    console.log("Generated and saved VAPID keys to ~/.claudeck/.env");
  }

  webpush.setVapidDetails("mailto:push@claudeck.local", vapidPublic, vapidPrivate);
  setVapidPublicKey(vapidPublic);
  initPushSender(webpush);
}

// ── Telegram notifications + poller ──
initTelegramSender().then(() => startTelegramPoller());

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
app.use("/api/mcp", mcpRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/tips", tipsRouter);
app.use("/api/bot", botRouter);
app.use("/api/telegram", telegramRouter);
app.use("/api/memory", memoryRouter);

// Version endpoint
import { readFileSync } from "fs";
const pkgVersion = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8")).version;
app.get("/api/version", (_req, res) => res.json({ version: pkgVersion }));

// Serve full-stack plugin client assets
const fullStackPluginsDir = join(__dirname, "plugins");
app.use("/plugins", express.static(fullStackPluginsDir));

// Serve user plugins from ~/.claudeck/plugins/
app.use("/user-plugins", express.static(userPluginsDir));

// Plugin discovery — merge built-in + user plugins
app.get("/api/plugins", (req, res) => {
  const plugins = [];

  // 1. Built-in full-stack plugins from plugins/ (project root)
  if (existsSync(fullStackPluginsDir)) {
    for (const name of readdirSync(fullStackPluginsDir)) {
      const dir = join(fullStackPluginsDir, name);
      if (!statSync(dir).isDirectory()) continue;
      if (!existsSync(join(dir, "client.js"))) continue;
      const hasCss = existsSync(join(dir, "client.css"));
      const hasServer = existsSync(join(dir, "server.js"));
      plugins.push({
        name,
        js: `plugins/${name}/client.js`,
        css: hasCss ? `plugins/${name}/client.css` : null,
        source: "builtin",
        apiBase: hasServer ? `/api/plugins/${name}` : null,
      });
    }
  }

  // 2. User plugins from ~/.claudeck/plugins/
  if (existsSync(userPluginsDir)) {
    for (const entry of readdirSync(userPluginsDir)) {
      const dir = join(userPluginsDir, entry);
      if (!existsSync(dir) || !statSync(dir).isDirectory() || !existsSync(join(dir, "client.js"))) continue;
      if (plugins.some(p => p.name === entry)) continue;
      const hasCss = existsSync(join(dir, "client.css"));
      const allowUserServer = process.env.CLAUDECK_USER_SERVER_PLUGINS === "true";
      const hasServer = allowUserServer && existsSync(join(dir, "server.js"));
      plugins.push({
        name: entry,
        js: `user-plugins/${entry}/client.js`,
        css: hasCss ? `user-plugins/${entry}/client.css` : null,
        source: "user",
        apiBase: hasServer ? `/api/plugins/${entry}` : null,
      });
    }
  }

  res.json(plugins);
});

// WebSocket
setupWebSocket(wss, sessionIds);

const PORT = process.env.PORT || 9009;

// Mount full-stack plugin routes, then start server
mountPluginRoutes(app, fullStackPluginsDir).then(() => {
  server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`
\x1b[36m   _____ _                 _           _
  / ____| |               | |         | |
 | |    | | __ _ _   _  __| | ___  ___| | __
 | |    | |/ _\` | | | |/ _\` |/ _ \\/ __| |/ /
 | |____| | (_| | |_| | (_| |  __/ (__|   <
  \\_____|_|\\__,_|\\__,_|\\__,_|\\___|\\___|_|\\_\\\x1b[0m

\x1b[2m  Browser UI for Claude Code\x1b[0m

  \x1b[1m\x1b[32m➜\x1b[0m  \x1b[1mReady:\x1b[0m   ${url}
  \x1b[2m➜  Port:\x1b[0m    ${PORT}
  \x1b[2m➜  Data:\x1b[0m    ~/.claudeck/
`);
  });
});

// Graceful shutdown
process.on("SIGINT", () => {
  stopTelegramPoller();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopTelegramPoller();
  process.exit(0);
});

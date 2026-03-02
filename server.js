import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { query } from "@anthropic-ai/claude-code";
import { readdir, readFile } from "fs/promises";
import { execFile, exec } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  createSession,
  updateClaudeSessionId,
  getSession,
  listSessions,
  touchSession,
  addCost,
  addMessage,
  getMessages,
  getMessagesByChatId,
  getMessagesNoChatId,
  getTotalCost,
  getProjectCost,
  getDb,
  setClaudeSession,
  getClaudeSessionId,
  allClaudeSessions,
  deleteSession,
  updateSessionTitle,
  toggleSessionPin,
  searchSessions,
  getSessionCosts,
  getCostTimeline,
} from "./db.js";

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
  // Restore from legacy sessions table
  const rows = db
    .prepare("SELECT id, claude_session_id FROM sessions WHERE claude_session_id IS NOT NULL")
    .all();
  for (const row of rows) {
    sessionIds.set(row.id, row.claude_session_id);
  }
  // Restore from claude_sessions table (parallel mode)
  const csRows = allClaudeSessions();
  for (const row of csRows) {
    const key = row.chat_id ? `${row.session_id}::${row.chat_id}` : row.session_id;
    sessionIds.set(key, row.claude_session_id);
  }
  console.log(`Restored ${sessionIds.size} session mappings from DB`);
}

// Load project configs into memory
let projectConfigs = [];
async function loadProjectConfigs() {
  try {
    const data = await readFile(join(__dirname, "folders.json"), "utf-8");
    projectConfigs = JSON.parse(data);
  } catch (err) {
    console.error("Failed to load project configs:", err.message);
    projectConfigs = [];
  }
}
loadProjectConfigs();

function getProjectSystemPrompt(cwd) {
  const project = projectConfigs.find((p) => p.path === cwd);
  return project?.systemPrompt || "";
}

// Serve configured project folders from folders.json
app.get("/api/projects", async (req, res) => {
  try {
    const data = await readFile(join(__dirname, "folders.json"), "utf-8");
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve prompt toolbox
app.get("/api/prompts", async (req, res) => {
  try {
    const data = await readFile(join(__dirname, "prompts.json"), "utf-8");
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a new prompt
app.post("/api/prompts", async (req, res) => {
  try {
    const { title, description, prompt } = req.body;
    if (!title || !description || !prompt) {
      return res.status(400).json({ error: "title, description, and prompt are required" });
    }
    const filePath = join(__dirname, "prompts.json");
    const data = JSON.parse(await readFile(filePath, "utf-8"));
    data.push({ title, description, prompt });
    const { writeFile } = await import("fs/promises");
    await writeFile(filePath, JSON.stringify(data, null, 2) + "\n");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a prompt by index
app.delete("/api/prompts/:index", async (req, res) => {
  try {
    const idx = parseInt(req.params.index, 10);
    const filePath = join(__dirname, "prompts.json");
    const data = JSON.parse(await readFile(filePath, "utf-8"));
    if (idx < 0 || idx >= data.length) {
      return res.status(404).json({ error: "Prompt not found" });
    }
    data.splice(idx, 1);
    const { writeFile } = await import("fs/promises");
    await writeFile(filePath, JSON.stringify(data, null, 2) + "\n");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save/clear system prompt for a project
app.put("/api/projects/system-prompt", async (req, res) => {
  try {
    const { path: projectPath, systemPrompt } = req.body;
    if (!projectPath) return res.status(400).json({ error: "path is required" });
    const filePath = join(__dirname, "folders.json");
    const data = JSON.parse(await readFile(filePath, "utf-8"));
    const project = data.find((p) => p.path === projectPath);
    if (!project) return res.status(404).json({ error: "Project not found" });
    project.systemPrompt = systemPrompt || "";
    const { writeFile } = await import("fs/promises");
    await writeFile(filePath, JSON.stringify(data, null, 2) + "\n");
    await loadProjectConfigs();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Account info — cached in memory (fetched once via `claude auth status`)
let cachedAccountInfo = null;

app.get("/api/account", async (req, res) => {
  if (cachedAccountInfo) {
    return res.json(cachedAccountInfo);
  }
  try {
    const data = await new Promise((resolve, reject) => {
      execFile("claude", ["auth", "status"], (err, stdout) => {
        if (err) return reject(err);
        try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); }
      });
    });
    cachedAccountInfo = {
      email: data.email || null,
      plan: data.subscriptionType || null,
    };
  } catch (err) {
    console.error("Failed to fetch account info:", err.message);
    cachedAccountInfo = { email: null, plan: null };
  }
  res.json(cachedAccountInfo);
});

// List sessions from DB (optionally filtered by project_path)
app.get("/api/sessions", (req, res) => {
  try {
    const projectPath = req.query.project_path || undefined;
    const sessions = listSessions(20, projectPath);
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search sessions
app.get("/api/sessions/search", (req, res) => {
  try {
    const q = req.query.q || "";
    const projectPath = req.query.project_path || undefined;
    const sessions = searchSessions(q, 20, projectPath);
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a session
app.delete("/api/sessions/:id", (req, res) => {
  try {
    const id = req.params.id;
    deleteSession(id);
    // Clean up sessionIds map entries for this session
    for (const [key] of sessionIds) {
      if (key === id || key.startsWith(id + "::")) {
        sessionIds.delete(key);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update session title
app.put("/api/sessions/:id/title", (req, res) => {
  try {
    const { title } = req.body;
    if (typeof title !== "string") {
      return res.status(400).json({ error: "title is required" });
    }
    updateSessionTitle(req.params.id, title.slice(0, 200));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle session pin
app.put("/api/sessions/:id/pin", (req, res) => {
  try {
    toggleSessionPin(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cost dashboard
app.get("/api/stats/dashboard", (req, res) => {
  try {
    const projectPath = req.query.project_path || undefined;
    const sessions = getSessionCosts(projectPath);
    const timeline = getCostTimeline(projectPath);
    const totalCost = getTotalCost();
    const projectCost = projectPath ? getProjectCost(projectPath) : null;
    res.json({ sessions, timeline, totalCost, projectCost });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stats — total cost (optionally filtered by project_path)
app.get("/api/stats", (req, res) => {
  try {
    const projectPath = req.query.project_path;
    const totalCost = getTotalCost();
    const projectCost = projectPath ? getProjectCost(projectPath) : null;
    res.json({ totalCost, projectCost });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages for a session (all messages)
app.get("/api/sessions/:id/messages", (req, res) => {
  try {
    const messages = getMessages(req.params.id);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages for a session filtered by chatId
app.get("/api/sessions/:id/messages/:chatId", (req, res) => {
  try {
    const messages = getMessagesByChatId(req.params.id, req.params.chatId);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages for a session where chat_id IS NULL (single-mode messages)
app.get("/api/sessions/:id/messages-single", (req, res) => {
  try {
    const messages = getMessagesNoChatId(req.params.id);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Execute a CLI command
app.post("/api/exec", (req, res) => {
  const { command, cwd } = req.body;
  if (!command) return res.status(400).json({ error: "command is required" });

  exec(command, {
    cwd: cwd || process.env.HOME,
    timeout: 30000,
    maxBuffer: 512 * 1024,
  }, (err, stdout, stderr) => {
    res.json({
      command,
      stdout: stdout || "",
      stderr: stderr || "",
      exitCode: err ? (err.code ?? 1) : 0,
    });
  });
});

// Serve workflows
app.get("/api/workflows", async (req, res) => {
  try {
    const data = await readFile(join(__dirname, "workflows.json"), "utf-8");
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// File listing for attachments (recursive, max depth 3)
app.get("/api/files", async (req, res) => {
  const basePath = req.query.path;
  if (!basePath) return res.status(400).json({ error: "path query param required" });

  const SKIP = new Set([".git", "node_modules", ".next", "dist", "build", ".cache", ".turbo", "__pycache__", ".venv", "venv", "coverage", ".nyc_output"]);
  const MAX_DEPTH = 3;
  const MAX_FILES = 500;
  const results = [];

  async function walk(dir, depth) {
    if (depth > MAX_DEPTH || results.length >= MAX_FILES) return;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= MAX_FILES) break;
        if (SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
        const full = join(dir, entry.name);
        const rel = full.slice(basePath.length + 1);
        if (entry.isDirectory()) {
          await walk(full, depth + 1);
        } else {
          results.push(rel);
        }
      }
    } catch { /* permission errors etc */ }
  }

  try {
    await walk(basePath, 0);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Read file content for attachments (50KB limit)
app.get("/api/files/content", async (req, res) => {
  const base = req.query.base;
  const filePath = req.query.path;
  if (!base || !filePath) return res.status(400).json({ error: "base and path required" });

  // Path traversal protection
  const resolved = join(base, filePath);
  if (!resolved.startsWith(base)) return res.status(403).json({ error: "path traversal detected" });

  try {
    const { stat } = await import("fs/promises");
    const stats = await stat(resolved);
    if (stats.size > 50 * 1024) {
      return res.status(413).json({ error: "File too large (50KB limit)" });
    }
    const content = await readFile(resolved, "utf-8");
    res.json({ content, path: filePath });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// Read project commands from .claude/commands/*.md and .claude/skills/*/SKILL.md
app.get("/api/projects/commands", async (req, res) => {
  const projectPath = req.query.path;
  if (!projectPath) return res.status(400).json({ error: "path is required" });

  const { readdir, stat } = await import("fs/promises");
  const commands = [];

  // 1. Read .claude/commands/*.md
  const commandsDir = join(projectPath, ".claude", "commands");
  try {
    const files = await readdir(commandsDir);
    for (const file of files.filter(f => f.endsWith(".md"))) {
      try {
        const filePath = join(commandsDir, file);
        if (!filePath.startsWith(commandsDir)) continue;
        const content = await readFile(filePath, "utf-8");
        const name = file.replace(/\.md$/, "");
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const description = titleMatch ? titleMatch[1].trim() : name;
        commands.push({ command: name, description, prompt: content, source: "command" });
      } catch { /* skip unreadable files */ }
    }
  } catch { /* .claude/commands/ doesn't exist */ }

  // 2. Read .claude/skills/*/SKILL.md
  const skillsDir = join(projectPath, ".claude", "skills");
  try {
    const entries = await readdir(skillsDir);
    for (const entry of entries) {
      try {
        const entryPath = join(skillsDir, entry);
        const s = await stat(entryPath);
        if (!s.isDirectory()) continue;
        const skillFile = join(entryPath, "SKILL.md");
        const content = await readFile(skillFile, "utf-8");
        // Parse YAML frontmatter
        let name = entry;
        let description = entry;
        let argumentHint = "";
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (fmMatch) {
          const fm = fmMatch[1];
          const nameMatch = fm.match(/^name:\s*(.+)$/m);
          const descMatch = fm.match(/^description:\s*(.+)$/m);
          const argMatch = fm.match(/^argument-hint:\s*"?(.+?)"?\s*$/m);
          if (nameMatch) name = nameMatch[1].trim();
          if (descMatch) description = descMatch[1].trim();
          if (argMatch) argumentHint = argMatch[1].trim();
        }
        commands.push({ command: name, description, prompt: content, source: "skill", argumentHint });
      } catch { /* skip unreadable skill dirs */ }
    }
  } catch { /* .claude/skills/ doesn't exist */ }

  res.json(commands);
});

wss.on("connection", (ws) => {
  const activeQueries = new Map(); // queryKey -> { abort }

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === "abort") {
      if (msg.chatId) {
        // Abort specific chat
        const q = activeQueries.get(msg.chatId);
        if (q) {
          q.abort();
          activeQueries.delete(msg.chatId);
        }
      } else {
        // Abort all (backwards compat for single mode)
        for (const q of activeQueries.values()) q.abort();
        activeQueries.clear();
      }
      return;
    }

    // Workflow handler — chains prompts sequentially
    if (msg.type === "workflow") {
      const { workflow, cwd, sessionId: clientSid, projectName } = msg;
      if (!workflow || !workflow.steps) return;

      function wfSend(payload) {
        if (ws.readyState !== 1) return;
        ws.send(JSON.stringify(payload));
      }

      wfSend({ type: "workflow_started", workflow: { id: workflow.id, title: workflow.title, steps: workflow.steps.map((s) => s.label) } });

      let resumeId = clientSid ? sessionIds.get(clientSid) : undefined;
      let resolvedSid = clientSid;

      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i];
        wfSend({ type: "workflow_step", stepIndex: i, status: "running" });

        const abortController = new AbortController();
        const stepOpts = {
          cwd: cwd || process.env.HOME,
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          abortController,
          maxTurns: 30,
        };

        const projectPrompt = getProjectSystemPrompt(cwd);
        if (projectPrompt) {
          stepOpts.appendSystemPrompt = projectPrompt;
        }

        if (resumeId) {
          stepOpts.resume = resumeId;
        }

        try {
          const q = query({ prompt: step.prompt, options: stepOpts });
          let claudeSessionId = null;

          for await (const sdkMsg of q) {
            if (ws.readyState !== 1) break;

            if (sdkMsg.type === "system" && sdkMsg.subtype === "init") {
              claudeSessionId = sdkMsg.session_id;
              const ourSid = resolvedSid || crypto.randomUUID();
              resolvedSid = ourSid;
              sessionIds.set(ourSid, claudeSessionId);

              if (!getSession(ourSid)) {
                createSession(ourSid, claudeSessionId, projectName || "Workflow", cwd || "");
                updateSessionTitle(ourSid, `Workflow: ${workflow.title}`);
              } else {
                updateClaudeSessionId(ourSid, claudeSessionId);
              }

              if (i === 0) {
                wfSend({ type: "session", sessionId: ourSid });
              }
              addMessage(resolvedSid, "user", JSON.stringify({ text: `[${step.label}] ${step.prompt}` }));
              continue;
            }

            if (sdkMsg.type === "assistant" && sdkMsg.message?.content) {
              for (const block of sdkMsg.message.content) {
                if (block.type === "text" && block.text) {
                  wfSend({ type: "text", text: block.text });
                  if (resolvedSid) addMessage(resolvedSid, "assistant", JSON.stringify({ text: block.text }));
                } else if (block.type === "tool_use") {
                  wfSend({ type: "tool", name: block.name, input: block.input });
                  if (resolvedSid) addMessage(resolvedSid, "tool", JSON.stringify({ name: block.name, input: block.input }));
                }
              }
              continue;
            }

            if (sdkMsg.type === "result") {
              if (sdkMsg.subtype === "success") {
                const sid = resolvedSid;
                if (sid) addCost(sid, sdkMsg.total_cost_usd || 0, sdkMsg.duration_ms || 0, sdkMsg.num_turns || 0);
                wfSend({ type: "result", duration_ms: sdkMsg.duration_ms, num_turns: sdkMsg.num_turns, cost_usd: sdkMsg.total_cost_usd, totalCost: getTotalCost() });
              }
              continue;
            }

            if (sdkMsg.type === "user" && sdkMsg.message?.content) {
              const blocks = Array.isArray(sdkMsg.message.content) ? sdkMsg.message.content : [];
              for (const block of blocks) {
                if (block.type === "tool_result") {
                  const text = Array.isArray(block.content) ? block.content.map(c => c.type === "text" ? c.text : "").join("") : typeof block.content === "string" ? block.content : "";
                  wfSend({ type: "tool_result", toolUseId: block.tool_use_id, content: text.slice(0, 2000), isError: block.is_error || false });
                }
              }
              continue;
            }
          }

          // Update resume ID for next step
          if (claudeSessionId) {
            resumeId = claudeSessionId;
          }
        } catch (err) {
          wfSend({ type: "error", error: `Workflow step "${step.label}" failed: ${err.message}` });
          break;
        }

        wfSend({ type: "workflow_step", stepIndex: i, status: "completed" });
      }

      wfSend({ type: "workflow_completed" });
      wfSend({ type: "done" });
      return;
    }

    if (msg.type !== "chat") return;

    const { message, cwd, sessionId: clientSid, projectName, chatId } = msg;
    const queryKey = chatId || "__default__";

    // Determine if we're resuming a session
    const sessionKey = chatId ? `${clientSid}::${chatId}` : clientSid;
    const resumeId = clientSid ? sessionIds.get(sessionKey) : undefined;

    // Touch existing session or prepare to create new one
    if (clientSid && getSession(clientSid)) {
      touchSession(clientSid);
    }

    const abortController = new AbortController();

    const opts = {
      cwd: cwd || process.env.HOME,
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      abortController,
      maxTurns: 30,
    };

    // Append custom system prompt if configured for this project
    const projectPrompt = getProjectSystemPrompt(cwd);
    if (projectPrompt) {
      opts.appendSystemPrompt = projectPrompt;
    }

    if (resumeId) {
      opts.resume = resumeId;
    }

    // Track resolved session ID for message persistence
    let resolvedSid = clientSid;

    // Helper to send messages with chatId included
    function wsSend(payload) {
      if (ws.readyState !== 1) return;
      if (chatId) payload.chatId = chatId;
      ws.send(JSON.stringify(payload));
    }

    try {
      const q = query({ prompt: message, options: opts });
      activeQueries.set(queryKey, { abort: () => abortController.abort() });

      let claudeSessionId = null;

      for await (const sdkMsg of q) {
        if (ws.readyState !== 1) break; // OPEN

        // Capture session ID from init message
        if (sdkMsg.type === "system" && sdkMsg.subtype === "init") {
          claudeSessionId = sdkMsg.session_id;
          const ourSid = clientSid || crypto.randomUUID();
          resolvedSid = ourSid;

          // Store in sessionIds map with composite key for parallel
          const sKey = chatId ? `${ourSid}::${chatId}` : ourSid;
          sessionIds.set(sKey, claudeSessionId);

          // Persist to DB
          if (!getSession(ourSid)) {
            createSession(ourSid, claudeSessionId, projectName || "Session", cwd || "");
          } else {
            updateClaudeSessionId(ourSid, claudeSessionId);
          }

          // Persist to claude_sessions table for parallel mode
          if (chatId) {
            setClaudeSession(ourSid, chatId, claudeSessionId);
          }

          wsSend({ type: "session", sessionId: ourSid });

          // Save the user message now that we have a resolved sid
          addMessage(resolvedSid, "user", JSON.stringify({ text: message }), chatId || null);

          // Auto-set session title from first user message
          const existingSession = getSession(ourSid);
          if (existingSession && !existingSession.title) {
            const title = message.slice(0, 100).split("\n")[0];
            updateSessionTitle(ourSid, title);
          }
          continue;
        }

        // Assistant message — extract text and tool_use blocks
        if (sdkMsg.type === "assistant" && sdkMsg.message?.content) {
          for (const block of sdkMsg.message.content) {
            if (block.type === "text" && block.text) {
              wsSend({ type: "text", text: block.text });
              if (resolvedSid) {
                addMessage(resolvedSid, "assistant", JSON.stringify({ text: block.text }), chatId || null);
              }
            } else if (block.type === "tool_use") {
              wsSend({
                type: "tool",
                name: block.name,
                input: block.input,
              });
              if (resolvedSid) {
                addMessage(resolvedSid, "tool", JSON.stringify({ name: block.name, input: block.input }), chatId || null);
              }
            }
          }
          continue;
        }

        // Result message
        if (sdkMsg.type === "result") {
          if (sdkMsg.subtype === "success") {
            // Persist cost to DB
            const costUsd = sdkMsg.total_cost_usd || 0;
            const durationMs = sdkMsg.duration_ms || 0;
            const numTurns = sdkMsg.num_turns || 0;
            const sid = resolvedSid || [...sessionIds.entries()].find(
              ([, v]) => v === claudeSessionId
            )?.[0];
            if (sid) {
              addCost(sid, costUsd, durationMs, numTurns);
            }

            const resultPayload = {
              duration_ms: sdkMsg.duration_ms,
              num_turns: sdkMsg.num_turns,
              cost_usd: sdkMsg.total_cost_usd,
              totalCost: getTotalCost(),
            };
            wsSend({ type: "result", ...resultPayload });
            if (resolvedSid) {
              addMessage(resolvedSid, "result", JSON.stringify({
                duration_ms: sdkMsg.duration_ms,
                num_turns: sdkMsg.num_turns,
                cost_usd: sdkMsg.total_cost_usd,
              }), chatId || null);
            }
          } else if (sdkMsg.subtype?.startsWith("error")) {
            const errMsg = sdkMsg.errors?.join(", ") || "Unknown error";
            wsSend({ type: "error", error: errMsg });
          }
          continue;
        }

        // User messages (tool results from Claude executing tools)
        if (sdkMsg.type === "user" && sdkMsg.message?.content) {
          const content = sdkMsg.message.content;
          const blocks = Array.isArray(content) ? content : [];
          for (const block of blocks) {
            if (block.type === "tool_result") {
              const text = Array.isArray(block.content)
                ? block.content.map(c => c.type === "text" ? c.text : "").join("")
                : typeof block.content === "string" ? block.content : "";
              const toolResultPayload = {
                toolUseId: block.tool_use_id,
                content: text.slice(0, 2000),
                isError: block.is_error || false,
              };
              wsSend({ type: "tool_result", ...toolResultPayload });
              if (resolvedSid) {
                addMessage(resolvedSid, "tool_result", JSON.stringify(toolResultPayload), chatId || null);
              }
            }
          }
          continue;
        }
      }

      wsSend({ type: "done" });
    } catch (err) {
      if (err.name === "AbortError") {
        wsSend({ type: "aborted" });
      } else {
        console.error("Query error:", err);
        wsSend({ type: "error", error: err.message });
      }
    } finally {
      activeQueries.delete(queryKey);
    }
  });
});

const PORT = process.env.PORT || 9009;
server.listen(PORT, () => {
  console.log(`shawkat-ai running at http://localhost:${PORT}`);
});

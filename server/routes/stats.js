import { Router } from "express";
import { execFile, exec } from "child_process";
import { join } from "path";
import { existsSync } from "fs";
import { homedir } from "os";
import {
  getTotalCost, getProjectCost, getSessionCosts, getCostTimeline, getTotalTokens, getProjectTokens,
  getAnalyticsOverview, getDailyBreakdown, getHourlyActivity, getProjectBreakdown,
  getTopSessionsByCost, getToolUsage, getToolErrors, getSessionDepth,
  getMsgLengthDistribution, getTopBashCommands, getTopFiles,
  getErrorCategories, getErrorTimeline, getErrorsByTool, getRecentErrors,
  getModelUsage, getCacheEfficiency, getYearlyActivity,
  getAgentRunsOverview, getAgentRunsSummary, getAgentRunsByType, getAgentRunsDaily, getAgentRunsRecent,
} from "../../db.js";

const router = Router();

// Account info — cached in memory
let cachedAccountInfo = null;

// Resolve claude binary — check common locations if not on PATH
function findClaudeBinary() {
  const home = homedir();
  const candidates = [
    join(home, ".local", "bin", "claude"),           // Linux
    "/usr/local/bin/claude",                          // macOS Homebrew
  ];
  if (process.platform === "win32") {
    candidates.push(join(home, "AppData", "Local", "Programs", "claude", "claude.exe"));
    candidates.push(join(home, ".claude", "local", "claude.exe"));
    // npm global installs on Windows — both .cmd shim and plain executable
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
    candidates.push(join(appData, "npm", "claude.cmd"));
    candidates.push(join(appData, "npm", "claude"));
  }
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return "claude"; // fallback to PATH
}
const claudeBin = findClaudeBinary();

router.get("/account", async (req, res) => {
  if (cachedAccountInfo) {
    return res.json(cachedAccountInfo);
  }
  try {
    const data = await new Promise((resolve, reject) => {
      const opts = { timeout: 10000, env: { ...process.env, FORCE_COLOR: "0" } };
      const cb = (err, stdout, stderr) => {
        if (err) return reject(err);
        const out = (stdout || "").trim();
        try { resolve(JSON.parse(out)); } catch {
          // claude auth status may not return JSON — extract what we can
          resolve({ email: null, subscriptionType: null, raw: out });
        }
      };
      // On Windows, use exec with shell so .cmd shims and PATH resolve correctly
      if (process.platform === "win32") {
        exec(`"${claudeBin}" auth status`, { ...opts, shell: true }, cb);
      } else {
        execFile(claudeBin, ["auth", "status"], opts, cb);
      }
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

// Cost dashboard
router.get("/dashboard", async (req, res) => {
  try {
    const projectPath = req.query.project_path || undefined;
    const sessions = await getSessionCosts(projectPath);
    const timeline = await getCostTimeline(projectPath);
    const totalCost = await getTotalCost();
    const projectCost = projectPath ? await getProjectCost(projectPath) : null;
    const totalTokens = await getTotalTokens();
    const projectTokens = projectPath ? await getProjectTokens(projectPath) : null;
    res.json({ sessions, timeline, totalCost, projectCost, totalTokens, projectTokens });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Analytics dashboard
router.get("/analytics", async (req, res) => {
  try {
    const projectPath = req.query.project_path || undefined;
    res.json({
      overview: await getAnalyticsOverview(projectPath),
      dailyBreakdown: await getDailyBreakdown(projectPath),
      hourlyActivity: await getHourlyActivity(projectPath),
      projectBreakdown: await getProjectBreakdown(),
      topSessions: await getTopSessionsByCost(projectPath),
      toolUsage: await getToolUsage(projectPath),
      toolErrors: await getToolErrors(projectPath),
      sessionDepth: await getSessionDepth(projectPath),
      msgLength: await getMsgLengthDistribution(projectPath),
      topBashCommands: await getTopBashCommands(projectPath),
      topFiles: await getTopFiles(projectPath),
      errorCategories: await getErrorCategories(projectPath),
      errorTimeline: await getErrorTimeline(projectPath),
      errorsByTool: await getErrorsByTool(projectPath),
      recentErrors: await getRecentErrors(projectPath),
      modelUsage: await getModelUsage(projectPath),
      cacheEfficiency: await getCacheEfficiency(projectPath),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Home page data — yearly activity grid + overview
router.get("/home", async (req, res) => {
  try {
    const yearlyActivity = await getYearlyActivity();
    const overview = await getAnalyticsOverview();
    res.json({ yearlyActivity, overview });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Agent monitoring dashboard
router.get("/agent-metrics", async (req, res) => {
  try {
    res.json({
      overview: await getAgentRunsOverview(),
      agents: await getAgentRunsSummary(),
      byType: await getAgentRunsByType(),
      daily: await getAgentRunsDaily(),
      recent: await getAgentRunsRecent(30),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stats — total cost (optionally filtered by project_path)
router.get("/", async (req, res) => {
  try {
    const projectPath = req.query.project_path;
    const totalCost = await getTotalCost();
    const projectCost = projectPath ? await getProjectCost(projectPath) : null;
    res.json({ totalCost, projectCost });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

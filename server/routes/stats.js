import { Router } from "express";
import { execFile } from "child_process";
import { getTotalCost, getProjectCost, getSessionCosts, getCostTimeline, getTotalTokens, getProjectTokens } from "../../db.js";

const router = Router();

// Account info — cached in memory
let cachedAccountInfo = null;

router.get("/account", async (req, res) => {
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

// Cost dashboard
router.get("/dashboard", (req, res) => {
  try {
    const projectPath = req.query.project_path || undefined;
    const sessions = getSessionCosts(projectPath);
    const timeline = getCostTimeline(projectPath);
    const totalCost = getTotalCost();
    const projectCost = projectPath ? getProjectCost(projectPath) : null;
    const totalTokens = getTotalTokens();
    const projectTokens = projectPath ? getProjectTokens(projectPath) : null;
    res.json({ sessions, timeline, totalCost, projectCost, totalTokens, projectTokens });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stats — total cost (optionally filtered by project_path)
router.get("/", (req, res) => {
  try {
    const projectPath = req.query.project_path;
    const totalCost = getTotalCost();
    const projectCost = projectPath ? getProjectCost(projectPath) : null;
    res.json({ totalCost, projectCost });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

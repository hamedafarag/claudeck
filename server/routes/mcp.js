import { Router } from "express";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname, isAbsolute } from "path";
import { homedir } from "os";

const router = Router();

const GLOBAL_SETTINGS = join(homedir(), ".claude", "settings.json");

function getSettingsPath(projectPath) {
  if (projectPath) {
    if (!isAbsolute(projectPath) || projectPath.includes("..")) {
      throw new Error("Invalid project path");
    }
    return join(projectPath, ".claude", "settings.json");
  }
  return GLOBAL_SETTINGS;
}

async function readSettings(settingsPath) {
  try {
    const content = await readFile(settingsPath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

async function writeSettings(settingsPath, settings) {
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
}

// List MCP servers (optional ?project=<path> for project-scoped)
router.get("/servers", async (req, res) => {
  try {
    const settingsPath = getSettingsPath(req.query.project);
    const settings = await readSettings(settingsPath);
    res.json({ servers: settings.mcpServers || {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create or update an MCP server
router.put("/servers/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const config = req.body;
    if (!config || typeof config !== "object") {
      return res.status(400).json({ error: "Invalid config" });
    }

    const settingsPath = getSettingsPath(req.query.project);
    const settings = await readSettings(settingsPath);
    if (!settings.mcpServers) settings.mcpServers = {};
    settings.mcpServers[name] = config;
    await writeSettings(settingsPath, settings);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete an MCP server
router.delete("/servers/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const settingsPath = getSettingsPath(req.query.project);
    const settings = await readSettings(settingsPath);
    if (settings.mcpServers) {
      delete settings.mcpServers[name];
      await writeSettings(settingsPath, settings);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

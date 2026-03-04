import { Router } from "express";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

const router = Router();

const SETTINGS_PATH = join(homedir(), ".claude", "settings.json");

async function readSettings() {
  try {
    const content = await readFile(SETTINGS_PATH, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

async function writeSettings(settings) {
  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
}

// List all MCP servers
router.get("/servers", async (req, res) => {
  try {
    const settings = await readSettings();
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

    const settings = await readSettings();
    if (!settings.mcpServers) settings.mcpServers = {};
    settings.mcpServers[name] = config;
    await writeSettings(settings);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete an MCP server
router.delete("/servers/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const settings = await readSettings();
    if (settings.mcpServers) {
      delete settings.mcpServers[name];
      await writeSettings(settings);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

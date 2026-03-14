import { Router } from "express";
import { readFile, readdir, stat, writeFile } from "fs/promises";
import { join, resolve, isAbsolute, dirname } from "path";
import { homedir } from "os";
import { configPath } from "../paths.js";

const router = Router();

// Load project configs into memory
let projectConfigs = [];
export async function loadProjectConfigs() {
  try {
    const data = await readFile(configPath("folders.json"), "utf-8");
    projectConfigs = JSON.parse(data);
  } catch (err) {
    console.error("Failed to load project configs:", err.message);
    projectConfigs = [];
  }
}
loadProjectConfigs();

export function getProjectSystemPrompt(cwd) {
  const project = projectConfigs.find((p) => p.path === cwd);
  return project?.systemPrompt || "";
}

// Serve configured project folders
router.get("/", async (req, res) => {
  try {
    const data = await readFile(configPath("folders.json"), "utf-8");
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save/clear system prompt for a project
router.put("/system-prompt", async (req, res) => {
  try {
    const { path: projectPath, systemPrompt } = req.body;
    if (!projectPath) return res.status(400).json({ error: "path is required" });
    const filePath = configPath("folders.json");
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

// Browse directories on the server filesystem
router.get("/browse", async (req, res) => {
  try {
    const requestedDir = req.query.dir || homedir();
    const current = resolve(requestedDir);

    // Security: ensure resolved path is valid
    if (!isAbsolute(current)) {
      return res.status(400).json({ error: "Invalid path" });
    }

    const s = await stat(current);
    if (!s.isDirectory()) {
      return res.status(400).json({ error: "Not a directory" });
    }

    const entries = await readdir(current, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => ({ name: e.name, path: join(current, e.name) }));

    const parent = current === "/" ? null : dirname(current);
    res.json({ current, parent, dirs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a new project to folders.json
router.post("/", async (req, res) => {
  try {
    const { name, path: projectPath } = req.body;
    if (!name || !projectPath) {
      return res.status(400).json({ error: "name and path are required" });
    }

    const resolvedPath = resolve(projectPath);

    // Validate path exists and is a directory
    const s = await stat(resolvedPath);
    if (!s.isDirectory()) {
      return res.status(400).json({ error: "Path is not a directory" });
    }

    const filePath = configPath("folders.json");
    const data = JSON.parse(await readFile(filePath, "utf-8"));

    // Check for duplicate path
    if (data.some((p) => p.path === resolvedPath)) {
      return res.status(409).json({ error: "Project with this path already exists" });
    }

    data.push({ name, path: resolvedPath });
    await writeFile(filePath, JSON.stringify(data, null, 2) + "\n");
    await loadProjectConfigs();
    res.json({ ok: true, project: { name, path: resolvedPath } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove a project from folders.json
router.delete("/", async (req, res) => {
  try {
    const { path: projectPath } = req.body;
    if (!projectPath) {
      return res.status(400).json({ error: "path is required" });
    }

    const filePath = configPath("folders.json");
    const data = JSON.parse(await readFile(filePath, "utf-8"));
    const filtered = data.filter((p) => p.path !== projectPath);

    if (filtered.length === data.length) {
      return res.status(404).json({ error: "Project not found" });
    }

    await writeFile(filePath, JSON.stringify(filtered, null, 2) + "\n");
    await loadProjectConfigs();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Read project commands from .claude/commands/*.md and .claude/skills/*/SKILL.md
router.get("/commands", async (req, res) => {
  const projectPath = req.query.path;
  if (!projectPath) return res.status(400).json({ error: "path is required" });

  const { readdir, stat } = await import("fs/promises");
  const commands = [];

  // 1. Read .claude/commands/*.md and .claude/commands/<subfolder>/*.md
  const commandsDir = join(projectPath, ".claude", "commands");
  async function readCommandsRecursive(dir, prefix) {
    try {
      const entries = await readdir(dir);
      for (const entry of entries) {
        const entryPath = join(dir, entry);
        if (!entryPath.startsWith(commandsDir)) continue;
        try {
          const s = await stat(entryPath);
          if (s.isDirectory()) {
            await readCommandsRecursive(entryPath, prefix ? `${prefix}:${entry}` : entry);
          } else if (entry.endsWith(".md")) {
            const content = await readFile(entryPath, "utf-8");
            const name = prefix ? `${prefix}:${entry.replace(/\.md$/, "")}` : entry.replace(/\.md$/, "");
            const titleMatch = content.match(/^#\s+(.+)$/m);
            const description = titleMatch ? titleMatch[1].trim() : name;
            commands.push({ command: name, description, prompt: content, source: "command" });
          }
        } catch { /* skip unreadable entries */ }
      }
    } catch { /* directory doesn't exist or unreadable */ }
  }
  await readCommandsRecursive(commandsDir, "");

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

export default router;

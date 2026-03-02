import { Router } from "express";
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "../..");

const router = Router();

// Load project configs into memory
let projectConfigs = [];
export async function loadProjectConfigs() {
  try {
    const data = await readFile(join(rootDir, "folders.json"), "utf-8");
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
    const data = await readFile(join(rootDir, "folders.json"), "utf-8");
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
    const filePath = join(rootDir, "folders.json");
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

// Read project commands from .claude/commands/*.md and .claude/skills/*/SKILL.md
router.get("/commands", async (req, res) => {
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

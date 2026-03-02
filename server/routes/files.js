import { Router } from "express";
import { readdir, readFile } from "fs/promises";
import { join } from "path";

const router = Router();

// File listing for attachments (recursive, max depth 3)
router.get("/", async (req, res) => {
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
router.get("/content", async (req, res) => {
  const base = req.query.base;
  const filePath = req.query.path;
  if (!base || !filePath) return res.status(400).json({ error: "base and path required" });

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

export default router;

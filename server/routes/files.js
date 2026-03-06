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
        if (SKIP.has(entry.name)) continue;
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

// File tree (immediate children only, for lazy-loading explorer)
router.get("/tree", async (req, res) => {
  const base = req.query.base;
  const dir = req.query.dir || "";
  if (!base) return res.status(400).json({ error: "base query param required" });

  const SKIP = new Set([".git", "node_modules", ".next", "dist", "build", ".cache", ".turbo", "__pycache__", ".venv", "venv", "coverage", ".nyc_output"]);

  const target = dir ? join(base, dir) : base;

  // Path traversal protection
  if (!target.startsWith(base)) {
    return res.status(403).json({ error: "path traversal detected" });
  }

  try {
    const entries = await readdir(target, { withFileTypes: true });
    const results = [];

    for (const entry of entries) {
      if (SKIP.has(entry.name)) continue;
      const relPath = dir ? `${dir}/${entry.name}` : entry.name;
      results.push({
        name: entry.name,
        path: relPath,
        type: entry.isDirectory() ? "dir" : "file",
      });
    }

    // Sort: directories first, then alphabetical
    results.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.json(results);
  } catch (err) {
    if (err.code === "ENOENT") {
      return res.json([]);
    }
    res.status(500).json({ error: err.message });
  }
});

// Serve raw binary files (images) with streaming
const IMAGE_MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

router.get("/raw", async (req, res) => {
  const base = req.query.base;
  const filePath = req.query.path;
  if (!base || !filePath) return res.status(400).json({ error: "base and path required" });

  const resolved = join(base, filePath);
  if (!resolved.startsWith(base)) return res.status(403).json({ error: "path traversal detected" });

  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  const mime = IMAGE_MIME[ext];
  if (!mime) return res.status(415).json({ error: "unsupported file type" });

  try {
    const { stat } = await import("fs/promises");
    const stats = await stat(resolved);
    if (stats.size > 5 * 1024 * 1024) {
      return res.status(413).json({ error: "File too large (5MB limit)" });
    }
    res.type(mime).sendFile(resolved);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// Search files/folders by name (recursive, LIKE %query%)
router.get("/search", async (req, res) => {
  const base = req.query.base;
  const q = (req.query.q || "").toLowerCase();
  if (!base) return res.status(400).json({ error: "base query param required" });
  if (!q) return res.json([]);

  const SKIP = new Set([".git", "node_modules", ".next", "dist", "build", ".cache", ".turbo", "__pycache__", ".venv", "venv", "coverage", ".nyc_output"]);
  const MAX_DEPTH = 8;
  const MAX_RESULTS = 50;
  const results = [];

  async function walk(dir, relDir, depth) {
    if (depth > MAX_DEPTH || results.length >= MAX_RESULTS) return;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= MAX_RESULTS) break;
        if (SKIP.has(entry.name)) continue;

        const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
        const isDir = entry.isDirectory();

        // Match name (case-insensitive, like SQL LIKE %q%)
        if (entry.name.toLowerCase().includes(q)) {
          results.push({ name: entry.name, path: relPath, type: isDir ? "dir" : "file" });
        }

        if (isDir) {
          await walk(join(dir, entry.name), relPath, depth + 1);
        }
      }
    } catch { /* permission errors */ }
  }

  try {
    await walk(base, "", 0);
    // Sort: directories first, then alphabetical
    results.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

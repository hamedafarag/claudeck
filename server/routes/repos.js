import { Router } from "express";
import { readFile, writeFile, stat, access } from "fs/promises";
import { join, resolve } from "path";
import { configPath } from "../paths.js";

const dataFile = configPath("repos.json");

const router = Router();

async function readData() {
  try {
    const raw = await readFile(dataFile, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { groups: [], repos: [] };
  }
}

async function writeData(data) {
  await writeFile(dataFile, JSON.stringify(data, null, 2) + "\n");
}

async function isGitRepo(dirPath) {
  try {
    const resolved = resolve(dirPath);
    const s = await stat(resolved);
    if (!s.isDirectory()) return false;
    // Check for .git directory or .git file (worktrees/submodules)
    const gitPath = join(resolved, ".git");
    await access(gitPath);
    return true;
  } catch {
    // Also check if any parent has .git (we're inside a repo subdirectory)
    try {
      const resolved = resolve(dirPath);
      let dir = resolved;
      while (dir !== "/") {
        dir = dirname(dir);
        await access(join(dir, ".git"));
        return true;
      }
    } catch { /* not inside a repo either */ }
    return false;
  }
}

function hasCircularParent(groups, groupId, newParentId) {
  if (!newParentId) return false;
  let current = newParentId;
  const visited = new Set();
  while (current) {
    if (current === groupId) return true;
    if (visited.has(current)) return true;
    visited.add(current);
    const g = groups.find((g) => g.id === current);
    current = g ? g.parentId : null;
  }
  return false;
}

// GET / — fetch all groups + repos
router.get("/", async (req, res) => {
  try {
    const data = await readData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /repos — add a repo (path is optional for manual/remote-only entries)
router.post("/repos", async (req, res) => {
  try {
    const { name, path: repoPath, groupId } = req.body;
    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    let resolvedPath = null;
    const data = await readData();

    if (repoPath) {
      resolvedPath = resolve(repoPath);

      if (!(await isGitRepo(resolvedPath))) {
        return res.status(400).json({ error: "Path is not a valid git repository" });
      }

      if (data.repos.some((r) => r.path === resolvedPath)) {
        return res.status(409).json({ error: "Repo with this path already exists" });
      }
    }

    if (groupId && !data.groups.some((g) => g.id === groupId)) {
      return res.status(400).json({ error: "Invalid groupId" });
    }

    const repo = {
      id: `r_${Date.now()}`,
      name,
      path: resolvedPath,
      groupId: groupId || null,
      url: req.body.url || null,
    };

    data.repos.push(repo);
    await writeData(data);
    res.json({ ok: true, repo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /repos/:id — update a repo
router.put("/repos/:id", async (req, res) => {
  try {
    const data = await readData();
    const repo = data.repos.find((r) => r.id === req.params.id);
    if (!repo) return res.status(404).json({ error: "Repo not found" });

    const { name, groupId, url } = req.body;
    if (name !== undefined) repo.name = name;
    if (url !== undefined) repo.url = url;
    if (groupId !== undefined) {
      if (groupId !== null && !data.groups.some((g) => g.id === groupId)) {
        return res.status(400).json({ error: "Invalid groupId" });
      }
      repo.groupId = groupId;
    }

    await writeData(data);
    res.json({ ok: true, repo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /repos/:id — remove a repo
router.delete("/repos/:id", async (req, res) => {
  try {
    const data = await readData();
    const idx = data.repos.findIndex((r) => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Repo not found" });

    data.repos.splice(idx, 1);
    await writeData(data);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /groups — create a group
router.post("/groups", async (req, res) => {
  try {
    const { name, parentId } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });

    const data = await readData();

    if (parentId && !data.groups.some((g) => g.id === parentId)) {
      return res.status(400).json({ error: "Invalid parentId" });
    }

    const group = {
      id: `g_${Date.now()}`,
      name,
      parentId: parentId || null,
    };

    data.groups.push(group);
    await writeData(data);
    res.json({ ok: true, group });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /groups/:id — rename/reparent a group
router.put("/groups/:id", async (req, res) => {
  try {
    const data = await readData();
    const group = data.groups.find((g) => g.id === req.params.id);
    if (!group) return res.status(404).json({ error: "Group not found" });

    const { name, parentId } = req.body;
    if (name !== undefined) group.name = name;
    if (parentId !== undefined) {
      if (parentId !== null && !data.groups.some((g) => g.id === parentId)) {
        return res.status(400).json({ error: "Invalid parentId" });
      }
      if (hasCircularParent(data.groups, group.id, parentId)) {
        return res.status(400).json({ error: "Circular parent reference" });
      }
      group.parentId = parentId;
    }

    await writeData(data);
    res.json({ ok: true, group });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /groups/:id — delete group (reparent children + repos)
router.delete("/groups/:id", async (req, res) => {
  try {
    const data = await readData();
    const group = data.groups.find((g) => g.id === req.params.id);
    if (!group) return res.status(404).json({ error: "Group not found" });

    const parentId = group.parentId || null;

    // Reparent child groups to deleted group's parent
    for (const g of data.groups) {
      if (g.parentId === group.id) g.parentId = parentId;
    }

    // Reparent repos to deleted group's parent
    for (const r of data.repos) {
      if (r.groupId === group.id) r.groupId = parentId;
    }

    data.groups = data.groups.filter((g) => g.id !== group.id);
    await writeData(data);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

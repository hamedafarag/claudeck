import { Router } from "express";
import {
  getWorktreeRecord,
  listWorktreesByProject,
  updateWorktreeStatus,
} from "../../db.js";
import {
  autoCommitWorktree,
  getWorktreeDiff,
  getWorktreeDiffStats,
  squashMerge,
  removeWorktree,
} from "../utils/git-worktree.js";

const router = Router();

// GET / — list worktrees for a project
router.get("/", (req, res) => {
  try {
    const projectPath = req.query.project_path;
    if (!projectPath) return res.status(400).json({ error: "project_path is required" });
    const worktrees = listWorktreesByProject(projectPath);
    res.json(worktrees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id — get single worktree
router.get("/:id", (req, res) => {
  try {
    const wt = getWorktreeRecord(req.params.id);
    if (!wt) return res.status(404).json({ error: "Worktree not found" });
    res.json(wt);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id/diff — get diff for a worktree
router.get("/:id/diff", async (req, res) => {
  try {
    const wt = getWorktreeRecord(req.params.id);
    if (!wt) return res.status(404).json({ error: "Worktree not found" });

    await autoCommitWorktree(wt.worktree_path, "claudeck: auto-commit for diff");
    const diff = await getWorktreeDiff(wt.worktree_path, wt.base_branch);
    const stats = await getWorktreeDiffStats(wt.worktree_path, wt.base_branch);

    res.json({ diff, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/merge — squash merge worktree back to main branch
router.post("/:id/merge", async (req, res) => {
  try {
    const wt = getWorktreeRecord(req.params.id);
    if (!wt) return res.status(404).json({ error: "Worktree not found" });
    if (wt.status === "merged") return res.status(400).json({ error: "Already merged" });
    if (wt.status === "discarded") return res.status(400).json({ error: "Already discarded" });

    const commitMessage = req.body.commitMessage
      || `claudeck: ${(wt.user_prompt || "worktree changes").slice(0, 72)}`;

    const result = await squashMerge(
      wt.project_path, wt.worktree_path, wt.branch_name, commitMessage
    );

    updateWorktreeStatus(wt.id, "merged");
    res.json({ ok: true, hash: result.hash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — discard worktree
router.delete("/:id", async (req, res) => {
  try {
    const wt = getWorktreeRecord(req.params.id);
    if (!wt) return res.status(404).json({ error: "Worktree not found" });

    await removeWorktree(wt.project_path, wt.worktree_path, wt.branch_name);
    updateWorktreeStatus(wt.id, "discarded");

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

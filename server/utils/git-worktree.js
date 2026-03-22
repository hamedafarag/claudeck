/**
 * Git Worktree Utilities
 *
 * Manages git worktree lifecycle: create, commit, diff, merge, remove, cleanup.
 * All functions receive the project path (original repo root) and use child_process
 * to run git commands — no SDK dependency.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { join, basename } from "path";
import { existsSync, mkdirSync } from "fs";

const execAsync = promisify(exec);
const EXEC_OPTS = { timeout: 30000, maxBuffer: 512 * 1024 };

// ── Helpers ────────────────────────────────────────────────────────────────

function gitExec(command, cwd) {
  return execAsync(command, { ...EXEC_OPTS, cwd });
}

/**
 * Generate a git-safe branch name from a user prompt.
 * Format: claudeck/<timestamp>-<slug>
 */
export function generateBranchName(prompt) {
  const ts = Date.now().toString(36); // compact timestamp
  const slug = (prompt || "worktree")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 30)
    .replace(/-+$/, "");
  return `claudeck/${ts}-${slug || "worktree"}`;
}

// ── Branch & Status ────────────────────────────────────────────────────────

export async function getCurrentBranch(cwd) {
  const { stdout } = await gitExec("git rev-parse --abbrev-ref HEAD", cwd);
  return stdout.trim();
}

export async function isWorkingTreeClean(cwd) {
  const { stdout } = await gitExec("git status --porcelain", cwd);
  return stdout.trim() === "";
}

/**
 * Auto-stash uncommitted changes if the working tree is dirty.
 * Returns { stashed: boolean }.
 */
export async function ensureCleanWorkingTree(cwd) {
  const clean = await isWorkingTreeClean(cwd);
  if (clean) return { stashed: false };
  await gitExec('git stash push -m "claudeck-worktree-auto"', cwd);
  return { stashed: true };
}

/**
 * Pop the auto-stash created by ensureCleanWorkingTree, if present.
 */
export async function unstash(cwd) {
  try {
    const { stdout } = await gitExec("git stash list", cwd);
    const lines = stdout.split("\n");
    const idx = lines.findIndex((l) => l.includes("claudeck-worktree-auto"));
    if (idx >= 0) {
      await gitExec(`git stash pop stash@{${idx}}`, cwd);
    }
  } catch {
    // No stash or pop conflict — silently continue
  }
}

// ── Worktree Lifecycle ─────────────────────────────────────────────────────

/**
 * Create a new git worktree with a dedicated branch.
 * Worktrees are stored under <projectPath>/.claudeck-worktrees/<branchSlug>
 */
export async function createWorktree(projectPath, branchName) {
  const baseBranch = await getCurrentBranch(projectPath);
  const branchSlug = branchName.replace(/\//g, "-");
  const wtDir = join(projectPath, ".claudeck-worktrees");
  const worktreePath = join(wtDir, branchSlug);

  if (!existsSync(wtDir)) {
    mkdirSync(wtDir, { recursive: true });
  }

  // Auto-add .claudeck-worktrees to .gitignore if not already present
  await ensureGitignore(projectPath);

  await gitExec(
    `git worktree add "${worktreePath}" -b "${branchName}"`,
    projectPath,
  );

  return { worktreePath, branchName, baseBranch };
}

/**
 * Remove a worktree and delete its branch. Idempotent.
 */
export async function removeWorktree(projectPath, worktreePath, branchName) {
  try {
    await gitExec(`git worktree remove --force "${worktreePath}"`, projectPath);
  } catch {
    // Already removed or path doesn't exist
  }
  try {
    await gitExec(`git branch -D "${branchName}"`, projectPath);
  } catch {
    // Branch already deleted
  }
}

// ── Commit & Diff ──────────────────────────────────────────────────────────

/**
 * Stage all changes and commit inside a worktree.
 * Returns { committed: boolean, hash?: string }.
 */
export async function autoCommitWorktree(worktreePath, message) {
  const clean = await isWorkingTreeClean(worktreePath);
  if (clean) return { committed: false };

  await gitExec("git add -A", worktreePath);
  const { stdout } = await gitExec(
    `git commit -m "${message.replace(/"/g, '\\"')}"`,
    worktreePath,
  );
  const hashMatch = stdout.match(/\[.*\s([a-f0-9]+)\]/);
  return { committed: true, hash: hashMatch?.[1] || null };
}

/**
 * Get the unified diff between the worktree branch and the base branch.
 * Auto-commits any uncommitted changes first.
 */
export async function getWorktreeDiff(worktreePath, baseBranch) {
  // Ensure everything is committed before diffing
  await autoCommitWorktree(worktreePath, "claudeck: auto-commit for diff");

  try {
    const { stdout } = await gitExec(
      `git diff "${baseBranch}"...HEAD`,
      worktreePath,
    );
    return stdout;
  } catch {
    return "";
  }
}

/**
 * Get diff stats (files changed, insertions, deletions).
 */
export async function getWorktreeDiffStats(worktreePath, baseBranch) {
  try {
    const { stdout } = await gitExec(
      `git diff --stat "${baseBranch}"...HEAD`,
      worktreePath,
    );
    const lines = stdout.trim().split("\n");
    const summaryLine = lines[lines.length - 1] || "";
    const filesMatch = summaryLine.match(/(\d+)\s+file/);
    const insertMatch = summaryLine.match(/(\d+)\s+insertion/);
    const deleteMatch = summaryLine.match(/(\d+)\s+deletion/);
    return {
      files: parseInt(filesMatch?.[1] || "0", 10),
      insertions: parseInt(insertMatch?.[1] || "0", 10),
      deletions: parseInt(deleteMatch?.[1] || "0", 10),
    };
  } catch {
    return { files: 0, insertions: 0, deletions: 0 };
  }
}

// ── Merge ──────────────────────────────────────────────────────────────────

/**
 * Squash-merge the worktree branch into the main working tree.
 * Stashes any uncommitted changes, merges, then restores the stash.
 */
export async function squashMerge(
  projectPath,
  worktreePath,
  branchName,
  commitMessage,
) {
  // Ensure worktree changes are committed
  await autoCommitWorktree(worktreePath, "claudeck: auto-commit before merge");

  // Stash main tree if dirty
  const { stashed } = await ensureCleanWorkingTree(projectPath);

  try {
    await gitExec(`git merge --squash "${branchName}"`, projectPath);
    const { stdout } = await gitExec(
      `git commit -m "${commitMessage.replace(/"/g, '\\"')}"`,
      projectPath,
    );
    const hashMatch = stdout.match(/\[.*\s([a-f0-9]+)\]/);

    // Clean up worktree and branch
    await removeWorktree(projectPath, worktreePath, branchName);

    return { merged: true, hash: hashMatch?.[1] || null };
  } finally {
    if (stashed) await unstash(projectPath);
  }
}

// ── Listing & Cleanup ──────────────────────────────────────────────────────

/**
 * List all git worktrees for a project (from git's perspective).
 */
export async function listGitWorktrees(projectPath) {
  try {
    const { stdout } = await gitExec(
      "git worktree list --porcelain",
      projectPath,
    );
    const worktrees = [];
    let current = {};
    for (const line of stdout.split("\n")) {
      if (line.startsWith("worktree ")) {
        if (current.path) worktrees.push(current);
        current = { path: line.slice(9) };
      } else if (line.startsWith("HEAD ")) {
        current.head = line.slice(5);
      } else if (line.startsWith("branch ")) {
        current.branch = line.slice(7);
      } else if (line === "") {
        if (current.path) worktrees.push(current);
        current = {};
      }
    }
    if (current.path) worktrees.push(current);
    return worktrees;
  } catch {
    return [];
  }
}

/**
 * Reconcile DB records against actual git worktrees on startup.
 * Marks orphaned DB records and removes stale filesystem worktrees.
 */
export async function reconcileOrphanedWorktrees(
  listActiveFn,
  updateStatusFn,
) {
  const activeRecords = listActiveFn();
  if (!activeRecords.length) return;

  // Group by project
  const byProject = new Map();
  for (const wt of activeRecords) {
    if (!byProject.has(wt.project_path)) byProject.set(wt.project_path, []);
    byProject.get(wt.project_path).push(wt);
  }

  for (const [projectPath, records] of byProject) {
    const gitWts = await listGitWorktrees(projectPath);
    const gitPaths = new Set(gitWts.map((g) => g.path));

    for (const record of records) {
      if (!gitPaths.has(record.worktree_path)) {
        updateStatusFn(record.id, "orphaned");
        console.log(`Marked orphaned worktree: ${record.branch_name}`);
      }
    }
  }
}

// ── Internal ───────────────────────────────────────────────────────────────

async function ensureGitignore(projectPath) {
  const gitignorePath = join(projectPath, ".gitignore");
  const entry = ".claudeck-worktrees/";
  try {
    const { readFileSync, appendFileSync } = await import("fs");
    if (existsSync(gitignorePath)) {
      const content = readFileSync(gitignorePath, "utf8");
      if (content.includes(entry)) return;
    }
    appendFileSync(gitignorePath, `\n# Claudeck worktrees\n${entry}\n`);
  } catch {
    // Non-critical — user can add manually
  }
}

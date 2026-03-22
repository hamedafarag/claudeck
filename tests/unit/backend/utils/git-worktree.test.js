import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockExec = vi.fn();

vi.mock("child_process", () => ({
  exec: (...args) => mockExec(...args),
}));

vi.mock("util", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    promisify: (fn) => {
      // Return an async wrapper that resolves/rejects based on mock
      return (...args) =>
        new Promise((resolve, reject) => {
          fn(...args, (err, stdout, stderr) => {
            if (err) reject(err);
            else resolve({ stdout: stdout || "", stderr: stderr || "" });
          });
        });
    },
  };
});

const mockExistsSync = vi.fn(() => true);
const mockMkdirSync = vi.fn();
const mockReadFileSync = vi.fn(() => "");
const mockAppendFileSync = vi.fn();

vi.mock("fs", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    existsSync: (...args) => mockExistsSync(...args),
    mkdirSync: (...args) => mockMkdirSync(...args),
    readFileSync: (...args) => mockReadFileSync(...args),
    appendFileSync: (...args) => mockAppendFileSync(...args),
  };
});

const {
  generateBranchName,
  getCurrentBranch,
  isWorkingTreeClean,
  ensureCleanWorkingTree,
  unstash,
  createWorktree,
  removeWorktree,
  autoCommitWorktree,
  getWorktreeDiff,
  getWorktreeDiffStats,
  squashMerge,
  listGitWorktrees,
  reconcileOrphanedWorktrees,
} = await import("../../../../server/utils/git-worktree.js");

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockExecSuccess(stdout = "") {
  mockExec.mockImplementation((cmd, opts, cb) => {
    cb(null, stdout, "");
  });
}

function mockExecFailure(stderr = "error", code = 1) {
  mockExec.mockImplementation((cmd, opts, cb) => {
    const err = new Error(stderr);
    err.code = code;
    cb(err, "", stderr);
  });
}

function mockExecSequence(...results) {
  let call = 0;
  mockExec.mockImplementation((cmd, opts, cb) => {
    const r = results[call++] || { stdout: "" };
    if (r.error) {
      const err = new Error(r.error);
      err.code = r.code || 1;
      cb(err, "", r.error);
    } else {
      cb(null, r.stdout || "", r.stderr || "");
    }
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockExistsSync.mockReturnValue(true);
  mockReadFileSync.mockReturnValue("");
});

// ─────────────────────────────────────────────────────────────
// generateBranchName
// ─────────────────────────────────────────────────────────────
describe("generateBranchName", () => {
  it("creates a branch name with claudeck/ prefix", () => {
    const name = generateBranchName("fix login bug");
    expect(name).toMatch(/^claudeck\//);
  });

  it("includes a slug from the prompt", () => {
    const name = generateBranchName("fix login bug");
    expect(name).toContain("fix-login-bug");
  });

  it("sanitizes special characters", () => {
    const name = generateBranchName("fix: the @#$ issue!");
    expect(name).not.toMatch(/[@#$!:]/);
  });

  it("truncates long prompts to 30 chars", () => {
    const longPrompt = "a".repeat(100);
    const name = generateBranchName(longPrompt);
    const slug = name.split("/").pop().replace(/^[a-z0-9]+-/, "");
    expect(slug.length).toBeLessThanOrEqual(30);
  });

  it("handles empty prompt", () => {
    const name = generateBranchName("");
    expect(name).toMatch(/^claudeck\/.*worktree$/);
  });

  it("handles null/undefined prompt", () => {
    const name = generateBranchName(null);
    expect(name).toMatch(/^claudeck\//);
  });
});

// ─────────────────────────────────────────────────────────────
// getCurrentBranch
// ─────────────────────────────────────────────────────────────
describe("getCurrentBranch", () => {
  it("returns trimmed branch name", async () => {
    mockExecSuccess("main\n");
    const branch = await getCurrentBranch("/project");
    expect(branch).toBe("main");
  });

  it("calls git rev-parse with the correct cwd", async () => {
    mockExecSuccess("develop\n");
    await getCurrentBranch("/my/project");
    expect(mockExec).toHaveBeenCalledWith(
      "git rev-parse --abbrev-ref HEAD",
      expect.objectContaining({ cwd: "/my/project" }),
      expect.any(Function),
    );
  });
});

// ─────────────────────────────────────────────────────────────
// isWorkingTreeClean
// ─────────────────────────────────────────────────────────────
describe("isWorkingTreeClean", () => {
  it("returns true when no output", async () => {
    mockExecSuccess("");
    const clean = await isWorkingTreeClean("/project");
    expect(clean).toBe(true);
  });

  it("returns false when there are changes", async () => {
    mockExecSuccess(" M file.js\n");
    const clean = await isWorkingTreeClean("/project");
    expect(clean).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
// ensureCleanWorkingTree
// ─────────────────────────────────────────────────────────────
describe("ensureCleanWorkingTree", () => {
  it("returns stashed: false when tree is clean", async () => {
    mockExecSuccess("");
    const result = await ensureCleanWorkingTree("/project");
    expect(result).toEqual({ stashed: false });
  });

  it("stashes and returns stashed: true when tree is dirty", async () => {
    mockExecSequence(
      { stdout: " M file.js\n" }, // git status
      { stdout: "" },              // git stash push
    );
    const result = await ensureCleanWorkingTree("/project");
    expect(result).toEqual({ stashed: true });
    expect(mockExec).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────
// unstash
// ─────────────────────────────────────────────────────────────
describe("unstash", () => {
  it("pops stash when claudeck auto-stash is found", async () => {
    mockExecSequence(
      { stdout: "stash@{0}: On main: claudeck-worktree-auto\n" },
      { stdout: "" },
    );
    await unstash("/project");
    expect(mockExec).toHaveBeenCalledTimes(2);
    expect(mockExec).toHaveBeenLastCalledWith(
      expect.stringContaining("git stash pop stash@{0}"),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("does nothing when no claudeck stash is found", async () => {
    mockExecSuccess("stash@{0}: On main: some other stash\n");
    await unstash("/project");
    expect(mockExec).toHaveBeenCalledTimes(1); // only stash list
  });

  it("does not throw on failure", async () => {
    mockExecFailure("no stash found");
    await expect(unstash("/project")).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
// createWorktree
// ─────────────────────────────────────────────────────────────
describe("createWorktree", () => {
  it("returns worktreePath, branchName, and baseBranch", async () => {
    mockExecSequence(
      { stdout: "main\n" },  // getCurrentBranch
      { stdout: "" },         // git worktree add
    );
    mockExistsSync.mockReturnValue(false);

    const result = await createWorktree("/project", "claudeck/test-branch");
    expect(result.worktreePath).toContain(".claudeck-worktrees");
    expect(result.worktreePath).toContain("claudeck-test-branch");
    expect(result.branchName).toBe("claudeck/test-branch");
    expect(result.baseBranch).toBe("main");
  });

  it("creates the .claudeck-worktrees directory if missing", async () => {
    mockExecSequence(
      { stdout: "main\n" },
      { stdout: "" },
    );
    mockExistsSync.mockImplementation((path) => {
      if (path.includes(".claudeck-worktrees")) return false;
      return true;
    });

    await createWorktree("/project", "claudeck/feat");
    expect(mockMkdirSync).toHaveBeenCalled();
  });

  it("runs git worktree add with correct branch and path", async () => {
    mockExecSequence(
      { stdout: "main\n" },
      { stdout: "" },
    );

    await createWorktree("/project", "claudeck/my-feature");

    // Second exec call should be the worktree add
    const addCall = mockExec.mock.calls[1];
    expect(addCall[0]).toContain("git worktree add");
    expect(addCall[0]).toContain("claudeck/my-feature");
  });
});

// ─────────────────────────────────────────────────────────────
// removeWorktree
// ─────────────────────────────────────────────────────────────
describe("removeWorktree", () => {
  it("removes worktree and deletes branch", async () => {
    mockExecSequence(
      { stdout: "" }, // git worktree remove
      { stdout: "" }, // git branch -D
    );

    await removeWorktree("/project", "/project/.claudeck-worktrees/branch", "claudeck/branch");
    expect(mockExec).toHaveBeenCalledTimes(2);
    expect(mockExec.mock.calls[0][0]).toContain("git worktree remove");
    expect(mockExec.mock.calls[1][0]).toContain("git branch -D");
  });

  it("is idempotent — does not throw if worktree already removed", async () => {
    mockExecSequence(
      { error: "not a valid worktree" },
      { error: "branch not found" },
    );

    await expect(removeWorktree("/project", "/path", "branch")).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────
// autoCommitWorktree
// ─────────────────────────────────────────────────────────────
describe("autoCommitWorktree", () => {
  it("returns committed: false when tree is clean", async () => {
    mockExecSuccess("");
    const result = await autoCommitWorktree("/wt", "test commit");
    expect(result).toEqual({ committed: false });
  });

  it("stages, commits, and returns hash when tree is dirty", async () => {
    mockExecSequence(
      { stdout: " M file.js\n" },           // git status
      { stdout: "" },                         // git add -A
      { stdout: "[main abc1234] msg\n" },    // git commit
    );
    const result = await autoCommitWorktree("/wt", "test commit");
    expect(result).toEqual({ committed: true, hash: "abc1234" });
  });

  it("escapes quotes in commit message", async () => {
    mockExecSequence(
      { stdout: " M file.js\n" },
      { stdout: "" },
      { stdout: '[main abc] msg "quoted"\n' },
    );
    await autoCommitWorktree("/wt", 'message with "quotes"');
    const commitCall = mockExec.mock.calls[2];
    expect(commitCall[0]).toContain('\\"');
  });
});

// ─────────────────────────────────────────────────────────────
// getWorktreeDiff
// ─────────────────────────────────────────────────────────────
describe("getWorktreeDiff", () => {
  it("returns diff string", async () => {
    mockExecSequence(
      { stdout: "" },                    // isWorkingTreeClean (for autoCommit)
      { stdout: "+added line\n-removed line\n" }, // git diff
    );
    const diff = await getWorktreeDiff("/wt", "main");
    expect(diff).toContain("+added line");
  });

  it("returns empty string on failure", async () => {
    mockExecSequence(
      { stdout: "" },           // clean tree
      { error: "fatal: error" }, // diff fails
    );
    const diff = await getWorktreeDiff("/wt", "main");
    expect(diff).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────
// getWorktreeDiffStats
// ─────────────────────────────────────────────────────────────
describe("getWorktreeDiffStats", () => {
  it("parses diff stat output", async () => {
    mockExecSuccess(
      " file1.js | 3 ++-\n file2.js | 1 +\n 2 files changed, 3 insertions(+), 1 deletion(-)\n",
    );
    const stats = await getWorktreeDiffStats("/wt", "main");
    expect(stats).toEqual({ files: 2, insertions: 3, deletions: 1 });
  });

  it("returns zeros on failure", async () => {
    mockExecFailure("fatal");
    const stats = await getWorktreeDiffStats("/wt", "main");
    expect(stats).toEqual({ files: 0, insertions: 0, deletions: 0 });
  });

  it("handles insertions only", async () => {
    mockExecSuccess(" file.js | 5 +++++\n 1 file changed, 5 insertions(+)\n");
    const stats = await getWorktreeDiffStats("/wt", "main");
    expect(stats).toEqual({ files: 1, insertions: 5, deletions: 0 });
  });
});

// ─────────────────────────────────────────────────────────────
// squashMerge
// ─────────────────────────────────────────────────────────────
describe("squashMerge", () => {
  it("stashes, merges, commits, removes worktree, and unstashes", async () => {
    mockExecSequence(
      // autoCommitWorktree: isWorkingTreeClean
      { stdout: "" },
      // ensureCleanWorkingTree: isWorkingTreeClean
      { stdout: "" },
      // git merge --squash
      { stdout: "Squash commit\n" },
      // git commit
      { stdout: "[main def5678] squashed\n" },
      // removeWorktree: git worktree remove
      { stdout: "" },
      // removeWorktree: git branch -D
      { stdout: "" },
    );

    const result = await squashMerge("/project", "/wt", "claudeck/feat", "merge msg");
    expect(result).toEqual({ merged: true, hash: "def5678" });
  });

  it("restores stash after merge when main tree was dirty", async () => {
    mockExecSequence(
      // autoCommitWorktree: isWorkingTreeClean
      { stdout: "" },
      // ensureCleanWorkingTree: isWorkingTreeClean (dirty)
      { stdout: " M dirty.js\n" },
      // git stash push
      { stdout: "" },
      // git merge --squash
      { stdout: "" },
      // git commit
      { stdout: "[main aaa] msg\n" },
      // removeWorktree: git worktree remove
      { stdout: "" },
      // removeWorktree: git branch -D
      { stdout: "" },
      // unstash: git stash list
      { stdout: "stash@{0}: On main: claudeck-worktree-auto\n" },
      // unstash: git stash pop
      { stdout: "" },
    );

    await squashMerge("/project", "/wt", "branch", "msg");
    // Verify stash pop was called
    const popCall = mockExec.mock.calls.find((c) => c[0].includes("stash pop"));
    expect(popCall).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
// listGitWorktrees
// ─────────────────────────────────────────────────────────────
describe("listGitWorktrees", () => {
  it("parses porcelain output into structured list", async () => {
    mockExecSuccess(
      "worktree /project\nHEAD abc123\nbranch refs/heads/main\n\nworktree /project/.claudeck-worktrees/feat\nHEAD def456\nbranch refs/heads/claudeck/feat\n\n",
    );

    const list = await listGitWorktrees("/project");
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({ path: "/project", head: "abc123", branch: "refs/heads/main" });
    expect(list[1]).toEqual({
      path: "/project/.claudeck-worktrees/feat",
      head: "def456",
      branch: "refs/heads/claudeck/feat",
    });
  });

  it("returns empty array on failure", async () => {
    mockExecFailure("not a git repo");
    const list = await listGitWorktrees("/not-a-repo");
    expect(list).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────
// reconcileOrphanedWorktrees
// ─────────────────────────────────────────────────────────────
describe("reconcileOrphanedWorktrees", () => {
  it("marks DB records as orphaned when worktree is gone from git", async () => {
    // git worktree list returns only the main worktree
    mockExecSuccess("worktree /project\nHEAD abc\nbranch refs/heads/main\n\n");

    const mockUpdateStatus = vi.fn();
    const mockListActive = vi.fn(() => [
      {
        id: "wt1",
        project_path: "/project",
        worktree_path: "/project/.claudeck-worktrees/gone",
        branch_name: "claudeck/gone",
      },
    ]);

    await reconcileOrphanedWorktrees(mockListActive, mockUpdateStatus);
    expect(mockUpdateStatus).toHaveBeenCalledWith("wt1", "orphaned");
  });

  it("does not mark records whose paths still exist in git", async () => {
    mockExecSuccess(
      "worktree /project\nHEAD abc\nbranch refs/heads/main\n\nworktree /project/.claudeck-worktrees/still-here\nHEAD def\nbranch refs/heads/claudeck/still-here\n\n",
    );

    const mockUpdateStatus = vi.fn();
    const mockListActive = vi.fn(() => [
      {
        id: "wt1",
        project_path: "/project",
        worktree_path: "/project/.claudeck-worktrees/still-here",
        branch_name: "claudeck/still-here",
      },
    ]);

    await reconcileOrphanedWorktrees(mockListActive, mockUpdateStatus);
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it("handles empty active list gracefully", async () => {
    const mockListActive = vi.fn(() => []);
    const mockUpdateStatus = vi.fn();

    await reconcileOrphanedWorktrees(mockListActive, mockUpdateStatus);
    expect(mockExec).not.toHaveBeenCalled();
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });
});

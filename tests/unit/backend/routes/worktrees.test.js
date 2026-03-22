import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../../../db.js", () => ({
  getWorktreeRecord: vi.fn(),
  listWorktreesByProject: vi.fn(() => []),
  updateWorktreeStatus: vi.fn(),
}));

vi.mock("../../../../server/utils/git-worktree.js", () => ({
  autoCommitWorktree: vi.fn(async () => ({ committed: false })),
  getWorktreeDiff: vi.fn(async () => "+added\n-removed\n"),
  getWorktreeDiffStats: vi.fn(async () => ({ files: 1, insertions: 1, deletions: 1 })),
  squashMerge: vi.fn(async () => ({ merged: true, hash: "abc1234" })),
  removeWorktree: vi.fn(async () => {}),
}));

import worktreesRouter from "../../../../server/routes/worktrees.js";
import {
  getWorktreeRecord,
  listWorktreesByProject,
  updateWorktreeStatus,
} from "../../../../db.js";
import {
  autoCommitWorktree,
  getWorktreeDiff,
  getWorktreeDiffStats,
  squashMerge,
  removeWorktree,
} from "../../../../server/utils/git-worktree.js";

// ── App setup ────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/worktrees", worktreesRouter);
  return app;
}

// ── Sample data ──────────────────────────────────────────────────────────────

const sampleWorktree = {
  id: "wt-1",
  session_id: "s-1",
  project_path: "/project",
  worktree_path: "/project/.claudeck-worktrees/claudeck-feat",
  branch_name: "claudeck/feat",
  base_branch: "main",
  status: "completed",
  user_prompt: "add feature",
  created_at: 1700000000,
  completed_at: 1700000100,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("worktrees routes", () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  // ── GET / ────────────────────────────────────────────────────────────────
  describe("GET /worktrees", () => {
    it("returns worktrees for a project", async () => {
      listWorktreesByProject.mockReturnValue([sampleWorktree]);

      const res = await request(app).get("/worktrees?project_path=/project");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([sampleWorktree]);
      expect(listWorktreesByProject).toHaveBeenCalledWith("/project");
    });

    it("returns 400 when project_path is missing", async () => {
      const res = await request(app).get("/worktrees");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("project_path is required");
    });

    it("returns empty array when no worktrees exist", async () => {
      listWorktreesByProject.mockReturnValue([]);

      const res = await request(app).get("/worktrees?project_path=/empty");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns 500 on database error", async () => {
      listWorktreesByProject.mockImplementation(() => {
        throw new Error("DB failure");
      });

      const res = await request(app).get("/worktrees?project_path=/project");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("DB failure");
    });
  });

  // ── GET /:id ─────────────────────────────────────────────────────────────
  describe("GET /worktrees/:id", () => {
    it("returns a single worktree", async () => {
      getWorktreeRecord.mockReturnValue(sampleWorktree);

      const res = await request(app).get("/worktrees/wt-1");

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("wt-1");
    });

    it("returns 404 when worktree not found", async () => {
      getWorktreeRecord.mockReturnValue(undefined);

      const res = await request(app).get("/worktrees/nonexistent");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Worktree not found");
    });
  });

  // ── GET /:id/diff ────────────────────────────────────────────────────────
  describe("GET /worktrees/:id/diff", () => {
    it("returns diff and stats", async () => {
      getWorktreeRecord.mockReturnValue(sampleWorktree);
      getWorktreeDiff.mockResolvedValue("+line\n");
      getWorktreeDiffStats.mockResolvedValue({ files: 1, insertions: 1, deletions: 0 });

      const res = await request(app).get("/worktrees/wt-1/diff");

      expect(res.status).toBe(200);
      expect(res.body.diff).toBe("+line\n");
      expect(res.body.stats).toEqual({ files: 1, insertions: 1, deletions: 0 });
      expect(autoCommitWorktree).toHaveBeenCalledWith(
        sampleWorktree.worktree_path,
        "claudeck: auto-commit for diff",
      );
    });

    it("returns 404 when worktree not found", async () => {
      getWorktreeRecord.mockReturnValue(undefined);

      const res = await request(app).get("/worktrees/bad-id/diff");

      expect(res.status).toBe(404);
    });

    it("returns 500 on git error", async () => {
      getWorktreeRecord.mockReturnValue(sampleWorktree);
      autoCommitWorktree.mockRejectedValue(new Error("git error"));

      const res = await request(app).get("/worktrees/wt-1/diff");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("git error");
    });
  });

  // ── POST /:id/merge ─────────────────────────────────────────────────────
  describe("POST /worktrees/:id/merge", () => {
    it("squash merges and returns hash", async () => {
      getWorktreeRecord.mockReturnValue(sampleWorktree);
      squashMerge.mockResolvedValue({ merged: true, hash: "abc1234" });

      const res = await request(app).post("/worktrees/wt-1/merge").send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, hash: "abc1234" });
      expect(squashMerge).toHaveBeenCalledWith(
        sampleWorktree.project_path,
        sampleWorktree.worktree_path,
        sampleWorktree.branch_name,
        expect.stringContaining("claudeck:"),
      );
      expect(updateWorktreeStatus).toHaveBeenCalledWith("wt-1", "merged");
    });

    it("uses custom commit message when provided", async () => {
      getWorktreeRecord.mockReturnValue(sampleWorktree);
      squashMerge.mockResolvedValue({ merged: true, hash: "def" });

      await request(app)
        .post("/worktrees/wt-1/merge")
        .send({ commitMessage: "custom merge msg" });

      expect(squashMerge).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        "custom merge msg",
      );
    });

    it("returns 400 when already merged", async () => {
      getWorktreeRecord.mockReturnValue({ ...sampleWorktree, status: "merged" });

      const res = await request(app).post("/worktrees/wt-1/merge").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Already merged");
    });

    it("returns 400 when already discarded", async () => {
      getWorktreeRecord.mockReturnValue({ ...sampleWorktree, status: "discarded" });

      const res = await request(app).post("/worktrees/wt-1/merge").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Already discarded");
    });

    it("returns 404 when worktree not found", async () => {
      getWorktreeRecord.mockReturnValue(undefined);

      const res = await request(app).post("/worktrees/bad/merge").send({});

      expect(res.status).toBe(404);
    });

    it("returns 500 on merge failure", async () => {
      getWorktreeRecord.mockReturnValue(sampleWorktree);
      squashMerge.mockRejectedValue(new Error("merge conflict"));

      const res = await request(app).post("/worktrees/wt-1/merge").send({});

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("merge conflict");
    });
  });

  // ── DELETE /:id ──────────────────────────────────────────────────────────
  describe("DELETE /worktrees/:id", () => {
    it("removes worktree and updates status", async () => {
      getWorktreeRecord.mockReturnValue(sampleWorktree);

      const res = await request(app).delete("/worktrees/wt-1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(removeWorktree).toHaveBeenCalledWith(
        sampleWorktree.project_path,
        sampleWorktree.worktree_path,
        sampleWorktree.branch_name,
      );
      expect(updateWorktreeStatus).toHaveBeenCalledWith("wt-1", "discarded");
    });

    it("returns 404 when worktree not found", async () => {
      getWorktreeRecord.mockReturnValue(undefined);

      const res = await request(app).delete("/worktrees/bad");

      expect(res.status).toBe(404);
    });

    it("returns 500 on git removal failure", async () => {
      getWorktreeRecord.mockReturnValue(sampleWorktree);
      removeWorktree.mockRejectedValue(new Error("permission denied"));

      const res = await request(app).delete("/worktrees/wt-1");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("permission denied");
    });
  });
});

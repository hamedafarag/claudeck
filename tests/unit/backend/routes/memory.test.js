import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("../../../../db.js", () => ({
  createMemory: vi.fn(() => ({ lastInsertRowid: 42 })),
  listMemories: vi.fn(() => []),
  searchMemories: vi.fn(() => []),
  getTopMemories: vi.fn(() => []),
  updateMemory: vi.fn(),
  touchMemory: vi.fn(),
  deleteMemory: vi.fn(),
  getMemoryCounts: vi.fn(() => ({ convention: 2, decision: 1 })),
  getMemoryStats: vi.fn(() => ({ total: 3, avgRelevance: 0.8 })),
  maintainMemories: vi.fn(),
}));

vi.mock("../../../../server/memory-optimizer.js", () => ({
  optimizeMemories: vi.fn(async () => ({ optimized: [] })),
  applyOptimization: vi.fn(() => ({ applied: true })),
}));

import memoryRouter from "../../../../server/routes/memory.js";
import {
  createMemory,
  listMemories,
  searchMemories,
  getTopMemories,
  updateMemory,
  touchMemory,
  deleteMemory,
  getMemoryCounts,
  getMemoryStats,
  maintainMemories,
} from "../../../../db.js";
import { optimizeMemories, applyOptimization } from "../../../../server/memory-optimizer.js";

// ── App setup ────────────────────────────────────────────────────────────────
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/memory", memoryRouter);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("memory routes", () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  // ── GET / ──────────────────────────────────────────────────────────────
  describe("GET /memory", () => {
    it("returns memories list for a project", async () => {
      const mockMemories = [
        { id: 1, content: "Use ESM imports", category: "convention" },
      ];
      listMemories.mockReturnValue(mockMemories);

      const res = await request(app).get("/memory?project=my-project");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockMemories);
      expect(listMemories).toHaveBeenCalledWith("my-project", null);
    });

    it("passes category filter when provided", async () => {
      listMemories.mockReturnValue([]);

      await request(app).get("/memory?project=proj&category=convention");

      expect(listMemories).toHaveBeenCalledWith("proj", "convention");
    });

    it("returns 400 when project is missing", async () => {
      const res = await request(app).get("/memory");

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("project query param required");
    });

    it("returns 500 on database error", async () => {
      listMemories.mockImplementation(() => {
        throw new Error("DB error");
      });

      const res = await request(app).get("/memory?project=proj");
      expect(res.status).toBe(500);
    });
  });

  // ── GET /search ────────────────────────────────────────────────────────
  describe("GET /memory/search", () => {
    it("searches memories with project and query", async () => {
      const results = [{ id: 1, content: "Found it" }];
      searchMemories.mockReturnValue(results);

      const res = await request(app).get(
        "/memory/search?project=proj&q=found",
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual(results);
      expect(searchMemories).toHaveBeenCalledWith("proj", "found", 20);
    });

    it("uses custom limit when provided", async () => {
      searchMemories.mockReturnValue([]);

      await request(app).get(
        "/memory/search?project=proj&q=test&limit=5",
      );

      expect(searchMemories).toHaveBeenCalledWith("proj", "test", 5);
    });

    it("returns 400 when project is missing", async () => {
      const res = await request(app).get("/memory/search?q=test");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("project and q required");
    });

    it("returns 400 when q is missing", async () => {
      const res = await request(app).get("/memory/search?project=proj");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("project and q required");
    });
  });

  // ── POST / ─────────────────────────────────────────────────────────────
  describe("POST /memory", () => {
    it("creates a memory and returns its ID", async () => {
      createMemory.mockReturnValue({ lastInsertRowid: 99 });

      const res = await request(app).post("/memory").send({
        project: "proj",
        category: "convention",
        content: "Always use const",
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: 99 });
      expect(createMemory).toHaveBeenCalledWith(
        "proj",
        "convention",
        "Always use const",
        null,
        null,
      );
    });

    it("defaults to 'discovery' category for unknown categories", async () => {
      createMemory.mockReturnValue({ lastInsertRowid: 1 });

      await request(app).post("/memory").send({
        project: "proj",
        category: "unknown-cat",
        content: "Some note",
      });

      expect(createMemory).toHaveBeenCalledWith(
        "proj",
        "discovery",
        "Some note",
        null,
        null,
      );
    });

    it("trims content whitespace", async () => {
      createMemory.mockReturnValue({ lastInsertRowid: 1 });

      await request(app).post("/memory").send({
        project: "proj",
        content: "  trimmed  ",
      });

      expect(createMemory).toHaveBeenCalledWith(
        "proj",
        "discovery",
        "trimmed",
        null,
        null,
      );
    });

    it("passes sessionId and agentId when provided", async () => {
      createMemory.mockReturnValue({ lastInsertRowid: 1 });

      await request(app).post("/memory").send({
        project: "proj",
        content: "From agent",
        sessionId: "sid-1",
        agentId: "agent-1",
      });

      expect(createMemory).toHaveBeenCalledWith(
        "proj",
        "discovery",
        "From agent",
        "sid-1",
        "agent-1",
      );
    });

    it("returns 400 when project is missing", async () => {
      const res = await request(app)
        .post("/memory")
        .send({ content: "hello" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("project and content required");
    });

    it("returns 400 when content is missing", async () => {
      const res = await request(app)
        .post("/memory")
        .send({ project: "proj" });

      expect(res.status).toBe(400);
    });
  });

  // ── DELETE /:id ────────────────────────────────────────────────────────
  describe("DELETE /memory/:id", () => {
    it("deletes a memory and returns ok", async () => {
      const res = await request(app).delete("/memory/42");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(deleteMemory).toHaveBeenCalledWith(42);
    });

    it("returns 500 on error", async () => {
      deleteMemory.mockImplementation(() => {
        throw new Error("Delete fail");
      });

      const res = await request(app).delete("/memory/1");
      expect(res.status).toBe(500);
    });
  });

  // ── GET /stats ─────────────────────────────────────────────────────────
  describe("GET /memory/stats", () => {
    it("returns memory statistics for a project", async () => {
      getMemoryStats.mockReturnValue({ total: 10, avgRelevance: 0.75 });
      getMemoryCounts.mockReturnValue({ convention: 5, decision: 3, discovery: 2 });

      const res = await request(app).get("/memory/stats?project=proj");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        total: 10,
        avgRelevance: 0.75,
        categories: { convention: 5, decision: 3, discovery: 2 },
      });
      expect(getMemoryStats).toHaveBeenCalledWith("proj");
      expect(getMemoryCounts).toHaveBeenCalledWith("proj");
    });

    it("returns 400 when project is missing", async () => {
      const res = await request(app).get("/memory/stats");
      expect(res.status).toBe(400);
      expect(res.body.error).toBe("project required");
    });
  });

  // ── PUT /:id ──────────────────────────────────────────────────────────
  describe("PUT /memory/:id", () => {
    it("updates a memory", async () => {
      const res = await request(app)
        .put("/memory/5")
        .send({ content: "Updated content", category: "warning" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(updateMemory).toHaveBeenCalledWith(5, "Updated content", "warning");
    });

    it("defaults to discovery for invalid category", async () => {
      await request(app)
        .put("/memory/5")
        .send({ content: "text", category: "invalid" });

      expect(updateMemory).toHaveBeenCalledWith(5, "text", "discovery");
    });

    it("returns 400 when content is missing", async () => {
      const res = await request(app)
        .put("/memory/5")
        .send({ category: "warning" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("content required");
    });
  });

  // ── GET /top ──────────────────────────────────────────────────────────
  describe("GET /memory/top", () => {
    it("returns top memories and touches each", async () => {
      const mems = [{ id: 1 }, { id: 2 }];
      getTopMemories.mockReturnValue(mems);

      const res = await request(app).get("/memory/top?project=proj");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mems);
      expect(getTopMemories).toHaveBeenCalledWith("proj", 10);
      expect(touchMemory).toHaveBeenCalledTimes(2);
      expect(touchMemory).toHaveBeenCalledWith(1);
      expect(touchMemory).toHaveBeenCalledWith(2);
    });

    it("returns 400 when project is missing", async () => {
      const res = await request(app).get("/memory/top");
      expect(res.status).toBe(400);
    });
  });

  // ── POST /maintain ────────────────────────────────────────────────────
  describe("POST /memory/maintain", () => {
    it("runs maintenance and returns ok", async () => {
      const res = await request(app)
        .post("/memory/maintain")
        .send({ project: "proj" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(maintainMemories).toHaveBeenCalledWith("proj");
    });

    it("returns 400 when project is missing", async () => {
      const res = await request(app).post("/memory/maintain").send({});
      expect(res.status).toBe(400);
    });
  });

  // ── POST /optimize ────────────────────────────────────────────────────
  describe("POST /memory/optimize", () => {
    it("returns optimization result", async () => {
      optimizeMemories.mockResolvedValue({ optimized: ["m1"] });

      const res = await request(app)
        .post("/memory/optimize")
        .send({ project: "proj" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ optimized: ["m1"] });
    });

    it("returns 400 when project is missing", async () => {
      const res = await request(app).post("/memory/optimize").send({});
      expect(res.status).toBe(400);
    });
  });

  // ── POST /optimize/apply ──────────────────────────────────────────────
  describe("POST /memory/optimize/apply", () => {
    it("applies optimization and returns result", async () => {
      applyOptimization.mockReturnValue({ applied: true });

      const res = await request(app)
        .post("/memory/optimize/apply")
        .send({ project: "proj", optimized: [{ content: "opt" }] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ applied: true });
    });

    it("returns 400 when project or optimized is missing", async () => {
      const res = await request(app)
        .post("/memory/optimize/apply")
        .send({ project: "proj" });

      expect(res.status).toBe(400);
    });
  });
});

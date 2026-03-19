import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();

vi.mock("fs/promises", () => ({
  readFile: (...args) => mockReadFile(...args),
  writeFile: (...args) => mockWriteFile(...args),
}));

vi.mock("../../../../server/paths.js", () => ({
  configPath: vi.fn((name) => `/mock/config/${name}`),
}));

const workflowsRouter = (await import("../../../../server/routes/workflows.js")).default;

// ── App setup ────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/workflows", workflowsRouter);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("workflows routes", () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    mockWriteFile.mockResolvedValue(undefined);
  });

  // ── GET / (list workflows) ──────────────────────────────────────────────

  describe("GET /workflows", () => {
    it("returns workflow list from config", async () => {
      const workflows = [
        { id: "deploy", title: "Deploy", description: "", steps: [{ prompt: "deploy now" }] },
      ];
      mockReadFile.mockResolvedValue(JSON.stringify(workflows));

      const res = await request(app).get("/workflows");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(workflows);
    });

    it("returns empty array when config file does not exist", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      const res = await request(app).get("/workflows");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // ── POST / (create workflow) ────────────────────────────────────────────

  describe("POST /workflows", () => {
    it("creates a new workflow", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).post("/workflows").send({
        title: "CI Pipeline",
        description: "Runs CI checks",
        steps: [{ prompt: "Run lint" }, { prompt: "Run tests" }],
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: "ci-pipeline",
        title: "CI Pipeline",
        description: "Runs CI checks",
        steps: [{ prompt: "Run lint" }, { prompt: "Run tests" }],
      });
      expect(mockWriteFile).toHaveBeenCalledWith(
        "/mock/config/workflows.json",
        expect.any(String),
      );
    });

    it("defaults description to empty string", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).post("/workflows").send({
        title: "Quick",
        steps: [{ prompt: "Do it" }],
      });

      expect(res.status).toBe(200);
      expect(res.body.description).toBe("");
    });

    it("returns 400 when title is missing", async () => {
      const res = await request(app).post("/workflows").send({
        steps: [{ prompt: "Step" }],
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("title and steps are required");
    });

    it("returns 400 when steps is missing", async () => {
      const res = await request(app).post("/workflows").send({
        title: "Workflow",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("title and steps are required");
    });

    it("returns 400 when steps is empty", async () => {
      const res = await request(app).post("/workflows").send({
        title: "Workflow",
        steps: [],
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("title and steps are required");
    });

    it("returns 409 when workflow id already exists", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ id: "my-workflow" }]));

      const res = await request(app).post("/workflows").send({
        title: "My Workflow",
        steps: [{ prompt: "Step" }],
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("already exists");
    });

    it("returns 500 on write failure", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));
      mockWriteFile.mockRejectedValue(new Error("Disk full"));

      const res = await request(app).post("/workflows").send({
        title: "Failing",
        steps: [{ prompt: "Step" }],
      });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Disk full");
    });
  });

  // ── PUT /:id (update workflow) ──────────────────────────────────────────

  describe("PUT /workflows/:id", () => {
    it("updates a workflow's fields", async () => {
      const workflows = [
        { id: "wf1", title: "Old Title", description: "Old", steps: [{ prompt: "Old step" }] },
      ];
      mockReadFile.mockResolvedValue(JSON.stringify(workflows));

      const res = await request(app).put("/workflows/wf1").send({
        title: "New Title",
        description: "New description",
        steps: [{ prompt: "New step 1" }, { prompt: "New step 2" }],
      });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("New Title");
      expect(res.body.description).toBe("New description");
      expect(res.body.steps).toHaveLength(2);
    });

    it("updates only provided fields", async () => {
      const workflows = [
        { id: "wf1", title: "Title", description: "Desc", steps: [{ prompt: "Step" }] },
      ];
      mockReadFile.mockResolvedValue(JSON.stringify(workflows));

      const res = await request(app).put("/workflows/wf1").send({
        title: "Updated Title",
      });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("Updated Title");
      expect(res.body.description).toBe("Desc");
      expect(res.body.steps).toEqual([{ prompt: "Step" }]);
    });

    it("returns 404 when workflow does not exist", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).put("/workflows/nonexistent").send({
        title: "X",
      });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Workflow not found");
    });

    it("returns 500 on write failure", async () => {
      const workflows = [{ id: "wf1", title: "T" }];
      mockReadFile.mockResolvedValue(JSON.stringify(workflows));
      mockWriteFile.mockRejectedValue(new Error("Write error"));

      const res = await request(app).put("/workflows/wf1").send({ title: "New" });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Write error");
    });
  });

  // ── DELETE /:id ─────────────────────────────────────────────────────────

  describe("DELETE /workflows/:id", () => {
    it("deletes a workflow", async () => {
      const workflows = [
        { id: "wf1", title: "First" },
        { id: "wf2", title: "Second" },
      ];
      mockReadFile.mockResolvedValue(JSON.stringify(workflows));

      const res = await request(app).delete("/workflows/wf1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      // Verify only wf2 remains in the written data
      const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(written).toHaveLength(1);
      expect(written[0].id).toBe("wf2");
    });

    it("returns 404 when workflow does not exist", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).delete("/workflows/nonexistent");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Workflow not found");
    });

    it("returns 500 on write failure", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ id: "wf1" }]));
      mockWriteFile.mockRejectedValue(new Error("Delete error"));

      const res = await request(app).delete("/workflows/wf1");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Delete error");
    });
  });
});

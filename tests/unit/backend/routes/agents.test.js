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

vi.mock("../../../../db.js", () => ({
  getAllAgentContext: vi.fn(() => []),
}));

const agentsRouter = (await import("../../../../server/routes/agents.js")).default;
import { getAllAgentContext } from "../../../../db.js";

// ── App setup ────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/agents", agentsRouter);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("agents routes", () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    mockWriteFile.mockResolvedValue(undefined);
  });

  // ── GET / (list agents) ──────────────────────────────────────────────────

  describe("GET /agents", () => {
    it("returns agent list from config", async () => {
      const agents = [
        { id: "code-review", title: "Code Reviewer", goal: "Review code" },
        { id: "test-writer", title: "Test Writer", goal: "Write tests" },
      ];
      mockReadFile.mockResolvedValue(JSON.stringify(agents));

      const res = await request(app).get("/agents");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(agents);
      expect(mockReadFile).toHaveBeenCalledWith("/mock/config/agents.json", "utf-8");
    });

    it("returns 500 when config file read fails", async () => {
      mockReadFile.mockRejectedValue(new Error("File not found"));

      const res = await request(app).get("/agents");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("File not found");
    });
  });

  // ── GET /:id (single agent) ──────────────────────────────────────────────

  describe("GET /agents/:id", () => {
    it("returns a single agent by id", async () => {
      const agents = [{ id: "code-review", title: "Code Reviewer", goal: "Review" }];
      mockReadFile.mockResolvedValue(JSON.stringify(agents));

      const res = await request(app).get("/agents/code-review");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(agents[0]);
    });

    it("returns 404 for non-existent agent", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).get("/agents/nonexistent");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Agent not found");
    });
  });

  // ── POST / (create agent) ───────────────────────────────────────────────

  describe("POST /agents", () => {
    it("creates a new agent", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).post("/agents").send({
        title: "My Agent",
        goal: "Do something useful",
        description: "An agent",
        icon: "star",
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: "my-agent",
        title: "My Agent",
        goal: "Do something useful",
        description: "An agent",
        icon: "star",
        custom: true,
      });
      expect(res.body.constraints).toEqual({ maxTurns: 50, timeoutMs: 300000 });
      expect(mockWriteFile).toHaveBeenCalledWith(
        "/mock/config/agents.json",
        expect.any(String),
      );
    });

    it("uses provided id instead of slugified title", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).post("/agents").send({
        id: "custom-id",
        title: "My Agent",
        goal: "A goal",
      });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("custom-id");
    });

    it("uses custom constraints when provided", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).post("/agents").send({
        title: "Fast Agent",
        goal: "Be fast",
        constraints: { maxTurns: 10, timeoutMs: 60000 },
      });

      expect(res.status).toBe(200);
      expect(res.body.constraints).toEqual({ maxTurns: 10, timeoutMs: 60000 });
    });

    it("returns 400 when title is missing", async () => {
      const res = await request(app).post("/agents").send({ goal: "A goal" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("title and goal are required");
    });

    it("returns 400 when goal is missing", async () => {
      const res = await request(app).post("/agents").send({ title: "Title" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("title and goal are required");
    });

    it("returns 409 when agent id already exists", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ id: "my-agent" }]));

      const res = await request(app).post("/agents").send({
        title: "My Agent",
        goal: "A goal",
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("already exists");
    });

    it("defaults description to empty string and icon to tool", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).post("/agents").send({
        title: "Minimal",
        goal: "A goal",
      });

      expect(res.status).toBe(200);
      expect(res.body.description).toBe("");
      expect(res.body.icon).toBe("tool");
    });
  });

  // ── PUT /:id (update agent) ─────────────────────────────────────────────

  describe("PUT /agents/:id", () => {
    it("updates an agent's fields", async () => {
      const agents = [
        { id: "a1", title: "Old", description: "Old desc", goal: "Old goal", icon: "tool", constraints: { maxTurns: 50, timeoutMs: 300000 } },
      ];
      mockReadFile.mockResolvedValue(JSON.stringify(agents));

      const res = await request(app).put("/agents/a1").send({
        title: "New Title",
        description: "New desc",
        goal: "New goal",
        icon: "star",
      });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("New Title");
      expect(res.body.description).toBe("New desc");
      expect(res.body.goal).toBe("New goal");
      expect(res.body.icon).toBe("star");
    });

    it("merges constraints when provided", async () => {
      const agents = [
        { id: "a1", title: "T", goal: "G", constraints: { maxTurns: 50, timeoutMs: 300000 } },
      ];
      mockReadFile.mockResolvedValue(JSON.stringify(agents));

      const res = await request(app).put("/agents/a1").send({
        constraints: { maxTurns: 10 },
      });

      expect(res.status).toBe(200);
      expect(res.body.constraints).toEqual({ maxTurns: 10, timeoutMs: 300000 });
    });

    it("returns 404 when agent does not exist", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).put("/agents/nonexistent").send({ title: "X" });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Agent not found");
    });
  });

  // ── DELETE /:id ─────────────────────────────────────────────────────────

  describe("DELETE /agents/:id", () => {
    it("deletes an agent", async () => {
      const agents = [{ id: "a1", title: "Agent 1" }, { id: "a2", title: "Agent 2" }];
      mockReadFile.mockResolvedValue(JSON.stringify(agents));

      const res = await request(app).delete("/agents/a1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      // Verify only agent a2 remains in the written data
      const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(written).toHaveLength(1);
      expect(written[0].id).toBe("a2");
    });

    it("returns 404 when agent does not exist", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).delete("/agents/nonexistent");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Agent not found");
    });
  });

  // ── GET /agents/context/:runId ──────────────────────────────────────────

  describe("GET /agents/context/:runId", () => {
    it("returns agent context rows for a runId", async () => {
      const rows = [{ key: "summary", value: "test" }];
      getAllAgentContext.mockReturnValue(rows);

      const res = await request(app).get("/agents/context/run-123");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(rows);
      expect(getAllAgentContext).toHaveBeenCalledWith("run-123");
    });

    it("returns 500 on db error", async () => {
      getAllAgentContext.mockImplementation(() => {
        throw new Error("DB error");
      });

      const res = await request(app).get("/agents/context/run-123");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("DB error");
    });
  });

  // ── Chains CRUD ──────────────────────────────────────────────────────────

  describe("GET /agents/chains", () => {
    it("returns chain list", async () => {
      const chains = [{ id: "chain-1", title: "Chain 1" }];
      mockReadFile.mockResolvedValue(JSON.stringify(chains));

      const res = await request(app).get("/agents/chains");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(chains);
    });

    it("returns empty array when config file does not exist", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      const res = await request(app).get("/agents/chains");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe("GET /agents/chains/:id", () => {
    it("returns a single chain", async () => {
      const chains = [{ id: "c1", title: "Chain 1" }];
      mockReadFile.mockResolvedValue(JSON.stringify(chains));

      const res = await request(app).get("/agents/chains/c1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(chains[0]);
    });

    it("returns 404 for non-existent chain", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).get("/agents/chains/nonexistent");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Chain not found");
    });
  });

  describe("POST /agents/chains", () => {
    it("creates a new chain", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).post("/agents/chains").send({
        title: "My Chain",
        description: "A chain",
        agents: ["a1", "a2"],
        contextPassing: "full",
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: "my-chain",
        title: "My Chain",
        description: "A chain",
        agents: ["a1", "a2"],
        contextPassing: "full",
      });
    });

    it("defaults contextPassing to summary and description to empty", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).post("/agents/chains").send({
        title: "Basic Chain",
        agents: ["a1"],
      });

      expect(res.status).toBe(200);
      expect(res.body.contextPassing).toBe("summary");
      expect(res.body.description).toBe("");
    });

    it("returns 400 when title is missing", async () => {
      const res = await request(app).post("/agents/chains").send({ agents: ["a1"] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("title and agents are required");
    });

    it("returns 400 when agents is missing", async () => {
      const res = await request(app).post("/agents/chains").send({ title: "Title" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("title and agents are required");
    });

    it("returns 409 when chain id already exists", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ id: "my-chain" }]));

      const res = await request(app).post("/agents/chains").send({
        title: "My Chain",
        agents: ["a1"],
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("already exists");
    });
  });

  describe("PUT /agents/chains/:id", () => {
    it("updates a chain", async () => {
      const chains = [{ id: "c1", title: "Old", description: "", agents: ["a1"], contextPassing: "summary" }];
      mockReadFile.mockResolvedValue(JSON.stringify(chains));

      const res = await request(app).put("/agents/chains/c1").send({
        title: "Updated",
        description: "New desc",
        agents: ["a1", "a2"],
        contextPassing: "full",
      });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("Updated");
      expect(res.body.agents).toEqual(["a1", "a2"]);
    });

    it("returns 404 for non-existent chain", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).put("/agents/chains/nonexistent").send({ title: "X" });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Chain not found");
    });
  });

  describe("DELETE /agents/chains/:id", () => {
    it("deletes a chain", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ id: "c1" }, { id: "c2" }]));

      const res = await request(app).delete("/agents/chains/c1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it("returns 404 for non-existent chain", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).delete("/agents/chains/nonexistent");

      expect(res.status).toBe(404);
    });
  });

  // ── DAGs CRUD ────────────────────────────────────────────────────────────

  describe("GET /agents/dags", () => {
    it("returns DAG list", async () => {
      const dags = [{ id: "dag-1", title: "DAG 1" }];
      mockReadFile.mockResolvedValue(JSON.stringify(dags));

      const res = await request(app).get("/agents/dags");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(dags);
    });

    it("returns empty array when config file does not exist", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      const res = await request(app).get("/agents/dags");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe("GET /agents/dags/:id", () => {
    it("returns a single DAG", async () => {
      const dags = [{ id: "d1", title: "DAG 1" }];
      mockReadFile.mockResolvedValue(JSON.stringify(dags));

      const res = await request(app).get("/agents/dags/d1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(dags[0]);
    });

    it("returns 404 for non-existent DAG", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).get("/agents/dags/nonexistent");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("DAG not found");
    });
  });

  describe("POST /agents/dags", () => {
    it("creates a new DAG", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).post("/agents/dags").send({
        title: "My DAG",
        description: "A DAG",
        nodes: [{ id: "n1", agent: "a1" }],
        edges: [{ from: "n1", to: "n2" }],
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: "my-dag",
        title: "My DAG",
        description: "A DAG",
        nodes: [{ id: "n1", agent: "a1" }],
        edges: [{ from: "n1", to: "n2" }],
      });
    });

    it("defaults edges to empty array and description to empty", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).post("/agents/dags").send({
        title: "Basic DAG",
        nodes: [{ id: "n1" }],
      });

      expect(res.status).toBe(200);
      expect(res.body.edges).toEqual([]);
      expect(res.body.description).toBe("");
    });

    it("returns 400 when title is missing", async () => {
      const res = await request(app).post("/agents/dags").send({ nodes: [{ id: "n1" }] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("title and nodes are required");
    });

    it("returns 400 when nodes is missing", async () => {
      const res = await request(app).post("/agents/dags").send({ title: "Title" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("title and nodes are required");
    });

    it("returns 409 when DAG id already exists", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ id: "my-dag" }]));

      const res = await request(app).post("/agents/dags").send({
        title: "My DAG",
        nodes: [{ id: "n1" }],
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("already exists");
    });
  });

  describe("PUT /agents/dags/:id", () => {
    it("updates a DAG", async () => {
      const dags = [{ id: "d1", title: "Old", description: "", nodes: [], edges: [] }];
      mockReadFile.mockResolvedValue(JSON.stringify(dags));

      const res = await request(app).put("/agents/dags/d1").send({
        title: "Updated",
        nodes: [{ id: "n1" }],
        edges: [{ from: "n1", to: "n2" }],
      });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("Updated");
      expect(res.body.nodes).toEqual([{ id: "n1" }]);
    });

    it("returns 404 for non-existent DAG", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).put("/agents/dags/nonexistent").send({ title: "X" });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("DAG not found");
    });
  });

  describe("DELETE /agents/dags/:id", () => {
    it("deletes a DAG", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ id: "d1" }, { id: "d2" }]));

      const res = await request(app).delete("/agents/dags/d1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it("returns 404 for non-existent DAG", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).delete("/agents/dags/nonexistent");

      expect(res.status).toBe(404);
    });
  });
});

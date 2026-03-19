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

const promptsRouter = (await import("../../../../server/routes/prompts.js")).default;

// ── App setup ────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/prompts", promptsRouter);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("prompts routes", () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    mockWriteFile.mockResolvedValue(undefined);
  });

  // ── GET / (list prompts) ────────────────────────────────────────────────

  describe("GET /prompts", () => {
    it("returns prompt list from config", async () => {
      const prompts = [
        { title: "Code Review", description: "Review code", prompt: "Review this code" },
        { title: "Refactor", description: "Refactor code", prompt: "Refactor this" },
      ];
      mockReadFile.mockResolvedValue(JSON.stringify(prompts));

      const res = await request(app).get("/prompts");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(prompts);
      expect(mockReadFile).toHaveBeenCalledWith("/mock/config/prompts.json", "utf-8");
    });

    it("returns 500 when config file read fails", async () => {
      mockReadFile.mockRejectedValue(new Error("Config missing"));

      const res = await request(app).get("/prompts");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Config missing");
    });
  });

  // ── POST / (create prompt) ──────────────────────────────────────────────

  describe("POST /prompts", () => {
    it("creates a new prompt", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));

      const res = await request(app).post("/prompts").send({
        title: "New Prompt",
        description: "A new prompt",
        prompt: "Do something useful",
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      // Verify it was appended to the array
      const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(written).toHaveLength(1);
      expect(written[0].title).toBe("New Prompt");
    });

    it("appends to existing prompts", async () => {
      const existing = [{ title: "Existing", description: "D", prompt: "P" }];
      mockReadFile.mockResolvedValue(JSON.stringify(existing));

      const res = await request(app).post("/prompts").send({
        title: "Second",
        description: "Desc",
        prompt: "Prompt text",
      });

      expect(res.status).toBe(200);
      const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(written).toHaveLength(2);
      expect(written[1].title).toBe("Second");
    });

    it("returns 400 when title is missing", async () => {
      const res = await request(app).post("/prompts").send({
        description: "Desc",
        prompt: "Text",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("title, description, and prompt are required");
    });

    it("returns 400 when description is missing", async () => {
      const res = await request(app).post("/prompts").send({
        title: "Title",
        prompt: "Text",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("title, description, and prompt are required");
    });

    it("returns 400 when prompt is missing", async () => {
      const res = await request(app).post("/prompts").send({
        title: "Title",
        description: "Desc",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("title, description, and prompt are required");
    });

    it("returns 500 on write failure", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([]));
      mockWriteFile.mockRejectedValue(new Error("Write failed"));

      const res = await request(app).post("/prompts").send({
        title: "T",
        description: "D",
        prompt: "P",
      });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Write failed");
    });
  });

  // ── DELETE /:index (delete prompt) ──────────────────────────────────────

  describe("DELETE /prompts/:index", () => {
    it("deletes a prompt by index", async () => {
      const prompts = [
        { title: "First", description: "D1", prompt: "P1" },
        { title: "Second", description: "D2", prompt: "P2" },
        { title: "Third", description: "D3", prompt: "P3" },
      ];
      mockReadFile.mockResolvedValue(JSON.stringify(prompts));

      const res = await request(app).delete("/prompts/1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(written).toHaveLength(2);
      expect(written[0].title).toBe("First");
      expect(written[1].title).toBe("Third");
    });

    it("deletes the first prompt (index 0)", async () => {
      const prompts = [
        { title: "First", description: "D1", prompt: "P1" },
        { title: "Second", description: "D2", prompt: "P2" },
      ];
      mockReadFile.mockResolvedValue(JSON.stringify(prompts));

      const res = await request(app).delete("/prompts/0");

      expect(res.status).toBe(200);
      const written = JSON.parse(mockWriteFile.mock.calls[0][1]);
      expect(written).toHaveLength(1);
      expect(written[0].title).toBe("Second");
    });

    it("returns 404 when index is out of range (too high)", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ title: "Only" }]));

      const res = await request(app).delete("/prompts/5");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Prompt not found");
    });

    it("returns 404 when index is negative", async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([{ title: "Only" }]));

      const res = await request(app).delete("/prompts/-1");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Prompt not found");
    });

    it("returns 500 on read failure", async () => {
      mockReadFile.mockRejectedValue(new Error("Read failed"));

      const res = await request(app).delete("/prompts/0");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Read failed");
    });
  });
});

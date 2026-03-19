import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../../../server/paths.js", () => ({
  configPath: vi.fn((name) => `/mock/config/${name}`),
  packageRoot: "/mock/package",
  userDir: "/mock/user",
  userConfigDir: "/mock/config",
  userPluginsDir: "/mock/plugins",
  dbPath: "/mock/data.db",
  defaultConfigDir: "/mock/default-config",
}));

const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();

vi.mock("fs/promises", () => ({
  readFile: (...args) => mockReadFile(...args),
  writeFile: (...args) => mockWriteFile(...args),
  mkdir: vi.fn(async () => {}),
}));

const routerModule = await import("../../../../server/routes/bot.js");
const router = routerModule.default;

// ── App setup ────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/", router);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("bot routes", () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  // ── GET /prompt ──────────────────────────────────────────────────────────
  describe("GET /prompt", () => {
    it("returns stored prompt data from file", async () => {
      const promptData = { systemPrompt: "You are a helpful bot." };
      mockReadFile.mockResolvedValue(JSON.stringify(promptData));

      const res = await request(app).get("/prompt");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(promptData);
      expect(mockReadFile).toHaveBeenCalledWith(
        "/mock/config/bot-prompt.json",
        "utf-8",
      );
    });

    it("returns default prompt when file does not exist", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      const res = await request(app).get("/prompt");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        systemPrompt:
          "You are an expert prompt engineer and AI assistant. Help users craft effective prompts, improve existing ones, and explain prompt engineering techniques. Be concise and actionable.",
      });
    });

    it("returns default prompt when file contains invalid JSON", async () => {
      mockReadFile.mockResolvedValue("not valid json {{{");

      const res = await request(app).get("/prompt");

      expect(res.status).toBe(200);
      expect(res.body.systemPrompt).toBeDefined();
    });
  });

  // ── PUT /prompt ──────────────────────────────────────────────────────────
  describe("PUT /prompt", () => {
    it("saves a new system prompt", async () => {
      mockWriteFile.mockResolvedValue(undefined);

      const res = await request(app)
        .put("/prompt")
        .send({ systemPrompt: "Be a pirate." });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(mockWriteFile).toHaveBeenCalledWith(
        "/mock/config/bot-prompt.json",
        JSON.stringify({ systemPrompt: "Be a pirate." }, null, 2) + "\n",
      );
    });

    it("returns 400 when systemPrompt is not a string", async () => {
      const res = await request(app)
        .put("/prompt")
        .send({ systemPrompt: 12345 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("systemPrompt must be a string");
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it("returns 400 when systemPrompt is missing", async () => {
      const res = await request(app).put("/prompt").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("systemPrompt must be a string");
    });

    it("returns 400 when systemPrompt is null", async () => {
      const res = await request(app)
        .put("/prompt")
        .send({ systemPrompt: null });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("systemPrompt must be a string");
    });

    it("accepts an empty string as systemPrompt", async () => {
      mockWriteFile.mockResolvedValue(undefined);

      const res = await request(app)
        .put("/prompt")
        .send({ systemPrompt: "" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it("returns 500 when writeFile fails", async () => {
      mockWriteFile.mockRejectedValue(new Error("Disk full"));

      const res = await request(app)
        .put("/prompt")
        .send({ systemPrompt: "test" });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Disk full");
    });
  });
});

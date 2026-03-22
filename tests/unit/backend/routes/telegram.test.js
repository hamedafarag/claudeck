import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetTelegramConfig = vi.fn();
const mockSaveTelegramConfig = vi.fn();
const mockSendTelegramNotification = vi.fn();

vi.mock("../../../../server/telegram-sender.js", () => ({
  getTelegramConfig: (...args) => mockGetTelegramConfig(...args),
  saveTelegramConfig: (...args) => mockSaveTelegramConfig(...args),
  sendTelegramNotification: (...args) =>
    mockSendTelegramNotification(...args),
}));

const mockRestartTelegramPoller = vi.fn();

vi.mock("../../../../server/telegram-poller.js", () => ({
  restartTelegramPoller: (...args) => mockRestartTelegramPoller(...args),
}));

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

vi.mock("fs/promises", () => ({
  readFile: (...args) => mockReadFile(...args),
}));

const routerModule = await import("../../../../server/routes/telegram.js");
const router = routerModule.default;

// ── App setup ────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/", router);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("telegram routes", () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  // ── GET /config ──────────────────────────────────────────────────────────
  describe("GET /config", () => {
    it("returns current telegram config", async () => {
      const config = {
        enabled: true,
        botToken: "****:abc123",
        chatId: "12345",
        afkTimeoutMinutes: 15,
        notify: { sessionComplete: true },
      };
      mockGetTelegramConfig.mockReturnValue(config);

      const res = await request(app).get("/config");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(config);
      expect(mockGetTelegramConfig).toHaveBeenCalled();
    });

    it("returns disabled config when not configured", async () => {
      mockGetTelegramConfig.mockReturnValue({
        enabled: false,
        botToken: "",
        chatId: "",
        afkTimeoutMinutes: 15,
        notify: {},
      });

      const res = await request(app).get("/config");

      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(false);
    });
  });

  // ── PUT /config ──────────────────────────────────────────────────────────
  describe("PUT /config", () => {
    it("saves new config with a real bot token", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      mockSaveTelegramConfig.mockResolvedValue(undefined);

      const newConfig = {
        enabled: true,
        botToken: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
        chatId: "987654321",
        afkTimeoutMinutes: 30,
        notify: { sessionComplete: true },
      };

      const res = await request(app).put("/config").send(newConfig);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(mockSaveTelegramConfig).toHaveBeenCalledWith({
        enabled: true,
        botToken: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
        chatId: "987654321",
        afkTimeoutMinutes: 30,
        notify: { sessionComplete: true },
      });
      expect(mockRestartTelegramPoller).toHaveBeenCalled();
    });

    it("keeps existing token when masked token is sent", async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({ botToken: "real-token-12345" }),
      );
      mockSaveTelegramConfig.mockResolvedValue(undefined);

      const res = await request(app).put("/config").send({
        enabled: true,
        botToken: "****:12345",
        chatId: "999",
      });

      expect(res.status).toBe(200);
      expect(mockSaveTelegramConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          botToken: "real-token-12345",
        }),
      );
    });

    it("keeps existing token when botToken is empty", async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({ botToken: "saved-token" }),
      );
      mockSaveTelegramConfig.mockResolvedValue(undefined);

      const res = await request(app).put("/config").send({
        enabled: false,
        botToken: "",
        chatId: "",
      });

      expect(res.status).toBe(200);
      expect(mockSaveTelegramConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          botToken: "saved-token",
        }),
      );
    });

    it("returns 400 when enabled is not a boolean", async () => {
      const res = await request(app).put("/config").send({
        enabled: "yes",
        botToken: "token",
        chatId: "123",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("enabled must be a boolean");
      expect(mockSaveTelegramConfig).not.toHaveBeenCalled();
    });

    it("returns 400 when enabled is missing", async () => {
      const res = await request(app).put("/config").send({
        botToken: "token",
        chatId: "123",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("enabled must be a boolean");
    });

    it("defaults afkTimeoutMinutes to 15 when not provided", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      mockSaveTelegramConfig.mockResolvedValue(undefined);

      const res = await request(app).put("/config").send({
        enabled: true,
        botToken: "real-token",
        chatId: "123",
      });

      expect(res.status).toBe(200);
      expect(mockSaveTelegramConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          afkTimeoutMinutes: 15,
        }),
      );
    });

    it("defaults notify to empty object when not provided", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      mockSaveTelegramConfig.mockResolvedValue(undefined);

      const res = await request(app).put("/config").send({
        enabled: false,
        botToken: "token",
        chatId: "123",
      });

      expect(res.status).toBe(200);
      expect(mockSaveTelegramConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          notify: {},
        }),
      );
    });

    it("returns 500 when saveTelegramConfig fails", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));
      mockSaveTelegramConfig.mockRejectedValue(new Error("Save failed"));

      const res = await request(app).put("/config").send({
        enabled: true,
        botToken: "token",
        chatId: "123",
      });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Save failed");
    });
  });

  // ── POST /test ───────────────────────────────────────────────────────────
  describe("POST /test", () => {
    it("sends a test notification and returns ok", async () => {
      mockSendTelegramNotification.mockResolvedValue(undefined);

      const res = await request(app).post("/test");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(mockSendTelegramNotification).toHaveBeenCalledWith(
        "session",
        "Claudeck Test",
        "Telegram notifications are working!",
        expect.objectContaining({
          durationMs: 1234,
          costUsd: 0.0042,
          inputTokens: 1500,
          outputTokens: 800,
          model: "claude-sonnet-4-6",
          turns: 3,
        }),
      );
    });

    it("returns 500 when sendTelegramNotification fails", async () => {
      mockSendTelegramNotification.mockRejectedValue(
        new Error("Telegram API error"),
      );

      const res = await request(app).post("/test");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Telegram API error");
    });
  });
});

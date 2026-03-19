import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("../../../../db.js", () => ({
  listSessions: vi.fn(() => []),
  deleteSession: vi.fn(),
  updateSessionTitle: vi.fn(),
  toggleSessionPin: vi.fn(),
  searchSessions: vi.fn(() => []),
}));

vi.mock("../../../../server/ws-handler.js", () => ({
  getActiveSessionIds: vi.fn(() => []),
}));

vi.mock("../../../../server/summarizer.js", () => ({
  generateSessionSummary: vi.fn(async () => "Test summary"),
}));

import sessionsRouter, { setSessionIds } from "../../../../server/routes/sessions.js";
import {
  listSessions,
  deleteSession as dbDeleteSession,
  updateSessionTitle,
  toggleSessionPin,
  searchSessions,
} from "../../../../db.js";
import { getActiveSessionIds } from "../../../../server/ws-handler.js";
import { generateSessionSummary } from "../../../../server/summarizer.js";

// ── App setup ────────────────────────────────────────────────────────────────
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/sessions", sessionsRouter);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("sessions routes", () => {
  let app;
  let sessionIds;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    sessionIds = new Map();
    setSessionIds(sessionIds);
  });

  // ── GET / ──────────────────────────────────────────────────────────────
  describe("GET /sessions", () => {
    it("returns session list", async () => {
      const mockSessions = [
        { id: "s1", title: "Session 1" },
        { id: "s2", title: "Session 2" },
      ];
      listSessions.mockReturnValue(mockSessions);

      const res = await request(app).get("/sessions");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockSessions);
      expect(listSessions).toHaveBeenCalledWith(20, undefined);
    });

    it("passes project_path filter to listSessions", async () => {
      listSessions.mockReturnValue([]);

      await request(app).get("/sessions?project_path=/my/project");

      expect(listSessions).toHaveBeenCalledWith(20, "/my/project");
    });

    it("returns 500 on database error", async () => {
      listSessions.mockImplementation(() => {
        throw new Error("DB failure");
      });

      const res = await request(app).get("/sessions");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("DB failure");
    });
  });

  // ── GET /search ────────────────────────────────────────────────────────
  describe("GET /sessions/search", () => {
    it("searches sessions with query param", async () => {
      const results = [{ id: "s1", title: "Matching session" }];
      searchSessions.mockReturnValue(results);

      const res = await request(app).get("/sessions/search?q=test");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(results);
      expect(searchSessions).toHaveBeenCalledWith("test", 20, undefined);
    });

    it("passes project_path to search", async () => {
      searchSessions.mockReturnValue([]);

      await request(app).get(
        "/sessions/search?q=hello&project_path=/proj",
      );

      expect(searchSessions).toHaveBeenCalledWith("hello", 20, "/proj");
    });

    it("defaults to empty string when q is missing", async () => {
      searchSessions.mockReturnValue([]);

      await request(app).get("/sessions/search");

      expect(searchSessions).toHaveBeenCalledWith("", 20, undefined);
    });

    it("returns 500 on error", async () => {
      searchSessions.mockImplementation(() => {
        throw new Error("Search failed");
      });

      const res = await request(app).get("/sessions/search?q=test");
      expect(res.status).toBe(500);
    });
  });

  // ── DELETE /:id ────────────────────────────────────────────────────────
  describe("DELETE /sessions/:id", () => {
    it("deletes a session and returns ok", async () => {
      const res = await request(app).delete("/sessions/abc-123");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(dbDeleteSession).toHaveBeenCalledWith("abc-123");
    });

    it("cleans up sessionIds map entries for the deleted session", async () => {
      sessionIds.set("abc-123", "claude-sid");
      sessionIds.set("abc-123::chat-1", "claude-sid-2");
      sessionIds.set("other-id", "claude-sid-3");

      await request(app).delete("/sessions/abc-123");

      expect(sessionIds.has("abc-123")).toBe(false);
      expect(sessionIds.has("abc-123::chat-1")).toBe(false);
      expect(sessionIds.has("other-id")).toBe(true);
    });

    it("returns 500 when deletion fails", async () => {
      dbDeleteSession.mockImplementation(() => {
        throw new Error("Delete error");
      });

      const res = await request(app).delete("/sessions/bad-id");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Delete error");
    });
  });

  // ── PUT /:id/title ────────────────────────────────────────────────────
  describe("PUT /sessions/:id/title", () => {
    it("updates session title", async () => {
      const res = await request(app)
        .put("/sessions/s1/title")
        .send({ title: "New Title" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(updateSessionTitle).toHaveBeenCalledWith("s1", "New Title");
    });

    it("truncates title to 200 characters", async () => {
      const longTitle = "x".repeat(300);
      await request(app)
        .put("/sessions/s1/title")
        .send({ title: longTitle });

      expect(updateSessionTitle).toHaveBeenCalledWith("s1", "x".repeat(200));
    });

    it("returns 400 when title is not a string", async () => {
      const res = await request(app)
        .put("/sessions/s1/title")
        .send({ title: 123 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("title is required");
      expect(updateSessionTitle).not.toHaveBeenCalled();
    });

    it("returns 400 when title is missing", async () => {
      const res = await request(app)
        .put("/sessions/s1/title")
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // ── PUT /:id/pin ──────────────────────────────────────────────────────
  describe("PUT /sessions/:id/pin", () => {
    it("toggles session pin", async () => {
      const res = await request(app).put("/sessions/s1/pin");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(toggleSessionPin).toHaveBeenCalledWith("s1");
    });

    it("returns 500 on error", async () => {
      toggleSessionPin.mockImplementation(() => {
        throw new Error("Pin error");
      });

      const res = await request(app).put("/sessions/s1/pin");
      expect(res.status).toBe(500);
    });
  });

  // ── GET /active ────────────────────────────────────────────────────────
  describe("GET /sessions/active", () => {
    it("returns active session IDs", async () => {
      getActiveSessionIds.mockReturnValue(["s1", "s2"]);

      const res = await request(app).get("/sessions/active");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ activeSessionIds: ["s1", "s2"] });
    });
  });

  // ── POST /:id/summary ─────────────────────────────────────────────────
  describe("POST /sessions/:id/summary", () => {
    it("generates a session summary", async () => {
      generateSessionSummary.mockResolvedValue("Great session");

      const res = await request(app).post("/sessions/s1/summary");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, summary: "Great session" });
      expect(generateSessionSummary).toHaveBeenCalledWith("s1");
    });

    it("returns 500 when summarizer fails", async () => {
      generateSessionSummary.mockRejectedValue(new Error("Summary error"));

      const res = await request(app).post("/sessions/s1/summary");
      expect(res.status).toBe(500);
    });
  });
});

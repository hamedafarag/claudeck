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
  forkSession: vi.fn(),
  getSession: vi.fn(),
  getSessionBranches: vi.fn(() => []),
  getSessionLineage: vi.fn(() => ({ ancestors: [], siblings: [] })),
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
  forkSession as dbForkSession,
  getSession,
  getSessionBranches,
  getSessionLineage,
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

    it("returns 500 when updateSessionTitle throws", async () => {
      updateSessionTitle.mockImplementation(() => {
        throw new Error("Title update failed");
      });

      const res = await request(app)
        .put("/sessions/s1/title")
        .send({ title: "Valid" });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Title update failed");
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

    it("returns 500 on error", async () => {
      getActiveSessionIds.mockImplementation(() => {
        throw new Error("Active error");
      });

      const res = await request(app).get("/sessions/active");
      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Active error");
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

  // ── POST /:id/fork ──────────────────────────────────────────────────
  describe("POST /sessions/:id/fork", () => {
    it("forks a session and returns the new session", async () => {
      const forkedSession = { id: "fork-1", title: "Fork of: Test", parent_session_id: "s1" };
      getSession.mockReturnValue({ id: "s1", title: "Test" });
      dbForkSession.mockReturnValue(forkedSession);

      const res = await request(app)
        .post("/sessions/s1/fork")
        .send({ messageId: 42 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(forkedSession);
      expect(dbForkSession).toHaveBeenCalledWith("s1", 42);
    });

    it("forks without messageId (defaults to null)", async () => {
      const forkedSession = { id: "fork-1", title: "Fork of: Test", parent_session_id: "s1" };
      getSession.mockReturnValue({ id: "s1", title: "Test" });
      dbForkSession.mockReturnValue(forkedSession);

      const res = await request(app)
        .post("/sessions/s1/fork")
        .send({});

      expect(res.status).toBe(200);
      expect(dbForkSession).toHaveBeenCalledWith("s1", null);
    });

    it("forks with empty body (no JSON)", async () => {
      const forkedSession = { id: "fork-1", title: "Fork of: Test", parent_session_id: "s1" };
      getSession.mockReturnValue({ id: "s1", title: "Test" });
      dbForkSession.mockReturnValue(forkedSession);

      const res = await request(app).post("/sessions/s1/fork");

      expect(res.status).toBe(200);
      expect(dbForkSession).toHaveBeenCalledWith("s1", null);
    });

    it("returns 404 when session does not exist", async () => {
      getSession.mockReturnValue(undefined);

      const res = await request(app)
        .post("/sessions/nonexistent/fork")
        .send({ messageId: 1 });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Session not found");
      expect(dbForkSession).not.toHaveBeenCalled();
    });

    it("returns 400 when messageId is invalid (non-number)", async () => {
      getSession.mockReturnValue({ id: "s1" });

      const res = await request(app)
        .post("/sessions/s1/fork")
        .send({ messageId: "abc" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid messageId");
    });

    it("returns 400 when messageId is zero or negative", async () => {
      getSession.mockReturnValue({ id: "s1" });

      const res = await request(app)
        .post("/sessions/s1/fork")
        .send({ messageId: 0 });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid messageId");
    });

    it("returns 400 when session has no messages", async () => {
      getSession.mockReturnValue({ id: "s1" });
      dbForkSession.mockImplementation(() => {
        throw new Error("No messages to fork");
      });

      const res = await request(app)
        .post("/sessions/s1/fork")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("No messages to fork");
    });

    it("returns 500 on unexpected error", async () => {
      getSession.mockReturnValue({ id: "s1" });
      dbForkSession.mockImplementation(() => {
        throw new Error("Unexpected DB error");
      });

      const res = await request(app)
        .post("/sessions/s1/fork")
        .send({ messageId: 1 });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Unexpected DB error");
    });
  });

  // ── GET /:id/branches ────────────────────────────────────────────────
  describe("GET /sessions/:id/branches", () => {
    it("returns branches for a session", async () => {
      const branches = [
        { id: "fork-1", title: "Fork of: Test", parent_session_id: "s1" },
        { id: "fork-2", title: "Fork of: Test", parent_session_id: "s1" },
      ];
      getSessionBranches.mockReturnValue(branches);

      const res = await request(app).get("/sessions/s1/branches");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(branches);
      expect(getSessionBranches).toHaveBeenCalledWith("s1");
    });

    it("returns empty array when no branches exist", async () => {
      getSessionBranches.mockReturnValue([]);

      const res = await request(app).get("/sessions/s1/branches");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns 500 on error", async () => {
      getSessionBranches.mockImplementation(() => {
        throw new Error("DB failure");
      });

      const res = await request(app).get("/sessions/s1/branches");
      expect(res.status).toBe(500);
      expect(res.body.error).toBe("DB failure");
    });
  });

  // ── GET /:id/lineage ─────────────────────────────────────────────────
  describe("GET /sessions/:id/lineage", () => {
    it("returns ancestors and siblings", async () => {
      const lineage = {
        ancestors: [{ id: "root", title: "Root" }],
        siblings: [{ id: "sibling-1", title: "Fork of: Root" }],
      };
      getSessionLineage.mockReturnValue(lineage);

      const res = await request(app).get("/sessions/fork-1/lineage");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(lineage);
      expect(getSessionLineage).toHaveBeenCalledWith("fork-1");
    });

    it("returns empty arrays for root session", async () => {
      getSessionLineage.mockReturnValue({ ancestors: [], siblings: [] });

      const res = await request(app).get("/sessions/s1/lineage");

      expect(res.status).toBe(200);
      expect(res.body.ancestors).toEqual([]);
      expect(res.body.siblings).toEqual([]);
    });

    it("returns 500 on error", async () => {
      getSessionLineage.mockImplementation(() => {
        throw new Error("Lineage error");
      });

      const res = await request(app).get("/sessions/fork-1/lineage");
      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Lineage error");
    });
  });
});

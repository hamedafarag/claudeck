import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../../../db.js", () => ({
  getMessages: vi.fn(() => []),
  getMessagesByChatId: vi.fn(() => []),
  getMessagesNoChatId: vi.fn(() => []),
  getRecentMessages: vi.fn(() => []),
  getRecentMessagesByChatId: vi.fn(() => []),
  getRecentMessagesNoChatId: vi.fn(() => []),
  getOlderMessages: vi.fn(() => []),
  getOlderMessagesByChatId: vi.fn(() => []),
  getOlderMessagesNoChatId: vi.fn(() => []),
}));

const messagesRouter = (await import("../../../../server/routes/messages.js")).default;
import {
  getMessages, getMessagesByChatId, getMessagesNoChatId,
  getRecentMessages, getRecentMessagesByChatId, getRecentMessagesNoChatId,
  getOlderMessages, getOlderMessagesByChatId, getOlderMessagesNoChatId,
} from "../../../../db.js";

// ── App setup ────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/sessions", messagesRouter);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("messages routes", () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  // ── GET /:id/messages ───────────────────────────────────────────────────

  describe("GET /sessions/:id/messages", () => {
    it("returns messages for a session", async () => {
      const messages = [
        { id: 1, role: "user", content: "Hello", session_id: "s1" },
        { id: 2, role: "assistant", content: "Hi there", session_id: "s1" },
      ];
      getMessages.mockReturnValue(messages);

      const res = await request(app).get("/sessions/s1/messages");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(messages);
      expect(getMessages).toHaveBeenCalledWith("s1");
    });

    it("returns empty array when session has no messages", async () => {
      getMessages.mockReturnValue([]);

      const res = await request(app).get("/sessions/empty-session/messages");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns 500 on database error", async () => {
      getMessages.mockImplementation(() => {
        throw new Error("DB read error");
      });

      const res = await request(app).get("/sessions/s1/messages");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("DB read error");
    });

    it("uses getRecentMessages when limit is provided", async () => {
      const messages = [{ id: 10, role: "user", content: "hi" }];
      getRecentMessages.mockReturnValue(messages);

      const res = await request(app).get("/sessions/s1/messages?limit=30");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(messages);
      expect(getRecentMessages).toHaveBeenCalledWith("s1", 30);
      expect(getMessages).not.toHaveBeenCalled();
    });

    it("uses getOlderMessages when limit and before are provided", async () => {
      const messages = [{ id: 5, role: "user", content: "old" }];
      getOlderMessages.mockReturnValue(messages);

      const res = await request(app).get("/sessions/s1/messages?limit=30&before=100");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(messages);
      expect(getOlderMessages).toHaveBeenCalledWith("s1", 100, 30);
      expect(getMessages).not.toHaveBeenCalled();
    });
  });

  // ── GET /:id/messages/:chatId ───────────────────────────────────────────

  describe("GET /sessions/:id/messages/:chatId", () => {
    it("returns messages filtered by chatId", async () => {
      const messages = [
        { id: 1, role: "user", content: "In chat", chat_id: "chat-1" },
      ];
      getMessagesByChatId.mockReturnValue(messages);

      const res = await request(app).get("/sessions/s1/messages/chat-1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(messages);
      expect(getMessagesByChatId).toHaveBeenCalledWith("s1", "chat-1");
    });

    it("returns empty array when chatId has no messages", async () => {
      getMessagesByChatId.mockReturnValue([]);

      const res = await request(app).get("/sessions/s1/messages/no-messages");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns 500 on database error", async () => {
      getMessagesByChatId.mockImplementation(() => {
        throw new Error("DB failure");
      });

      const res = await request(app).get("/sessions/s1/messages/chat-1");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("DB failure");
    });

    it("uses getRecentMessagesByChatId when limit is provided", async () => {
      const messages = [{ id: 8, role: "assistant", content: "hi" }];
      getRecentMessagesByChatId.mockReturnValue(messages);

      const res = await request(app).get("/sessions/s1/messages/chat-1?limit=20");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(messages);
      expect(getRecentMessagesByChatId).toHaveBeenCalledWith("s1", "chat-1", 20);
      expect(getMessagesByChatId).not.toHaveBeenCalled();
    });

    it("uses getOlderMessagesByChatId when limit and before are provided", async () => {
      const messages = [{ id: 3, role: "user", content: "old" }];
      getOlderMessagesByChatId.mockReturnValue(messages);

      const res = await request(app).get("/sessions/s1/messages/chat-1?limit=20&before=50");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(messages);
      expect(getOlderMessagesByChatId).toHaveBeenCalledWith("s1", "chat-1", 50, 20);
      expect(getMessagesByChatId).not.toHaveBeenCalled();
    });
  });

  // ── GET /:id/messages-single ────────────────────────────────────────────

  describe("GET /sessions/:id/messages-single", () => {
    it("returns messages where chat_id is NULL", async () => {
      const messages = [
        { id: 1, role: "user", content: "Single mode", chat_id: null },
      ];
      getMessagesNoChatId.mockReturnValue(messages);

      const res = await request(app).get("/sessions/s1/messages-single");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(messages);
      expect(getMessagesNoChatId).toHaveBeenCalledWith("s1");
    });

    it("returns empty array when no single-mode messages exist", async () => {
      getMessagesNoChatId.mockReturnValue([]);

      const res = await request(app).get("/sessions/s1/messages-single");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns 500 on database error", async () => {
      getMessagesNoChatId.mockImplementation(() => {
        throw new Error("Single mode error");
      });

      const res = await request(app).get("/sessions/s1/messages-single");

      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Single mode error");
    });

    it("uses getRecentMessagesNoChatId when limit is provided", async () => {
      const messages = [{ id: 7, role: "user", content: "recent" }];
      getRecentMessagesNoChatId.mockReturnValue(messages);

      const res = await request(app).get("/sessions/s1/messages-single?limit=30");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(messages);
      expect(getRecentMessagesNoChatId).toHaveBeenCalledWith("s1", 30);
      expect(getMessagesNoChatId).not.toHaveBeenCalled();
    });

    it("uses getOlderMessagesNoChatId when limit and before are provided", async () => {
      const messages = [{ id: 2, role: "assistant", content: "old" }];
      getOlderMessagesNoChatId.mockReturnValue(messages);

      const res = await request(app).get("/sessions/s1/messages-single?limit=30&before=80");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(messages);
      expect(getOlderMessagesNoChatId).toHaveBeenCalledWith("s1", 80, 30);
      expect(getMessagesNoChatId).not.toHaveBeenCalled();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUpsertPushSubscription = vi.fn();
const mockDeletePushSubscription = vi.fn();
const mockGetNotificationHistory = vi.fn(() => []);
const mockGetUnreadNotificationCount = vi.fn(() => 0);
const mockMarkNotificationsRead = vi.fn();
const mockMarkAllNotificationsRead = vi.fn();
const mockMarkNotificationsReadBefore = vi.fn();
const mockPurgeOldNotifications = vi.fn();

vi.mock("../../../../db.js", () => ({
  upsertPushSubscription: (...args) => mockUpsertPushSubscription(...args),
  deletePushSubscription: (...args) => mockDeletePushSubscription(...args),
  getNotificationHistory: (...args) => mockGetNotificationHistory(...args),
  getUnreadNotificationCount: (...args) => mockGetUnreadNotificationCount(...args),
  markNotificationsRead: (...args) => mockMarkNotificationsRead(...args),
  markAllNotificationsRead: (...args) => mockMarkAllNotificationsRead(...args),
  markNotificationsReadBefore: (...args) => mockMarkNotificationsReadBefore(...args),
  purgeOldNotifications: (...args) => mockPurgeOldNotifications(...args),
}));

const mockBroadcastReadUpdate = vi.fn();
const mockLogNotification = vi.fn(() => ({
  id: 99, type: "session", title: "Test", body: null,
  metadata: null, source_session_id: null, source_agent_id: null,
  read_at: null, created_at: 1700000000,
}));
vi.mock("../../../../server/notification-logger.js", () => ({
  broadcastReadUpdate: (...args) => mockBroadcastReadUpdate(...args),
  logNotification: (...args) => mockLogNotification(...args),
}));

const routerModule = await import(
  "../../../../server/routes/notifications.js"
);
const router = routerModule.default;
const { setVapidPublicKey } = routerModule;

// ── App setup ────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/", router);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("notifications routes", () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
    // Reset VAPID key to null before each test
    setVapidPublicKey(null);
  });

  // ── GET /vapid-public-key ────────────────────────────────────────────────
  describe("GET /vapid-public-key", () => {
    it("returns 404 when VAPID key is not configured", async () => {
      const res = await request(app).get("/vapid-public-key");

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Push notifications not configured");
    });

    it("returns the VAPID public key when configured", async () => {
      setVapidPublicKey("BPtest123publickey");

      const res = await request(app).get("/vapid-public-key");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ key: "BPtest123publickey" });
    });
  });

  // ── POST /subscribe ──────────────────────────────────────────────────────
  describe("POST /subscribe", () => {
    it("saves a valid push subscription", async () => {
      const subscription = {
        endpoint: "https://push.example.com/abc123",
        keys: {
          p256dh: "base64-p256dh-key",
          auth: "base64-auth-key",
        },
      };

      const res = await request(app).post("/subscribe").send(subscription);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(mockUpsertPushSubscription).toHaveBeenCalledWith(
        "https://push.example.com/abc123",
        "base64-p256dh-key",
        "base64-auth-key",
      );
    });

    it("returns 400 when endpoint is missing", async () => {
      const res = await request(app).post("/subscribe").send({
        keys: { p256dh: "key", auth: "auth" },
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid subscription");
      expect(mockUpsertPushSubscription).not.toHaveBeenCalled();
    });

    it("returns 400 when keys are missing", async () => {
      const res = await request(app).post("/subscribe").send({
        endpoint: "https://push.example.com/abc",
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid subscription");
    });

    it("returns 400 when p256dh key is missing", async () => {
      const res = await request(app).post("/subscribe").send({
        endpoint: "https://push.example.com/abc",
        keys: { auth: "auth-key" },
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid subscription");
    });

    it("returns 400 when auth key is missing", async () => {
      const res = await request(app).post("/subscribe").send({
        endpoint: "https://push.example.com/abc",
        keys: { p256dh: "p256dh-key" },
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid subscription");
    });

    it("returns 400 when body is empty", async () => {
      const res = await request(app).post("/subscribe").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Invalid subscription");
    });
  });

  // ── POST /unsubscribe ────────────────────────────────────────────────────
  describe("POST /unsubscribe", () => {
    it("removes a push subscription by endpoint", async () => {
      const res = await request(app).post("/unsubscribe").send({
        endpoint: "https://push.example.com/abc123",
      });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(mockDeletePushSubscription).toHaveBeenCalledWith(
        "https://push.example.com/abc123",
      );
    });

    it("returns 400 when endpoint is missing", async () => {
      const res = await request(app).post("/unsubscribe").send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Missing endpoint");
      expect(mockDeletePushSubscription).not.toHaveBeenCalled();
    });

    it("returns 400 when endpoint is empty string", async () => {
      const res = await request(app)
        .post("/unsubscribe")
        .send({ endpoint: "" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Missing endpoint");
    });
  });

  // ── POST /create ─────────────────────────────────────────────────────
  describe("POST /create", () => {
    it("creates a notification with type and title", async () => {
      const res = await request(app)
        .post("/create")
        .send({ type: "session", title: "Session done" });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("id");
      expect(mockLogNotification).toHaveBeenCalledWith(
        "session", "Session done", null, null, null, null
      );
    });

    it("passes all optional fields", async () => {
      const res = await request(app)
        .post("/create")
        .send({
          type: "error",
          title: "Failed",
          body: "timeout",
          metadata: '{"reason":"timeout"}',
          sourceSessionId: "sid-1",
          sourceAgentId: "agent-1",
        });

      expect(res.status).toBe(200);
      expect(mockLogNotification).toHaveBeenCalledWith(
        "error", "Failed", "timeout", '{"reason":"timeout"}', "sid-1", "agent-1"
      );
    });

    it("returns 400 when type is missing", async () => {
      const res = await request(app)
        .post("/create")
        .send({ title: "No type" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("type and title are required");
    });

    it("returns 400 when title is missing", async () => {
      const res = await request(app)
        .post("/create")
        .send({ type: "session" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("type and title are required");
    });

    it("returns 400 when body is empty", async () => {
      const res = await request(app)
        .post("/create")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("type and title are required");
    });
  });

  // ── GET /history ──────────────────────────────────────────────────────
  describe("GET /history", () => {
    it("returns empty array when no notifications exist", async () => {
      const res = await request(app).get("/history");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
      expect(mockGetNotificationHistory).toHaveBeenCalledWith(20, 0, false, null);
    });

    it("returns notification items from DB", async () => {
      const mockItems = [
        { id: 1, type: "agent", title: "Agent done", body: "5 turns", read_at: null, created_at: 1700000000 },
        { id: 2, type: "error", title: "Agent failed", body: "timeout", read_at: 1700000100, created_at: 1700000050 },
      ];
      mockGetNotificationHistory.mockReturnValue(mockItems);

      const res = await request(app).get("/history");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockItems);
    });

    it("passes limit and offset query params", async () => {
      await request(app).get("/history?limit=5&offset=10");

      expect(mockGetNotificationHistory).toHaveBeenCalledWith(5, 10, false, null);
    });

    it("caps limit at 100", async () => {
      await request(app).get("/history?limit=999");

      expect(mockGetNotificationHistory).toHaveBeenCalledWith(100, 0, false, null);
    });

    it("passes unread_only filter", async () => {
      await request(app).get("/history?unread_only=true");

      expect(mockGetNotificationHistory).toHaveBeenCalledWith(20, 0, true, null);
    });

    it("passes type filter", async () => {
      await request(app).get("/history?type=agent");

      expect(mockGetNotificationHistory).toHaveBeenCalledWith(20, 0, false, "agent");
    });

    it("passes combined filters", async () => {
      await request(app).get("/history?type=error&unread_only=true&limit=10&offset=5");

      expect(mockGetNotificationHistory).toHaveBeenCalledWith(10, 5, true, "error");
    });
  });

  // ── GET /unread-count ─────────────────────────────────────────────────
  describe("GET /unread-count", () => {
    it("returns zero when no unread notifications", async () => {
      const res = await request(app).get("/unread-count");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ count: 0 });
    });

    it("returns the unread count from DB", async () => {
      mockGetUnreadNotificationCount.mockReturnValue(7);

      const res = await request(app).get("/unread-count");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ count: 7 });
    });
  });

  // ── POST /read ────────────────────────────────────────────────────────
  describe("POST /read", () => {
    it("marks specific notification IDs as read", async () => {
      mockGetUnreadNotificationCount.mockReturnValue(2);

      const res = await request(app)
        .post("/read")
        .send({ ids: [1, 2, 3] });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, unreadCount: 2 });
      expect(mockMarkNotificationsRead).toHaveBeenCalledWith([1, 2, 3]);
      expect(mockBroadcastReadUpdate).toHaveBeenCalledWith([1, 2, 3]);
    });

    it("marks all notifications as read when all: true", async () => {
      mockGetUnreadNotificationCount.mockReturnValue(0);

      const res = await request(app)
        .post("/read")
        .send({ all: true });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, unreadCount: 0 });
      expect(mockMarkAllNotificationsRead).toHaveBeenCalled();
      expect(mockBroadcastReadUpdate).toHaveBeenCalledWith([]);
    });

    it("marks notifications before timestamp as read", async () => {
      mockGetUnreadNotificationCount.mockReturnValue(1);

      const res = await request(app)
        .post("/read")
        .send({ before: 1700000000 });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, unreadCount: 1 });
      expect(mockMarkNotificationsReadBefore).toHaveBeenCalledWith(1700000000);
      expect(mockBroadcastReadUpdate).toHaveBeenCalledWith([]);
    });

    it("returns 400 when no valid parameter is provided", async () => {
      const res = await request(app)
        .post("/read")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Provide ids, all, or before");
    });

    it("returns 400 when ids is an empty array", async () => {
      const res = await request(app)
        .post("/read")
        .send({ ids: [] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Provide ids, all, or before");
    });

    it("returns 400 when ids is not an array", async () => {
      const res = await request(app)
        .post("/read")
        .send({ ids: "not-an-array" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Provide ids, all, or before");
    });

    it("prefers all over ids when both provided", async () => {
      mockGetUnreadNotificationCount.mockReturnValue(0);

      const res = await request(app)
        .post("/read")
        .send({ all: true, ids: [1, 2] });

      expect(res.status).toBe(200);
      expect(mockMarkAllNotificationsRead).toHaveBeenCalled();
      expect(mockMarkNotificationsRead).not.toHaveBeenCalled();
    });
  });

  // ── DELETE /old ───────────────────────────────────────────────────────
  describe("DELETE /old", () => {
    it("purges old notifications", async () => {
      const res = await request(app).delete("/old");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
      expect(mockPurgeOldNotifications).toHaveBeenCalledWith(90);
    });
  });
});

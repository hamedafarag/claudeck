import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUpsertPushSubscription = vi.fn();
const mockDeletePushSubscription = vi.fn();

vi.mock("../../../../db.js", () => ({
  upsertPushSubscription: (...args) => mockUpsertPushSubscription(...args),
  deletePushSubscription: (...args) => mockDeletePushSubscription(...args),
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
});

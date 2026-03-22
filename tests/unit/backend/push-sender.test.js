import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db.js", () => ({
  getAllPushSubscriptions: vi.fn(() => []),
  deletePushSubscription: vi.fn(),
}));

import { initPushSender, sendPushNotification } from "../../../server/push-sender.js";
import { getAllPushSubscriptions, deletePushSubscription } from "../../../db.js";

beforeEach(() => {
  vi.clearAllMocks();
  // Re-initialize with no webpush to reset state
  initPushSender(null);
});

describe("initPushSender", () => {
  it("stores the webpush instance for later use", async () => {
    const mockWebpush = { sendNotification: vi.fn().mockResolvedValue({}) };
    initPushSender(mockWebpush);

    getAllPushSubscriptions.mockReturnValue([
      { endpoint: "https://push.example.com/1", keys_p256dh: "p1", keys_auth: "a1" },
    ]);

    await sendPushNotification("Title", "Body", "tag1");
    expect(mockWebpush.sendNotification).toHaveBeenCalledTimes(1);
  });
});

describe("sendPushNotification", () => {
  it("returns early when no webpush instance is set", async () => {
    getAllPushSubscriptions.mockReturnValue([
      { endpoint: "https://push.example.com/1", keys_p256dh: "p1", keys_auth: "a1" },
    ]);

    await sendPushNotification("Title", "Body", "tag1");
    // getAllPushSubscriptions should not be called when there's no webpush
    expect(getAllPushSubscriptions).not.toHaveBeenCalled();
  });

  it("returns early when there are no subscriptions", async () => {
    const mockWebpush = { sendNotification: vi.fn() };
    initPushSender(mockWebpush);
    getAllPushSubscriptions.mockReturnValue([]);

    await sendPushNotification("Title", "Body", "tag1");
    expect(mockWebpush.sendNotification).not.toHaveBeenCalled();
  });

  it("sends to all subscriptions", async () => {
    const mockWebpush = { sendNotification: vi.fn().mockResolvedValue({}) };
    initPushSender(mockWebpush);

    getAllPushSubscriptions.mockReturnValue([
      { endpoint: "https://push.example.com/1", keys_p256dh: "p1", keys_auth: "a1" },
      { endpoint: "https://push.example.com/2", keys_p256dh: "p2", keys_auth: "a2" },
      { endpoint: "https://push.example.com/3", keys_p256dh: "p3", keys_auth: "a3" },
    ]);

    await sendPushNotification("Title", "Body", "tag1");
    expect(mockWebpush.sendNotification).toHaveBeenCalledTimes(3);
  });

  it("removes stale subscription on 404 error", async () => {
    const err = new Error("Not Found");
    err.statusCode = 404;

    const mockWebpush = { sendNotification: vi.fn().mockRejectedValue(err) };
    initPushSender(mockWebpush);

    getAllPushSubscriptions.mockReturnValue([
      { endpoint: "https://push.example.com/stale", keys_p256dh: "p1", keys_auth: "a1" },
    ]);

    await sendPushNotification("Title", "Body", "tag1");
    expect(deletePushSubscription).toHaveBeenCalledWith("https://push.example.com/stale");
  });

  it("removes stale subscription on 410 error", async () => {
    const err = new Error("Gone");
    err.statusCode = 410;

    const mockWebpush = { sendNotification: vi.fn().mockRejectedValue(err) };
    initPushSender(mockWebpush);

    getAllPushSubscriptions.mockReturnValue([
      { endpoint: "https://push.example.com/gone", keys_p256dh: "p1", keys_auth: "a1" },
    ]);

    await sendPushNotification("Title", "Body", "tag1");
    expect(deletePushSubscription).toHaveBeenCalledWith("https://push.example.com/gone");
  });

  it("does NOT delete subscription on 500 error", async () => {
    const err = new Error("Server Error");
    err.statusCode = 500;

    const mockWebpush = { sendNotification: vi.fn().mockRejectedValue(err) };
    initPushSender(mockWebpush);

    getAllPushSubscriptions.mockReturnValue([
      { endpoint: "https://push.example.com/ok", keys_p256dh: "p1", keys_auth: "a1" },
    ]);

    await sendPushNotification("Title", "Body", "tag1");
    expect(deletePushSubscription).not.toHaveBeenCalled();
  });

  it("payload includes title, body, and tag", async () => {
    const mockWebpush = { sendNotification: vi.fn().mockResolvedValue({}) };
    initPushSender(mockWebpush);

    getAllPushSubscriptions.mockReturnValue([
      { endpoint: "https://push.example.com/1", keys_p256dh: "p1", keys_auth: "a1" },
    ]);

    await sendPushNotification("My Title", "My Body", "my-tag");

    const payload = mockWebpush.sendNotification.mock.calls[0][1];
    const parsed = JSON.parse(payload);
    expect(parsed).toEqual({ title: "My Title", body: "My Body", tag: "my-tag" });
  });

  it("passes correct subscription shape to webpush", async () => {
    const mockWebpush = { sendNotification: vi.fn().mockResolvedValue({}) };
    initPushSender(mockWebpush);

    getAllPushSubscriptions.mockReturnValue([
      { endpoint: "https://push.example.com/1", keys_p256dh: "pk", keys_auth: "ak" },
    ]);

    await sendPushNotification("T", "B", "t");

    const sub = mockWebpush.sendNotification.mock.calls[0][0];
    expect(sub).toEqual({
      endpoint: "https://push.example.com/1",
      keys: { p256dh: "pk", auth: "ak" },
    });
  });
});

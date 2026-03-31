import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db.js", () => ({
  createNotification: vi.fn(() => ({
    id: 1,
    type: "agent",
    title: "Test",
    body: "body",
    metadata: null,
    source_session_id: null,
    source_agent_id: null,
    read_at: null,
    created_at: 1700000000,
  })),
  getUnreadNotificationCount: vi.fn(() => 3),
}));

import { setWss, logNotification, broadcastReadUpdate } from "../../../server/notification-logger.js";
import { createNotification, getUnreadNotificationCount } from "../../../db.js";

beforeEach(() => {
  vi.clearAllMocks();
  setWss(null);
});

describe("setWss", () => {
  it("stores the WSS instance for broadcasting", async () => {
    const mockClient = { readyState: 1, send: vi.fn() };
    const mockWss = { clients: new Set([mockClient]) };
    setWss(mockWss);

    await logNotification("agent", "Test Title");
    expect(mockClient.send).toHaveBeenCalledTimes(1);
  });
});

describe("logNotification", () => {
  it("calls createNotification with all arguments", async () => {
    await logNotification("agent", "Agent done", "5 turns", '{"cost":0.01}', "sid-1", "agent-1");

    expect(createNotification).toHaveBeenCalledWith(
      "agent", "Agent done", "5 turns", '{"cost":0.01}', "sid-1", "agent-1"
    );
  });

  it("returns the created notification object", async () => {
    const result = await logNotification("agent", "Test");
    expect(result).toHaveProperty("id", 1);
    expect(result).toHaveProperty("type", "agent");
  });

  it("passes null for optional arguments", async () => {
    await logNotification("error", "Failed");

    expect(createNotification).toHaveBeenCalledWith(
      "error", "Failed", null, null, null, null
    );
  });

  it("broadcasts notification:new to all connected WS clients", async () => {
    const client1 = { readyState: 1, send: vi.fn() };
    const client2 = { readyState: 1, send: vi.fn() };
    const mockWss = { clients: new Set([client1, client2]) };
    setWss(mockWss);

    await logNotification("agent", "Test");

    expect(client1.send).toHaveBeenCalledTimes(1);
    expect(client2.send).toHaveBeenCalledTimes(1);

    const payload = JSON.parse(client1.send.mock.calls[0][0]);
    expect(payload.type).toBe("notification:new");
    expect(payload.notification).toBeDefined();
    expect(payload.unreadCount).toBe(3);
  });

  it("skips clients with non-open readyState", async () => {
    const openClient = { readyState: 1, send: vi.fn() };
    const closedClient = { readyState: 3, send: vi.fn() };
    const mockWss = { clients: new Set([openClient, closedClient]) };
    setWss(mockWss);

    await logNotification("agent", "Test");

    expect(openClient.send).toHaveBeenCalledTimes(1);
    expect(closedClient.send).not.toHaveBeenCalled();
  });

  it("does not throw when wss is null", async () => {
    setWss(null);
    await expect(logNotification("agent", "Test")).resolves.not.toThrow();
    expect(createNotification).toHaveBeenCalled();
  });
});

describe("broadcastReadUpdate", () => {
  it("broadcasts notification:read with ids and updated unread count", async () => {
    const client = { readyState: 1, send: vi.fn() };
    const mockWss = { clients: new Set([client]) };
    setWss(mockWss);

    await broadcastReadUpdate([1, 2, 3]);

    const payload = JSON.parse(client.send.mock.calls[0][0]);
    expect(payload.type).toBe("notification:read");
    expect(payload.ids).toEqual([1, 2, 3]);
    expect(payload.unreadCount).toBe(3);
  });

  it("broadcasts with empty ids array for mark-all-read", async () => {
    const client = { readyState: 1, send: vi.fn() };
    const mockWss = { clients: new Set([client]) };
    setWss(mockWss);

    await broadcastReadUpdate([]);

    const payload = JSON.parse(client.send.mock.calls[0][0]);
    expect(payload.ids).toEqual([]);
  });

  it("does not throw when wss is null", async () => {
    setWss(null);
    await expect(broadcastReadUpdate([1])).resolves.not.toThrow();
  });

  it("fetches fresh unread count from DB", async () => {
    const client = { readyState: 1, send: vi.fn() };
    setWss({ clients: new Set([client]) });

    await broadcastReadUpdate([1]);

    expect(getUnreadNotificationCount).toHaveBeenCalled();
  });
});

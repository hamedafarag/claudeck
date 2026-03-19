import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock telegram-sender.js
vi.mock("../../../server/telegram-sender.js", () => ({
  getRawBotToken: vi.fn(() => ""),
  isEnabled: vi.fn(() => false),
  answerCallbackQuery: vi.fn().mockResolvedValue(null),
  editMessageText: vi.fn().mockResolvedValue(null),
  editMessageReplyMarkup: vi.fn().mockResolvedValue(null),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  getRawBotToken,
  isEnabled,
  answerCallbackQuery,
  editMessageText,
  editMessageReplyMarkup,
} from "../../../server/telegram-sender.js";

let mod;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();

  // Re-mock after resetModules
  vi.doMock("../../../server/telegram-sender.js", () => ({
    getRawBotToken: vi.fn(() => ""),
    isEnabled: vi.fn(() => false),
    answerCallbackQuery: vi.fn().mockResolvedValue(null),
    editMessageText: vi.fn().mockResolvedValue(null),
    editMessageReplyMarkup: vi.fn().mockResolvedValue(null),
  }));

  mod = await import("../../../server/telegram-poller.js");
});

describe("trackApprovalMessage", () => {
  it("stores entry that can be retrieved by removeApprovalMessage", () => {
    mod.trackApprovalMessage("ap-1", 42, "Bash");
    const entry = mod.removeApprovalMessage("ap-1");
    expect(entry).toEqual({ messageId: 42, toolName: "Bash" });
  });
});

describe("removeApprovalMessage", () => {
  it("returns the entry and deletes it", () => {
    mod.trackApprovalMessage("ap-2", 100, "Read");
    const entry = mod.removeApprovalMessage("ap-2");
    expect(entry).toEqual({ messageId: 100, toolName: "Read" });

    // Second call should return undefined
    const entry2 = mod.removeApprovalMessage("ap-2");
    expect(entry2).toBeUndefined();
  });

  it("returns undefined for unknown approvalId", () => {
    const entry = mod.removeApprovalMessage("nonexistent");
    expect(entry).toBeUndefined();
  });
});

describe("markTelegramMessageResolved", () => {
  it("with 'allow' updates message with Approved text", async () => {
    const { editMessageText: emt } = await import("../../../server/telegram-sender.js");

    mod.trackApprovalMessage("ap-3", 55, "Bash");
    await mod.markTelegramMessageResolved("ap-3", "allow");

    expect(emt).toHaveBeenCalledTimes(1);
    const [messageId, text] = emt.mock.calls[0];
    expect(messageId).toBe(55);
    expect(text).toContain("Approved");
    expect(text).toContain("via Web");
  });

  it("with 'deny' updates message with Denied text", async () => {
    const { editMessageText: emt } = await import("../../../server/telegram-sender.js");

    mod.trackApprovalMessage("ap-4", 56, "Write");
    await mod.markTelegramMessageResolved("ap-4", "deny");

    expect(emt).toHaveBeenCalledTimes(1);
    const [messageId, text] = emt.mock.calls[0];
    expect(messageId).toBe(56);
    expect(text).toContain("Denied");
    expect(text).toContain("via Web");
  });

  it("does nothing when approvalId not tracked", async () => {
    const { editMessageText: emt } = await import("../../../server/telegram-sender.js");

    await mod.markTelegramMessageResolved("unknown-id", "allow");
    expect(emt).not.toHaveBeenCalled();
  });
});

describe("startTelegramPoller", () => {
  it("when disabled does not poll", async () => {
    const { isEnabled: ie, getRawBotToken: grbt } = await import("../../../server/telegram-sender.js");
    ie.mockReturnValue(false);

    mod.startTelegramPoller();

    // Should not have fetched anything since it's disabled
    // Wait a tick to ensure no async poll was started
    await new Promise((r) => setTimeout(r, 50));
    expect(mockFetch).not.toHaveBeenCalled();

    mod.stopTelegramPoller();
  });
});

describe("stopTelegramPoller", () => {
  it("aborts fetch when polling", async () => {
    const { isEnabled: ie, getRawBotToken: grbt } = await import("../../../server/telegram-sender.js");
    ie.mockReturnValue(true);
    grbt.mockReturnValue("test-token");

    // Make fetch hang indefinitely
    mockFetch.mockImplementation((_url, opts) => {
      return new Promise((resolve, reject) => {
        if (opts?.signal) {
          opts.signal.addEventListener("abort", () => {
            reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
          });
        }
      });
    });

    mod.startTelegramPoller();
    // Let the poll start
    await new Promise((r) => setTimeout(r, 50));

    mod.stopTelegramPoller();
    // Should not throw
  });
});

describe("registerApprovalBridge", () => {
  it("stores references for use in callback handling", () => {
    const pendingApprovals = new Map();
    const broadcast = vi.fn();

    // Should not throw
    mod.registerApprovalBridge(pendingApprovals, broadcast);
  });
});

describe("restartTelegramPoller", () => {
  it("stops the poller and schedules a restart after delay", async () => {
    vi.useFakeTimers();

    const { isEnabled: ie, getRawBotToken: grbt } =
      await import("../../../server/telegram-sender.js");
    ie.mockReturnValue(true);
    grbt.mockReturnValue("test-token");

    // Make fetch hang to simulate active polling
    mockFetch.mockImplementation(() => new Promise(() => {}));

    mod.startTelegramPoller();

    // Restart the poller
    mod.restartTelegramPoller();

    // After stopping, the 1000ms timer should trigger startTelegramPoller again
    vi.advanceTimersByTime(1000);

    // Should not throw; the poller was restarted
    mod.stopTelegramPoller();
    vi.useRealTimers();
  });
});

describe("startTelegramPoller (idempotency)", () => {
  it("does not start twice when called multiple times", async () => {
    const { isEnabled: ie, getRawBotToken: grbt } =
      await import("../../../server/telegram-sender.js");
    ie.mockReturnValue(true);
    grbt.mockReturnValue("test-token");

    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      mod.stopTelegramPoller();
      return { ok: true, json: () => Promise.resolve({ ok: true, result: [] }) };
    });

    mod.startTelegramPoller();
    mod.startTelegramPoller(); // second call should be no-op

    await new Promise((r) => setTimeout(r, 200));

    // Only one polling loop should have been started
    expect(callCount).toBeLessThanOrEqual(2);

    mod.stopTelegramPoller();
  });
});

describe("pollOnce with network error (non-AbortError)", () => {
  it("logs error and continues polling when fetch throws a network error", async () => {
    const { isEnabled: ie, getRawBotToken: grbt } =
      await import("../../../server/telegram-sender.js");
    ie.mockReturnValue(true);
    grbt.mockReturnValue("test-token");

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error("ECONNREFUSED: network error");
      }
      mod.stopTelegramPoller();
      return { ok: true, json: () => Promise.resolve({ ok: true, result: [] }) };
    });

    mod.startTelegramPoller();
    await new Promise((r) => setTimeout(r, 700));

    // Should have logged the error
    expect(consoleSpy).toHaveBeenCalledWith("Telegram poll error:", "ECONNREFUSED: network error");

    mod.stopTelegramPoller();
    consoleSpy.mockRestore();
  });
});

describe("pollOnce with no token", () => {
  it("returns early when getRawBotToken returns empty", async () => {
    const { isEnabled: ie, getRawBotToken: grbt } =
      await import("../../../server/telegram-sender.js");
    ie.mockReturnValue(true);
    grbt.mockReturnValue(""); // no token

    mod.startTelegramPoller();
    await new Promise((r) => setTimeout(r, 200));

    // fetch should not have been called since there's no token
    expect(mockFetch).not.toHaveBeenCalled();

    mod.stopTelegramPoller();
  });
});

describe("handleCallback (via poll processing)", () => {
  // handleCallback is not exported, so we test it indirectly through the poll loop.
  // We set up the poller, feed it callback data, and verify the outcomes.

  it("with approve action resolves approval", async () => {
    const { isEnabled: ie, getRawBotToken: grbt, answerCallbackQuery: acq, editMessageText: emt } =
      await import("../../../server/telegram-sender.js");
    ie.mockReturnValue(true);
    grbt.mockReturnValue("test-token");

    const resolveFn = vi.fn();
    const pendingApprovals = new Map();
    pendingApprovals.set("ap-100", {
      resolve: resolveFn,
      timer: setTimeout(() => {}, 99999),
      toolInput: { command: "ls" },
      ws: { readyState: 1, send: vi.fn() },
    });

    mod.registerApprovalBridge(pendingApprovals, vi.fn());
    mod.trackApprovalMessage("ap-100", 200, "Bash");

    // Mock fetch to return a callback_query update, then stop
    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          json: () => Promise.resolve({
            ok: true,
            result: [{
              update_id: 1,
              callback_query: {
                id: "cq-1",
                data: "approve:ap-100",
                message: { message_id: 200 },
              },
            }],
          }),
        };
      }
      // Stop polling after first response
      mod.stopTelegramPoller();
      return { ok: true, json: () => Promise.resolve({ ok: true, result: [] }) };
    });

    mod.startTelegramPoller();
    await new Promise((r) => setTimeout(r, 200));

    expect(resolveFn).toHaveBeenCalledWith({ behavior: "allow", updatedInput: { command: "ls" } });
    expect(acq).toHaveBeenCalled();

    mod.stopTelegramPoller();
  });

  it("with deny action resolves denial", async () => {
    const { isEnabled: ie, getRawBotToken: grbt, answerCallbackQuery: acq, editMessageText: emt } =
      await import("../../../server/telegram-sender.js");
    ie.mockReturnValue(true);
    grbt.mockReturnValue("test-token");

    const resolveFn = vi.fn();
    const pendingApprovals = new Map();
    pendingApprovals.set("ap-200", {
      resolve: resolveFn,
      timer: setTimeout(() => {}, 99999),
      toolInput: { command: "rm -rf /" },
      ws: { readyState: 1, send: vi.fn() },
    });

    mod.registerApprovalBridge(pendingApprovals, vi.fn());
    mod.trackApprovalMessage("ap-200", 300, "Bash");

    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          json: () => Promise.resolve({
            ok: true,
            result: [{
              update_id: 2,
              callback_query: {
                id: "cq-2",
                data: "deny:ap-200",
                message: { message_id: 300 },
              },
            }],
          }),
        };
      }
      mod.stopTelegramPoller();
      return { ok: true, json: () => Promise.resolve({ ok: true, result: [] }) };
    });

    mod.startTelegramPoller();
    await new Promise((r) => setTimeout(r, 200));

    expect(resolveFn).toHaveBeenCalledWith({ behavior: "deny", message: "Denied via Telegram" });

    mod.stopTelegramPoller();
  });

  it("with unknown approval returns 'Already resolved'", async () => {
    const { isEnabled: ie, getRawBotToken: grbt, answerCallbackQuery: acq } =
      await import("../../../server/telegram-sender.js");
    ie.mockReturnValue(true);
    grbt.mockReturnValue("test-token");

    mod.registerApprovalBridge(new Map(), vi.fn());

    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          json: () => Promise.resolve({
            ok: true,
            result: [{
              update_id: 3,
              callback_query: {
                id: "cq-3",
                data: "approve:nonexistent",
                message: { message_id: 999 },
              },
            }],
          }),
        };
      }
      mod.stopTelegramPoller();
      return { ok: true, json: () => Promise.resolve({ ok: true, result: [] }) };
    });

    mod.startTelegramPoller();
    await new Promise((r) => setTimeout(r, 200));

    expect(acq).toHaveBeenCalledWith("cq-3", "Already resolved");

    mod.stopTelegramPoller();
  });

  it("with unknown action answers 'Unknown action'", async () => {
    const { isEnabled: ie, getRawBotToken: grbt, answerCallbackQuery: acq } =
      await import("../../../server/telegram-sender.js");
    ie.mockReturnValue(true);
    grbt.mockReturnValue("test-token");

    mod.registerApprovalBridge(new Map(), vi.fn());

    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          json: () => Promise.resolve({
            ok: true,
            result: [{
              update_id: 10,
              callback_query: {
                id: "cq-unknown",
                data: "invalid_action:ap-999",
              },
            }],
          }),
        };
      }
      mod.stopTelegramPoller();
      return { ok: true, json: () => Promise.resolve({ ok: true, result: [] }) };
    });

    mod.startTelegramPoller();
    await new Promise((r) => setTimeout(r, 200));

    expect(acq).toHaveBeenCalledWith("cq-unknown", "Unknown action");

    mod.stopTelegramPoller();
  });

  it("with missing approvalId answers 'Unknown action'", async () => {
    const { isEnabled: ie, getRawBotToken: grbt, answerCallbackQuery: acq } =
      await import("../../../server/telegram-sender.js");
    ie.mockReturnValue(true);
    grbt.mockReturnValue("test-token");

    mod.registerApprovalBridge(new Map(), vi.fn());

    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          json: () => Promise.resolve({
            ok: true,
            result: [{
              update_id: 11,
              callback_query: {
                id: "cq-noid",
                data: "approve",  // no colon, no approvalId
              },
            }],
          }),
        };
      }
      mod.stopTelegramPoller();
      return { ok: true, json: () => Promise.resolve({ ok: true, result: [] }) };
    });

    mod.startTelegramPoller();
    await new Promise((r) => setTimeout(r, 200));

    expect(acq).toHaveBeenCalledWith("cq-noid", "Unknown action");

    mod.stopTelegramPoller();
  });

  it("falls back to editMessageReplyMarkup when no tracked approval message", async () => {
    const { isEnabled: ie, getRawBotToken: grbt, answerCallbackQuery: acq, editMessageReplyMarkup: emrm } =
      await import("../../../server/telegram-sender.js");
    ie.mockReturnValue(true);
    grbt.mockReturnValue("test-token");

    mod.registerApprovalBridge(new Map(), vi.fn());
    // Intentionally NOT tracking any approval message

    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          json: () => Promise.resolve({
            ok: true,
            result: [{
              update_id: 12,
              callback_query: {
                id: "cq-fallback",
                data: "approve:ap-fallback",
                message: { message_id: 777 },
              },
            }],
          }),
        };
      }
      mod.stopTelegramPoller();
      return { ok: true, json: () => Promise.resolve({ ok: true, result: [] }) };
    });

    mod.startTelegramPoller();
    await new Promise((r) => setTimeout(r, 200));

    // Should fall back to editMessageReplyMarkup since no tracked message
    expect(emrm).toHaveBeenCalledWith(777);

    mod.stopTelegramPoller();
  });

  it("handles approval with closed websocket (readyState !== 1)", async () => {
    const { isEnabled: ie, getRawBotToken: grbt, answerCallbackQuery: acq } =
      await import("../../../server/telegram-sender.js");
    ie.mockReturnValue(true);
    grbt.mockReturnValue("test-token");

    const resolveFn = vi.fn();
    const wsSendFn = vi.fn();
    const pendingApprovals = new Map();
    pendingApprovals.set("ap-ws-closed", {
      resolve: resolveFn,
      timer: setTimeout(() => {}, 99999),
      toolInput: { command: "test" },
      ws: { readyState: 3, send: wsSendFn }, // readyState 3 = CLOSED
    });

    mod.registerApprovalBridge(pendingApprovals, vi.fn());
    mod.trackApprovalMessage("ap-ws-closed", 888, "Bash");

    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          json: () => Promise.resolve({
            ok: true,
            result: [{
              update_id: 13,
              callback_query: {
                id: "cq-ws",
                data: "approve:ap-ws-closed",
                message: { message_id: 888 },
              },
            }],
          }),
        };
      }
      mod.stopTelegramPoller();
      return { ok: true, json: () => Promise.resolve({ ok: true, result: [] }) };
    });

    mod.startTelegramPoller();
    await new Promise((r) => setTimeout(r, 200));

    // Should still resolve the approval
    expect(resolveFn).toHaveBeenCalledWith({ behavior: "allow", updatedInput: { command: "test" } });
    // But should NOT send WS message since socket is closed
    expect(wsSendFn).not.toHaveBeenCalled();

    mod.stopTelegramPoller();
  });

  it("handles poll response with !res.ok gracefully", async () => {
    const { isEnabled: ie, getRawBotToken: grbt } =
      await import("../../../server/telegram-sender.js");
    ie.mockReturnValue(true);
    grbt.mockReturnValue("test-token");

    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 401,
          text: () => Promise.resolve("Unauthorized"),
        };
      }
      mod.stopTelegramPoller();
      return { ok: true, json: () => Promise.resolve({ ok: true, result: [] }) };
    });

    mod.startTelegramPoller();
    await new Promise((r) => setTimeout(r, 700));

    // Should not throw; just logs and continues
    expect(callCount).toBeGreaterThanOrEqual(1);

    mod.stopTelegramPoller();
  });

  it("handles poll response with empty/no results", async () => {
    const { isEnabled: ie, getRawBotToken: grbt } =
      await import("../../../server/telegram-sender.js");
    ie.mockReturnValue(true);
    grbt.mockReturnValue("test-token");

    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      if (callCount <= 2) {
        return {
          ok: true,
          json: () => Promise.resolve({ ok: true, result: [] }),
        };
      }
      mod.stopTelegramPoller();
      return { ok: true, json: () => Promise.resolve({ ok: true, result: [] }) };
    });

    mod.startTelegramPoller();
    await new Promise((r) => setTimeout(r, 700));

    // Should have polled multiple times without error
    expect(callCount).toBeGreaterThanOrEqual(2);

    mod.stopTelegramPoller();
  });

  it("handles non-callback_query updates (ignores them)", async () => {
    const { isEnabled: ie, getRawBotToken: grbt, answerCallbackQuery: acq } =
      await import("../../../server/telegram-sender.js");
    ie.mockReturnValue(true);
    grbt.mockReturnValue("test-token");

    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          json: () => Promise.resolve({
            ok: true,
            result: [{
              update_id: 20,
              message: { text: "some text message" },  // Not a callback_query
            }],
          }),
        };
      }
      mod.stopTelegramPoller();
      return { ok: true, json: () => Promise.resolve({ ok: true, result: [] }) };
    });

    mod.startTelegramPoller();
    await new Promise((r) => setTimeout(r, 200));

    // Should not have called answerCallbackQuery
    expect(acq).not.toHaveBeenCalled();

    mod.stopTelegramPoller();
  });
});

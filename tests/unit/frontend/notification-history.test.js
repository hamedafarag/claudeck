// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Capture event registrations ──────────────────────────────────────────────

let capturedHandlers = {};

vi.mock("../../../public/js/core/events.js", () => ({
  on: vi.fn((event, handler) => {
    if (!capturedHandlers[event]) capturedHandlers[event] = [];
    capturedHandlers[event].push(handler);
  }),
}));

// ── Mock fetch globally ──────────────────────────────────────────────────────

globalThis.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve([]),
  })
);

// ── Tests ────────────────────────────────────────────────────────────────────

describe("notification-history", () => {
  beforeEach(() => {
    capturedHandlers = {};
    vi.clearAllMocks();
  });

  it("module imports without error", async () => {
    await expect(
      import("../../../public/js/ui/notification-history.js")
    ).resolves.not.toThrow();
  });

  it("registers notification:show-history event handler", async () => {
    capturedHandlers = {};
    vi.resetModules();

    vi.doMock("../../../public/js/core/events.js", () => ({
      on: vi.fn((event, handler) => {
        if (!capturedHandlers[event]) capturedHandlers[event] = [];
        capturedHandlers[event].push(handler);
      }),
    }));

    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      })
    );

    await import("../../../public/js/ui/notification-history.js");

    expect(capturedHandlers["notification:show-history"]).toBeDefined();
    expect(capturedHandlers["notification:show-history"].length).toBe(1);
  });

  it("show-history handler creates an overlay when called", async () => {
    capturedHandlers = {};
    vi.resetModules();

    vi.doMock("../../../public/js/core/events.js", () => ({
      on: vi.fn((event, handler) => {
        if (!capturedHandlers[event]) capturedHandlers[event] = [];
        capturedHandlers[event].push(handler);
      }),
    }));

    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      })
    );

    await import("../../../public/js/ui/notification-history.js");

    const handler = capturedHandlers["notification:show-history"][0];
    handler();

    const overlay = document.querySelector(".notif-history-overlay");
    expect(overlay).not.toBeNull();

    const modal = overlay.querySelector(".notif-history-modal");
    expect(modal).not.toBeNull();

    const header = modal.querySelector("h2");
    expect(header.textContent).toBe("Notification History");

    // Cleanup
    overlay.remove();
  });

  it("overlay includes filter selects", async () => {
    capturedHandlers = {};
    vi.resetModules();

    vi.doMock("../../../public/js/core/events.js", () => ({
      on: vi.fn((event, handler) => {
        if (!capturedHandlers[event]) capturedHandlers[event] = [];
        capturedHandlers[event].push(handler);
      }),
    }));

    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      })
    );

    await import("../../../public/js/ui/notification-history.js");

    const handler = capturedHandlers["notification:show-history"][0];
    handler();

    const typeFilter = document.getElementById("notif-filter-type");
    expect(typeFilter).not.toBeNull();
    expect(typeFilter.tagName).toBe("SELECT");

    const statusFilter = document.getElementById("notif-filter-status");
    expect(statusFilter).not.toBeNull();

    // Cleanup
    document.querySelector(".notif-history-overlay")?.remove();
  });

  it("close button removes the overlay", async () => {
    capturedHandlers = {};
    vi.resetModules();

    vi.doMock("../../../public/js/core/events.js", () => ({
      on: vi.fn((event, handler) => {
        if (!capturedHandlers[event]) capturedHandlers[event] = [];
        capturedHandlers[event].push(handler);
      }),
    }));

    globalThis.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      })
    );

    await import("../../../public/js/ui/notification-history.js");

    const handler = capturedHandlers["notification:show-history"][0];
    handler();

    const closeBtn = document.querySelector(".notif-history-close");
    expect(closeBtn).not.toBeNull();
    closeBtn.click();

    const overlay = document.querySelector(".notif-history-overlay");
    expect(overlay).toBeNull();
  });
});

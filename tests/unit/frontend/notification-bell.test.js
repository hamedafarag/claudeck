// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";

// ── Capture the event handlers registered by the module ──────────────────────

let capturedHandlers = {};

vi.mock("../../../public/js/core/events.js", () => ({
  on: vi.fn((event, handler) => {
    if (!capturedHandlers[event]) capturedHandlers[event] = [];
    capturedHandlers[event].push(handler);
  }),
  emit: vi.fn(),
}));

// ── Set up DOM elements before module import ─────────────────────────────────

function ensureDomElements() {
  if (!document.getElementById("notif-bell-btn")) {
    const btn = document.createElement("button");
    btn.id = "notif-bell-btn";
    document.body.appendChild(btn);
  }
  if (!document.getElementById("notif-badge")) {
    const b = document.createElement("span");
    b.id = "notif-badge";
    b.classList.add("hidden");
    document.body.appendChild(b);
  }
  if (!document.getElementById("notif-dropdown")) {
    const d = document.createElement("div");
    d.id = "notif-dropdown";
    d.classList.add("hidden");
    document.body.appendChild(d);
  }
}

ensureDomElements();

// ── Mock fetch globally ──────────────────────────────────────────────────────

globalThis.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ count: 0 }),
  })
);

// ── Import module (triggers init()) ──────────────────────────────────────────
// We import once and test the state it sets up.

await import("../../../public/js/ui/notification-bell.js");

// ── Tests ────────────────────────────────────────────────────────────────────

describe("notification-bell", () => {
  it("module imports without error", () => {
    // If we got here, the import above succeeded
    expect(true).toBe(true);
  });

  it("registers ws:message event handler on init", () => {
    expect(capturedHandlers["ws:message"]).toBeDefined();
    expect(capturedHandlers["ws:message"].length).toBeGreaterThanOrEqual(1);
  });

  it("registers ws:reconnected event handler on init", () => {
    expect(capturedHandlers["ws:reconnected"]).toBeDefined();
    expect(capturedHandlers["ws:reconnected"].length).toBeGreaterThanOrEqual(1);
  });

  it("badge shows count when ws:message with notification:new arrives", () => {
    const handler = capturedHandlers["ws:message"][0];
    const badgeEl = document.getElementById("notif-badge");
    const bellBtnEl = document.getElementById("notif-bell-btn");

    handler({
      type: "notification:new",
      unreadCount: 5,
      notification: { id: 1, title: "Test", type: "agent", created_at: Math.floor(Date.now() / 1000) },
    });

    expect(badgeEl.textContent).toBe("5");
    expect(badgeEl.classList.contains("hidden")).toBe(false);
    expect(bellBtnEl.classList.contains("has-unread")).toBe(true);
  });

  it("badge hides when count is 0", () => {
    const handler = capturedHandlers["ws:message"][0];
    const badgeEl = document.getElementById("notif-badge");
    const bellBtnEl = document.getElementById("notif-bell-btn");

    // First set a count
    handler({
      type: "notification:new",
      unreadCount: 3,
      notification: { id: 2, title: "Test2", type: "session", created_at: Math.floor(Date.now() / 1000) },
    });
    expect(badgeEl.classList.contains("hidden")).toBe(false);

    // Then set count to 0 via notification:read
    handler({
      type: "notification:read",
      unreadCount: 0,
      ids: [2],
    });

    expect(badgeEl.classList.contains("hidden")).toBe(true);
    expect(bellBtnEl.classList.contains("has-unread")).toBe(false);
  });

  it("badge shows 99+ when count exceeds 99", () => {
    const handler = capturedHandlers["ws:message"][0];
    const badgeEl = document.getElementById("notif-badge");

    handler({
      type: "notification:new",
      unreadCount: 150,
      notification: { id: 3, title: "Many", type: "error", created_at: Math.floor(Date.now() / 1000) },
    });

    expect(badgeEl.textContent).toBe("99+");
  });

  // ── Toggle dropdown ──────────────────────────────────────────────────────

  describe("toggle dropdown", () => {
    function mockFetchForDropdown(notifications = []) {
      globalThis.fetch = vi.fn((url) => {
        if (url.includes("/history")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(notifications),
          });
        }
        if (url.includes("/unread-count")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ count: 0 }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
    }

    // Use outside click to reliably close dropdown and sync internal state
    function ensureClosed() {
      document.body.click();
    }

    it("opens dropdown on bell click", async () => {
      ensureClosed();
      mockFetchForDropdown([]);
      const bellBtnEl = document.getElementById("notif-bell-btn");
      const dropdownEl = document.getElementById("notif-dropdown");

      bellBtnEl.click();

      expect(dropdownEl.classList.contains("hidden")).toBe(false);
    });

    it("closes dropdown on second bell click", () => {
      ensureClosed();
      const bellBtnEl = document.getElementById("notif-bell-btn");
      const dropdownEl = document.getElementById("notif-dropdown");

      mockFetchForDropdown([]);

      // First click opens
      bellBtnEl.click();
      expect(dropdownEl.classList.contains("hidden")).toBe(false);

      // Second click closes
      bellBtnEl.click();
      expect(dropdownEl.classList.contains("hidden")).toBe(true);
    });

    it("closes dropdown on outside click", () => {
      ensureClosed();
      const bellBtnEl = document.getElementById("notif-bell-btn");
      const dropdownEl = document.getElementById("notif-dropdown");

      mockFetchForDropdown([]);

      // Open the dropdown
      bellBtnEl.click();
      expect(dropdownEl.classList.contains("hidden")).toBe(false);

      // Click outside
      document.body.click();
      expect(dropdownEl.classList.contains("hidden")).toBe(true);
    });
  });

  // ── Render notifications ─────────────────────────────────────────────────

  describe("render notifications", () => {
    function mockFetchForDropdown(notifications = []) {
      globalThis.fetch = vi.fn((url) => {
        if (url.includes("/history")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(notifications),
          });
        }
        if (url.includes("/unread-count")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ count: 0 }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
    }

    function ensureClosed() {
      document.body.click();
    }

    it("renders notification items when history returns data", async () => {
      ensureClosed();
      const dropdownEl = document.getElementById("notif-dropdown");
      const bellBtnEl = document.getElementById("notif-bell-btn");

      mockFetchForDropdown([
        { id: 1, title: "Session done", type: "session", body: "Completed", created_at: Math.floor(Date.now() / 1000), read_at: null },
      ]);

      bellBtnEl.click();

      await vi.waitFor(() => {
        const items = dropdownEl.querySelectorAll(".notif-item");
        expect(items.length).toBe(1);
      });
    });

    it("renders empty state when no notifications", async () => {
      ensureClosed();
      const dropdownEl = document.getElementById("notif-dropdown");
      const bellBtnEl = document.getElementById("notif-bell-btn");

      mockFetchForDropdown([]);

      bellBtnEl.click();

      await vi.waitFor(() => {
        expect(dropdownEl.textContent).toContain("No notifications yet");
      });
    });

    it("shows mark all read button", async () => {
      ensureClosed();
      const dropdownEl = document.getElementById("notif-dropdown");
      const bellBtnEl = document.getElementById("notif-bell-btn");

      mockFetchForDropdown([
        { id: 10, title: "Test notif", type: "agent", body: "body", created_at: Math.floor(Date.now() / 1000), read_at: null },
      ]);

      bellBtnEl.click();

      await vi.waitFor(() => {
        const btn = dropdownEl.querySelector('[data-action="mark-all-read"]');
        expect(btn).not.toBeNull();
      });
    });

    it("renders unread dot for unread notifications", async () => {
      ensureClosed();
      const dropdownEl = document.getElementById("notif-dropdown");
      const bellBtnEl = document.getElementById("notif-bell-btn");

      mockFetchForDropdown([
        { id: 20, title: "Unread notif", type: "session", body: "", created_at: Math.floor(Date.now() / 1000), read_at: null },
      ]);

      bellBtnEl.click();

      await vi.waitFor(() => {
        const dot = dropdownEl.querySelector(".notif-dot.unread");
        expect(dot).not.toBeNull();
      });
    });
  });

  // ── timeAgo via rendered output ──────────────────────────────────────────

  describe("timeAgo via rendered output", () => {
    function mockFetchForDropdown(notifications = []) {
      globalThis.fetch = vi.fn((url) => {
        if (url.includes("/history")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(notifications),
          });
        }
        if (url.includes("/unread-count")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ count: 0 }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
    }

    function ensureClosed() {
      document.body.click();
    }

    it("shows 'now' for recent notifications", async () => {
      ensureClosed();
      const dropdownEl = document.getElementById("notif-dropdown");
      const bellBtnEl = document.getElementById("notif-bell-btn");

      mockFetchForDropdown([
        { id: 30, title: "Just now", type: "session", body: "", created_at: Math.floor(Date.now() / 1000), read_at: null },
      ]);

      bellBtnEl.click();

      await vi.waitFor(() => {
        const timeEl = dropdownEl.querySelector(".notif-time");
        expect(timeEl).not.toBeNull();
        expect(timeEl.textContent).toBe("now");
      });
    });

    it("shows minutes for older notifications", async () => {
      ensureClosed();
      const dropdownEl = document.getElementById("notif-dropdown");
      const bellBtnEl = document.getElementById("notif-bell-btn");

      const fiveMinAgo = Math.floor(Date.now() / 1000) - 300;
      mockFetchForDropdown([
        { id: 31, title: "Five min ago", type: "agent", body: "", created_at: fiveMinAgo, read_at: null },
      ]);

      bellBtnEl.click();

      await vi.waitFor(() => {
        const timeEl = dropdownEl.querySelector(".notif-time");
        expect(timeEl).not.toBeNull();
        expect(timeEl.textContent).toBe("5m");
      });
    });
  });
});

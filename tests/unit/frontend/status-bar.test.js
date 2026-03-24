// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let eventHandlers;

// Create real DOM elements for MutationObserver compatibility
const projectSelect = document.createElement("select");
const opt = document.createElement("option");
opt.textContent = "test-project";
opt.value = "/test/project";
projectSelect.appendChild(opt);

const projectCostEl = document.createElement("span");
projectCostEl.textContent = "$0.05";
const totalCostEl = document.createElement("span");
totalCostEl.textContent = "$1.20";

vi.mock("../../../public/js/core/dom.js", () => ({
  $: {
    projectSelect,
    projectCostEl,
    totalCostEl,
  },
}));

vi.mock("../../../public/js/core/store.js", () => ({
  getState: vi.fn(() => new Map()),
  on: vi.fn(),
}));

vi.mock("../../../public/js/core/events.js", () => {
  eventHandlers = {};
  return {
    on: vi.fn((event, handler) => {
      if (!eventHandlers[event]) eventHandlers[event] = [];
      eventHandlers[event].push(handler);
    }),
  };
});

vi.mock("../../../public/js/core/api.js", () => ({
  execCommand: vi.fn().mockResolvedValue({ stdout: "main" }),
}));

vi.mock("../../../public/js/features/cost-dashboard.js", () => ({
  openCostDashboard: vi.fn(),
}));

beforeEach(async () => {
  vi.resetModules();
  eventHandlers = {};

  // Create status bar DOM elements
  document.body.innerHTML = `
    <span id="sb-dot" class="sb-dot"></span>
    <span id="sb-connection-text">disconnected</span>
    <span id="sb-branch-name">--</span>
    <span id="sb-project-name">--</span>
    <span id="sb-activity"></span>
    <span id="sb-session-cost"></span>
    <span id="sb-total-cost"></span>
    <span id="sb-bg-sessions" class="hidden"></span>
    <span id="sb-bg-sep" class="hidden"></span>
    <span id="sb-bg-count"></span>
    <span id="sb-version"></span>
  `;

  // Mock fetch for version
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ version: "1.2.0" }),
  });

  vi.doMock("../../../public/js/core/dom.js", () => ({
    $: {
      projectSelect,
      projectCostEl,
      totalCostEl,
    },
  }));
  vi.doMock("../../../public/js/core/store.js", () => ({
    getState: vi.fn(() => new Map()),
    on: vi.fn(),
  }));
  vi.doMock("../../../public/js/core/events.js", () => ({
    on: vi.fn((event, handler) => {
      if (!eventHandlers[event]) eventHandlers[event] = [];
      eventHandlers[event].push(handler);
    }),
  }));
  vi.doMock("../../../public/js/core/api.js", () => ({
    execCommand: vi.fn().mockResolvedValue({ stdout: "main" }),
  }));
  vi.doMock("../../../public/js/features/cost-dashboard.js", () => ({
    openCostDashboard: vi.fn(),
  }));

  await import("../../../public/js/ui/status-bar.js");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("status-bar", () => {
  it("imports without error", () => {
    expect(true).toBe(true);
  });

  it("registers ws:connected event handler", () => {
    expect(eventHandlers["ws:connected"]).toBeDefined();
  });

  it("registers ws:disconnected event handler", () => {
    expect(eventHandlers["ws:disconnected"]).toBeDefined();
  });

  it("registers ws:reconnected event handler", () => {
    expect(eventHandlers["ws:reconnected"]).toBeDefined();
  });

  it("registers ws:message event handler", () => {
    expect(eventHandlers["ws:message"]).toBeDefined();
  });

  it("updates connection status on ws:connected", () => {
    const handler = eventHandlers["ws:connected"][0];
    handler();
    const dot = document.getElementById("sb-dot");
    const text = document.getElementById("sb-connection-text");
    expect(dot.className).toContain("connected");
    expect(text.textContent).toBe("connected");
  });

  it("updates connection status on ws:disconnected", () => {
    const handler = eventHandlers["ws:disconnected"][0];
    handler();
    const dot = document.getElementById("sb-dot");
    const text = document.getElementById("sb-connection-text");
    expect(dot.className).toContain("reconnecting");
    expect(text.textContent).toBe("reconnecting");
  });

  it("fetches and displays version on load", async () => {
    await vi.waitFor(() => {
      const version = document.getElementById("sb-version");
      expect(version.textContent).toBe("v1.2.0");
    });
  });

  it("shows activity text on streaming ws:message", () => {
    const wsHandlers = eventHandlers["ws:message"];
    for (const handler of wsHandlers) {
      handler({ type: "text" });
    }
    const activity = document.getElementById("sb-activity");
    expect(activity.textContent).toBe("streaming...");
  });

  it("clears activity text on done ws:message", () => {
    const wsHandlers = eventHandlers["ws:message"];
    for (const handler of wsHandlers) {
      handler({ type: "text" });
    }
    for (const handler of wsHandlers) {
      handler({ type: "done" });
    }
    const activity = document.getElementById("sb-activity");
    expect(activity.textContent).toBe("");
  });
});

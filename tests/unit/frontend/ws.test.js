// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dom.js — the $ proxy that returns elements
vi.mock("../../../public/js/core/dom.js", () => ({
  $: {
    connectionDot: { className: "" },
    connectionText: { textContent: "", className: "" },
  },
}));

// Mock events.js
vi.mock("../../../public/js/core/events.js", () => ({
  emit: vi.fn(),
}));

// Mock store.js
vi.mock("../../../public/js/core/store.js", () => ({
  getState: vi.fn(),
  setState: vi.fn(),
}));

// Capture WebSocket constructor calls
let wsInstances = [];
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    wsInstances.push(this);
  }
}
vi.stubGlobal("WebSocket", MockWebSocket);

import { connectWebSocket } from "../../../public/js/core/ws.js";
import { emit } from "../../../public/js/core/events.js";
import { setState } from "../../../public/js/core/store.js";
import { $ } from "../../../public/js/core/dom.js";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  wsInstances = [];
  // Reset DOM mock state
  $.connectionDot.className = "";
  $.connectionText.textContent = "";
  $.connectionText.className = "";
});

describe("connectWebSocket", () => {
  it("creates WebSocket with ws: protocol for http: location", () => {
    // happy-dom defaults to http://localhost
    connectWebSocket();
    expect(wsInstances).toHaveLength(1);
    expect(wsInstances[0].url).toMatch(/^ws:/);
  });

  it("creates WebSocket with correct host and /ws path", () => {
    connectWebSocket();
    expect(wsInstances[0].url).toContain("/ws");
  });

  it("stores WebSocket in state", () => {
    connectWebSocket();
    expect(setState).toHaveBeenCalledWith("ws", wsInstances[0]);
  });

  describe("onopen", () => {
    it("emits ws:connected event on first connection", () => {
      connectWebSocket();
      const ws = wsInstances[0];
      ws.onopen();

      expect(emit).toHaveBeenCalledWith("ws:connected");
    });

    it("updates connection dot and text", () => {
      connectWebSocket();
      const ws = wsInstances[0];
      ws.onopen();

      expect($.connectionDot.className).toBe("term-dot connected");
      expect($.connectionText.textContent).toBe("connected");
      expect($.connectionText.className).toBe("term-status ok");
    });
  });

  describe("onmessage", () => {
    it("parses JSON and emits ws:message", () => {
      connectWebSocket();
      const ws = wsInstances[0];
      const payload = { type: "session_update", data: { id: "s1" } };

      ws.onmessage({ data: JSON.stringify(payload) });

      expect(emit).toHaveBeenCalledWith("ws:message", payload);
    });
  });

  describe("onclose", () => {
    it("emits ws:disconnected event", () => {
      connectWebSocket();
      const ws = wsInstances[0];
      ws.onclose();

      expect(emit).toHaveBeenCalledWith("ws:disconnected");
    });

    it("updates connection dot and text to reconnecting", () => {
      connectWebSocket();
      const ws = wsInstances[0];
      ws.onclose();

      expect($.connectionDot.className).toBe("term-dot reconnecting");
      expect($.connectionText.textContent).toBe("reconnecting");
    });

    it("schedules reconnect via setTimeout", () => {
      connectWebSocket();
      const ws = wsInstances[0];
      ws.onclose();

      // Advance timers to trigger reconnect
      vi.advanceTimersByTime(35000); // past max backoff
      // A new WebSocket should have been created
      expect(wsInstances.length).toBeGreaterThan(1);
    });
  });

  describe("onerror", () => {
    it("updates connection state to disconnected", () => {
      connectWebSocket();
      const ws = wsInstances[0];
      ws.onerror(new Error("connection failed"));

      expect($.connectionDot.className).toBe("term-dot");
      expect($.connectionText.textContent).toBe("disconnected");
      expect($.connectionText.className).toBe("term-status");
    });
  });
});

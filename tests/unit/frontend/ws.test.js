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
    this.readyState = 1;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.send = vi.fn();
    wsInstances.push(this);
  }
}
vi.stubGlobal("WebSocket", MockWebSocket);

import { connectWebSocket, subscribeToSession } from "../../../public/js/core/ws.js";
import { emit } from "../../../public/js/core/events.js";
import { getState, setState } from "../../../public/js/core/store.js";
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
      ws.onclose({ code: 1006 });

      expect(emit).toHaveBeenCalledWith("ws:disconnected");
    });

    it("updates connection dot and text to reconnecting", () => {
      connectWebSocket();
      const ws = wsInstances[0];
      ws.onclose({ code: 1006 });

      expect($.connectionDot.className).toBe("term-dot reconnecting");
      expect($.connectionText.textContent).toBe("reconnecting");
    });

    it("schedules reconnect via setTimeout", () => {
      connectWebSocket();
      const ws = wsInstances[0];
      ws.onclose({ code: 1006 });

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

  describe("session broadcast subscribe", () => {
    it("onopen sends subscribe when sessionId exists in state", () => {
      vi.mocked(getState).mockImplementation((key) => {
        if (key === "sessionId") return "active-session";
        return undefined;
      });

      connectWebSocket();
      const ws = wsInstances[0];
      ws.onopen();

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "subscribe", sessionId: "active-session" }),
      );
    });

    it("onopen does not send subscribe when no sessionId", () => {
      vi.mocked(getState).mockReturnValue(undefined);

      connectWebSocket();
      const ws = wsInstances[0];
      ws.onopen();

      expect(ws.send).not.toHaveBeenCalled();
    });
  });
});

describe("subscribeToSession", () => {
  it("sends subscribe message when ws is connected", () => {
    const mockWs = { readyState: 1, send: vi.fn() };
    vi.mocked(getState).mockImplementation((key) => {
      if (key === "ws") return mockWs;
      return undefined;
    });

    subscribeToSession("test-session");

    expect(mockWs.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "subscribe", sessionId: "test-session" }),
    );
  });

  it("does not send when ws is not connected", () => {
    const mockWs = { readyState: 3, send: vi.fn() };
    vi.mocked(getState).mockImplementation((key) => {
      if (key === "ws") return mockWs;
      return undefined;
    });

    subscribeToSession("test-session");

    expect(mockWs.send).not.toHaveBeenCalled();
  });

  it("does not send when ws is null", () => {
    vi.mocked(getState).mockReturnValue(null);
    // Should not throw
    subscribeToSession("test-session");
  });

  it("does not send when sessionId is falsy", () => {
    const mockWs = { readyState: 1, send: vi.fn() };
    vi.mocked(getState).mockImplementation((key) => {
      if (key === "ws") return mockWs;
      return undefined;
    });

    subscribeToSession(null);
    subscribeToSession(undefined);
    subscribeToSession("");

    expect(mockWs.send).not.toHaveBeenCalled();
  });
});

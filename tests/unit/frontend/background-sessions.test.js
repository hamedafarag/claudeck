// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

/* ── Shared mock state ── */
const bgMap = new Map();

const mockGetState = vi.fn((key) => {
  if (key === "backgroundSessions") return bgMap;
  return undefined;
});
const mockSetState = vi.fn();
const mockOn = vi.fn();
const mockPanes = new Map();
const mockRemoveThinking = vi.fn();
const mockSendNotification = vi.fn();

/* ── Element stubs ── */
function makeEl(tag = "div") {
  const el = document.createElement(tag);
  el.addEventListener = el.addEventListener.bind(el);
  return el;
}

const mockDom = {
  bgConfirmModal: makeEl(),
  bgConfirmCancel: makeEl("button"),
  bgConfirmAbort: makeEl("button"),
  bgConfirmBackground: makeEl("button"),
  bgSessionIndicator: makeEl(),
  bgSessionBadge: makeEl("span"),
  projectSelect: document.createElement("select"),
  sessionList: makeEl(),
  messagesDiv: makeEl(),
  sendBtn: makeEl("button"),
  stopBtn: makeEl("button"),
  streamingTokens: makeEl(),
  streamingTokensSep: makeEl(),
};

/* ── vi.mock calls (hoisted) ── */
vi.mock("../../../public/js/core/dom.js", () => ({
  $: mockDom,
}));

vi.mock("../../../public/js/core/store.js", () => ({
  getState: (...args) => mockGetState(...args),
  setState: (...args) => mockSetState(...args),
}));

vi.mock("../../../public/js/core/events.js", () => ({
  on: (...args) => mockOn(...args),
}));

vi.mock("../../../public/js/ui/parallel.js", () => ({
  panes: mockPanes,
}));

vi.mock("../../../public/js/core/constants.js", () => ({
  CHAT_IDS: ["chat-1", "chat-2", "chat-3", "chat-4"],
}));

vi.mock("../../../public/js/ui/messages.js", () => ({
  removeThinking: (...args) => mockRemoveThinking(...args),
}));

vi.mock("../../../public/js/ui/notifications.js", () => ({
  sendNotification: (...args) => mockSendNotification(...args),
}));

/* ── Module under test ── */
let addBackgroundSession,
  removeBackgroundSession,
  isBackgroundSession,
  reconcileBackgroundSessions,
  guardSwitch;

beforeEach(async () => {
  vi.resetModules();
  bgMap.clear();
  mockPanes.clear();
  localStorage.clear();

  mockGetState.mockClear();
  mockSetState.mockClear();
  mockOn.mockClear();
  mockRemoveThinking.mockClear();
  mockSendNotification.mockClear();

  // Reset indicator classes
  mockDom.bgSessionIndicator.className = "";
  mockDom.bgSessionBadge.textContent = "";
  mockDom.bgConfirmModal.className = "";

  // Stub fetch for createBellNotification
  globalThis.fetch = vi.fn().mockResolvedValue({});

  vi.doMock("../../../public/js/core/dom.js", () => ({
    $: mockDom,
  }));
  vi.doMock("../../../public/js/core/store.js", () => ({
    getState: (...args) => mockGetState(...args),
    setState: (...args) => mockSetState(...args),
  }));
  vi.doMock("../../../public/js/core/events.js", () => ({
    on: (...args) => mockOn(...args),
  }));
  vi.doMock("../../../public/js/ui/parallel.js", () => ({
    panes: mockPanes,
  }));
  vi.doMock("../../../public/js/core/constants.js", () => ({
    CHAT_IDS: ["chat-1", "chat-2", "chat-3", "chat-4"],
  }));
  vi.doMock("../../../public/js/ui/messages.js", () => ({
    removeThinking: (...args) => mockRemoveThinking(...args),
  }));
  vi.doMock("../../../public/js/ui/notifications.js", () => ({
    sendNotification: (...args) => mockSendNotification(...args),
  }));

  const mod = await import(
    "../../../public/js/features/background-sessions.js"
  );
  addBackgroundSession = mod.addBackgroundSession;
  removeBackgroundSession = mod.removeBackgroundSession;
  isBackgroundSession = mod.isBackgroundSession;
  reconcileBackgroundSessions = mod.reconcileBackgroundSessions;
  guardSwitch = mod.guardSwitch;
});

describe("background-sessions", () => {
  describe("addBackgroundSession", () => {
    it("adds a session to the background sessions map", () => {
      addBackgroundSession("s1", "Test Session", "MyProject", "/path");
      expect(bgMap.has("s1")).toBe(true);
      const info = bgMap.get("s1");
      expect(info.title).toBe("Test Session");
      expect(info.projectName).toBe("MyProject");
      expect(info.projectPath).toBe("/path");
      expect(typeof info.startedAt).toBe("number");
    });

    it("updates the header indicator badge count", () => {
      addBackgroundSession("s1", "A", "P", "/p");
      expect(mockDom.bgSessionBadge.textContent).toBe("1");
      expect(
        mockDom.bgSessionIndicator.classList.contains("hidden")
      ).toBe(false);
    });

    it("persists sessions to localStorage", () => {
      addBackgroundSession("s1", "A", "P", "/p");
      const stored = localStorage.getItem("claudeck-bg-sessions");
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored);
      expect(parsed.s1).toBeDefined();
      expect(parsed.s1.title).toBe("A");
    });
  });

  describe("removeBackgroundSession", () => {
    it("removes a session from the map", () => {
      bgMap.set("s1", { title: "A" });
      removeBackgroundSession("s1");
      expect(bgMap.has("s1")).toBe(false);
    });

    it("hides indicator when no sessions remain", () => {
      bgMap.set("s1", { title: "A" });
      removeBackgroundSession("s1");
      expect(
        mockDom.bgSessionIndicator.classList.contains("hidden")
      ).toBe(true);
    });
  });

  describe("isBackgroundSession", () => {
    it("returns true when session is in the map", () => {
      bgMap.set("s1", { title: "A" });
      expect(isBackgroundSession("s1")).toBe(true);
    });

    it("returns false when session is not in the map", () => {
      expect(isBackgroundSession("nonexistent")).toBe(false);
    });
  });

  describe("reconcileBackgroundSessions", () => {
    it("removes sessions not in the active list", () => {
      bgMap.set("s1", { title: "A", projectPath: "/p" });
      bgMap.set("s2", { title: "B", projectPath: "/p" });
      bgMap.set("s3", { title: "C", projectPath: "/p" });

      // Only s2 is still active
      reconcileBackgroundSessions(["s2"]);

      expect(bgMap.has("s1")).toBe(false);
      expect(bgMap.has("s2")).toBe(true);
      expect(bgMap.has("s3")).toBe(false);
    });

    it("keeps all sessions when all are active", () => {
      bgMap.set("s1", { title: "A", projectPath: "/p" });
      bgMap.set("s2", { title: "B", projectPath: "/p" });
      reconcileBackgroundSessions(["s1", "s2"]);
      expect(bgMap.size).toBe(2);
    });

    it("removes all sessions when none are active", () => {
      bgMap.set("s1", { title: "A", projectPath: "/p" });
      bgMap.set("s2", { title: "B", projectPath: "/p" });
      reconcileBackgroundSessions([]);
      expect(bgMap.size).toBe(0);
    });
  });

  describe("guardSwitch", () => {
    it("calls onProceed immediately when no pane is streaming", () => {
      // mockPanes is empty → no streaming panes
      const onProceed = vi.fn();
      guardSwitch(onProceed);
      expect(onProceed).toHaveBeenCalledTimes(1);
    });

    it("does not call onProceed when a pane is streaming", () => {
      mockPanes.set("chat-1", { isStreaming: true });
      const onProceed = vi.fn();
      guardSwitch(onProceed);
      expect(onProceed).not.toHaveBeenCalled();
    });

    it("shows the confirm modal when a pane is streaming", () => {
      mockDom.bgConfirmModal.classList.add("hidden");
      mockPanes.set("chat-1", { isStreaming: true });
      guardSwitch(vi.fn());
      expect(
        mockDom.bgConfirmModal.classList.contains("hidden")
      ).toBe(false);
    });
  });
});

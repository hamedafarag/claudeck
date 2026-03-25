// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock all dependencies before importing the module under test

vi.mock("../../../public/js/core/dom.js", () => ({
  $: {
    projectSelect: {
      value: "",
      options: [],
      selectedIndex: 0,
      addEventListener: vi.fn(),
      appendChild: vi.fn(),
    },
    sessionList: {
      innerHTML: "",
      appendChild: vi.fn(),
      querySelectorAll: vi.fn(() => []),
    },
    sessionSearchInput: {
      value: "",
      addEventListener: vi.fn(),
    },
    messagesDiv: {
      innerHTML: "",
      appendChild: vi.fn(),
    },
    messageInput: {
      value: "",
      style: { height: "" },
      scrollHeight: 100,
      focus: vi.fn(),
    },
    sendBtn: {
      classList: { add: vi.fn(), remove: vi.fn() },
      disabled: false,
      addEventListener: vi.fn(),
    },
    stopBtn: {
      classList: { add: vi.fn(), remove: vi.fn() },
      addEventListener: vi.fn(),
    },
  },
}));

vi.mock("../../../public/js/core/store.js", () => ({
  getState: vi.fn(() => null),
  setState: vi.fn(),
  on: vi.fn(),
}));

vi.mock("../../../public/js/core/constants.js", () => ({
  CHAT_IDS: ["chat-0", "chat-1", "chat-2"],
}));

vi.mock("../../../public/js/core/utils.js", () => ({
  escapeHtml: (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;"),
}));

vi.mock("../../../public/js/core/api.js", () => ({
  fetchSessions: vi.fn(() => Promise.resolve([])),
  searchSessions: vi.fn(() => Promise.resolve([])),
  deleteSessionApi: vi.fn(() => Promise.resolve()),
  fetchSingleMessages: vi.fn(() => Promise.resolve([])),
  fetchMessagesByChatId: vi.fn(() => Promise.resolve([])),
  toggleSessionPin: vi.fn(() => Promise.resolve()),
  updateSessionTitle: vi.fn(() => Promise.resolve()),
  generateSummary: vi.fn(() => Promise.resolve({})),
  fetchBranches: vi.fn(() => Promise.resolve([])),
}));

vi.mock("../../../public/js/ui/parallel.js", () => ({
  panes: new Map(),
  enterParallelMode: vi.fn(),
  exitParallelMode: vi.fn(),
}));

vi.mock("../../../public/js/ui/messages.js", () => ({
  renderMessagesIntoPane: vi.fn(),
  showWhalyPlaceholder: vi.fn(),
}));

vi.mock("../../../public/js/ui/context-gauge.js", () => ({
  loadContextGauge: vi.fn(),
}));

// Import module under test — the IIFE and onState calls run at load time
import {
  loadSessions,
  loadMessages,
  loadPaneMessages,
  deleteSession,
} from "../../../public/js/features/sessions.js";

describe("sessions module", () => {
  it("loads without error", () => {
    // If we got here, the module loaded successfully
    expect(true).toBe(true);
  });

  it("exports loadSessions as a function", () => {
    expect(typeof loadSessions).toBe("function");
  });

  it("exports loadMessages as a function", () => {
    expect(typeof loadMessages).toBe("function");
  });

  it("exports loadPaneMessages as a function", () => {
    expect(typeof loadPaneMessages).toBe("function");
  });

  it("exports deleteSession as a function", () => {
    expect(typeof deleteSession).toBe("function");
  });

  it("onState was called to watch sessionId", async () => {
    const { on } = await import("../../../public/js/core/store.js");
    expect(on).toHaveBeenCalledWith("sessionId", expect.any(Function));
  });

  it("loadSessions resolves without error when projectSelect has no value", async () => {
    // projectSelect.value is "" so it should render empty sessions
    await expect(loadSessions()).resolves.toBeUndefined();
  });

  it("loadMessages calls fetchSingleMessages when not in parallel mode", async () => {
    const { getState } = await import("../../../public/js/core/store.js");
    const { panes } = await import("../../../public/js/ui/parallel.js");
    const api = await import("../../../public/js/core/api.js");

    getState.mockReturnValue(false); // parallelMode = false
    const mockPane = { messagesDiv: { innerHTML: "" } };
    panes.set(null, mockPane);

    await loadMessages("test-session-id");
    expect(api.fetchSingleMessages).toHaveBeenCalledWith("test-session-id");
  });

  it("deleteSession calls deleteSessionApi", async () => {
    const api = await import("../../../public/js/core/api.js");
    api.deleteSessionApi.mockResolvedValue();
    await deleteSession("session-123");
    expect(api.deleteSessionApi).toHaveBeenCalledWith("session-123");
  });
});

// ── Deeper tests using real DOM elements ─────────────────
describe("sessions module – DOM rendering", () => {
  let domElements;
  let sessionsMod;
  let apiMod;
  let storeMod;

  beforeEach(async () => {
    vi.resetModules();

    document.body.innerHTML = `
      <select id="project-select"><option value="/tmp/proj">/tmp/proj</option></select>
      <ul id="session-list"></ul>
      <input id="session-search-input" value="" />
      <div id="messages-div"></div>
      <textarea id="message-input"></textarea>
      <button id="send-btn"></button>
      <button id="stop-btn"></button>
    `;

    domElements = {
      projectSelect: document.getElementById("project-select"),
      sessionList: document.getElementById("session-list"),
      sessionSearchInput: document.getElementById("session-search-input"),
      messagesDiv: document.getElementById("messages-div"),
      messageInput: document.getElementById("message-input"),
      sendBtn: document.getElementById("send-btn"),
      stopBtn: document.getElementById("stop-btn"),
    };

    vi.doMock("../../../public/js/core/dom.js", () => ({
      $: domElements,
    }));

    vi.doMock("../../../public/js/core/store.js", () => ({
      getState: vi.fn(() => null),
      setState: vi.fn(),
      on: vi.fn(),
    }));

    vi.doMock("../../../public/js/core/constants.js", () => ({
      CHAT_IDS: ["chat-0", "chat-1", "chat-2"],
    }));

    vi.doMock("../../../public/js/core/utils.js", () => ({
      escapeHtml: (s) =>
        String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;"),
    }));

    vi.doMock("../../../public/js/core/api.js", () => ({
      fetchSessions: vi.fn(() => Promise.resolve([])),
      searchSessions: vi.fn(() => Promise.resolve([])),
      deleteSessionApi: vi.fn(() => Promise.resolve()),
      fetchSingleMessages: vi.fn(() => Promise.resolve([])),
      fetchMessagesByChatId: vi.fn(() => Promise.resolve([])),
      toggleSessionPin: vi.fn(() => Promise.resolve()),
      updateSessionTitle: vi.fn(() => Promise.resolve()),
      generateSummary: vi.fn(() => Promise.resolve({})),
      fetchBranches: vi.fn(() => Promise.resolve([])),
    }));

    vi.doMock("../../../public/js/ui/parallel.js", () => ({
      panes: new Map(),
      enterParallelMode: vi.fn(),
      exitParallelMode: vi.fn(),
    }));

    vi.doMock("../../../public/js/ui/messages.js", () => ({
      renderMessagesIntoPane: vi.fn(),
      showWhalyPlaceholder: vi.fn(),
    }));

    vi.doMock("../../../public/js/ui/context-gauge.js", () => ({
      loadContextGauge: vi.fn(),
    }));

    sessionsMod = await import("../../../public/js/features/sessions.js");
    apiMod = await import("../../../public/js/core/api.js");
    storeMod = await import("../../../public/js/core/store.js");
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("renders session list items from API response", async () => {
    apiMod.fetchSessions.mockResolvedValue([
      {
        id: "s1",
        title: "Test Session",
        project_name: "proj",
        created_at: Date.now() / 1000,
        mode: null,
        pinned: 0,
      },
    ]);

    domElements.projectSelect.value = "/tmp/proj";
    await sessionsMod.loadSessions();

    await vi.waitFor(() => {
      const items = domElements.sessionList.querySelectorAll("li");
      expect(items.length).toBe(1);
      expect(items[0].textContent).toContain("Test Session");
    });
  });

  it("renders empty state when no sessions", async () => {
    apiMod.fetchSessions.mockResolvedValue([]);

    domElements.projectSelect.value = "/tmp/proj";
    await sessionsMod.loadSessions();

    await vi.waitFor(() => {
      const emptyState = domElements.sessionList.querySelector(".session-empty");
      expect(emptyState).not.toBeNull();
      expect(emptyState.textContent).toContain("No sessions yet");
    });
  });

  it("marks active session with active class", async () => {
    storeMod.getState.mockImplementation((key) => {
      if (key === "sessionId") return "s1";
      return null;
    });

    apiMod.fetchSessions.mockResolvedValue([
      {
        id: "s1",
        title: "Active Session",
        project_name: "proj",
        created_at: Date.now() / 1000,
        mode: null,
        pinned: 0,
      },
    ]);

    domElements.projectSelect.value = "/tmp/proj";
    await sessionsMod.loadSessions();

    await vi.waitFor(() => {
      const activeLi = domElements.sessionList.querySelector("li.active");
      expect(activeLi).not.toBeNull();
      expect(activeLi.textContent).toContain("Active Session");
    });
  });

  it("renders pinned badge for pinned sessions", async () => {
    apiMod.fetchSessions.mockResolvedValue([
      {
        id: "s2",
        title: "Pinned Session",
        project_name: "proj",
        created_at: Date.now() / 1000,
        mode: null,
        pinned: 1,
      },
    ]);

    domElements.projectSelect.value = "/tmp/proj";
    await sessionsMod.loadSessions();

    await vi.waitFor(() => {
      const pinnedBtn = domElements.sessionList.querySelector(".session-pin.pinned");
      expect(pinnedBtn).not.toBeNull();
    });
  });

  it("loadMessages calls fetchSingleMessages", async () => {
    const { panes } = await import("../../../public/js/ui/parallel.js");
    storeMod.getState.mockReturnValue(false); // parallelMode = false
    const mockPane = { messagesDiv: document.createElement("div") };
    panes.set(null, mockPane);

    await sessionsMod.loadMessages("test-session-id");
    expect(apiMod.fetchSingleMessages).toHaveBeenCalledWith("test-session-id");
  });

  it("deleteSession calls deleteSessionApi", async () => {
    apiMod.deleteSessionApi.mockResolvedValue();
    await sessionsMod.deleteSession("s1");
    expect(apiMod.deleteSessionApi).toHaveBeenCalledWith("s1");
  });
});

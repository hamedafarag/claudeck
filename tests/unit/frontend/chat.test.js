// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeAll } from "vitest";

// Mock all dependencies — chat.js has 20+ imports

vi.mock("../../../public/js/core/dom.js", () => ({
  $: {
    projectSelect: {
      value: "/test/project",
      options: [{ value: "/test/project", textContent: "Test" }],
      selectedIndex: 0,
      addEventListener: vi.fn(),
      style: { borderColor: "" },
      focus: vi.fn(),
    },
    messageInput: {
      value: "",
      style: { height: "" },
      scrollHeight: 100,
      focus: vi.fn(),
      addEventListener: vi.fn(),
      closest: vi.fn(() => null),
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
    messagesDiv: {
      innerHTML: "",
      appendChild: vi.fn(),
      addEventListener: vi.fn(),
      querySelectorAll: vi.fn(() => []),
    },
    sessionList: { innerHTML: "" },
    totalCostEl: { textContent: "" },
    streamingTokens: { classList: { add: vi.fn(), remove: vi.fn() }, textContent: "" },
    streamingTokensSep: { classList: { add: vi.fn(), remove: vi.fn() } },
    worktreeBtn: {
      addEventListener: vi.fn(),
      classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
    },
    toggleParallelBtn: {
      checked: false,
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    },
    newSessionBtn: { click: vi.fn(), addEventListener: vi.fn() },
    historyBtn: {
      addEventListener: vi.fn(),
      classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn(), contains: vi.fn(() => false) },
    },
    historyPopover: {
      classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn(() => true) },
      contains: vi.fn(() => false),
      innerHTML: "",
    },
    headerProjectName: { textContent: "" },
    spBadge: { classList: { add: vi.fn(), remove: vi.fn() } },
  },
}));

vi.mock("../../../public/js/core/store.js", () => ({
  getState: vi.fn((key) => {
    if (key === "parallelMode") return false;
    if (key === "sessionId") return null;
    if (key === "ws") return { send: vi.fn() };
    return null;
  }),
  setState: vi.fn(),
}));

vi.mock("../../../public/js/core/constants.js", () => ({
  CHAT_IDS: ["chat-0", "chat-1", "chat-2"],
  BOT_CHAT_ID: "bot",
}));

vi.mock("../../../public/js/core/events.js", () => ({
  on: vi.fn(),
}));

vi.mock("../../../public/js/ui/commands.js", () => ({
  commandRegistry: {},
  registerCommand: vi.fn(),
  dismissAutocomplete: vi.fn(),
  handleAutocompleteKeydown: vi.fn(),
  handleSlashAutocomplete: vi.fn(),
}));

vi.mock("../../../public/js/ui/messages.js", () => ({
  addUserMessage: vi.fn(),
  appendAssistantText: vi.fn(),
  appendToolIndicator: vi.fn(),
  appendToolResult: vi.fn(),
  showThinking: vi.fn(),
  removeThinking: vi.fn(),
  addResultSummary: vi.fn(),
  addStatus: vi.fn(),
  showWhalyPlaceholder: vi.fn(),
  addSkillUsedMessage: vi.fn(),
}));

vi.mock("../../../public/js/ui/parallel.js", () => ({
  getPane: vi.fn(() => ({
    messagesDiv: { innerHTML: "", appendChild: vi.fn(), querySelectorAll: vi.fn(() => []) },
    messageInput: { value: "", style: { height: "" }, scrollHeight: 100, focus: vi.fn() },
    isStreaming: false,
    currentAssistantMsg: null,
    chatId: null,
    sendBtn: { classList: { add: vi.fn(), remove: vi.fn() } },
    stopBtn: { classList: { add: vi.fn(), remove: vi.fn() } },
  })),
  panes: new Map(),
  _setChatFns: vi.fn(),
  _setInputHistoryGetter: vi.fn(),
}));

vi.mock("../../../public/js/features/sessions.js", () => ({
  loadSessions: vi.fn(),
}));

vi.mock("../../../public/js/features/cost-dashboard.js", () => ({
  loadStats: vi.fn(),
  loadAccountInfo: vi.fn(),
}));

vi.mock("../../../public/js/features/projects.js", () => ({
  loadProjects: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../../public/js/features/prompts.js", () => ({
  loadPrompts: vi.fn(),
}));

vi.mock("../../../public/js/features/workflows.js", () => ({
  loadWorkflows: vi.fn(),
}));

vi.mock("../../../public/js/features/agents.js", () => ({
  loadAgents: vi.fn(),
  handleAgentMessage: vi.fn(),
}));

vi.mock("../../../public/js/features/agent-monitor.js", () => ({}));

vi.mock("../../../public/js/core/ws.js", () => ({
  connectWebSocket: vi.fn(),
}));

vi.mock("../../../public/js/features/attachments.js", () => ({
  updateAttachmentBadge: vi.fn(),
  getImageAttachments: vi.fn(() => []),
  clearImageAttachments: vi.fn(),
}));

vi.mock("../../../public/js/ui/theme.js", () => ({
  applyTheme: vi.fn(),
}));

vi.mock("../../../public/js/ui/export.js", () => ({
  exportAsMarkdown: vi.fn(),
  exportAsHtml: vi.fn(),
}));

vi.mock("../../../public/js/core/api.js", () => ({
  fetchSessions: vi.fn(() => Promise.resolve([])),
  fetchProjects: vi.fn(() => Promise.resolve([])),
  createSession: vi.fn(() => Promise.resolve({ id: "new-session" })),
  sendChatMessage: vi.fn(() => Promise.resolve()),
  forkSession: vi.fn(() => Promise.resolve({ id: "forked" })),
}));

vi.mock("../../../public/js/features/background-sessions.js", () => ({
  isBackgroundSession: vi.fn(() => false),
  removeBackgroundSession: vi.fn(),
  showCompletionToast: vi.fn(),
  showErrorToast: vi.fn(),
  showInputNeededToast: vi.fn(),
  reconcileBackgroundSessions: vi.fn(),
}));

vi.mock("../../../public/js/ui/permissions.js", () => ({
  enqueuePermissionRequest: vi.fn(),
  getPermissionMode: vi.fn(() => "confirmDangerous"),
  clearSessionPermissions: vi.fn(),
  handleExternalPermissionResponse: vi.fn(),
}));

vi.mock("../../../public/js/ui/model-selector.js", () => ({
  getSelectedModel: vi.fn(() => "claude-sonnet-4-20250514"),
}));

vi.mock("../../../public/js/ui/max-turns.js", () => ({
  getMaxTurns: vi.fn(() => null),
}));

vi.mock("../../../public/js/ui/disabled-tools.js", () => ({
  getDisabledTools: vi.fn(() => []),
}));

vi.mock("../../../public/js/ui/context-gauge.js", () => ({
  updateContextGauge: vi.fn(),
  resetContextGauge: vi.fn(),
  loadContextGauge: vi.fn(),
}));

// InputHistory must be a proper constructor class
vi.mock("../../../public/js/features/input-history.js", () => {
  class InputHistory {
    constructor(key) {
      this.storageKey = key;
      this.entries = [];
    }
    push() {}
    up() { return null; }
    down() { return null; }
    resetIndex() {}
  }
  return {
    InputHistory,
    handleHistoryKeydown: vi.fn(),
  };
});

let sendMessage, stopGeneration;

beforeAll(async () => {
  // Create DOM element that chat.js accesses via document.getElementById at load time
  const inputWaitingEl = document.createElement("div");
  inputWaitingEl.id = "input-waiting";
  document.body.appendChild(inputWaitingEl);

  const mod = await import("../../../public/js/features/chat.js");
  sendMessage = mod.sendMessage;
  stopGeneration = mod.stopGeneration;
});

describe("chat module", () => {
  it("loads without error", () => {
    expect(true).toBe(true);
  });

  it("exports sendMessage as a function", () => {
    expect(typeof sendMessage).toBe("function");
  });

  it("exports stopGeneration as a function", () => {
    expect(typeof stopGeneration).toBe("function");
  });

  it("sendMessage is callable with a pane object", () => {
    const mockPane = {
      messagesDiv: { innerHTML: "", appendChild: vi.fn(), querySelectorAll: vi.fn(() => []) },
      messageInput: { value: "", style: { height: "" }, focus: vi.fn() },
      isStreaming: false,
      currentAssistantMsg: null,
      chatId: null,
    };
    // Should return without error when input is empty
    expect(() => sendMessage(mockPane)).not.toThrow();
  });

  it("stopGeneration is callable with a pane object", () => {
    const mockPane = {
      messagesDiv: { innerHTML: "" },
      messageInput: { value: "", focus: vi.fn() },
      isStreaming: false,
      chatId: null,
      sendBtn: { classList: { add: vi.fn(), remove: vi.fn() } },
      stopBtn: { classList: { add: vi.fn(), remove: vi.fn() } },
    };
    expect(() => stopGeneration(mockPane)).not.toThrow();
  });
});

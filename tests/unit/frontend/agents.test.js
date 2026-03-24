// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies before importing the module under test

vi.mock("../../../public/js/core/dom.js", () => ({
  $: {
    agentPanel: {
      innerHTML: "",
      appendChild: vi.fn(),
      querySelectorAll: vi.fn(() => []),
    },
    agentSidebar: {
      classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn(() => false) },
    },
    agentSidebarClose: { addEventListener: vi.fn() },
    agentBtn: {
      classList: { add: vi.fn(), remove: vi.fn() },
      addEventListener: vi.fn(),
    },
    agentForm: {
      addEventListener: vi.fn(),
      reset: vi.fn(),
    },
    agentModal: {
      classList: { add: vi.fn(), remove: vi.fn() },
      addEventListener: vi.fn(),
    },
    agentModalTitle: { textContent: "" },
    agentModalClose: { addEventListener: vi.fn() },
    agentModalCancel: { addEventListener: vi.fn() },
    agentFormTitle: { value: "", focus: vi.fn() },
    agentFormDesc: { value: "" },
    agentFormIcon: { value: "tool" },
    agentFormGoal: { value: "" },
    agentFormMaxTurns: { value: "50" },
    agentFormTimeout: { value: "300" },
    agentFormEditId: { value: "" },
    chainForm: {
      addEventListener: vi.fn(),
      reset: vi.fn(),
    },
    chainModal: {
      classList: { add: vi.fn(), remove: vi.fn() },
      addEventListener: vi.fn(),
    },
    chainModalTitle: { textContent: "" },
    chainModalClose: { addEventListener: vi.fn() },
    chainModalCancel: { addEventListener: vi.fn() },
    chainFormTitle: { value: "", focus: vi.fn() },
    chainFormDesc: { value: "" },
    chainFormContext: { value: "summary" },
    chainFormEditId: { value: "" },
    chainAgentList: {
      innerHTML: "",
      children: { length: 0 },
      appendChild: vi.fn(),
      querySelectorAll: vi.fn(() => []),
      insertBefore: vi.fn(),
    },
    chainAddAgentBtn: { addEventListener: vi.fn() },
    projectSelect: {
      value: "/test/project",
      options: [{ value: "/test/project", textContent: "Test" }],
      selectedIndex: 0,
    },
    sendBtn: {
      classList: { add: vi.fn(), remove: vi.fn() },
      disabled: false,
    },
    stopBtn: {
      classList: { add: vi.fn(), remove: vi.fn() },
    },
    messageInput: { value: "", focus: vi.fn() },
    messagesDiv: { innerHTML: "", appendChild: vi.fn() },
    streamingTokens: { classList: { add: vi.fn(), remove: vi.fn() }, textContent: "" },
    streamingTokensSep: { classList: { add: vi.fn(), remove: vi.fn() } },
    toolboxPanel: { classList: { add: vi.fn() } },
    toolboxBtn: { classList: { remove: vi.fn() } },
    workflowPanel: { classList: { add: vi.fn() } },
    workflowBtn: { classList: { remove: vi.fn() } },
    orchModal: {
      classList: { add: vi.fn(), remove: vi.fn() },
      addEventListener: vi.fn(),
    },
    orchModalClose: { addEventListener: vi.fn() },
    orchModalCancel: { addEventListener: vi.fn() },
    orchModalRun: {
      addEventListener: vi.fn(),
      click: vi.fn(),
    },
    orchTaskInput: {
      value: "",
      focus: vi.fn(),
      addEventListener: vi.fn(),
    },
  },
}));

vi.mock("../../../public/js/core/store.js", () => ({
  getState: vi.fn((key) => {
    if (key === "agents") return [];
    if (key === "agentChains") return [];
    if (key === "agentDags") return [];
    if (key === "parallelMode") return false;
    if (key === "sessionId") return null;
    if (key === "ws") return { send: vi.fn() };
    return null;
  }),
  setState: vi.fn(),
}));

vi.mock("../../../public/js/core/utils.js", () => ({
  escapeHtml: (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;"),
  scrollToBottom: vi.fn(),
}));

vi.mock("../../../public/js/core/api.js", () => ({
  fetchAgents: vi.fn(() => Promise.resolve([])),
  fetchChains: vi.fn(() => Promise.resolve([])),
  fetchDags: vi.fn(() => Promise.resolve([])),
  createAgent: vi.fn(() => Promise.resolve()),
  updateAgent: vi.fn(() => Promise.resolve()),
  deleteAgentApi: vi.fn(() => Promise.resolve()),
  createChain: vi.fn(() => Promise.resolve()),
  updateChain: vi.fn(() => Promise.resolve()),
  deleteChainApi: vi.fn(() => Promise.resolve()),
  createDag: vi.fn(() => Promise.resolve()),
  deleteDagApi: vi.fn(() => Promise.resolve()),
  updateWorkflow: vi.fn(() => Promise.resolve()),
  createWorkflow: vi.fn(() => Promise.resolve()),
  deleteWorkflowApi: vi.fn(() => Promise.resolve()),
  fetchWorkflows: vi.fn(() => Promise.resolve([])),
}));

vi.mock("../../../public/js/ui/commands.js", () => ({
  commandRegistry: {},
  registerCommand: vi.fn(),
}));

vi.mock("../../../public/js/ui/parallel.js", () => ({
  getPane: vi.fn(() => ({
    messagesDiv: { innerHTML: "", appendChild: vi.fn() },
    messageInput: { value: "", focus: vi.fn() },
    isStreaming: false,
    currentAssistantMsg: null,
    chatId: null,
  })),
  panes: new Map(),
}));

vi.mock("../../../public/js/ui/messages.js", () => ({
  showThinking: vi.fn(),
  removeThinking: vi.fn(),
  addStatus: vi.fn(),
}));

vi.mock("../../../public/js/ui/permissions.js", () => ({
  getPermissionMode: vi.fn(() => "confirmDangerous"),
}));

vi.mock("../../../public/js/ui/model-selector.js", () => ({
  getSelectedModel: vi.fn(() => "claude-sonnet-4-20250514"),
}));

vi.mock("../../../public/js/features/dag-editor.js", () => ({
  openDagModal: vi.fn(),
  closeDagModal: vi.fn(),
}));

vi.mock("../../../public/js/features/agent-monitor.js", () => ({
  openAgentMonitor: vi.fn(),
}));

vi.mock("../../../public/js/features/workflows.js", () => ({
  renderWorkflowSidebar: vi.fn(),
}));

import {
  loadAgents,
  registerAgentCommands,
  startAgent,
  startChain,
  handleAgentMessage,
} from "../../../public/js/features/agents.js";

describe("agents module", () => {
  it("loads without error", () => {
    expect(true).toBe(true);
  });

  it("exports loadAgents as a function", () => {
    expect(typeof loadAgents).toBe("function");
  });

  it("exports registerAgentCommands as a function", () => {
    expect(typeof registerAgentCommands).toBe("function");
  });

  it("exports startAgent as a function", () => {
    expect(typeof startAgent).toBe("function");
  });

  it("exports startChain as a function", () => {
    expect(typeof startChain).toBe("function");
  });

  it("exports handleAgentMessage as a function", () => {
    expect(typeof handleAgentMessage).toBe("function");
  });

  it("loadAgents resolves without error", async () => {
    await expect(loadAgents()).resolves.toBeUndefined();
  });

  it("registerAgentCommands runs without error when agents list is empty", () => {
    expect(() => registerAgentCommands()).not.toThrow();
  });
});

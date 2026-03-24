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
      classList: { add: vi.fn(), remove: vi.fn() },
    },
    agentBtn: {
      classList: { add: vi.fn(), remove: vi.fn() },
    },
    projectSelect: {
      value: "/test/project",
      options: [{ value: "/test/project", textContent: "Test" }],
      selectedIndex: 0,
    },
    sendBtn: {
      classList: { add: vi.fn(), remove: vi.fn() },
    },
    stopBtn: {
      classList: { add: vi.fn(), remove: vi.fn() },
    },
    messagesDiv: { innerHTML: "", appendChild: vi.fn() },
    messageInput: { value: "", focus: vi.fn() },
    wfForm: {
      addEventListener: vi.fn(),
      reset: vi.fn(),
    },
    wfModal: {
      classList: { add: vi.fn(), remove: vi.fn() },
      addEventListener: vi.fn(),
    },
    wfModalTitle: { textContent: "" },
    wfModalClose: { addEventListener: vi.fn() },
    wfModalCancel: { addEventListener: vi.fn() },
    wfFormTitle: { value: "", focus: vi.fn() },
    wfFormDesc: { value: "" },
    wfFormEditId: { value: "" },
    wfStepsList: {
      innerHTML: "",
      children: { length: 0 },
      appendChild: vi.fn(),
      querySelectorAll: vi.fn(() => []),
    },
    wfAddStepBtn: { addEventListener: vi.fn() },
  },
}));

vi.mock("../../../public/js/core/store.js", () => ({
  getState: vi.fn((key) => {
    if (key === "workflows") return [];
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
  fetchWorkflows: vi.fn(() => Promise.resolve([])),
  createWorkflow: vi.fn(() => Promise.resolve()),
  updateWorkflow: vi.fn(() => Promise.resolve()),
  deleteWorkflowApi: vi.fn(() => Promise.resolve()),
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
  addStatus: vi.fn(),
}));

vi.mock("../../../public/js/ui/permissions.js", () => ({
  getPermissionMode: vi.fn(() => "confirmDangerous"),
}));

vi.mock("../../../public/js/ui/model-selector.js", () => ({
  getSelectedModel: vi.fn(() => "claude-sonnet-4-20250514"),
}));

import {
  loadWorkflows,
  renderWorkflowSidebar,
  registerWorkflowCommands,
} from "../../../public/js/features/workflows.js";

describe("workflows module", () => {
  it("loads without error", () => {
    expect(true).toBe(true);
  });

  it("exports loadWorkflows as a function", () => {
    expect(typeof loadWorkflows).toBe("function");
  });

  it("exports renderWorkflowSidebar as a function", () => {
    expect(typeof renderWorkflowSidebar).toBe("function");
  });

  it("exports registerWorkflowCommands as a function", () => {
    expect(typeof registerWorkflowCommands).toBe("function");
  });

  it("loadWorkflows resolves without error", async () => {
    await expect(loadWorkflows()).resolves.toBeUndefined();
  });

  it("renderWorkflowSidebar runs without error when workflows empty", () => {
    expect(() => renderWorkflowSidebar()).not.toThrow();
  });

  it("registerWorkflowCommands runs without error when workflows empty", () => {
    expect(() => registerWorkflowCommands()).not.toThrow();
  });

  it("loadWorkflows calls fetchWorkflows and setState", async () => {
    const api = await import("../../../public/js/core/api.js");
    const store = await import("../../../public/js/core/store.js");

    api.fetchWorkflows.mockResolvedValue([
      { id: "wf-1", title: "Test Workflow", steps: [] },
    ]);

    await loadWorkflows();

    expect(api.fetchWorkflows).toHaveBeenCalled();
    expect(store.setState).toHaveBeenCalledWith("workflows", [
      { id: "wf-1", title: "Test Workflow", steps: [] },
    ]);
  });
});

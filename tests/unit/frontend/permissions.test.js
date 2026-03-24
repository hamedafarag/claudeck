// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPermModeSelect = { value: "confirmDangerous", addEventListener: vi.fn() };
const mockPermModal = { classList: { remove: vi.fn(), add: vi.fn(), contains: vi.fn(() => false) } };
const mockPermModalToolName = { textContent: "" };
const mockPermModalSummary = { textContent: "" };
const mockPermModalInput = { textContent: "" };
const mockPermAlwaysAllowTool = { textContent: "" };
const mockPermAlwaysAllowCb = { checked: false };
const mockPermAllowBtn = { addEventListener: vi.fn(), focus: vi.fn() };
const mockPermDenyBtn = { addEventListener: vi.fn() };

const mockGetState = vi.fn();

vi.mock("../../../public/js/core/dom.js", () => ({
  $: {
    permModeSelect: mockPermModeSelect,
    permModal: mockPermModal,
    permModalToolName: mockPermModalToolName,
    permModalSummary: mockPermModalSummary,
    permModalInput: mockPermModalInput,
    permAlwaysAllowTool: mockPermAlwaysAllowTool,
    permAlwaysAllowCb: mockPermAlwaysAllowCb,
    permAllowBtn: mockPermAllowBtn,
    permDenyBtn: mockPermDenyBtn,
  },
}));

vi.mock("../../../public/js/core/store.js", () => ({
  getState: (...args) => mockGetState(...args),
}));

vi.mock("../../../public/js/core/events.js", () => ({
  on: vi.fn(),
}));

vi.mock("../../../public/js/ui/notifications.js", () => ({
  sendNotification: vi.fn(),
}));

let getPermissionMode, clearSessionPermissions, enqueuePermissionRequest, handleExternalPermissionResponse;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  mockPermModeSelect.value = "confirmDangerous";
  mockPermModeSelect.addEventListener = vi.fn();
  mockPermAllowBtn.addEventListener = vi.fn();
  mockPermAllowBtn.focus = vi.fn();
  mockPermDenyBtn.addEventListener = vi.fn();
  mockGetState.mockReset();
  mockPermModal.classList.remove.mockClear();
  mockPermModal.classList.add.mockClear();

  vi.doMock("../../../public/js/core/dom.js", () => ({
    $: {
      permModeSelect: mockPermModeSelect,
      permModal: mockPermModal,
      permModalToolName: mockPermModalToolName,
      permModalSummary: mockPermModalSummary,
      permModalInput: mockPermModalInput,
      permAlwaysAllowTool: mockPermAlwaysAllowTool,
      permAlwaysAllowCb: mockPermAlwaysAllowCb,
      permAllowBtn: mockPermAllowBtn,
      permDenyBtn: mockPermDenyBtn,
    },
  }));
  vi.doMock("../../../public/js/core/store.js", () => ({
    getState: (...args) => mockGetState(...args),
  }));
  vi.doMock("../../../public/js/core/events.js", () => ({
    on: vi.fn(),
  }));
  vi.doMock("../../../public/js/ui/notifications.js", () => ({
    sendNotification: vi.fn(),
  }));

  const mod = await import("../../../public/js/ui/permissions.js");
  getPermissionMode = mod.getPermissionMode;
  clearSessionPermissions = mod.clearSessionPermissions;
  enqueuePermissionRequest = mod.enqueuePermissionRequest;
  handleExternalPermissionResponse = mod.handleExternalPermissionResponse;
});

describe("permissions", () => {
  describe("getPermissionMode", () => {
    it("returns 'confirmDangerous' by default", () => {
      mockPermModeSelect.value = "confirmDangerous";
      expect(getPermissionMode()).toBe("confirmDangerous");
    });

    it("returns current select value", () => {
      mockPermModeSelect.value = "bypass";
      expect(getPermissionMode()).toBe("bypass");
    });

    it("returns 'confirmAll' when selected", () => {
      mockPermModeSelect.value = "confirmAll";
      expect(getPermissionMode()).toBe("confirmAll");
    });
  });

  describe("enqueuePermissionRequest", () => {
    it("shows modal for a new tool request", () => {
      const ws = { readyState: 1, send: vi.fn() };
      mockGetState.mockReturnValue(ws);

      enqueuePermissionRequest({ id: "req-1", toolName: "Bash", input: { command: "ls" } });
      expect(mockPermModalToolName.textContent).toBe("Tool Approval: Bash");
      expect(mockPermModal.classList.remove).toHaveBeenCalledWith("hidden");
    });

    it("shows file_path in summary for file-based tools", () => {
      enqueuePermissionRequest({ id: "req-2", toolName: "Read", input: { file_path: "/foo/bar.js" } });
      expect(mockPermModalSummary.textContent).toBe("/foo/bar.js");
    });

    it("shows command in summary for Bash tool", () => {
      enqueuePermissionRequest({ id: "req-3", toolName: "Bash", input: { command: "npm test" } });
      expect(mockPermModalSummary.textContent).toBe("npm test");
    });

    it("shows tool name as summary when no input", () => {
      enqueuePermissionRequest({ id: "req-4", toolName: "Write", input: null });
      expect(mockPermModalSummary.textContent).toBe("Write");
    });
  });

  describe("clearSessionPermissions", () => {
    it("clears always-allow set so previously allowed tools require approval again", () => {
      // The only way to test is to enqueue a request, it should show modal
      clearSessionPermissions();
      enqueuePermissionRequest({ id: "req-5", toolName: "Bash", input: {} });
      expect(mockPermModal.classList.remove).toHaveBeenCalledWith("hidden");
    });
  });

  describe("handleExternalPermissionResponse", () => {
    it("removes a queued request by id", () => {
      // Enqueue two requests - first becomes active, second is queued
      enqueuePermissionRequest({ id: "req-a", toolName: "Bash", input: {} });
      enqueuePermissionRequest({ id: "req-b", toolName: "Read", input: {} });

      // Remove queued one
      handleExternalPermissionResponse("req-b", "allow");

      // The active request should still be req-a
      expect(mockPermModalToolName.textContent).toBe("Tool Approval: Bash");
    });

    it("dismisses active modal when matching id", () => {
      enqueuePermissionRequest({ id: "req-c", toolName: "Bash", input: {} });
      handleExternalPermissionResponse("req-c", "allow");
      expect(mockPermModal.classList.add).toHaveBeenCalledWith("hidden");
    });
  });
});

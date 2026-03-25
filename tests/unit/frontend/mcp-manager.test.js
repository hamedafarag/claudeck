// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFetchMcpServers = vi.fn(() => Promise.resolve({ servers: {} }));
const mockSaveMcpServer = vi.fn(() => Promise.resolve());
const mockDeleteMcpServer = vi.fn(() => Promise.resolve());
const mockRegisterCommand = vi.fn();

vi.mock("../../../public/js/core/dom.js", () => ({
  $: {},
}));

vi.mock("../../../public/js/core/api.js", () => ({
  fetchMcpServers: (...args) => mockFetchMcpServers(...args),
  saveMcpServer: (...args) => mockSaveMcpServer(...args),
  deleteMcpServer: (...args) => mockDeleteMcpServer(...args),
}));

vi.mock("../../../public/js/ui/commands.js", () => ({
  registerCommand: (...args) => mockRegisterCommand(...args),
}));

let mcpToggleBtn, mcpModal, mcpModalClose, mcpServerList;
let mcpFormContainer, mcpFormTitle, mcpForm, mcpName, mcpType;
let mcpStdioFields, mcpUrlFields, mcpCommand, mcpArgs, mcpEnv;
let mcpUrl, mcpFormCancel, mcpFormSave, mcpAddBtn, projectSelect;

beforeEach(async () => {
  vi.resetModules();

  mockFetchMcpServers.mockReset();
  mockFetchMcpServers.mockReturnValue(Promise.resolve({ servers: {} }));
  mockSaveMcpServer.mockReset();
  mockDeleteMcpServer.mockReset();
  mockRegisterCommand.mockReset();

  // Create DOM elements needed by the module
  mcpToggleBtn = document.createElement("button");
  mcpToggleBtn.id = "mcp-toggle-btn";

  mcpModal = document.createElement("div");
  mcpModal.id = "mcp-modal";
  mcpModal.classList.add("hidden");

  mcpModalClose = document.createElement("button");
  mcpModalClose.id = "mcp-modal-close";

  mcpServerList = document.createElement("div");
  mcpServerList.id = "mcp-server-list";

  mcpFormContainer = document.createElement("div");
  mcpFormContainer.id = "mcp-form-container";
  mcpFormContainer.classList.add("hidden");

  mcpFormTitle = document.createElement("div");
  mcpFormTitle.id = "mcp-form-title";

  mcpForm = document.createElement("form");
  mcpForm.id = "mcp-form";

  mcpName = document.createElement("input");
  mcpName.id = "mcp-name";

  mcpType = document.createElement("select");
  mcpType.id = "mcp-type";
  mcpType.innerHTML = '<option value="stdio">stdio</option><option value="sse">sse</option><option value="http">http</option>';

  mcpStdioFields = document.createElement("div");
  mcpStdioFields.id = "mcp-stdio-fields";

  mcpUrlFields = document.createElement("div");
  mcpUrlFields.id = "mcp-url-fields";
  mcpUrlFields.classList.add("hidden");

  mcpCommand = document.createElement("input");
  mcpCommand.id = "mcp-command";

  mcpArgs = document.createElement("textarea");
  mcpArgs.id = "mcp-args";

  mcpEnv = document.createElement("textarea");
  mcpEnv.id = "mcp-env";

  mcpUrl = document.createElement("input");
  mcpUrl.id = "mcp-url";

  mcpFormCancel = document.createElement("button");
  mcpFormCancel.id = "mcp-form-cancel";
  mcpFormCancel.type = "button";

  mcpFormSave = document.createElement("button");
  mcpFormSave.id = "mcp-form-save";
  mcpFormSave.type = "submit";
  mcpFormSave.textContent = "Save";

  mcpAddBtn = document.createElement("button");
  mcpAddBtn.id = "mcp-add-btn";

  projectSelect = document.createElement("select");
  projectSelect.id = "project-select";
  projectSelect.innerHTML = '<option value="">No project</option>';

  document.body.innerHTML = "";
  // Append form children into the form
  mcpForm.appendChild(mcpName);
  mcpForm.appendChild(mcpType);
  mcpForm.appendChild(mcpStdioFields);
  mcpForm.appendChild(mcpUrlFields);
  mcpForm.appendChild(mcpCommand);
  mcpForm.appendChild(mcpArgs);
  mcpForm.appendChild(mcpEnv);
  mcpForm.appendChild(mcpUrl);
  mcpForm.appendChild(mcpFormCancel);
  mcpForm.appendChild(mcpFormSave);

  document.body.appendChild(mcpToggleBtn);
  document.body.appendChild(mcpModal);
  document.body.appendChild(mcpModalClose);
  document.body.appendChild(mcpServerList);
  document.body.appendChild(mcpFormContainer);
  document.body.appendChild(mcpFormTitle);
  document.body.appendChild(mcpForm);
  document.body.appendChild(mcpAddBtn);
  document.body.appendChild(projectSelect);

  vi.doMock("../../../public/js/core/dom.js", () => ({
    $: {
      mcpToggleBtn,
      mcpModal,
      mcpModalClose,
      mcpServerList,
      mcpFormContainer,
      mcpFormTitle,
      mcpForm,
      mcpName,
      mcpType,
      mcpStdioFields,
      mcpUrlFields,
      mcpCommand,
      mcpArgs,
      mcpEnv,
      mcpUrl,
      mcpFormCancel,
      mcpFormSave,
      mcpAddBtn,
      projectSelect,
    },
  }));

  vi.doMock("../../../public/js/core/api.js", () => ({
    fetchMcpServers: (...args) => mockFetchMcpServers(...args),
    saveMcpServer: (...args) => mockSaveMcpServer(...args),
    deleteMcpServer: (...args) => mockDeleteMcpServer(...args),
  }));

  vi.doMock("../../../public/js/ui/commands.js", () => ({
    registerCommand: (...args) => mockRegisterCommand(...args),
  }));

  await import("../../../public/js/panels/mcp-manager.js");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("mcp-manager", () => {
  describe("module loading", () => {
    it("loads without error", () => {
      expect(true).toBe(true);
    });
  });

  describe("slash command registration", () => {
    it('registers "mcp" slash command', () => {
      expect(mockRegisterCommand).toHaveBeenCalledWith(
        "mcp",
        expect.objectContaining({
          category: "app",
          description: expect.any(String),
          execute: expect.any(Function),
        })
      );
    });

    it("mcp command execute opens modal", () => {
      const call = mockRegisterCommand.mock.calls.find((c) => c[0] === "mcp");
      expect(call).toBeDefined();
      mcpModal.classList.add("hidden");
      call[1].execute();
      expect(mcpModal.classList.contains("hidden")).toBe(false);
    });
  });

  describe("toggle button", () => {
    it("opens modal (removes hidden class) on click", () => {
      mcpModal.classList.add("hidden");
      mcpToggleBtn.click();
      expect(mcpModal.classList.contains("hidden")).toBe(false);
    });

    it("calls fetchMcpServers when modal opens", () => {
      mcpToggleBtn.click();
      expect(mockFetchMcpServers).toHaveBeenCalled();
    });
  });

  describe("close button", () => {
    it("closes modal (adds hidden class) on click", () => {
      // First open
      mcpModal.classList.remove("hidden");
      mcpModalClose.click();
      expect(mcpModal.classList.contains("hidden")).toBe(true);
    });
  });

  describe("modal backdrop click", () => {
    it("closes modal when clicking backdrop (modal element itself)", () => {
      mcpModal.classList.remove("hidden");
      // Simulate click on the modal overlay itself (not a child)
      const event = new Event("click", { bubbles: true });
      Object.defineProperty(event, "target", { value: mcpModal });
      mcpModal.dispatchEvent(event);
      expect(mcpModal.classList.contains("hidden")).toBe(true);
    });
  });

  describe("add button", () => {
    it("shows form container when add button is clicked", () => {
      mcpFormContainer.classList.add("hidden");
      mcpAddBtn.click();
      expect(mcpFormContainer.classList.contains("hidden")).toBe(false);
    });

    it("hides add button when form is shown", () => {
      mcpAddBtn.classList.remove("hidden");
      mcpAddBtn.click();
      expect(mcpAddBtn.classList.contains("hidden")).toBe(true);
    });
  });

  describe("cancel button", () => {
    it("hides form container on cancel", () => {
      mcpFormContainer.classList.remove("hidden");
      mcpFormCancel.click();
      expect(mcpFormContainer.classList.contains("hidden")).toBe(true);
    });

    it("shows add button again on cancel", () => {
      mcpAddBtn.classList.add("hidden");
      mcpFormCancel.click();
      expect(mcpAddBtn.classList.contains("hidden")).toBe(false);
    });
  });

  describe("type selector", () => {
    it("shows stdio fields and hides url fields for stdio type", () => {
      mcpType.value = "stdio";
      mcpType.dispatchEvent(new Event("change"));
      expect(mcpStdioFields.classList.contains("hidden")).toBe(false);
      expect(mcpUrlFields.classList.contains("hidden")).toBe(true);
    });

    it("shows url fields and hides stdio fields for sse type", () => {
      mcpType.value = "sse";
      mcpType.dispatchEvent(new Event("change"));
      expect(mcpStdioFields.classList.contains("hidden")).toBe(true);
      expect(mcpUrlFields.classList.contains("hidden")).toBe(false);
    });
  });
});

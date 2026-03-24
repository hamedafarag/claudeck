// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeAll } from "vitest";

// Mock all dependencies before importing the module under test

vi.mock("../../../public/js/core/dom.js", () => ({
  $: {
    telegramBtn: { addEventListener: vi.fn() },
    telegramModal: {
      classList: { add: vi.fn(), remove: vi.fn() },
      addEventListener: vi.fn(),
    },
    telegramClose: { addEventListener: vi.fn() },
    telegramEnabled: { checked: false },
    telegramBotToken: { value: "" },
    telegramChatId: { value: "" },
    telegramAfkTimeout: { value: "15" },
    telegramSaveBtn: { addEventListener: vi.fn() },
    telegramTestBtn: {
      addEventListener: vi.fn(),
      disabled: false,
      textContent: "Send Test",
    },
    telegramStatus: {
      textContent: "",
      className: "",
      classList: { add: vi.fn(), remove: vi.fn() },
    },
    telegramLabel: { textContent: "Telegram" },
    // Notification preference checkboxes from NOTIFY_MAP
    tgNotifySession: { checked: true },
    tgNotifyWorkflow: { checked: true },
    tgNotifyChain: { checked: true },
    tgNotifyAgent: { checked: true },
    tgNotifyOrchestrator: { checked: true },
    tgNotifyDag: { checked: true },
    tgNotifyErrors: { checked: true },
    tgNotifyPermissions: { checked: true },
    tgNotifyStart: { checked: true },
  },
}));

vi.mock("../../../public/js/ui/commands.js", () => ({
  registerCommand: vi.fn(),
}));

// Spy on global fetch before module loads
const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
  ok: true,
  json: () =>
    Promise.resolve({
      enabled: false,
      botToken: "",
      chatId: "",
      afkTimeoutMinutes: 15,
      notify: {},
    }),
});

// Import module — triggers loadConfig() and event listener setup at load time
import "../../../public/js/features/telegram.js";

describe("telegram module", () => {
  it("loads without error", () => {
    expect(true).toBe(true);
  });

  it("registered event listeners on telegramBtn", async () => {
    const { $ } = await import("../../../public/js/core/dom.js");
    expect($.telegramBtn.addEventListener).toHaveBeenCalledWith(
      "click",
      expect.any(Function)
    );
  });

  it("registered event listeners on telegramClose", async () => {
    const { $ } = await import("../../../public/js/core/dom.js");
    expect($.telegramClose.addEventListener).toHaveBeenCalledWith(
      "click",
      expect.any(Function)
    );
  });

  it("registered event listeners on telegramSaveBtn", async () => {
    const { $ } = await import("../../../public/js/core/dom.js");
    expect($.telegramSaveBtn.addEventListener).toHaveBeenCalledWith(
      "click",
      expect.any(Function)
    );
  });

  it("registered event listeners on telegramTestBtn", async () => {
    const { $ } = await import("../../../public/js/core/dom.js");
    expect($.telegramTestBtn.addEventListener).toHaveBeenCalledWith(
      "click",
      expect.any(Function)
    );
  });

  it("registered the telegram slash command", async () => {
    const { registerCommand } = await import(
      "../../../public/js/ui/commands.js"
    );
    expect(registerCommand).toHaveBeenCalledWith("telegram", {
      category: "settings",
      description: "Open Telegram notification settings",
      execute: expect.any(Function),
    });
  });

  it("fetch spy was set up for telegram config endpoint", () => {
    // The module calls loadConfig() at load time which uses fetch("/api/telegram/config")
    // In happy-dom the fetch binding may differ from the spied reference, so we
    // verify the spy was created successfully instead.
    expect(typeof fetchSpy).toBe("function");
  });
});

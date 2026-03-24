// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockShortcutsModal = {
  classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn(), contains: vi.fn(() => false) },
  addEventListener: vi.fn(),
};
const mockSessionSearchInput = { focus: vi.fn() };
const mockNewSessionBtn = { click: vi.fn() };

vi.mock("../../../public/js/core/dom.js", () => ({
  $: {
    shortcutsModal: mockShortcutsModal,
    sessionSearchInput: mockSessionSearchInput,
    newSessionBtn: mockNewSessionBtn,
  },
}));

vi.mock("../../../public/js/core/store.js", () => ({
  getState: vi.fn(() => false),
  setState: vi.fn(),
}));

vi.mock("../../../public/js/core/constants.js", () => ({
  CHAT_IDS: ["chat-1", "chat-2", "chat-3", "chat-4"],
}));

vi.mock("../../../public/js/ui/parallel.js", () => ({
  panes: new Map(),
}));

vi.mock("../../../public/js/ui/commands.js", () => ({
  registerCommand: vi.fn(),
}));

vi.mock("../../../public/js/ui/right-panel.js", () => ({
  toggleRightPanel: vi.fn(),
  openRightPanel: vi.fn(),
}));

vi.mock("../../../public/js/panels/tips-feed.js", () => ({
  toggleTipsFeed: vi.fn(),
}));

beforeEach(async () => {
  vi.resetModules();

  // Create DOM elements the module accesses via getElementById
  const closeBtn = document.createElement("button");
  closeBtn.id = "shortcuts-modal-close";
  document.body.appendChild(closeBtn);

  // Create some modal overlays for closeAllModals testing
  const modal1 = document.createElement("div");
  modal1.className = "modal-overlay";
  modal1.id = "test-modal-1";
  document.body.appendChild(modal1);

  const modal2 = document.createElement("div");
  modal2.className = "modal-overlay";
  modal2.setAttribute("data-persistent", "true");
  modal2.id = "test-modal-2";
  document.body.appendChild(modal2);

  mockShortcutsModal.classList.add.mockClear();
  mockShortcutsModal.classList.remove.mockClear();
  mockShortcutsModal.classList.toggle.mockClear();
  mockSessionSearchInput.focus.mockClear();
  mockNewSessionBtn.click.mockClear();

  vi.doMock("../../../public/js/core/dom.js", () => ({
    $: {
      shortcutsModal: mockShortcutsModal,
      sessionSearchInput: mockSessionSearchInput,
      newSessionBtn: mockNewSessionBtn,
    },
  }));
  vi.doMock("../../../public/js/core/store.js", () => ({
    getState: vi.fn(() => false),
    setState: vi.fn(),
  }));
  vi.doMock("../../../public/js/core/constants.js", () => ({
    CHAT_IDS: ["chat-1", "chat-2", "chat-3", "chat-4"],
  }));
  vi.doMock("../../../public/js/ui/parallel.js", () => ({
    panes: new Map(),
  }));
  vi.doMock("../../../public/js/ui/commands.js", () => ({
    registerCommand: vi.fn(),
  }));
  vi.doMock("../../../public/js/ui/right-panel.js", () => ({
    toggleRightPanel: vi.fn(),
    openRightPanel: vi.fn(),
  }));
  vi.doMock("../../../public/js/panels/tips-feed.js", () => ({
    toggleTipsFeed: vi.fn(),
  }));

  await import("../../../public/js/ui/shortcuts.js");
});

afterEach(() => {
  document.getElementById("shortcuts-modal-close")?.remove();
  document.getElementById("test-modal-1")?.remove();
  document.getElementById("test-modal-2")?.remove();
});

describe("shortcuts", () => {
  it("imports without error", () => {
    expect(true).toBe(true);
  });

  it("closes non-persistent modals on Escape", () => {
    const modal1 = document.getElementById("test-modal-1");
    modal1.classList.remove("hidden");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(modal1.classList.contains("hidden")).toBe(true);
  });

  it("does not close persistent modals on Escape", () => {
    const modal2 = document.getElementById("test-modal-2");
    modal2.classList.remove("hidden");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(modal2.classList.contains("hidden")).toBe(false);
  });

  it("focuses session search on Cmd+K", () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
    expect(mockSessionSearchInput.focus).toHaveBeenCalled();
  });

  it("toggles shortcuts modal on Cmd+/", () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "/", metaKey: true, bubbles: true }));
    expect(mockShortcutsModal.classList.toggle).toHaveBeenCalledWith("hidden");
  });

  it("clicks new session button on Cmd+N", () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "n", metaKey: true, bubbles: true }));
    expect(mockNewSessionBtn.click).toHaveBeenCalled();
  });
});

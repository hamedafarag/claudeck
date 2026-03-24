// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMessagesDiv = document.createElement("div");
const mockMessageInput = document.createElement("textarea");
const mockSendBtn = document.createElement("button");
const mockStopBtn = document.createElement("button");
const mockToggleParallelBtn = { checked: false };

const mockGetState = vi.fn();
const mockSetState = vi.fn();

vi.mock("../../../public/js/core/dom.js", () => ({
  $: {
    messagesDiv: mockMessagesDiv,
    messageInput: mockMessageInput,
    sendBtn: mockSendBtn,
    stopBtn: mockStopBtn,
    toggleParallelBtn: mockToggleParallelBtn,
  },
}));

vi.mock("../../../public/js/core/store.js", () => ({
  getState: (...args) => mockGetState(...args),
  setState: (...args) => mockSetState(...args),
}));

vi.mock("../../../public/js/core/constants.js", () => ({
  CHAT_IDS: ["chat-1", "chat-2", "chat-3", "chat-4"],
}));

vi.mock("../../../public/js/ui/commands.js", () => ({
  handleAutocompleteKeydown: vi.fn(),
  handleSlashAutocomplete: vi.fn(),
}));

vi.mock("../../../public/js/features/input-history.js", () => ({
  handleHistoryKeydown: vi.fn(),
}));

let panes, getPane, initSinglePane, _setInputHistoryGetter, _setChatFns;

beforeEach(async () => {
  vi.resetModules();
  mockGetState.mockReset();
  mockSetState.mockReset();

  vi.doMock("../../../public/js/core/dom.js", () => ({
    $: {
      messagesDiv: mockMessagesDiv,
      messageInput: mockMessageInput,
      sendBtn: mockSendBtn,
      stopBtn: mockStopBtn,
      toggleParallelBtn: mockToggleParallelBtn,
    },
  }));
  vi.doMock("../../../public/js/core/store.js", () => ({
    getState: (...args) => mockGetState(...args),
    setState: (...args) => mockSetState(...args),
  }));
  vi.doMock("../../../public/js/core/constants.js", () => ({
    CHAT_IDS: ["chat-1", "chat-2", "chat-3", "chat-4"],
  }));
  vi.doMock("../../../public/js/ui/commands.js", () => ({
    handleAutocompleteKeydown: vi.fn(),
    handleSlashAutocomplete: vi.fn(),
  }));
  vi.doMock("../../../public/js/features/input-history.js", () => ({
    handleHistoryKeydown: vi.fn(),
  }));

  const mod = await import("../../../public/js/ui/parallel.js");
  panes = mod.panes;
  getPane = mod.getPane;
  initSinglePane = mod.initSinglePane;
  _setInputHistoryGetter = mod._setInputHistoryGetter;
  _setChatFns = mod._setChatFns;
});

describe("parallel", () => {
  describe("panes", () => {
    it("is a Map", () => {
      expect(panes).toBeInstanceOf(Map);
    });

    it("has a single null-keyed pane after init", () => {
      expect(panes.has(null)).toBe(true);
      expect(panes.size).toBe(1);
    });
  });

  describe("initSinglePane", () => {
    it("clears existing panes and sets a single null-keyed pane", () => {
      panes.set("extra", { chatId: "extra" });
      initSinglePane();
      expect(panes.size).toBe(1);
      expect(panes.has(null)).toBe(true);
    });

    it("creates pane with expected properties", () => {
      initSinglePane();
      const pane = panes.get(null);
      expect(pane.chatId).toBeNull();
      expect(pane.messagesDiv).toBe(mockMessagesDiv);
      expect(pane.messageInput).toBe(mockMessageInput);
      expect(pane.sendBtn).toBe(mockSendBtn);
      expect(pane.stopBtn).toBe(mockStopBtn);
      expect(pane.isStreaming).toBe(false);
      expect(pane.currentAssistantMsg).toBeNull();
    });
  });

  describe("getPane", () => {
    it("returns null-keyed pane when not in parallel mode", () => {
      mockGetState.mockReturnValue(false);
      const pane = getPane("chat-1");
      expect(pane).toBe(panes.get(null));
    });

    it("returns chatId-keyed pane when in parallel mode", () => {
      mockGetState.mockReturnValue(true);
      const mockPane = { chatId: "chat-1" };
      panes.set("chat-1", mockPane);
      const pane = getPane("chat-1");
      expect(pane).toBe(mockPane);
    });

    it("falls back to null pane when chatId not found in parallel mode", () => {
      mockGetState.mockReturnValue(true);
      const pane = getPane("nonexistent");
      expect(pane).toBe(panes.get(null));
    });
  });

  describe("_setInputHistoryGetter", () => {
    it("is a function", () => {
      expect(typeof _setInputHistoryGetter).toBe("function");
    });
  });

  describe("_setChatFns", () => {
    it("is a function", () => {
      expect(typeof _setChatFns).toBe("function");
    });
  });
});

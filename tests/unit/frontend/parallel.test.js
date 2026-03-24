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

let panes, getPane, initSinglePane, _setInputHistoryGetter, _setChatFns, createChatPane;

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
  createChatPane = mod.createChatPane;
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

  describe("createChatPane", () => {
    it("createChatPane returns container and state", () => {
      _setChatFns({ sendMessage: vi.fn(), stopGeneration: vi.fn() });
      const result = createChatPane("chat-1", 0);
      expect(result).toHaveProperty("container");
      expect(result).toHaveProperty("state");
    });

    it("container has chat-pane class", () => {
      _setChatFns({ sendMessage: vi.fn(), stopGeneration: vi.fn() });
      const { container } = createChatPane("chat-1", 0);
      expect(container.className).toBe("chat-pane");
    });

    it("container has data-chatId attribute", () => {
      _setChatFns({ sendMessage: vi.fn(), stopGeneration: vi.fn() });
      const { container } = createChatPane("chat-1", 0);
      expect(container.dataset.chatId).toBe("chat-1");
    });

    it("container has header with Chat N label", () => {
      _setChatFns({ sendMessage: vi.fn(), stopGeneration: vi.fn() });
      const { container } = createChatPane("chat-1", 0);
      const label = container.querySelector(".chat-pane-label");
      expect(label).not.toBeNull();
      expect(label.textContent).toBe("Chat 1");
    });

    it("container has messages div", () => {
      _setChatFns({ sendMessage: vi.fn(), stopGeneration: vi.fn() });
      const { container } = createChatPane("chat-1", 0);
      const msgs = container.querySelector(".messages");
      expect(msgs).not.toBeNull();
    });

    it("container has textarea", () => {
      _setChatFns({ sendMessage: vi.fn(), stopGeneration: vi.fn() });
      const { container } = createChatPane("chat-1", 0);
      const textarea = container.querySelector("textarea");
      expect(textarea).not.toBeNull();
      expect(textarea.placeholder).toBe("Ask Claude... (Chat 1)");
    });

    it("container has send and stop buttons", () => {
      _setChatFns({ sendMessage: vi.fn(), stopGeneration: vi.fn() });
      const { container } = createChatPane("chat-1", 0);
      const sendBtn = container.querySelector(".pane-send-btn");
      const stopBtn = container.querySelector(".pane-stop-btn");
      expect(sendBtn).not.toBeNull();
      expect(stopBtn).not.toBeNull();
    });

    it("state has correct properties", () => {
      _setChatFns({ sendMessage: vi.fn(), stopGeneration: vi.fn() });
      const { state } = createChatPane("chat-1", 0);
      expect(state.chatId).toBe("chat-1");
      expect(state.isStreaming).toBe(false);
      expect(state.currentAssistantMsg).toBeNull();
      expect(state.messagesDiv).not.toBeNull();
      expect(state.messageInput).not.toBeNull();
      expect(state.sendBtn).not.toBeNull();
      expect(state.stopBtn).not.toBeNull();
    });

    it("send button click calls sendMessage", () => {
      const mockSendMessage = vi.fn();
      const mockStopGeneration = vi.fn();
      _setChatFns({ sendMessage: mockSendMessage, stopGeneration: mockStopGeneration });
      const { container, state } = createChatPane("chat-1", 0);
      const sendBtn = container.querySelector(".pane-send-btn");
      sendBtn.click();
      expect(mockSendMessage).toHaveBeenCalledWith(state);
    });

    it("stop button click calls stopGeneration", () => {
      const mockSendMessage = vi.fn();
      const mockStopGeneration = vi.fn();
      _setChatFns({ sendMessage: mockSendMessage, stopGeneration: mockStopGeneration });
      const { container, state } = createChatPane("chat-1", 0);
      const stopBtn = container.querySelector(".pane-stop-btn");
      stopBtn.click();
      expect(mockStopGeneration).toHaveBeenCalledWith(state);
    });

    it("Enter key in textarea triggers sendMessage", () => {
      const mockSendMessage = vi.fn();
      const mockStopGeneration = vi.fn();
      _setChatFns({ sendMessage: mockSendMessage, stopGeneration: mockStopGeneration });
      const { container, state } = createChatPane("chat-1", 0);
      const textarea = container.querySelector("textarea");
      const enterEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        shiftKey: false,
        bubbles: true,
        cancelable: true,
      });
      textarea.dispatchEvent(enterEvent);
      expect(mockSendMessage).toHaveBeenCalledWith(state);
    });
  });
});

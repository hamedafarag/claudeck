// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Shared spies ────────────────────────────────────────
const mockOn = vi.fn();
const mockGetState = vi.fn();
const mockRenderMarkdown = vi.fn((t) => t);
const mockHighlightCodeBlocks = vi.fn();
const mockAddCopyButtons = vi.fn();
const mockGetSelectedModel = vi.fn(() => "claude-3");

// ── Top-level vi.mock (hoisted) ─────────────────────────
vi.mock("../../../public/js/core/constants.js", () => ({
  BOT_CHAT_ID: "assistant-bot",
}));

vi.mock("../../../public/js/core/events.js", () => ({
  on: (...args) => mockOn(...args),
}));

vi.mock("../../../public/js/core/store.js", () => ({
  getState: (...args) => mockGetState(...args),
}));

vi.mock("../../../public/js/ui/formatting.js", () => ({
  renderMarkdown: (...args) => mockRenderMarkdown(...args),
  highlightCodeBlocks: (...args) => mockHighlightCodeBlocks(...args),
  addCopyButtons: (...args) => mockAddCopyButtons(...args),
}));

vi.mock("../../../public/js/core/api.js", () => ({
  fetchMessagesByChatId: vi.fn(() => Promise.resolve([])),
}));

vi.mock("../../../public/js/ui/model-selector.js", () => ({
  getSelectedModel: (...args) => mockGetSelectedModel(...args),
}));

vi.mock("../../../public/js/core/dom.js", () => ({
  $: {
    projectSelect: { value: "/tmp/test-project" },
  },
}));

// ── Tests ───────────────────────────────────────────────

beforeEach(async () => {
  vi.resetModules();
  mockOn.mockClear();
  mockGetState.mockClear();
  mockRenderMarkdown.mockClear();
  mockHighlightCodeBlocks.mockClear();
  mockAddCopyButtons.mockClear();
  mockGetSelectedModel.mockClear();
  document.body.innerHTML = "";
  localStorage.clear();

  // Mock fetch for /api/bot/prompt
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({
      json: () => Promise.resolve({ systemPrompt: "You are a helpful assistant." }),
    })
  );

  // Re-mock with doMock so each test gets fresh module state
  vi.doMock("../../../public/js/core/constants.js", () => ({
    BOT_CHAT_ID: "assistant-bot",
  }));
  vi.doMock("../../../public/js/core/events.js", () => ({
    on: (...args) => mockOn(...args),
  }));
  vi.doMock("../../../public/js/core/store.js", () => ({
    getState: (...args) => mockGetState(...args),
  }));
  vi.doMock("../../../public/js/ui/formatting.js", () => ({
    renderMarkdown: (...args) => mockRenderMarkdown(...args),
    highlightCodeBlocks: (...args) => mockHighlightCodeBlocks(...args),
    addCopyButtons: (...args) => mockAddCopyButtons(...args),
  }));
  vi.doMock("../../../public/js/core/api.js", () => ({
    fetchMessagesByChatId: vi.fn(() => Promise.resolve([])),
  }));
  vi.doMock("../../../public/js/ui/model-selector.js", () => ({
    getSelectedModel: (...args) => mockGetSelectedModel(...args),
  }));
  vi.doMock("../../../public/js/core/dom.js", () => ({
    $: {
      projectSelect: { value: "/tmp/test-project" },
    },
  }));

  await import("../../../public/js/panels/assistant-bot.js");
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("assistant-bot", () => {
  it("loads without error", () => {
    expect(true).toBe(true);
  });

  it("creates bot bubble element in document.body", () => {
    const bubble = document.querySelector(".bot-bubble");
    expect(bubble).not.toBeNull();
    expect(bubble.parentElement).toBe(document.body);
  });

  it("creates bot panel element in document.body", () => {
    const panel = document.querySelector(".bot-panel");
    expect(panel).not.toBeNull();
    expect(panel.parentElement).toBe(document.body);
  });

  it("bot bubble contains the whaly image", () => {
    const bubble = document.querySelector(".bot-bubble");
    const img = bubble.querySelector("img");
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe("/icons/whaly.png");
  });

  it("bot panel has messages area, input, send and stop buttons", () => {
    const panel = document.querySelector(".bot-panel");
    expect(panel.querySelector(".bot-messages")).not.toBeNull();
    expect(panel.querySelector(".bot-input")).not.toBeNull();
    expect(panel.querySelector(".bot-send-btn")).not.toBeNull();
    expect(panel.querySelector(".bot-stop-btn")).not.toBeNull();
  });

  it("registers ws:message event handler", () => {
    expect(mockOn).toHaveBeenCalledWith("ws:message", expect.any(Function));
  });

  it("fetches system prompt from /api/bot/prompt on init", () => {
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/bot/prompt");
  });
});

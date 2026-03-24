// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGetState = vi.fn(() => false);
const mockStoreOn = vi.fn();
const mockRegisterCommand = vi.fn();
const mockFetchTips = vi.fn(() => Promise.resolve({ tips: [], categories: {} }));
const mockFetchRssFeed = vi.fn(() => Promise.resolve({ items: [] }));

vi.mock("../../../public/js/core/dom.js", () => ({
  $: {},
}));

vi.mock("../../../public/js/core/store.js", () => ({
  getState: (...args) => mockGetState(...args),
  on: (...args) => mockStoreOn(...args),
}));

vi.mock("../../../public/js/ui/commands.js", () => ({
  registerCommand: (...args) => mockRegisterCommand(...args),
}));

vi.mock("../../../public/js/core/api.js", () => ({
  fetchTips: (...args) => mockFetchTips(...args),
  fetchRssFeed: (...args) => mockFetchRssFeed(...args),
}));

let toggleTipsFeed;
let tipsFeedPanel, tipsFeedToggleBtn, tipsFeedClose, tipsFeedContent, tipsFeedResize;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();

  // Create DOM elements needed by the module
  tipsFeedPanel = document.createElement("div");
  tipsFeedPanel.id = "tips-feed-panel";
  tipsFeedPanel.classList.add("hidden");

  tipsFeedToggleBtn = document.createElement("button");
  tipsFeedToggleBtn.id = "tips-feed-toggle-btn";

  tipsFeedClose = document.createElement("button");
  tipsFeedClose.id = "tips-feed-close";

  tipsFeedContent = document.createElement("div");
  tipsFeedContent.id = "tips-feed-content";

  tipsFeedResize = document.createElement("div");
  tipsFeedResize.id = "tips-feed-resize";

  document.body.innerHTML = "";
  document.body.appendChild(tipsFeedPanel);
  document.body.appendChild(tipsFeedToggleBtn);
  document.body.appendChild(tipsFeedClose);
  document.body.appendChild(tipsFeedContent);
  document.body.appendChild(tipsFeedResize);

  mockGetState.mockReset();
  mockGetState.mockReturnValue(false);
  mockStoreOn.mockReset();
  mockRegisterCommand.mockReset();
  mockFetchTips.mockReset();
  mockFetchTips.mockReturnValue(Promise.resolve({ tips: [], categories: {} }));
  mockFetchRssFeed.mockReset();

  vi.doMock("../../../public/js/core/dom.js", () => ({
    $: {
      tipsFeedPanel,
      tipsFeedToggleBtn,
      tipsFeedClose,
      tipsFeedContent,
      tipsFeedResize,
    },
  }));

  vi.doMock("../../../public/js/core/store.js", () => ({
    getState: (...args) => mockGetState(...args),
    on: (...args) => mockStoreOn(...args),
  }));

  vi.doMock("../../../public/js/ui/commands.js", () => ({
    registerCommand: (...args) => mockRegisterCommand(...args),
  }));

  vi.doMock("../../../public/js/core/api.js", () => ({
    fetchTips: (...args) => mockFetchTips(...args),
    fetchRssFeed: (...args) => mockFetchRssFeed(...args),
  }));

  const mod = await import("../../../public/js/panels/tips-feed.js");
  toggleTipsFeed = mod.toggleTipsFeed;
});

afterEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("tips-feed", () => {
  describe("module initialization", () => {
    it("registers /tips slash command at load time", () => {
      expect(mockRegisterCommand).toHaveBeenCalledWith("tips", expect.objectContaining({
        category: "app",
        description: expect.any(String),
        execute: expect.any(Function),
      }));
    });

    it("subscribes to parallelMode store changes", () => {
      expect(mockStoreOn).toHaveBeenCalledWith("parallelMode", expect.any(Function));
    });
  });

  describe("toggleTipsFeed", () => {
    it("opens panel when it is hidden", () => {
      tipsFeedPanel.classList.add("hidden");
      toggleTipsFeed();
      expect(tipsFeedPanel.classList.contains("hidden")).toBe(false);
    });

    it("closes panel when it is visible", () => {
      tipsFeedPanel.classList.remove("hidden");
      toggleTipsFeed();
      expect(tipsFeedPanel.classList.contains("hidden")).toBe(true);
    });

    it("does nothing in parallel mode", () => {
      mockGetState.mockReturnValue(true);
      tipsFeedPanel.classList.add("hidden");
      toggleTipsFeed();
      expect(tipsFeedPanel.classList.contains("hidden")).toBe(true);
    });
  });

  describe("openTipsFeed (via toggle)", () => {
    it("removes hidden class from panel", () => {
      tipsFeedPanel.classList.add("hidden");
      toggleTipsFeed();
      expect(tipsFeedPanel.classList.contains("hidden")).toBe(false);
    });

    it("saves open state to localStorage", () => {
      tipsFeedPanel.classList.add("hidden");
      toggleTipsFeed();
      expect(localStorage.getItem("claudeck-tips-feed")).toBe("1");
    });

    it("adds active class to toggle button", () => {
      tipsFeedPanel.classList.add("hidden");
      toggleTipsFeed();
      expect(tipsFeedToggleBtn.classList.contains("active")).toBe(true);
    });

    it("does not open in parallel mode", () => {
      mockGetState.mockReturnValue(true);
      tipsFeedPanel.classList.add("hidden");
      toggleTipsFeed();
      expect(tipsFeedPanel.classList.contains("hidden")).toBe(true);
    });
  });

  describe("closeTipsFeed (via toggle)", () => {
    it("adds hidden class to panel", () => {
      tipsFeedPanel.classList.remove("hidden");
      toggleTipsFeed();
      expect(tipsFeedPanel.classList.contains("hidden")).toBe(true);
    });

    it("saves closed state to localStorage", () => {
      tipsFeedPanel.classList.remove("hidden");
      toggleTipsFeed();
      expect(localStorage.getItem("claudeck-tips-feed")).toBe("0");
    });

    it("removes active class from toggle button", () => {
      tipsFeedToggleBtn.classList.add("active");
      tipsFeedPanel.classList.remove("hidden");
      toggleTipsFeed();
      expect(tipsFeedToggleBtn.classList.contains("active")).toBe(false);
    });
  });

  describe("parallelMode handler", () => {
    it("closes panel and disables button when parallel mode activates", () => {
      tipsFeedPanel.classList.remove("hidden");

      // Find the parallelMode callback and invoke it
      const parallelCall = mockStoreOn.mock.calls.find((c) => c[0] === "parallelMode");
      expect(parallelCall).toBeDefined();
      const handler = parallelCall[1];

      handler(true);
      expect(tipsFeedPanel.classList.contains("hidden")).toBe(true);
      expect(tipsFeedToggleBtn.disabled).toBe(true);
    });

    it("re-enables button when parallel mode deactivates", () => {
      tipsFeedToggleBtn.disabled = true;

      const parallelCall = mockStoreOn.mock.calls.find((c) => c[0] === "parallelMode");
      const handler = parallelCall[1];

      handler(false);
      expect(tipsFeedToggleBtn.disabled).toBe(false);
    });
  });
});

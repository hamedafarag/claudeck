// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../public/js/core/events.js", () => ({
  emit: vi.fn(),
  on: vi.fn(),
}));

vi.mock("../../../public/js/core/store.js", () => ({
  getState: vi.fn(),
  on: vi.fn(),
}));

vi.mock("../../../public/js/core/api.js", () => ({}));

vi.mock("../../../public/js/core/plugin-loader.js", () => ({
  getAvailablePlugins: vi.fn(() => []),
  getEnabledPluginNames: vi.fn(() => []),
  setEnabledPluginNames: vi.fn(),
  getPluginMeta: vi.fn(() => ({ icon: "", description: "" })),
  loadPluginByName: vi.fn(),
  isPluginLoaded: vi.fn(() => false),
  trackPluginTab: vi.fn(),
  getPluginTabId: vi.fn(() => null),
  getPluginTabMap: vi.fn(() => new Map()),
  setTabIdResolver: vi.fn(),
  getSortedPlugins: vi.fn(() => []),
  setPluginOrder: vi.fn(),
}));

let registerTab, unregisterTab, getRegisteredTabs, initTabSDK;

beforeEach(async () => {
  vi.resetModules();

  // Create right panel DOM
  document.body.innerHTML = `
    <div id="right-panel">
      <div class="right-panel-tab-bar">
        <button class="right-panel-close">&times;</button>
      </div>
      <div class="right-panel-content"></div>
    </div>
  `;

  vi.doMock("../../../public/js/core/dom.js", () => ({
    $: {
      rightPanel: document.getElementById("right-panel"),
      projectSelect: null,
    },
  }));
  vi.doMock("../../../public/js/core/events.js", () => ({
    emit: vi.fn(),
    on: vi.fn(),
  }));
  vi.doMock("../../../public/js/core/store.js", () => ({
    getState: vi.fn(),
    on: vi.fn(),
  }));
  vi.doMock("../../../public/js/core/api.js", () => ({}));
  vi.doMock("../../../public/js/core/plugin-loader.js", () => ({
    getAvailablePlugins: vi.fn(() => []),
    getEnabledPluginNames: vi.fn(() => []),
    setEnabledPluginNames: vi.fn(),
    getPluginMeta: vi.fn(() => ({ icon: "", description: "" })),
    loadPluginByName: vi.fn(),
    isPluginLoaded: vi.fn(() => false),
    trackPluginTab: vi.fn(),
    getPluginTabId: vi.fn(() => null),
    getPluginTabMap: vi.fn(() => new Map()),
    setTabIdResolver: vi.fn(),
    getSortedPlugins: vi.fn(() => []),
    setPluginOrder: vi.fn(),
  }));

  const mod = await import("../../../public/js/ui/tab-sdk.js");
  registerTab = mod.registerTab;
  unregisterTab = mod.unregisterTab;
  getRegisteredTabs = mod.getRegisteredTabs;
  initTabSDK = mod.initTabSDK;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("tab-sdk", () => {
  describe("registerTab", () => {
    it("throws when id is missing", () => {
      expect(() => registerTab({ init: () => document.createElement("div") })).toThrow("registerTab requires id and init");
    });

    it("throws when init is missing", () => {
      expect(() => registerTab({ id: "test" })).toThrow("registerTab requires id and init");
    });

    it("registers a tab successfully", () => {
      // First init the SDK so tabs can mount
      initTabSDK();

      registerTab({
        id: "test-tab",
        title: "Test",
        init: () => document.createElement("div"),
      });

      expect(getRegisteredTabs()).toContain("test-tab");
    });

    it("warns on duplicate registration", () => {
      initTabSDK();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      registerTab({ id: "dup-tab", title: "Dup", init: () => document.createElement("div") });
      registerTab({ id: "dup-tab", title: "Dup", init: () => document.createElement("div") });

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("dup-tab"));
      warnSpy.mockRestore();
    });
  });

  describe("unregisterTab", () => {
    it("removes a registered tab", () => {
      initTabSDK();
      const destroySpy = vi.fn();

      registerTab({
        id: "remove-me",
        title: "Remove",
        init: () => document.createElement("div"),
        onDestroy: destroySpy,
      });

      expect(getRegisteredTabs()).toContain("remove-me");
      unregisterTab("remove-me");
      expect(getRegisteredTabs()).not.toContain("remove-me");
    });

    it("calls onDestroy when unregistering", () => {
      initTabSDK();
      const destroySpy = vi.fn();

      registerTab({
        id: "destroy-test",
        title: "Destroy",
        init: () => document.createElement("div"),
        onDestroy: destroySpy,
      });

      unregisterTab("destroy-test");
      expect(destroySpy).toHaveBeenCalled();
    });

    it("does nothing for non-existent tab", () => {
      expect(() => unregisterTab("nonexistent")).not.toThrow();
    });
  });

  describe("getRegisteredTabs", () => {
    it("returns empty array initially", () => {
      expect(getRegisteredTabs()).toEqual([]);
    });

    it("returns all registered tab ids", () => {
      initTabSDK();

      registerTab({ id: "tab-a", title: "A", init: () => document.createElement("div") });
      registerTab({ id: "tab-b", title: "B", init: () => document.createElement("div") });

      const tabs = getRegisteredTabs();
      expect(tabs).toContain("tab-a");
      expect(tabs).toContain("tab-b");
    });
  });

  describe("initTabSDK", () => {
    it("sets up the tab bar", () => {
      initTabSDK();

      // Should create the "+" add tab button
      const addBtn = document.querySelector(".right-panel-add-tab");
      expect(addBtn).not.toBeNull();
    });

    it("mounts pending tabs registered before init", () => {
      // Register before init
      registerTab({ id: "early-tab", title: "Early", init: () => document.createElement("div") });

      initTabSDK();

      // Tab button should exist in tab bar
      const btn = document.querySelector('.right-panel-tab[data-tab="early-tab"]');
      expect(btn).not.toBeNull();
    });
  });
});

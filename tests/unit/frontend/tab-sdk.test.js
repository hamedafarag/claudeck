// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../public/js/core/events.js", () => ({
  emit: vi.fn(),
  on: vi.fn(() => vi.fn()),
  off: vi.fn(),
}));

vi.mock("../../../public/js/core/store.js", () => ({
  getState: vi.fn(),
  on: vi.fn(() => vi.fn()),
  off: vi.fn(),
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
  fetchMarketplace: vi.fn(),
  installMarketplacePlugin: vi.fn(),
  uninstallMarketplacePlugin: vi.fn(),
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
    on: vi.fn(() => vi.fn()),
    off: vi.fn(),
  }));
  vi.doMock("../../../public/js/core/store.js", () => ({
    getState: vi.fn(),
    on: vi.fn(() => vi.fn()),
    off: vi.fn(),
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
    fetchMarketplace: vi.fn(),
    installMarketplacePlugin: vi.fn(),
    uninstallMarketplacePlugin: vi.fn(),
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

  describe("ctx — context object", () => {
    it("init receives ctx with pluginId matching tab id", () => {
      initTabSDK();
      let receivedCtx;
      registerTab({
        id: "ctx-test",
        title: "Ctx",
        init(ctx) { receivedCtx = ctx; return document.createElement("div"); },
      });
      expect(receivedCtx.pluginId).toBe("ctx-test");
    });

    it("ctx.on returns an unsubscribe function", () => {
      initTabSDK();
      let receivedCtx;
      registerTab({
        id: "on-unsub",
        title: "Test",
        init(ctx) { receivedCtx = ctx; return document.createElement("div"); },
      });
      const unsub = receivedCtx.on("test", vi.fn());
      expect(typeof unsub).toBe("function");
    });

    it("ctx.onState returns an unsubscribe function", () => {
      initTabSDK();
      let receivedCtx;
      registerTab({
        id: "onstate-unsub",
        title: "Test",
        init(ctx) { receivedCtx = ctx; return document.createElement("div"); },
      });
      const unsub = receivedCtx.onState("sessionId", vi.fn());
      expect(typeof unsub).toBe("function");
    });

    it("ctx.getTheme returns a string", () => {
      initTabSDK();
      let theme;
      registerTab({
        id: "theme-test",
        title: "Test",
        init(ctx) { theme = ctx.getTheme(); return document.createElement("div"); },
      });
      expect(typeof theme).toBe("string");
      expect(["dark", "light"]).toContain(theme);
    });

    it("ctx.getProjectPath returns a string", () => {
      initTabSDK();
      let path;
      registerTab({
        id: "project-test",
        title: "Test",
        init(ctx) { path = ctx.getProjectPath(); return document.createElement("div"); },
      });
      expect(typeof path).toBe("string");
    });

    it("ctx.getSessionId calls getState", () => {
      initTabSDK();
      let sid;
      registerTab({
        id: "session-test",
        title: "Test",
        init(ctx) { sid = ctx.getSessionId(); return document.createElement("div"); },
      });
      // getState is mocked, returns undefined
      expect(sid).toBeUndefined();
    });
  });

  describe("ctx.storage — namespaced localStorage", () => {
    it("set and get round-trip a value", () => {
      initTabSDK();
      let storage;
      registerTab({
        id: "storage-test",
        title: "Test",
        init(ctx) { storage = ctx.storage; return document.createElement("div"); },
      });
      storage.set("items", [1, 2, 3]);
      expect(storage.get("items")).toEqual([1, 2, 3]);
    });

    it("keys are scoped to plugin id", () => {
      initTabSDK();
      let storage;
      registerTab({
        id: "scoped-store",
        title: "Test",
        init(ctx) { storage = ctx.storage; return document.createElement("div"); },
      });
      storage.set("foo", "bar");
      expect(localStorage.getItem("claudeck-plugin-scoped-store-foo")).toBe('"bar"');
    });

    it("get returns null for missing key", () => {
      initTabSDK();
      let storage;
      registerTab({
        id: "missing-key",
        title: "Test",
        init(ctx) { storage = ctx.storage; return document.createElement("div"); },
      });
      expect(storage.get("nonexistent")).toBeNull();
    });

    it("remove deletes a key", () => {
      initTabSDK();
      let storage;
      registerTab({
        id: "remove-key",
        title: "Test",
        init(ctx) { storage = ctx.storage; return document.createElement("div"); },
      });
      storage.set("temp", "data");
      expect(storage.get("temp")).toBe("data");
      storage.remove("temp");
      expect(storage.get("temp")).toBeNull();
    });

    it("handles complex objects", () => {
      initTabSDK();
      let storage;
      registerTab({
        id: "complex-store",
        title: "Test",
        init(ctx) { storage = ctx.storage; return document.createElement("div"); },
      });
      const obj = { todos: [{ id: 1, text: "test", done: false }], count: 42 };
      storage.set("data", obj);
      expect(storage.get("data")).toEqual(obj);
    });
  });

  describe("ctx.toast", () => {
    it("appends a toast element to document.body", () => {
      initTabSDK();
      let ctx;
      registerTab({
        id: "toast-test",
        title: "Test",
        init(c) { ctx = c; return document.createElement("div"); },
      });
      ctx.toast("Hello!");
      const toast = document.querySelector(".claudeck-toast");
      expect(toast).not.toBeNull();
      expect(toast.textContent).toBe("Hello!");
    });

    it("toast auto-removes after duration", async () => {
      vi.useFakeTimers();
      try {
        initTabSDK();
        let ctx;
        registerTab({
          id: "toast-duration",
          title: "Test",
          init(c) { ctx = c; return document.createElement("div"); },
        });
        ctx.toast("Bye!", { duration: 1000 });
        expect(document.querySelector(".claudeck-toast")).not.toBeNull();
        vi.advanceTimersByTime(1100);
        expect(document.querySelector(".claudeck-toast")).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("ctx.dispose", () => {
    it("is a function on ctx", () => {
      initTabSDK();
      let ctx;
      registerTab({
        id: "dispose-test",
        title: "Test",
        init(c) { ctx = c; return document.createElement("div"); },
      });
      expect(typeof ctx.dispose).toBe("function");
    });

    it("can be called without error", () => {
      initTabSDK();
      let ctx;
      registerTab({
        id: "dispose-safe",
        title: "Test",
        init(c) { ctx = c; return document.createElement("div"); },
      });
      expect(() => ctx.dispose()).not.toThrow();
    });
  });

  describe("lifecycle hooks receive ctx", () => {
    it("onDestroy receives ctx when unregistering", () => {
      initTabSDK();
      const destroySpy = vi.fn();
      registerTab({
        id: "destroy-ctx",
        title: "Test",
        init: () => document.createElement("div"),
        onDestroy: destroySpy,
      });
      unregisterTab("destroy-ctx");
      expect(destroySpy).toHaveBeenCalledWith(expect.objectContaining({ pluginId: "destroy-ctx" }));
    });

    it("unregisterTab auto-disposes ctx subscriptions", () => {
      initTabSDK();
      let ctx;
      registerTab({
        id: "auto-dispose",
        title: "Test",
        init(c) { ctx = c; return document.createElement("div"); },
      });
      const disposeSpy = vi.spyOn(ctx, "dispose");
      unregisterTab("auto-dispose");
      expect(disposeSpy).toHaveBeenCalled();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// Each test needs a fresh module to avoid leaked state between tests.
// We use dynamic import with cache-busting to get isolated store instances.
let getState, setState, on, off;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import("../../../public/js/core/store.js");
  getState = mod.getState;
  setState = mod.setState;
  on = mod.on;
  off = mod.off;
});

describe("store", () => {
  describe("getState", () => {
    it("returns undefined for an unset key", () => {
      expect(getState("nonExistentKey")).toBeUndefined();
    });

    it("returns default values defined in initial state", () => {
      // The store initialises 'view' to 'home'
      expect(getState("view")).toBe("home");
    });
  });

  describe("setState", () => {
    it("stores a value retrievable via getState", () => {
      setState("view", "settings");
      expect(getState("view")).toBe("settings");
    });

    it("stores a brand-new key not in the initial state", () => {
      setState("customKey", 42);
      expect(getState("customKey")).toBe(42);
    });

    it("overwrites a previously set value", () => {
      setState("view", "first");
      setState("view", "second");
      expect(getState("view")).toBe("second");
    });

    it("triggers registered listeners when called", () => {
      const listener = vi.fn();
      on("view", listener);
      setState("view", "chat");
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("on", () => {
    it("registers a listener that fires on setState", () => {
      const listener = vi.fn();
      on("myKey", listener);
      setState("myKey", "hello");
      expect(listener).toHaveBeenCalledOnce();
    });

    it("passes the new value as argument to the listener", () => {
      const listener = vi.fn();
      on("myKey", listener);
      setState("myKey", { foo: "bar" });
      expect(listener).toHaveBeenCalledWith({ foo: "bar" });
    });

    it("fires multiple listeners on the same key", () => {
      const listenerA = vi.fn();
      const listenerB = vi.fn();
      on("shared", listenerA);
      on("shared", listenerB);
      setState("shared", "value");
      expect(listenerA).toHaveBeenCalledOnce();
      expect(listenerB).toHaveBeenCalledOnce();
    });

    it("does not fire listeners registered on a different key", () => {
      const listener = vi.fn();
      on("keyA", listener);
      setState("keyB", "value");
      expect(listener).not.toHaveBeenCalled();
    });

    it("fires listener on every subsequent setState call", () => {
      const listener = vi.fn();
      on("counter", listener);
      setState("counter", 1);
      setState("counter", 2);
      setState("counter", 3);
      expect(listener).toHaveBeenCalledTimes(3);
      expect(listener).toHaveBeenNthCalledWith(1, 1);
      expect(listener).toHaveBeenNthCalledWith(2, 2);
      expect(listener).toHaveBeenNthCalledWith(3, 3);
    });

    it("returns an unsubscribe function", () => {
      const unsub = on("unsub-key", vi.fn());
      expect(typeof unsub).toBe("function");
    });

    it("unsubscribe stops the listener from firing", () => {
      const listener = vi.fn();
      const unsub = on("unsub-state", listener);
      setState("unsub-state", "a");
      expect(listener).toHaveBeenCalledOnce();

      unsub();
      setState("unsub-state", "b");
      expect(listener).toHaveBeenCalledOnce(); // still 1
    });

    it("unsubscribe only removes the specific listener", () => {
      const listenerA = vi.fn();
      const listenerB = vi.fn();
      const unsub = on("multi-unsub", listenerA);
      on("multi-unsub", listenerB);

      unsub();
      setState("multi-unsub", "val");
      expect(listenerA).not.toHaveBeenCalled();
      expect(listenerB).toHaveBeenCalledOnce();
    });
  });

  describe("off", () => {
    it("removes a specific listener", () => {
      const listener = vi.fn();
      on("off-key", listener);
      off("off-key", listener);
      setState("off-key", "val");
      expect(listener).not.toHaveBeenCalled();
    });

    it("does not throw when removing from non-existent key", () => {
      expect(() => off("no-key", vi.fn())).not.toThrow();
    });

    it("only removes the targeted listener", () => {
      const listenerA = vi.fn();
      const listenerB = vi.fn();
      on("off-multi", listenerA);
      on("off-multi", listenerB);
      off("off-multi", listenerA);
      setState("off-multi", "val");
      expect(listenerA).not.toHaveBeenCalled();
      expect(listenerB).toHaveBeenCalledOnce();
    });
  });
});

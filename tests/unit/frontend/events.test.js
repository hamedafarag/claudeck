import { describe, it, expect, vi, beforeEach } from "vitest";

let emit, on, off;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import("../../../public/js/core/events.js");
  emit = mod.emit;
  on = mod.on;
  off = mod.off;
});

describe("events", () => {
  describe("on", () => {
    it("registers a handler for an event", () => {
      const handler = vi.fn();
      on("test-event", handler);
      emit("test-event");
      expect(handler).toHaveBeenCalledOnce();
    });

    it("returns an unsubscribe function", () => {
      const handler = vi.fn();
      const unsub = on("unsub-test", handler);
      expect(typeof unsub).toBe("function");
    });

    it("unsubscribe stops the handler from firing", () => {
      const handler = vi.fn();
      const unsub = on("unsub-event", handler);
      emit("unsub-event");
      expect(handler).toHaveBeenCalledOnce();

      unsub();
      emit("unsub-event");
      expect(handler).toHaveBeenCalledOnce(); // still 1, not 2
    });

    it("unsubscribe only removes the specific handler", () => {
      const handlerA = vi.fn();
      const handlerB = vi.fn();
      const unsub = on("multi", handlerA);
      on("multi", handlerB);

      unsub();
      emit("multi");
      expect(handlerA).not.toHaveBeenCalled();
      expect(handlerB).toHaveBeenCalledOnce();
    });
  });

  describe("off", () => {
    it("removes a specific handler", () => {
      const handler = vi.fn();
      on("off-test", handler);
      off("off-test", handler);
      emit("off-test");
      expect(handler).not.toHaveBeenCalled();
    });

    it("does not throw when removing from non-existent event", () => {
      expect(() => off("no-event", vi.fn())).not.toThrow();
    });

    it("only removes the targeted handler", () => {
      const handlerA = vi.fn();
      const handlerB = vi.fn();
      on("off-multi", handlerA);
      on("off-multi", handlerB);
      off("off-multi", handlerA);
      emit("off-multi");
      expect(handlerA).not.toHaveBeenCalled();
      expect(handlerB).toHaveBeenCalledOnce();
    });
  });

  describe("emit", () => {
    it("fires all handlers registered for the event", () => {
      const handlerA = vi.fn();
      const handlerB = vi.fn();
      on("click", handlerA);
      on("click", handlerB);
      emit("click");
      expect(handlerA).toHaveBeenCalledOnce();
      expect(handlerB).toHaveBeenCalledOnce();
    });

    it("does not throw when emitting an event with no handlers", () => {
      expect(() => emit("no-handlers")).not.toThrow();
    });

    it("passes the data argument to every handler", () => {
      const handler = vi.fn();
      on("data-event", handler);
      const payload = { id: 1, name: "test" };
      emit("data-event", payload);
      expect(handler).toHaveBeenCalledWith(payload);
    });

    it("passes undefined when emitting without data", () => {
      const handler = vi.fn();
      on("bare-event", handler);
      emit("bare-event");
      expect(handler).toHaveBeenCalledWith(undefined);
    });

    it("does not fire handlers registered on a different event", () => {
      const handler = vi.fn();
      on("eventA", handler);
      emit("eventB", "data");
      expect(handler).not.toHaveBeenCalled();
    });

    it("fires handlers in the order they were registered", () => {
      const order = [];
      on("ordered", () => order.push("first"));
      on("ordered", () => order.push("second"));
      on("ordered", () => order.push("third"));
      emit("ordered");
      expect(order).toEqual(["first", "second", "third"]);
    });

    it("fires the handler on every emit call", () => {
      const handler = vi.fn();
      on("repeat", handler);
      emit("repeat", 1);
      emit("repeat", 2);
      emit("repeat", 3);
      expect(handler).toHaveBeenCalledTimes(3);
      expect(handler).toHaveBeenNthCalledWith(1, 1);
      expect(handler).toHaveBeenNthCalledWith(2, 2);
      expect(handler).toHaveBeenNthCalledWith(3, 3);
    });
  });
});

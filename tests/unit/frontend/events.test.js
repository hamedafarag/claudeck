import { describe, it, expect, vi, beforeEach } from "vitest";

let emit, on;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import("../../../public/js/core/events.js");
  emit = mod.emit;
  on = mod.on;
});

describe("events", () => {
  describe("on", () => {
    it("registers a handler for an event", () => {
      const handler = vi.fn();
      on("test-event", handler);
      emit("test-event");
      expect(handler).toHaveBeenCalledOnce();
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

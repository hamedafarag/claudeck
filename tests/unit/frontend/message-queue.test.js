// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// Mock dependencies
vi.mock("../../../public/js/core/dom.js", () => ({
  $: {
    messageInput: {
      closest: vi.fn(() => null),
    },
    queueStopModal: {
      classList: { add: vi.fn(), remove: vi.fn() },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    queueStopAll: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    queueStopSkip: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    queueStopPause: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    queueStopPreview: { innerHTML: "", appendChild: vi.fn() },
  },
}));

vi.mock("../../../public/js/core/store.js", () => ({
  getState: vi.fn((key) => {
    if (key === "parallelMode") return false;
    if (key === "ws") return { send: vi.fn(), readyState: 1 };
    return null;
  }),
  setState: vi.fn(),
}));

vi.mock("../../../public/js/ui/parallel.js", () => ({
  getPane: vi.fn(() => null),
}));

let mod;

beforeAll(async () => {
  mod = await import("../../../public/js/features/message-queue.js");
});

function createMockPane() {
  return {
    chatId: null,
    isStreaming: false,
    messageInput: { closest: vi.fn(() => null) },
    _messageQueue: [],
    _queuePaused: false,
    _queuePauseReason: null,
  };
}

describe("message-queue", () => {
  describe("initQueueOnPane", () => {
    it("initializes queue properties on a pane", () => {
      const pane = { isStreaming: false };
      mod.initQueueOnPane(pane);
      expect(pane._messageQueue).toEqual([]);
      expect(pane._queuePaused).toBe(false);
      expect(pane._queuePauseReason).toBeNull();
    });
  });

  describe("enqueueMessage", () => {
    it("adds a message to the queue", () => {
      const pane = createMockPane();
      mod.enqueueMessage("hello", pane);
      expect(pane._messageQueue).toHaveLength(1);
      expect(pane._messageQueue[0].text).toBe("hello");
      expect(pane._messageQueue[0].id).toBeGreaterThan(0);
    });

    it("adds multiple messages in order", () => {
      const pane = createMockPane();
      mod.enqueueMessage("first", pane);
      mod.enqueueMessage("second", pane);
      mod.enqueueMessage("third", pane);
      expect(pane._messageQueue).toHaveLength(3);
      expect(pane._messageQueue[0].text).toBe("first");
      expect(pane._messageQueue[1].text).toBe("second");
      expect(pane._messageQueue[2].text).toBe("third");
    });

    it("assigns unique ids to each item", () => {
      const pane = createMockPane();
      mod.enqueueMessage("a", pane);
      mod.enqueueMessage("b", pane);
      expect(pane._messageQueue[0].id).not.toBe(pane._messageQueue[1].id);
    });
  });

  describe("removeFromQueue", () => {
    it("removes an item by index", () => {
      const pane = createMockPane();
      mod.enqueueMessage("a", pane);
      mod.enqueueMessage("b", pane);
      mod.enqueueMessage("c", pane);
      mod.removeFromQueue(pane, 1);
      expect(pane._messageQueue).toHaveLength(2);
      expect(pane._messageQueue[0].text).toBe("a");
      expect(pane._messageQueue[1].text).toBe("c");
    });

    it("does nothing for out-of-range index", () => {
      const pane = createMockPane();
      mod.enqueueMessage("a", pane);
      mod.removeFromQueue(pane, 5);
      expect(pane._messageQueue).toHaveLength(1);
    });

    it("does nothing for negative index", () => {
      const pane = createMockPane();
      mod.enqueueMessage("a", pane);
      mod.removeFromQueue(pane, -1);
      expect(pane._messageQueue).toHaveLength(1);
    });
  });

  describe("editQueueItem", () => {
    it("updates the text of a queued item", () => {
      const pane = createMockPane();
      mod.enqueueMessage("original", pane);
      mod.editQueueItem(pane, 0, "updated");
      expect(pane._messageQueue[0].text).toBe("updated");
    });

    it("removes the item if new text is empty", () => {
      const pane = createMockPane();
      mod.enqueueMessage("to-remove", pane);
      mod.editQueueItem(pane, 0, "   ");
      expect(pane._messageQueue).toHaveLength(0);
    });

    it("trims the new text", () => {
      const pane = createMockPane();
      mod.enqueueMessage("original", pane);
      mod.editQueueItem(pane, 0, "  trimmed  ");
      expect(pane._messageQueue[0].text).toBe("trimmed");
    });

    it("does nothing for out-of-range index", () => {
      const pane = createMockPane();
      mod.enqueueMessage("a", pane);
      mod.editQueueItem(pane, 5, "new");
      expect(pane._messageQueue[0].text).toBe("a");
    });
  });

  describe("reorderQueue", () => {
    it("moves an item forward", () => {
      const pane = createMockPane();
      mod.enqueueMessage("a", pane);
      mod.enqueueMessage("b", pane);
      mod.enqueueMessage("c", pane);
      mod.reorderQueue(pane, 0, 2);
      expect(pane._messageQueue.map((i) => i.text)).toEqual(["b", "c", "a"]);
    });

    it("moves an item backward", () => {
      const pane = createMockPane();
      mod.enqueueMessage("a", pane);
      mod.enqueueMessage("b", pane);
      mod.enqueueMessage("c", pane);
      mod.reorderQueue(pane, 2, 0);
      expect(pane._messageQueue.map((i) => i.text)).toEqual(["c", "a", "b"]);
    });

    it("does nothing if from equals to", () => {
      const pane = createMockPane();
      mod.enqueueMessage("a", pane);
      mod.enqueueMessage("b", pane);
      mod.reorderQueue(pane, 1, 1);
      expect(pane._messageQueue.map((i) => i.text)).toEqual(["a", "b"]);
    });
  });

  describe("clearQueue", () => {
    it("empties the queue", () => {
      const pane = createMockPane();
      mod.enqueueMessage("a", pane);
      mod.enqueueMessage("b", pane);
      mod.clearQueue(pane);
      expect(pane._messageQueue).toHaveLength(0);
    });

    it("resets paused state", () => {
      const pane = createMockPane();
      pane._queuePaused = true;
      pane._queuePauseReason = "error";
      mod.clearQueue(pane);
      expect(pane._queuePaused).toBe(false);
      expect(pane._queuePauseReason).toBeNull();
    });
  });

  describe("getQueue", () => {
    it("returns a copy of the queue", () => {
      const pane = createMockPane();
      mod.enqueueMessage("a", pane);
      const copy = mod.getQueue(pane);
      expect(copy).toHaveLength(1);
      expect(copy[0].text).toBe("a");
      // Should be a copy, not the same reference
      copy.push({ id: 999, text: "injected" });
      expect(pane._messageQueue).toHaveLength(1);
    });
  });

  describe("pauseQueue", () => {
    it("sets paused state with reason", () => {
      const pane = createMockPane();
      mod.pauseQueue(pane, "error");
      expect(pane._queuePaused).toBe(true);
      expect(pane._queuePauseReason).toBe("error");
    });

    it("defaults reason to user", () => {
      const pane = createMockPane();
      mod.pauseQueue(pane);
      expect(pane._queuePauseReason).toBe("user");
    });
  });

  describe("resumeQueue", () => {
    it("clears paused state", () => {
      const pane = createMockPane();
      pane._queuePaused = true;
      pane._queuePauseReason = "error";
      mod.resumeQueue(pane);
      expect(pane._queuePaused).toBe(false);
      expect(pane._queuePauseReason).toBeNull();
    });
  });

  describe("fireNextQueued", () => {
    it("does nothing if queue is empty", async () => {
      const pane = createMockPane();
      await mod.fireNextQueued(pane);
      expect(pane._messageQueue).toHaveLength(0);
    });

    it("does nothing if queue is paused", async () => {
      const pane = createMockPane();
      mod.enqueueMessage("a", pane);
      pane._queuePaused = true;
      await mod.fireNextQueued(pane);
      expect(pane._messageQueue).toHaveLength(1);
    });

    it("shifts the first item from the queue", async () => {
      const pane = createMockPane();
      mod.enqueueMessage("first", pane);
      mod.enqueueMessage("second", pane);
      // fireNextQueued will try to import chat.js and call _doSend
      // This will fail in test env, but we can verify the queue was shifted
      try {
        await mod.fireNextQueued(pane);
      } catch {
        // Expected — _doSend import fails in test
      }
      expect(pane._messageQueue).toHaveLength(1);
      expect(pane._messageQueue[0].text).toBe("second");
    });
  });

  describe("queue lifecycle", () => {
    it("supports full enqueue-edit-reorder-remove cycle", () => {
      const pane = createMockPane();

      // Enqueue 3 items
      mod.enqueueMessage("task 1", pane);
      mod.enqueueMessage("task 2", pane);
      mod.enqueueMessage("task 3", pane);
      expect(pane._messageQueue).toHaveLength(3);

      // Edit second item
      mod.editQueueItem(pane, 1, "task 2 updated");
      expect(pane._messageQueue[1].text).toBe("task 2 updated");

      // Reorder: move last to first
      mod.reorderQueue(pane, 2, 0);
      expect(pane._messageQueue.map((i) => i.text)).toEqual([
        "task 3",
        "task 1",
        "task 2 updated",
      ]);

      // Remove middle
      mod.removeFromQueue(pane, 1);
      expect(pane._messageQueue.map((i) => i.text)).toEqual([
        "task 3",
        "task 2 updated",
      ]);

      // Clear all
      mod.clearQueue(pane);
      expect(pane._messageQueue).toHaveLength(0);
    });

    it("pause blocks fire, resume allows it", async () => {
      const pane = createMockPane();
      mod.enqueueMessage("blocked", pane);

      // Pause
      mod.pauseQueue(pane, "error");
      await mod.fireNextQueued(pane);
      expect(pane._messageQueue).toHaveLength(1);

      // Resume
      mod.resumeQueue(pane);
      expect(pane._queuePaused).toBe(false);
    });
  });
});

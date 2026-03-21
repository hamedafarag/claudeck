// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { InputHistory, handleHistoryKeydown } from "../../../public/js/features/input-history.js";

function createPane() {
  const messageInput = document.createElement("textarea");
  return { messageInput };
}

function keyEvent(key, opts = {}) {
  return { key, preventDefault: vi.fn(), ...opts };
}

beforeEach(() => {
  localStorage.clear();
});

// ── InputHistory class ──

describe("InputHistory", () => {
  describe("add()", () => {
    it("appends entries", () => {
      const h = new InputHistory("test-key");
      h.add("hello");
      h.add("world");
      expect(h.entries).toEqual(["hello", "world"]);
    });

    it("skips empty and whitespace-only strings", () => {
      const h = new InputHistory("test-key");
      h.add("");
      h.add("   ");
      h.add(null);
      h.add(undefined);
      expect(h.entries).toEqual([]);
    });

    it("deduplicates consecutive identical entries", () => {
      const h = new InputHistory("test-key");
      h.add("run tests");
      h.add("run tests");
      h.add("run tests");
      expect(h.entries).toEqual(["run tests"]);
    });

    it("allows non-consecutive duplicates", () => {
      const h = new InputHistory("test-key");
      h.add("a");
      h.add("b");
      h.add("a");
      expect(h.entries).toEqual(["a", "b", "a"]);
    });

    it("caps at maxSize, evicting oldest", () => {
      const h = new InputHistory("test-key", 3);
      h.add("one");
      h.add("two");
      h.add("three");
      h.add("four");
      expect(h.entries).toEqual(["two", "three", "four"]);
    });

    it("persists to localStorage", () => {
      const h = new InputHistory("test-key");
      h.add("saved");
      const raw = JSON.parse(localStorage.getItem("test-key"));
      expect(raw).toEqual(["saved"]);
    });

    it("resets navigation index after add", () => {
      const h = new InputHistory("test-key");
      h.add("a");
      h.previous("");
      expect(h.isNavigating).toBe(true);
      h.add("b");
      expect(h.isNavigating).toBe(false);
    });
  });

  describe("previous() / next()", () => {
    it("navigates backward through entries", () => {
      const h = new InputHistory("test-key");
      h.add("first");
      h.add("second");
      h.add("third");

      expect(h.previous("")).toBe("third");
      expect(h.previous("")).toBe("second");
      expect(h.previous("")).toBe("first");
    });

    it("clamps at oldest entry (no wrap)", () => {
      const h = new InputHistory("test-key");
      h.add("only");

      expect(h.previous("")).toBe("only");
      expect(h.previous("")).toBe("only");
    });

    it("returns null when history is empty", () => {
      const h = new InputHistory("test-key");
      expect(h.previous("")).toBe(null);
    });

    it("navigates forward and restores draft at the end", () => {
      const h = new InputHistory("test-key");
      h.add("a");
      h.add("b");

      h.previous("my draft");
      h.previous("my draft");
      expect(h.next()).toBe("b");
      expect(h.next()).toBe("my draft");
    });

    it("returns draft immediately if not navigating", () => {
      const h = new InputHistory("test-key");
      h.add("a");
      h.index = -1;
      h.draft = "some text";
      expect(h.next()).toBe("some text");
    });

    it("saves draft on first navigation only", () => {
      const h = new InputHistory("test-key");
      h.add("a");
      h.add("b");

      h.previous("draft-v1");
      expect(h.draft).toBe("draft-v1");
      // subsequent calls should NOT overwrite draft
      h.previous("this-should-be-ignored");
      expect(h.draft).toBe("draft-v1");
    });
  });

  describe("cancel()", () => {
    it("restores draft and exits navigation", () => {
      const h = new InputHistory("test-key");
      h.add("entry");
      h.previous("my draft");
      expect(h.isNavigating).toBe(true);

      const result = h.cancel();
      expect(result).toBe("my draft");
      expect(h.isNavigating).toBe(false);
      expect(h.draft).toBe("");
    });
  });

  describe("reset()", () => {
    it("clears navigation state", () => {
      const h = new InputHistory("test-key");
      h.add("entry");
      h.previous("draft");
      h.reset();
      expect(h.isNavigating).toBe(false);
      expect(h.index).toBe(-1);
      expect(h.draft).toBe("");
    });
  });

  describe("isNavigating", () => {
    it("is false by default", () => {
      const h = new InputHistory("test-key");
      expect(h.isNavigating).toBe(false);
    });

    it("is true after previous()", () => {
      const h = new InputHistory("test-key");
      h.add("x");
      h.previous("");
      expect(h.isNavigating).toBe(true);
    });

    it("is false after next() returns draft", () => {
      const h = new InputHistory("test-key");
      h.add("x");
      h.previous("");
      h.next();
      expect(h.isNavigating).toBe(false);
    });
  });

  describe("getAll()", () => {
    it("returns entries newest-first", () => {
      const h = new InputHistory("test-key");
      h.add("old");
      h.add("mid");
      h.add("new");
      expect(h.getAll()).toEqual(["new", "mid", "old"]);
    });

    it("returns empty array when no entries", () => {
      const h = new InputHistory("test-key");
      expect(h.getAll()).toEqual([]);
    });

    it("returns a copy, not a reference", () => {
      const h = new InputHistory("test-key");
      h.add("a");
      const all = h.getAll();
      all.push("mutated");
      expect(h.entries).toEqual(["a"]);
    });
  });

  describe("localStorage persistence", () => {
    it("loads entries from localStorage on construction", () => {
      localStorage.setItem("persist-key", JSON.stringify(["saved1", "saved2"]));
      const h = new InputHistory("persist-key");
      expect(h.entries).toEqual(["saved1", "saved2"]);
    });

    it("survives save/load round-trip", () => {
      const h1 = new InputHistory("round-trip");
      h1.add("alpha");
      h1.add("beta");

      const h2 = new InputHistory("round-trip");
      expect(h2.entries).toEqual(["alpha", "beta"]);
    });

    it("degrades gracefully on corrupted localStorage", () => {
      localStorage.setItem("corrupt-key", "not-valid-json{{{");
      const h = new InputHistory("corrupt-key");
      expect(h.entries).toEqual([]);
    });

    it("degrades gracefully when localStorage.setItem throws", () => {
      const h = new InputHistory("full-key");
      const original = localStorage.setItem;
      localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
      // Should not throw
      h.add("still works");
      expect(h.entries).toEqual(["still works"]);
      localStorage.setItem = original;
    });
  });
});

// ── handleHistoryKeydown ──

describe("handleHistoryKeydown", () => {
  it("ArrowUp on empty input recalls previous entry", () => {
    const h = new InputHistory("test-key");
    h.add("recalled");
    const pane = createPane();
    pane.messageInput.value = "";

    const e = keyEvent("ArrowUp");
    const consumed = handleHistoryKeydown(e, pane, h);

    expect(consumed).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(pane.messageInput.value).toBe("recalled");
  });

  it("ArrowUp on non-empty input is NOT consumed", () => {
    const h = new InputHistory("test-key");
    h.add("entry");
    const pane = createPane();
    pane.messageInput.value = "some text";

    const e = keyEvent("ArrowUp");
    const consumed = handleHistoryKeydown(e, pane, h);

    expect(consumed).toBe(false);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(pane.messageInput.value).toBe("some text");
  });

  it("ArrowUp with empty history does nothing but is consumed", () => {
    const h = new InputHistory("test-key");
    const pane = createPane();
    pane.messageInput.value = "";

    const e = keyEvent("ArrowUp");
    const consumed = handleHistoryKeydown(e, pane, h);

    expect(consumed).toBe(true);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(pane.messageInput.value).toBe("");
  });

  it("ArrowDown during navigation moves forward", () => {
    const h = new InputHistory("test-key");
    h.add("a");
    h.add("b");
    const pane = createPane();
    pane.messageInput.value = "";

    // Navigate back twice
    handleHistoryKeydown(keyEvent("ArrowUp"), pane, h);
    handleHistoryKeydown(keyEvent("ArrowUp"), pane, h);
    expect(pane.messageInput.value).toBe("a");

    // Navigate forward
    const e = keyEvent("ArrowDown");
    const consumed = handleHistoryKeydown(e, pane, h);
    expect(consumed).toBe(true);
    expect(pane.messageInput.value).toBe("b");
  });

  it("ArrowDown when not navigating is NOT consumed", () => {
    const h = new InputHistory("test-key");
    const pane = createPane();
    pane.messageInput.value = "";

    const e = keyEvent("ArrowDown");
    const consumed = handleHistoryKeydown(e, pane, h);

    expect(consumed).toBe(false);
  });

  it("ArrowDown past newest restores empty draft", () => {
    const h = new InputHistory("test-key");
    h.add("entry");
    const pane = createPane();
    pane.messageInput.value = "";

    handleHistoryKeydown(keyEvent("ArrowUp"), pane, h);
    expect(pane.messageInput.value).toBe("entry");

    handleHistoryKeydown(keyEvent("ArrowDown"), pane, h);
    expect(pane.messageInput.value).toBe("");
  });

  it("ArrowUp on non-empty input does NOT trigger (design: empty-only)", () => {
    const h = new InputHistory("test-key");
    h.add("entry");
    const pane = createPane();
    pane.messageInput.value = "user typing";

    const e = keyEvent("ArrowUp");
    const consumed = handleHistoryKeydown(e, pane, h);
    expect(consumed).toBe(false);
    expect(pane.messageInput.value).toBe("user typing");
  });

  it("Escape during navigation restores draft", () => {
    const h = new InputHistory("test-key");
    h.add("entry");
    const pane = createPane();
    pane.messageInput.value = "";

    handleHistoryKeydown(keyEvent("ArrowUp"), pane, h);
    expect(pane.messageInput.value).toBe("entry");

    const e = keyEvent("Escape");
    const consumed = handleHistoryKeydown(e, pane, h);
    expect(consumed).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(pane.messageInput.value).toBe("");
    expect(h.isNavigating).toBe(false);
  });

  it("Escape when not navigating is NOT consumed", () => {
    const h = new InputHistory("test-key");
    const pane = createPane();

    const e = keyEvent("Escape");
    const consumed = handleHistoryKeydown(e, pane, h);

    expect(consumed).toBe(false);
  });

  it("unrelated keys are NOT consumed", () => {
    const h = new InputHistory("test-key");
    h.add("entry");
    const pane = createPane();

    expect(handleHistoryKeydown(keyEvent("Enter"), pane, h)).toBe(false);
    expect(handleHistoryKeydown(keyEvent("Tab"), pane, h)).toBe(false);
    expect(handleHistoryKeydown(keyEvent("a"), pane, h)).toBe(false);
  });

  it("full navigation cycle: up → up → down → down restores empty input", () => {
    const h = new InputHistory("test-key");
    h.add("first");
    h.add("second");
    h.add("third");
    const pane = createPane();
    pane.messageInput.value = "";

    handleHistoryKeydown(keyEvent("ArrowUp"), pane, h);
    expect(pane.messageInput.value).toBe("third");

    handleHistoryKeydown(keyEvent("ArrowUp"), pane, h);
    expect(pane.messageInput.value).toBe("second");

    handleHistoryKeydown(keyEvent("ArrowDown"), pane, h);
    expect(pane.messageInput.value).toBe("third");

    handleHistoryKeydown(keyEvent("ArrowDown"), pane, h);
    expect(pane.messageInput.value).toBe("");
    expect(h.isNavigating).toBe(false);
  });
});

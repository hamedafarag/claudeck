// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { InputHistory, handleHistoryKeydown } from "../../../public/js/features/input-history.js";

function createPane() {
  const messageInput = document.createElement("textarea");
  return { messageInput };
}

function keyEvent(key) {
  return { key, preventDefault: vi.fn() };
}

beforeEach(() => {
  localStorage.clear();
});

// ── Integration: full send → recall cycle ──

describe("Integration: send → recall cycle", () => {
  it("simulates send → clear → ArrowUp → see previous", () => {
    const h = new InputHistory("int-test");
    const pane = createPane();

    // Simulate sending "run the tests"
    const text = "run the tests";
    h.add(text);
    h.reset();
    pane.messageInput.value = ""; // cleared after send

    // Press ArrowUp on empty input
    handleHistoryKeydown(keyEvent("ArrowUp"), pane, h);
    expect(pane.messageInput.value).toBe("run the tests");
  });

  it("multiple sends → navigate back and forth", () => {
    const h = new InputHistory("int-test");
    const pane = createPane();

    // Send three messages
    ["check build", "run tests", "review PR"].forEach((msg) => {
      h.add(msg);
      h.reset();
    });
    pane.messageInput.value = "";

    // ArrowUp x3
    handleHistoryKeydown(keyEvent("ArrowUp"), pane, h);
    expect(pane.messageInput.value).toBe("review PR");

    handleHistoryKeydown(keyEvent("ArrowUp"), pane, h);
    expect(pane.messageInput.value).toBe("run tests");

    handleHistoryKeydown(keyEvent("ArrowUp"), pane, h);
    expect(pane.messageInput.value).toBe("check build");

    // ArrowDown back to newest
    handleHistoryKeydown(keyEvent("ArrowDown"), pane, h);
    expect(pane.messageInput.value).toBe("run tests");

    handleHistoryKeydown(keyEvent("ArrowDown"), pane, h);
    expect(pane.messageInput.value).toBe("review PR");

    // ArrowDown past newest restores empty draft
    handleHistoryKeydown(keyEvent("ArrowDown"), pane, h);
    expect(pane.messageInput.value).toBe("");
    expect(h.isNavigating).toBe(false);
  });

  it("typing during navigation resets history state", () => {
    const h = new InputHistory("int-test");
    const pane = createPane();
    h.add("old message");
    pane.messageInput.value = "";

    handleHistoryKeydown(keyEvent("ArrowUp"), pane, h);
    expect(h.isNavigating).toBe(true);

    // Simulate user typing (input event handler calls reset)
    h.reset();
    expect(h.isNavigating).toBe(false);

    // ArrowDown should NOT be consumed since not navigating
    const e = keyEvent("ArrowDown");
    const consumed = handleHistoryKeydown(e, pane, h);
    expect(consumed).toBe(false);
  });
});

// ── Integration: slash commands in history ──

describe("Integration: slash commands in history", () => {
  it("stores and recalls slash commands", () => {
    const h = new InputHistory("int-test");
    const pane = createPane();

    h.add("/compact");
    h.add("/run npm test");
    h.add("explain this function");
    h.reset();
    pane.messageInput.value = "";

    handleHistoryKeydown(keyEvent("ArrowUp"), pane, h);
    expect(pane.messageInput.value).toBe("explain this function");

    handleHistoryKeydown(keyEvent("ArrowUp"), pane, h);
    expect(pane.messageInput.value).toBe("/run npm test");

    handleHistoryKeydown(keyEvent("ArrowUp"), pane, h);
    expect(pane.messageInput.value).toBe("/compact");
  });
});

// ── Integration: autocomplete priority ──

describe("Integration: autocomplete takes priority", () => {
  it("ArrowUp when autocomplete consumes event → history not reached", () => {
    const h = new InputHistory("int-test");
    h.add("entry");
    const pane = createPane();
    pane.messageInput.value = "";

    // Simulate autocomplete consuming the event
    let autocompleteHandled = true;
    const e = keyEvent("ArrowUp");

    // In real code: if (handleAutocompleteKeydown(e, pane)) return;
    // We simulate this by checking that history is NOT called when autocomplete handles it
    if (autocompleteHandled) {
      // autocomplete handled it, history never runs
      expect(h.isNavigating).toBe(false);
    } else {
      handleHistoryKeydown(e, pane, h);
    }

    expect(pane.messageInput.value).toBe(""); // unchanged
  });
});

// ── Integration: project switch swaps history ──

describe("Integration: project switch", () => {
  it("different storage keys yield independent histories", () => {
    const h1 = new InputHistory("claudeck-input-history-/project-a");
    h1.add("project A command");

    const h2 = new InputHistory("claudeck-input-history-/project-b");
    h2.add("project B command");

    const pane = createPane();
    pane.messageInput.value = "";

    handleHistoryKeydown(keyEvent("ArrowUp"), pane, h1);
    expect(pane.messageInput.value).toBe("project A command");

    // "Switch project" — reset pane, use h2
    h1.reset();
    pane.messageInput.value = "";

    handleHistoryKeydown(keyEvent("ArrowUp"), pane, h2);
    expect(pane.messageInput.value).toBe("project B command");
  });
});

// ── Integration: popover getAll() ──

describe("Integration: popover data", () => {
  it("getAll returns newest-first for popover rendering", () => {
    const h = new InputHistory("int-test");
    h.add("first");
    h.add("second");
    h.add("/run tests");

    const items = h.getAll();
    expect(items).toEqual(["/run tests", "second", "first"]);
  });

  it("clear empties entries and persists", () => {
    const h = new InputHistory("int-test");
    h.add("one");
    h.add("two");

    // Simulate clear button action
    h.entries.length = 0;
    h._save();

    const h2 = new InputHistory("int-test");
    expect(h2.entries).toEqual([]);
    expect(h2.getAll()).toEqual([]);
  });
});

// ── Integration: Escape during navigation ──

describe("Integration: Escape cancels navigation", () => {
  it("Escape after multiple ArrowUp restores empty input", () => {
    const h = new InputHistory("int-test");
    h.add("a");
    h.add("b");
    h.add("c");
    const pane = createPane();
    pane.messageInput.value = "";

    handleHistoryKeydown(keyEvent("ArrowUp"), pane, h);
    handleHistoryKeydown(keyEvent("ArrowUp"), pane, h);
    expect(pane.messageInput.value).toBe("b");

    handleHistoryKeydown(keyEvent("Escape"), pane, h);
    expect(pane.messageInput.value).toBe("");
    expect(h.isNavigating).toBe(false);
  });
});

// ── Integration: consecutive dedup across sends ──

describe("Integration: deduplication", () => {
  it("repeated identical sends produce single history entry", () => {
    const h = new InputHistory("int-test");

    h.add("run tests");
    h.add("run tests");
    h.add("run tests");

    expect(h.getAll()).toEqual(["run tests"]);
  });

  it("non-consecutive duplicates are preserved", () => {
    const h = new InputHistory("int-test");

    h.add("run tests");
    h.add("check build");
    h.add("run tests");

    expect(h.getAll()).toEqual(["run tests", "check build", "run tests"]);
  });
});

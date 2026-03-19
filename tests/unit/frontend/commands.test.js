// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../public/js/core/utils.js", () => ({
  escapeHtml: (s) => {
    // Minimal escaping for tests
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
}));

vi.mock("../../../public/js/core/constants.js", () => ({
  AUTOCOMPLETE_LIMIT: 20,
}));

import {
  commandRegistry,
  registerCommand,
  handleSlashAutocomplete,
  dismissAutocomplete,
  handleAutocompleteKeydown,
} from "../../../public/js/ui/commands.js";

function createPane() {
  const messageInput = document.createElement("input");
  const autocompleteEl = document.createElement("div");
  autocompleteEl.classList.add("hidden");
  return {
    messageInput,
    autocompleteEl,
    _autocompleteIndex: -1,
  };
}

beforeEach(() => {
  // Clear registry between tests
  for (const key of Object.keys(commandRegistry)) {
    delete commandRegistry[key];
  }
});

describe("registerCommand", () => {
  it("adds a command to the registry", () => {
    registerCommand("test", { description: "A test command", category: "app" });
    expect(commandRegistry.test).toBeDefined();
    expect(commandRegistry.test.description).toBe("A test command");
    expect(commandRegistry.test.category).toBe("app");
  });

  it("overwrites an existing command with the same name", () => {
    registerCommand("foo", { description: "first", category: "app" });
    registerCommand("foo", { description: "second", category: "cli" });
    expect(commandRegistry.foo.description).toBe("second");
    expect(commandRegistry.foo.category).toBe("cli");
  });
});

describe("handleSlashAutocomplete", () => {
  it("shows autocomplete for '/' prefix matching commands", () => {
    registerCommand("help", { description: "Show help", category: "app" });
    registerCommand("history", { description: "Show history", category: "app" });

    const pane = createPane();
    pane.messageInput.value = "/h";
    handleSlashAutocomplete(pane);

    expect(pane.autocompleteEl.classList.contains("hidden")).toBe(false);
    const items = pane.autocompleteEl.querySelectorAll(".slash-autocomplete-item");
    expect(items.length).toBe(2);
  });

  it("hides autocomplete for non-slash text", () => {
    registerCommand("help", { description: "Show help", category: "app" });

    const pane = createPane();
    pane.messageInput.value = "hello";
    handleSlashAutocomplete(pane);

    expect(pane.autocompleteEl.classList.contains("hidden")).toBe(true);
  });

  it("hides autocomplete when text contains a space", () => {
    registerCommand("help", { description: "Show help", category: "app" });

    const pane = createPane();
    pane.messageInput.value = "/help now";
    handleSlashAutocomplete(pane);

    expect(pane.autocompleteEl.classList.contains("hidden")).toBe(true);
  });

  it("hides autocomplete when no commands match", () => {
    registerCommand("help", { description: "Show help", category: "app" });

    const pane = createPane();
    pane.messageInput.value = "/xyz";
    handleSlashAutocomplete(pane);

    expect(pane.autocompleteEl.classList.contains("hidden")).toBe(true);
  });

  it("marks first item as active", () => {
    registerCommand("help", { description: "Show help", category: "app" });

    const pane = createPane();
    pane.messageInput.value = "/";
    handleSlashAutocomplete(pane);

    const items = pane.autocompleteEl.querySelectorAll(".slash-autocomplete-item");
    expect(items[0].classList.contains("active")).toBe(true);
    expect(pane._autocompleteIndex).toBe(0);
  });

  it("sets command name and category in rendered items", () => {
    registerCommand("deploy", { description: "Deploy app", category: "cli" });

    const pane = createPane();
    pane.messageInput.value = "/d";
    handleSlashAutocomplete(pane);

    const items = pane.autocompleteEl.querySelectorAll(".slash-autocomplete-item");
    expect(items.length).toBe(1);
    expect(items[0].dataset.cmd).toBe("deploy");
    expect(items[0].querySelector(".cmd-name").textContent).toContain("/deploy");
    expect(items[0].querySelector(".cmd-category").textContent).toBe("cli");
    expect(items[0].querySelector(".cmd-desc").textContent).toBe("Deploy app");
  });

  it("returns early if autocompleteEl is missing", () => {
    registerCommand("help", { description: "Show help", category: "app" });
    const pane = { messageInput: document.createElement("input"), autocompleteEl: null };
    pane.messageInput.value = "/h";
    // Should not throw
    handleSlashAutocomplete(pane);
  });

  it("sorts commands by category order then alphabetically", () => {
    registerCommand("zebra", { description: "z", category: "project" });
    registerCommand("alpha", { description: "a", category: "cli" });
    registerCommand("beta", { description: "b", category: "project" });
    registerCommand("gamma", { description: "g", category: "skill" });

    const pane = createPane();
    pane.messageInput.value = "/";
    handleSlashAutocomplete(pane);

    const items = pane.autocompleteEl.querySelectorAll(".slash-autocomplete-item");
    const order = Array.from(items).map((item) => item.dataset.cmd);
    // project (0): beta, zebra; skill (1): gamma; cli (4): alpha
    expect(order).toEqual(["beta", "zebra", "gamma", "alpha"]);
  });

  it("limits results to AUTOCOMPLETE_LIMIT", () => {
    for (let i = 0; i < 25; i++) {
      registerCommand(`cmd${String(i).padStart(2, "0")}`, {
        description: `Cmd ${i}`,
        category: "app",
      });
    }

    const pane = createPane();
    pane.messageInput.value = "/";
    handleSlashAutocomplete(pane);

    const items = pane.autocompleteEl.querySelectorAll(".slash-autocomplete-item");
    expect(items.length).toBe(20);
  });

  it("mousedown on item sets input value and dismisses", () => {
    registerCommand("help", { description: "Show help", category: "app" });

    const pane = createPane();
    pane.messageInput.value = "/h";
    handleSlashAutocomplete(pane);

    const item = pane.autocompleteEl.querySelector(".slash-autocomplete-item");
    const event = new MouseEvent("mousedown", { bubbles: true });
    event.preventDefault = vi.fn();
    item.dispatchEvent(event);

    expect(pane.messageInput.value).toBe("/help");
    expect(pane.autocompleteEl.classList.contains("hidden")).toBe(true);
  });

  it("mousedown on 'run' command adds trailing space (needsArgs)", () => {
    registerCommand("run", { description: "Run a cmd", category: "cli" });

    const pane = createPane();
    pane.messageInput.value = "/r";
    handleSlashAutocomplete(pane);

    const item = pane.autocompleteEl.querySelector(".slash-autocomplete-item");
    item.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(pane.messageInput.value).toBe("/run ");
  });

  it("mousedown on command with needsArgs adds trailing space", () => {
    registerCommand("search", { description: "Search", category: "app", needsArgs: true });

    const pane = createPane();
    pane.messageInput.value = "/s";
    handleSlashAutocomplete(pane);

    const item = pane.autocompleteEl.querySelector(".slash-autocomplete-item");
    item.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(pane.messageInput.value).toBe("/search ");
  });
});

describe("dismissAutocomplete", () => {
  it("hides the autocomplete element and clears innerHTML", () => {
    const pane = createPane();
    pane.autocompleteEl.classList.remove("hidden");
    pane.autocompleteEl.innerHTML = "<div>item</div>";
    pane._autocompleteIndex = 3;

    dismissAutocomplete(pane);

    expect(pane.autocompleteEl.classList.contains("hidden")).toBe(true);
    expect(pane.autocompleteEl.innerHTML).toBe("");
    expect(pane._autocompleteIndex).toBe(-1);
  });

  it("does not throw if autocompleteEl is null", () => {
    const pane = { autocompleteEl: null, _autocompleteIndex: 0 };
    dismissAutocomplete(pane);
    // Should not throw
  });
});

describe("handleAutocompleteKeydown", () => {
  function setupPane(commandCount = 3) {
    for (let i = 0; i < commandCount; i++) {
      registerCommand(`cmd${i}`, { description: `Cmd ${i}`, category: "app" });
    }
    const pane = createPane();
    pane.messageInput.value = "/";
    handleSlashAutocomplete(pane);
    return pane;
  }

  it("returns false if autocomplete is hidden", () => {
    const pane = createPane();
    pane.autocompleteEl.classList.add("hidden");
    const e = new KeyboardEvent("keydown", { key: "ArrowDown" });
    expect(handleAutocompleteKeydown(e, pane)).toBe(false);
  });

  it("returns false if autocompleteEl is null", () => {
    const pane = { autocompleteEl: null, _autocompleteIndex: -1 };
    const e = new KeyboardEvent("keydown", { key: "ArrowDown" });
    expect(handleAutocompleteKeydown(e, pane)).toBe(false);
  });

  it("returns false if there are no items", () => {
    const pane = createPane();
    pane.autocompleteEl.classList.remove("hidden"); // visible but empty
    const e = new KeyboardEvent("keydown", { key: "ArrowDown" });
    expect(handleAutocompleteKeydown(e, pane)).toBe(false);
  });

  it("ArrowDown moves selection down", () => {
    const pane = setupPane();
    expect(pane._autocompleteIndex).toBe(0);

    const e = { key: "ArrowDown", preventDefault: vi.fn() };
    const result = handleAutocompleteKeydown(e, pane);

    expect(result).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(pane._autocompleteIndex).toBe(1);

    const items = pane.autocompleteEl.querySelectorAll(".slash-autocomplete-item");
    expect(items[0].classList.contains("active")).toBe(false);
    expect(items[1].classList.contains("active")).toBe(true);
  });

  it("ArrowDown does not go past last item", () => {
    const pane = setupPane(2);
    pane._autocompleteIndex = 1;

    const e = { key: "ArrowDown", preventDefault: vi.fn() };
    handleAutocompleteKeydown(e, pane);

    expect(pane._autocompleteIndex).toBe(1);
  });

  it("ArrowUp moves selection up", () => {
    const pane = setupPane();
    pane._autocompleteIndex = 2;

    const e = { key: "ArrowUp", preventDefault: vi.fn() };
    const result = handleAutocompleteKeydown(e, pane);

    expect(result).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(pane._autocompleteIndex).toBe(1);
  });

  it("ArrowUp does not go below 0", () => {
    const pane = setupPane();
    pane._autocompleteIndex = 0;

    const e = { key: "ArrowUp", preventDefault: vi.fn() };
    handleAutocompleteKeydown(e, pane);

    expect(pane._autocompleteIndex).toBe(0);
  });

  it("Tab selects active item and dismisses", () => {
    const pane = setupPane();
    pane._autocompleteIndex = 0;

    const e = { key: "Tab", preventDefault: vi.fn() };
    const result = handleAutocompleteKeydown(e, pane);

    expect(result).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(pane.messageInput.value).toBe("/cmd0");
    expect(pane.autocompleteEl.classList.contains("hidden")).toBe(true);
  });

  it("Enter selects active item and dismisses", () => {
    const pane = setupPane();
    pane._autocompleteIndex = 1;

    const e = { key: "Enter", preventDefault: vi.fn() };
    const result = handleAutocompleteKeydown(e, pane);

    expect(result).toBe(true);
    expect(pane.messageInput.value).toBe("/cmd1");
    expect(pane.autocompleteEl.classList.contains("hidden")).toBe(true);
  });

  it("Enter does not select when _autocompleteIndex is -1", () => {
    const pane = setupPane();
    pane._autocompleteIndex = -1;

    const e = { key: "Enter", preventDefault: vi.fn() };
    const result = handleAutocompleteKeydown(e, pane);

    // The condition is (e.key === "Enter" && pane._autocompleteIndex >= 0) — so should not match
    expect(result).toBe(false);
  });

  it("Escape dismisses autocomplete", () => {
    const pane = setupPane();

    const e = { key: "Escape", preventDefault: vi.fn() };
    const result = handleAutocompleteKeydown(e, pane);

    expect(result).toBe(true);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(pane.autocompleteEl.classList.contains("hidden")).toBe(true);
  });

  it("other keys return false", () => {
    const pane = setupPane();

    const e = { key: "a", preventDefault: vi.fn() };
    const result = handleAutocompleteKeydown(e, pane);

    expect(result).toBe(false);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("Tab on 'run' command adds trailing space", () => {
    registerCommand("run", { description: "Run cmd", category: "cli" });
    const pane = createPane();
    pane.messageInput.value = "/r";
    handleSlashAutocomplete(pane);

    // find the "run" item index
    const items = pane.autocompleteEl.querySelectorAll(".slash-autocomplete-item");
    let runIndex = -1;
    items.forEach((item, i) => {
      if (item.dataset.cmd === "run") runIndex = i;
    });
    pane._autocompleteIndex = runIndex;

    const e = { key: "Tab", preventDefault: vi.fn() };
    handleAutocompleteKeydown(e, pane);

    expect(pane.messageInput.value).toBe("/run ");
  });

  it("Tab on command with needsArgs adds trailing space", () => {
    registerCommand("search", { description: "Search", category: "app", needsArgs: true });
    const pane = createPane();
    pane.messageInput.value = "/s";
    handleSlashAutocomplete(pane);

    pane._autocompleteIndex = 0;
    const e = { key: "Tab", preventDefault: vi.fn() };
    handleAutocompleteKeydown(e, pane);

    expect(pane.messageInput.value).toBe("/search ");
  });
});

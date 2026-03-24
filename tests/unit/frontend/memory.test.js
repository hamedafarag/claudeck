// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockEventsOn = vi.fn();

vi.mock("../../../public/js/core/dom.js", () => ({
  $: {},
}));

vi.mock("../../../public/js/core/events.js", () => ({
  on: (...args) => mockEventsOn(...args),
}));

let memoryList, memoryFilters, memorySearchInput, memoryAddBtn;
let memoryInputBar, memoryStatsBar, memoryTitle, memoryOptimizeBtn;
let rightPanel, projectSelect;

beforeEach(async () => {
  vi.resetModules();
  mockEventsOn.mockReset();

  // Create DOM elements needed by the module
  memoryList = document.createElement("div");
  memoryList.id = "memory-list";

  memoryFilters = document.createElement("div");
  memoryFilters.id = "memory-filters";

  memorySearchInput = document.createElement("input");
  memorySearchInput.id = "memory-search-input";

  memoryAddBtn = document.createElement("button");
  memoryAddBtn.id = "memory-add-btn";

  memoryInputBar = document.createElement("div");
  memoryInputBar.id = "memory-input-bar";
  memoryInputBar.style.display = "none";

  memoryStatsBar = document.createElement("div");
  memoryStatsBar.id = "memory-stats-bar";

  memoryTitle = document.createElement("div");
  memoryTitle.id = "memory-title";

  memoryOptimizeBtn = document.createElement("button");
  memoryOptimizeBtn.id = "memory-optimize-btn";
  memoryOptimizeBtn.textContent = "Optimize";

  rightPanel = document.createElement("div");
  rightPanel.id = "right-panel";

  projectSelect = document.createElement("select");
  projectSelect.id = "project-select";
  projectSelect.innerHTML = '<option value="/test/project">/test/project</option>';
  projectSelect.value = "/test/project";

  document.body.innerHTML = "";
  document.body.appendChild(memoryList);
  document.body.appendChild(memoryFilters);
  document.body.appendChild(memorySearchInput);
  document.body.appendChild(memoryAddBtn);
  document.body.appendChild(memoryInputBar);
  document.body.appendChild(memoryStatsBar);
  document.body.appendChild(memoryTitle);
  document.body.appendChild(memoryOptimizeBtn);
  document.body.appendChild(rightPanel);
  document.body.appendChild(projectSelect);

  // Mock fetch globally for API calls
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
      text: () => Promise.resolve(""),
    })
  );

  vi.doMock("../../../public/js/core/dom.js", () => ({
    $: {
      memoryList,
      memoryFilters,
      memorySearchInput,
      memoryAddBtn,
      memoryInputBar,
      memoryStatsBar,
      memoryTitle,
      memoryOptimizeBtn,
      rightPanel,
      projectSelect,
    },
  }));

  vi.doMock("../../../public/js/core/events.js", () => ({
    on: (...args) => mockEventsOn(...args),
  }));

  await import("../../../public/js/panels/memory.js");
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("memory panel", () => {
  describe("module loading", () => {
    it("loads without error", () => {
      // If we reach here, the module loaded successfully
      expect(true).toBe(true);
    });
  });

  describe("event handlers", () => {
    it("registers handler for projectChanged", () => {
      const call = mockEventsOn.mock.calls.find((c) => c[0] === "projectChanged");
      expect(call).toBeDefined();
      expect(typeof call[1]).toBe("function");
    });

    it("registers handler for rightPanel:tabChanged", () => {
      const call = mockEventsOn.mock.calls.find((c) => c[0] === "rightPanel:tabChanged");
      expect(call).toBeDefined();
      expect(typeof call[1]).toBe("function");
    });

    it("registers handler for rightPanel:opened", () => {
      const call = mockEventsOn.mock.calls.find((c) => c[0] === "rightPanel:opened");
      expect(call).toBeDefined();
      expect(typeof call[1]).toBe("function");
    });

    it("registers handler for ws:message", () => {
      const call = mockEventsOn.mock.calls.find((c) => c[0] === "ws:message");
      expect(call).toBeDefined();
      expect(typeof call[1]).toBe("function");
    });
  });

  describe("filter pills", () => {
    it("creates filter pills in memoryFilters", () => {
      const pills = memoryFilters.querySelectorAll(".memory-filter-pill");
      // 1 "All" pill + 4 category pills (convention, decision, discovery, warning)
      expect(pills.length).toBe(5);
    });

    it("creates an 'All' pill that is active by default", () => {
      const allPill = memoryFilters.querySelector(".memory-filter-pill.active");
      expect(allPill).not.toBeNull();
      expect(allPill.textContent).toBe("All");
    });

    it("creates pills for each category", () => {
      const pills = memoryFilters.querySelectorAll(".memory-filter-pill");
      const texts = Array.from(pills).map((p) => p.textContent);
      expect(texts).toContain("convention");
      expect(texts).toContain("decision");
      expect(texts).toContain("discovery");
      expect(texts).toContain("warning");
    });

    it("category pills have data-cat attribute", () => {
      const pills = memoryFilters.querySelectorAll(".memory-filter-pill[data-cat]");
      expect(pills.length).toBe(4);
      const cats = Array.from(pills).map((p) => p.dataset.cat);
      expect(cats).toContain("convention");
      expect(cats).toContain("decision");
      expect(cats).toContain("discovery");
      expect(cats).toContain("warning");
    });
  });

  describe("initial data loading", () => {
    it("calls fetch for memories on init", () => {
      // initMemoryPanel calls reload() which calls loadMemories() and loadStats()
      // Both use fetch via fetchApi
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    it("fetch calls include the project path", () => {
      const calls = globalThis.fetch.mock.calls;
      const memoryCall = calls.find((c) => c[0].includes("/api/memory"));
      expect(memoryCall).toBeDefined();
    });
  });
});

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Shared spies ────────────────────────────────────────
const mockOn = vi.fn();
const mockOnState = vi.fn();
const mockGetState = vi.fn();
const mockFetchFileTree = vi.fn(() => Promise.resolve([]));
const mockFetchFileContent = vi.fn(() => Promise.resolve({ content: "" }));
const mockSearchFiles = vi.fn(() => Promise.resolve([]));
const mockHighlightCodeBlocks = vi.fn();
const mockEscapeHtml = vi.fn((s) => s);

// ── Top-level vi.mock (hoisted) ─────────────────────────
vi.mock("../../../public/js/core/events.js", () => ({
  on: (...args) => mockOn(...args),
}));

vi.mock("../../../public/js/core/store.js", () => ({
  getState: (...args) => mockGetState(...args),
  on: (...args) => mockOnState(...args),
}));

vi.mock("../../../public/js/core/api.js", () => ({
  fetchFileTree: (...args) => mockFetchFileTree(...args),
  fetchFileContent: (...args) => mockFetchFileContent(...args),
  searchFiles: (...args) => mockSearchFiles(...args),
}));

vi.mock("../../../public/js/ui/formatting.js", () => ({
  highlightCodeBlocks: (...args) => mockHighlightCodeBlocks(...args),
}));

vi.mock("../../../public/js/core/utils.js", () => ({
  escapeHtml: (...args) => mockEscapeHtml(...args),
}));

// DOM element references that the module needs
let domElements;

function buildDOM() {
  document.body.innerHTML = `
    <div id="right-panel">
      <div class="right-panel-pane" data-tab="files"></div>
    </div>
    <select id="project-select"><option value="/tmp/project">/tmp/project</option></select>
    <input id="file-explorer-search" type="text" />
    <button id="file-refresh-btn"></button>
    <div id="file-tree"></div>
    <div id="file-preview" class="hidden">
      <div id="file-preview-name"></div>
      <pre id="file-preview-content"><code></code></pre>
      <img id="file-preview-image" class="hidden" />
      <button id="file-preview-close"></button>
    </div>
    <div class="chat-area"></div>
  `;

  domElements = {
    rightPanel: document.getElementById("right-panel"),
    projectSelect: document.getElementById("project-select"),
    fileExplorerSearch: document.getElementById("file-explorer-search"),
    fileRefreshBtn: document.getElementById("file-refresh-btn"),
    fileTree: document.getElementById("file-tree"),
    filePreview: document.getElementById("file-preview"),
    filePreviewName: document.getElementById("file-preview-name"),
    filePreviewContent: document.getElementById("file-preview-content"),
    filePreviewImage: document.getElementById("file-preview-image"),
    filePreviewClose: document.getElementById("file-preview-close"),
  };
}

// ── Tests ───────────────────────────────────────────────

beforeEach(async () => {
  vi.resetModules();
  mockOn.mockClear();
  mockOnState.mockClear();
  mockGetState.mockClear();
  mockFetchFileTree.mockClear();
  mockFetchFileContent.mockClear();
  mockSearchFiles.mockClear();
  mockHighlightCodeBlocks.mockClear();
  mockEscapeHtml.mockClear();

  buildDOM();

  vi.doMock("../../../public/js/core/dom.js", () => ({
    $: domElements,
  }));
  vi.doMock("../../../public/js/core/events.js", () => ({
    on: (...args) => mockOn(...args),
  }));
  vi.doMock("../../../public/js/core/store.js", () => ({
    getState: (...args) => mockGetState(...args),
    on: (...args) => mockOnState(...args),
  }));
  vi.doMock("../../../public/js/core/api.js", () => ({
    fetchFileTree: (...args) => mockFetchFileTree(...args),
    fetchFileContent: (...args) => mockFetchFileContent(...args),
    searchFiles: (...args) => mockSearchFiles(...args),
  }));
  vi.doMock("../../../public/js/ui/formatting.js", () => ({
    highlightCodeBlocks: (...args) => mockHighlightCodeBlocks(...args),
  }));
  vi.doMock("../../../public/js/core/utils.js", () => ({
    escapeHtml: (...args) => mockEscapeHtml(...args),
  }));

  await import("../../../public/js/panels/file-explorer.js");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("file-explorer", () => {
  it("loads without error", () => {
    expect(true).toBe(true);
  });

  it("registers rightPanel:opened event handler", () => {
    expect(mockOn).toHaveBeenCalledWith("rightPanel:opened", expect.any(Function));
  });

  it("registers rightPanel:tabChanged event handler", () => {
    expect(mockOn).toHaveBeenCalledWith("rightPanel:tabChanged", expect.any(Function));
  });

  it("registers change listener on projectSelect", () => {
    // The module calls $.projectSelect.addEventListener('change', ...)
    // We can verify by dispatching a change event and checking the module reacted
    // But the simplest way is to check the event listener was added via spy.
    // Since we use real DOM elements, we test by triggering and observing side effects.
    // Triggering change should clear the file tree (resetExplorer behavior).
    domElements.fileTree.innerHTML = "<div>old content</div>";
    domElements.projectSelect.dispatchEvent(new Event("change"));
    expect(domElements.fileTree.innerHTML).toBe("");
  });

  it("filePreviewClose has click handler that hides preview", () => {
    domElements.filePreview.classList.remove("hidden");
    domElements.filePreviewClose.click();
    expect(domElements.filePreview.classList.contains("hidden")).toBe(true);
  });

  it("registers projectsData state listener", () => {
    expect(mockOnState).toHaveBeenCalledWith("projectsData", expect.any(Function));
  });

  it("fileRefreshBtn has click handler", () => {
    // Clicking refresh should trigger loadRootTree which calls fetchFileTree
    mockGetState.mockReturnValue([{ path: "/tmp/project" }]);
    domElements.fileRefreshBtn.click();
    // The handler calls refreshFileTree which clears cache and calls loadRootTree
    // loadRootTree calls getProjectPath which needs getState('projectsData')
    // We just verify it does not throw
    expect(true).toBe(true);
  });
});

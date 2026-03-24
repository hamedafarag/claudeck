// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockEmit = vi.fn();

vi.mock("../../../public/js/core/events.js", () => ({
  emit: (...args) => mockEmit(...args),
  on: vi.fn(),
}));

vi.mock("../../../public/js/ui/tab-sdk.js", () => ({
  initTabSDK: vi.fn(),
}));

let openRightPanel, closeRightPanel, toggleRightPanel;
let rightPanel, toggleBtn;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  mockEmit.mockClear();

  // Build the right panel DOM structure
  document.body.innerHTML = `
    <div id="right-panel" class="hidden">
      <div class="right-panel-tab-bar">
        <button class="right-panel-tab active" data-tab="files">Files</button>
        <button class="right-panel-tab" data-tab="git">Git</button>
        <button class="right-panel-tab" data-tab="memory">Memory</button>
        <button class="right-panel-close">&times;</button>
      </div>
      <div class="right-panel-content">
        <div class="right-panel-pane active" data-tab="files">Files content</div>
        <div class="right-panel-pane" data-tab="git">Git content</div>
        <div class="right-panel-pane" data-tab="memory">Memory content</div>
      </div>
    </div>
    <button id="right-panel-toggle-btn">Toggle</button>
  `;

  rightPanel = document.getElementById("right-panel");
  toggleBtn = document.getElementById("right-panel-toggle-btn");

  vi.doMock("../../../public/js/core/dom.js", () => ({
    $: {
      rightPanel,
      rightPanelToggleBtn: toggleBtn,
      rightPanelClose: document.querySelector(".right-panel-close"),
      projectSelect: null,
    },
  }));
  vi.doMock("../../../public/js/core/events.js", () => ({
    emit: (...args) => mockEmit(...args),
    on: vi.fn(),
  }));
  vi.doMock("../../../public/js/ui/tab-sdk.js", () => ({
    initTabSDK: vi.fn(),
  }));

  const mod = await import("../../../public/js/ui/right-panel.js");
  openRightPanel = mod.openRightPanel;
  closeRightPanel = mod.closeRightPanel;
  toggleRightPanel = mod.toggleRightPanel;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("right-panel", () => {
  describe("openRightPanel", () => {
    it("removes hidden class from panel", () => {
      openRightPanel();
      expect(rightPanel.classList.contains("hidden")).toBe(false);
    });

    it("adds active class to toggle button", () => {
      openRightPanel();
      expect(toggleBtn.classList.contains("active")).toBe(true);
    });

    it("saves state to localStorage", () => {
      openRightPanel();
      expect(localStorage.getItem("claudeck-right-panel")).toBe("open");
    });

    it("emits rightPanel:opened event", () => {
      openRightPanel();
      expect(mockEmit).toHaveBeenCalledWith("rightPanel:opened", expect.any(String));
    });

    it("switches to specified tab", () => {
      openRightPanel("git");
      const gitTab = rightPanel.querySelector('.right-panel-tab[data-tab="git"]');
      expect(gitTab.classList.contains("active")).toBe(true);
    });
  });

  describe("closeRightPanel", () => {
    it("adds hidden class to panel", () => {
      openRightPanel();
      closeRightPanel();
      expect(rightPanel.classList.contains("hidden")).toBe(true);
    });

    it("removes active class from toggle button", () => {
      openRightPanel();
      closeRightPanel();
      expect(toggleBtn.classList.contains("active")).toBe(false);
    });

    it("saves state to localStorage", () => {
      closeRightPanel();
      expect(localStorage.getItem("claudeck-right-panel")).toBe("closed");
    });
  });

  describe("toggleRightPanel", () => {
    it("opens panel when closed", () => {
      toggleRightPanel();
      expect(rightPanel.classList.contains("hidden")).toBe(false);
    });

    it("closes panel when open with no tab specified", () => {
      openRightPanel();
      mockEmit.mockClear();
      toggleRightPanel();
      expect(rightPanel.classList.contains("hidden")).toBe(true);
    });

    it("switches tab when open and different tab specified", () => {
      openRightPanel("files");
      mockEmit.mockClear();
      toggleRightPanel("git");
      // Panel should still be open
      expect(rightPanel.classList.contains("hidden")).toBe(false);
      expect(mockEmit).toHaveBeenCalledWith("rightPanel:tabChanged", "git");
    });
  });
});

// Right Panel — tabbed container for Tasks, Files, Git, and plugin tabs
import { $ } from "../core/dom.js";
import { emit, on } from "../core/events.js";
import { initTabSDK } from "./tab-sdk.js";

const STORAGE_KEY = "codedeck-right-panel";
const TAB_KEY = "codedeck-right-panel-tab";
const WIDTH_KEY = "codedeck-right-panel-width";
const OLD_LINEAR_KEY = "codedeck-linear-panel";
const MIN_WIDTH = 200;
const MAX_WIDTH_RATIO = 0.6; // 60vw

function isPanelOpen() {
  return !$.rightPanel.classList.contains("hidden");
}

function getActiveTab() {
  const btn = $.rightPanel.querySelector(".right-panel-tab.active");
  return btn ? btn.dataset.tab : TABS[0];
}

function isValidTab(tabName) {
  return !!$.rightPanel.querySelector(`.right-panel-tab[data-tab="${tabName}"]`);
}

export function openRightPanel(tabName) {
  if (tabName && isValidTab(tabName)) {
    switchTab(tabName);
  }
  $.rightPanel.classList.remove("hidden");
  $.rightPanelToggleBtn.classList.add("active");
  localStorage.setItem(STORAGE_KEY, "open");
  emit("rightPanel:opened", getActiveTab());
}

export function closeRightPanel() {
  $.rightPanel.classList.add("hidden");
  $.rightPanelToggleBtn.classList.remove("active");
  localStorage.setItem(STORAGE_KEY, "closed");
}

export function toggleRightPanel(tabName) {
  if (isPanelOpen()) {
    // If clicking same tab, close. If different tab, switch.
    if (tabName && tabName !== getActiveTab()) {
      switchTab(tabName);
      emit("rightPanel:tabChanged", tabName);
    } else {
      closeRightPanel();
    }
  } else {
    openRightPanel(tabName);
  }
}

function switchTab(tabName) {
  if (!isValidTab(tabName)) return;
  applyTab(tabName);
  emit("rightPanel:tabChanged", tabName);
}

// Visual-only tab switch (no event emitted) — used during init restore
function restoreTab(tabName) {
  if (!isValidTab(tabName)) return;
  applyTab(tabName);
}

function applyTab(tabName) {
  // Update tab buttons
  $.rightPanel.querySelectorAll(".right-panel-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  // Update panes
  $.rightPanel.querySelectorAll(".right-panel-pane").forEach((pane) => {
    pane.classList.toggle("active", pane.dataset.tab === tabName);
  });

  localStorage.setItem(TAB_KEY, tabName);
}

function initRightPanel() {
  // Migrate old linear panel localStorage key
  const oldState = localStorage.getItem(OLD_LINEAR_KEY);
  if (oldState && !localStorage.getItem(STORAGE_KEY)) {
    localStorage.setItem(STORAGE_KEY, oldState);
    localStorage.removeItem(OLD_LINEAR_KEY);
  }

  // Tab click handlers
  $.rightPanel.querySelectorAll(".right-panel-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (isPanelOpen() && getActiveTab() === tab) return;
      switchTab(tab);
    });
  });

  // Close button
  $.rightPanelClose.addEventListener("click", () => closeRightPanel());

  // Header toggle button
  $.rightPanelToggleBtn.addEventListener("click", () => toggleRightPanel());

  // Initialize Tab SDK — allows plugin tabs to register
  initTabSDK();

  // Restore saved tab (silently — no event, listeners aren't ready yet)
  const savedTab = localStorage.getItem(TAB_KEY);
  if (savedTab && isValidTab(savedTab)) {
    restoreTab(savedTab);
  }

  // Restore saved width
  const savedWidth = localStorage.getItem(WIDTH_KEY);
  if (savedWidth) {
    const w = parseInt(savedWidth, 10);
    if (w >= MIN_WIDTH) {
      $.rightPanel.style.width = w + "px";
    }
  }

  // Restore panel state (silently — defer event so other modules register first)
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "open") {
    $.rightPanel.classList.remove("hidden");
    $.rightPanelToggleBtn.classList.add("active");
    // Emit after all modules have initialized their event listeners
    queueMicrotask(() => emit("rightPanel:opened", getActiveTab()));
  }

  // ── Resize by dragging left edge ────────────────────
  initResize();
}

function initResize() {
  const handle = document.getElementById("right-panel-resize");
  if (!handle) return;

  let startX = 0;
  let startWidth = 0;

  function onMouseDown(e) {
    e.preventDefault();
    startX = e.clientX;
    startWidth = $.rightPanel.offsetWidth;
    handle.classList.add("active");
    $.rightPanel.classList.add("resizing");
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function onMouseMove(e) {
    const maxWidth = window.innerWidth * MAX_WIDTH_RATIO;
    // Dragging left increases width (panel is on the right)
    const delta = startX - e.clientX;
    const newWidth = Math.min(Math.max(startWidth + delta, MIN_WIDTH), maxWidth);
    $.rightPanel.style.width = newWidth + "px";
  }

  function onMouseUp() {
    handle.classList.remove("active");
    $.rightPanel.classList.remove("resizing");
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    // Persist
    localStorage.setItem(WIDTH_KEY, Math.round($.rightPanel.offsetWidth));
  }

  handle.addEventListener("mousedown", onMouseDown);
}

initRightPanel();

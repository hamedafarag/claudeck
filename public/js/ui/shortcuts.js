// Keyboard shortcuts
import { $ } from '../core/dom.js';
import { getState, setState } from '../core/store.js';
import { CHAT_IDS } from '../core/constants.js';
import { panes } from './parallel.js';
import { registerCommand } from './commands.js';
import { toggleRightPanel, openRightPanel } from './right-panel.js';
import { toggleTipsFeed } from '../panels/tips-feed.js';

function closeAllModals() {
  document.querySelectorAll(".modal-overlay:not([data-persistent])").forEach((m) => m.classList.add("hidden"));
}

document.getElementById("shortcuts-modal-close").addEventListener("click", () => {
  $.shortcutsModal.classList.add("hidden");
});
$.shortcutsModal.addEventListener("click", (e) => {
  if (e.target === $.shortcutsModal) $.shortcutsModal.classList.add("hidden");
});

document.addEventListener("keydown", (e) => {
  const isMeta = e.metaKey || e.ctrlKey;

  if (e.key === "Escape") {
    closeAllModals();
    return;
  }

  const tag = document.activeElement?.tagName;
  if (!isMeta && (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT")) return;

  if (isMeta && e.key === "k") {
    e.preventDefault();
    $.sessionSearchInput.focus();
    return;
  }

  if (isMeta && e.key === "n") {
    e.preventDefault();
    $.newSessionBtn.click();
    return;
  }

  if (isMeta && e.key === "/") {
    e.preventDefault();
    $.shortcutsModal.classList.toggle("hidden");
    return;
  }

  // Cmd+B — Toggle right panel
  if (isMeta && e.key === "b") {
    e.preventDefault();
    toggleRightPanel();
    return;
  }

  // Cmd+Shift+E — Open Files tab
  if (isMeta && e.shiftKey && e.key === "E") {
    e.preventDefault();
    openRightPanel("files");
    return;
  }

  // Cmd+Shift+G — Open Git tab
  if (isMeta && e.shiftKey && e.key === "G") {
    e.preventDefault();
    openRightPanel("git");
    return;
  }

  // Cmd+Shift+R — Open Repos tab
  if (isMeta && e.shiftKey && e.key === "R") {
    e.preventDefault();
    openRightPanel("repos");
    return;
  }

  // Cmd+Shift+V — Open Events tab
  if (isMeta && e.shiftKey && e.key === "V") {
    e.preventDefault();
    openRightPanel("events");
    return;
  }

  // Cmd+Shift+A — Go to Home (Analytics)
  if (isMeta && e.shiftKey && e.key === "A") {
    e.preventDefault();
    setState("view", "home");
    setState("sessionId", null);
    return;
  }

  // Cmd+Shift+T — Toggle Tips Feed
  if (isMeta && e.shiftKey && e.key === "T") {
    e.preventDefault();
    toggleTipsFeed();
    return;
  }

  if (isMeta && getState("parallelMode") && e.key >= "1" && e.key <= "4") {
    e.preventDefault();
    const idx = parseInt(e.key) - 1;
    const chatId = CHAT_IDS[idx];
    const pane = panes.get(chatId);
    if (pane && pane.messageInput) {
      pane.messageInput.focus();
    }
    return;
  }
});

registerCommand("shortcuts", {
  category: "app",
  description: "Show keyboard shortcuts",
  execute() {
    $.shortcutsModal.classList.remove("hidden");
  },
});

// Register /files and /git slash commands
registerCommand("files", {
  category: "app",
  description: "Open file explorer",
  execute() {
    openRightPanel("files");
  },
});

registerCommand("git", {
  category: "app",
  description: "Open git panel",
  execute() {
    openRightPanel("git");
  },
});

registerCommand("events", {
  category: "app",
  description: "Open events panel",
  execute() {
    openRightPanel("events");
  },
});

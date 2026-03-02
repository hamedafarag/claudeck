// Keyboard shortcuts
import { $ } from './dom.js';
import { getState } from './store.js';
import { CHAT_IDS } from './constants.js';
import { panes } from './parallel.js';
import { registerCommand } from './commands.js';

function closeAllModals() {
  document.querySelectorAll(".modal-overlay").forEach((m) => m.classList.add("hidden"));
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

// Background sessions — guardSwitch, toast notifications, header indicator
import { $ } from './dom.js';
import { getState, setState } from './store.js';
import { on } from './events.js';
import { panes } from './parallel.js';
import { CHAT_IDS } from './constants.js';
import { removeThinking } from './messages.js';

// ── Helpers ──

function getBackgroundSessions() {
  return getState("backgroundSessions");
}

function isAnyPaneStreaming() {
  for (const pane of panes.values()) {
    if (pane.isStreaming) return true;
  }
  return false;
}

function updateHeaderIndicator() {
  const map = getBackgroundSessions();
  const count = map.size;
  if (count > 0) {
    $.bgSessionIndicator.classList.remove("hidden");
    $.bgSessionBadge.textContent = count;
  } else {
    $.bgSessionIndicator.classList.add("hidden");
  }
}

// ── Public API ──

export function addBackgroundSession(sessionId, title, projectName, projectPath) {
  const map = getBackgroundSessions();
  map.set(sessionId, { title, projectName, projectPath, startedAt: Date.now() });
  updateHeaderIndicator();
}

export function removeBackgroundSession(sessionId) {
  const map = getBackgroundSessions();
  map.delete(sessionId);
  updateHeaderIndicator();
}

export function isBackgroundSession(sessionId) {
  return getBackgroundSessions().has(sessionId);
}

export function showCompletionToast(sessionId, title, projectPath) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "bg-toast";
  toast.innerHTML = `
    <span class="bg-toast-dot"></span>
    <div class="bg-toast-body">
      <div class="bg-toast-label">Session completed</div>
      <div class="bg-toast-title">${escapeForHtml(title)}</div>
    </div>
    <button class="bg-toast-switch" title="Switch to session">&#8594;</button>
    <button class="bg-toast-close" title="Dismiss">&times;</button>
  `;

  toast.querySelector(".bg-toast-switch").addEventListener("click", () => {
    dismissToast(toast);
    switchToSession(sessionId, projectPath);
  });

  toast.querySelector(".bg-toast-close").addEventListener("click", () => {
    dismissToast(toast);
  });

  container.appendChild(toast);
}

function escapeForHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function dismissToast(toast) {
  toast.classList.add("toast-exit");
  toast.addEventListener("animationend", () => toast.remove());
}

async function switchToSession(sessionId, projectPath) {
  const { loadMessages, loadSessions } = await import('./sessions.js');
  const { updateSystemPromptIndicator, updateHeaderProjectName, loadProjectCommands } = await import('./projects.js');

  // Restore the project dropdown if the session belongs to a different project
  if (projectPath && $.projectSelect.value !== projectPath) {
    $.projectSelect.value = projectPath;
    localStorage.setItem("shawkat-ai-cwd", projectPath);
    updateSystemPromptIndicator();
    updateHeaderProjectName();
    loadProjectCommands();
  }

  setState("sessionId", sessionId);

  if (getState("parallelMode")) {
    for (const chatId of CHAT_IDS) {
      const pane = panes.get(chatId);
      if (pane) pane.messagesDiv.innerHTML = "";
    }
  } else {
    $.messagesDiv.innerHTML = "";
  }

  await loadMessages(sessionId);
  loadSessions();
}

// ── Guard Switch ──

let pendingProceed = null;
let pendingSessionInfo = null;

export function guardSwitch(onProceed) {
  if (!isAnyPaneStreaming()) {
    onProceed();
    return;
  }

  // Snapshot current session info before the modal.
  // The dropdown value may already reflect the *new* project the user
  // selected, so read the previous project path from localStorage which
  // hasn't been updated yet (that happens inside onProceed).
  const sessionId = getState("sessionId");
  const prevPath = localStorage.getItem("shawkat-ai-cwd") || "";
  const prevOpt = [...$.projectSelect.options].find(o => o.value === prevPath);
  pendingSessionInfo = {
    sessionId,
    projectName: prevOpt?.textContent || "Session",
    projectPath: prevPath,
    title: $.sessionList.querySelector("li.active .session-title")?.textContent || prevOpt?.textContent || "Session",
  };

  pendingProceed = onProceed;
  $.bgConfirmModal.classList.remove("hidden");
}

function closeModal() {
  $.bgConfirmModal.classList.add("hidden");
  pendingProceed = null;
  pendingSessionInfo = null;
}

function cancelModal() {
  // Revert the project dropdown if the user changed it
  if (pendingSessionInfo && pendingSessionInfo.projectPath) {
    $.projectSelect.value = pendingSessionInfo.projectPath;
  }
  closeModal();
}

function initConfirmDialog() {
  // Cancel — close modal, revert dropdown
  $.bgConfirmCancel.addEventListener("click", cancelModal);
  $.bgConfirmClose.addEventListener("click", cancelModal);

  // Abort — stop generation, then proceed
  $.bgConfirmAbort.addEventListener("click", async () => {
    const { stopGeneration } = await import('./chat.js');
    const { getPane } = await import('./parallel.js');

    // Abort all streaming panes
    if (getState("parallelMode")) {
      for (const chatId of CHAT_IDS) {
        const pane = panes.get(chatId);
        if (pane && pane.isStreaming) {
          stopGeneration(pane);
          pane.isStreaming = false;
          pane.currentAssistantMsg = null;
          removeThinking(pane);
        }
      }
    } else {
      const pane = getPane(null);
      stopGeneration(pane);
      pane.isStreaming = false;
      pane.currentAssistantMsg = null;
      removeThinking(pane);
    }
    // Reset Send/Stop buttons
    if (getState("parallelMode")) {
      for (const pane of panes.values()) {
        if (pane.sendBtn) pane.sendBtn.classList.remove("hidden");
        if (pane.stopBtn) pane.stopBtn.classList.add("hidden");
      }
    } else {
      $.sendBtn.classList.remove("hidden");
      $.stopBtn.classList.add("hidden");
      $.sendBtn.disabled = false;
    }
    if ($.streamingTokens) $.streamingTokens.classList.add("hidden");

    const proceed = pendingProceed;
    closeModal();
    if (proceed) proceed();
  });

  // Continue in Background — add current session to bg map, then proceed
  $.bgConfirmBackground.addEventListener("click", () => {
    if (pendingSessionInfo && pendingSessionInfo.sessionId) {
      const { sessionId, title, projectName, projectPath } = pendingSessionInfo;
      addBackgroundSession(sessionId, title, projectName, projectPath);
    }

    // Reset streaming UI — the stream continues server-side
    // but the UI is no longer rendering it
    for (const pane of panes.values()) {
      if (pane.isStreaming) {
        pane.isStreaming = false;
        pane.currentAssistantMsg = null;
        removeThinking(pane);
      }
    }
    // Reset Send/Stop buttons and token counter
    if (getState("parallelMode")) {
      for (const pane of panes.values()) {
        if (pane.sendBtn) pane.sendBtn.classList.remove("hidden");
        if (pane.stopBtn) pane.stopBtn.classList.add("hidden");
      }
    } else {
      $.sendBtn.classList.remove("hidden");
      $.stopBtn.classList.add("hidden");
      $.sendBtn.disabled = false;
    }
    if ($.streamingTokens) $.streamingTokens.classList.add("hidden");

    const proceed = pendingProceed;
    closeModal();
    if (proceed) proceed();
  });

  // Click outside modal to cancel
  $.bgConfirmModal.addEventListener("click", (e) => {
    if (e.target === $.bgConfirmModal) cancelModal();
  });
}

// ── WS disconnect handler ──

on("ws:disconnected", () => {
  const map = getBackgroundSessions();
  for (const [sessionId, info] of map.entries()) {
    showCompletionToast(sessionId, `${info.title} (connection lost)`);
  }
  map.clear();
  updateHeaderIndicator();
});

// ── Init ──

initConfirmDialog();

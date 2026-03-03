// Session management
import { $ } from './dom.js';
import { getState, setState, on as onState } from './store.js';
import { CHAT_IDS } from './constants.js';
import { escapeHtml } from './utils.js';
import * as api from './api.js';
import { panes, enterParallelMode, exitParallelMode } from './parallel.js';
import { renderMessagesIntoPane } from './messages.js';

const SESSION_STORAGE_KEY = "shawkat-ai-session-id";

// Persist sessionId to localStorage whenever it changes
onState("sessionId", (val) => {
  if (val) {
    localStorage.setItem(SESSION_STORAGE_KEY, val);
  } else {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
});

// Restore sessionId from localStorage on module load
(function restoreSessionId() {
  const saved = localStorage.getItem(SESSION_STORAGE_KEY);
  if (saved && !getState("sessionId")) {
    setState("sessionId", saved);
  }
})();

export async function loadSessions(searchTerm) {
  try {
    const cwd = $.projectSelect.value;
    let sessions;
    if (searchTerm) {
      sessions = await api.searchSessions(searchTerm, cwd || undefined);
    } else {
      sessions = await api.fetchSessions(cwd || undefined);
    }
    renderSessions(sessions);
  } catch (err) {
    console.error("Failed to load sessions:", err);
  }
}

function renderSessions(sessions) {
  const sessionId = getState("sessionId");
  $.sessionList.innerHTML = "";
  for (const s of sessions) {
    const li = document.createElement("li");
    li.className = s.id === sessionId ? "active" : "";
    const time = s.last_used_at ? new Date(s.last_used_at * 1000).toLocaleString() : "";
    const modeBadge = s.mode === "parallel"
      ? '<span class="session-mode parallel">parallel</span>'
      : s.mode === "both"
      ? '<span class="session-mode both">single + parallel</span>'
      : '<span class="session-mode single">single</span>';
    const displayTitle = s.title || s.project_name || "Session";
    const isPinned = s.pinned === 1;
    li.innerHTML = `
      <button class="session-pin${isPinned ? " pinned" : ""}" title="${isPinned ? "Unpin" : "Pin"} session">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="${isPinned ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 17v5"/><path d="M9 2h6l-1 7h4l-5 8h-2l-5-8h4z"/>
        </svg>
      </button>
      <button class="session-delete" title="Delete session">&times;</button>
      <span class="session-title" title="${escapeHtml(displayTitle)}">${escapeHtml(displayTitle)}</span> ${modeBadge}
      <span class="session-preview">${time}</span>
    `;
    li.querySelector(".session-pin").addEventListener("click", async (e) => {
      e.stopPropagation();
      await api.toggleSessionPin(s.id);
      loadSessions($.sessionSearchInput.value.trim() || undefined);
    });
    li.querySelector(".session-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSession(s.id);
    });
    const titleSpan = li.querySelector(".session-title");
    titleSpan.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      startInlineEdit(titleSpan, s.id, displayTitle);
    });
    li.addEventListener("click", async (e) => {
      if (e.target.closest(".session-delete") || e.target.closest(".session-pin") || e.target.closest(".session-title-edit")) return;
      const { guardSwitch } = await import('./background-sessions.js');
      guardSwitch(async () => {
        setState("sessionId", s.id);
        if (s.project_path) {
          $.projectSelect.value = s.project_path;
          localStorage.setItem("shawkat-ai-cwd", s.project_path);
        }

        const parallelMode = getState("parallelMode");
        const needsParallel = s.mode === "parallel" || s.mode === "both";
        if (needsParallel && !parallelMode) {
          enterParallelMode();
        } else if (!needsParallel && parallelMode) {
          exitParallelMode();
        }

        if (getState("parallelMode")) {
          for (const chatId of CHAT_IDS) {
            const pane = panes.get(chatId);
            if (pane) pane.messagesDiv.innerHTML = "";
          }
        } else {
          $.messagesDiv.innerHTML = "";
        }
        await loadMessages(s.id);
        loadSessions();
      });
    });
    // Show blinking dot for background sessions
    const bgMap = getState("backgroundSessions");
    if (bgMap && bgMap.has(s.id)) {
      const dot = document.createElement("span");
      dot.className = "session-bg-indicator";
      li.querySelector(".session-title").after(dot);
    }

    $.sessionList.appendChild(li);
  }
}

function startInlineEdit(titleSpan, sessionIdToEdit, currentTitle) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "session-title-edit";
  input.value = currentTitle;
  titleSpan.replaceWith(input);
  input.focus();
  input.select();

  async function commitEdit() {
    const newTitle = input.value.trim();
    if (newTitle && newTitle !== currentTitle) {
      await api.updateSessionTitle(sessionIdToEdit, newTitle);
    }
    loadSessions();
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      loadSessions();
    }
  });
  input.addEventListener("blur", commitEdit);
}

export async function deleteSession(id) {
  try {
    await api.deleteSessionApi(id);
    if (id === getState("sessionId")) {
      setState("sessionId", null);
      if (getState("parallelMode")) {
        for (const chatId of CHAT_IDS) {
          const pane = panes.get(chatId);
          if (pane) pane.messagesDiv.innerHTML = "";
        }
      } else {
        $.messagesDiv.innerHTML = "";
      }
    }
    await loadSessions();
  } catch (err) {
    console.error("Failed to delete session:", err);
  }
}

export async function loadMessages(sid) {
  if (getState("parallelMode")) {
    for (const chatId of CHAT_IDS) {
      loadPaneMessages(sid, chatId);
    }
    return;
  }

  const pane = panes.get(null);
  try {
    const messages = await api.fetchSingleMessages(sid);
    renderMessagesIntoPane(messages, pane);
  } catch (err) {
    console.error("Failed to load messages:", err);
  }
}

export async function loadPaneMessages(sid, chatId) {
  const pane = panes.get(chatId);
  if (!pane) return;
  try {
    let messages = await api.fetchMessagesByChatId(sid, chatId);

    // For Chat 1 (chat-0): also load single-mode messages as fallback
    if (chatId === CHAT_IDS[0]) {
      const singleMessages = await api.fetchSingleMessages(sid);
      if (singleMessages.length > 0) {
        messages = [...singleMessages, ...messages].sort((a, b) => a.id - b.id);
      }
    }

    renderMessagesIntoPane(messages, pane);
  } catch (err) {
    console.error(`Failed to load messages for ${chatId}:`, err);
  }
}

// Session search with debounce
let searchDebounceTimer = null;
$.sessionSearchInput.addEventListener("input", () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    loadSessions($.sessionSearchInput.value.trim());
  }, 200);
});

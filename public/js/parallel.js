// Parallel mode — 2x2 chat panes
import { $ } from './dom.js';
import { getState, setState } from './store.js';
import { CHAT_IDS } from './constants.js';
import { handleAutocompleteKeydown, handleSlashAutocomplete } from './commands.js';

// Panes map — chatId -> pane state object
export const panes = new Map();

export function getPane(chatId) {
  if (!getState("parallelMode")) return panes.get(null);
  return panes.get(chatId) || panes.get(null);
}

export function initSinglePane() {
  panes.clear();
  panes.set(null, {
    chatId: null,
    messagesDiv: $.messagesDiv,
    messageInput: $.messageInput,
    sendBtn: $.sendBtn,
    stopBtn: $.stopBtn,
    isStreaming: false,
    currentAssistantMsg: null,
    autocompleteEl: document.getElementById("slash-autocomplete"),
    _autocompleteIndex: -1,
  });
}

// Initialize on load
initSinglePane();

export function createChatPane(chatId, index) {
  // Lazy import to avoid circular dependency at module parse time
  const { sendMessage, stopGeneration } = _getLazyChatFns();

  const container = document.createElement("div");
  container.className = "chat-pane";
  container.dataset.chatId = chatId;

  const header = document.createElement("div");
  header.className = "chat-pane-header";
  header.innerHTML = `
    <span class="chat-pane-label">Chat ${index + 1}</span>
    <span class="chat-pane-status">idle</span>
  `;
  container.appendChild(header);

  const msgs = document.createElement("div");
  msgs.className = "messages";
  container.appendChild(msgs);

  const inputBar = document.createElement("div");
  inputBar.className = "input-bar";

  const textarea = document.createElement("textarea");
  textarea.placeholder = `Ask Claude... (Chat ${index + 1})`;
  textarea.rows = 1;
  inputBar.appendChild(textarea);

  const paneSendBtn = document.createElement("button");
  paneSendBtn.className = "pane-send-btn";
  paneSendBtn.title = "Send";
  paneSendBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M3 10l7-7m0 0l7 7m-7-7v14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="rotate(90, 10, 10)"/></svg>`;
  inputBar.appendChild(paneSendBtn);

  const paneStopBtn = document.createElement("button");
  paneStopBtn.className = "pane-stop-btn hidden";
  paneStopBtn.title = "Stop";
  paneStopBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><rect x="4" y="4" width="12" height="12" rx="2" fill="currentColor"/></svg>`;
  inputBar.appendChild(paneStopBtn);

  const paneAutocomplete = document.createElement("div");
  paneAutocomplete.className = "slash-autocomplete hidden";
  inputBar.appendChild(paneAutocomplete);

  container.appendChild(inputBar);

  const state = {
    chatId,
    messagesDiv: msgs,
    messageInput: textarea,
    sendBtn: paneSendBtn,
    stopBtn: paneStopBtn,
    isStreaming: false,
    currentAssistantMsg: null,
    statusEl: header.querySelector(".chat-pane-status"),
    autocompleteEl: paneAutocomplete,
    _autocompleteIndex: -1,
  };

  paneSendBtn.addEventListener("click", () => sendMessage(state));
  paneStopBtn.addEventListener("click", () => stopGeneration(state));

  textarea.addEventListener("keydown", (e) => {
    if (handleAutocompleteKeydown(e, state)) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(state);
    }
  });

  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 80) + "px";
    handleSlashAutocomplete(state);
  });

  return { container, state };
}

export function enterParallelMode() {
  setState("parallelMode", true);
  $.toggleParallelBtn.checked = true;

  const chatArea = document.querySelector(".chat-area");
  setState("savedChatArea", chatArea);

  const grid = document.createElement("div");
  grid.className = "chat-grid";
  grid.id = "chat-grid";

  panes.clear();

  for (let i = 0; i < CHAT_IDS.length; i++) {
    const { container, state } = createChatPane(CHAT_IDS[i], i);
    grid.appendChild(container);
    panes.set(CHAT_IDS[i], state);
  }

  chatArea.replaceWith(grid);

  const sessionId = getState("sessionId");
  if (sessionId) {
    // Lazy import to avoid circular dependency
    import('./sessions.js').then(({ loadPaneMessages }) => {
      for (const chatId of CHAT_IDS) {
        loadPaneMessages(sessionId, chatId);
      }
    });
  }
}

export function exitParallelMode() {
  setState("parallelMode", false);
  $.toggleParallelBtn.checked = false;

  const grid = document.getElementById("chat-grid");
  const savedChatArea = getState("savedChatArea");
  if (grid && savedChatArea) {
    grid.replaceWith(savedChatArea);
  }

  initSinglePane();

  const sessionId = getState("sessionId");
  if (sessionId) {
    import('./sessions.js').then(({ loadMessages }) => {
      loadMessages(sessionId);
    });
  }
}

// Lazy getter for chat.js functions to avoid circular dependency
let _chatFns = null;
function _getLazyChatFns() {
  if (!_chatFns) {
    // These are set by chat.js during init
    _chatFns = { sendMessage: () => {}, stopGeneration: () => {} };
  }
  return _chatFns;
}

export function _setChatFns(fns) {
  _chatFns = fns;
}

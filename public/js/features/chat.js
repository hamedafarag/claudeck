// Send/Stop logic + message handler + boot sequence
import { $ } from '../core/dom.js';
import { getState, setState } from '../core/store.js';
import { CHAT_IDS, BOT_CHAT_ID } from '../core/constants.js';
import { on } from '../core/events.js';
import { commandRegistry, dismissAutocomplete, handleAutocompleteKeydown, handleSlashAutocomplete, registerCommand } from '../ui/commands.js';
import { addUserMessage, appendAssistantText, appendToolIndicator, appendToolResult, showThinking, removeThinking, addResultSummary, addStatus, showWhalyPlaceholder } from '../ui/messages.js';
import { getPane, panes, _setChatFns, _setInputHistoryGetter } from '../ui/parallel.js';
import { loadSessions } from './sessions.js';
import { loadStats, loadAccountInfo } from './cost-dashboard.js';
import { loadProjects } from './projects.js';
import { loadPrompts } from './prompts.js';
import { loadWorkflows } from './workflows.js';
import { loadAgents, handleAgentMessage } from './agents.js';
import './agent-monitor.js';
import { connectWebSocket } from '../core/ws.js';
import { updateAttachmentBadge, getImageAttachments, clearImageAttachments } from './attachments.js';
import { applyTheme } from '../ui/theme.js';
import { exportAsMarkdown, exportAsHtml } from '../ui/export.js';
import * as api from '../core/api.js';
import { isBackgroundSession, removeBackgroundSession, showCompletionToast, showErrorToast, showInputNeededToast, reconcileBackgroundSessions } from './background-sessions.js';
import { enqueuePermissionRequest, getPermissionMode, clearSessionPermissions, handleExternalPermissionResponse } from '../ui/permissions.js';
import { getSelectedModel } from '../ui/model-selector.js';
import { getMaxTurns } from '../ui/max-turns.js';
import { getDisabledTools } from '../ui/disabled-tools.js';
import { updateContextGauge, resetContextGauge, loadContextGauge } from '../ui/context-gauge.js';
import { InputHistory, handleHistoryKeydown } from './input-history.js';

// ── "Waiting for input" indicator ──
const inputWaitingEl = document.getElementById("input-waiting");

// ── Input history (message recall) ──
function historyKey() {
  return "claudeck-input-history-" + ($.projectSelect?.value || "default");
}
let inputHistory = new InputHistory(historyKey());

$.projectSelect?.addEventListener("change", () => {
  inputHistory = new InputHistory(historyKey());
  // Defer visibility update — updateHistoryButtonVisibility is defined later in this file
  queueMicrotask(() => updateHistoryButtonVisibility());
});

export function getInputHistory() {
  // Re-sync key if it drifted (e.g. project loaded after module init)
  const expected = historyKey();
  if (inputHistory.storageKey !== expected) {
    inputHistory = new InputHistory(expected);
  }
  return inputHistory;
}

function isQuestionText(text) {
  if (!text) return false;
  // Get the last meaningful line (skip empty lines, code blocks, lists)
  const lines = text.trim().split('\n').filter(l => l.trim());
  const last = lines[lines.length - 1]?.trim() || '';
  // Check if it ends with a question mark (ignoring trailing markdown/whitespace)
  return /\?\s*[`*_)}\]]*\s*$/.test(last);
}

function showWaitingForInput(pane) {
  pane = pane || getPane(null);
  const parallelMode = getState("parallelMode");

  if (inputWaitingEl) inputWaitingEl.classList.remove("hidden");

  const inputBar = parallelMode
    ? pane.messageInput?.closest('.input-bar')
    : $.messageInput?.closest('.input-bar');
  if (inputBar) inputBar.classList.add("waiting-for-input");
}

function hideWaitingForInput(pane) {
  pane = pane || getPane(null);
  const parallelMode = getState("parallelMode");

  if (inputWaitingEl) inputWaitingEl.classList.add("hidden");

  const inputBar = parallelMode
    ? pane.messageInput?.closest('.input-bar')
    : $.messageInput?.closest('.input-bar');
  if (inputBar) inputBar.classList.remove("waiting-for-input");
}

export function sendMessage(pane) {
  pane = pane || getPane(null);
  // Re-sync history key in case project loaded after module init
  const ek = historyKey();
  if (inputHistory.storageKey !== ek) inputHistory = new InputHistory(ek);
  const text = pane.messageInput.value.trim();
  const cwd = $.projectSelect.value;

  if (!text || !cwd) {
    if (text && text.startsWith("/")) {
      const match = text.match(/^\/(\S+)\s*(.*)/s);
      if (match) {
        const [, cmdName, args] = match;
        const cmd = commandRegistry[cmdName];
        if (cmd) {
          if (cmdName === "run" && !cwd) {
            // /run needs a project, fall through
          } else {
            inputHistory.add(text);
            inputHistory.reset();
            updateHistoryButtonVisibility();
            pane.messageInput.value = "";
            pane.messageInput.style.height = "auto";
            dismissAutocomplete(pane);
            cmd.execute(args, pane);
            return;
          }
        }
      }
    }
    if (!cwd) {
      $.projectSelect.focus();
      $.projectSelect.style.borderColor = "var(--error)";
      setTimeout(() => ($.projectSelect.style.borderColor = ""), 2000);
    }
    return;
  }

  const ws = getState("ws");
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    addStatus("Not connected. Reconnecting...", true, pane);
    connectWebSocket();
    return;
  }

  // Slash command intercept
  if (text.startsWith("/")) {
    const match = text.match(/^\/(\S+)\s*(.*)/s);
    if (match) {
      const [, cmdName, args] = match;
      const cmd = commandRegistry[cmdName];
      if (cmd) {
        inputHistory.add(text);
        inputHistory.reset();
        pane.messageInput.value = "";
        pane.messageInput.style.height = "auto";
        dismissAutocomplete(pane);
        cmd.execute(args, pane);
        return;
      }
    }
  }

  // Prepend attached files
  let fullMessage = text;
  const attachedFiles = getState("attachedFiles");
  if (attachedFiles.length > 0) {
    const fileBlocks = attachedFiles.map(
      (f) => `<file path="${f.path}">\n${f.content}\n</file>`
    ).join("\n\n");
    fullMessage = fileBlocks + "\n\n" + text;
  }

  const images = getImageAttachments();
  const filePaths = attachedFiles.map(f => f.path);
  addUserMessage(text, pane, images, filePaths);
  inputHistory.add(text);
  inputHistory.reset();
  updateHistoryButtonVisibility();
  pane.messageInput.value = "";
  pane.messageInput.style.height = "auto";
  setState("streamingCharCount", 0);

  // Clear attachments
  if (attachedFiles.length > 0) {
    setState("attachedFiles", []);
    updateAttachmentBadge();
  }
  if (images.length > 0) {
    clearImageAttachments();
  }

  hideWaitingForInput(pane);
  pane.isStreaming = true;
  const parallelMode = getState("parallelMode");

  if (parallelMode) {
    pane.sendBtn.classList.add("hidden");
    pane.stopBtn.classList.remove("hidden");
  } else {
    $.sendBtn.classList.add("hidden");
    $.stopBtn.classList.remove("hidden");
  }

  const selectedOption = $.projectSelect.options[$.projectSelect.selectedIndex];
  const projectName = selectedOption?.textContent || "Session";

  const model = getSelectedModel();
  const payload = {
    type: "chat",
    message: fullMessage,
    cwd,
    sessionId: getState("sessionId"),
    projectName,
    permissionMode: getPermissionMode(),
  };
  if (images.length > 0) {
    payload.images = images.map(({ name, data, mimeType }) => ({ name, data, mimeType }));
  }
  if (model) payload.model = model;
  const maxTurns = getMaxTurns();
  if (maxTurns) payload.maxTurns = maxTurns;
  const disabledTools = getDisabledTools();
  if (disabledTools.length > 0) payload.disabledTools = disabledTools;

  if (parallelMode && pane.chatId) {
    payload.chatId = pane.chatId;
  }

  ws.send(JSON.stringify(payload));
  showThinking("Connecting to Claude...", pane);
}

export function stopGeneration(pane) {
  pane = pane || getPane(null);
  const ws = getState("ws");
  if (ws && ws.readyState === WebSocket.OPEN) {
    const payload = { type: "abort" };
    const parallelMode = getState("parallelMode");
    if (parallelMode && pane.chatId) {
      payload.chatId = pane.chatId;
    }
    ws.send(JSON.stringify(payload));
  }
}

export function finishStreamingHandler(pane) {
  pane = pane || getPane(null);
  pane.isStreaming = false;
  pane.currentAssistantMsg = null;
  removeThinking(pane);

  if ($.streamingTokens) $.streamingTokens.classList.add("hidden");
  if ($.streamingTokensSep) $.streamingTokensSep.classList.add("hidden");

  const parallelMode = getState("parallelMode");
  if (parallelMode) {
    pane.sendBtn.classList.remove("hidden");
    pane.stopBtn.classList.add("hidden");
    pane.messageInput.focus();
    if (pane.statusEl) {
      pane.statusEl.textContent = "idle";
      pane.statusEl.className = "chat-pane-status";
    }
  } else {
    $.sendBtn.classList.remove("hidden");
    $.stopBtn.classList.add("hidden");
    $.sendBtn.disabled = false;
    $.messageInput.focus();
  }

  // Re-render messages from DB so fork buttons appear on the completed turn
  const sid = getState("sessionId");
  if (sid) {
    import('./sessions.js').then(({ loadMessages }) => loadMessages(sid));
  }
}

// Register the chat functions with parallel.js to break circular dependency
_setChatFns({ sendMessage, stopGeneration });
_setInputHistoryGetter(() => inputHistory);

// Render a collapsible memory indicator in the chat
function appendMemoryIndicator(memories, pane) {
  pane = pane || getPane(null);
  const div = document.createElement('div');
  div.className = 'memory-indicator';

  const header = document.createElement('div');
  header.className = 'memory-indicator-header';
  header.innerHTML = `<span class="memory-indicator-icon">&#x1f9e0;</span> <span>${memories.length} memor${memories.length === 1 ? 'y' : 'ies'} loaded</span> <span class="memory-indicator-toggle">&#x25B6;</span>`;

  const list = document.createElement('div');
  list.className = 'memory-indicator-list';
  list.style.display = 'none';

  for (const m of memories) {
    const item = document.createElement('div');
    item.className = 'memory-indicator-item';
    const catSpan = document.createElement('span');
    catSpan.className = `memory-indicator-cat ${m.category}`;
    catSpan.textContent = m.category;
    const contentSpan = document.createElement('span');
    contentSpan.className = 'memory-indicator-content';
    contentSpan.textContent = m.content;
    item.appendChild(catSpan);
    item.appendChild(contentSpan);
    list.appendChild(item);
  }

  let expanded = false;
  header.addEventListener('click', () => {
    expanded = !expanded;
    list.style.display = expanded ? '' : 'none';
    header.querySelector('.memory-indicator-toggle').innerHTML = expanded ? '&#x25BC;' : '&#x25B6;';
  });

  div.appendChild(header);
  div.appendChild(list);
  pane.messagesDiv.appendChild(div);
  pane.messagesDiv.scrollTop = pane.messagesDiv.scrollHeight;
}

// Handle WebSocket messages
function handleServerMessage(msg) {
  // Ignore assistant-bot messages — handled by assistant-bot.js
  if (msg.chatId === BOT_CHAT_ID) return;

  // Route background session messages — skip rendering, only handle terminal states
  // Permission requests must pass through so the user can approve/deny tools
  if (msg.sessionId && isBackgroundSession(msg.sessionId)) {
    if (msg.type === "permission_request") {
      const bgMap = getState("backgroundSessions");
      const bgInfo = bgMap.get(msg.sessionId);
      msg._bgSessionTitle = bgInfo?.title || "Background session";
      enqueuePermissionRequest(msg);
      return;
    }
    if (msg.type === "permission_response_external") {
      handleExternalPermissionResponse(msg.id, msg.behavior);
      return;
    }
    // Track last assistant text for question detection
    if (msg.type === "text") {
      const bgMap = getState("backgroundSessions");
      const info = bgMap.get(msg.sessionId);
      if (info) info._lastText = (info._lastText || '') + msg.text;
    }
    if (msg.type === "done") {
      const bgMap = getState("backgroundSessions");
      const info = bgMap.get(msg.sessionId);
      const title = info?.title || "Background session";
      const projectPath = info?.projectPath || "";
      if (info?._lastText && isQuestionText(info._lastText)) {
        showInputNeededToast(msg.sessionId, title, projectPath);
      } else {
        showCompletionToast(msg.sessionId, title, projectPath);
      }
      removeBackgroundSession(msg.sessionId);
      loadSessions();
    }
    if (msg.type === "error") {
      const bgMap = getState("backgroundSessions");
      const info = bgMap.get(msg.sessionId);
      const title = info?.title || "Background session";
      showErrorToast(msg.sessionId, title, msg.error || "Unknown error");
      removeBackgroundSession(msg.sessionId);
      loadSessions();
    }
    // Silently ignore all other message types — server saves to DB
    return;
  }

  // Drop messages from a stale session that isn't the active one
  // (and wasn't explicitly backgrounded — those are caught above).
  // Allow: "session" (sets the new id), "permission_request", workflow messages.
  const currentSessionId = getState("sessionId");
  if (
    msg.sessionId &&
    msg.sessionId !== currentSessionId &&
    msg.type !== "session" &&
    msg.type !== "permission_request"
  ) {
    // Server already saved to DB — safe to discard on the client
    return;
  }

  const pane = getPane(msg.chatId || null);
  removeThinking(pane);

  switch (msg.type) {
    case "session":
      setState("sessionId", msg.sessionId);
      resetContextGauge();
      hideWaitingForInput(pane);
      loadSessions();
      showThinking("Thinking...", pane);
      break;

    case "text":
      appendAssistantText(msg.text, pane);
      break;

    case "tool":
      appendToolIndicator(msg.name, msg.input, pane, msg.id);
      showThinking(`Running ${msg.name}...`, pane);
      break;

    case "tool_result":
      appendToolResult(msg.toolUseId, msg.content, msg.isError, pane);
      showThinking("Thinking...", pane);
      break;

    case "result":
      removeThinking(pane);
      addResultSummary(msg, pane);
      updateContextGauge(msg.input_tokens, msg.output_tokens, msg.cache_read_tokens, msg.cache_creation_tokens);
      if (msg.totalCost != null) {
        $.totalCostEl.textContent = "$" + msg.totalCost.toFixed(2);
      }
      loadStats();
      if ($.streamingTokens) $.streamingTokens.classList.add("hidden");
      if ($.streamingTokensSep) $.streamingTokensSep.classList.add("hidden");
      break;

    case "done": {
      // Check if the last assistant message ends with a question
      const lastMsg = pane.currentAssistantMsg;
      const rawText = lastMsg?.dataset?.raw || lastMsg?.textContent || '';
      finishStreamingHandler(pane);
      if (isQuestionText(rawText)) {
        showWaitingForInput(pane);
      }
      break;
    }

    case "aborted":
      finishStreamingHandler(pane);
      addStatus("Aborted", false, pane);
      break;

    case "error":
      finishStreamingHandler(pane);
      addStatus("Error: " + msg.error, true, pane);
      break;

    case "workflow_started":
      showThinking(`Workflow: ${msg.workflow?.title || "Running"}...`, pane);
      break;

    case "workflow_step": {
      const dot = document.querySelector(`.workflow-step[data-step="${msg.stepIndex}"] .workflow-step-dot`);
      if (dot) {
        dot.className = `workflow-step-dot ${msg.status}`;
      }
      if (msg.status === "running") {
        const label = document.querySelector(`.workflow-step[data-step="${msg.stepIndex}"] .workflow-step-label`);
        showThinking(`Running: ${label?.textContent || "step"}...`, pane);
      }
      break;
    }

    case "workflow_completed":
      removeThinking(pane);
      addStatus(msg.aborted ? "Workflow aborted" : "Workflow completed", !!msg.aborted, pane);
      break;

    case "agent_started":
    case "agent_progress":
    case "agent_completed":
    case "agent_error":
    case "agent_aborted":
    case "agent_chain_started":
    case "agent_chain_step":
    case "agent_chain_completed":
    case "orchestrator_started":
    case "orchestrator_phase":
    case "orchestrator_dispatching":
    case "orchestrator_dispatch":
    case "orchestrator_dispatch_skip":
    case "orchestrator_error":
    case "orchestrator_completed":
    case "dag_started":
    case "dag_level":
    case "dag_node":
    case "dag_completed":
    case "dag_error":
      handleAgentMessage(msg, pane);
      break;

    case "permission_request":
      enqueuePermissionRequest(msg);
      break;

    case "permission_response_external":
      handleExternalPermissionResponse(msg.id, msg.behavior);
      break;

    case "memories_injected":
      if (msg.count > 0 && msg.memories) {
        appendMemoryIndicator(msg.memories, pane);
      }
      break;

    case "memories_captured":
      if (msg.count > 0) {
        addStatus(`${msg.count} new memor${msg.count === 1 ? 'y' : 'ies'} saved`, false, pane);
      }
      break;

    case "memory_saved":
      // /remember command response — already handled by "text" message
      break;
  }
}

// Listen for WebSocket messages via event bus
on("ws:message", handleServerMessage);

// ── Background session reconciliation ──
// Shared helper — reconcile bg sessions against the server's active list.
async function reconcileBgSessionsFromServer() {
  try {
    const activeSessionIds = await api.fetchActiveSessionIds();
    reconcileBackgroundSessions(activeSessionIds);
  } catch (err) {
    console.error("Background session reconciliation failed:", err);
  }
}

// Reconnect state sync — recover from connection drops
on("ws:reconnected", async () => {
  console.log("WebSocket reconnected — syncing state...");
  try {
    // 1. Reconcile background sessions
    await reconcileBgSessionsFromServer();

    // 2. If any foreground pane was streaming, reset it and reload from DB
    for (const pane of panes.values()) {
      if (pane.isStreaming) {
        finishStreamingHandler(pane);
      }
    }

    const currentSessionId = getState("sessionId");
    if (currentSessionId) {
      const { loadMessages } = await import('./sessions.js');
      await loadMessages(currentSessionId);
    }

    // 3. Refresh session list
    loadSessions();
  } catch (err) {
    console.error("Reconnect sync failed:", err);
  }
});

// Initial connect — reconcile stale bg sessions from localStorage (PWA cold start)
on("ws:connected", () => {
  reconcileBgSessionsFromServer();
});

// PWA visibility — reconcile when app returns to foreground.
// Handles cases where the WS stayed "connected" but messages were lost
// while the PWA was suspended by the OS.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && getState("ws")?.readyState === WebSocket.OPEN) {
    reconcileBgSessionsFromServer();
  }
});

// Register built-in commands
registerCommand("clear", {
  category: "app",
  description: "Clear current pane messages",
  execute(args, pane) {
    pane.messagesDiv.innerHTML = "";
    pane.currentAssistantMsg = null;
  },
});

registerCommand("new", {
  category: "app",
  description: "Start a new session",
  execute() {
    clearSessionPermissions();
    $.newSessionBtn.click();
  },
});

registerCommand("parallel", {
  category: "app",
  description: "Toggle parallel mode",
  execute() {
    $.toggleParallelBtn.checked = !$.toggleParallelBtn.checked;
    $.toggleParallelBtn.dispatchEvent(new Event("change"));
  },
});

registerCommand("export", {
  category: "app",
  description: "Download chat (/export md or /export html)",
  execute(args, pane) {
    const format = args.trim().toLowerCase() || "md";
    const msgs = pane.messagesDiv.querySelectorAll(".msg");
    if (format === "html") {
      exportAsHtml(msgs);
    } else {
      exportAsMarkdown(msgs);
    }
  },
});

registerCommand("help", {
  category: "app",
  description: "Show all available commands",
  execute(args, pane) {
    const grouped = { app: [], cli: [], agent: [], workflow: [], prompt: [] };
    for (const [name, cmd] of Object.entries(commandRegistry)) {
      (grouped[cmd.category] || []).push({ name, ...cmd });
    }
    let text = "Available commands:\n";
    for (const [cat, cmds] of Object.entries(grouped)) {
      if (cmds.length === 0) continue;
      text += `\n[${cat.toUpperCase()}]\n`;
      cmds.forEach((c) => (text += `  /${c.name} — ${c.description}\n`));
    }
    addStatus(text, false, pane);
  },
});

registerCommand("run", {
  category: "cli",
  description: "Run a shell command on the server",
  async execute(args, pane) {
    if (!args.trim()) {
      addStatus("Usage: /run <command>", true, pane);
      return;
    }
    const cwd = $.projectSelect.value || undefined;
    addStatus("Running: " + args, false, pane);
    try {
      const data = await api.execCommand(args, cwd);
      // Inline CLI output rendering
      const { appendCliOutput } = await import('../ui/messages.js');
      appendCliOutput(data, pane);
    } catch (err) {
      addStatus("Exec error: " + err.message, true, pane);
    }
  },
});

registerCommand("system-prompt", {
  category: "app",
  description: "Edit system prompt for current project",
  execute() {
    import('./projects.js').then(({ openSystemPromptModal }) => openSystemPromptModal());
  },
});

registerCommand("theme", {
  category: "app",
  description: "Toggle dark/light theme",
  execute() {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(current === "dark" ? "light" : "dark");
  },
});

// Event listeners — single mode
$.sendBtn.addEventListener("click", () => sendMessage(getPane(null)));
$.stopBtn.addEventListener("click", () => stopGeneration(getPane(null)));

$.messageInput.addEventListener("keydown", (e) => {
  if (handleAutocompleteKeydown(e, getPane(null))) return;
  if (handleHistoryKeydown(e, getPane(null), inputHistory)) return;
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage(getPane(null));
  }
});

$.messageInput.addEventListener("input", () => {
  if (inputHistory.isNavigating) inputHistory.reset();
  $.messageInput.style.height = "auto";
  $.messageInput.style.height = Math.min($.messageInput.scrollHeight, 200) + "px";
  handleSlashAutocomplete(getPane(null));
});

// ── History button + popover ──
export function updateHistoryButtonVisibility() {
  // Re-sync key in case project loaded after module init
  const ek = historyKey();
  if (inputHistory.storageKey !== ek) inputHistory = new InputHistory(ek);
  if ($.historyBtn) {
    $.historyBtn.classList.toggle("hidden", inputHistory.entries.length === 0);
  }
}

function renderHistoryPopover() {
  const el = $.historyPopover;
  if (!el) return;
  const entries = inputHistory.getAll();

  if (entries.length === 0) {
    el.innerHTML = '<div class="history-popover-empty">No messages yet</div>';
    return;
  }

  el.innerHTML = `<div class="history-popover-header"><span>Recent messages</span><button class="history-popover-clear">Clear</button></div>`;
  const clearBtn = el.querySelector(".history-popover-clear");
  clearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    inputHistory.entries.length = 0;
    inputHistory._save();
    closeHistoryPopover();
    updateHistoryButtonVisibility();
  });

  entries.forEach((text) => {
    const item = document.createElement("div");
    item.className = "history-popover-item";
    const truncated = text.length > 80 ? text.slice(0, 80) + "\u2026" : text;
    const span = document.createElement("span");
    span.className = "history-popover-item-text" + (text.startsWith("/") ? " is-slash" : "");
    span.textContent = truncated;
    item.appendChild(span);
    item.addEventListener("click", () => {
      const pane = getPane(null);
      pane.messageInput.value = text;
      pane.messageInput.style.height = "auto";
      pane.messageInput.style.height = Math.min(pane.messageInput.scrollHeight, 200) + "px";
      closeHistoryPopover();
      pane.messageInput.focus();
    });
    el.appendChild(item);
  });
}

function closeHistoryPopover() {
  if ($.historyPopover) $.historyPopover.classList.add("hidden");
}

if ($.historyBtn) {
  $.historyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const el = $.historyPopover;
    if (!el) return;
    if (el.classList.contains("hidden")) {
      renderHistoryPopover();
      el.classList.remove("hidden");
    } else {
      closeHistoryPopover();
    }
  });
}

document.addEventListener("click", (e) => {
  if ($.historyPopover && !$.historyPopover.classList.contains("hidden")) {
    if (!$.historyPopover.contains(e.target) && e.target !== $.historyBtn) {
      closeHistoryPopover();
    }
  }
});

// Initialize mermaid
if (typeof mermaid !== "undefined") {
  mermaid.initialize({ startOnLoad: false, theme: "dark" });
}

// ── Fork button handler (delegated) ──
$.messagesDiv.addEventListener("click", async (e) => {
  const forkBtn = e.target.closest(".fork-btn");
  if (!forkBtn) return;

  // Block fork during active streaming
  const currentPane = getPane(null);
  if (currentPane && currentPane.isStreaming) return;

  const messageId = Number(forkBtn.dataset.messageId);
  const sessionId = getState("sessionId");
  if (!sessionId || !messageId) return;

  forkBtn.disabled = true;
  forkBtn.classList.add("fork-loading");
  try {
    const forked = await api.forkSession(sessionId, messageId);
    // Switch to the forked session
    setState("sessionId", forked.id);
    $.messagesDiv.innerHTML = "";
    const { loadMessages } = await import('./sessions.js');
    await loadMessages(forked.id);
    await loadSessions();
    $.messageInput.focus();
    // Show toast
    showForkToast(forked.title || "Forked session");
  } catch (err) {
    console.error("Fork failed:", err);
  } finally {
    forkBtn.disabled = false;
    forkBtn.classList.remove("fork-loading");
  }
});

function showForkToast(title) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "bg-toast";
  const dot = document.createElement("span");
  dot.className = "bg-toast-dot";
  const body = document.createElement("div");
  body.className = "bg-toast-body";
  const label = document.createElement("div");
  label.className = "bg-toast-label";
  label.textContent = "Session forked";
  const titleEl = document.createElement("div");
  titleEl.className = "bg-toast-title";
  titleEl.textContent = title;
  body.appendChild(label);
  body.appendChild(titleEl);
  const closeBtn = document.createElement("button");
  closeBtn.className = "bg-toast-close";
  closeBtn.title = "Dismiss";
  closeBtn.innerHTML = "&times;";
  toast.appendChild(dot);
  toast.appendChild(body);
  toast.appendChild(closeBtn);
  const dismiss = () => {
    toast.classList.add("toast-exit");
    toast.addEventListener("animationend", () => toast.remove());
  };
  closeBtn.addEventListener("click", dismiss);
  container.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) dismiss(); }, 3000);
}

// ── Boot sequence ──
showWhalyPlaceholder();
updateHistoryButtonVisibility();
loadProjects().then(() => {
  // Re-sync history after projects load (programmatic .value= doesn't fire change event)
  inputHistory = new InputHistory(historyKey());
  updateHistoryButtonVisibility();
}); // loadSessions() is called inside loadProjects() after dropdown is populated
loadAccountInfo();
loadStats();
loadPrompts();
connectWebSocket();
loadWorkflows();
loadAgents();

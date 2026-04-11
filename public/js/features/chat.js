// Send/Stop logic + message handler + boot sequence
import { $ } from '../core/dom.js';
import { getState, setState } from '../core/store.js';
import { CHAT_IDS, BOT_CHAT_ID } from '../core/constants.js';
import { on } from '../core/events.js';
import { commandRegistry, dismissAutocomplete, handleAutocompleteKeydown, handleSlashAutocomplete, registerCommand } from '../ui/commands.js';
import { addUserMessage, appendAssistantText, appendToolIndicator, appendToolResult, showThinking, removeThinking, addResultSummary, addStatus, showWhalyPlaceholder, addSkillUsedMessage, exitWelcomeState, isWelcomeStateActive } from '../ui/messages.js';
import { enqueueMessage, pauseQueue, resumeQueue, fireNextQueued, handleStopWithQueue } from './message-queue.js';
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

// ── Worktree mode toggle ──
let worktreeMode = false;
if ($.worktreeBtn) {
  $.worktreeBtn.addEventListener("click", () => {
    worktreeMode = !worktreeMode;
    $.worktreeBtn.classList.toggle("active", worktreeMode);
  });
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

  // Queue message if currently streaming (don't queue slash commands)
  if (pane.isStreaming && text && !text.startsWith('/')) {
    enqueueMessage(text, pane);
    pane.messageInput.value = "";
    pane.messageInput.style.height = "auto";
    dismissAutocomplete(pane);
    return;
  }

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

  // Resume queue if responding to a question
  if (pane._queuePaused && pane._queuePauseReason === 'question') {
    resumeQueue(pane);
  }

  // Animate out of welcome state if active
  if (isWelcomeStateActive()) {
    exitWelcomeState().then(() => {
      _doSend(text, pane);
    });
    return;
  }
  _doSend(text, pane);
}

export function _doSend(text, pane) {
  const cwd = $.projectSelect.value;
  const ws = getState("ws");
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

  // Worktree confirmation: show approve/reject before sending
  if (worktreeMode) {
    worktreeMode = false;
    $.worktreeBtn?.classList.remove("active");
    showWorktreeConfirmation(ws, payload, pane);
    return;
  }

  ws.send(JSON.stringify(payload));
  showThinking("Connecting to Claude...", pane);
}

export function stopGeneration(pane) {
  pane = pane || getPane(null);
  // Show 3-option dialog if queue has items
  if (pane._messageQueue?.length > 0) {
    handleStopWithQueue(pane);
    return;
  }
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

  // Auto-fire next queued message (deferred to let state settle)
  queueMicrotask(() => {
    if (pane._messageQueue?.length > 0 && !pane._queuePaused) {
      fireNextQueued(pane);
    }
  });
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

    case "user_message":
      addUserMessage(msg.text, pane);
      break;

    case "text":
      appendAssistantText(msg.text, pane);
      break;

    case "tool":
      // Detect model-invoked skill usage
      if (msg.name === "Skill" && msg.input?.skill) {
        import('./projects.js').then(({ skillLookup }) => {
          const info = skillLookup.get(msg.input.skill);
          addSkillUsedMessage(msg.input.skill, info?.description || "", pane);
        });
      }
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
        // Pause queue when Claude asks a question
        if (pane._messageQueue?.length > 0) {
          pauseQueue(pane, 'question');
        }
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
      // Pause queue on error
      if (pane._messageQueue?.length > 0) {
        pauseQueue(pane, 'error');
      }
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

    case "worktree_created":
      showWorktreeBanner(msg.branchName, msg.baseBranch, pane);
      showThinking(`Working in worktree: ${msg.branchName}...`, pane);
      break;

    case "worktree_completed":
      removeThinking(pane);
      showWorktreeActions(msg.worktreeId, msg.branchName, msg.stats, pane);
      break;

    case "worktree_error":
      addStatus(`Worktree failed: ${msg.error} — running on current branch instead`, true, pane);
      break;
  }
}

// ── Worktree UI functions ──────────────────────────────────────────────────

const BRANCH_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`;

/**
 * Show a persistent banner indicating the agent is working in a worktree.
 * This is clearly visible so the user knows they're NOT on the main branch.
 */
function showWorktreeBanner(branchName, baseBranch, pane) {
  const container = pane.messagesDiv || $.messagesDiv;
  const banner = document.createElement("div");
  banner.className = "worktree-banner";
  banner.innerHTML = `
    <div class="worktree-banner-content">
      ${BRANCH_SVG}
      <span class="worktree-banner-label">Worktree active</span>
      <code class="worktree-banner-branch">${escapeHtml(branchName)}</code>
      <span class="worktree-banner-base">branched from <strong>${escapeHtml(baseBranch)}</strong></span>
    </div>
  `;
  container.appendChild(banner);
  banner.scrollIntoView({ behavior: "smooth" });
}

/**
 * Show inline confirmation card: "Run in Worktree" or "Use Current Branch".
 * The user's message is already displayed — this card appears below it.
 */
function showWorktreeConfirmation(ws, payload, pane) {
  const container = pane.messagesDiv || $.messagesDiv;
  const card = document.createElement("div");
  card.className = "worktree-confirm-card";
  card.innerHTML = `
    <div class="wt-confirm-header">
      ${BRANCH_SVG}
      <span>Run this task in an isolated worktree?</span>
    </div>
    <div class="wt-confirm-desc">
      Your working branch stays untouched. You can merge or discard the result after completion.
    </div>
    <div class="wt-confirm-btns">
      <button class="wt-btn-worktree">Run in Worktree</button>
      <button class="wt-btn-current">Use Current Branch</button>
    </div>
  `;

  function send(useWorktree) {
    if (useWorktree) payload.worktree = true;
    console.log("[worktree] Sending payload with worktree:", payload.worktree, "cwd:", payload.cwd);
    card.remove();
    ws.send(JSON.stringify(payload));
    showThinking(useWorktree ? "Creating worktree..." : "Connecting to Claude...", pane);
  }

  card.querySelector(".wt-btn-worktree").addEventListener("click", () => send(true));
  card.querySelector(".wt-btn-current").addEventListener("click", () => send(false));

  container.appendChild(card);
  card.scrollIntoView({ behavior: "smooth" });
}

/**
 * Show inline action card after worktree completes: View Diff / Merge / Discard.
 */
function showWorktreeActions(worktreeId, branchName, stats, pane) {
  const container = pane.messagesDiv || $.messagesDiv;
  const card = document.createElement("div");
  card.className = "worktree-action-card";
  const statsText = stats ? `+${stats.insertions} -${stats.deletions} in ${stats.files} file(s)` : "";
  card.innerHTML = `
    <div class="worktree-action-header">
      ${BRANCH_SVG}
      <span>Branch: <strong>${escapeHtml(branchName)}</strong></span>
      <span class="worktree-stats">${statsText}</span>
    </div>
    <div class="worktree-action-btns">
      <button class="wt-diff-btn">View Diff</button>
      <button class="wt-merge-btn">Squash Merge</button>
      <button class="wt-discard-btn">Discard</button>
    </div>
  `;

  const diffBtn = card.querySelector(".wt-diff-btn");
  const mergeBtn = card.querySelector(".wt-merge-btn");
  const discardBtn = card.querySelector(".wt-discard-btn");

  diffBtn.addEventListener("click", async () => {
    diffBtn.disabled = true;
    diffBtn.textContent = "Loading...";
    try {
      const res = await fetch(`/api/worktrees/${encodeURIComponent(worktreeId)}/diff`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showWorktreeDiffModal(data.diff, branchName);
    } catch (err) {
      addStatus("Diff error: " + err.message, true, pane);
    } finally {
      diffBtn.disabled = false;
      diffBtn.textContent = "View Diff";
    }
  });

  mergeBtn.addEventListener("click", async () => {
    mergeBtn.disabled = true;
    mergeBtn.textContent = "Merging...";
    discardBtn.disabled = true;
    try {
      const res = await fetch(`/api/worktrees/${encodeURIComponent(worktreeId)}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      card.innerHTML = `<div class="worktree-action-header">${BRANCH_SVG}<span>Merged <strong>${escapeHtml(branchName)}</strong> into current branch</span></div>`;
      card.classList.add("worktree-merged");
    } catch (err) {
      addStatus("Merge error: " + err.message, true, pane);
      mergeBtn.disabled = false;
      mergeBtn.textContent = "Squash Merge";
      discardBtn.disabled = false;
    }
  });

  discardBtn.addEventListener("click", () => {
    // Replace buttons with confirmation
    const btnsDiv = card.querySelector(".worktree-action-btns");
    btnsDiv.innerHTML = `
      <span class="wt-confirm-label">Discard this worktree? This cannot be undone.</span>
      <button class="wt-confirm-yes">Yes, Discard</button>
      <button class="wt-confirm-no">Cancel</button>
    `;

    btnsDiv.querySelector(".wt-confirm-no").addEventListener("click", () => {
      btnsDiv.innerHTML = "";
      btnsDiv.appendChild(diffBtn);
      btnsDiv.appendChild(mergeBtn);
      btnsDiv.appendChild(discardBtn);
    });

    btnsDiv.querySelector(".wt-confirm-yes").addEventListener("click", async () => {
      const yesBtn = btnsDiv.querySelector(".wt-confirm-yes");
      yesBtn.disabled = true;
      yesBtn.textContent = "Discarding...";
      btnsDiv.querySelector(".wt-confirm-no").disabled = true;
      try {
        const res = await fetch(`/api/worktrees/${encodeURIComponent(worktreeId)}`, { method: "DELETE" });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        card.innerHTML = `<div class="worktree-action-header">${BRANCH_SVG}<span>Discarded <strong>${escapeHtml(branchName)}</strong></span></div>`;
        card.classList.add("worktree-discarded");
      } catch (err) {
        addStatus("Discard error: " + err.message, true, pane);
        btnsDiv.innerHTML = "";
        btnsDiv.appendChild(diffBtn);
        btnsDiv.appendChild(mergeBtn);
        btnsDiv.appendChild(discardBtn);
      }
    });
  });

  container.appendChild(card);
  card.scrollIntoView({ behavior: "smooth" });
}

/**
 * Show a modal with the raw unified diff.
 */
function showWorktreeDiffModal(diffText, branchName) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal git-diff-modal">
      <div class="modal-header">
        <h3>Diff: ${escapeHtml(branchName)}</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="git-diff-body"></div>
    </div>
  `;

  const body = overlay.querySelector(".git-diff-body");

  if (!diffText || !diffText.trim()) {
    body.innerHTML = '<div class="git-diff-empty">(no changes)</div>';
  } else {
    // Parse into per-file sections
    const sections = [];
    let current = null;
    for (const line of diffText.split("\n")) {
      if (line.startsWith("diff --git ")) {
        if (current) sections.push(current);
        const match = line.match(/diff --git a\/(.+?) b\/(.+)/);
        current = { fileName: match ? match[2] : line, lines: [] };
      } else if (current) {
        current.lines.push(line);
      } else {
        if (!current) current = { fileName: "", lines: [] };
        current.lines.push(line);
      }
    }
    if (current) sections.push(current);

    if (sections.length <= 1 && (!sections[0]?.fileName || sections[0].fileName === "")) {
      // Single file — plain view
      const pre = document.createElement("pre");
      pre.className = "git-diff-content";
      renderColoredDiff(pre, sections[0]?.lines || diffText.split("\n"));
      body.appendChild(pre);
    } else {
      // Multi-file — per-file collapsible sections
      for (const section of sections) {
        let add = 0, del = 0;
        for (const l of section.lines) {
          if (l.startsWith("+") && !l.startsWith("+++")) add++;
          else if (l.startsWith("-") && !l.startsWith("---")) del++;
        }

        const fileDiv = document.createElement("div");
        fileDiv.className = "git-diff-file";

        const header = document.createElement("div");
        header.className = "git-diff-file-header";
        header.innerHTML = `
          <svg class="git-diff-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          <span class="git-diff-file-name">${escapeHtml(section.fileName)}</span>
          <span class="git-diff-file-stats">
            ${add ? `<span class="diff-stat-add">+${add}</span>` : ""}
            ${del ? `<span class="diff-stat-del">-${del}</span>` : ""}
          </span>
        `;
        header.addEventListener("click", () => fileDiv.classList.toggle("collapsed"));

        const content = document.createElement("pre");
        content.className = "git-diff-content git-diff-file-content";
        renderColoredDiff(content, section.lines);

        fileDiv.appendChild(header);
        fileDiv.appendChild(content);
        body.appendChild(fileDiv);
      }
    }
  }

  overlay.querySelector(".modal-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", esc); }
  });
  document.body.appendChild(overlay);
}

function renderColoredDiff(container, lines) {
  for (const line of lines) {
    const span = document.createElement("span");
    span.textContent = line + "\n";
    if (line.startsWith("+++") || line.startsWith("---")) span.className = "diff-line-meta";
    else if (line.startsWith("+")) span.className = "diff-line-added";
    else if (line.startsWith("-")) span.className = "diff-line-removed";
    else if (line.startsWith("@@")) span.className = "diff-line-hunk";
    container.appendChild(span);
  }
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
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

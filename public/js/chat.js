// Send/Stop logic + message handler + boot sequence
import { $ } from './dom.js';
import { getState, setState } from './store.js';
import { CHAT_IDS } from './constants.js';
import { on } from './events.js';
import { escapeHtml } from './utils.js';
import { commandRegistry, dismissAutocomplete, handleAutocompleteKeydown, handleSlashAutocomplete, registerCommand } from './commands.js';
import { addUserMessage, appendAssistantText, appendToolIndicator, appendToolResult, showThinking, removeThinking, addResultSummary, addStatus } from './messages.js';
import { getPane, panes, _setChatFns } from './parallel.js';
import { loadSessions } from './sessions.js';
import { loadStats, loadAccountInfo } from './cost-dashboard.js';
import { loadProjects } from './projects.js';
import { loadPrompts } from './prompts.js';
import { loadWorkflows } from './workflows.js';
import { connectWebSocket } from './ws.js';
import { updateAttachmentBadge } from './attachments.js';
import { applyTheme } from './theme.js';
import { exportAsMarkdown, exportAsHtml } from './export.js';
import * as api from './api.js';
import { isBackgroundSession, removeBackgroundSession, showCompletionToast } from './background-sessions.js';

export function sendMessage(pane) {
  pane = pane || getPane(null);
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

  addUserMessage(text, pane);
  pane.messageInput.value = "";
  pane.messageInput.style.height = "auto";
  setState("streamingCharCount", 0);

  // Clear attachments
  if (attachedFiles.length > 0) {
    setState("attachedFiles", []);
    updateAttachmentBadge();
  }

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

  const payload = {
    type: "chat",
    message: fullMessage,
    cwd,
    sessionId: getState("sessionId"),
    projectName,
  };

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
}

// Register the chat functions with parallel.js to break circular dependency
_setChatFns({ sendMessage, stopGeneration });

// Handle WebSocket messages
function handleServerMessage(msg) {
  // Route background session messages — skip rendering, only handle terminal states
  if (msg.sessionId && isBackgroundSession(msg.sessionId)) {
    if (msg.type === "done") {
      const bgMap = getState("backgroundSessions");
      const info = bgMap.get(msg.sessionId);
      const title = info?.title || "Background session";
      const projectPath = info?.projectPath || "";
      showCompletionToast(msg.sessionId, title, projectPath);
      removeBackgroundSession(msg.sessionId);
      loadSessions();
    }
    // Silently ignore all other message types — server saves to DB
    return;
  }

  const pane = getPane(msg.chatId || null);
  removeThinking(pane);

  switch (msg.type) {
    case "session":
      setState("sessionId", msg.sessionId);
      loadSessions();
      showThinking("Thinking...", pane);
      break;

    case "text":
      appendAssistantText(msg.text, pane);
      break;

    case "tool":
      appendToolIndicator(msg.name, msg.input, pane);
      showThinking(`Running ${msg.name}...`, pane);
      break;

    case "tool_result":
      appendToolResult(msg.toolUseId, msg.content, msg.isError, pane);
      showThinking("Thinking...", pane);
      break;

    case "result":
      removeThinking(pane);
      addResultSummary(msg, pane);
      if (msg.totalCost != null) {
        $.totalCostEl.textContent = "$" + msg.totalCost.toFixed(2);
      }
      loadStats();
      if ($.streamingTokens) $.streamingTokens.classList.add("hidden");
      break;

    case "done":
      finishStreamingHandler(pane);
      break;

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
      addStatus("Workflow completed", false, pane);
      break;
  }
}

// Listen for WebSocket messages via event bus
on("ws:message", handleServerMessage);

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
    const grouped = { app: [], cli: [], workflow: [], prompt: [] };
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
      const { appendCliOutput } = await import('./messages.js');
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
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage(getPane(null));
  }
});

$.messageInput.addEventListener("input", () => {
  $.messageInput.style.height = "auto";
  $.messageInput.style.height = Math.min($.messageInput.scrollHeight, 200) + "px";
  handleSlashAutocomplete(getPane(null));
});

// Initialize mermaid
if (typeof mermaid !== "undefined") {
  mermaid.initialize({ startOnLoad: false, theme: "dark" });
}

// ── Boot sequence ──
loadProjects(); // loadSessions() is called inside loadProjects() after dropdown is populated
loadAccountInfo();
loadStats();
loadPrompts();
connectWebSocket();
loadWorkflows();

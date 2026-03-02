// State
let ws = null;
let sessionId = null;
let parallelMode = false;
let streamingCharCount = 0;
const CHAT_IDS = ["chat-0", "chat-1", "chat-2", "chat-3"];
const panes = new Map(); // chatId -> pane state object

// DOM
const projectSelect = document.getElementById("project-select");
const newSessionBtn = document.getElementById("new-session-btn");
const sessionList = document.getElementById("session-list");
const messagesDiv = document.getElementById("messages");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const stopBtn = document.getElementById("stop-btn");
const toggleParallelBtn = document.getElementById("toggle-parallel-btn");

// Header DOM refs
const connectionDot = document.getElementById("connection-dot");
const connectionText = document.getElementById("connection-text");
const accountEmail = document.getElementById("account-email");
const accountPlan = document.getElementById("account-plan");
const totalCostEl = document.getElementById("total-cost");
const projectCostEl = document.getElementById("project-cost");
const headerProjectName = document.getElementById("header-project-name");

// Toolbox
const toolboxBtn = document.getElementById("toolbox-btn");
const toolboxPanel = document.getElementById("toolbox-panel");
let prompts = [];

// Saved reference to the original chat-area for restoring single mode
let savedChatArea = null;

// Initialize single-mode pane
function initSinglePane() {
  panes.clear();
  panes.set(null, {
    chatId: null,
    messagesDiv: messagesDiv,
    messageInput: messageInput,
    sendBtn: sendBtn,
    stopBtn: stopBtn,
    isStreaming: false,
    currentAssistantMsg: null,
    autocompleteEl: document.getElementById("slash-autocomplete"),
    _autocompleteIndex: -1,
  });
}

initSinglePane();

// ── Slash Command System ──────────────────────────────
const commandRegistry = {};

function registerCommand(name, def) {
  commandRegistry[name] = def;
}

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Built-in commands
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
    newSessionBtn.click();
  },
});

registerCommand("parallel", {
  category: "app",
  description: "Toggle parallel mode",
  execute() {
    toggleParallelBtn.checked = !toggleParallelBtn.checked;
    toggleParallelBtn.dispatchEvent(new Event("change"));
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

function exportAsMarkdown(msgs) {
  let md = "# Chat Export\n\n";
  msgs.forEach((m) => {
    if (m.querySelector(".msg-user")) {
      md += "## User\n" + m.textContent.trim() + "\n\n";
    } else if (m.querySelector(".text-content")) {
      md += "## Assistant\n" + (m.querySelector(".text-content").dataset.raw || m.textContent.trim()) + "\n\n";
    } else if (m.querySelector(".tool-indicator")) {
      const name = m.querySelector(".tool-name")?.textContent || "";
      md += "> Tool: " + name + "\n\n";
    }
  });
  const blob = new Blob([md], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `chat-export-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportAsHtml(msgs) {
  let body = "";
  msgs.forEach((m) => {
    if (m.querySelector(".msg-user")) {
      body += `<div class="msg msg-user">${escapeHtml(m.textContent.trim())}</div>\n`;
    } else if (m.querySelector(".text-content")) {
      const raw = m.querySelector(".text-content").dataset.raw || m.textContent.trim();
      body += `<div class="msg msg-assistant"><div class="text-content">${renderMarkdown(raw)}</div></div>\n`;
    } else if (m.querySelector(".tool-indicator")) {
      const name = m.querySelector(".tool-name")?.textContent || "";
      body += `<div class="msg tool-use">Tool: ${escapeHtml(name)}</div>\n`;
    }
  });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Chat Export — shawkat-ai</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; background: #0d1117; color: #e6edf3; max-width: 820px; margin: 0 auto; padding: 24px; }
  .msg { margin-bottom: 14px; }
  .msg-user { background: rgba(31, 111, 235, 0.13); border: 1px solid rgba(31, 111, 235, 0.27); border-radius: 8px; padding: 12px 16px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
  .msg-assistant { font-size: 14px; line-height: 1.7; }
  .text-content { white-space: pre-wrap; word-wrap: break-word; }
  .text-content code { font-family: "SF Mono", "Fira Code", monospace; font-size: 13px; background: #1c2128; padding: 2px 6px; border-radius: 4px; }
  .text-content pre { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 12px 16px; overflow-x: auto; margin: 8px 0; }
  .text-content pre code { background: none; padding: 0; }
  .tool-use { font-family: "SF Mono", monospace; font-size: 12px; color: #8b949e; padding: 4px 0; }
  h1, h2, h3 { color: #e6edf3; }
  strong { font-weight: 600; }
</style>
</head>
<body>
<h1>Chat Export</h1>
${body}
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"><\/script>
<script>hljs.highlightAll();<\/script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `chat-export-${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
}

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
    const cwd = projectSelect.value || undefined;
    addStatus("Running: " + args, false, pane);
    try {
      const res = await fetch("/api/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: args, cwd }),
      });
      const data = await res.json();
      appendCliOutput(data, pane);
    } catch (err) {
      addStatus("Exec error: " + err.message, true, pane);
    }
  },
});

// Auto-register prompt commands after prompts load
function registerPromptCommands() {
  // Remove old prompt commands
  for (const [name, cmd] of Object.entries(commandRegistry)) {
    if (cmd.category === "prompt") delete commandRegistry[name];
  }
  for (const p of prompts) {
    const slug = slugify(p.title);
    if (!slug || commandRegistry[slug]) continue; // skip conflicts
    registerCommand(slug, {
      category: "prompt",
      description: p.description,
      execute(args, pane) {
        const variables = extractVariables(p.prompt);
        if (variables.length > 0) {
          // Show variables form
          const existingForm = document.querySelector(".prompt-variables-form");
          if (existingForm) existingForm.remove();
          const chatArea = document.querySelector(".chat-area");
          if (!chatArea) return;
          const form = renderVariablesForm(p.prompt, variables, (filledPrompt) => {
            pane.messageInput.value = filledPrompt;
            pane.messageInput.style.height = "auto";
            pane.messageInput.style.height = Math.min(pane.messageInput.scrollHeight, 200) + "px";
            sendMessage(pane);
          });
          chatArea.appendChild(form);
          const firstInput = form.querySelector("input");
          if (firstInput) firstInput.focus();
        } else {
          pane.messageInput.value = p.prompt;
          pane.messageInput.style.height = "auto";
          pane.messageInput.style.height = Math.min(pane.messageInput.scrollHeight, 200) + "px";
          sendMessage(pane);
        }
      },
    });
  }
}

// CLI output renderer
function appendCliOutput(data, pane) {
  pane = pane || getPane(null);
  const div = document.createElement("div");
  div.className = "msg";

  const block = document.createElement("div");
  block.className = "cli-output";

  const isOk = data.exitCode === 0;
  block.innerHTML = `
    <div class="cli-output-header">
      <span class="cli-icon ${isOk ? "success" : "error"}">${isOk ? "&#10003;" : "&#10007;"}</span>
      <span class="cli-cmd">${escapeHtml(data.command)}</span>
      <span class="cli-exit">exit ${data.exitCode}</span>
    </div>
    <div class="cli-output-body">
      ${data.stdout ? `<pre>${escapeHtml(data.stdout)}</pre>` : ""}
      ${data.stderr ? `<pre class="cli-output-stderr">${escapeHtml(data.stderr)}</pre>` : ""}
      ${!data.stdout && !data.stderr ? `<pre>(no output)</pre>` : ""}
    </div>
  `;

  div.appendChild(block);
  pane.messagesDiv.appendChild(div);
  pane.currentAssistantMsg = null;
  scrollToBottom(pane);
}

// Autocomplete
function handleSlashAutocomplete(pane) {
  const text = pane.messageInput.value;
  const el = pane.autocompleteEl;
  if (!el) return;

  if (!text.startsWith("/") || text.includes(" ")) {
    dismissAutocomplete(pane);
    return;
  }

  const partial = text.slice(1).toLowerCase();
  const matches = Object.entries(commandRegistry)
    .filter(([name]) => name.startsWith(partial))
    .sort((a, b) => {
      const catOrder = { project: 0, skill: 1, app: 2, cli: 3, workflow: 4, prompt: 5 };
      const ca = catOrder[a[1].category] ?? 3;
      const cb = catOrder[b[1].category] ?? 3;
      return ca - cb || a[0].localeCompare(b[0]);
    })
    .slice(0, 20);

  if (matches.length === 0) {
    dismissAutocomplete(pane);
    return;
  }

  el.innerHTML = "";
  matches.forEach(([name, cmd], i) => {
    const item = document.createElement("div");
    item.className = "slash-autocomplete-item" + (i === 0 ? " active" : "");
    item.dataset.index = i;
    item.dataset.cmd = name;
    item.innerHTML = `
      <span class="cmd-name">/${escapeHtml(name)}</span>
      <span class="cmd-category" data-cat="${cmd.category}">${cmd.category}</span>
      <span class="cmd-desc">${escapeHtml(cmd.description)}</span>
    `;
    item.addEventListener("mousedown", (e) => {
      e.preventDefault(); // prevent blur
      const needsArgs = name === "run" || cmd.needsArgs;
      pane.messageInput.value = `/${name}${needsArgs ? " " : ""}`;
      dismissAutocomplete(pane);
      pane.messageInput.focus();
    });
    el.appendChild(item);
  });

  pane._autocompleteIndex = 0;
  el.classList.remove("hidden");
}

function dismissAutocomplete(pane) {
  if (pane.autocompleteEl) {
    pane.autocompleteEl.classList.add("hidden");
    pane.autocompleteEl.innerHTML = "";
    pane._autocompleteIndex = -1;
  }
}

function handleAutocompleteKeydown(e, pane) {
  const el = pane.autocompleteEl;
  if (!el || el.classList.contains("hidden")) return false;

  const items = el.querySelectorAll(".slash-autocomplete-item");
  if (items.length === 0) return false;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    pane._autocompleteIndex = Math.min(pane._autocompleteIndex + 1, items.length - 1);
    items.forEach((it, i) => it.classList.toggle("active", i === pane._autocompleteIndex));
    items[pane._autocompleteIndex].scrollIntoView({ block: "nearest" });
    return true;
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    pane._autocompleteIndex = Math.max(pane._autocompleteIndex - 1, 0);
    items.forEach((it, i) => it.classList.toggle("active", i === pane._autocompleteIndex));
    items[pane._autocompleteIndex].scrollIntoView({ block: "nearest" });
    return true;
  }

  if (e.key === "Tab" || (e.key === "Enter" && pane._autocompleteIndex >= 0)) {
    e.preventDefault();
    const active = items[pane._autocompleteIndex];
    if (active) {
      const cmdName = active.dataset.cmd;
      const cmdDef = commandRegistry[cmdName];
      const needsArgs = cmdName === "run" || (cmdDef && cmdDef.needsArgs);
      pane.messageInput.value = `/${cmdName}${needsArgs ? " " : ""}`;
      dismissAutocomplete(pane);
      pane.messageInput.focus();
    }
    return true;
  }

  if (e.key === "Escape") {
    e.preventDefault();
    dismissAutocomplete(pane);
    return true;
  }

  return false;
}

// Get pane by chatId
function getPane(chatId) {
  if (!parallelMode) return panes.get(null);
  return panes.get(chatId) || panes.get(null);
}

// Initialize
loadProjects();
loadSessions();
loadAccountInfo();
loadStats();
loadPrompts();
connectWebSocket();

// WebSocket
function connectWebSocket() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.onopen = () => {
    console.log("WebSocket connected");
    connectionDot.className = "term-dot connected";
    connectionText.textContent = "connected";
    connectionText.className = "term-status ok";
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleServerMessage(msg);
  };

  ws.onclose = () => {
    console.log("WebSocket disconnected, reconnecting...");
    connectionDot.className = "term-dot reconnecting";
    connectionText.textContent = "reconnecting";
    connectionText.className = "term-status";
    setTimeout(connectWebSocket, 2000);
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
    connectionDot.className = "term-dot";
    connectionText.textContent = "disconnected";
    connectionText.className = "term-status";
  };
}

function handleServerMessage(msg) {
  const pane = getPane(msg.chatId || null);
  removeThinking(pane); // clear thinking indicator on any message

  switch (msg.type) {
    case "session":
      sessionId = msg.sessionId;
      loadSessions(); // refresh from API
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
        totalCostEl.textContent = "$" + msg.totalCost.toFixed(2);
      }
      loadStats(); // refresh project cost
      // Hide streaming token counter
      { const tokenEl = document.getElementById("streaming-tokens");
        if (tokenEl) tokenEl.classList.add("hidden"); }
      break;

    case "done":
      finishStreaming(pane);
      break;

    case "aborted":
      finishStreaming(pane);
      addStatus("Aborted", false, pane);
      break;

    case "error":
      finishStreaming(pane);
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

// Messages — all accept a pane parameter
function addUserMessage(text, pane) {
  pane = pane || getPane(null);
  const div = document.createElement("div");
  div.className = "msg msg-user";
  div.textContent = text;
  pane.messagesDiv.appendChild(div);
  scrollToBottom(pane);
}

function appendAssistantText(text, pane) {
  pane = pane || getPane(null);
  if (!pane.currentAssistantMsg) {
    const div = document.createElement("div");
    div.className = "msg msg-assistant";
    const content = document.createElement("div");
    content.className = "text-content";
    div.appendChild(content);
    pane.messagesDiv.appendChild(div);
    pane.currentAssistantMsg = content;
  }
  // Render with basic markdown
  pane.currentAssistantMsg.innerHTML = renderMarkdown(
    (pane.currentAssistantMsg.dataset.raw || "") + text
  );
  pane.currentAssistantMsg.dataset.raw =
    (pane.currentAssistantMsg.dataset.raw || "") + text;
  highlightCodeBlocks(pane.currentAssistantMsg);
  addCopyButtons(pane.currentAssistantMsg);
  renderMermaidBlocks(pane.currentAssistantMsg);
  scrollToBottom(pane);

  // Update streaming token counter
  streamingCharCount += text.length;
  const tokenEst = Math.round(streamingCharCount / 4);
  const tokenEl = document.getElementById("streaming-tokens");
  if (tokenEl) {
    tokenEl.textContent = `~${tokenEst} tokens`;
    tokenEl.classList.remove("hidden");
  }
}

// ── Diff Rendering ──────────────────────────────────
function computeLineDiff(oldLines, newLines) {
  const m = oldLines.length, n = newLines.length;
  // Guard against huge diffs
  if (m + n > 1000) return null;

  // LCS via DP
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const result = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: "context", line: oldLines[i - 1], oldNum: i, newNum: j });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "added", line: newLines[j - 1], newNum: j });
      j--;
    } else {
      result.unshift({ type: "removed", line: oldLines[i - 1], oldNum: i });
      i--;
    }
  }
  return result;
}

function renderDiffView(oldStr, newStr, filePath) {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const diff = computeLineDiff(oldLines, newLines);
  if (!diff) return null; // too large

  const container = document.createElement("div");
  container.className = "diff-view";

  const header = document.createElement("div");
  header.className = "diff-header";
  header.textContent = filePath || "Edit";
  container.appendChild(header);

  const body = document.createElement("div");
  body.className = "diff-body";

  for (const entry of diff) {
    const line = document.createElement("div");
    line.className = `diff-line diff-${entry.type}`;

    const gutter = document.createElement("span");
    gutter.className = "diff-gutter";
    if (entry.type === "removed") {
      gutter.textContent = entry.oldNum;
    } else if (entry.type === "added") {
      gutter.textContent = entry.newNum;
    } else {
      gutter.textContent = entry.oldNum;
    }

    const sign = document.createElement("span");
    sign.className = "diff-sign";
    sign.textContent = entry.type === "added" ? "+" : entry.type === "removed" ? "-" : " ";

    const content = document.createElement("span");
    content.className = "diff-content";
    content.textContent = entry.line;

    line.appendChild(gutter);
    line.appendChild(sign);
    line.appendChild(content);
    body.appendChild(line);
  }

  container.appendChild(body);
  return container;
}

function renderAdditionsView(content, filePath) {
  const lines = content.split("\n");
  if (lines.length > 1000) return null;

  const container = document.createElement("div");
  container.className = "diff-view";

  const header = document.createElement("div");
  header.className = "diff-header";
  header.textContent = filePath || "Write (new file)";
  container.appendChild(header);

  const body = document.createElement("div");
  body.className = "diff-body";

  for (let i = 0; i < lines.length; i++) {
    const line = document.createElement("div");
    line.className = "diff-line diff-added";

    const gutter = document.createElement("span");
    gutter.className = "diff-gutter";
    gutter.textContent = i + 1;

    const sign = document.createElement("span");
    sign.className = "diff-sign";
    sign.textContent = "+";

    const lineContent = document.createElement("span");
    lineContent.className = "diff-content";
    lineContent.textContent = lines[i];

    line.appendChild(gutter);
    line.appendChild(sign);
    line.appendChild(lineContent);
    body.appendChild(line);
  }

  container.appendChild(body);
  return container;
}

function appendToolIndicator(name, input, pane) {
  pane = pane || getPane(null);
  const div = document.createElement("div");
  div.className = "msg";

  // Diff view for Edit tool
  if (name === "Edit" && input && input.old_string != null && input.new_string != null) {
    const diffEl = renderDiffView(input.old_string, input.new_string, input.file_path);
    if (diffEl) {
      div.appendChild(diffEl);
      pane.messagesDiv.appendChild(div);
      pane.currentAssistantMsg = null;
      scrollToBottom(pane);
      return;
    }
  }

  // Additions view for Write tool
  if (name === "Write" && input && input.content != null) {
    const addEl = renderAdditionsView(input.content, input.file_path);
    if (addEl) {
      div.appendChild(addEl);
      pane.messagesDiv.appendChild(div);
      pane.currentAssistantMsg = null;
      scrollToBottom(pane);
      return;
    }
  }

  // Default tool indicator
  const indicator = document.createElement("div");
  indicator.className = "tool-indicator";
  indicator.innerHTML = `
    <span class="tool-icon">&gt;</span>
    <span class="tool-name">${escapeHtml(name)}</span>
    <span class="tool-detail">${getToolDetail(name, input)}</span>
    <div class="tool-body">${escapeHtml(JSON.stringify(input, null, 2))}</div>
  `;
  indicator.addEventListener("click", () => {
    indicator.classList.toggle("expanded");
  });

  div.appendChild(indicator);
  pane.messagesDiv.appendChild(div);
  pane.currentAssistantMsg = null;
  scrollToBottom(pane);
}

function appendToolResult(toolUseId, content, isError, pane) {
  pane = pane || getPane(null);
  const div = document.createElement("div");
  div.className = "msg";

  const indicator = document.createElement("div");
  indicator.className = "tool-indicator";
  const preview = typeof content === "string" ? content.slice(0, 120) : "";
  const iconColor = isError ? "var(--error)" : "var(--success)";
  const icon = isError ? "&#10007;" : "&#10003;";
  indicator.innerHTML = `
    <span class="tool-icon" style="color: ${iconColor};">${icon}</span>
    <span class="tool-name">${isError ? "Error" : "Result"}</span>
    <span class="tool-detail">${escapeHtml(preview)}</span>
    <div class="tool-body">${escapeHtml(content || "")}</div>
  `;
  indicator.addEventListener("click", () => {
    indicator.classList.toggle("expanded");
  });

  div.appendChild(indicator);
  pane.messagesDiv.appendChild(div);
  pane.currentAssistantMsg = null;
  scrollToBottom(pane);
}

// Thinking / status indicator
function showThinking(label, pane) {
  pane = pane || getPane(null);
  removeThinking(pane);
  const div = document.createElement("div");
  div.className = "thinking-bar";
  div.dataset.thinkingBar = "true";
  div.innerHTML = `
    <div class="thinking-dot-container">
      <span class="thinking-dot"></span>
      <span class="thinking-dot"></span>
      <span class="thinking-dot"></span>
    </div>
    <span class="thinking-label">${escapeHtml(label)}</span>
  `;
  pane.messagesDiv.appendChild(div);
  // Update pane status indicator in parallel mode
  if (pane.statusEl) {
    pane.statusEl.textContent = "streaming";
    pane.statusEl.className = "chat-pane-status streaming";
  }
  scrollToBottom(pane);
}

function removeThinking(pane) {
  pane = pane || getPane(null);
  const el = pane.messagesDiv.querySelector('[data-thinking-bar="true"]');
  if (el) el.remove();
}

function addResultSummary(msg, pane) {
  pane = pane || getPane(null);
  const parts = [];
  if (msg.num_turns != null) parts.push(`${msg.num_turns} turn${msg.num_turns !== 1 ? "s" : ""}`);
  if (msg.duration_ms != null) {
    const secs = (msg.duration_ms / 1000).toFixed(1);
    parts.push(`${secs}s`);
  }
  if (msg.cost_usd != null) parts.push(`$${msg.cost_usd.toFixed(4)}`);
  if (parts.length > 0) {
    addStatus(parts.join(" \u00b7 "), false, pane);
  }
}

function addStatus(text, isError, pane) {
  pane = pane || getPane(null);
  const div = document.createElement("div");
  div.className = "status" + (isError ? " error" : "");
  div.textContent = text;
  pane.messagesDiv.appendChild(div);
  scrollToBottom(pane);
}

function finishStreaming(pane) {
  pane = pane || getPane(null);
  pane.isStreaming = false;
  pane.currentAssistantMsg = null;
  removeThinking(pane);

  // Hide streaming token counter
  const tokenEl = document.getElementById("streaming-tokens");
  if (tokenEl) tokenEl.classList.add("hidden");

  if (parallelMode) {
    // Show send, hide stop for this pane
    pane.sendBtn.classList.remove("hidden");
    pane.stopBtn.classList.add("hidden");
    pane.messageInput.focus();
    if (pane.statusEl) {
      pane.statusEl.textContent = "idle";
      pane.statusEl.className = "chat-pane-status";
    }
  } else {
    sendBtn.classList.remove("hidden");
    stopBtn.classList.add("hidden");
    sendBtn.disabled = false;
    messageInput.focus();
  }
}

function scrollToBottom(pane) {
  pane = pane || getPane(null);
  pane.messagesDiv.scrollTop = pane.messagesDiv.scrollHeight;
}

// Send message — accepts pane for parallel mode
function sendMessage(pane) {
  pane = pane || getPane(null);
  const text = pane.messageInput.value.trim();
  const cwd = projectSelect.value;

  if (!text || !cwd) {
    // Allow slash commands even without a project selected (except /run)
    if (text && text.startsWith("/")) {
      const match = text.match(/^\/(\S+)\s*(.*)/s);
      if (match) {
        const [, cmdName, args] = match;
        const cmd = commandRegistry[cmdName];
        if (cmd) {
          if (cmdName === "run" && !cwd) {
            // /run needs a project, fall through to normal validation
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
      projectSelect.focus();
      projectSelect.style.borderColor = "var(--error)";
      setTimeout(() => (projectSelect.style.borderColor = ""), 2000);
    }
    return;
  }

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
    // Not a known command — fall through to send to Claude
  }

  // Prepend attached files to the message
  let fullMessage = text;
  if (attachedFiles.length > 0) {
    const fileBlocks = attachedFiles.map(
      (f) => `<file path="${f.path}">\n${f.content}\n</file>`
    ).join("\n\n");
    fullMessage = fileBlocks + "\n\n" + text;
  }

  addUserMessage(text, pane); // Show only the user's text in the UI
  pane.messageInput.value = "";
  pane.messageInput.style.height = "auto";
  streamingCharCount = 0; // Reset token counter for new message

  // Clear attachments after building the message
  const hadAttachments = attachedFiles.length > 0;
  if (hadAttachments) {
    attachedFiles = [];
    updateAttachmentBadge();
  }

  pane.isStreaming = true;

  if (parallelMode) {
    pane.sendBtn.classList.add("hidden");
    pane.stopBtn.classList.remove("hidden");
  } else {
    sendBtn.classList.add("hidden");
    stopBtn.classList.remove("hidden");
  }

  const selectedOption = projectSelect.options[projectSelect.selectedIndex];
  const projectName = selectedOption?.textContent || "Session";

  const payload = {
    type: "chat",
    message: fullMessage,
    cwd,
    sessionId,
    projectName,
  };

  // Include chatId when in parallel mode
  if (parallelMode && pane.chatId) {
    payload.chatId = pane.chatId;
  }

  ws.send(JSON.stringify(payload));

  showThinking("Connecting to Claude...", pane);
}

function stopGeneration(pane) {
  pane = pane || getPane(null);
  if (ws && ws.readyState === WebSocket.OPEN) {
    const payload = { type: "abort" };
    if (parallelMode && pane.chatId) {
      payload.chatId = pane.chatId;
    }
    ws.send(JSON.stringify(payload));
  }
}

// Create a chat pane for parallel mode
function createChatPane(chatId, index) {
  const container = document.createElement("div");
  container.className = "chat-pane";
  container.dataset.chatId = chatId;

  // Header
  const header = document.createElement("div");
  header.className = "chat-pane-header";
  header.innerHTML = `
    <span class="chat-pane-label">Chat ${index + 1}</span>
    <span class="chat-pane-status">idle</span>
  `;
  container.appendChild(header);

  // Messages area
  const msgs = document.createElement("div");
  msgs.className = "messages";
  container.appendChild(msgs);

  // Input bar
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

  // Autocomplete container for this pane
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

  // Bind events
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

// Enter parallel mode
function enterParallelMode() {
  parallelMode = true;
  toggleParallelBtn.checked = true;

  const chatArea = document.querySelector(".chat-area");
  savedChatArea = chatArea;

  // Create grid container
  const grid = document.createElement("div");
  grid.className = "chat-grid";
  grid.id = "chat-grid";

  // Clear panes map (but keep null for compatibility)
  panes.clear();

  // Create 4 panes
  for (let i = 0; i < CHAT_IDS.length; i++) {
    const { container, state } = createChatPane(CHAT_IDS[i], i);
    grid.appendChild(container);
    panes.set(CHAT_IDS[i], state);
  }

  // Replace chat area with grid in layout
  chatArea.replaceWith(grid);

  // Load messages for each pane if we have a session
  if (sessionId) {
    for (const chatId of CHAT_IDS) {
      loadPaneMessages(sessionId, chatId);
    }
  }
}

// Exit parallel mode
function exitParallelMode() {
  parallelMode = false;
  toggleParallelBtn.checked = false;

  const grid = document.getElementById("chat-grid");
  if (grid && savedChatArea) {
    grid.replaceWith(savedChatArea);
  }

  // Re-init single pane from DOM
  initSinglePane();

  // Reload messages in single mode
  if (sessionId) {
    loadMessages(sessionId);
  }
}

// Render an array of message rows into a pane
function renderMessagesIntoPane(messages, pane) {
  pane.messagesDiv.innerHTML = "";
  pane.currentAssistantMsg = null;
  for (const msg of messages) {
    const data = JSON.parse(msg.content);
    switch (msg.role) {
      case "user":
        addUserMessage(data.text, pane);
        break;
      case "assistant":
        appendAssistantText(data.text, pane);
        break;
      case "tool":
        appendToolIndicator(data.name, data.input, pane);
        break;
      case "tool_result":
        appendToolResult(data.toolUseId, data.content, data.isError, pane);
        break;
      case "result":
        addResultSummary(data, pane);
        break;
    }
  }
  pane.currentAssistantMsg = null;
  // Apply formatting to all code blocks in the pane
  highlightCodeBlocks(pane.messagesDiv);
  addCopyButtons(pane.messagesDiv);
  renderMermaidBlocks(pane.messagesDiv);
}

// Load messages for a specific pane
async function loadPaneMessages(sid, chatId) {
  const pane = panes.get(chatId);
  if (!pane) return;
  try {
    // Fetch this pane's own messages
    const res = await fetch(`/api/sessions/${encodeURIComponent(sid)}/messages/${encodeURIComponent(chatId)}`);
    let messages = await res.json();

    // For Chat 1 (chat-0): also load single-mode messages (chat_id IS NULL) as fallback
    if (chatId === CHAT_IDS[0]) {
      const resSingle = await fetch(`/api/sessions/${encodeURIComponent(sid)}/messages-single`);
      const singleMessages = await resSingle.json();
      if (singleMessages.length > 0) {
        // Merge and sort by id to maintain chronological order
        messages = [...singleMessages, ...messages].sort((a, b) => a.id - b.id);
      }
    }

    renderMessagesIntoPane(messages, pane);
  } catch (err) {
    console.error(`Failed to load messages for ${chatId}:`, err);
  }
}

// Load projects from folders.json
let projectsData = [];

async function loadProjects() {
  try {
    const res = await fetch("/api/projects");
    const projects = await res.json();
    projectsData = projects;
    const saved = localStorage.getItem("shawkat-ai-cwd") || "";

    for (const p of projects) {
      const opt = document.createElement("option");
      opt.value = p.path;
      opt.textContent = p.name;
      projectSelect.appendChild(opt);
    }

    if (saved && [...projectSelect.options].some((o) => o.value === saved)) {
      projectSelect.value = saved;
    }
    updateSystemPromptIndicator();
    updateHeaderProjectName();
    loadProjectCommands();
  } catch (err) {
    console.error("Failed to load projects:", err);
  }
}

// System prompt helpers
const spBadge = document.getElementById("system-prompt-badge");
const spEditBtn = document.getElementById("system-prompt-edit-btn");
const spModal = document.getElementById("system-prompt-modal");
const spTextarea = document.getElementById("sp-textarea");
const spForm = document.getElementById("system-prompt-form");

function updateSystemPromptIndicator() {
  const cwd = projectSelect.value;
  const project = projectsData.find((p) => p.path === cwd);
  if (project && project.systemPrompt) {
    spBadge.classList.remove("hidden");
  } else {
    spBadge.classList.add("hidden");
  }
}

function openSystemPromptModal() {
  const cwd = projectSelect.value;
  if (!cwd) return;
  const project = projectsData.find((p) => p.path === cwd);
  spTextarea.value = project?.systemPrompt || "";
  spModal.classList.remove("hidden");
  spTextarea.focus();
}

async function saveSystemPrompt(prompt) {
  const cwd = projectSelect.value;
  if (!cwd) return;
  try {
    await fetch("/api/projects/system-prompt", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: cwd, systemPrompt: prompt }),
    });
    // Update local data
    const project = projectsData.find((p) => p.path === cwd);
    if (project) project.systemPrompt = prompt;
    updateSystemPromptIndicator();
  } catch (err) {
    console.error("Failed to save system prompt:", err);
  }
}

spEditBtn.addEventListener("click", openSystemPromptModal);
spForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await saveSystemPrompt(spTextarea.value.trim());
  spModal.classList.add("hidden");
});
document.getElementById("sp-cancel-btn").addEventListener("click", () => {
  spModal.classList.add("hidden");
});
document.getElementById("sp-modal-close").addEventListener("click", () => {
  spModal.classList.add("hidden");
});
document.getElementById("sp-clear-btn").addEventListener("click", async () => {
  spTextarea.value = "";
  await saveSystemPrompt("");
  spModal.classList.add("hidden");
});
spModal.addEventListener("click", (e) => {
  if (e.target === spModal) spModal.classList.add("hidden");
});

registerCommand("system-prompt", {
  category: "app",
  description: "Edit system prompt for current project",
  execute() {
    openSystemPromptModal();
  },
});

// ── File Attachments ──────────────────────────────────
let attachedFiles = []; // { path, content }
const attachBtn = document.getElementById("attach-btn");
const attachBadge = document.getElementById("attach-badge");
const fpModal = document.getElementById("file-picker-modal");
const fpSearch = document.getElementById("fp-search");
const fpList = document.getElementById("fp-list");
const fpCount = document.getElementById("fp-count");
let allProjectFiles = [];

function updateAttachmentBadge() {
  if (attachedFiles.length > 0) {
    attachBadge.textContent = attachedFiles.length;
    attachBadge.classList.remove("hidden");
  } else {
    attachBadge.classList.add("hidden");
  }
}

async function openFilePicker() {
  const cwd = projectSelect.value;
  if (!cwd) return;
  fpModal.classList.remove("hidden");
  fpSearch.value = "";
  fpSearch.focus();

  try {
    const res = await fetch(`/api/files?path=${encodeURIComponent(cwd)}`);
    allProjectFiles = await res.json();
    renderFilePicker("");
  } catch (err) {
    console.error("Failed to load files:", err);
    allProjectFiles = [];
    renderFilePicker("");
  }
}

function renderFilePicker(filter) {
  fpList.innerHTML = "";
  const lower = filter.toLowerCase();
  const filtered = lower
    ? allProjectFiles.filter((f) => f.toLowerCase().includes(lower))
    : allProjectFiles;

  for (const filePath of filtered.slice(0, 200)) {
    const item = document.createElement("div");
    item.className = "file-picker-item";
    const isSelected = attachedFiles.some((f) => f.path === filePath);
    if (isSelected) item.classList.add("selected");
    item.textContent = filePath;
    item.addEventListener("click", () => toggleFileAttachment(filePath, item));
    fpList.appendChild(item);
  }
}

async function toggleFileAttachment(filePath, itemEl) {
  const idx = attachedFiles.findIndex((f) => f.path === filePath);
  if (idx >= 0) {
    attachedFiles.splice(idx, 1);
    itemEl.classList.remove("selected");
  } else {
    try {
      const cwd = projectSelect.value;
      const res = await fetch(`/api/files/content?base=${encodeURIComponent(cwd)}&path=${encodeURIComponent(filePath)}`);
      if (!res.ok) {
        const err = await res.json();
        console.error("Failed to read file:", err.error);
        return;
      }
      const data = await res.json();
      attachedFiles.push({ path: filePath, content: data.content });
      itemEl.classList.add("selected");
    } catch (err) {
      console.error("Failed to read file:", err);
      return;
    }
  }
  fpCount.textContent = `${attachedFiles.length} file${attachedFiles.length !== 1 ? "s" : ""} selected`;
  updateAttachmentBadge();
}

function closeFilePicker() {
  fpModal.classList.add("hidden");
}

attachBtn.addEventListener("click", openFilePicker);
document.getElementById("fp-modal-close").addEventListener("click", closeFilePicker);
document.getElementById("fp-done-btn").addEventListener("click", closeFilePicker);
fpModal.addEventListener("click", (e) => {
  if (e.target === fpModal) closeFilePicker();
});
fpSearch.addEventListener("input", () => {
  renderFilePicker(fpSearch.value.trim());
});

registerCommand("attach", {
  category: "app",
  description: "Attach files to next message",
  execute() {
    openFilePicker();
  },
});

// Load message history for a session
async function loadMessages(sid) {
  if (parallelMode) {
    // Load per-pane messages
    for (const chatId of CHAT_IDS) {
      loadPaneMessages(sid, chatId);
    }
    return;
  }

  const pane = getPane(null);
  try {
    // In single mode, only show messages with chat_id IS NULL
    const res = await fetch(`/api/sessions/${encodeURIComponent(sid)}/messages-single`);
    const messages = await res.json();
    renderMessagesIntoPane(messages, pane);
  } catch (err) {
    console.error("Failed to load messages:", err);
  }
}

// Sessions — loaded from API, filtered by selected project
async function loadSessions(searchTerm) {
  try {
    const cwd = projectSelect.value;
    let url;
    if (searchTerm) {
      url = `/api/sessions/search?q=${encodeURIComponent(searchTerm)}`;
      if (cwd) url += `&project_path=${encodeURIComponent(cwd)}`;
    } else {
      url = cwd
        ? `/api/sessions?project_path=${encodeURIComponent(cwd)}`
        : "/api/sessions";
    }
    const res = await fetch(url);
    const sessions = await res.json();
    renderSessions(sessions);
  } catch (err) {
    console.error("Failed to load sessions:", err);
  }
}

function renderSessions(sessions) {
  sessionList.innerHTML = "";
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
      await fetch(`/api/sessions/${encodeURIComponent(s.id)}/pin`, { method: "PUT" });
      loadSessions(sessionSearchInput.value.trim() || undefined);
    });
    li.querySelector(".session-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSession(s.id);
    });
    // Double-click to rename session title
    const titleSpan = li.querySelector(".session-title");
    titleSpan.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      startInlineEdit(titleSpan, s.id, displayTitle);
    });
    li.addEventListener("click", async (e) => {
      if (e.target.closest(".session-delete") || e.target.closest(".session-pin") || e.target.closest(".session-title-edit")) return;
      sessionId = s.id;
      if (s.project_path) {
        projectSelect.value = s.project_path;
        localStorage.setItem("shawkat-ai-cwd", s.project_path);
      }

      // Auto-switch mode based on session type
      const needsParallel = s.mode === "parallel" || s.mode === "both";
      if (needsParallel && !parallelMode) {
        enterParallelMode();
      } else if (!needsParallel && parallelMode) {
        exitParallelMode();
      }

      // Clear current content
      if (parallelMode) {
        for (const chatId of CHAT_IDS) {
          const pane = panes.get(chatId);
          if (pane) pane.messagesDiv.innerHTML = "";
        }
      } else {
        messagesDiv.innerHTML = "";
      }
      await loadMessages(s.id);
      loadSessions();
    });
    sessionList.appendChild(li);
  }
}

// Inline session title editing
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
      await renameSession(sessionIdToEdit, newTitle);
    }
    loadSessions();
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      loadSessions(); // cancel, restore original
    }
  });
  input.addEventListener("blur", commitEdit);
}

async function renameSession(sid, newTitle) {
  try {
    await fetch(`/api/sessions/${encodeURIComponent(sid)}/title`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    });
  } catch (err) {
    console.error("Failed to rename session:", err);
  }
}

// Delete a session
async function deleteSession(id) {
  try {
    await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (id === sessionId) {
      sessionId = null;
      if (parallelMode) {
        for (const chatId of CHAT_IDS) {
          const pane = panes.get(chatId);
          if (pane) pane.messagesDiv.innerHTML = "";
        }
      } else {
        messagesDiv.innerHTML = "";
      }
    }
    await loadSessions();
  } catch (err) {
    console.error("Failed to delete session:", err);
  }
}

// Account info
async function loadAccountInfo() {
  try {
    const res = await fetch("/api/account");
    const data = await res.json();
    if (data.email) {
      accountEmail.textContent = data.email;
      accountPlan.textContent = data.plan ? `[${data.plan}]` : "";
    } else {
      accountEmail.textContent = "---";
      accountPlan.textContent = "";
    }
  } catch (err) {
    console.error("Failed to load account info:", err);
  }
}

// Stats — total cost + per-project cost
async function loadStats() {
  try {
    const cwd = projectSelect.value;
    const url = cwd
      ? `/api/stats?project_path=${encodeURIComponent(cwd)}`
      : "/api/stats";
    const res = await fetch(url);
    const data = await res.json();
    if (data.totalCost != null) {
      totalCostEl.textContent = "$" + data.totalCost.toFixed(2);
    }
    if (data.projectCost != null) {
      projectCostEl.textContent = "$" + data.projectCost.toFixed(2);
    } else {
      projectCostEl.textContent = "$0.00";
    }
  } catch (err) {
    console.error("Failed to load stats:", err);
  }
}

// Markdown rendering (basic + syntax highlighting support)
function renderMarkdown(text) {
  let html = escapeHtml(text);

  // Code blocks — wrap in .code-block-wrapper for copy button positioning
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, lang, code) => {
      const langClass = lang ? `language-${lang}` : "";
      return `<div class="code-block-wrapper"><pre><code class="${langClass}" data-lang="${lang}">${code}</code></pre></div>`;
    }
  );

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Line breaks
  html = html.replace(/\n/g, "<br>");

  return html;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function getToolDetail(name, input) {
  if (!input) return "";
  if (input.file_path) return escapeHtml(input.file_path);
  if (input.command) return escapeHtml(input.command.slice(0, 80));
  if (input.pattern) return escapeHtml(input.pattern);
  if (input.query) return escapeHtml(input.query);
  if (input.prompt) return escapeHtml(input.prompt.slice(0, 80));
  return "";
}

// Event listeners — single mode
sendBtn.addEventListener("click", () => sendMessage(getPane(null)));
stopBtn.addEventListener("click", () => stopGeneration(getPane(null)));

messageInput.addEventListener("keydown", (e) => {
  if (handleAutocompleteKeydown(e, getPane(null))) return;
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage(getPane(null));
  }
});

// Auto-resize textarea + autocomplete
messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + "px";
  handleSlashAutocomplete(getPane(null));
});

// Session search with debounce
const sessionSearchInput = document.getElementById("session-search");
let searchDebounceTimer = null;
sessionSearchInput.addEventListener("input", () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    loadSessions(sessionSearchInput.value.trim());
  }, 200);
});

function updateHeaderProjectName() {
  const opt = projectSelect.options[projectSelect.selectedIndex];
  headerProjectName.textContent = opt && opt.value ? opt.textContent : "";
}

// Project commands (commands.json)
async function loadProjectCommands() {
  // Remove old project commands and skills
  for (const [name, cmd] of Object.entries(commandRegistry)) {
    if (cmd.category === "project" || cmd.category === "skill") delete commandRegistry[name];
  }

  const cwd = projectSelect.value;
  if (!cwd) return;

  try {
    const res = await fetch(`/api/projects/commands?path=${encodeURIComponent(cwd)}`);
    const commands = await res.json();
    if (!Array.isArray(commands) || commands.length === 0) return;

    for (const c of commands) {
      const slug = c.command; // preserve original name (e.g. "speckit.analyze")
      if (!slug || commandRegistry[slug]) continue; // skip conflicts
      const hasArgs = c.prompt.includes("$ARGUMENTS");
      const label = c.source === "skill" ? `${c.description}` : (c.description || c.command);
      registerCommand(slug, {
        category: c.source === "skill" ? "skill" : "project",
        description: label,
        needsArgs: hasArgs,
        argumentHint: c.argumentHint || "",
        execute(args, pane) {
          let prompt = c.prompt;
          if (hasArgs) {
            prompt = prompt.replace(/\$ARGUMENTS/g, args || "");
          }
          pane.messageInput.value = prompt;
          pane.messageInput.style.height = "auto";
          pane.messageInput.style.height = Math.min(pane.messageInput.scrollHeight, 200) + "px";
          sendMessage(pane);
        },
      });
    }
  } catch (err) {
    console.error("Failed to load project commands:", err);
  }
}

projectSelect.addEventListener("change", () => {
  localStorage.setItem("shawkat-ai-cwd", projectSelect.value);
  sessionId = null;
  updateSystemPromptIndicator();
  updateHeaderProjectName();
  loadProjectCommands();
  if (parallelMode) {
    for (const chatId of CHAT_IDS) {
      const pane = panes.get(chatId);
      if (pane) pane.messagesDiv.innerHTML = "";
    }
  } else {
    messagesDiv.innerHTML = "";
  }
  loadSessions();
  loadStats();
});

newSessionBtn.addEventListener("click", () => {
  sessionId = null;
  if (parallelMode) {
    for (const chatId of CHAT_IDS) {
      const pane = panes.get(chatId);
      if (pane) {
        pane.messagesDiv.innerHTML = "";
        pane.currentAssistantMsg = null;
      }
    }
  } else {
    messagesDiv.innerHTML = "";
  }
  loadSessions();
  if (!parallelMode) messageInput.focus();
});

// Parallel mode toggle (checkbox)
toggleParallelBtn.addEventListener("change", () => {
  if (toggleParallelBtn.checked) {
    enterParallelMode();
  } else {
    exitParallelMode();
  }
});

// Prompt Toolbox
const promptModal = document.getElementById("prompt-modal");
const promptForm = document.getElementById("prompt-form");
const modalCloseBtn = document.getElementById("modal-close");
const modalCancelBtn = document.getElementById("modal-cancel");

async function loadPrompts() {
  try {
    const res = await fetch("/api/prompts");
    prompts = await res.json();
    renderToolbox();
    registerPromptCommands();
  } catch (err) {
    console.error("Failed to load prompts:", err);
  }
}

function renderToolbox() {
  toolboxPanel.innerHTML = "";
  prompts.forEach((p, idx) => {
    const card = document.createElement("div");
    card.className = "toolbox-card";
    card.innerHTML = `
      <button class="toolbox-card-delete" data-idx="${idx}" title="Delete prompt">&times;</button>
      <div class="toolbox-card-title">${escapeHtml(p.title)}</div>
      <div class="toolbox-card-desc">${escapeHtml(p.description)}</div>
    `;
    card.title = p.description;
    card.addEventListener("click", (e) => {
      if (e.target.closest(".toolbox-card-delete")) return;
      const variables = extractVariables(p.prompt);
      toolboxPanel.classList.add("hidden");
      toolboxBtn.classList.remove("active");
      if (variables.length > 0) {
        // Show variables form
        const existingForm = document.querySelector(".prompt-variables-form");
        if (existingForm) existingForm.remove();
        const form = renderVariablesForm(p.prompt, variables, (filledPrompt) => {
          messageInput.value = filledPrompt;
          messageInput.style.height = "auto";
          messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + "px";
          sendMessage(getPane(null));
        });
        // Insert form where toolbox panel is
        toolboxPanel.parentElement.appendChild(form);
        const firstInput = form.querySelector("input");
        if (firstInput) firstInput.focus();
      } else {
        messageInput.value = p.prompt;
        messageInput.style.height = "auto";
        messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + "px";
        messageInput.focus();
      }
    });
    card.querySelector(".toolbox-card-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      deletePrompt(idx);
    });
    toolboxPanel.appendChild(card);
  });

  // "Add new" card
  const addCard = document.createElement("div");
  addCard.className = "toolbox-card-add";
  addCard.innerHTML = `+ Add Prompt`;
  addCard.addEventListener("click", () => openPromptModal());
  toolboxPanel.appendChild(addCard);
}

function openPromptModal() {
  promptForm.reset();
  promptModal.classList.remove("hidden");
  document.getElementById("prompt-title").focus();
}

function closePromptModal() {
  promptModal.classList.add("hidden");
}

async function savePrompt(title, description, prompt) {
  try {
    const res = await fetch("/api/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, prompt }),
    });
    if (!res.ok) throw new Error("Failed to save");
    await loadPrompts();
  } catch (err) {
    console.error("Failed to save prompt:", err);
  }
}

async function deletePrompt(idx) {
  try {
    const res = await fetch(`/api/prompts/${idx}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete");
    await loadPrompts();
  } catch (err) {
    console.error("Failed to delete prompt:", err);
  }
}

promptForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("prompt-title").value.trim();
  const description = document.getElementById("prompt-desc").value.trim();
  const prompt = document.getElementById("prompt-text").value.trim();
  if (title && description && prompt) {
    await savePrompt(title, description, prompt);
    closePromptModal();
  }
});

modalCloseBtn.addEventListener("click", closePromptModal);
modalCancelBtn.addEventListener("click", closePromptModal);
promptModal.addEventListener("click", (e) => {
  if (e.target === promptModal) closePromptModal();
});

// ── Workflows ─────────────────────────────────────────
let workflows = [];
const workflowBtn = document.getElementById("workflow-btn");
const workflowPanel = document.getElementById("workflow-panel");

async function loadWorkflows() {
  try {
    const res = await fetch("/api/workflows");
    workflows = await res.json();
    renderWorkflowPanel();
    registerWorkflowCommands();
  } catch (err) {
    console.error("Failed to load workflows:", err);
  }
}

function renderWorkflowPanel() {
  workflowPanel.innerHTML = "";
  for (const wf of workflows) {
    const card = document.createElement("div");
    card.className = "toolbox-card";
    card.innerHTML = `
      <div class="toolbox-card-title">${escapeHtml(wf.title)}</div>
      <div class="toolbox-card-desc">${escapeHtml(wf.description)}</div>
    `;
    card.addEventListener("click", () => {
      workflowPanel.classList.add("hidden");
      workflowBtn.classList.remove("active");
      startWorkflow(wf, getPane(null));
    });
    workflowPanel.appendChild(card);
  }
}

function registerWorkflowCommands() {
  // Remove old workflow commands
  for (const [name, cmd] of Object.entries(commandRegistry)) {
    if (cmd.category === "workflow") delete commandRegistry[name];
  }
  for (const wf of workflows) {
    registerCommand(wf.id, {
      category: "workflow",
      description: wf.description,
      execute(args, pane) {
        startWorkflow(wf, pane);
      },
    });
  }
}

function startWorkflow(workflow, pane) {
  pane = pane || getPane(null);
  const cwd = projectSelect.value;
  if (!cwd) {
    addStatus("Select a project first", true, pane);
    return;
  }

  // Render workflow progress header
  const div = document.createElement("div");
  div.className = "msg";
  const header = document.createElement("div");
  header.className = "workflow-header";
  header.innerHTML = `
    <div class="workflow-title">${escapeHtml(workflow.title)}</div>
    <div class="workflow-progress" id="workflow-progress">
      ${workflow.steps.map((s, i) => `
        <div class="workflow-step" data-step="${i}">
          <span class="workflow-step-dot pending"></span>
          <span class="workflow-step-label">${escapeHtml(s.label)}</span>
        </div>
      `).join("")}
    </div>
  `;
  div.appendChild(header);
  pane.messagesDiv.appendChild(div);
  scrollToBottom(pane);

  pane.isStreaming = true;
  if (!parallelMode) {
    sendBtn.classList.add("hidden");
    stopBtn.classList.remove("hidden");
  }

  const selectedOption = projectSelect.options[projectSelect.selectedIndex];
  const projectName = selectedOption?.textContent || "Session";

  ws.send(JSON.stringify({
    type: "workflow",
    workflow,
    cwd,
    sessionId,
    projectName,
  }));

  showThinking(`Running workflow: ${workflow.title}...`, pane);
}

workflowBtn.addEventListener("click", () => {
  const isOpen = !workflowPanel.classList.contains("hidden");
  // Close other panels
  toolboxPanel.classList.add("hidden");
  toolboxBtn.classList.remove("active");
  if (isOpen) {
    workflowPanel.classList.add("hidden");
    workflowBtn.classList.remove("active");
  } else {
    workflowPanel.classList.remove("hidden");
    workflowBtn.classList.add("active");
  }
});

loadWorkflows();

toolboxBtn.addEventListener("click", () => {
  const isOpen = !toolboxPanel.classList.contains("hidden");
  // Close other panels
  workflowPanel.classList.add("hidden");
  workflowBtn.classList.remove("active");
  if (isOpen) {
    toolboxPanel.classList.add("hidden");
    toolboxBtn.classList.remove("active");
  } else {
    toolboxPanel.classList.remove("hidden");
    toolboxBtn.classList.add("active");
  }
});

// ── Feature 9: Response Formatting ────────────────────

// Initialize Mermaid
if (typeof mermaid !== "undefined") {
  mermaid.initialize({ startOnLoad: false, theme: "dark" });
}

// Syntax highlighting for code blocks
function highlightCodeBlocks(container) {
  if (typeof hljs === "undefined") return;
  container.querySelectorAll("pre code[class*='language-']").forEach((block) => {
    // Skip already highlighted blocks
    if (block.dataset.highlighted === "yes") return;
    try {
      hljs.highlightElement(block);
    } catch { /* ignore unsupported languages */ }
  });
}

// Add copy buttons to code blocks
function addCopyButtons(container) {
  container.querySelectorAll(".code-block-wrapper").forEach((wrapper) => {
    // Skip if already has a copy button
    if (wrapper.querySelector(".code-copy-btn")) return;
    const btn = document.createElement("button");
    btn.className = "code-copy-btn";
    btn.textContent = "Copy";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const code = wrapper.querySelector("code");
      if (code) {
        navigator.clipboard.writeText(code.textContent).then(() => {
          btn.textContent = "Copied!";
          btn.classList.add("copied");
          setTimeout(() => {
            btn.textContent = "Copy";
            btn.classList.remove("copied");
          }, 2000);
        });
      }
    });
    wrapper.appendChild(btn);
  });
}

// Render Mermaid diagrams
let mermaidCounter = 0;
function renderMermaidBlocks(container) {
  if (typeof mermaid === "undefined") return;
  container.querySelectorAll('.code-block-wrapper code[data-lang="mermaid"]').forEach((block) => {
    const wrapper = block.closest(".code-block-wrapper");
    if (!wrapper || wrapper.dataset.mermaidRendered) return;
    wrapper.dataset.mermaidRendered = "true";

    const source = block.textContent;
    const id = `mermaid-${++mermaidCounter}`;
    try {
      mermaid.render(id, source).then(({ svg }) => {
        const div = document.createElement("div");
        div.className = "mermaid-container";
        div.innerHTML = svg;
        wrapper.replaceWith(div);
      }).catch(() => {
        // Leave original code block on error
      });
    } catch {
      // Sync error — leave code block
    }
  });
}

// ── Feature 8: Keyboard Shortcuts ─────────────────────

const shortcutsModal = document.getElementById("shortcuts-modal");

function closeAllModals() {
  document.querySelectorAll(".modal-overlay").forEach((m) => m.classList.add("hidden"));
}

document.getElementById("shortcuts-modal-close").addEventListener("click", () => {
  shortcutsModal.classList.add("hidden");
});
shortcutsModal.addEventListener("click", (e) => {
  if (e.target === shortcutsModal) shortcutsModal.classList.add("hidden");
});

document.addEventListener("keydown", (e) => {
  const isMeta = e.metaKey || e.ctrlKey;

  // Escape — close any modal
  if (e.key === "Escape") {
    closeAllModals();
    return;
  }

  // Don't intercept when user is typing in an input/textarea (unless it's a meta combo)
  const tag = document.activeElement?.tagName;
  if (!isMeta && (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT")) return;

  if (isMeta && e.key === "k") {
    e.preventDefault();
    const searchInput = document.getElementById("session-search");
    if (searchInput) searchInput.focus();
    return;
  }

  if (isMeta && e.key === "n") {
    e.preventDefault();
    newSessionBtn.click();
    return;
  }

  if (isMeta && e.key === "/") {
    e.preventDefault();
    shortcutsModal.classList.toggle("hidden");
    return;
  }

  // Cmd+1 through Cmd+4 — focus parallel panes
  if (isMeta && parallelMode && e.key >= "1" && e.key <= "4") {
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
    shortcutsModal.classList.remove("hidden");
  },
});

// ── Feature 7: Cost Dashboard ─────────────────────────

const costDashboardModal = document.getElementById("cost-dashboard-modal");
const costModalClose = document.getElementById("cost-modal-close");

// Click on cost display to open dashboard
document.querySelector(".term-costs").addEventListener("click", openCostDashboard);

costModalClose.addEventListener("click", () => {
  costDashboardModal.classList.add("hidden");
});
costDashboardModal.addEventListener("click", (e) => {
  if (e.target === costDashboardModal) costDashboardModal.classList.add("hidden");
});

async function openCostDashboard() {
  costDashboardModal.classList.remove("hidden");
  const cwd = projectSelect.value;
  const url = cwd
    ? `/api/stats/dashboard?project_path=${encodeURIComponent(cwd)}`
    : "/api/stats/dashboard";
  try {
    const res = await fetch(url);
    const data = await res.json();
    renderCostDashboard(data);
  } catch (err) {
    console.error("Failed to load cost dashboard:", err);
  }
}

function renderCostDashboard(data) {
  // Summary cards
  const cardsEl = document.getElementById("cost-summary-cards");
  const todayCost = data.timeline
    .filter((t) => t.date === new Date().toISOString().slice(0, 10))
    .reduce((sum, t) => sum + t.cost, 0);

  cardsEl.innerHTML = `
    <div class="cost-card">
      <div class="cost-card-label">Total</div>
      <div class="cost-card-value">$${data.totalCost.toFixed(2)}</div>
    </div>
    <div class="cost-card">
      <div class="cost-card-label">Project</div>
      <div class="cost-card-value">$${(data.projectCost ?? data.totalCost).toFixed(2)}</div>
    </div>
    <div class="cost-card">
      <div class="cost-card-label">Today</div>
      <div class="cost-card-value">$${todayCost.toFixed(4)}</div>
    </div>
  `;

  // Per-session table
  const tbody = document.getElementById("cost-table-body");
  tbody.innerHTML = "";
  for (const s of data.sessions) {
    if (s.total_cost === 0) continue;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td title="${escapeHtml(s.id)}">${escapeHtml(s.title || s.project_name || "Session")}</td>
      <td>${s.turns}</td>
      <td>$${s.total_cost.toFixed(4)}</td>
    `;
    tbody.appendChild(tr);
  }

  // Sort table on header click
  document.querySelectorAll(".cost-table th[data-sort]").forEach((th) => {
    th.onclick = () => {
      const key = th.dataset.sort;
      const rows = [...tbody.querySelectorAll("tr")];
      rows.sort((a, b) => {
        const aVal = a.children[key === "title" ? 0 : key === "turns" ? 1 : 2].textContent;
        const bVal = b.children[key === "title" ? 0 : key === "turns" ? 1 : 2].textContent;
        if (key === "title") return aVal.localeCompare(bVal);
        return parseFloat(bVal.replace("$", "")) - parseFloat(aVal.replace("$", ""));
      });
      tbody.innerHTML = "";
      rows.forEach((r) => tbody.appendChild(r));
    };
  });

  // Daily cost chart
  const chartEl = document.getElementById("cost-chart");
  chartEl.innerHTML = "";
  if (data.timeline.length === 0) {
    chartEl.innerHTML = '<div style="color: var(--text-dim); font-size: 12px; padding: 8px;">No cost data yet</div>';
    return;
  }
  const maxCost = Math.max(...data.timeline.map((t) => t.cost), 0.001);
  for (const day of data.timeline) {
    const pct = Math.round((day.cost / maxCost) * 100);
    const row = document.createElement("div");
    row.className = "cost-chart-row";
    row.innerHTML = `
      <span class="cost-chart-label">${day.date.slice(5)}</span>
      <div class="cost-chart-bar-bg"><div class="cost-chart-bar" style="width: ${pct}%"></div></div>
      <span class="cost-chart-value">$${day.cost.toFixed(2)}</span>
    `;
    chartEl.appendChild(row);
  }
}

registerCommand("costs", {
  category: "app",
  description: "Open cost dashboard",
  execute() {
    openCostDashboard();
  },
});

// ── Feature 14: Dark/Light Theme Toggle ───────────────

const themeToggleBtn = document.getElementById("theme-toggle-btn");
const themeIconSun = document.getElementById("theme-icon-sun");
const themeIconMoon = document.getElementById("theme-icon-moon");

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("shawkat-ai-theme", theme);

  // Update icon visibility
  if (theme === "light") {
    themeIconSun.style.display = "none";
    themeIconMoon.style.display = "block";
  } else {
    themeIconSun.style.display = "block";
    themeIconMoon.style.display = "none";
  }

  // Update Mermaid theme
  if (typeof mermaid !== "undefined") {
    mermaid.initialize({ startOnLoad: false, theme: theme === "light" ? "default" : "dark" });
  }

  // Update highlight.js theme stylesheet
  const hljsLink = document.getElementById("hljs-theme");
  if (hljsLink) {
    hljsLink.href = theme === "light"
      ? "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css"
      : "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css";
  }
}

// Initialize theme from localStorage
const savedTheme = localStorage.getItem("shawkat-ai-theme") || "dark";
applyTheme(savedTheme);

themeToggleBtn.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
});

registerCommand("theme", {
  category: "app",
  description: "Toggle dark/light theme",
  execute() {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(current === "dark" ? "light" : "dark");
  },
});

// ── Feature 12: Prompt Variables / Templates ──────────

function extractVariables(promptText) {
  const matches = promptText.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  // Return unique variable names without braces
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

function renderVariablesForm(promptText, variables, onSubmit) {
  const form = document.createElement("div");
  form.className = "prompt-variables-form";

  const title = document.createElement("h4");
  title.textContent = "Fill in template variables";
  form.appendChild(title);

  const inputs = {};
  for (const varName of variables) {
    const group = document.createElement("div");
    group.className = "prompt-var-group";

    const label = document.createElement("label");
    label.textContent = `{{${varName}}}`;
    group.appendChild(label);

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = varName;
    input.dataset.varName = varName;
    group.appendChild(input);

    inputs[varName] = input;
    form.appendChild(group);
  }

  const sendBtn = document.createElement("button");
  sendBtn.className = "prompt-var-send";
  sendBtn.textContent = "Send";
  sendBtn.addEventListener("click", () => {
    let result = promptText;
    for (const [varName, input] of Object.entries(inputs)) {
      const value = input.value.trim() || varName;
      result = result.replace(new RegExp(`\\{\\{${varName}\\}\\}`, "g"), value);
    }
    form.remove();
    onSubmit(result);
  });
  form.appendChild(sendBtn);

  // Allow Enter in last input to submit
  const inputEls = Object.values(inputs);
  if (inputEls.length > 0) {
    inputEls[inputEls.length - 1].addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendBtn.click();
      }
    });
  }

  return form;
}

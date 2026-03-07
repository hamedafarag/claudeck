// Message rendering
import { escapeHtml, getToolDetail, scrollToBottom } from './utils.js';
import { renderMarkdown, highlightCodeBlocks, addCopyButtons, renderMermaidBlocks } from './formatting.js';
import { renderDiffView, renderAdditionsView } from './diff.js';
import { getState, setState } from './store.js';
import { $ } from './dom.js';
import { getPane } from './parallel.js';

export function addUserMessage(text, pane, images = []) {
  pane = pane || getPane(null);
  pane.currentAssistantMsg = null;
  const div = document.createElement("div");
  div.className = "msg msg-user";

  const label = document.createElement("span");
  label.className = "msg-user-label";
  label.textContent = "YOU";

  const body = document.createElement("span");
  body.className = "msg-user-body";
  body.textContent = text;

  div.appendChild(label);
  div.appendChild(body);

  if (images && images.length > 0) {
    renderChatImages(images, div);
  }

  pane.messagesDiv.appendChild(div);
  scrollToBottom(pane);
}

function renderChatImages(images, container) {
  const strip = document.createElement("div");
  strip.className = "chat-image-strip";

  for (const img of images) {
    const imgEl = document.createElement("img");
    imgEl.className = "chat-image-thumb";
    imgEl.src = `data:${img.mimeType};base64,${img.data}`;
    imgEl.alt = img.name || "attached image";
    imgEl.title = img.name || "attached image";
    imgEl.addEventListener("click", () => {
      const overlay = document.createElement("div");
      overlay.className = "chat-image-overlay";
      const fullImg = document.createElement("img");
      fullImg.src = imgEl.src;
      overlay.appendChild(fullImg);
      overlay.addEventListener("click", () => overlay.remove());
      document.body.appendChild(overlay);
    });
    strip.appendChild(imgEl);
  }

  container.appendChild(strip);
}

export function appendAssistantText(text, pane) {
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
  let count = getState("streamingCharCount") + text.length;
  setState("streamingCharCount", count);
  const tokenEst = Math.round(count / 4);
  if ($.streamingTokens) {
    $.streamingTokens.textContent = `~${tokenEst} tokens`;
    $.streamingTokens.classList.remove("hidden");
  }
}

export function appendToolIndicator(name, input, pane, toolId, isLive = true) {
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

  // Default tool indicator — show spinner only for live streaming tools
  const indicator = document.createElement("div");
  indicator.className = isLive ? "tool-indicator tool-running" : "tool-indicator";
  if (toolId) indicator.dataset.toolId = toolId;
  indicator.innerHTML = `
    <span class="tool-spinner" ${!isLive ? 'style="display:none;"' : ""}></span>
    <span class="tool-status-icon" style="display:none;"></span>
    <span class="tool-name">${escapeHtml(name)}</span>
    <span class="tool-detail">${getToolDetail(name, input)}</span>
    <div class="tool-body">${escapeHtml(JSON.stringify(input, null, 2))}</div>
    <div class="tool-result-preview" style="display:none;"></div>
  `;
  indicator.addEventListener("click", () => {
    indicator.classList.toggle("expanded");
  });

  div.appendChild(indicator);
  pane.messagesDiv.appendChild(div);
  pane.currentAssistantMsg = null;
  scrollToBottom(pane);
}

export function appendToolResult(toolUseId, content, isError, pane) {
  pane = pane || getPane(null);

  // Try to find the matching tool indicator and update it in-place
  const existing = toolUseId
    ? pane.messagesDiv.querySelector(`.tool-indicator[data-tool-id="${toolUseId}"]`)
    : null;

  if (existing) {
    // Update the existing indicator: stop spinner, show status icon + result
    existing.classList.remove("tool-running");
    existing.classList.add(isError ? "tool-error" : "tool-done");

    const spinner = existing.querySelector(".tool-spinner");
    if (spinner) spinner.style.display = "none";

    const statusIcon = existing.querySelector(".tool-status-icon");
    if (statusIcon) {
      statusIcon.style.display = "";
      statusIcon.style.color = isError ? "var(--error)" : "var(--success)";
      statusIcon.innerHTML = isError ? "&#10007;" : "&#10003;";
    }

    // Show result preview inline
    const resultPreview = existing.querySelector(".tool-result-preview");
    if (resultPreview && content) {
      const preview = typeof content === "string" ? content.slice(0, 150) : "";
      resultPreview.textContent = preview;
      resultPreview.style.display = "";
      resultPreview.className = "tool-result-preview" + (isError ? " error" : "");
    }

    // Append full result to tool-body
    const body = existing.querySelector(".tool-body");
    if (body && content) {
      body.innerHTML += "\n\n─── Result ───\n" + escapeHtml(content || "");
    }

    scrollToBottom(pane);
    return;
  }

  // Fallback: create a standalone result element (for old messages without tool IDs)
  const div = document.createElement("div");
  div.className = "msg";

  const indicator = document.createElement("div");
  indicator.className = "tool-indicator " + (isError ? "tool-error" : "tool-done");
  const preview = typeof content === "string" ? content.slice(0, 120) : "";
  const iconColor = isError ? "var(--error)" : "var(--success)";
  const icon = isError ? "&#10007;" : "&#10003;";
  indicator.innerHTML = `
    <span class="tool-status-icon" style="color: ${iconColor};">${icon}</span>
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

export function showThinking(label, pane) {
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
  if (pane.statusEl) {
    pane.statusEl.textContent = "streaming";
    pane.statusEl.className = "chat-pane-status streaming";
  }
  scrollToBottom(pane);
}

export function removeThinking(pane) {
  pane = pane || getPane(null);
  const el = pane.messagesDiv.querySelector('[data-thinking-bar="true"]');
  if (el) el.remove();
}

export function addResultSummary(msg, pane) {
  pane = pane || getPane(null);
  const parts = [];
  if (msg.model) parts.push(msg.model);
  if (msg.num_turns != null) parts.push(`${msg.num_turns} turn${msg.num_turns !== 1 ? "s" : ""}`);
  if (msg.duration_ms != null) {
    const secs = (msg.duration_ms / 1000).toFixed(1);
    parts.push(`${secs}s`);
  }
  if (msg.cost_usd != null) parts.push(`$${msg.cost_usd.toFixed(4)}`);
  const totalTokens = (msg.input_tokens || 0) + (msg.output_tokens || 0);
  if (totalTokens > 0) {
    const fmt = totalTokens >= 1000 ? (totalTokens / 1000).toFixed(1) + 'k' : String(totalTokens);
    parts.push(`${fmt} tokens`);
  }
  if (msg.stop_reason && msg.stop_reason !== "success") {
    parts.push(`[${msg.stop_reason}]`);
  }
  if (parts.length > 0) {
    addStatus(parts.join(" \u00b7 "), false, pane);
  }
}

export function addStatus(text, isError, pane) {
  pane = pane || getPane(null);
  const div = document.createElement("div");
  div.className = "status" + (isError ? " error" : "");
  div.textContent = text;
  pane.messagesDiv.appendChild(div);
  scrollToBottom(pane);
}

export function appendCliOutput(data, pane) {
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

export function renderMessagesIntoPane(messages, pane) {
  pane.messagesDiv.innerHTML = "";
  pane.currentAssistantMsg = null;
  // Reset streaming counter — we're loading saved messages, not streaming
  setState("streamingCharCount", 0);
  for (const msg of messages) {
    const data = JSON.parse(msg.content);
    switch (msg.role) {
      case "user":
        addUserMessage(data.text, pane, data.images || []);
        break;
      case "assistant":
        appendAssistantText(data.text, pane);
        break;
      case "tool":
        appendToolIndicator(data.name, data.input, pane, data.id, false);
        break;
      case "tool_result":
        appendToolResult(data.toolUseId, data.content, data.isError, pane);
        break;
      case "result":
        addResultSummary(data, pane);
        break;
      case "error": {
        const errorParts = [];
        if (data.subtype) errorParts.push(`[${data.subtype}]`);
        if (data.error) errorParts.push(data.error);
        if (data.cost_usd != null) errorParts.push(`$${data.cost_usd.toFixed(4)}`);
        if (data.model) errorParts.push(data.model);
        addStatus(errorParts.join(" \u00b7 ") || "Error", true, pane);
        break;
      }
      case "aborted":
        addStatus("Aborted", true, pane);
        break;
    }
  }
  pane.currentAssistantMsg = null;
  // Hide token counter and reset — loading saved messages shouldn't show streaming stats
  setState("streamingCharCount", 0);
  if ($.streamingTokens) $.streamingTokens.classList.add("hidden");
  highlightCodeBlocks(pane.messagesDiv);
  addCopyButtons(pane.messagesDiv);
  renderMermaidBlocks(pane.messagesDiv);
}

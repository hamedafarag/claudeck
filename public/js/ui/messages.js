// Message rendering
import { escapeHtml, getToolDetail, scrollToBottom } from '../core/utils.js';
import { renderMarkdown, highlightCodeBlocks, addCopyButtons, renderMermaidBlocks } from './formatting.js';
import { renderDiffView, renderAdditionsView } from './diff.js';
import { getState, setState } from '../core/store.js';
import { $ } from '../core/dom.js';
import { getPane } from './parallel.js';

const WELCOME_GREETINGS = [
  "What can I help you build today?",
  "Ready when you are!",
  "Let's create something great together",
  "What's on your mind?",
  "Let's turn your ideas into code",
  "What are we working on today?",
  "Got a bug to squash or a feature to ship?",
  "Your next big idea starts here",
  "Let's make something awesome",
  "How can I help you today?",
  "What challenge are we tackling today?",
  "Let's get things done together",
];

function getRandomGreeting() {
  return WELCOME_GREETINGS[Math.floor(Math.random() * WELCOME_GREETINGS.length)];
}

function getChatAreaMain() {
  return document.querySelector('.chat-area-main');
}

export function showWelcomeState() {
  const chatMain = getChatAreaMain();
  if (!chatMain) return;
  // Create the welcome center element if it doesn't exist
  let welcomeEl = chatMain.querySelector('.welcome-center');
  if (!welcomeEl) {
    welcomeEl = document.createElement('div');
    welcomeEl.className = 'welcome-center';
    welcomeEl.innerHTML = `<img class="whaly-welcome-img" src="/icons/whaly.png" alt="Whaly" draggable="false"><div class="welcome-greeting">${getRandomGreeting()}</div>`;
    // Insert before the input-bar
    const inputBar = chatMain.querySelector('.input-bar');
    if (inputBar) {
      chatMain.insertBefore(welcomeEl, inputBar);
    } else {
      chatMain.appendChild(welcomeEl);
    }
  } else {
    // Update greeting text
    const greetingEl = welcomeEl.querySelector('.welcome-greeting');
    if (greetingEl) greetingEl.textContent = getRandomGreeting();
  }
  chatMain.classList.remove('welcome-exit');
  chatMain.classList.add('welcome-state');
}

export function exitWelcomeState() {
  const chatMain = getChatAreaMain();
  if (!chatMain || !chatMain.classList.contains('welcome-state')) return Promise.resolve();

  return new Promise(resolve => {
    chatMain.classList.add('welcome-exit');

    const onEnd = () => {
      chatMain.classList.remove('welcome-state', 'welcome-exit');
      resolve();
    };
    // Listen for the fade-out animation on the welcome center
    const welcomeEl = chatMain.querySelector('.welcome-center');
    if (welcomeEl) {
      welcomeEl.addEventListener('animationend', onEnd, { once: true });
    } else {
      onEnd();
    }
  });
}

export function isWelcomeStateActive() {
  const chatMain = getChatAreaMain();
  return chatMain?.classList.contains('welcome-state') || false;
}

export function showWhalyPlaceholder(pane) {
  pane = pane || getPane(null);
  removeWhalyPlaceholder(pane);
  // Use welcome state for the main (non-parallel) pane when the DOM supports it
  const parallelMode = getState("parallelMode");
  if (!parallelMode && getChatAreaMain()) {
    showWelcomeState();
  }
  // Always add the placeholder into the messages div (tests + parallel mode rely on this)
  const el = document.createElement("div");
  el.className = "whaly-placeholder";
  el.innerHTML = `<img src="/icons/whaly.png" alt="Whaly" draggable="false"><div class="whaly-text">~ start chatting with claude ~</div><div class="whaly-hint">Type a message or select a prompt template</div>`;
  pane.messagesDiv.appendChild(el);
}

export function removeWhalyPlaceholder(pane) {
  pane = pane || getPane(null);
  const existing = pane.messagesDiv.querySelector(".whaly-placeholder");
  if (existing) existing.remove();
}

export function addUserMessage(text, pane, images = [], filePaths = []) {
  pane = pane || getPane(null);
  removeWhalyPlaceholder(pane);
  // Exit welcome state immediately (no animation — message renders right away)
  const chatMain = getChatAreaMain();
  if (chatMain) chatMain.classList.remove('welcome-state', 'welcome-exit');
  pane.currentAssistantMsg = null;
  const div = document.createElement("div");
  div.className = "msg msg-user";

  const label = document.createElement("span");
  label.className = "msg-user-label";
  label.textContent = "YOU";

  div.appendChild(label);

  if (filePaths && filePaths.length > 0) {
    const filesDiv = document.createElement("div");
    filesDiv.className = "msg-user-files";
    for (const fp of filePaths) {
      const fileTag = document.createElement("span");
      fileTag.className = "msg-user-file-tag";
      fileTag.textContent = fp;
      fileTag.title = fp;
      filesDiv.appendChild(fileTag);
    }
    div.appendChild(filesDiv);
  }

  const body = document.createElement("span");
  body.className = "msg-user-body";
  body.textContent = text;

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
    if ($.streamingTokensValue) $.streamingTokensValue.textContent = `~${tokenEst} tokens`;
    $.streamingTokens.classList.remove("hidden");
    if ($.streamingTokensSep) $.streamingTokensSep.classList.remove("hidden");
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
  const inTok = msg.input_tokens || 0;
  const outTok = msg.output_tokens || 0;
  if (inTok > 0 || outTok > 0) {
    const fmtTok = (n) => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
    parts.push(`${fmtTok(inTok)} in / ${fmtTok(outTok)} out`);
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

export function addSkillUsedMessage(skillName, skillDescription, pane) {
  pane = pane || getPane(null);
  const div = document.createElement("div");
  div.className = "skill-used-message";
  div.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg><span><span class="skill-used-name">Skill used: ${escapeHtml(skillName)}</span>${skillDescription ? `<span class="skill-used-desc"> — ${escapeHtml(skillDescription)}</span>` : ""}</span>`;
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
  if (!messages || messages.length === 0) {
    showWhalyPlaceholder(pane);
    return;
  }
  // Exit welcome state when loading existing messages
  const chatMain = getChatAreaMain();
  if (chatMain) chatMain.classList.remove('welcome-state', 'welcome-exit');
  // Track last assistant message ID for fork button placement
  let lastAssistantMsgEl = null;
  let lastAssistantMsgId = null;

  for (const msg of messages) {
    const data = JSON.parse(msg.content);
    switch (msg.role) {
      case "user": {
        // Finalize previous assistant block with fork button
        if (lastAssistantMsgEl && lastAssistantMsgId) {
          addForkButton(lastAssistantMsgEl, lastAssistantMsgId);
          lastAssistantMsgEl = null;
          lastAssistantMsgId = null;
        }
        // Extract file paths from saved <file path="..."> blocks
        const filePathMatches = (data.text || "").match(/<file path="([^"]+)">/g);
        const savedFilePaths = filePathMatches
          ? filePathMatches.map(m => m.match(/<file path="([^"]+)">/)[1])
          : [];
        // Show only the user's actual text, not the file content blocks
        const cleanText = savedFilePaths.length > 0
          ? (data.text || "").replace(/<file path="[^"]*">[\s\S]*?<\/file>\s*/g, "").trim()
          : (data.text || "");
        addUserMessage(cleanText, pane, data.images || [], savedFilePaths);
        break;
      }
      case "assistant":
        appendAssistantText(data.text, pane);
        // Track this assistant message element for fork button
        if (pane.currentAssistantMsg) {
          lastAssistantMsgEl = pane.currentAssistantMsg.closest(".msg-assistant");
          lastAssistantMsgId = msg.id;
        }
        break;
      case "tool":
        // Render "Skill used" indicator for Skill tool_use messages
        if (data.name === "Skill" && data.input?.skill) {
          addSkillUsedMessage(data.input.skill, data.input.description || "", pane);
        }
        appendToolIndicator(data.name, data.input, pane, data.id, false);
        // Tools are part of assistant turn — update the tracking ID
        if (!lastAssistantMsgEl) lastAssistantMsgEl = pane.messagesDiv.lastElementChild;
        lastAssistantMsgId = msg.id;
        break;
      case "tool_result":
        appendToolResult(data.toolUseId, data.content, data.isError, pane);
        if (!lastAssistantMsgEl) lastAssistantMsgEl = pane.messagesDiv.lastElementChild;
        lastAssistantMsgId = msg.id;
        break;
      case "result":
        addResultSummary(data, pane);
        // Result marks end of an assistant turn — add fork button on the assistant msg element
        if (lastAssistantMsgEl && lastAssistantMsgId) {
          addForkButton(lastAssistantMsgEl, lastAssistantMsgId);
        }
        lastAssistantMsgEl = null;
        lastAssistantMsgId = null;
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
      case "skill":
        addSkillUsedMessage(data.skill || data.name || "", data.description || "", pane);
        break;
      case "aborted":
        addStatus("Aborted", true, pane);
        break;
    }
  }

  // Add fork button to last assistant message if conversation ends with one
  if (lastAssistantMsgEl && lastAssistantMsgId) {
    addForkButton(lastAssistantMsgEl, lastAssistantMsgId);
  }

  pane.currentAssistantMsg = null;
  // Hide token counter and reset — loading saved messages shouldn't show streaming stats
  setState("streamingCharCount", 0);
  if ($.streamingTokens) $.streamingTokens.classList.add("hidden");
  if ($.streamingTokensSep) $.streamingTokensSep.classList.add("hidden");
  highlightCodeBlocks(pane.messagesDiv);
  addCopyButtons(pane.messagesDiv);
  renderMermaidBlocks(pane.messagesDiv);
}

function addForkButton(msgEl, messageId) {
  if (!msgEl || msgEl.querySelector(".fork-btn")) return;
  const btn = document.createElement("button");
  btn.className = "fork-btn";
  btn.dataset.messageId = messageId;
  btn.title = "Fork conversation from here";
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`;
  msgEl.appendChild(btn);
}

// ── Lazy-loading helpers ────────────────────────────────

export function prependOlderMessages(messages, pane) {
  if (!messages || messages.length === 0) return;

  // Render older messages into a detached container using the same rendering logic
  const tempContainer = document.createElement("div");
  const tempPane = { messagesDiv: tempContainer, currentAssistantMsg: null };
  renderMessagesIntoPane(messages, tempPane);

  // Capture scroll position before DOM mutation
  const scrollHeightBefore = pane.messagesDiv.scrollHeight;

  // Move all rendered nodes into the real pane
  const fragment = document.createDocumentFragment();
  while (tempContainer.firstChild) {
    fragment.appendChild(tempContainer.firstChild);
  }

  // Insert after loading indicator (if present) or at the top
  const indicator = pane.messagesDiv.querySelector(".load-more-indicator");
  const insertRef = indicator ? indicator.nextSibling : pane.messagesDiv.firstChild;
  pane.messagesDiv.insertBefore(fragment, insertRef);

  // Restore scroll position so the user's view doesn't jump
  const scrollHeightAfter = pane.messagesDiv.scrollHeight;
  pane.messagesDiv.scrollTop += (scrollHeightAfter - scrollHeightBefore);
}

export function showLoadingIndicator(pane) {
  if (pane.messagesDiv.querySelector(".load-more-indicator")) return;
  const el = document.createElement("div");
  el.className = "load-more-indicator";
  el.innerHTML = '<span class="load-more-spinner"></span> Loading older messages\u2026';
  pane.messagesDiv.prepend(el);
}

export function hideLoadingIndicator(pane) {
  const el = pane.messagesDiv.querySelector(".load-more-indicator");
  if (el) el.remove();
}

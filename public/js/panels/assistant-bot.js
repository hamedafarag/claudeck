// Floating assistant bot — independent chat bubble with custom system prompt
import { BOT_CHAT_ID } from '../core/constants.js';
import { on } from '../core/events.js';
import { getState } from '../core/store.js';
import { renderMarkdown, highlightCodeBlocks, addCopyButtons } from '../ui/formatting.js';
import * as api from '../core/api.js';
import { getSelectedModel } from '../ui/model-selector.js';
import { $ } from '../core/dom.js';

const SESSIONS_KEY = 'claudeck-bot-sessions';
let panel, messagesDiv, inputEl, sendBtn, stopBtn, settingsOverlay, promptTextarea;
let freeBotSessionId = null;
let isStreaming = false;
let currentAssistantEl = null;
let cachedSystemPrompt = null;

// ── Session management ──────────────────────────────────

function getBotSessions() {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '{}');
  } catch { return {}; }
}

function setBotSession(projectPath, sessionId) {
  const sessions = getBotSessions();
  sessions[projectPath] = sessionId;
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

function getCurrentProject() {
  return $.projectSelect?.value || '';
}


// ── DOM creation ────────────────────────────────────────

function createBotDOM() {
  // Bubble
  const bubble = document.createElement('button');
  bubble.className = 'bot-bubble';
  bubble.innerHTML = '<img src="/icons/whaly.png" alt="Whaly" width="32" height="32">';
  bubble.title = 'Assistant Bot';
  bubble.addEventListener('click', togglePanel);

  // Panel
  panel = document.createElement('div');
  panel.className = 'bot-panel';
  panel.innerHTML = `
    <div class="bot-header">
      <span class="bot-header-title">Assistant Bot</span>
      <button class="bot-header-btn bot-new-btn" title="New chat">&#x21bb;</button>
      <button class="bot-header-btn bot-settings-btn" title="Settings">&#x2699;</button>
      <button class="bot-header-btn bot-close-btn" title="Close">&times;</button>
    </div>
    <div class="bot-messages"></div>
    <div class="bot-input-bar">
      <textarea class="bot-input" placeholder="Ask the assistant..." rows="1"></textarea>
      <button class="bot-send-btn">Send</button>
      <button class="bot-stop-btn">Stop</button>
    </div>
    <div class="bot-settings-overlay">
      <div class="bot-settings-header">
        <span>System Prompt</span>
        <button class="bot-header-btn bot-settings-close">&times;</button>
      </div>
      <div class="bot-settings-body">
        <label>Customize the assistant's behavior:</label>
        <textarea class="bot-prompt-textarea" placeholder="Enter system prompt..."></textarea>
      </div>
      <div class="bot-settings-actions">
        <button class="bot-settings-cancel">Cancel</button>
        <button class="bot-settings-save primary">Save</button>
      </div>
    </div>
  `;

  document.body.appendChild(bubble);
  document.body.appendChild(panel);

  // Cache DOM references
  messagesDiv = panel.querySelector('.bot-messages');
  inputEl = panel.querySelector('.bot-input');
  sendBtn = panel.querySelector('.bot-send-btn');
  stopBtn = panel.querySelector('.bot-stop-btn');
  settingsOverlay = panel.querySelector('.bot-settings-overlay');
  promptTextarea = panel.querySelector('.bot-prompt-textarea');
  // Event listeners
  panel.querySelector('.bot-close-btn').addEventListener('click', closePanel);
  panel.querySelector('.bot-new-btn').addEventListener('click', newBotSession);
  panel.querySelector('.bot-settings-btn').addEventListener('click', openSettings);
  panel.querySelector('.bot-settings-close').addEventListener('click', closeSettings);
  panel.querySelector('.bot-settings-cancel').addEventListener('click', closeSettings);
  panel.querySelector('.bot-settings-save').addEventListener('click', saveSettings);

  sendBtn.addEventListener('click', sendBotMessage);
  stopBtn.addEventListener('click', stopBotGeneration);

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendBotMessage();
    }
  });

  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
  });
}

// ── Panel toggle ────────────────────────────────────────

function togglePanel() {
  if (panel.classList.contains('open')) {
    closePanel();
  } else {
    openPanel();
  }
}

function openPanel() {
  panel.classList.add('open');
  freeBotSessionId = getBotSessions()['__free__'] || null;
  loadBotHistory();
  inputEl.focus();
}

function closePanel() {
  panel.classList.remove('open');
  closeSettings();
}

// ── System prompt ───────────────────────────────────────

async function fetchSystemPrompt() {
  try {
    const data = await fetch('/api/bot/prompt').then(r => r.json());
    cachedSystemPrompt = data.systemPrompt || '';
    return cachedSystemPrompt;
  } catch {
    return cachedSystemPrompt || '';
  }
}

async function openSettings() {
  const prompt = await fetchSystemPrompt();
  promptTextarea.value = prompt;
  settingsOverlay.classList.add('open');
  promptTextarea.focus();
}

function closeSettings() {
  settingsOverlay.classList.remove('open');
}

async function saveSettings() {
  const newPrompt = promptTextarea.value.trim();
  try {
    await fetch('/api/bot/prompt', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt: newPrompt }),
    });
    cachedSystemPrompt = newPrompt;
  } catch (err) {
    console.error('Failed to save bot prompt:', err);
  }
  closeSettings();
}

// ── Send message ────────────────────────────────────────

function getActiveBotSessionId() {
  return freeBotSessionId;
}

async function sendBotMessage() {
  const text = inputEl.value.trim();
  if (!text || isStreaming) return;

  const ws = getState('ws');
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  const cwd = getCurrentProject() || '/tmp';

  // Ensure we have the system prompt
  if (cachedSystemPrompt === null) {
    await fetchSystemPrompt();
  }

  // Render user message
  appendMessage('user', text);
  inputEl.value = '';
  inputEl.style.height = 'auto';

  isStreaming = true;
  sendBtn.style.display = 'none';
  stopBtn.classList.add('visible');
  currentAssistantEl = null;

  const model = getSelectedModel();
  const activeSid = getActiveBotSessionId();

  const payload = {
    type: 'chat',
    message: text,
    chatId: BOT_CHAT_ID,
    systemPrompt: cachedSystemPrompt || undefined,
  };

  payload.cwd = cwd;
  payload.sessionId = activeSid;
  payload.projectName = 'Assistant Bot';
  payload.permissionMode = 'bypass';

  if (model) payload.model = model;

  ws.send(JSON.stringify(payload));
  showBotThinking('Thinking...');
}

function stopBotGeneration() {
  const ws = getState('ws');
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'abort', chatId: BOT_CHAT_ID }));
  }
}

// ── Message rendering ───────────────────────────────────

// Merge adjacent <ol> tags split by <br> so list numbering is continuous
function mergeAdjacentLists(html) {
  return html
    .replace(/<\/ol>(?:\s*<br>\s*)*<ol class="md-list md-ol">/g, '')
    .replace(/<\/ul>(?:\s*<br>\s*)*<ul class="md-list md-ul">/g, '');
}

function renderBotMarkdown(text) {
  return mergeAdjacentLists(renderMarkdown(text));
}

function showBotWhaly() {
  if (!messagesDiv) return;
  removeBotWhaly();
  const el = document.createElement('div');
  el.className = 'whaly-placeholder';
  el.innerHTML = `<img src="/icons/whaly.png" alt="Whaly" draggable="false"><div class="whaly-text">~ ask the assistant anything ~</div>`;
  messagesDiv.appendChild(el);
}

function removeBotWhaly() {
  if (!messagesDiv) return;
  const el = messagesDiv.querySelector('.whaly-placeholder');
  if (el) el.remove();
}

function appendMessage(role, content) {
  removeBotWhaly();
  const div = document.createElement('div');
  div.className = `bot-msg ${role}`;

  if (role === 'assistant') {
    div.innerHTML = renderBotMarkdown(content);
    highlightCodeBlocks(div);
    addCopyButtons(div);
  } else if (role === 'user') {
    div.textContent = content;
  } else if (role === 'error') {
    div.textContent = content;
  }

  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  return div;
}

function appendToolIndicator(name, input) {
  const div = document.createElement('div');
  div.className = 'bot-msg tool-indicator';
  const detail = input?.file_path || input?.command?.slice(0, 60) || input?.pattern || '';
  div.textContent = `${name}${detail ? ': ' + detail : ''}`;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function appendToolResult(content, isError) {
  const div = document.createElement('div');
  div.className = `bot-msg tool-result-msg${isError ? ' error' : ''}`;
  div.textContent = content?.slice(0, 200) || (isError ? 'Error' : 'Done');
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function showBotThinking(text) {
  removeBotThinking();
  const el = document.createElement('div');
  el.className = 'bot-thinking';
  el.textContent = text;
  messagesDiv.appendChild(el);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function removeBotThinking() {
  const t = messagesDiv?.querySelector('.bot-thinking');
  if (t) t.remove();
}

function finishStreaming() {
  isStreaming = false;
  currentAssistantEl = null;
  removeBotThinking();
  sendBtn.style.display = '';
  stopBtn.classList.remove('visible');
  inputEl.focus();
}

// ── WS message handler ─────────────────────────────────

function handleBotWsMessage(msg) {
  if (msg.chatId !== BOT_CHAT_ID) return;

  removeBotThinking();

  switch (msg.type) {
    case 'session':
      freeBotSessionId = msg.sessionId;
      setBotSession('__free__', freeBotSessionId);
      showBotThinking('Thinking...');
      break;

    case 'text':
      if (!currentAssistantEl) {
        currentAssistantEl = appendMessage('assistant', msg.text);
      } else {
        // Accumulate text — re-render markdown for the full content
        const prev = currentAssistantEl.dataset.rawText || '';
        const full = prev + msg.text;
        currentAssistantEl.dataset.rawText = full;
        currentAssistantEl.innerHTML = renderBotMarkdown(full);
        highlightCodeBlocks(currentAssistantEl);
        addCopyButtons(currentAssistantEl);
      }
      // Store raw text on first message too
      if (!currentAssistantEl.dataset.rawText) {
        currentAssistantEl.dataset.rawText = msg.text;
      }
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
      break;

    case 'tool':
      appendToolIndicator(msg.name, msg.input);
      showBotThinking(`Running ${msg.name}...`);
      break;

    case 'tool_result':
      appendToolResult(msg.content, msg.isError);
      showBotThinking('Thinking...');
      break;

    case 'result':
      removeBotThinking();
      break;

    case 'done':
      finishStreaming();
      break;

    case 'aborted':
      finishStreaming();
      break;

    case 'error':
      finishStreaming();
      appendMessage('error', msg.error || 'Unknown error');
      break;

    case 'permission_request':
      // Bot permission requests are handled by the main permission system
      break;
  }
}

// ── Load history ────────────────────────────────────────

async function loadBotHistory() {
  const sid = getActiveBotSessionId();
  if (!sid) {
    messagesDiv.innerHTML = '';
    showBotWhaly();
    return;
  }

  try {
    const messages = await api.fetchMessagesByChatId(sid, BOT_CHAT_ID);
    messagesDiv.innerHTML = '';

    for (const msg of messages) {
      let data;
      try { data = JSON.parse(msg.content); } catch { continue; }

      if (msg.role === 'user') {
        appendMessage('user', data.text || '');
      } else if (msg.role === 'assistant') {
        appendMessage('assistant', data.text || '');
      } else if (msg.role === 'tool') {
        appendToolIndicator(data.name, data.input);
      } else if (msg.role === 'tool_result') {
        appendToolResult(data.content, data.isError);
      } else if (msg.role === 'error') {
        appendMessage('error', data.error || 'Error');
      }
    }
  } catch (err) {
    console.error('Failed to load bot history:', err);
  }
}

// ── New session ─────────────────────────────────────────

function newBotSession() {
  if (isStreaming) {
    stopBotGeneration();
    finishStreaming();
  }

  const sessions = getBotSessions();
  freeBotSessionId = null;
  delete sessions['__free__'];
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  messagesDiv.innerHTML = '';
  currentAssistantEl = null;
  showBotWhaly();
}

// ── Init ────────────────────────────────────────────────

function init() {
  createBotDOM();
  on('ws:message', handleBotWsMessage);
  fetchSystemPrompt();
}

// Run on import
init();

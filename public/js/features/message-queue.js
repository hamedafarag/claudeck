// Message Queue — queue messages during streaming, auto-fire sequentially
import { $ } from '../core/dom.js';
import { getState } from '../core/store.js';
import { getPane } from '../ui/parallel.js';

let _queueIdCounter = 0;

// ── Lazy import to break circular dependency with chat.js ──
let _chatFns = null;
async function getChatFns() {
  if (!_chatFns) {
    _chatFns = await import('./chat.js');
  }
  return _chatFns;
}

// ── Pane initialization ──

export function initQueueOnPane(pane) {
  pane._messageQueue = [];
  pane._queuePaused = false;
  pane._queuePauseReason = null;
}

// ── Core queue operations ──

export function enqueueMessage(text, pane) {
  pane = pane || getPane(null);
  pane._messageQueue.push({ id: ++_queueIdCounter, text });
  renderQueueChips(pane);
}

export async function fireNextQueued(pane) {
  pane = pane || getPane(null);
  if (pane._messageQueue.length === 0 || pane._queuePaused) return;
  const item = pane._messageQueue.shift();
  renderQueueChips(pane);
  const { _doSend } = await getChatFns();
  _doSend(item.text, pane);
}

export function removeFromQueue(pane, index) {
  pane = pane || getPane(null);
  if (index >= 0 && index < pane._messageQueue.length) {
    pane._messageQueue.splice(index, 1);
    renderQueueChips(pane);
  }
}

export function editQueueItem(pane, index, newText) {
  pane = pane || getPane(null);
  const trimmed = newText.trim();
  if (!trimmed) {
    removeFromQueue(pane, index);
    return;
  }
  if (index >= 0 && index < pane._messageQueue.length) {
    pane._messageQueue[index].text = trimmed;
    renderQueueChips(pane);
  }
}

export function reorderQueue(pane, fromIndex, toIndex) {
  pane = pane || getPane(null);
  if (fromIndex === toIndex) return;
  const [item] = pane._messageQueue.splice(fromIndex, 1);
  pane._messageQueue.splice(toIndex, 0, item);
  renderQueueChips(pane);
}

export function clearQueue(pane) {
  pane = pane || getPane(null);
  pane._messageQueue = [];
  pane._queuePaused = false;
  pane._queuePauseReason = null;
  renderQueueChips(pane);
}

export function getQueue(pane) {
  pane = pane || getPane(null);
  return [...pane._messageQueue];
}

// ── Pause / Resume ──

export function pauseQueue(pane, reason) {
  pane = pane || getPane(null);
  pane._queuePaused = true;
  pane._queuePauseReason = reason || 'user';
  renderQueueChips(pane);
}

export function resumeQueue(pane) {
  pane = pane || getPane(null);
  pane._queuePaused = false;
  pane._queuePauseReason = null;
  renderQueueChips(pane);
}

// ── Stop with queue (3-option modal) ──

export function handleStopWithQueue(pane) {
  pane = pane || getPane(null);
  const modal = $.queueStopModal;
  if (!modal) return;

  // Populate preview
  const preview = $.queueStopPreview;
  if (preview) {
    preview.innerHTML = '';
    for (const item of pane._messageQueue) {
      const el = document.createElement('span');
      el.className = 'mq-queue-preview-item';
      el.textContent = truncateText(item.text, 40);
      preview.appendChild(el);
    }
  }

  modal.classList.remove('hidden');

  const cleanup = () => {
    modal.classList.add('hidden');
    $.queueStopAll.removeEventListener('click', onTerminate);
    $.queueStopSkip.removeEventListener('click', onSkip);
    $.queueStopPause.removeEventListener('click', onPause);
    modal.removeEventListener('click', onBackdrop);
  };

  const sendAbort = () => {
    const ws = getState("ws");
    if (ws && ws.readyState === WebSocket.OPEN) {
      const payload = { type: "abort" };
      const parallelMode = getState("parallelMode");
      if (parallelMode && pane.chatId) {
        payload.chatId = pane.chatId;
      }
      ws.send(JSON.stringify(payload));
    }
  };

  const onTerminate = () => {
    clearQueue(pane);
    sendAbort();
    cleanup();
  };

  const onSkip = () => {
    // Don't pause — finishStreamingHandler will auto-fire next
    sendAbort();
    cleanup();
  };

  const onPause = () => {
    pauseQueue(pane, 'user');
    sendAbort();
    cleanup();
  };

  const onBackdrop = (e) => {
    if (e.target === modal) cleanup();
  };

  $.queueStopAll.addEventListener('click', onTerminate);
  $.queueStopSkip.addEventListener('click', onSkip);
  $.queueStopPause.addEventListener('click', onPause);
  modal.addEventListener('click', onBackdrop);
}

// ── Chip rendering ──

function truncateText(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

function getChipContainer(pane) {
  const parallelMode = getState("parallelMode");
  if (parallelMode) {
    // In parallel mode, the textarea is a direct child of the input-bar
    const inputBar = pane.messageInput?.closest('.input-bar');
    return inputBar || null;
  }
  // Single mode: use .input-textarea-wrap
  const wrap = $.messageInput?.closest('.input-textarea-wrap');
  return wrap || null;
}

export function renderQueueChips(pane) {
  pane = pane || getPane(null);
  const container = getChipContainer(pane);
  if (!container) return;

  // Find or create strip
  let strip = container.querySelector('.mq-chip-strip');
  if (pane._messageQueue.length === 0) {
    if (strip) strip.remove();
    return;
  }

  if (!strip) {
    strip = document.createElement('div');
    strip.className = 'mq-chip-strip';
    // Insert as first child (above textarea)
    container.insertBefore(strip, container.firstChild);
  }

  strip.innerHTML = '';

  // Drag state
  let dragItem = null;
  let dragFromIndex = -1;
  let dragPlaceholder = null;

  pane._messageQueue.forEach((item, index) => {
    const chip = document.createElement('div');
    chip.className = 'mq-chip';
    chip.draggable = true;
    chip.dataset.queueIndex = index;

    const num = document.createElement('span');
    num.className = 'mq-chip-num';
    num.textContent = index + 1;

    const handle = document.createElement('span');
    handle.className = 'mq-chip-handle';
    handle.textContent = '\u2807'; // ⠇

    const text = document.createElement('span');
    text.className = 'mq-chip-text';
    text.textContent = truncateText(item.text, 40);
    text.title = item.text;

    const editBtn = document.createElement('button');
    editBtn.className = 'mq-chip-edit';
    editBtn.title = 'Edit';
    editBtn.innerHTML = '&#9998;'; // ✎
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showInlineEditor(chip, item, pane, index);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'mq-chip-remove';
    removeBtn.title = 'Remove';
    removeBtn.textContent = '\u00d7'; // ×
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromQueue(pane, index);
    });

    chip.appendChild(num);
    chip.appendChild(text);
    chip.appendChild(handle);
    chip.appendChild(editBtn);
    chip.appendChild(removeBtn);

    // Drag events
    chip.addEventListener('dragstart', (e) => {
      dragItem = chip;
      dragFromIndex = index;
      chip.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      dragPlaceholder = document.createElement('div');
      dragPlaceholder.className = 'mq-drop-indicator';
      requestAnimationFrame(() => { chip.style.opacity = '0.4'; });
    });

    chip.addEventListener('dragend', () => {
      if (dragItem) {
        dragItem.classList.remove('dragging');
        dragItem.style.opacity = '';
      }
      if (dragPlaceholder?.parentNode) dragPlaceholder.remove();
      dragItem = null;
      dragFromIndex = -1;
      dragPlaceholder = null;
    });

    chip.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!dragItem || dragItem === chip) return;
      const rect = chip.getBoundingClientRect();
      const after = e.clientX > rect.left + rect.width / 2;
      if (after) chip.after(dragPlaceholder);
      else chip.before(dragPlaceholder);
    });

    chip.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!dragItem || dragItem === chip) return;
      // Calculate target index from placeholder position
      const chips = [...strip.querySelectorAll('.mq-chip')];
      const placeholderIdx = [...strip.children].indexOf(dragPlaceholder);
      let toIndex = 0;
      let chipsBefore = 0;
      for (const child of strip.children) {
        if (child === dragPlaceholder) break;
        if (child.classList.contains('mq-chip')) chipsBefore++;
      }
      toIndex = chipsBefore;
      if (dragFromIndex < toIndex) toIndex--;

      if (dragPlaceholder?.parentNode) dragPlaceholder.remove();
      dragItem.classList.remove('dragging');
      dragItem.style.opacity = '';
      reorderQueue(pane, dragFromIndex, toIndex);
      dragItem = null;
      dragFromIndex = -1;
      dragPlaceholder = null;
    });

    strip.appendChild(chip);
  });

  // Queue count
  const count = document.createElement('span');
  count.className = 'mq-chip-count';
  count.textContent = `${pane._messageQueue.length} queued`;
  strip.appendChild(count);

  // Paused indicator
  if (pane._queuePaused) {
    const paused = document.createElement('span');
    paused.className = 'mq-queue-paused';
    const reasonLabel = pane._queuePauseReason === 'error' ? 'error'
      : pane._queuePauseReason === 'question' ? 'waiting for response'
      : 'stopped';
    paused.innerHTML = `\u23F8 Paused (${reasonLabel}) `;
    const resumeBtn = document.createElement('button');
    resumeBtn.className = 'mq-resume-btn';
    resumeBtn.textContent = 'Resume';
    resumeBtn.addEventListener('click', () => {
      resumeQueue(pane);
      // Auto-fire if not streaming
      if (!pane.isStreaming && pane._messageQueue.length > 0) {
        fireNextQueued(pane);
      }
    });
    paused.appendChild(resumeBtn);
    strip.appendChild(paused);
  }
}

// ── Inline editor popover ──

function showInlineEditor(chipEl, item, pane, index) {
  // Close any existing editor
  closeAllEditors();

  const popover = document.createElement('div');
  popover.className = 'mq-editor-popover';

  const textarea = document.createElement('textarea');
  textarea.className = 'mq-editor-textarea';
  textarea.rows = 3;
  textarea.value = item.text;

  const actions = document.createElement('div');
  actions.className = 'mq-editor-actions';

  const hint = document.createElement('span');
  hint.className = 'mq-editor-hint';
  hint.textContent = 'Ctrl+Enter to save';

  const buttons = document.createElement('div');
  buttons.className = 'mq-editor-buttons';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'mq-editor-save';
  saveBtn.textContent = 'Save';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'mq-editor-cancel';
  cancelBtn.textContent = 'Cancel';

  const close = () => popover.remove();

  saveBtn.addEventListener('click', () => {
    editQueueItem(pane, index, textarea.value);
    close();
  });

  cancelBtn.addEventListener('click', close);

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      editQueueItem(pane, index, textarea.value);
      close();
    }
  });

  buttons.appendChild(cancelBtn);
  buttons.appendChild(saveBtn);
  actions.appendChild(hint);
  actions.appendChild(buttons);
  popover.appendChild(textarea);
  popover.appendChild(actions);
  chipEl.appendChild(popover);

  // Focus textarea
  requestAnimationFrame(() => textarea.focus());

  // Close on outside click (deferred so this click doesn't trigger it)
  requestAnimationFrame(() => {
    const onOutside = (e) => {
      if (!popover.contains(e.target) && !chipEl.contains(e.target)) {
        close();
        document.removeEventListener('mousedown', onOutside);
      }
    };
    document.addEventListener('mousedown', onOutside);
  });
}

function closeAllEditors() {
  document.querySelectorAll('.mq-editor-popover').forEach(el => el.remove());
}

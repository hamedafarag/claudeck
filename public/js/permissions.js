// Permission / Tool Approval system
import { $ } from './dom.js';
import { getState } from './store.js';
import { on as onEvent } from './events.js';

const STORAGE_KEY = 'shawkat-perm-mode';

// Per-session always-allow set (cleared on refresh or /new)
const alwaysAllowTools = new Set();

// Permission request queue — one modal at a time
const permissionQueue = [];
let activeRequest = null;

export function getPermissionMode() {
  return $.permModeSelect?.value || 'confirmDangerous';
}

export function clearSessionPermissions() {
  alwaysAllowTools.clear();
}

export function enqueuePermissionRequest(msg) {
  // Check if tool is in always-allow set — auto-approve without modal
  if (alwaysAllowTools.has(msg.toolName)) {
    sendPermissionResponse(msg.id, 'allow');
    return;
  }

  permissionQueue.push(msg);
  if (!activeRequest) {
    processNext();
  }
}

function processNext() {
  if (permissionQueue.length === 0) {
    activeRequest = null;
    return;
  }
  activeRequest = permissionQueue.shift();
  showPermissionModal(activeRequest);
}

function showPermissionModal(req) {
  $.permModalToolName.textContent = `Tool Approval: ${req.toolName}`;
  $.permModalSummary.textContent = getToolSummary(req.toolName, req.input);
  $.permModalInput.textContent = JSON.stringify(req.input, null, 2);
  $.permAlwaysAllowTool.textContent = req.toolName;
  $.permAlwaysAllowCb.checked = false;

  // Show background session badge if request is from a bg session
  const bgBadge = document.getElementById('perm-bg-badge');
  if (bgBadge) {
    if (req._bgSessionTitle) {
      bgBadge.textContent = `bg: ${req._bgSessionTitle}`;
      bgBadge.classList.remove('hidden');
    } else {
      bgBadge.classList.add('hidden');
    }
  }

  $.permModal.classList.remove('hidden');
  $.permAllowBtn.focus();
}

function getToolSummary(name, input) {
  if (!input) return name;
  if (input.file_path) return input.file_path;
  if (input.command) return input.command.slice(0, 120);
  if (input.pattern) return input.pattern;
  if (input.query) return input.query.slice(0, 120);
  if (input.prompt) return input.prompt.slice(0, 120);
  if (input.url) return input.url;
  return name;
}

function hideModal() {
  $.permModal.classList.add('hidden');
}

function handleAllow() {
  if (!activeRequest) return;
  const id = activeRequest.id;
  const toolName = activeRequest.toolName;
  if ($.permAlwaysAllowCb.checked) {
    alwaysAllowTools.add(toolName);
  }
  hideModal();
  sendPermissionResponse(id, 'allow');
  activeRequest = null;
  processNext();
}

function handleDeny() {
  if (!activeRequest) return;
  const id = activeRequest.id;
  hideModal();
  sendPermissionResponse(id, 'deny');
  activeRequest = null;
  processNext();
}

function sendPermissionResponse(id, behavior) {
  const ws = getState('ws');
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'permission_response', id, behavior }));
  }
}

// Escape key — capture phase so it fires before shortcuts.js closeAllModals
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && activeRequest && !$.permModal.classList.contains('hidden')) {
    e.stopImmediatePropagation();
    handleDeny();
  }
}, true);

// Clean up on disconnect
onEvent('ws:disconnected', () => {
  hideModal();
  permissionQueue.length = 0;
  activeRequest = null;
});

// ── Init ──
function initPermissions() {
  // Restore saved mode
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && $.permModeSelect) {
    $.permModeSelect.value = saved;
  }

  // Persist mode changes
  $.permModeSelect?.addEventListener('change', () => {
    localStorage.setItem(STORAGE_KEY, $.permModeSelect.value);
  });

  // Button handlers
  $.permAllowBtn?.addEventListener('click', handleAllow);
  $.permDenyBtn?.addEventListener('click', handleDeny);
  $.permModalClose?.addEventListener('click', handleDeny);

  // Click overlay to deny
  $.permModal?.addEventListener('click', (e) => {
    if (e.target === $.permModal) handleDeny();
  });
}

initPermissions();

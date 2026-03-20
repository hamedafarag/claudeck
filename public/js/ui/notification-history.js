// Notification history modal — full paginated view with filters
import { on } from '../core/events.js';

const TYPE_ICONS = {
  session: '\u{1F4AC}',
  agent: '\u{1F916}',
  workflow: '\u2699\uFE0F',
  chain: '\u{1F517}',
  dag: '\u{1F310}',
  error: '\u26A0\uFE0F',
  approval: '\u{1F512}',
};

let overlay = null;
let items = [];
let offset = 0;
let hasMore = true;
let filterType = '';
let filterStatus = '';
let selectedIds = new Set();

function init() {
  on('notification:show-history', openModal);
}

function openModal() {
  if (overlay) return;
  items = [];
  offset = 0;
  hasMore = true;
  filterType = '';
  filterStatus = '';
  selectedIds.clear();

  overlay = document.createElement('div');
  overlay.className = 'notif-history-overlay';
  overlay.innerHTML = `
    <div class="notif-history-modal">
      <div class="notif-history-header">
        <h2>Notification History</h2>
        <button class="notif-history-close">&times;</button>
      </div>
      <div class="notif-history-filters">
        <select class="notif-filter-select" id="notif-filter-type">
          <option value="">All Types</option>
          <option value="agent">Agent</option>
          <option value="error">Error</option>
          <option value="workflow">Workflow</option>
          <option value="chain">Chain</option>
          <option value="dag">DAG</option>
          <option value="session">Session</option>
          <option value="approval">Approval</option>
        </select>
        <select class="notif-filter-select" id="notif-filter-status">
          <option value="">All</option>
          <option value="unread">Unread Only</option>
          <option value="read">Read Only</option>
        </select>
        <div class="notif-bulk-actions">
          <button class="notif-bulk-btn" id="notif-bulk-read">Mark Selected Read</button>
          <button class="notif-bulk-btn danger" id="notif-bulk-purge">Purge Old</button>
        </div>
      </div>
      <div class="notif-history-list" id="notif-history-list"></div>
      <div class="notif-load-more" id="notif-load-more" style="display:none">
        <button class="notif-load-more-btn">Load More</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // Wire events
  overlay.querySelector('.notif-history-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  overlay.querySelector('#notif-filter-type').addEventListener('change', (e) => { filterType = e.target.value; resetAndFetch(); });
  overlay.querySelector('#notif-filter-status').addEventListener('change', (e) => { filterStatus = e.target.value; resetAndFetch(); });
  overlay.querySelector('#notif-bulk-read').addEventListener('click', bulkMarkRead);
  overlay.querySelector('#notif-bulk-purge').addEventListener('click', bulkPurge);
  overlay.querySelector('#notif-load-more .notif-load-more-btn').addEventListener('click', fetchMore);

  // Keyboard
  const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
  document.addEventListener('keydown', onKey);
  overlay._keyHandler = onKey;

  fetchMore();
}

function closeModal() {
  if (!overlay) return;
  document.removeEventListener('keydown', overlay._keyHandler);
  overlay.remove();
  overlay = null;
}

function resetAndFetch() {
  items = [];
  offset = 0;
  hasMore = true;
  selectedIds.clear();
  const list = overlay?.querySelector('#notif-history-list');
  if (list) list.innerHTML = '';
  fetchMore();
}

async function fetchMore() {
  if (!hasMore) return;
  const params = new URLSearchParams({ limit: '30', offset: String(offset) });
  if (filterType) params.set('type', filterType);
  if (filterStatus === 'unread') params.set('unread_only', 'true');

  try {
    const res = await fetch(`/api/notifications/history?${params}`);
    if (!res.ok) return;
    let batch = await res.json();

    // Client-side filter for "read only"
    if (filterStatus === 'read') {
      batch = batch.filter(n => n.read_at);
    }

    if (batch.length < 30) hasMore = false;
    offset += batch.length;
    items.push(...batch);
    renderList();
  } catch { /* network error */ }
}

function renderList() {
  const list = overlay?.querySelector('#notif-history-list');
  if (!list) return;

  if (items.length === 0) {
    list.innerHTML = '<div class="notif-empty" style="padding:40px">No notifications found</div>';
    toggleLoadMore(false);
    return;
  }

  let html = '';
  for (const n of items) {
    const isUnread = !n.read_at;
    const checked = selectedIds.has(n.id) ? 'checked' : '';
    const icon = TYPE_ICONS[n.type] || '\u{1F514}';
    html += `<div class="notif-history-item ${isUnread ? 'unread' : ''}" data-id="${n.id}">
      <input type="checkbox" ${checked} data-id="${n.id}">
      <span class="notif-icon">${icon}</span>
      <div class="notif-content">
        <div class="notif-title">${escapeHtml(n.title)}</div>
        ${n.body ? `<div class="notif-body">${escapeHtml(n.body)}</div>` : ''}
      </div>
      <span class="notif-time">${formatTime(n.created_at)}</span>
    </div>`;
  }
  list.innerHTML = html;

  // Wire checkboxes
  for (const cb of list.querySelectorAll('input[type="checkbox"]')) {
    cb.addEventListener('change', (e) => {
      const id = parseInt(e.target.dataset.id);
      if (e.target.checked) selectedIds.add(id); else selectedIds.delete(id);
    });
  }

  toggleLoadMore(hasMore);
}

function toggleLoadMore(show) {
  const el = overlay?.querySelector('#notif-load-more');
  if (el) el.style.display = show ? 'flex' : 'none';
}

async function bulkMarkRead() {
  if (selectedIds.size === 0) return;
  const ids = [...selectedIds];
  try {
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    for (const n of items) {
      if (ids.includes(n.id)) n.read_at = Math.floor(Date.now() / 1000);
    }
    selectedIds.clear();
    renderList();
  } catch { /* network error */ }
}

async function bulkPurge() {
  try {
    await fetch('/api/notifications/old', { method: 'DELETE' });
    resetAndFetch();
  } catch { /* network error */ }
}

function formatTime(unixTs) {
  const d = new Date(unixTs * 1000);
  const diff = Math.floor(Date.now() / 1000) - unixTs;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

init();

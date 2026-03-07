// Event Stream Panel — structured activity log
import { $ } from './dom.js';
import { on } from './events.js';
import { getState, on as onState } from './store.js';
import { escapeHtml, getToolDetail } from './utils.js';

let events = [];
let activeFilter = 'all';
let searchQuery = '';

function formatTime(ts) {
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toTimeString().slice(0, 8);
}

function badgeClass(type) {
  switch (type) {
    case 'tool': return 'badge-tool';
    case 'result': return 'badge-result';
    case 'error': return 'badge-error';
    case 'done': return 'badge-done';
    default: return 'badge-tool';
  }
}

function badgeLabel(type) {
  switch (type) {
    case 'tool': return 'TOOL';
    case 'result': return 'OK';
    case 'error': return 'ERR';
    case 'done': return 'DONE';
    default: return type.toUpperCase();
  }
}

function renderEvent(evt) {
  const row = document.createElement('div');
  row.className = 'event-row';
  row.dataset.type = evt.type;

  const content = document.createElement('div');
  content.style.cssText = 'display:flex;align-items:flex-start;gap:8px;flex-grow:1;min-width:0;';

  content.innerHTML = `
    <span class="event-time">${formatTime(evt.timestamp)}</span>
    <span class="event-badge ${badgeClass(evt.type)}">${badgeLabel(evt.type)}</span>
    <span class="event-summary">${escapeHtml(evt.summary)}</span>
  `;

  row.appendChild(content);

  if (evt.detail) {
    const detail = document.createElement('div');
    detail.className = 'event-detail';
    detail.textContent = evt.detail;
    row.appendChild(detail);
  }

  row.addEventListener('click', () => {
    row.classList.toggle('expanded');
  });

  return row;
}

function matchesFilter(evt) {
  if (activeFilter === 'all') return true;
  if (activeFilter === 'tool') return evt.type === 'tool';
  if (activeFilter === 'error') return evt.type === 'error';
  if (activeFilter === 'result') return evt.type === 'result' || evt.type === 'done';
  return true;
}

function matchesSearch(row) {
  if (!searchQuery) return true;
  const text = row.textContent.toLowerCase();
  return text.includes(searchQuery.toLowerCase());
}

function applyFilters() {
  if (!$.eventStreamList) return;
  let visible = 0;
  for (const row of $.eventStreamList.children) {
    const type = row.dataset.type;
    const evt = { type };
    const show = matchesFilter(evt) && matchesSearch(row);
    row.style.display = show ? '' : 'none';
    if (show) visible++;
  }
  updateCount(visible);
}

function updateCount(count) {
  if ($.eventStreamCount) {
    const n = count != null ? count : events.length;
    $.eventStreamCount.textContent = `${n} event${n !== 1 ? 's' : ''}`;
  }
}

function autoScroll() {
  if ($.eventAutoscroll && $.eventAutoscroll.checked && $.eventStreamList) {
    $.eventStreamList.scrollTop = $.eventStreamList.scrollHeight;
  }
}

export function addEvent(evt) {
  evt.timestamp = evt.timestamp || new Date();
  events.push(evt);

  if (!$.eventStreamList) return;

  const row = renderEvent(evt);
  $.eventStreamList.appendChild(row);

  // Apply current filter/search to new row
  if (!matchesFilter(evt) || !matchesSearch(row)) {
    row.style.display = 'none';
  }

  updateCount();
  autoScroll();
}

export function clearEvents() {
  events = [];
  if ($.eventStreamList) $.eventStreamList.innerHTML = '';
  updateCount(0);
}

export async function loadSessionEvents(sessionId) {
  if (!sessionId) return;
  try {
    const messages = await (await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages-single`)).json();
    for (const msg of messages) {
      const data = JSON.parse(msg.content);
      const ts = msg.created_at ? new Date(msg.created_at * 1000) : new Date();
      switch (msg.role) {
        case 'tool':
          addEvent({
            type: 'tool',
            timestamp: ts,
            summary: `${data.name}: ${getToolDetail(data.name, data.input) || '(no detail)'}`,
            detail: JSON.stringify(data.input, null, 2),
            toolName: data.name,
          });
          break;
        case 'tool_result':
          addEvent({
            type: data.isError ? 'error' : 'result',
            timestamp: ts,
            summary: (data.content || '').slice(0, 100),
            detail: data.content,
          });
          break;
        case 'result':
          addEvent({
            type: 'done',
            timestamp: ts,
            summary: `${data.model || ''} · ${data.num_turns || 0} turns · $${(data.cost_usd || 0).toFixed(4)}`,
          });
          break;
        case 'error':
          addEvent({
            type: 'error',
            timestamp: ts,
            summary: data.error || 'Unknown error',
          });
          break;
      }
    }
  } catch (err) {
    console.error('Failed to load session events:', err);
  }
}

// Listen for live WebSocket messages
on('ws:message', (msg) => {
  switch (msg.type) {
    case 'tool':
      addEvent({
        type: 'tool',
        summary: `${msg.name}: ${getToolDetail(msg.name, msg.input) || '(no detail)'}`,
        detail: JSON.stringify(msg.input, null, 2),
        toolName: msg.name,
      });
      break;
    case 'tool_result':
      addEvent({
        type: msg.isError ? 'error' : 'result',
        summary: (msg.content || '').slice(0, 100),
        detail: msg.content,
      });
      break;
    case 'result':
      addEvent({
        type: 'done',
        summary: `${msg.model || ''} · ${msg.num_turns || 0} turns · $${(msg.cost_usd || 0).toFixed(4)}`,
      });
      break;
    case 'error':
      addEvent({
        type: 'error',
        summary: msg.error || 'Unknown error',
      });
      break;
  }
});

// Session switch — clear and reload events
onState('sessionId', (newId) => {
  clearEvents();
  if (newId) loadSessionEvents(newId);
});

// Init UI bindings
function initEventStream() {
  // Filter buttons
  const filterBtns = document.querySelectorAll('.event-filter-btn');
  for (const btn of filterBtns) {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      filterBtns.forEach((b) => b.classList.toggle('active', b === btn));
      applyFilters();
    });
  }

  // Search input with debounce
  let searchTimer = null;
  if ($.eventStreamSearch) {
    $.eventStreamSearch.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        searchQuery = $.eventStreamSearch.value;
        applyFilters();
      }, 200);
    });
  }

  // Clear button
  if ($.eventStreamClear) {
    $.eventStreamClear.addEventListener('click', () => clearEvents());
  }
}

initEventStream();

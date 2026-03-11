// Event Stream — migrated to Tab SDK plugin
// This file replaces the old event-stream.js + HTML template
import { registerTab } from './tab-sdk.js';
import { escapeHtml, getToolDetail } from './utils.js';

registerTab({
  id: 'events',
  title: 'Events',
  icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  lazy: true,

  init(ctx) {
    let events = [];
    let activeFilter = 'all';
    let searchQuery = '';
    let listEl, countEl, autoscrollEl, searchEl;

    // ── Build DOM ─────────────────────────────────────
    const root = document.createElement('div');
    root.className = 'event-stream-tab';
    root.style.cssText = 'display:flex;flex-direction:column;flex:1;overflow:hidden;';

    root.innerHTML = `
      <div class="event-stream-toolbar">
        <div class="event-stream-filters">
          <button class="event-filter-btn active" data-filter="all">All</button>
          <button class="event-filter-btn" data-filter="tool">Tools</button>
          <button class="event-filter-btn" data-filter="error">Errors</button>
          <button class="event-filter-btn" data-filter="result">Results</button>
        </div>
        <input type="text" placeholder="Search events..." autocomplete="off" class="event-stream-search">
        <button class="event-stream-clear-btn" title="Clear">Clear</button>
      </div>
      <div class="event-stream-list"></div>
      <div class="event-stream-footer">
        <span class="event-stream-count">0 events</span>
        <label class="event-autoscroll-toggle" title="Auto-scroll to latest">
          <input type="checkbox" checked> Auto
        </label>
      </div>
    `;

    listEl = root.querySelector('.event-stream-list');
    countEl = root.querySelector('.event-stream-count');
    autoscrollEl = root.querySelector('.event-autoscroll-toggle input');
    searchEl = root.querySelector('.event-stream-search');

    // ── Helpers ───────────────────────────────────────
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

      row.addEventListener('click', () => row.classList.toggle('expanded'));
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
      return row.textContent.toLowerCase().includes(searchQuery.toLowerCase());
    }

    function applyFilters() {
      let visible = 0;
      for (const row of listEl.children) {
        const show = matchesFilter({ type: row.dataset.type }) && matchesSearch(row);
        row.style.display = show ? '' : 'none';
        if (show) visible++;
      }
      updateCount(visible);
    }

    function updateCount(count) {
      const n = count != null ? count : events.length;
      countEl.textContent = `${n} event${n !== 1 ? 's' : ''}`;
      ctx.showBadge(events.length);
    }

    function autoScroll() {
      if (autoscrollEl.checked) {
        listEl.scrollTop = listEl.scrollHeight;
      }
    }

    function addEvent(evt) {
      evt.timestamp = evt.timestamp || new Date();
      events.push(evt);
      const row = renderEvent(evt);
      listEl.appendChild(row);
      if (!matchesFilter(evt) || !matchesSearch(row)) {
        row.style.display = 'none';
      }
      updateCount();
      autoScroll();
    }

    function clearEvents() {
      events = [];
      listEl.innerHTML = '';
      updateCount(0);
    }

    async function loadSessionEvents(sessionId) {
      if (!sessionId) return;
      try {
        const messages = await (await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages-single`)).json();
        for (const msg of messages) {
          const data = JSON.parse(msg.content);
          const ts = msg.created_at ? new Date(msg.created_at * 1000) : new Date();
          switch (msg.role) {
            case 'tool':
              addEvent({
                type: 'tool', timestamp: ts,
                summary: `${data.name}: ${getToolDetail(data.name, data.input) || '(no detail)'}`,
                detail: JSON.stringify(data.input, null, 2),
                toolName: data.name,
              });
              break;
            case 'tool_result':
              addEvent({
                type: data.isError ? 'error' : 'result', timestamp: ts,
                summary: (data.content || '').slice(0, 100),
                detail: data.content,
              });
              break;
            case 'result':
              addEvent({
                type: 'done', timestamp: ts,
                summary: `${data.model || ''} · ${data.num_turns || 0} turns · $${(data.cost_usd || 0).toFixed(4)}`,
              });
              break;
            case 'error':
              addEvent({ type: 'error', timestamp: ts, summary: data.error || 'Unknown error' });
              break;
          }
        }
      } catch (err) {
        console.error('Failed to load session events:', err);
      }
    }

    // ── UI bindings ──────────────────────────────────
    // Filter buttons
    const filterBtns = root.querySelectorAll('.event-filter-btn');
    for (const btn of filterBtns) {
      btn.addEventListener('click', () => {
        activeFilter = btn.dataset.filter;
        filterBtns.forEach(b => b.classList.toggle('active', b === btn));
        applyFilters();
      });
    }

    // Search
    let searchTimer = null;
    searchEl.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        searchQuery = searchEl.value;
        applyFilters();
      }, 200);
    });

    // Clear
    root.querySelector('.event-stream-clear-btn').addEventListener('click', () => clearEvents());

    // ── Event listeners ──────────────────────────────
    ctx.on('ws:message', (msg) => {
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
          addEvent({ type: 'error', summary: msg.error || 'Unknown error' });
          break;
      }
    });

    // Session switch
    ctx.onState('sessionId', (newId) => {
      clearEvents();
      if (newId) loadSessionEvents(newId);
    });

    return root;
  },
});

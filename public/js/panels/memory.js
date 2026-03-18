// Memory Panel — built-in right-panel tab (like Files / Git)
import { $ } from '../core/dom.js';
import { on } from '../core/events.js';

const CATEGORIES = ['convention', 'decision', 'discovery', 'warning'];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function timeAgo(unixSecs) {
  const diff = Math.floor(Date.now() / 1000) - unixSecs;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixSecs * 1000).toLocaleDateString();
}

let memories = [];
let activeFilter = null;
let searchQuery = '';
let showAddForm = false;
let stats = null;

function getProjectPath() {
  return $.projectSelect?.value || '';
}

// ── Filter pills ────────────────────────────────────────

function initFilters() {
  const filtersBar = $.memoryFilters;
  if (!filtersBar) return;

  const allPill = document.createElement('button');
  allPill.className = 'memory-filter-pill active';
  allPill.textContent = 'All';
  allPill.addEventListener('click', () => { activeFilter = null; updateFilters(); loadMemories(); });
  filtersBar.appendChild(allPill);

  for (const cat of CATEGORIES) {
    const pill = document.createElement('button');
    pill.className = 'memory-filter-pill';
    pill.dataset.cat = cat;
    pill.textContent = cat;
    pill.addEventListener('click', () => {
      activeFilter = activeFilter === cat ? null : cat;
      updateFilters();
      loadMemories();
    });
    filtersBar.appendChild(pill);
  }
}

function updateFilters() {
  $.memoryFilters?.querySelectorAll('.memory-filter-pill').forEach(p => {
    if (!p.dataset.cat) p.classList.toggle('active', !activeFilter);
    else p.classList.toggle('active', p.dataset.cat === activeFilter);
  });
}

// ── Render ──────────────────────────────────────────────

function renderMemories() {
  const memoryList = $.memoryList;
  if (!memoryList) return;

  if (!memories.length) {
    memoryList.innerHTML = `
      <div class="memory-empty">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>
          <line x1="10" y1="22" x2="14" y2="22"/>
        </svg>
        <span>No memories yet</span>
        <span class="memory-empty-hint">Memories are captured automatically during sessions, or click + to add manually</span>
      </div>`;
    return;
  }

  memoryList.innerHTML = '';
  for (const m of memories) {
    const item = document.createElement('div');
    item.className = 'memory-item';
    item.dataset.id = m.id;

    item.innerHTML = `
      <div class="memory-item-header">
        <span class="memory-category-badge ${m.category}">${m.category}</span>
        <span class="memory-relevance">${(m.relevance_score || 1).toFixed(1)}</span>
      </div>
      <div class="memory-content">${escapeHtml(m.content)}</div>
      <div class="memory-meta">
        <span>${timeAgo(m.created_at)}</span>
        ${m.source_agent_id ? `<span>via ${escapeHtml(m.source_agent_id)}</span>` : ''}
      </div>
      <div class="memory-actions">
        <button class="memory-action-btn edit" title="Edit">\u270E</button>
        <button class="memory-action-btn delete" title="Delete">\u00D7</button>
      </div>
    `;

    item.querySelector('.edit').addEventListener('click', () => startEdit(item, m));

    item.querySelector('.delete').addEventListener('click', async () => {
      try {
        await fetchApi(`/${m.id}`, { method: 'DELETE' });
        memories = memories.filter(x => x.id !== m.id);
        renderMemories();
        loadStats();
      } catch { /* ignore */ }
    });

    memoryList.appendChild(item);
  }
}

function renderStats() {
  if (!$.memoryStatsBar) return;
  if (!stats) { $.memoryStatsBar.textContent = ''; return; }
  const catStr = (stats.categories || []).map(c => `${c.category}: ${c.count}`).join(' | ');
  $.memoryStatsBar.textContent = `${stats.total || 0} memories${catStr ? ' \u2014 ' + catStr : ''}`;
}

// ── API helpers ─────────────────────────────────────────

async function fetchApi(path, opts = {}) {
  const base = '/api/memory';
  const res = await fetch(base + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadMemories() {
  try {
    const project = getProjectPath();
    if (!project) { memories = []; renderMemories(); return; }

    if (searchQuery) {
      memories = await fetchApi(`/search?project=${encodeURIComponent(project)}&q=${encodeURIComponent(searchQuery)}`);
    } else {
      const catParam = activeFilter ? `&category=${activeFilter}` : '';
      memories = await fetchApi(`/?project=${encodeURIComponent(project)}${catParam}`);
    }
    if ($.memoryTitle) $.memoryTitle.textContent = `Memory (${memories.length})`;
    renderMemories();
  } catch { memories = []; renderMemories(); }
}

async function loadStats() {
  try {
    const project = getProjectPath();
    if (!project) return;
    stats = await fetchApi(`/stats?project=${encodeURIComponent(project)}`);
    renderStats();
  } catch { /* ignore */ }
}

// ── Search ──────────────────────────────────────────────

let searchTimer;
function initSearch() {
  $.memorySearchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchQuery = $.memorySearchInput.value.trim();
    searchTimer = setTimeout(() => loadMemories(), 300);
  });
}

// ── Add memory form ─────────────────────────────────────

function initAddForm() {
  $.memoryAddBtn?.addEventListener('click', () => {
    showAddForm = !showAddForm;
    const inputBar = $.memoryInputBar;
    if (!inputBar) return;

    if (showAddForm) {
      inputBar.style.display = '';
      inputBar.innerHTML = `
        <div class="memory-input-form">
          <select class="memory-cat-select">
            ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
          <textarea class="memory-textarea" placeholder="What should Claude remember about this project?"></textarea>
          <div class="memory-input-actions">
            <button class="cancel">Cancel</button>
            <button class="save">Save</button>
          </div>
        </div>
      `;
      const textarea = inputBar.querySelector('.memory-textarea');
      const catSelect = inputBar.querySelector('.memory-cat-select');
      textarea.focus();

      inputBar.querySelector('.cancel').addEventListener('click', () => {
        showAddForm = false;
        inputBar.style.display = 'none';
      });

      inputBar.querySelector('.save').addEventListener('click', async () => {
        const content = textarea.value.trim();
        if (!content) { textarea.focus(); return; }
        const project = getProjectPath();
        if (!project) return;
        try {
          await fetchApi('/', {
            method: 'POST',
            body: JSON.stringify({ project, category: catSelect.value, content }),
          });
          showAddForm = false;
          inputBar.style.display = 'none';
          loadMemories();
          loadStats();
        } catch { /* ignore */ }
      });
    } else {
      inputBar.style.display = 'none';
    }
  });
}

// ── Edit inline ─────────────────────────────────────────

function startEdit(item, memory) {
  const contentEl = item.querySelector('.memory-content');
  contentEl.contentEditable = 'true';
  contentEl.classList.add('editing');
  contentEl.focus();

  const finish = async () => {
    contentEl.contentEditable = 'false';
    contentEl.classList.remove('editing');
    const newText = contentEl.textContent.trim();
    if (newText && newText !== memory.content) {
      try {
        await fetchApi(`/${memory.id}`, {
          method: 'PUT',
          body: JSON.stringify({ content: newText, category: memory.category }),
        });
        memory.content = newText;
      } catch {
        contentEl.textContent = memory.content;
      }
    } else {
      contentEl.textContent = memory.content;
    }
  };

  contentEl.addEventListener('blur', finish, { once: true });
  contentEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { contentEl.textContent = memory.content; contentEl.blur(); }
  });
}

// ── Optimize ────────────────────────────────────────────

function initOptimize() {
  const btn = $.memoryOptimizeBtn;
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const project = getProjectPath();
    if (!project || !memories.length) return;

    btn.disabled = true;
    btn.textContent = 'Analyzing...';

    try {
      const result = await fetchApi('/optimize', {
        method: 'POST',
        body: JSON.stringify({ project }),
      });

      const preview = result.preview;
      if (!preview) throw new Error('No preview returned');

      showOptimizePreview(preview, project);
    } catch (err) {
      alert('Optimization failed: ' + (err.message || 'Unknown error'));
    } finally {
      btn.disabled = false;
      btn.textContent = 'Optimize';
    }
  });
}

function showOptimizePreview(preview, project) {
  document.querySelector('.memory-optimize-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'memory-optimize-overlay';

  const modal = document.createElement('div');
  modal.className = 'memory-optimize-modal';

  const header = document.createElement('div');
  header.className = 'memory-optimize-header';
  header.innerHTML = `<h3>Optimize Memories</h3><span class="memory-optimize-summary">${escapeHtml(preview.summary)}</span>`;
  modal.appendChild(header);

  const statsDiv = document.createElement('div');
  statsDiv.className = 'memory-optimize-stats';
  statsDiv.innerHTML = `
    <span class="optimize-stat"><strong>${preview.before}</strong> before</span>
    <span class="optimize-arrow">&rarr;</span>
    <span class="optimize-stat success"><strong>${preview.after}</strong> after</span>
    ${preview.noiseRemoved ? `<span class="optimize-stat warn">${preview.noiseRemoved} noise removed</span>` : ''}
  `;
  modal.appendChild(statsDiv);

  const columns = document.createElement('div');
  columns.className = 'memory-optimize-columns';

  const beforeCol = document.createElement('div');
  beforeCol.className = 'memory-optimize-col';
  beforeCol.innerHTML = `<h4>Before (${preview.original?.length || preview.before})</h4>`;
  const beforeList = document.createElement('div');
  beforeList.className = 'memory-optimize-list';
  for (const m of (preview.original || [])) {
    const item = document.createElement('div');
    item.className = 'memory-optimize-item removed';
    item.innerHTML = `<span class="memory-category-badge ${m.category}">${m.category}</span> ${escapeHtml(m.content)}`;
    beforeList.appendChild(item);
  }
  beforeCol.appendChild(beforeList);
  columns.appendChild(beforeCol);

  const afterCol = document.createElement('div');
  afterCol.className = 'memory-optimize-col';
  afterCol.innerHTML = `<h4>After (${preview.optimized?.length || 0})</h4>`;
  const afterList = document.createElement('div');
  afterList.className = 'memory-optimize-list';
  if (preview.optimized?.length) {
    for (const m of preview.optimized) {
      const item = document.createElement('div');
      item.className = 'memory-optimize-item added';
      item.innerHTML = `<span class="memory-category-badge ${m.category}">${m.category}</span> ${escapeHtml(m.content)}`;
      afterList.appendChild(item);
    }
  } else {
    afterList.innerHTML = '<div class="memory-optimize-empty">All memories were noise. Nothing to keep.</div>';
  }
  afterCol.appendChild(afterList);
  columns.appendChild(afterCol);

  modal.appendChild(columns);

  const footer = document.createElement('div');
  footer.className = 'memory-optimize-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'memory-optimize-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => overlay.remove());

  const applyBtn = document.createElement('button');
  applyBtn.className = 'memory-optimize-apply';
  applyBtn.textContent = `Apply (${preview.after} memories)`;
  applyBtn.addEventListener('click', async () => {
    applyBtn.disabled = true;
    applyBtn.textContent = 'Applying...';
    try {
      await fetchApi('/optimize/apply', {
        method: 'POST',
        body: JSON.stringify({ project, optimized: preview.optimized || [] }),
      });
      overlay.remove();
      reload();
    } catch (err) {
      alert('Apply failed: ' + (err.message || 'Unknown error'));
      applyBtn.disabled = false;
      applyBtn.textContent = `Apply (${preview.after} memories)`;
    }
  });

  footer.appendChild(cancelBtn);
  footer.appendChild(applyBtn);
  modal.appendChild(footer);

  overlay.appendChild(modal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}

// ── Lifecycle ───────────────────────────────────────────

function reload() {
  loadMemories();
  loadStats();
}

function isMemoryTabActive() {
  const pane = $.rightPanel?.querySelector('.right-panel-pane[data-tab="memory"]');
  return pane && pane.classList.contains('active') && !$.rightPanel.classList.contains('hidden');
}

// ── Init ────────────────────────────────────────────────

function initMemoryPanel() {
  if (!$.memoryList) return;

  initFilters();
  initSearch();
  initAddForm();
  initOptimize();

  // Reload when project changes
  on('projectChanged', reload);

  // Reload when memory tab becomes active
  on('rightPanel:tabChanged', (tabId) => {
    if (tabId === 'memory') reload();
  });
  on('rightPanel:opened', (tabId) => {
    if (tabId === 'memory') reload();
  });

  // Listen for memory events from WebSocket
  on('ws:message', (msg) => {
    if (msg.type === 'memories_captured' || msg.type === 'memory_saved') {
      reload();
    }
  });

  // Initial load
  reload();
}

initMemoryPanel();

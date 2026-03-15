// Repos Tab — Tab SDK plugin for managing git repositories
import { registerTab } from '/js/ui/tab-sdk.js';
import { escapeHtml } from '/js/core/utils.js';

// ── SVG Icons ────────────────────────────────────────
const ICONS = {
  chevron: `<svg class="repos-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`,
  folderClosed: `<svg class="repos-tree-icon folder" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  folderOpen: `<svg class="repos-tree-icon folder" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4l2 3h9a2 2 0 0 1 2 2v1"/><path d="M21 12H8a2 2 0 0 0-2 2l-1 5h16l-1-5a2 2 0 0 0-2-2z"/></svg>`,
  repo: `<svg class="repos-tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>`,
  search: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  plus: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  folderPlus: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`,
  refresh: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
  edit: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  trash: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  link: `<svg class="repos-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  path: `<svg class="repos-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
};

registerTab({
  id: 'repos',
  title: 'Repos',
  icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65S8.93 17.38 9 18v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>',
  lazy: true,

  init(ctx) {
    let groups = [];
    let repos = [];
    let expandedGroups = new Set();
    let searchQuery = '';
    let editingId = null;
    let dragItem = null;

    // ── Build DOM ─────────────────────────────────────
    const root = document.createElement('div');
    root.className = 'repos-tab';
    root.style.cssText = 'display:flex;flex-direction:column;flex:1;overflow:hidden;';

    root.innerHTML = `
      <div class="repos-toolbar">
        <div class="repos-search-wrap">
          ${ICONS.search}
          <input type="text" placeholder="Search repos..." autocomplete="off" class="repos-search">
        </div>
        <div class="repos-toolbar-actions">
          <button class="repos-toolbar-btn repos-add-group-btn" title="New group">${ICONS.folderPlus}</button>
          <button class="repos-toolbar-btn repos-add-repo-btn" title="Add repo">${ICONS.plus}</button>
          <button class="repos-toolbar-btn repos-refresh-btn" title="Refresh">${ICONS.refresh}</button>
        </div>
      </div>
      <div class="repos-list"></div>
      <div class="repos-footer">
        <span class="repos-count">0 repos</span>
      </div>
    `;

    const listEl = root.querySelector('.repos-list');
    const countEl = root.querySelector('.repos-count');
    const searchEl = root.querySelector('.repos-search');

    // ── API helpers ──────────────────────────────────
    async function loadData() {
      const refreshBtn = root.querySelector('.repos-refresh-btn');
      refreshBtn.classList.add('spinning');
      try {
        const data = await ctx.api.fetchRepos();
        groups = data.groups || [];
        repos = data.repos || [];
        render();
      } catch (err) {
        console.error('Failed to load repos:', err);
        listEl.innerHTML = '<div class="repos-empty">Failed to load repos</div>';
      } finally {
        refreshBtn.classList.remove('spinning');
      }
    }

    // ── Tree building ────────────────────────────────
    function getChildGroups(parentId) {
      return groups.filter(g => (g.parentId || null) === parentId);
    }

    function getGroupRepos(groupId) {
      return repos.filter(r => (r.groupId || null) === groupId);
    }

    function matchesSearch(item) {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      if (item.name && item.name.toLowerCase().includes(q)) return true;
      if (item.path && item.path.toLowerCase().includes(q)) return true;
      if (item.url && item.url.toLowerCase().includes(q)) return true;
      return false;
    }

    function groupHasMatchingDescendants(groupId) {
      if (getGroupRepos(groupId).some(r => matchesSearch(r))) return true;
      for (const child of getChildGroups(groupId)) {
        if (matchesSearch(child) || groupHasMatchingDescendants(child.id)) return true;
      }
      return false;
    }

    // ── Render ────────────────────────────────────────
    function render() {
      listEl.innerHTML = '';

      if (searchQuery) {
        expandedGroups = new Set(groups.map(g => g.id));
      }

      const hasContent = groups.length > 0 || repos.length > 0;
      if (!hasContent) {
        listEl.innerHTML = `<div class="repos-empty">
          <div class="repos-empty-icon">${ICONS.repo}</div>
          <div>No repositories yet</div>
          <div class="repos-empty-hint">Click + to add one, or right-click for options</div>
        </div>`;
        updateCount();
        return;
      }

      renderLevel(listEl, null, 0);

      // If search active and nothing matched
      if (searchQuery && listEl.children.length === 0) {
        listEl.innerHTML = `<div class="repos-empty">No matches for "${escapeHtml(searchQuery)}"</div>`;
      }

      updateCount();
    }

    function renderLevel(container, parentId, depth) {
      const childGroups = getChildGroups(parentId);
      const childRepos = getGroupRepos(parentId);

      for (const group of childGroups) {
        if (searchQuery && !matchesSearch(group) && !groupHasMatchingDescendants(group.id)) continue;
        renderGroup(container, group, depth);
      }

      for (const repo of childRepos) {
        if (searchQuery && !matchesSearch(repo)) continue;
        renderRepo(container, repo, depth);
      }
    }

    function renderGroup(container, group, depth) {
      const isExpanded = expandedGroups.has(group.id);
      const row = document.createElement('div');
      row.className = 'repos-item repos-group-item';
      row.dataset.id = group.id;
      row.dataset.type = 'group';
      row.style.paddingLeft = `${8 + depth * 16}px`;
      row.draggable = true;

      const childCount = countDescendantRepos(group.id);

      if (editingId === group.id) {
        row.innerHTML = `
          ${ICONS.chevron}
          ${isExpanded ? ICONS.folderOpen : ICONS.folderClosed}
          <input type="text" class="repos-inline-input" value="${escapeHtml(group.name)}" data-id="${group.id}" data-kind="group">
        `;
        row.querySelector('.repos-inline-input').addEventListener('keydown', handleInlineEditKey);
        row.querySelector('.repos-inline-input').addEventListener('blur', handleInlineEditBlur);
        setTimeout(() => row.querySelector('.repos-inline-input')?.focus(), 0);
      } else {
        row.innerHTML = `
          ${ICONS.chevron}
          ${isExpanded ? ICONS.folderOpen : ICONS.folderClosed}
          <span class="repos-group-name">${escapeHtml(group.name)}</span>
          <span class="repos-group-badge">${childCount}</span>
          <div class="repos-item-actions">
            <button class="repos-item-btn repos-edit-btn" data-id="${group.id}" data-kind="group" title="Rename">${ICONS.edit}</button>
            <button class="repos-item-btn repos-delete-btn" data-id="${group.id}" data-kind="group" title="Delete">${ICONS.trash}</button>
          </div>
        `;
      }

      const chevron = row.querySelector('.repos-chevron');
      if (isExpanded) chevron.classList.add('expanded');

      row.addEventListener('click', (e) => {
        if (e.target.closest('.repos-item-actions') || e.target.closest('.repos-inline-input')) return;
        if (expandedGroups.has(group.id)) expandedGroups.delete(group.id);
        else expandedGroups.add(group.id);
        render();
      });
      row.addEventListener('contextmenu', (e) => showGroupContextMenu(e, group));
      row.addEventListener('dragstart', (e) => {
        dragItem = { type: 'group', id: group.id };
        e.dataTransfer.effectAllowed = 'move';
        row.classList.add('dragging');
      });
      row.addEventListener('dragend', () => { row.classList.remove('dragging'); dragItem = null; clearDropTargets(); });
      row.addEventListener('dragover', handleDragOver);
      row.addEventListener('dragleave', handleDragLeave);
      row.addEventListener('drop', (e) => handleDrop(e, 'group', group.id));

      container.appendChild(row);

      if (isExpanded) {
        const children = document.createElement('div');
        children.className = 'repos-group-children expanded';
        renderLevel(children, group.id, depth + 1);
        container.appendChild(children);
      }
    }

    function renderRepo(container, repo, depth) {
      const row = document.createElement('div');
      row.className = 'repos-item repos-repo-item';
      row.dataset.id = repo.id;
      row.dataset.type = 'repo';
      row.style.paddingLeft = `${8 + depth * 16}px`;
      row.draggable = true;

      if (editingId === repo.id) {
        row.innerHTML = `
          <span class="repos-chevron-spacer"></span>
          ${ICONS.repo}
          <input type="text" class="repos-inline-input" value="${escapeHtml(repo.name)}" data-id="${repo.id}" data-kind="repo">
        `;
        row.querySelector('.repos-inline-input').addEventListener('keydown', handleInlineEditKey);
        row.querySelector('.repos-inline-input').addEventListener('blur', handleInlineEditBlur);
        setTimeout(() => row.querySelector('.repos-inline-input')?.focus(), 0);
      } else {
        const pathShort = repo.path ? repo.path.replace(/^\/Users\/[^/]+/, '~').replace(/^[A-Z]:\\Users\\[^\\]+/, '~') : '';
        row.innerHTML = `
          <span class="repos-chevron-spacer"></span>
          ${ICONS.repo}
          <div class="repos-repo-info">
            <span class="repos-repo-name">${escapeHtml(repo.name)}</span>
            ${pathShort ? `<span class="repos-repo-meta">${ICONS.path}<span>${escapeHtml(pathShort)}</span></span>` : ''}
            ${repo.url ? `<span class="repos-repo-meta">${ICONS.link}<span>${escapeHtml(repo.url)}</span></span>` : ''}
          </div>
          <div class="repos-item-actions">
            <button class="repos-item-btn repos-edit-btn" data-id="${repo.id}" data-kind="repo" title="Rename">${ICONS.edit}</button>
            <button class="repos-item-btn repos-delete-btn" data-id="${repo.id}" data-kind="repo" title="Delete">${ICONS.trash}</button>
          </div>
        `;
      }

      row.addEventListener('contextmenu', (e) => showRepoContextMenu(e, repo));

      if (repo.path) {
        row.addEventListener('dblclick', () => ctx.api.execCommand('code .', repo.path));
      } else if (repo.url) {
        row.addEventListener('dblclick', () => window.open(repo.url, '_blank'));
      }

      row.addEventListener('dragstart', (e) => {
        dragItem = { type: 'repo', id: repo.id };
        e.dataTransfer.effectAllowed = 'move';
        row.classList.add('dragging');
      });
      row.addEventListener('dragend', () => { row.classList.remove('dragging'); dragItem = null; clearDropTargets(); });

      container.appendChild(row);
    }

    function countDescendantRepos(groupId) {
      let count = getGroupRepos(groupId).length;
      for (const child of getChildGroups(groupId)) {
        count += countDescendantRepos(child.id);
      }
      return count;
    }

    function updateCount() {
      const n = repos.length;
      const g = groups.length;
      countEl.textContent = `${n} repo${n !== 1 ? 's' : ''}${g > 0 ? ` \u00b7 ${g} group${g !== 1 ? 's' : ''}` : ''}`;
      ctx.showBadge(n);
    }

    // ── Drag & drop helpers ─────────────────────────
    function handleDragOver(e) {
      e.preventDefault();
      if (!dragItem) return;
      e.dataTransfer.dropEffect = 'move';
      e.currentTarget.classList.add('drop-target');
    }

    function handleDragLeave(e) {
      e.currentTarget.classList.remove('drop-target');
    }

    function clearDropTargets() {
      root.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
    }

    async function handleDrop(e, targetType, targetId) {
      e.preventDefault();
      e.stopPropagation();
      clearDropTargets();
      if (!dragItem || dragItem.id === targetId) return;

      try {
        if (dragItem.type === 'repo') {
          const newGroupId = targetType === 'group' ? targetId : null;
          await ctx.api.updateRepo(dragItem.id, { groupId: newGroupId });
        } else if (dragItem.type === 'group') {
          if (targetType === 'group' && targetId !== dragItem.id) {
            await ctx.api.updateRepoGroup(dragItem.id, { parentId: targetId });
          }
        }
        await loadData();
      } catch (err) {
        console.error('Drop failed:', err);
      }
    }

    // ── Inline editing ──────────────────────────────
    function handleInlineEditKey(e) {
      if (e.key === 'Enter') {
        e.target.blur();
      } else if (e.key === 'Escape') {
        editingId = null;
        render();
      }
    }

    async function handleInlineEditBlur(e) {
      const id = e.target.dataset.id;
      const kind = e.target.dataset.kind;
      const newName = e.target.value.trim();
      editingId = null;

      if (!newName) { render(); return; }

      try {
        if (kind === 'group') {
          await ctx.api.updateRepoGroup(id, { name: newName });
        } else {
          await ctx.api.updateRepo(id, { name: newName });
        }
        await loadData();
      } catch (err) {
        console.error('Rename failed:', err);
        render();
      }
    }

    // ── Add repo dialog ─────────────────────────────
    function showAddRepoDialog(targetGroupId = null) {
      const overlay = document.createElement('div');
      overlay.className = 'repos-dialog-overlay';
      overlay.innerHTML = `
        <div class="repos-dialog">
          <div class="repos-dialog-title">Add Repository</div>
          <label class="repos-dialog-label">Name *
            <input type="text" class="repos-dialog-input" name="name" placeholder="my-project" autocomplete="off">
          </label>
          <label class="repos-dialog-label">Local Path
            <div class="repos-path-row">
              <input type="text" class="repos-dialog-input repos-path-input" name="path" placeholder="/path/to/repo" autocomplete="off" readonly>
              <button class="repos-btn repos-browse-btn" type="button" title="Browse folders">Browse</button>
            </div>
          </label>
          <div class="repos-browser" style="display:none;">
            <div class="repos-browser-breadcrumb"></div>
            <div class="repos-browser-list"></div>
          </div>
          <label class="repos-dialog-label">Remote URL
            <input type="text" class="repos-dialog-input" name="url" placeholder="https://github.com/..." autocomplete="off">
          </label>
          <label class="repos-dialog-label">Group
            <select class="repos-dialog-input" name="groupId">
              <option value="">None</option>
              ${groups.map(g => `<option value="${g.id}"${g.id === targetGroupId ? ' selected' : ''}>${escapeHtml(g.name)}</option>`).join('')}
            </select>
          </label>
          <div class="repos-dialog-actions">
            <button class="repos-btn repos-dialog-cancel">Cancel</button>
            <button class="repos-btn repos-dialog-save">Add</button>
          </div>
        </div>
      `;

      const browserEl = overlay.querySelector('.repos-browser');
      const breadcrumbEl = overlay.querySelector('.repos-browser-breadcrumb');
      const browserListEl = overlay.querySelector('.repos-browser-list');
      const pathInput = overlay.querySelector('[name="path"]');
      let browserVisible = false;

      async function navigateBrowser(dir) {
        try {
          const data = await ctx.api.browseFolders(dir || undefined);
          pathInput.value = data.current;

          // Breadcrumb
          const parts = data.current.split(/[/\\]/).filter(Boolean);
          let crumbPath = data.current.startsWith('/') ? '/' : '';
          let crumbHtml = '';
          // Root
          const rootLabel = data.current.startsWith('/') ? '/' : parts[0];
          const rootPath = data.current.startsWith('/') ? '/' : parts[0] + '\\';
          crumbHtml += `<span class="repos-browser-crumb" data-path="${escapeHtml(rootPath)}">${escapeHtml(rootLabel)}</span>`;
          const startIdx = data.current.startsWith('/') ? 0 : 1;
          for (let i = startIdx; i < parts.length; i++) {
            crumbPath += (i > 0 || !data.current.startsWith('/') ? (data.current.includes('\\') ? '\\' : '/') : '') + parts[i];
            if (i >= startIdx) {
              crumbHtml += `<span class="repos-browser-sep">/</span><span class="repos-browser-crumb" data-path="${escapeHtml(crumbPath)}">${escapeHtml(parts[i])}</span>`;
            }
          }
          breadcrumbEl.innerHTML = crumbHtml;
          breadcrumbEl.querySelectorAll('.repos-browser-crumb').forEach(crumb => {
            crumb.addEventListener('click', () => navigateBrowser(crumb.dataset.path));
          });

          // Directory list
          let listHtml = '';
          if (data.parent) {
            listHtml += `<div class="repos-browser-item repos-browser-parent" data-path="${escapeHtml(data.parent)}">${ICONS.folderClosed} <span>..</span></div>`;
          }
          for (const d of data.dirs) {
            const fullPath = data.current + (data.current.endsWith('/') || data.current.endsWith('\\') ? '' : '/') + d.name;
            listHtml += `<div class="repos-browser-item" data-path="${escapeHtml(fullPath)}">${ICONS.folderClosed} <span>${escapeHtml(d.name)}</span></div>`;
          }
          if (!data.dirs.length && !data.parent) {
            listHtml = '<div class="repos-browser-empty">No subdirectories</div>';
          }
          browserListEl.innerHTML = listHtml;
          browserListEl.querySelectorAll('.repos-browser-item').forEach(item => {
            item.addEventListener('click', () => navigateBrowser(item.dataset.path));
          });
        } catch (err) {
          browserListEl.innerHTML = `<div class="repos-browser-empty">Error: ${escapeHtml(err.message)}</div>`;
        }
      }

      overlay.querySelector('.repos-browse-btn').addEventListener('click', () => {
        browserVisible = !browserVisible;
        browserEl.style.display = browserVisible ? '' : 'none';
        if (browserVisible) navigateBrowser(pathInput.value || undefined);
      });

      overlay.querySelector('.repos-dialog-cancel').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

      overlay.querySelector('.repos-dialog-save').addEventListener('click', async () => {
        const name = overlay.querySelector('[name="name"]').value.trim();
        const path = overlay.querySelector('[name="path"]').value.trim();
        const url = overlay.querySelector('[name="url"]').value.trim();
        const groupId = overlay.querySelector('[name="groupId"]').value || null;

        if (!name) {
          overlay.querySelector('[name="name"]').style.borderColor = 'var(--error)';
          return;
        }

        try {
          await ctx.api.addRepo(name, path || null, groupId, url || null);
          overlay.remove();
          await loadData();
        } catch (err) {
          const errEl = overlay.querySelector('.repos-dialog-error') || document.createElement('div');
          errEl.className = 'repos-dialog-error';
          errEl.textContent = err.message;
          overlay.querySelector('.repos-dialog-actions').before(errEl);
        }
      });

      overlay.querySelectorAll('.repos-dialog-input').forEach(input => {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') overlay.querySelector('.repos-dialog-save').click();
          if (e.key === 'Escape') overlay.remove();
        });
      });

      root.appendChild(overlay);
      overlay.querySelector('[name="name"]').focus();
    }

    // ── Add group dialog ────────────────────────────
    function showAddGroupDialog(targetParentId = null) {
      const overlay = document.createElement('div');
      overlay.className = 'repos-dialog-overlay';
      overlay.innerHTML = `
        <div class="repos-dialog">
          <div class="repos-dialog-title">New Group</div>
          <label class="repos-dialog-label">Name *
            <input type="text" class="repos-dialog-input" name="name" placeholder="backend" autocomplete="off">
          </label>
          <label class="repos-dialog-label">Parent Group
            <select class="repos-dialog-input" name="parentId">
              <option value="">None (root)</option>
              ${groups.map(g => `<option value="${g.id}"${g.id === targetParentId ? ' selected' : ''}>${escapeHtml(g.name)}</option>`).join('')}
            </select>
          </label>
          <div class="repos-dialog-actions">
            <button class="repos-btn repos-dialog-cancel">Cancel</button>
            <button class="repos-btn repos-dialog-save">Create</button>
          </div>
        </div>
      `;

      overlay.querySelector('.repos-dialog-cancel').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

      overlay.querySelector('.repos-dialog-save').addEventListener('click', async () => {
        const name = overlay.querySelector('[name="name"]').value.trim();
        const parentId = overlay.querySelector('[name="parentId"]').value || null;

        if (!name) {
          overlay.querySelector('[name="name"]').style.borderColor = 'var(--error)';
          return;
        }

        try {
          await ctx.api.createRepoGroup(name, parentId);
          overlay.remove();
          await loadData();
        } catch (err) {
          console.error('Create group failed:', err);
        }
      });

      overlay.querySelectorAll('.repos-dialog-input').forEach(input => {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') overlay.querySelector('.repos-dialog-save').click();
          if (e.key === 'Escape') overlay.remove();
        });
      });

      root.appendChild(overlay);
      overlay.querySelector('[name="name"]').focus();
    }

    // ── Context menu ─────────────────────────────────
    let ctxMenu = null;

    function hideContextMenu() {
      if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; }
    }

    function positionMenu(menu, x, y) {
      menu.style.left = x + 'px';
      menu.style.top = y + 'px';
      document.body.appendChild(menu);
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + 'px';
      if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + 'px';
    }

    function createMenuItem(label, action) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.addEventListener('click', () => { hideContextMenu(); action(); });
      return btn;
    }

    function collectPathsInGroup(groupId) {
      const paths = getGroupRepos(groupId).filter(r => r.path).map(r => r.path);
      for (const child of getChildGroups(groupId)) {
        paths.push(...collectPathsInGroup(child.id));
      }
      return paths;
    }

    function showRepoContextMenu(e, repo) {
      e.preventDefault();
      e.stopPropagation();
      hideContextMenu();

      ctxMenu = document.createElement('div');
      ctxMenu.className = 'repos-ctx-menu';

      if (repo.url) {
        ctxMenu.appendChild(createMenuItem('Open in Browser', () => window.open(repo.url, '_blank')));
      }

      if (repo.path) {
        ctxMenu.appendChild(createMenuItem('Open in VS Code', () => ctx.api.execCommand('code .', repo.path)));
        ctxMenu.appendChild(createMenuItem('Open in Terminal', () => {
          const isWin = navigator.platform.startsWith('Win');
          const isMac = navigator.platform.startsWith('Mac');
          const cmd = isWin ? 'start cmd /k' : isMac ? 'open -a Terminal .' : 'x-terminal-emulator || xterm';
          ctx.api.execCommand(cmd, repo.path);
        }));
        ctxMenu.appendChild(createMenuItem('Copy Path', () => navigator.clipboard.writeText(repo.path)));
      }

      ctxMenu.appendChild(createMenuItem(repo.url ? 'Edit URL' : 'Set URL', async () => {
        const url = prompt('GitHub URL:', repo.url || '');
        if (url === null) return;
        try {
          await ctx.api.updateRepo(repo.id, { url: url.trim() || null });
          await loadData();
        } catch (err) { console.error('Failed to set URL:', err); }
      }));

      if (groups.length > 0 || repo.groupId) {
        const wrapper = document.createElement('div');
        wrapper.className = 'repos-ctx-submenu-wrapper';

        const moveBtn = document.createElement('button');
        moveBtn.className = 'repos-ctx-has-submenu';
        moveBtn.innerHTML = 'Move to Group <span class="repos-ctx-arrow">&rsaquo;</span>';
        wrapper.appendChild(moveBtn);

        const submenu = document.createElement('div');
        submenu.className = 'repos-ctx-submenu';

        if (repo.groupId) {
          submenu.appendChild(createMenuItem('Ungrouped', async () => {
            await ctx.api.updateRepo(repo.id, { groupId: null });
            await loadData();
          }));
        }

        for (const group of groups) {
          if (group.id === repo.groupId) continue;
          submenu.appendChild(createMenuItem(group.name, async () => {
            await ctx.api.updateRepo(repo.id, { groupId: group.id });
            await loadData();
          }));
        }

        wrapper.appendChild(submenu);
        ctxMenu.appendChild(wrapper);
      }

      ctxMenu.appendChild(createMenuItem('Rename', () => { editingId = repo.id; render(); }));

      const removeBtn = createMenuItem('Remove', async () => {
        try { await ctx.api.deleteRepo(repo.id); await loadData(); }
        catch (err) { console.error('Delete failed:', err); }
      });
      removeBtn.classList.add('repos-ctx-danger');
      ctxMenu.appendChild(removeBtn);

      positionMenu(ctxMenu, e.clientX, e.clientY);
    }

    function showGroupContextMenu(e, group) {
      e.preventDefault();
      e.stopPropagation();
      hideContextMenu();

      ctxMenu = document.createElement('div');
      ctxMenu.className = 'repos-ctx-menu';

      ctxMenu.appendChild(createMenuItem('Add Repo Here', () => showAddRepoDialog(group.id)));
      ctxMenu.appendChild(createMenuItem('New Sub-group', () => showAddGroupDialog(group.id)));

      const paths = collectPathsInGroup(group.id);
      if (paths.length > 0) {
        ctxMenu.appendChild(createMenuItem('Open All in VS Code', () => {
          for (const p of paths) ctx.api.execCommand('code .', p);
        }));
      }

      ctxMenu.appendChild(createMenuItem('Rename', () => { editingId = group.id; render(); }));

      const removeBtn = createMenuItem('Delete Group', async () => {
        try { await ctx.api.deleteRepoGroup(group.id); await loadData(); }
        catch (err) { console.error('Delete failed:', err); }
      });
      removeBtn.classList.add('repos-ctx-danger');
      ctxMenu.appendChild(removeBtn);

      positionMenu(ctxMenu, e.clientX, e.clientY);
    }

    document.addEventListener('click', (e) => {
      if (ctxMenu && !ctxMenu.contains(e.target)) hideContextMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideContextMenu();
    });

    // ── Event delegation ─────────────────────────────
    listEl.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.repos-edit-btn');
      if (editBtn) {
        e.stopPropagation();
        editingId = editBtn.dataset.id;
        render();
        return;
      }

      const deleteBtn = e.target.closest('.repos-delete-btn');
      if (deleteBtn) {
        e.stopPropagation();
        const id = deleteBtn.dataset.id;
        const kind = deleteBtn.dataset.kind;
        try {
          if (kind === 'group') {
            await ctx.api.deleteRepoGroup(id);
          } else {
            await ctx.api.deleteRepo(id);
          }
          await loadData();
        } catch (err) {
          console.error('Delete failed:', err);
        }
        return;
      }
    });

    // Drop on empty area = move to root
    listEl.addEventListener('dragover', (e) => {
      if (!dragItem) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    listEl.addEventListener('drop', (e) => handleDrop(e, 'root', null));

    // Toolbar buttons
    root.querySelector('.repos-add-group-btn').addEventListener('click', () => showAddGroupDialog());
    root.querySelector('.repos-add-repo-btn').addEventListener('click', () => showAddRepoDialog());
    root.querySelector('.repos-refresh-btn').addEventListener('click', loadData);

    // Search
    let searchTimer = null;
    searchEl.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        searchQuery = searchEl.value.trim();
        render();
      }, 200);
    });

    // ── Initial load ─────────────────────────────────
    loadData();

    return root;
  },
});

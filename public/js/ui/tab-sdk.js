// ╔══════════════════════════════════════════════════════════════╗
// ║                      Tab SDK — API Guide                     ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Register custom tabs in the right panel with a single function call.
// No HTML or dom.js changes needed — the SDK handles DOM creation,
// lifecycle hooks, badges, and state management automatically.
//
// ── Quick Start ─────────────────────────────────────────────────
//
//   // plugins/my-tab/client.js
//   import { registerTab } from '/js/ui/tab-sdk.js';
//
//   registerTab({
//     id: 'my-tab',
//     title: 'My Tab',
//     icon: '<svg>...</svg>',   // optional, 12×12 recommended
//     lazy: true,                // defer init until first open
//
//     init(ctx) {
//       const root = document.createElement('div');
//       root.textContent = 'Hello from my tab!';
//
//       // Listen for live WebSocket messages
//       ctx.on('ws:message', (msg) => { /* ... */ });
//
//       // React to state changes (e.g. session switch)
//       ctx.onState('sessionId', (id) => { /* reload data */ });
//
//       // Show a badge count on the tab button
//       ctx.showBadge(5);
//
//       return root;   // must return an HTMLElement
//     },
//
//     onActivate()   { /* tab became visible */ },
//     onDeactivate() { /* tab was hidden */ },
//     onDestroy()    { /* tab unregistered — cleanup */ },
//   });
//
//   // Auto-discovered — no main.js changes needed!
//
// ── registerTab(config) ─────────────────────────────────────────
//
//   config.id           {string}   Required. Unique identifier (data-tab value)
//   config.title        {string}   Required. Button label
//   config.icon         {string}   Optional. SVG/HTML for tab icon
//   config.position     {number}   Optional. 0-based insert index. Omit = append
//   config.shortcut     {string}   Optional. Informational shortcut label
//   config.lazy         {boolean}  Optional. Default false. Defer init() to first open
//   config.init(ctx)    {function} Required. Returns HTMLElement for tab content
//   config.onActivate   {function} Optional. Called each time tab is shown
//   config.onDeactivate {function} Optional. Called each time tab is hidden
//   config.onDestroy    {function} Optional. Called when tab is unregistered
//
// ── Context object (ctx) — passed to init(), onActivate, onDeactivate, onDestroy
//
//   ctx.pluginId              Your plugin's ID string
//   ctx.on(event, fn)         Subscribe to event bus (returns unsubscribe fn)
//   ctx.off(event, fn)        Remove an event listener
//   ctx.emit(event, data)     Publish to the app event bus
//   ctx.getState(key)         Read from the reactive store
//   ctx.onState(key, fn)      Subscribe to store changes (returns unsubscribe fn)
//   ctx.api                   The full API module (fetch helpers)
//   ctx.getProjectPath()      Current project path
//   ctx.getSessionId()        Current session ID
//   ctx.getTheme()            Current theme: 'dark' or 'light'
//   ctx.storage.get(key)      Read from plugin-scoped localStorage
//   ctx.storage.set(key, val) Write to plugin-scoped localStorage
//   ctx.storage.remove(key)   Remove from plugin-scoped localStorage
//   ctx.toast(msg, opts)      Show a temporary notification (opts: {duration, type})
//   ctx.showBadge(count)      Show a number badge on the tab button
//   ctx.clearBadge()          Hide the badge
//   ctx.setTitle(text)        Update the tab button label at runtime
//   ctx.dispose()             Unsubscribe all event/state listeners (auto-called on destroy)
//
// ── Other exports ───────────────────────────────────────────────
//
//   unregisterTab(id)         Remove a tab and call onDestroy
//   getRegisteredTabs()       Returns array of registered tab IDs
//   initTabSDK()              Called by right-panel.js — do not call manually
//
// ── Events ──────────────────────────────────────────────────────
//
//   ctx.on('projectChanged', (path) => ...)   Fires when user switches project
//   ctx.on('ws:message', (msg) => ...)        Live WebSocket stream messages
//   ctx.onState('sessionId', (id) => ...)     Session switch
//
// ── Tips ────────────────────────────────────────────────────────
//
//   • Use lazy:true for heavy tabs — init runs only on first open
//   • Build all DOM in init(); no index.html edits needed
//   • ctx.on/onState return unsubscribe fns; all auto-cleaned on tab destroy
//   • onActivate(ctx), onDeactivate(ctx), onDestroy(ctx) all receive ctx
//   • Use ctx.storage for persistent data (scoped to your plugin ID)
//   • ALWAYS use ctx.getProjectPath() to read the current project path
//   • Use ctx.on('projectChanged', fn) to reload data on project switch
//   • See plugins/claude-editor/client.js for a full working example
//
// ── Project-aware plugin example ────────────────────────────────
//
//   registerTab({
//     id: 'my-project-tab',
//     title: 'My Tab',
//     init(ctx) {
//       const root = document.createElement('div');
//
//       function loadData() {
//         const project = ctx.getProjectPath();
//         if (!project) return;
//         fetch(`/api/my-data?project=${encodeURIComponent(project)}`)
//           .then(r => r.json())
//           .then(data => { /* render */ });
//       }
//
//       ctx.on('projectChanged', loadData);
//       loadData();
//       return root;
//     },
//   });
//
// ════════════════════════════════════════════════════════════════

import { $ } from '../core/dom.js';
import { emit, on, off } from '../core/events.js';
import { getState, on as onState, off as offState } from '../core/store.js';
import * as api from '../core/api.js';
import {
  getAvailablePlugins, getEnabledPluginNames, setEnabledPluginNames,
  getPluginMeta, loadPluginByName, isPluginLoaded,
  trackPluginTab, getPluginTabId, getPluginTabMap,
  setTabIdResolver, getSortedPlugins, setPluginOrder,
  fetchMarketplace, installMarketplacePlugin, uninstallMarketplacePlugin,
} from '../core/plugin-loader.js';

/** Escape HTML to prevent XSS when rendering user-supplied plugin metadata */
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

const registeredTabs = new Map();
const unregisteredConfigs = new Map(); // stores configs for re-registration

// Wire up the tab ID resolver so plugin-loader can auto-detect tab IDs
setTabIdResolver(() => [...registeredTabs.keys()]);
let tabBarEl = null;
let contentEl = null;
let closeBtn = null;
let initialized = false;
const pendingTabs = [];

// ── Public API ──────────────────────────────────────────

/**
 * Register a new tab in the right panel.
 *
 * @param {object} config
 * @param {string} config.id           - Unique tab identifier (used as data-tab)
 * @param {string} config.title        - Display title on the tab button
 * @param {string} [config.icon]       - SVG/HTML icon (shown before title on narrow screens)
 * @param {number} [config.position]   - Insert position (0-based). Omit to append at end
 * @param {string} [config.shortcut]   - Keyboard shortcut description (informational)
 * @param {boolean} [config.lazy=false] - If true, init() is deferred until first tab open
 * @param {function} config.init       - Called with ctx, must return a DOM element (the tab content)
 * @param {function} [config.onActivate]   - Called when tab becomes visible
 * @param {function} [config.onDeactivate] - Called when tab is hidden
 * @param {function} [config.onDestroy]    - Called on cleanup
 */
export function registerTab(config) {
  if (!config.id || !config.init) {
    throw new Error('registerTab requires id and init');
  }
  if (registeredTabs.has(config.id)) {
    console.warn(`Tab "${config.id}" already registered`);
    return;
  }

  // Store original config for potential re-registration
  unregisteredConfigs.set(config.id, config);

  const tab = {
    ...config,
    lazy: config.lazy ?? false,
    _initialized: false,
    _paneEl: null,
    _btnEl: null,
    _badgeEl: null,
  };

  registeredTabs.set(config.id, tab);

  if (initialized) {
    mountTab(tab);
  } else {
    pendingTabs.push(tab);
  }
}

/**
 * Re-register a previously unregistered tab from its stored config.
 */
export function reRegisterTab(tabId) {
  if (registeredTabs.has(tabId)) return true;
  const config = unregisteredConfigs.get(tabId);
  if (!config) return false;
  registerTab(config);
  return true;
}

/**
 * Unregister and remove a tab.
 */
export function unregisterTab(id) {
  const tab = registeredTabs.get(id);
  if (!tab) return;
  if (tab.onDestroy) tab.onDestroy(tab._ctx);
  if (tab._ctx) tab._ctx.dispose(); // auto-cleanup all event/state subscriptions
  if (tab._btnEl) tab._btnEl.remove();
  if (tab._paneEl) tab._paneEl.remove();
  registeredTabs.delete(id);
}

/**
 * Get all registered tab IDs (including built-in ones managed by this SDK).
 */
export function getRegisteredTabs() {
  return [...registeredTabs.keys()];
}

// ── Internal ────────────────────────────────────────────

function buildCtx(tab) {
  // Track subscriptions for cleanup on destroy
  const _unsubs = [];

  const ctx = {
    // Plugin identity
    pluginId: tab.id,

    // Event bus (returns unsubscribe handle)
    on(event, fn) {
      const unsub = on(event, fn);
      _unsubs.push(unsub);
      return unsub;
    },
    off,
    emit,

    // State (returns unsubscribe handle)
    getState,
    onState(key, fn) {
      const unsub = onState(key, fn);
      _unsubs.push(unsub);
      return unsub;
    },

    // API
    api,

    // Convenience
    getProjectPath: () => $.projectSelect?.value || '',
    getSessionId: () => getState('sessionId'),

    // Theme
    getTheme: () => document.documentElement.getAttribute('data-theme') || 'dark',

    // Namespaced localStorage
    storage: {
      get(key) {
        try { return JSON.parse(localStorage.getItem(`claudeck-plugin-${tab.id}-${key}`)); }
        catch { return null; }
      },
      set(key, value) {
        localStorage.setItem(`claudeck-plugin-${tab.id}-${key}`, JSON.stringify(value));
      },
      remove(key) {
        localStorage.removeItem(`claudeck-plugin-${tab.id}-${key}`);
      },
    },

    // Toast notifications
    toast(message, opts = {}) {
      const { duration = 3000, type = 'info' } = opts;
      const el = document.createElement('div');
      el.className = `claudeck-toast claudeck-toast-${type}`;
      el.textContent = message;
      el.style.cssText = `
        position:fixed;bottom:24px;right:24px;z-index:99999;
        padding:10px 20px;border-radius:8px;font-size:13px;
        font-family:var(--font-sans);color:#fff;pointer-events:auto;
        animation:claudeck-toast-in .3s ease;
        background:${type === 'error' ? 'var(--error,#e54)' : type === 'success' ? 'var(--success,#33d17a)' : 'var(--bg-elevated,#333)'};
        border:1px solid ${type === 'error' ? 'var(--error,#e54)' : type === 'success' ? 'var(--success,#33d17a)' : 'var(--border,#444)'};
        box-shadow:var(--shadow-md,0 4px 12px rgba(0,0,0,.3));
      `;
      document.body.appendChild(el);
      setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, duration - 300);
      setTimeout(() => el.remove(), duration);
    },

    // Tab-specific
    showBadge(count) {
      if (!tab._btnEl) return;
      let badge = tab._badgeEl;
      if (count > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'right-panel-tab-badge';
          tab._btnEl.appendChild(badge);
          tab._badgeEl = badge;
        }
        badge.textContent = count;
        badge.style.display = '';
      } else if (badge) {
        badge.style.display = 'none';
      }
    },
    clearBadge() {
      if (tab._badgeEl) {
        tab._badgeEl.style.display = 'none';
      }
    },
    setTitle(text) {
      if (tab._btnEl) {
        const titleSpan = tab._btnEl.querySelector('.tab-title');
        if (titleSpan) titleSpan.textContent = text;
        else tab._btnEl.childNodes[tab._btnEl.childNodes.length - 1].textContent = text;
      }
    },

    /** Unsubscribe all event/state listeners registered via this ctx */
    dispose() {
      _unsubs.forEach(fn => fn());
      _unsubs.length = 0;
    },
  };

  return ctx;
}

function mountTab(tab) {
  if (!tabBarEl || !contentEl) return;

  // Create tab button
  const btn = document.createElement('button');
  btn.className = 'right-panel-tab';
  btn.dataset.tab = tab.id;

  if (tab.icon) {
    const iconSpan = document.createElement('span');
    iconSpan.className = 'tab-icon';
    iconSpan.innerHTML = tab.icon;
    btn.appendChild(iconSpan);
  }

  const titleSpan = document.createElement('span');
  titleSpan.className = 'tab-title';
  titleSpan.textContent = tab.title;
  btn.appendChild(titleSpan);

  // Insert before "+" button (or close button as fallback)
  const addBtn = tabBarEl.querySelector('.right-panel-add-tab');
  const insertBefore = addBtn || closeBtn;

  if (tab.position != null) {
    const allTabs = tabBarEl.querySelectorAll('.right-panel-tab');
    const target = allTabs[tab.position];
    if (target) {
      tabBarEl.insertBefore(btn, target);
    } else {
      tabBarEl.insertBefore(btn, insertBefore);
    }
  } else {
    tabBarEl.insertBefore(btn, insertBefore);
  }

  tab._btnEl = btn;

  // Create pane
  const pane = document.createElement('div');
  pane.className = 'right-panel-pane';
  pane.dataset.tab = tab.id;
  contentEl.appendChild(pane);
  tab._paneEl = pane;

  // Initialize content (unless lazy)
  if (!tab.lazy) {
    initTabContent(tab);
  }

  // Click handler — switches to this tab via the right-panel API
  btn.addEventListener('click', () => {
    // Update all tab buttons
    tabBarEl.querySelectorAll('.right-panel-tab').forEach(b => {
      b.classList.toggle('active', b === btn);
    });

    // Update all panes
    contentEl.parentElement.querySelectorAll('.right-panel-pane').forEach(p => {
      p.classList.toggle('active', p.dataset.tab === tab.id);
    });

    localStorage.setItem('claudeck-right-panel-tab', tab.id);
    emit('rightPanel:tabChanged', tab.id);

    // Scroll active tab into view
    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  });
}

function initTabContent(tab) {
  if (tab._initialized) return;
  tab._initialized = true;

  const ctx = buildCtx(tab);
  tab._ctx = ctx; // store for lifecycle hooks and cleanup
  const el = tab.init(ctx);
  if (el instanceof HTMLElement) {
    tab._paneEl.appendChild(el);
  }
}

function ensureInit(tab) {
  if (tab.lazy && !tab._initialized) {
    initTabContent(tab);
  }
}

// ── Lifecycle hooks ─────────────────────────────────────

function onTabActivated(tabId) {
  for (const [id, tab] of registeredTabs) {
    if (id === tabId) {
      ensureInit(tab);
      if (tab.onActivate) tab.onActivate(tab._ctx);
    } else {
      if (tab._initialized && tab.onDeactivate) tab.onDeactivate(tab._ctx);
    }
  }
}

// ── Init ────────────────────────────────────────────────

export function initTabSDK() {
  const panel = $.rightPanel;
  if (!panel) return;

  tabBarEl = panel.querySelector('.right-panel-tab-bar');
  contentEl = panel.querySelector('.right-panel-content');
  closeBtn = panel.querySelector('.right-panel-close');

  if (!tabBarEl || !contentEl) return;

  initialized = true;

  // Add "+" button to open Plugin Marketplace (insert before close button)
  const addBtn = document.createElement('button');
  addBtn.className = 'right-panel-add-tab';
  addBtn.title = 'Plugin Marketplace';
  addBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  addBtn.addEventListener('click', () => openMarketplace());
  tabBarEl.insertBefore(addBtn, closeBtn);

  // Mount any tabs registered before init (inserted before "+" button)
  for (const tab of pendingTabs) {
    mountTab(tab);
  }
  pendingTabs.length = 0;

  // Apply saved plugin order
  const savedEnabled = getEnabledPluginNames();
  if (savedEnabled.length) reorderPluginTabs(savedEnabled);

  // Emit projectChanged event when the project selector changes
  if ($.projectSelect) {
    $.projectSelect.addEventListener('change', () => {
      const path = $.projectSelect.value || '';
      emit('projectChanged', path);
    });
  }

  // Listen for tab changes to fire lifecycle hooks
  on('rightPanel:tabChanged', onTabActivated);
  on('rightPanel:opened', onTabActivated);
}

// ── Plugin Marketplace ──────────────────────────────────

function openMarketplace() {
  // Don't open multiple
  if (document.querySelector('.marketplace-overlay')) return;

  // Overlay
  const overlay = document.createElement('div');
  overlay.className = 'marketplace-overlay';

  // Popup
  const popup = document.createElement('div');
  popup.className = 'marketplace-popup';

  // Header with tabs
  const header = document.createElement('div');
  header.className = 'marketplace-header';
  header.innerHTML = `
    <h3>Plugin Marketplace</h3>
    <div class="marketplace-tabs">
      <button class="marketplace-tab active" data-marketplace-tab="installed">Installed</button>
      <button class="marketplace-tab" data-marketplace-tab="community">Community</button>
    </div>
  `;
  popup.appendChild(header);

  // Tab content container
  const tabContent = document.createElement('div');
  tabContent.className = 'marketplace-tab-content';
  popup.appendChild(tabContent);

  // Footer (shared by both tabs)
  const footer = document.createElement('div');
  footer.className = 'marketplace-footer';
  popup.appendChild(footer);

  // ── Tab switching ──
  let activeTab = 'installed';
  const tabBtns = header.querySelectorAll('.marketplace-tab');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.marketplaceTab;
      if (activeTab === 'installed') renderInstalledTab();
      else renderCommunityTab();
    });
  });

  // ── Installed tab ──
  function renderInstalledTab() {
    const plugins = getSortedPlugins();
    const enabled = new Set(getEnabledPluginNames());
    const pending = new Set(enabled);

    tabContent.innerHTML = '';
    footer.innerHTML = '';

    const subtitle = document.createElement('div');
    subtitle.className = 'marketplace-subtitle';
    subtitle.textContent = `${plugins.length} plugin${plugins.length !== 1 ? 's' : ''} available · drag to reorder`;
    tabContent.appendChild(subtitle);

    const list = document.createElement('div');
    list.className = 'marketplace-list';

    if (!plugins.length) {
      list.innerHTML = '<div class="marketplace-empty">No plugins available.<br>Drop files into <code>plugins/</code> to get started.</div>';
    }

    let dragItem = null;
    let dragPlaceholder = null;

    for (const plugin of plugins) {
      const meta = getPluginMeta(plugin.name);
      const tabId = getPluginTabId(plugin.name);
      const loaded = tabId && registeredTabs.has(tabId);

      const item = document.createElement('div');
      item.className = 'marketplace-item';
      item.dataset.plugin = plugin.name;
      item.draggable = true;
      if (pending.has(plugin.name)) item.classList.add('selected');

      const sourceLabel = plugin.fromMarketplace ? '<span class="marketplace-source community">community</span>' : '';

      item.innerHTML = `
        <div class="marketplace-drag-handle" title="Drag to reorder">⠿</div>
        <div class="marketplace-item-icon">${esc(meta.icon)}</div>
        <div class="marketplace-item-info">
          <div class="marketplace-item-name">${esc(formatPluginName(plugin.name))} ${sourceLabel}</div>
          <div class="marketplace-item-desc">${esc(meta.description)}</div>
        </div>
        <div class="marketplace-item-status">
          ${loaded ? '<span class="marketplace-loaded">loaded</span>' : ''}
        </div>
        <div class="marketplace-item-toggle">
          <div class="marketplace-checkbox ${pending.has(plugin.name) ? 'checked' : ''}"></div>
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.marketplace-drag-handle')) return;
        const cb = item.querySelector('.marketplace-checkbox');
        if (pending.has(plugin.name)) {
          pending.delete(plugin.name);
          cb.classList.remove('checked');
          item.classList.remove('selected');
        } else {
          pending.add(plugin.name);
          cb.classList.add('checked');
          item.classList.add('selected');
        }
      });

      // Drag events
      item.addEventListener('dragstart', (e) => {
        dragItem = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        dragPlaceholder = document.createElement('div');
        dragPlaceholder.className = 'marketplace-drop-indicator';
        requestAnimationFrame(() => { item.style.opacity = '0.4'; });
      });

      item.addEventListener('dragend', () => {
        if (dragItem) { dragItem.classList.remove('dragging'); dragItem.style.opacity = ''; }
        if (dragPlaceholder?.parentNode) dragPlaceholder.remove();
        dragItem = null;
        dragPlaceholder = null;
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!dragItem || dragItem === item) return;
        const rect = item.getBoundingClientRect();
        const after = e.clientY > rect.top + rect.height / 2;
        if (after) item.after(dragPlaceholder);
        else item.before(dragPlaceholder);
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!dragItem || dragItem === item) return;
        if (dragPlaceholder?.parentNode) {
          dragPlaceholder.before(dragItem);
          dragPlaceholder.remove();
        }
        dragItem.classList.remove('dragging');
        dragItem.style.opacity = '';
        dragItem = null;
        dragPlaceholder = null;
      });

      list.appendChild(item);
    }

    tabContent.appendChild(list);

    // Footer buttons
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'marketplace-btn marketplace-btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());

    const applyBtn = document.createElement('button');
    applyBtn.className = 'marketplace-btn marketplace-btn-apply';
    applyBtn.textContent = 'Apply';
    applyBtn.addEventListener('click', async () => {
      const orderedNames = [...list.querySelectorAll('.marketplace-item')]
        .map(el => el.dataset.plugin).filter(Boolean);
      setPluginOrder(orderedNames);
      const newEnabled = orderedNames.filter(n => pending.has(n));
      setEnabledPluginNames(newEnabled);

      for (const [id] of [...registeredTabs]) {
        if (!isPluginTab(id)) continue;
        if (!newEnabled.some(n => getPluginTabId(n) === id)) unregisterTab(id);
      }

      for (const name of newEnabled) {
        const existingTabId = getPluginTabId(name);
        if (existingTabId && registeredTabs.has(existingTabId)) continue;
        if (existingTabId && reRegisterTab(existingTabId)) continue;
        if (!isPluginLoaded(name)) await loadPluginByName(name);
      }

      reorderPluginTabs(newEnabled);
      overlay.remove();
    });

    footer.appendChild(cancelBtn);
    footer.appendChild(applyBtn);
  }

  // ── Community tab ──
  async function renderCommunityTab() {
    tabContent.innerHTML = '';
    footer.innerHTML = '';

    // Loading state
    const loading = document.createElement('div');
    loading.className = 'marketplace-loading';
    loading.innerHTML = '<div class="marketplace-spinner"></div><span>Loading community plugins...</span>';
    tabContent.appendChild(loading);

    // Close button in footer
    const closeBtn = document.createElement('button');
    closeBtn.className = 'marketplace-btn marketplace-btn-cancel';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => overlay.remove());
    footer.appendChild(closeBtn);

    const registry = await fetchMarketplace(true);
    tabContent.innerHTML = '';

    if (!registry || !registry.plugins?.length) {
      tabContent.innerHTML = `
        <div class="marketplace-empty">
          No community plugins available yet.<br>
          <a href="https://github.com/hamedafarag/claudeck-marketplace" target="_blank" rel="noopener">
            Submit your plugin →
          </a>
        </div>
      `;
      return;
    }

    const subtitle = document.createElement('div');
    subtitle.className = 'marketplace-subtitle';
    subtitle.textContent = `${registry.plugins.length} community plugin${registry.plugins.length !== 1 ? 's' : ''} available`;
    tabContent.appendChild(subtitle);

    const list = document.createElement('div');
    list.className = 'marketplace-list';

    for (const plugin of registry.plugins) {
      const item = document.createElement('div');
      item.className = 'marketplace-item marketplace-community-item';
      item.dataset.plugin = plugin.id;

      const icon = plugin.icon || '🧩';
      const hasServer = plugin.hasServer;
      const serverBadge = hasServer ? '<span class="marketplace-source server" title="This plugin includes server-side code">server</span>' : '';

      let actionHtml;
      if (plugin.isBuiltin) {
        actionHtml = `<span class="marketplace-action-btn" style="opacity:.5;cursor:default;border:none;">Built-in</span>`;
      } else if (plugin.updateAvailable) {
        actionHtml = `<button class="marketplace-action-btn marketplace-update-btn" data-action="update">Update</button>`;
      } else if (plugin.installed) {
        actionHtml = `<button class="marketplace-action-btn marketplace-uninstall-btn" data-action="uninstall">Uninstall</button>`;
      } else {
        actionHtml = `<button class="marketplace-action-btn marketplace-install-btn" data-action="install">Install</button>`;
      }

      item.innerHTML = `
        <div class="marketplace-item-icon">${esc(icon)}</div>
        <div class="marketplace-item-info">
          <div class="marketplace-item-name">
            ${esc(plugin.name || formatPluginName(plugin.id))} ${serverBadge}
          </div>
          <div class="marketplace-item-desc">${esc(plugin.description || '')}</div>
          <div class="marketplace-item-meta">
            <span class="marketplace-author">by ${esc(plugin.author || 'unknown')}</span>
            <span class="marketplace-version">v${esc(plugin.version || '0.0.0')}</span>
            ${plugin.installedVersion && plugin.updateAvailable ? `<span class="marketplace-version-old">installed: v${esc(plugin.installedVersion)}</span>` : ''}
          </div>
        </div>
        <div class="marketplace-item-actions">${actionHtml}</div>
      `;

      // Action button handler (skip built-in plugins which have no interactive action)
      const actionBtn = item.querySelector('.marketplace-action-btn');
      if (!plugin.isBuiltin) actionBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const action = actionBtn.dataset.action;
        actionBtn.disabled = true;
        actionBtn.textContent = action === 'uninstall' ? 'Removing...' : 'Installing...';

        try {
          if (action === 'uninstall') {
            // Unregister tab if loaded
            const tabId = getPluginTabId(plugin.id);
            if (tabId) unregisterTab(tabId);
            await uninstallMarketplacePlugin(plugin.id);
            plugin.installed = false;
            plugin.installedVersion = null;
            plugin.updateAvailable = false;
            actionBtn.textContent = 'Install';
            actionBtn.className = 'marketplace-action-btn marketplace-install-btn';
            actionBtn.dataset.action = 'install';
          } else {
            // Install or update
            if (hasServer) {
              const pluginLabel = plugin.name || plugin.id;
              const proceed = confirm(
                `"${pluginLabel}" includes server-side code that will run on your machine.\n\nServer plugins require CLAUDECK_USER_SERVER_PLUGINS=true to enable server routes.\n\nContinue with installation?`
              );
              if (!proceed) {
                actionBtn.disabled = false;
                actionBtn.textContent = action === 'update' ? 'Update' : 'Install';
                return;
              }
            }
            await installMarketplacePlugin(plugin);
            plugin.installed = true;
            plugin.installedVersion = plugin.version;
            plugin.updateAvailable = false;
            actionBtn.textContent = 'Uninstall';
            actionBtn.className = 'marketplace-action-btn marketplace-uninstall-btn';
            actionBtn.dataset.action = 'uninstall';
          }
        } catch (err) {
          actionBtn.textContent = 'Error';
          console.error(`Marketplace ${action} failed:`, err);
          setTimeout(() => {
            actionBtn.textContent = action === 'uninstall' ? 'Uninstall' : (action === 'update' ? 'Update' : 'Install');
          }, 2000);
        }
        actionBtn.disabled = false;
      });

      list.appendChild(item);
    }

    tabContent.appendChild(list);
  }

  // Initial render
  renderInstalledTab();

  overlay.appendChild(popup);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const onKey = (e) => {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);

  document.body.appendChild(overlay);
}

/**
 * Reorder plugin tab buttons and panes in the DOM to match the given order.
 * Built-in tabs stay in place; plugin tabs are repositioned after them.
 */
function reorderPluginTabs(enabledNames) {
  if (!tabBarEl || !contentEl) return;

  const addBtn = tabBarEl.querySelector('.right-panel-add-tab');
  const insertBeforeBtn = addBtn || closeBtn;

  // Resolve ordered tab IDs from plugin names
  const orderedTabIds = enabledNames
    .map(name => getPluginTabId(name))
    .filter(id => id && registeredTabs.has(id));

  // Move each plugin tab button (in order) right before the "+" button
  for (const tabId of orderedTabIds) {
    const tab = registeredTabs.get(tabId);
    if (tab?._btnEl) {
      tabBarEl.insertBefore(tab._btnEl, insertBeforeBtn);
    }
    if (tab?._paneEl) {
      contentEl.appendChild(tab._paneEl);
    }
  }
}

/** Built-in (hardcoded) tab IDs that are never managed by the marketplace */
const BUILTIN_TABS = new Set(['files', 'git', 'memory', 'mcp', 'tips', 'assistant', 'skills', 'tab-sdk', 'architecture', 'adding-features']);

function isPluginTab(tabId) {
  return !BUILTIN_TABS.has(tabId);
}

function formatPluginName(name) {
  return name
    .replace(/-tab$/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

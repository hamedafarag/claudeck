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
// ── Context object (ctx) — passed to init() ─────────────────────
//
//   ctx.on(event, fn)         Subscribe to the app event bus
//   ctx.emit(event, data)     Publish to the app event bus
//   ctx.getState(key)         Read from the reactive store
//   ctx.onState(key, fn)      Subscribe to store changes
//   ctx.api                   The full API module (fetch helpers)
//   ctx.getProjectPath()      Current project path
//   ctx.getSessionId()        Current session ID
//   ctx.showBadge(count)      Show a number badge on the tab button
//   ctx.clearBadge()          Hide the badge
//   ctx.setTitle(text)        Update the tab button label at runtime
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
//   • ALWAYS use ctx.getProjectPath() to read the current project path.
//     NEVER use document.getElementById('project-select') directly.
//   • Use ctx.on('projectChanged', fn) to reload data on project switch.
//     NEVER add your own change listener to the project select element.
//   • Use ctx.onState('sessionId', fn) to reload on session switch
//   • Existing shortcuts (e.g. openRightPanel('my-tab')) work automatically
//   • See plugins/event-stream/client.js for a full working example
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
import { emit, on } from '../core/events.js';
import { getState, on as onState } from '../core/store.js';
import * as api from '../core/api.js';
import {
  getAvailablePlugins, getEnabledPluginNames, setEnabledPluginNames,
  getPluginMeta, loadPluginByName, isPluginLoaded,
  trackPluginTab, getPluginTabId, getPluginTabMap,
  setTabIdResolver, getSortedPlugins, setPluginOrder,
} from '../core/plugin-loader.js';

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
  if (tab.onDestroy) tab.onDestroy();
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
  return {
    // Event bus
    on,
    emit,

    // State
    getState,
    onState,

    // API
    api,

    // Convenience
    getProjectPath: () => $.projectSelect?.value || '',
    getSessionId: () => getState('sessionId'),

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
  };
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
      if (tab.onActivate) tab.onActivate();
    } else {
      if (tab._initialized && tab.onDeactivate) tab.onDeactivate();
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

  const plugins = getSortedPlugins();
  const enabled = new Set(getEnabledPluginNames());

  // Overlay
  const overlay = document.createElement('div');
  overlay.className = 'marketplace-overlay';

  // Popup
  const popup = document.createElement('div');
  popup.className = 'marketplace-popup';

  // Header
  const header = document.createElement('div');
  header.className = 'marketplace-header';
  header.innerHTML = `
    <h3>Plugin Marketplace</h3>
    <span class="marketplace-subtitle">${plugins.length} plugin${plugins.length !== 1 ? 's' : ''} available · drag to reorder</span>
  `;
  popup.appendChild(header);

  // Plugin list
  const list = document.createElement('div');
  list.className = 'marketplace-list';

  if (!plugins.length) {
    list.innerHTML = '<div class="marketplace-empty">No plugins available.<br>Drop files into <code>plugins/</code> to get started.</div>';
  }

  // Track pending selections (start from current state)
  const pending = new Set(enabled);

  // ── Drag state ──
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

    item.innerHTML = `
      <div class="marketplace-drag-handle" title="Drag to reorder">⠿</div>
      <div class="marketplace-item-icon">${meta.icon}</div>
      <div class="marketplace-item-info">
        <div class="marketplace-item-name">${formatPluginName(plugin.name)}</div>
        <div class="marketplace-item-desc">${meta.description}</div>
      </div>
      <div class="marketplace-item-status">
        ${loaded ? '<span class="marketplace-loaded">loaded</span>' : ''}
      </div>
      <div class="marketplace-item-toggle">
        <div class="marketplace-checkbox ${pending.has(plugin.name) ? 'checked' : ''}"></div>
      </div>
    `;

    // Toggle selection (ignore clicks on drag handle)
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

    // ── Drag events ──
    item.addEventListener('dragstart', (e) => {
      dragItem = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';

      // Create placeholder
      dragPlaceholder = document.createElement('div');
      dragPlaceholder.className = 'marketplace-drop-indicator';

      requestAnimationFrame(() => { item.style.opacity = '0.4'; });
    });

    item.addEventListener('dragend', () => {
      if (dragItem) {
        dragItem.classList.remove('dragging');
        dragItem.style.opacity = '';
      }
      if (dragPlaceholder && dragPlaceholder.parentNode) {
        dragPlaceholder.remove();
      }
      dragItem = null;
      dragPlaceholder = null;
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!dragItem || dragItem === item) return;

      const rect = item.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const after = e.clientY > midY;

      if (after) {
        item.after(dragPlaceholder);
      } else {
        item.before(dragPlaceholder);
      }
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!dragItem || dragItem === item) return;

      // Insert dragged item where the placeholder is
      if (dragPlaceholder && dragPlaceholder.parentNode) {
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

  popup.appendChild(list);

  // Footer with Apply / Cancel
  const footer = document.createElement('div');
  footer.className = 'marketplace-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'marketplace-btn marketplace-btn-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => overlay.remove());

  const applyBtn = document.createElement('button');
  applyBtn.className = 'marketplace-btn marketplace-btn-apply';
  applyBtn.textContent = 'Apply';
  applyBtn.addEventListener('click', async () => {
    // Read order from current DOM positions
    const orderedNames = [...list.querySelectorAll('.marketplace-item')]
      .map(el => el.dataset.plugin)
      .filter(Boolean);

    setPluginOrder(orderedNames);

    // Only enabled in the order they appear
    const newEnabled = orderedNames.filter(n => pending.has(n));
    setEnabledPluginNames(newEnabled);

    // Unload (hide) disabled plugins first
    for (const [id] of [...registeredTabs]) {
      if (!isPluginTab(id)) continue;
      const belongsToAny = newEnabled.some(n => getPluginTabId(n) === id);
      if (!belongsToAny) {
        unregisterTab(id);
      }
    }

    // Load newly enabled plugins in order
    for (const name of newEnabled) {
      const existingTabId = getPluginTabId(name);

      if (existingTabId && registeredTabs.has(existingTabId)) continue;

      if (existingTabId && reRegisterTab(existingTabId)) continue;

      if (!isPluginLoaded(name)) {
        await loadPluginByName(name);
      }
    }

    // Reorder tab buttons & panes in the DOM to match marketplace order
    reorderPluginTabs(newEnabled);

    overlay.remove();
  });

  footer.appendChild(cancelBtn);
  footer.appendChild(applyBtn);
  popup.appendChild(footer);

  overlay.appendChild(popup);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Close on Escape
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
const BUILTIN_TABS = new Set(['files', 'git', 'memory', 'mcp', 'tips', 'assistant', 'tab-sdk', 'architecture', 'adding-features']);

function isPluginTab(tabId) {
  return !BUILTIN_TABS.has(tabId);
}

function formatPluginName(name) {
  return name
    .replace(/-tab$/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

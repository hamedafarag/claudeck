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
//   // my-tab.js
//   import { registerTab } from './tab-sdk.js';
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
//   // main.js — just add: import './my-tab.js';
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
// ── Tips ────────────────────────────────────────────────────────
//
//   • Use lazy:true for heavy tabs — init runs only on first open
//   • Build all DOM in init(); no index.html edits needed
//   • Use ctx.on('ws:message', fn) for real-time streaming events
//   • Use ctx.onState('sessionId', fn) to reload on session switch
//   • Existing shortcuts (e.g. openRightPanel('my-tab')) work automatically
//   • See event-stream-tab.js for a full working example
//
// ════════════════════════════════════════════════════════════════

import { $ } from './dom.js';
import { emit, on } from './events.js';
import { getState, on as onState } from './store.js';
import * as api from './api.js';

const registeredTabs = new Map();
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

  // Insert at position (before close button)
  if (tab.position != null) {
    const allTabs = tabBarEl.querySelectorAll('.right-panel-tab');
    const target = allTabs[tab.position];
    if (target) {
      tabBarEl.insertBefore(btn, target);
    } else {
      tabBarEl.insertBefore(btn, closeBtn);
    }
  } else {
    tabBarEl.insertBefore(btn, closeBtn);
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

    localStorage.setItem('shawkat-right-panel-tab', tab.id);
    emit('rightPanel:tabChanged', tab.id);
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

  // Mount any tabs registered before init
  for (const tab of pendingTabs) {
    mountTab(tab);
  }
  pendingTabs.length = 0;

  // Add "+" button to open Dev Docs (insert before close button)
  const addBtn = document.createElement('button');
  addBtn.className = 'right-panel-add-tab';
  addBtn.title = 'Add tab — Developer Docs';
  addBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  addBtn.addEventListener('click', async () => {
    const { openDevDocs } = await import('./dev-docs.js');
    openDevDocs('tab-sdk');
  });
  tabBarEl.insertBefore(addBtn, closeBtn);

  // Listen for tab changes to fire lifecycle hooks
  on('rightPanel:tabChanged', onTabActivated);
  on('rightPanel:opened', onTabActivated);
}

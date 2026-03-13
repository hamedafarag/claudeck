// Plugin Loader — auto-discovers and loads tab-sdk plugins from /js/plugins/
//
// How it works:
//   1. Fetches GET /api/plugins → list of {name, js, css} entries
//   2. Stores manifest for the marketplace UI
//   3. Only loads plugins the user has enabled (persisted in localStorage)
//
// To create a new plugin, just drop files into public/js/plugins/:
//   my-plugin.js   — must call registerTab() from tab-sdk.js
//   my-plugin.css  — optional, auto-injected if present

const STORAGE_KEY = 'codedeck-enabled-plugins';
const ORDER_KEY = 'codedeck-plugin-order';
let availablePlugins = [];
const loadedPlugins = new Set();

/** Maps plugin file name → tab ID registered by that plugin */
const pluginTabIds = new Map();

/** Plugin descriptions for the marketplace. order: lower = higher in the list */
const pluginMeta = {
  'event-stream-tab': { description: 'Real-time WebSocket event viewer with filtering and search', icon: '⚡', order: 10 },
  'repos-tab':        { description: 'Git repository and group management with tree view',        icon: '📁', order: 20 },
  'tasks-tab':        { description: 'Linear issues and todo list with priority levels',           icon: '✅', order: 30 },
};
const defaultMeta = { description: 'A tab-sdk plugin', icon: '🧩', order: 100 };

export function getAvailablePlugins() {
  return availablePlugins;
}

export function getEnabledPluginNames() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function setEnabledPluginNames(names) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
}

export function getPluginMeta(name) {
  return pluginMeta[name] || defaultMeta;
}

export function getPluginOrder() {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function setPluginOrder(names) {
  localStorage.setItem(ORDER_KEY, JSON.stringify(names));
}

/** Return available plugins sorted by saved order (unsorted ones go to end by meta.order) */
export function getSortedPlugins() {
  const saved = getPluginOrder();
  const all = [...availablePlugins];
  all.sort((a, b) => {
    const ai = saved.indexOf(a.name);
    const bi = saved.indexOf(b.name);
    // Both in saved order — use saved positions
    if (ai !== -1 && bi !== -1) return ai - bi;
    // Only one in saved order — it comes first
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    // Neither saved — fall back to meta.order
    return (getPluginMeta(a.name).order ?? 100) - (getPluginMeta(b.name).order ?? 100);
  });
  return all;
}

/** Optional hook: set by tab-sdk to get current registered tab IDs */
let _getRegisteredTabIds = null;
export function setTabIdResolver(fn) { _getRegisteredTabIds = fn; }

async function loadPlugin(plugin) {
  if (loadedPlugins.has(plugin.name)) return;
  if (plugin.css) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `/${plugin.css}`;
    link.dataset.plugin = plugin.name;
    document.head.appendChild(link);
  }

  const before = _getRegisteredTabIds ? new Set(_getRegisteredTabIds()) : null;

  try {
    await import(`/${plugin.js}`);
    loadedPlugins.add(plugin.name);
    console.log(`Plugin loaded: ${plugin.name}`);

    // Auto-detect which tab ID this plugin registered
    if (before && _getRegisteredTabIds) {
      for (const id of _getRegisteredTabIds()) {
        if (!before.has(id)) {
          pluginTabIds.set(plugin.name, id);
        }
      }
    }
  } catch (err) {
    console.error(`Plugin failed: ${plugin.name}`, err);
  }
}

export async function loadPluginByName(name) {
  const plugin = availablePlugins.find(p => p.name === name);
  if (plugin) await loadPlugin(plugin);
}

export function isPluginLoaded(name) {
  return loadedPlugins.has(name);
}

/** Record which tab ID a plugin registered (called from tab-sdk) */
export function trackPluginTab(pluginName, tabId) {
  pluginTabIds.set(pluginName, tabId);
}

/** Get the tab ID registered by a plugin */
export function getPluginTabId(pluginName) {
  return pluginTabIds.get(pluginName);
}

/** Get all plugin-name → tab-id mappings */
export function getPluginTabMap() {
  return pluginTabIds;
}

export async function loadPlugins() {
  try {
    const res = await fetch('/api/plugins');
    if (!res.ok) { console.warn('Plugin discovery failed:', res.status); return; }

    availablePlugins = await res.json();
    if (!availablePlugins.length) return;

    // Only load enabled plugins
    const enabled = getEnabledPluginNames();
    const toLoad = availablePlugins.filter(p => enabled.includes(p.name));
    await Promise.all(toLoad.map(loadPlugin));
  } catch (err) {
    console.error('Plugin loader error:', err);
  }
}

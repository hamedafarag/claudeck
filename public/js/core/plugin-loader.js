// Plugin Loader — auto-discovers and loads tab-sdk plugins
//
// How it works:
//   1. Fetches GET /api/plugins → list of {name, js, css, source, apiBase} entries
//   2. Stores manifest for the marketplace UI
//   3. Only loads plugins the user has enabled (persisted in localStorage)
//
// Plugin sources (checked in order, first match wins):
//   1. Built-in plugins in plugins/<name>/ (client.js, client.css, server.js, config.json)
//   2. User plugins in ~/.claudeck/plugins/<name>/ (same directory structure)

const STORAGE_KEY = 'claudeck-enabled-plugins';
const ORDER_KEY = 'claudeck-plugin-order';
let availablePlugins = [];
let marketplaceRegistry = null;
const loadedPlugins = new Set();

/** Maps plugin file name → tab ID registered by that plugin */
const pluginTabIds = new Map();

/** Fallback meta for plugins without manifest.json */
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
  const plugin = availablePlugins.find(p => p.name === name);
  if (plugin?.manifest) {
    return {
      description: plugin.manifest.description || defaultMeta.description,
      icon: plugin.manifest.icon || defaultMeta.icon,
      order: defaultMeta.order,
    };
  }
  return defaultMeta;
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

// ── Marketplace ─────────────────────────────────────────

export function getMarketplaceRegistry() {
  return marketplaceRegistry;
}

/** Fetch the community plugin registry from the server (which proxies GitHub) */
export async function fetchMarketplace(refresh = false) {
  try {
    const url = refresh ? '/api/marketplace?refresh=true' : '/api/marketplace';
    const res = await fetch(url);
    if (!res.ok) { console.warn('Marketplace fetch failed:', res.status); return null; }
    marketplaceRegistry = await res.json();
    return marketplaceRegistry;
  } catch (err) {
    console.error('Marketplace error:', err);
    return null;
  }
}

/** Install a community plugin and auto-enable it */
export async function installMarketplacePlugin(plugin) {
  const res = await fetch('/api/marketplace/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: plugin.id, repo: plugin.repo, source: plugin.source }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Install failed' }));
    throw new Error(err.error);
  }
  const result = await res.json();

  // Refresh local plugins list to include the newly installed plugin
  const pluginsRes = await fetch('/api/plugins');
  if (pluginsRes.ok) {
    availablePlugins = await pluginsRes.json();
  }

  // Auto-enable the newly installed plugin
  const enabled = getEnabledPluginNames();
  if (!enabled.includes(plugin.id)) {
    enabled.push(plugin.id);
    setEnabledPluginNames(enabled);
  }

  // Load the plugin immediately
  await loadPluginByName(plugin.id);

  return result;
}

/** Uninstall a community plugin */
export async function uninstallMarketplacePlugin(id) {
  const res = await fetch('/api/marketplace/uninstall', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Uninstall failed' }));
    throw new Error(err.error);
  }

  // Remove from enabled list
  const enabled = getEnabledPluginNames().filter(n => n !== id);
  setEnabledPluginNames(enabled);

  // Clean up CSS link from DOM
  const cssLink = document.head.querySelector(`link[data-plugin="${id}"]`);
  if (cssLink) cssLink.remove();

  // Clear loaded/tab tracking state
  loadedPlugins.delete(id);
  pluginTabIds.delete(id);

  // Refresh local plugins list
  const pluginsRes = await fetch('/api/plugins');
  if (pluginsRes.ok) {
    availablePlugins = await pluginsRes.json();
  }

  return await res.json();
}

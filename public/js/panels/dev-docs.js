// Developer Documentation — extensible docs modal
// To add a new section, push to the `sections` array below.

// ── Section registry ────────────────────────────────────
// Each section: { id, title, icon (SVG string), render() → HTML string }
// render() is called once when the section is first viewed.

const sections = [];

/** Register a documentation section. Call before init or at module load time. */
export function registerDocSection(section) {
  if (!section.id || !section.title || !section.render) {
    throw new Error('registerDocSection requires id, title, and render');
  }
  sections.push(section);
}

// ── Built-in: Tab SDK Guide ─────────────────────────────

registerDocSection({
  id: 'tab-sdk',
  title: 'Tab SDK',
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
  render: () => `
    <h2>Tab SDK — Plugin Guide</h2>
    <p>Register custom tabs in the right panel with a single function call.
    No HTML or <code>dom.js</code> changes needed — the SDK handles DOM creation,
    lifecycle hooks, badges, state management, and marketplace integration.</p>

    <h3>Quick Start</h3>
    <pre><code>// ~/.claudeck/plugins/my-tab/client.js  (user plugin)
// — or plugins/my-tab/client.js         (built-in plugin)
import { registerTab } from '/js/ui/tab-sdk.js';

registerTab({
  id: 'my-tab',
  title: 'My Tab',
  icon: '&lt;svg&gt;...&lt;/svg&gt;',   // optional, 12×12 recommended
  lazy: true,                // defer init until first open

  init(ctx) {
    const root = document.createElement('div');
    root.textContent = 'Hello from my tab!';

    // Listen for live WebSocket messages
    ctx.on('ws:message', (msg) =&gt; { /* ... */ });

    // React to session switch
    ctx.onState('sessionId', (id) =&gt; { /* reload */ });

    // Show a badge count on the tab button
    ctx.showBadge(5);

    return root;   // must return an HTMLElement
  },

  onActivate()   { /* tab became visible */ },
  onDeactivate() { /* tab was hidden */ },
  onDestroy()    { /* cleanup */ },
});

// Auto-discovered — no main.js changes needed!</code></pre>

    <h3>registerTab(config)</h3>
    <table class="param-table">
      <thead><tr><th>Param</th><th>Type</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td>id</td><td>string</td><td><span class="tag tag-required">required</span> Unique tab identifier (used as <code>data-tab</code>)</td></tr>
        <tr><td>title</td><td>string</td><td><span class="tag tag-required">required</span> Button label text</td></tr>
        <tr><td>icon</td><td>string</td><td><span class="tag tag-optional">optional</span> SVG/HTML icon shown before title</td></tr>
        <tr><td>position</td><td>number</td><td><span class="tag tag-optional">optional</span> 0-based insert index. Omit to append at end</td></tr>
        <tr><td>shortcut</td><td>string</td><td><span class="tag tag-optional">optional</span> Informational shortcut label</td></tr>
        <tr><td>lazy</td><td>boolean</td><td><span class="tag tag-optional">optional</span> Default <code>false</code>. If true, <code>init()</code> is deferred until first open</td></tr>
        <tr><td>init(ctx)</td><td>function</td><td><span class="tag tag-required">required</span> Receives context object, must return an <code>HTMLElement</code></td></tr>
        <tr><td>onActivate</td><td>function</td><td><span class="tag tag-optional">optional</span> Called each time the tab becomes visible</td></tr>
        <tr><td>onDeactivate</td><td>function</td><td><span class="tag tag-optional">optional</span> Called each time the tab is hidden</td></tr>
        <tr><td>onDestroy</td><td>function</td><td><span class="tag tag-optional">optional</span> Called when the tab is unregistered</td></tr>
      </tbody>
    </table>

    <h3>Context Object (ctx)</h3>
    <p>Passed to <code>init(ctx)</code>. Provides scoped access to the app's event bus, state, and API.</p>
    <table class="param-table">
      <thead><tr><th>Method</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td>ctx.on(event, fn)</td><td>Subscribe to the app event bus</td></tr>
        <tr><td>ctx.emit(event, data)</td><td>Publish to the app event bus</td></tr>
        <tr><td>ctx.getState(key)</td><td>Read from the reactive store</td></tr>
        <tr><td>ctx.onState(key, fn)</td><td>Subscribe to store key changes</td></tr>
        <tr><td>ctx.api</td><td>The full API module (all fetch helpers)</td></tr>
        <tr><td>ctx.getProjectPath()</td><td>Current project path</td></tr>
        <tr><td>ctx.getSessionId()</td><td>Current session ID</td></tr>
        <tr><td>ctx.showBadge(count)</td><td>Show a number badge on the tab button</td></tr>
        <tr><td>ctx.clearBadge()</td><td>Hide the badge</td></tr>
        <tr><td>ctx.setTitle(text)</td><td>Update the tab button label at runtime</td></tr>
      </tbody>
    </table>

    <h3>Other Exports</h3>
    <table class="param-table">
      <thead><tr><th>Function</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td>unregisterTab(id)</td><td>Remove a tab and call its <code>onDestroy</code></td></tr>
        <tr><td>getRegisteredTabs()</td><td>Returns array of registered tab IDs</td></tr>
      </tbody>
    </table>

    <h3>Lifecycle</h3>
    <pre><code>registerTab() → mountTab() → [lazy? wait for click] → init(ctx)
                                                         ↓
                                              onActivate / onDeactivate
                                                         ↓
                                              unregisterTab() → onDestroy</code></pre>

    <h3>Important: Tab Content is NOT Destroyed on Switch</h3>
    <div class="callout">Switching tabs only toggles <code>display:none</code> via CSS. The DOM stays alive, timers keep running, and animations continue in the background.</div>
    <p>If your tab runs expensive work (canvas rendering, intervals, WebSocket listeners), you <strong>must</strong> pause it when the tab is hidden. Use the event bus to listen for tab switches:</p>
    <pre><code>init(ctx) {
  let running = false;

  function start() { if (!running) { running = true; loop(); } }
  function stop()  { running = false; }

  function loop() {
    // ... your render logic ...
    if (running) requestAnimationFrame(loop);
  }

  // Pause/resume on tab switch
  ctx.on('rightPanel:tabChanged', (tabId) =&gt; {
    if (tabId === 'my-tab') start();
    else stop();
  });

  start();
  return root;
}</code></pre>
    <p>This pattern ensures zero CPU/GPU usage when your tab isn't visible.</p>

    <h3>Tips</h3>
    <ul>
      <li>Use <code>lazy: true</code> for heavy tabs — init runs only on first open</li>
      <li>Build all DOM in <code>init()</code>; no <code>index.html</code> edits needed</li>
      <li>Use <code>ctx.on('ws:message', fn)</code> for real-time streaming events</li>
      <li>Use <code>ctx.onState('sessionId', fn)</code> to reload on session switch</li>
      <li>Pause expensive work (canvas, timers) on <code>rightPanel:tabChanged</code> — tabs are hidden, not destroyed</li>
      <li>Existing shortcuts (e.g. <code>openRightPanel('my-tab')</code>) work automatically</li>
    </ul>

    <div class="callout">See <code>plugins/event-stream/client.js</code> for a complete working example of a plugin tab.</div>
  `,
});

// ── Built-in: Architecture Overview ─────────────────────

registerDocSection({
  id: 'architecture',
  title: 'Architecture',
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  render: () => `
    <h2>Architecture Overview</h2>
    <p>Claudeck is a vanilla ES module frontend with no bundler. All modules are loaded via <code>&lt;script type="module"&gt;</code> from <code>main.js</code>. Server port is configurable (default 9009).</p>

    <h3>Module Loading Order</h3>
    <pre><code>main.js
  ├── core/
  │   ├── store.js          → Reactive state store (getState/setState/on)
  │   ├── dom.js            → Centralized DOM references ($)
  │   ├── constants.js      → Shared constants
  │   ├── events.js         → Event bus (on/emit)
  │   ├── utils.js          → Shared utilities
  │   ├── api.js            → All fetch() helpers
  │   └── ws.js             → WebSocket connection manager
  ├── ui/
  │   ├── formatting.js     → Markdown rendering, code highlighting
  │   ├── diff.js           → Code diff viewer
  │   ├── commands.js       → Slash command registry
  │   ├── messages.js       → Chat message rendering
  │   ├── parallel.js       → 2×2 parallel chat mode
  │   ├── notifications.js  → Push notifications + sound
  │   ├── permissions.js    → Tool approval modes
  │   ├── model-selector.js → Model picker (Opus/Sonnet/Haiku)
  │   ├── right-panel.js    → Right panel + Tab SDK init
  │   ├── context-gauge.js  → Token usage indicator
  │   └── shortcuts.js      → Keyboard shortcuts
  ├── features/
  │   ├── sessions.js       → Session management + search
  │   ├── projects.js       → Project picker + system prompts
  │   ├── chat.js           → Main chat loop
  │   ├── prompts.js        → Prompt templates
  │   ├── workflows.js      → Multi-step workflows
  │   ├── agents.js         → Agent definitions, chains, DAGs
  │   ├── home.js           → Home screen + activity grid
  │   ├── attachments.js    → File/image attachments
  │   ├── voice-input.js    → Web Speech API input
  │   ├── telegram.js       → Telegram integration
  │   └── welcome.js        → Guided tour (Driver.js)
  ├── panels/
  │   ├── file-explorer.js  → File tree + preview
  │   ├── git-panel.js      → Git status, staging, commit
  │   ├── mcp-manager.js    → MCP server management
  │   ├── tips-feed.js      → Tips &amp; shortcuts feed
  │   ├── assistant-bot.js  → Whaly bot assistant
  │   └── dev-docs.js       → This documentation modal
  └── plugin-loader.js      → Auto-discovers &amp; loads plugins</code></pre>

    <h3>Key Patterns</h3>
    <ul>
      <li><strong>Event Bus</strong> — <code>events.js</code> provides <code>on(event, fn)</code> and <code>emit(event, data)</code>. All cross-module communication uses this.</li>
      <li><strong>Reactive Store</strong> — <code>store.js</code> provides <code>getState(key)</code>, <code>setState(key, val)</code>, and <code>on(key, fn)</code> for reactive subscriptions.</li>
      <li><strong>DOM Registry</strong> — <code>dom.js</code> exports <code>$</code> object with cached element references. Only used for built-in (HTML-defined) elements.</li>
      <li><strong>API Layer</strong> — <code>api.js</code> contains all <code>fetch()</code> calls for server communication.</li>
      <li><strong>Plugin System</strong> — Plugins are auto-discovered from <code>plugins/</code> (built-in) and <code>~/.claudeck/plugins/</code> (user). Managed via the Marketplace (<code>+</code> button in tab bar).</li>
    </ul>

    <h3>Event Bus Events</h3>
    <table class="param-table">
      <thead><tr><th>Event</th><th>Payload</th></tr></thead>
      <tbody>
        <tr><td>ws:message</td><td>Parsed WebSocket message object</td></tr>
        <tr><td>ws:connected</td><td><em>none</em> — initial connection established</td></tr>
        <tr><td>ws:reconnected</td><td><em>none</em> — reconnected after disconnect</td></tr>
        <tr><td>ws:disconnected</td><td><em>none</em> — connection lost</td></tr>
        <tr><td>rightPanel:opened</td><td>Active tab name (string)</td></tr>
        <tr><td>rightPanel:tabChanged</td><td>New tab name (string)</td></tr>
      </tbody>
    </table>

    <h3>Store Keys</h3>
    <table class="param-table">
      <thead><tr><th>Key</th><th>Type</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td>view</td><td>string</td><td>Current view: <code>"home"</code> or <code>"chat"</code></td></tr>
        <tr><td>sessionId</td><td>string|null</td><td>Current active session ID</td></tr>
        <tr><td>parallelMode</td><td>boolean</td><td>Whether 2×2 parallel mode is active</td></tr>
        <tr><td>streamingCharCount</td><td>number</td><td>Character count during streaming</td></tr>
        <tr><td>notificationsEnabled</td><td>boolean</td><td>Whether push notifications are on</td></tr>
        <tr><td>sessionTokens</td><td>object</td><td><code>{ input, output, cacheRead, cacheCreation }</code></td></tr>
        <tr><td>prompts</td><td>array</td><td>Loaded prompt templates</td></tr>
        <tr><td>workflows</td><td>array</td><td>Loaded workflow definitions</td></tr>
        <tr><td>agents</td><td>array</td><td>Loaded agent definitions</td></tr>
        <tr><td>projectsData</td><td>array</td><td>Configured projects list</td></tr>
        <tr><td>attachedFiles</td><td>array</td><td>Files attached to current message</td></tr>
        <tr><td>imageAttachments</td><td>array</td><td>Images attached to current message</td></tr>
        <tr><td>backgroundSessions</td><td>Map</td><td>Sessions running in background</td></tr>
      </tbody>
    </table>

    <div class="callout">All modules are independent — import only what you need. No global state beyond the event bus and store. Plugins get access to both via the <code>ctx</code> object in <code>init()</code>.</div>
  `,
});

// ── Built-in: Adding Features ───────────────────────────

registerDocSection({
  id: 'adding-features',
  title: 'Contributing',
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  render: () => `
    <h2>Contributing to Claudeck</h2>
    <p>This guide is for contributors who have <strong>forked or cloned the Claudeck repo</strong> and want to extend the core application. If you're using Claudeck via <code>npx claudeck</code> and want to create your own plugins, see the <strong>User Plugins</strong> section instead.</p>

    <h3>Adding a Built-in Plugin</h3>
    <ol>
      <li>Create a directory: <code>plugins/my-feature/</code> in the repo</li>
      <li>Create <code>plugins/my-feature/client.js</code> — import <code>registerTab()</code> from <code>/js/ui/tab-sdk.js</code></li>
      <li>Build all DOM inside <code>init(ctx)</code></li>
      <li>Optionally add <code>client.css</code> in the same directory (auto-injected)</li>
      <li>Optionally add <code>server.js</code> for API routes (auto-mounted at <code>/api/plugins/my-feature/</code>)</li>
    </ol>

    <h3>Adding a New API Endpoint</h3>
    <ol>
      <li>Add the route in <code>server/routes/</code> (create a new file or extend existing)</li>
      <li>Register it in <code>server.js</code></li>
      <li>Add the fetch helper in <code>public/js/core/api.js</code></li>
      <li>Use it from your module</li>
    </ol>

    <h3>Adding a Database Table</h3>
    <ol>
      <li>Add <code>CREATE TABLE IF NOT EXISTS</code> in <code>db.js</code></li>
      <li>For migrations on existing tables, use <code>try/catch</code> with <code>ALTER TABLE</code></li>
      <li>Add prepared statements and export helper functions</li>
    </ol>

    <h3>Adding a CSS Module</h3>
    <ol>
      <li>Create <code>public/css/my-feature.css</code></li>
      <li>Add <code>@import url("css/my-feature.css");</code> in <code>style.css</code></li>
      <li>Use CSS variables from <code>variables.css</code> for consistency</li>
    </ol>

    <h3>Built-in Plugin Structure</h3>
    <ul>
      <li>Plugin directories: <code>plugins/kebab-case/</code></li>
      <li>Client module: <code>client.js</code> (required)</li>
      <li>Client styles: <code>client.css</code> (optional)</li>
      <li>Server routes: <code>server.js</code> (optional, auto-mounted)</li>
      <li>Default config: <code>config.json</code> (optional, copied to <code>~/.claudeck/config/</code>)</li>
      <li>Import paths: use absolute paths (e.g. <code>/js/ui/tab-sdk.js</code>)</li>
    </ul>

    <div class="callout">When in doubt, look at <code>plugins/event-stream/</code>, <code>plugins/repos/</code>, or <code>plugins/tasks/</code> as reference implementations. For full-stack with server routes, see <code>plugins/linear/</code>.</div>
  `,
});

// ── Built-in: User Plugins Guide ────────────────────────

registerDocSection({
  id: 'user-plugins',
  title: 'User Plugins',
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 18l6-6-6-6"/><path d="M8 6l-6 6 6 6"/></svg>',
  render: () => `
    <h2>User Plugins</h2>
    <p>This guide is for developers using Claudeck via <code>npx claudeck</code> who want to create their own plugins. User plugins live in <code>~/.claudeck/plugins/</code>, persist across npm upgrades, and work identically to built-in plugins — no need to fork the repo.</p>

    <h3>Creating a User Plugin</h3>
    <ol>
      <li>Create a directory in <code>~/.claudeck/plugins/</code>:
        <pre><code>mkdir -p ~/.claudeck/plugins/my-plugin</code></pre>
      </li>
      <li>Create <code>client.js</code> with a <code>registerTab()</code> call:
        <pre><code>// ~/.claudeck/plugins/my-plugin/client.js
import { registerTab } from '/js/ui/tab-sdk.js';

registerTab({
  id: 'my-plugin',
  title: 'My Plugin',
  lazy: true,
  init(ctx) {
    const root = document.createElement('div');
    root.innerHTML = '&lt;h3&gt;Hello from my plugin!&lt;/h3&gt;';
    return root;
  },
});</code></pre>
      </li>
      <li>Optionally add <code>client.css</code> for styles (auto-injected)</li>
      <li>Optionally add <code>server.js</code> for backend routes (requires <code>CLAUDECK_USER_SERVER_PLUGINS=true</code> in <code>~/.claudeck/.env</code>)</li>
      <li>Optionally add <code>config.json</code> for default settings (auto-copied to <code>~/.claudeck/config/</code>)</li>
    </ol>

    <h3>Plugin Directories</h3>
    <table class="param-table">
      <thead><tr><th>Directory</th><th>URL Path</th><th>Writable</th></tr></thead>
      <tbody>
        <tr><td><code>&lt;package&gt;/plugins/</code></td><td><code>/plugins/</code></td><td>No (built-in)</td></tr>
        <tr><td><code>~/.claudeck/plugins/</code></td><td><code>/user-plugins/</code></td><td>Yes (user)</td></tr>
      </tbody>
    </table>

    <h3>Server-Side Routes</h3>
    <p>If your plugin has a <code>server.js</code>, it exports an Express router that is auto-mounted at <code>/api/plugins/&lt;name&gt;/</code>:</p>
    <pre><code>// ~/.claudeck/plugins/my-plugin/server.js
import { Router } from 'express';
const router = Router();

router.get('/data', (req, res) =&gt; {
  res.json({ message: 'Hello from server!' });
});

export default router;</code></pre>
    <div class="callout"><strong>Security:</strong> User server plugins are disabled by default. Set <code>CLAUDECK_USER_SERVER_PLUGINS=true</code> in <code>~/.claudeck/.env</code> to enable them.</div>

    <h3>Discovery</h3>
    <p>Plugins are auto-discovered on page load. No server restart is needed for client-only plugins. The Marketplace tab shows all plugins with their source (<code>builtin</code> or <code>user</code>).</p>

    <h3>Scaffolding Plugins with Claude Code</h3>
    <p>Install the Claudeck plugin creator skill, then let Claude Code scaffold plugins for you:</p>
    <pre><code>npx skills add https://github.com/hamedafarag/claudeck-skills</code></pre>
    <p>Then in Claude Code, run:</p>
    <pre><code>/claudeck-plugin-create my-plugin A tab that shows GitHub notifications</code></pre>
    <p>Claude will generate the full plugin files in <code>~/.claudeck/plugins/</code> based on your description. Examples:</p>
    <ul>
      <li><code>/claudeck-plugin-create github-notifs Show my GitHub notifications</code></li>
      <li><code>/claudeck-plugin-create sys-metrics A dashboard showing system metrics</code></li>
      <li><code>/claudeck-plugin-create api-proxy A plugin with a server route that proxies an external API</code></li>
    </ul>
  `,
});

// ── Built-in: Links & Resources ─────────────────────────

registerDocSection({
  id: 'resources',
  title: 'Resources',
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  render: () => `
    <h2>Resources &amp; Links</h2>

    <h3>GitHub</h3>
    <ul>
      <li><a href="https://github.com/hamedafarag/claudeck" target="_blank" style="color:var(--accent)">github.com/hamedafarag/claudeck</a> — Source code, issues, and discussions</li>
      <li><a href="https://github.com/hamedafarag/claudeck/issues" target="_blank" style="color:var(--accent)">Issues</a> — Report bugs or request features</li>
      <li><a href="https://github.com/hamedafarag/claudeck/blob/main/docs/DOCUMENTATION.md" target="_blank" style="color:var(--accent)">Full Documentation</a> — Complete feature docs and API reference</li>
      <li><a href="https://github.com/hamedafarag/claudeck/blob/main/docs/CONFIGURATION.md" target="_blank" style="color:var(--accent)">Configuration Guide</a> — User data directory, config files, plugin system</li>
    </ul>

    <h3>npm</h3>
    <ul>
      <li><a href="https://www.npmjs.com/package/claudeck" target="_blank" style="color:var(--accent)">npmjs.com/package/claudeck</a> — Package page</li>
    </ul>

    <h3>Claude Code Skills</h3>
    <ul>
      <li><a href="https://github.com/hamedafarag/claudeck-skills" target="_blank" style="color:var(--accent)">github.com/hamedafarag/claudeck-skills</a> — Plugin creator skill for Claude Code</li>
    </ul>
    <pre><code>npx skills add https://github.com/hamedafarag/claudeck-skills</code></pre>

    <h3>Quick Reference</h3>
    <table class="param-table">
      <thead><tr><th>Command</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td><code>npx claudeck</code></td><td>Launch Claudeck (installs if needed)</td></tr>
        <tr><td><code>npx claudeck --port 3000</code></td><td>Launch on a custom port</td></tr>
        <tr><td><code>npm i -g claudeck</code></td><td>Install globally</td></tr>
      </tbody>
    </table>

    <h3>License</h3>
    <p>Claudeck is open-source under the <strong>MIT License</strong>. Contributions are welcome!</p>
  `,
});

// ── Modal renderer ──────────────────────────────────────

let overlayEl = null;
let activeSection = null;
const renderedCache = {};

function buildNav() {
  return sections.map(s => `
    <button class="dev-docs-nav-item${s.id === activeSection ? ' active' : ''}" data-section="${s.id}">
      ${s.icon || ''}
      <span>${s.title}</span>
    </button>
  `).join('');
}

function showSection(id) {
  activeSection = id;
  if (!overlayEl) return;

  // Update nav
  overlayEl.querySelectorAll('.dev-docs-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === id);
  });

  // Update content
  const contentEl = overlayEl.querySelector('.dev-docs-content');
  const section = sections.find(s => s.id === id);
  if (!section) return;

  // Cache rendered HTML
  if (!renderedCache[id]) {
    renderedCache[id] = section.render();
  }

  // Hide all, show target
  contentEl.querySelectorAll('.dev-docs-section').forEach(el => {
    el.classList.toggle('active', el.dataset.section === id);
  });

  // Update header title
  const titleEl = overlayEl.querySelector('.dev-docs-title');
  if (titleEl) titleEl.textContent = section.title;
}

export function openDevDocs(sectionId) {
  if (overlayEl) {
    if (sectionId) showSection(sectionId);
    return;
  }

  activeSection = sectionId || sections[0]?.id || 'tab-sdk';

  overlayEl = document.createElement('div');
  overlayEl.className = 'dev-docs-overlay';

  const currentSection = sections.find(s => s.id === activeSection);

  overlayEl.innerHTML = `
    <div class="dev-docs-modal">
      <nav class="dev-docs-nav">
        <div class="dev-docs-nav-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
          <span>Dev Docs</span>
        </div>
        ${buildNav()}
      </nav>
      <div class="dev-docs-body">
        <div class="dev-docs-header">
          <span class="dev-docs-title">${currentSection?.title || 'Documentation'}</span>
          <button class="dev-docs-close" title="Close (Esc)">&times;</button>
        </div>
        <div class="dev-docs-content">
          ${sections.map(s => {
            if (!renderedCache[s.id]) renderedCache[s.id] = s.render();
            return `<div class="dev-docs-section${s.id === activeSection ? ' active' : ''}" data-section="${s.id}">${renderedCache[s.id]}</div>`;
          }).join('')}
        </div>
      </div>
    </div>
  `;

  // ── Event bindings ──
  // Close
  overlayEl.querySelector('.dev-docs-close').addEventListener('click', closeDevDocs);
  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) closeDevDocs();
  });

  // Nav clicks
  overlayEl.querySelectorAll('.dev-docs-nav-item').forEach(btn => {
    btn.addEventListener('click', () => showSection(btn.dataset.section));
  });

  // Esc key
  overlayEl._onKey = (e) => {
    if (e.key === 'Escape') closeDevDocs();
  };
  document.addEventListener('keydown', overlayEl._onKey);

  document.body.appendChild(overlayEl);
}

export function closeDevDocs() {
  if (!overlayEl) return;
  document.removeEventListener('keydown', overlayEl._onKey);
  overlayEl.remove();
  overlayEl = null;
}

// ── Init: wire up the header button ─────────────────────
function init() {
  const btn = document.getElementById('dev-docs-btn');
  if (btn) {
    btn.addEventListener('click', () => openDevDocs());
  }
}

init();

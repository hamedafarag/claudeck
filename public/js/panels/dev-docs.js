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
    lifecycle hooks, badges, and state management.</p>

    <h3>Quick Start</h3>
    <pre><code>// plugins/my-tab/client.js
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
    <p>Claudeck is a vanilla ES module frontend with no bundler. All modules are loaded via <code>&lt;script type="module"&gt;</code> from <code>main.js</code>.</p>

    <h3>Module Loading Order</h3>
    <pre><code>main.js
  ├── store.js        → Reactive state store
  ├── dom.js          → Centralized DOM references
  ├── constants.js    → Shared constants
  ├── events.js       → Event bus (on/emit/off)
  ├── utils.js        → Shared utilities
  ├── ...             → Feature modules
  ├── right-panel.js  → Right panel + Tab SDK init
  ├── plugin-loader.js → Loads enabled plugins from plugins/
  └── ...</code></pre>

    <h3>Key Patterns</h3>
    <ul>
      <li><strong>Event Bus</strong> — <code>events.js</code> provides <code>on(event, fn)</code>, <code>emit(event, data)</code>, <code>off(event, fn)</code>. All cross-module communication uses this.</li>
      <li><strong>Reactive Store</strong> — <code>store.js</code> provides <code>getState(key)</code>, <code>setState(key, val)</code>, and <code>on(key, fn)</code> for reactive subscriptions.</li>
      <li><strong>DOM Registry</strong> — <code>dom.js</code> exports <code>$</code> object with cached element references. Only used for built-in (HTML-defined) elements.</li>
      <li><strong>API Layer</strong> — <code>api.js</code> contains all <code>fetch()</code> calls. Server runs on port 9009.</li>
    </ul>

    <h3>Common Events</h3>
    <table class="param-table">
      <thead><tr><th>Event</th><th>Payload</th></tr></thead>
      <tbody>
        <tr><td>ws:message</td><td>Parsed WebSocket message object</td></tr>
        <tr><td>session:changed</td><td>New session ID</td></tr>
        <tr><td>rightPanel:opened</td><td>Active tab name</td></tr>
        <tr><td>rightPanel:tabChanged</td><td>New tab name</td></tr>
      </tbody>
    </table>

    <h3>Store Keys</h3>
    <table class="param-table">
      <thead><tr><th>Key</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td>sessionId</td><td>Current active session ID</td></tr>
        <tr><td>projectPath</td><td>Current project path</td></tr>
        <tr><td>isStreaming</td><td>Whether AI is currently responding</td></tr>
      </tbody>
    </table>

    <div class="callout">All modules are independent — import only what you need. No global state beyond the event bus and store.</div>
  `,
});

// ── Built-in: Adding Features ───────────────────────────

registerDocSection({
  id: 'adding-features',
  title: 'Adding Features',
  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  render: () => `
    <h2>Adding New Features</h2>
    <p>Follow these patterns when extending the application.</p>

    <h3>Adding a New Plugin Tab</h3>
    <ol>
      <li>Create a directory: <code>plugins/my-feature/</code></li>
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

    <h3>Plugin Structure</h3>
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

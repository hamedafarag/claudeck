# Tab SDK Reference

The Tab SDK lets you register custom tabs in Claudeck's right panel. A single `registerTab()` call handles DOM creation, lifecycle, badges, and state management.

## Quick Start

```javascript
import { registerTab } from '/js/ui/tab-sdk.js';

registerTab({
  id: 'my-plugin',
  title: 'My Plugin',
  icon: '🔌',
  lazy: true,

  init(ctx) {
    const root = document.createElement('div');
    root.className = 'my-plugin';
    root.innerHTML = `<h2>Hello from my plugin!</h2>`;

    ctx.on('projectChanged', () => loadData(ctx));
    loadData(ctx);

    return root;
  },

  onActivate(ctx) { /* tab became visible */ },
  onDeactivate(ctx) { /* tab was hidden */ },
  onDestroy(ctx) { /* plugin disabled/removed */ },
});

async function loadData(ctx) {
  const project = ctx.getProjectPath();
  if (!project) return;
  // fetch and render...
}
```

---

## registerTab(config)

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Unique tab identifier (used as `data-tab` attribute) |
| `title` | string | No | Tab button label. Defaults to formatted `id`. |
| `icon` | string | No | SVG/HTML or emoji shown on the tab button |
| `position` | number | No | Insert position (0-based). Omit to append at end. |
| `shortcut` | string | No | Keyboard shortcut description (informational) |
| `lazy` | boolean | No | If `true`, `init()` is deferred until the tab is first opened. **Recommended.** |
| `init(ctx)` | function | Yes | Build your UI. Receives the [context object](#context-object-ctx). **Must return an HTMLElement.** |
| `onActivate(ctx)` | function | No | Called each time the tab becomes visible. Receives `ctx`. |
| `onDeactivate(ctx)` | function | No | Called when another tab becomes active. Receives `ctx`. |
| `onDestroy(ctx)` | function | No | Called when the plugin is disabled/removed. Receives `ctx`. |

### Lifecycle Flow

```
registerTab() → [tab button + pane created in DOM]
     │
     ├── lazy: false → init(ctx) runs immediately
     └── lazy: true  → init(ctx) runs on first tab click
                            │
                     ┌──────┴──────┐
                     │  Tab active  │ ←→ onActivate(ctx) / onDeactivate(ctx)
                     └──────┬──────┘
                            │
                     unregisterTab() → onDestroy(ctx) → ctx.dispose() → DOM removed
```

All event/state subscriptions registered via `ctx.on()` or `ctx.onState()` are **automatically unsubscribed** when the tab is destroyed. You can also unsubscribe manually.

---

## Context Object (ctx)

The `ctx` object is passed to `init()`, `onActivate()`, `onDeactivate()`, and `onDestroy()`.

### Identity

| Property | Type | Description |
|---|---|---|
| `ctx.pluginId` | string | Your plugin's ID (matches `config.id`) |

### Event Bus

| Method | Returns | Description |
|---|---|---|
| `ctx.on(event, fn)` | `() => void` | Subscribe to an event. Returns an unsubscribe function. |
| `ctx.off(event, fn)` | `void` | Remove a specific listener by reference. |
| `ctx.emit(event, data)` | `void` | Publish an event to the app-wide bus. |

```javascript
// Subscribe (auto-cleaned on destroy)
const unsub = ctx.on('ws:message', (msg) => { /* ... */ });

// Manual unsubscribe
unsub();

// Or by reference
ctx.off('ws:message', myHandler);
```

### Reactive Store

| Method | Returns | Description |
|---|---|---|
| `ctx.getState(key)` | `any` | Read a value from the store. |
| `ctx.onState(key, fn)` | `() => void` | Subscribe to changes on a key. Returns an unsubscribe function. |

```javascript
const sessionId = ctx.getState('sessionId');

ctx.onState('sessionId', (newId) => {
  // reload data for the new session
});
```

### Convenience

| Method | Returns | Description |
|---|---|---|
| `ctx.getProjectPath()` | `string` | Current project path. May be `''` if none selected. |
| `ctx.getSessionId()` | `string \| null` | Current session ID. |
| `ctx.getTheme()` | `string` | Current theme: `'dark'` or `'light'`. |

### API Module

| Property | Description |
|---|---|
| `ctx.api` | Full API module with 70+ fetch helpers (projects, sessions, files, stats, etc.) |

For server plugins, use `fetch()` directly to call your own routes:

```javascript
// Your server routes are auto-mounted at /api/plugins/<your-id>/
const data = await fetch('/api/plugins/my-plugin/items').then(r => r.json());
```

### Storage (Plugin-Scoped localStorage)

All keys are automatically namespaced to `claudeck-plugin-{id}-{key}`.

| Method | Description |
|---|---|
| `ctx.storage.get(key)` | Read a JSON value. Returns `null` if missing. |
| `ctx.storage.set(key, value)` | Write a JSON-serializable value. |
| `ctx.storage.remove(key)` | Delete a key. |

```javascript
// Save data
ctx.storage.set('todos', [{ id: 1, text: 'Buy milk', done: false }]);

// Load data
const todos = ctx.storage.get('todos') || [];

// Clean up
ctx.storage.remove('todos');
```

### Notifications

| Method | Description |
|---|---|
| `ctx.toast(message, opts)` | Show a temporary notification. Options: `{ duration: 3000, type: 'info' \| 'success' \| 'error' }` |

```javascript
ctx.toast('Saved!', { type: 'success' });
ctx.toast('Something went wrong', { type: 'error', duration: 5000 });
```

### Tab UI

| Method | Description |
|---|---|
| `ctx.showBadge(count)` | Show a number badge on the tab button. Pass `0` to hide. |
| `ctx.clearBadge()` | Hide the badge. |
| `ctx.setTitle(text)` | Update the tab button label at runtime. |

### Cleanup

| Method | Description |
|---|---|
| `ctx.dispose()` | Unsubscribe all event/state listeners. **Auto-called on destroy** — you rarely need this. |

---

## Available Events

Subscribe via `ctx.on(event, fn)`:

| Event | Payload | Description |
|---|---|---|
| `ws:message` | `msg` (object) | Every WebSocket message — streaming text, tool calls, results, errors, completion |
| `ws:connected` | — | WebSocket first connected |
| `ws:reconnected` | — | WebSocket reconnected after drop |
| `ws:disconnected` | — | WebSocket connection lost |
| `projectChanged` | `path` (string) | User switched to a different project |
| `rightPanel:tabChanged` | `tabId` (string) | A different tab became active |
| `rightPanel:opened` | `tabId` (string) | The right panel was opened |

### ws:message types

The `msg` object from `ws:message` has a `type` field:

| Type | Description | Key Fields |
|---|---|---|
| `session` | New session created | `msg.sessionId` |
| `text` | Streaming text chunk | `msg.text` |
| `tool` | Tool call started | `msg.name`, `msg.input` |
| `tool_result` | Tool call finished | `msg.content`, `msg.isError` |
| `result` | Query completed | `msg.text` |
| `done` | Session finished | — |
| `error` | Error occurred | `msg.error` |
| `aborted` | User aborted | — |
| `permission_request` | Tool needs approval | `msg.tool`, `msg.input` |

---

## Available State Keys

Read via `ctx.getState(key)`, subscribe via `ctx.onState(key, fn)`:

| Key | Type | Description |
|---|---|---|
| `sessionId` | `string \| null` | Currently active session ID |
| `view` | `string` | Current view: `'home'` or `'chat'` |
| `parallelMode` | `boolean` | Whether parallel mode is active |
| `projectsData` | `array` | All registered projects `[{name, path}, ...]` |
| `sessionTokens` | `object` | Token usage: `{input, output, cacheRead, cacheCreation}` |
| `prompts` | `array` | Saved prompt templates |
| `workflows` | `array` | Saved workflows |
| `agents` | `array` | Agent definitions |
| `ws` | `WebSocket \| null` | The live WebSocket instance |
| `streamingCharCount` | `number` | Characters received in current stream |
| `notificationsEnabled` | `boolean` | Whether browser notifications are on |
| `attachedFiles` | `array` | Files attached to current message |

**Timing note:** When `init()` runs, `projectsData` or `sessionId` may not be populated yet. Use `ctx.onState()` to react when data arrives:

```javascript
ctx.onState('projectsData', () => {
  const project = ctx.getProjectPath();
  if (project) loadData(project);
});
```

---

## CSS Design Tokens

Use CSS custom properties to match Claudeck's theme. Both dark and light modes are handled automatically.

### Colors

```css
/* Backgrounds */
var(--bg)              /* primary background (#050508 / #f7f7f4) */
var(--bg-secondary)    /* secondary background */
var(--bg-tertiary)     /* tertiary background */
var(--bg-elevated)     /* elevated surface */
var(--border)          /* standard border */
var(--border-subtle)   /* subtle border */

/* Text */
var(--text)            /* primary text */
var(--text-secondary)  /* secondary text */
var(--text-dim)        /* dimmed text */

/* Accents */
var(--accent)          /* green accent — primary action */
var(--accent-dim)      /* green accent background */
var(--purple)          /* purple accent */
var(--user)            /* blue accent (user messages) */
var(--cyan)            /* cyan accent */
var(--amber)           /* amber accent */

/* Semantic */
var(--success)         /* success state */
var(--warning)         /* warning state */
var(--error)           /* error state */
```

### Typography

```css
var(--font-display)    /* Chakra Petch — headings */
var(--font-sans)       /* Outfit — body text */
var(--font-mono)       /* JetBrains Mono — code */
```

### Layout & Effects

```css
var(--radius)          /* 4px */
var(--radius-md)       /* 8px */
var(--radius-lg)       /* 12px */
var(--glow)            /* subtle green glow */
var(--shadow-sm)       /* small shadow */
var(--shadow-md)       /* medium shadow */
var(--ease-smooth)     /* smooth easing curve */
```

### CSS Scoping

**Always prefix** your CSS classes with your plugin ID:

```css
/* Good */
.my-plugin-header { ... }
.my-plugin-list { ... }

/* Bad — will break Claudeck UI */
.header { ... }
div { ... }
* { ... }
```

### Common Pattern

```css
.my-plugin {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  font-family: var(--font-sans);
  color: var(--text);
}

.my-plugin-list {
  flex: 1;
  overflow-y: auto;
}

.my-plugin-btn {
  padding: 6px 16px;
  border-radius: var(--radius-md);
  background: var(--accent);
  color: #fff;
  border: none;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 12px;
}

.my-plugin-btn:hover {
  filter: brightness(1.1);
}
```

---

## Plugin File Structure

### Client-only (simplest)

```
my-plugin/
  manifest.json    # required
  client.js        # required — must call registerTab()
  client.css       # optional — auto-injected
```

### Full-stack (with server routes)

```
my-plugin/
  manifest.json    # required
  client.js        # required
  client.css       # optional
  server.js        # Express router — auto-mounted at /api/plugins/my-plugin/
  config.json      # optional — copied to ~/.claudeck/config/ on first run
```

**Server plugins** require users to set `CLAUDECK_USER_SERVER_PLUGINS=true` in `~/.claudeck/.env`.

### manifest.json

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Short description (max 120 chars)",
  "author": "your-name",
  "icon": "🔌",
  "hasServer": false,
  "minClaudeckVersion": "1.4.1"
}
```

---

## Examples

### Project-aware plugin

```javascript
registerTab({
  id: 'my-dashboard',
  title: 'Dashboard',
  icon: '📊',
  lazy: true,

  init(ctx) {
    const root = document.createElement('div');
    root.className = 'my-dashboard';

    function loadData() {
      const project = ctx.getProjectPath();
      if (!project) {
        root.innerHTML = '<p>Select a project</p>';
        return;
      }
      ctx.api.fetchStats(project).then(stats => {
        root.innerHTML = `<h3>${stats.totalSessions} sessions</h3>`;
      });
    }

    ctx.on('projectChanged', loadData);
    ctx.onState('projectsData', () => loadData());
    loadData();

    return root;
  },
});
```

### Real-time event listener

```javascript
registerTab({
  id: 'tool-tracker',
  title: 'Tools',
  icon: '🔧',
  lazy: true,

  init(ctx) {
    const root = document.createElement('div');
    root.className = 'tool-tracker';
    let count = 0;

    ctx.on('ws:message', (msg) => {
      if (msg.type === 'tool') {
        count++;
        ctx.showBadge(count);
        const el = document.createElement('div');
        el.textContent = `${msg.name}: ${msg.input?.file_path || msg.input?.command || ''}`;
        root.appendChild(el);
      }
    });

    return root;
  },
});
```

### Plugin with localStorage persistence

```javascript
registerTab({
  id: 'notes',
  title: 'Notes',
  icon: '📝',
  lazy: true,

  init(ctx) {
    const root = document.createElement('div');
    const textarea = document.createElement('textarea');
    textarea.value = ctx.storage.get('content') || '';
    textarea.addEventListener('input', () => {
      ctx.storage.set('content', textarea.value);
    });
    root.appendChild(textarea);
    return root;
  },
});
```

---

## Other Exports

| Function | Description |
|---|---|
| `unregisterTab(id)` | Remove a tab, call `onDestroy(ctx)`, auto-dispose subscriptions, remove DOM |
| `reRegisterTab(id)` | Re-register a previously unregistered tab from stored config |
| `getRegisteredTabs()` | Returns array of all registered tab IDs |
| `initTabSDK()` | Called internally by `right-panel.js` — **do not call from plugins** |

---

## Important Rules

1. **Always return an HTMLElement** from `init()`. Returning a string, fragment, or nothing will silently produce an empty tab.
2. **Always use `ctx.getProjectPath()`** — never access `#project-select` directly.
3. **Always use `ctx.on('projectChanged', fn)`** — never add your own change listener to the project select.
4. **Prefix all CSS classes** with your plugin ID to avoid collisions.
5. **Use `lazy: true`** for any plugin that does async work in `init()`.
6. Use `fetch()` directly for your own server routes (`/api/plugins/<id>/...`).
7. Use `ctx.storage` for persistent client-side data instead of raw `localStorage`.

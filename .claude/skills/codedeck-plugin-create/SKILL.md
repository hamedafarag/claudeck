---
name: codedeck-plugin:create
description: Scaffold a new tab-sdk plugin with JS and CSS boilerplate. Just drop files in plugins/ — auto-discovered at runtime.
argument-hint: <plugin-name> <short description of what the plugin does>
---

# Create a new Tab SDK plugin

You are scaffolding a new tab-sdk plugin called "$ARGUMENTS".

Parse the arguments: the first word is the **plugin name** (kebab-case), the rest is the **description** of what the plugin should do.

## Rules

1. The plugin name MUST be kebab-case (e.g. `my-plugin`, `code-metrics`)
2. All files go in `public/js/plugins/` — NO other files need to be modified (no main.js, no style.css, no index.html)
3. The plugin is auto-discovered by the server at runtime via `GET /api/plugins`
4. Create exactly two files: `public/js/plugins/<name>.js` and `public/js/plugins/<name>.css`

## JS file template

Create `public/js/plugins/<name>.js` following this structure:

```javascript
// <Title> — Tab SDK plugin
// <Description of what the plugin does>
import { registerTab } from '../ui/tab-sdk.js';

registerTab({
  id: '<name>',
  title: '<Title>',
  icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">...</svg>',
  lazy: true,

  init(ctx) {
    // ── Build DOM ──
    const root = document.createElement('div');
    root.className = '<name>-tab';
    root.style.cssText = 'display:flex;flex-direction:column;flex:1;overflow:hidden;';

    // Build the UI innerHTML here...

    // ── Event listeners ──
    // ctx.on('ws:message', (msg) => { ... });
    // ctx.onState('sessionId', (id) => { ... });
    // ctx.api — full API module for fetch calls
    // ctx.showBadge(count) — show badge on tab button
    // ctx.getProjectPath() — current project path
    // ctx.getSessionId() — current session ID

    return root;  // must return an HTMLElement
  },

  // onActivate()   { /* tab became visible */ },
  // onDeactivate() { /* tab was hidden */ },
  // onDestroy()    { /* cleanup */ },
});
```

## CSS file template

Create `public/js/plugins/<name>.css` with styles scoped to `.<name>-tab` to avoid conflicts:

```css
/* <Title> — Tab SDK plugin styles */

.<name>-tab {
  font-family: var(--font-mono);
  color: var(--text);
}
```

Use these CSS custom properties from the app theme:
- Colors: `var(--text)`, `var(--text-secondary)`, `var(--text-dim)`, `var(--accent)`, `var(--success)`, `var(--warning)`, `var(--error)`
- Backgrounds: `var(--bg)`, `var(--bg-secondary)`, `var(--bg-tertiary)`, `var(--bg-deep)`
- Layout: `var(--border)`, `var(--radius)`, `var(--radius-lg)`, `var(--font-mono)`

## Available imports

From `../core/`:
- `store.js` — `getState(key)`, `setState(key, val)`, `onState(key, fn)`
- `events.js` — `on(event, fn)`, `emit(event, data)`
- `dom.js` — `$` (cached DOM query map)
- `constants.js` — `CHAT_IDS`, `BOT_CHAT_ID`
- `api.js` — all fetch helpers (`fetchSessions`, `fetchFileTree`, `execCommand`, etc.)
- `utils.js` — `escapeHtml()`, `getToolDetail()`, `formatBytes()`, etc.

From `../ui/`:
- `tab-sdk.js` — `registerTab()`, `unregisterTab()`, `getRegisteredTabs()`
- `commands.js` — `registerCommand()` for slash commands
- `formatting.js` — `renderMarkdown()`, `highlightCodeBlocks()`
- `parallel.js` — `getPane()`, `panes`
- `right-panel.js` — `openRightPanel()`, `toggleRightPanel()`

## What to build

Now implement the plugin based on the user's description. Build a fully functional plugin — not just a skeleton. Include:
- Complete DOM structure with proper layout
- Event handlers and interactivity
- Real-time updates via `ctx.on('ws:message', ...)` if relevant
- Session awareness via `ctx.onState('sessionId', ...)` if relevant
- Proper CSS styling matching the app's dark terminal aesthetic
- Badge counts via `ctx.showBadge()` where meaningful

## After creating the files

1. Tell the user the plugin is ready
2. Remind them to reload the browser — the plugin will be auto-discovered
3. Show the file paths that were created

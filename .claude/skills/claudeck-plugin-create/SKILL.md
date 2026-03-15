---
name: claudeck-plugin-create
description: "Scaffold a new Claudeck plugin with JS, CSS, and optional server routes. Requires Claudeck (npx claudeck) — the browser UI for Claude Code."
argument-hint: <plugin-name> <short description of what the plugin does>
tags: claudeck, plugin, tab-sdk, ui
prerequisites: "Claudeck must be installed (npx claudeck or npm i -g claudeck). See https://www.npmjs.com/package/claudeck"
---

# Create a new Claudeck Plugin

You are scaffolding a new tab-sdk plugin called "$ARGUMENTS".

Parse the arguments: the first word is the **plugin name** (kebab-case), the rest is the **description** of what the plugin should do.

## Plugin Locations

Claudeck supports two plugin directories:

| Directory | URL Path | Use When |
|-----------|----------|----------|
| `plugins/<name>/` (project) | `/plugins/<name>/` | Building a built-in plugin that ships with Claudeck |
| `~/.claudeck/plugins/<name>/` (user) | `/user-plugins/<name>/` | Creating a personal/user-installed plugin that persists across updates |

**Default: Create user plugins in `~/.claudeck/plugins/<name>/`** unless the user explicitly asks for a built-in plugin. User plugins are the recommended approach since they persist across npm upgrades and don't require modifying the Claudeck source code.

To resolve the user plugins directory, use `~/.claudeck/plugins/` (or `$CLAUDECK_HOME/plugins/` if the env var is set).

## Rules

1. The plugin name MUST be kebab-case (e.g. `my-plugin`, `code-metrics`)
2. All files go in the chosen plugin directory — NO other files need to be modified (no main.js, no style.css, no index.html)
3. The plugin is auto-discovered by the server at runtime via `GET /api/plugins`
4. Create at minimum: `client.js` and optionally `client.css`
5. If the plugin needs server-side API routes, also create `server.js` (for user plugins, requires `CLAUDECK_USER_SERVER_PLUGINS=true` in `~/.claudeck/.env`)
6. If the plugin needs persistent config, also create `config.json` (auto-copied to `~/.claudeck/config/` on first run)

## Client JS file template

Create `client.js` in the plugin directory following this structure:

```javascript
// <Title> — Tab SDK plugin
// <Description of what the plugin does>
import { registerTab } from '/js/ui/tab-sdk.js';

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

**IMPORTANT**: Use absolute import paths (e.g. `'/js/ui/tab-sdk.js'`, `'/js/core/api.js'`) since plugins are served from `/plugins/<name>/client.js` (built-in) or `/user-plugins/<name>/client.js` (user). Absolute paths work identically for both locations.

## Client CSS file template

Create `client.css` in the plugin directory with styles scoped to `.<name>-tab` to avoid conflicts:

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

## Server JS file template (optional)

Create `server.js` in the plugin directory if your plugin needs API endpoints. The router is auto-mounted at `/api/plugins/<name>/`:

```javascript
import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
  res.json({ status: "ok" });
});

export default router;
```

**Note for user plugins:** Server-side routes require `CLAUDECK_USER_SERVER_PLUGINS=true` in `~/.claudeck/.env`. This is disabled by default for security.

To use config files, import `configPath`. The import path depends on the plugin location:
- **Built-in plugins** (`plugins/<name>/`): `import { configPath } from "../../server/paths.js";`
- **User plugins** (`~/.claudeck/plugins/<name>/`): Use the server's config path directly via the route context, or read/write files using `os.homedir()`:

```javascript
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const cfgDir = process.env.CLAUDECK_HOME || join(homedir(), ".claudeck", "config");
const cfgFile = join(cfgDir, "<name>-config.json");
```

## Config JSON file template (optional)

Create `config.json` in the plugin directory with default values. It will be auto-copied to `~/.claudeck/config/` on first run:

```json
{
  "enabled": false,
  "settings": {}
}
```

## Available imports

From `/js/core/`:
- `store.js` — `getState(key)`, `setState(key, val)`, `onState(key, fn)`
- `events.js` — `on(event, fn)`, `emit(event, data)`
- `dom.js` — `$` (cached DOM query map)
- `constants.js` — `CHAT_IDS`, `BOT_CHAT_ID`
- `api.js` — all fetch helpers (`fetchSessions`, `fetchFileTree`, `execCommand`, etc.)
- `utils.js` — `escapeHtml()`, `getToolDetail()`, `formatBytes()`, etc.

From `/js/ui/`:
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
4. If it's a user plugin with `server.js`, remind them to set `CLAUDECK_USER_SERVER_PLUGINS=true` in `~/.claudeck/.env` and restart the server
5. Mention which directory was used (built-in vs user) and why

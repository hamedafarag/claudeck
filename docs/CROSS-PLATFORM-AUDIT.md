# Cross-Platform Compatibility Audit

Audit of Claudeck for Windows and Linux compatibility before NPX publishing.

**Status: ALL ISSUES RESOLVED**

NPX publishing is live — `npx claudeck` works cross-platform. Automated via GitHub Actions (`.github/workflows/publish.yml`).

---

## Fixed Issues

### 1. `process.env.HOME` → `os.homedir()` ✅

Replaced all 5 occurrences of `process.env.HOME` with `os.homedir()`.

| File | Fix |
|------|-----|
| `server/routes/exec.js` | `homedir()` |
| `server/routes/stats.js` | `homedir()` |
| `server/agent-loop.js` | `homedir()` |
| `server/ws-handler.js` (2 locations) | `homedir()` |

### 2. `startsWith("/")` → `path.isAbsolute()` ✅

`server/routes/projects.js` — browse endpoint now uses `isAbsolute()` to validate paths, accepting both Unix `/` and Windows `C:\` formats.

### 3. Hardcoded `/` path joins → `path.posix.join()` ✅

`server/routes/files.js` — relative paths sent to the frontend always use forward slashes via `posix.join()` (tree and search endpoints).

### 4. Path traversal security — normalized comparison ✅

`server/routes/files.js` — all 4 path traversal checks now use `resolve()` + `sep` for consistent comparison across `\` and `/` on Windows:
```javascript
if (!resolved.startsWith(resolve(base) + sep) && resolved !== resolve(base))
```

### 5. Claude binary lookup — multi-platform ✅

`server/routes/stats.js` — `findClaudeBinary()` now checks:
- `~/.local/bin/claude` (Linux)
- `/usr/local/bin/claude` (macOS)
- `%LOCALAPPDATA%\Programs\claude\claude.exe` (Windows)
- `~/.claude/local/claude.exe` (Windows alt)
- Falls back to PATH lookup

### 6. Frontend path splitting — cross-platform ✅

`public/js/features/projects.js` — breadcrumb and name extraction now split on both `/` and `\`:
```javascript
pathStr.split(/[/\\]/).filter(Boolean)
```

### 7. VS Code launch & shell commands — safe execution ✅

`server/routes/exec.js` — on Windows, all commands use `exec()` (with shell, resolving through cmd.exe) so PATH-resolved commands like `code` work. On Unix, simple commands use `execFile()` for safety; complex commands (pipes, redirects) use `exec()`.

### 8. Claude CLI account info — shell on Windows ✅

`server/routes/stats.js` — `execFile` for `claude auth status` now passes `shell: true` on Windows so the `claude` binary can be resolved through PATH. Without this, `execFile` bypasses the shell and PATH-resolved commands aren't found.

### 12. Claude binary resolution — Windows npm global installs ✅

Added plain `claude` (no extension) path for npm global installs on Windows. Quoted binary path in `exec` to handle spaces in Windows paths. Graceful JSON fallback when `claude auth status` returns non-JSON output. Set `FORCE_COLOR=0` to prevent ANSI codes in output. Use `exec` instead of `execFile` on Windows so `.cmd` shims resolve correctly.

### 13. Git branch display — bash-only syntax on Windows ✅

Fixed git branch command that used `2>/dev/null` (bash-only syntax) which fails on Windows. Now uses cross-platform compatible approach.

### 9. Notifications — user feedback for unsupported contexts ✅

`public/js/ui/notifications.js` — `toggleNotifications()` now shows clear alerts when:
- Notifications API is not supported in the browser
- Notifications are blocked (user previously denied)
- Running on non-HTTPS, non-localhost (browser security requirement)

### 10. Repos — cross-platform "Open in Terminal" ✅

`plugins/repos/client.js` — context menu "Open in Terminal" now detects the platform:
- macOS: `open -a Terminal .`
- Windows: `start cmd /k`
- Linux: `x-terminal-emulator || xterm`

### 11. Repos — Windows path shortening ✅

`plugins/repos/client.js` — path display now shortens both Unix (`/Users/name/...` → `~/...`) and Windows (`C:\Users\name\...` → `~/...`) home directories.

---

## Already Compatible (No Changes Needed)

| Component | Notes |
|-----------|-------|
| `db.js` | Uses `dbPath` from `server/paths.js` |
| `server/routes/mcp.js` | Uses `os.homedir()` |
| `server/paths.js` | Uses `os.homedir()`, `path.join()` |
| WebSocket setup | Platform-agnostic |
| Express server | Platform-agnostic |
| `package.json` scripts | Just `node server.js` |
| Database (better-sqlite3) | Native bindings, `npm install` handles platform detection |

# Cross-Platform Compatibility Audit

Audit of Claudeck for Windows and Linux compatibility before NPX publishing.

**Status: ALL ISSUES RESOLVED**

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

### 7. VS Code launch — safe execution ✅

`server/routes/exec.js` — simple commands (like `code .`) use `execFile()` to avoid shell interpretation issues with spaces in paths on Windows `cmd.exe`. Complex commands (pipes, redirects) still use `exec()`.

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

# Claudeck — Session Broadcast Fix
## Multi-Client Real-Time Sync

> **Status: IMPLEMENTED** (v1.4.0 — 2026-03-31)
>
> All sections below have been implemented. See the implementation notes at the bottom for details on what was built and tested.

---

## The Problem

When two computers open the same Claudeck session simultaneously, only the computer that **sent** the message receives the streamed reply. The second computer sees nothing until it manually refreshes.

This happens because the server operates in a **1-to-1 model** — it streams responses back only to the WebSocket connection that initiated the query. There is no concept of "other clients watching the same session."

### How Two Computers Can Share a Session
- **Local network**: Computer B opens `http://<your-ip>:9009` on the same WiFi
- **Cloudflare Tunnel**: Computer B accesses via a public tunnel URL (already supported via `--auth` flag)

---

## Root Cause

In `server/ws-handler.js`, all outbound messages (`text`, `tool`, `tool_result`, `result`, `error`, `done`, etc.) are sent only to the single `ws` socket that sent the `chat` message. There is no registry of other clients watching the same session.

In `js/core/ws.js`, the client never tells the server which session it is currently viewing. It only communicates when sending a message.

---

## What Needs to Be Built

### 1. Session Room Registry — `server/ws-handler.js`

Add a `Map<sessionId, Set<WebSocket>>` at the top of the handler:

```js
// Session rooms: sessionId → Set of connected WebSocket clients watching it
const sessionRooms = new Map();
```

Helper functions needed:

```js
function joinRoom(sessionId, ws) {
  if (!sessionRooms.has(sessionId)) sessionRooms.set(sessionId, new Set());
  sessionRooms.get(sessionId).add(ws);
}

function leaveRoom(ws) {
  for (const [sessionId, clients] of sessionRooms) {
    clients.delete(ws);
    if (clients.size === 0) sessionRooms.delete(sessionId);
  }
}

function broadcastToSession(sessionId, message, excludeWs = null) {
  const clients = sessionRooms.get(sessionId);
  if (!clients) return;
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client !== excludeWs && client.readyState === 1) { // 1 = OPEN
      client.send(payload);
    }
  }
}
```

---

### 2. Handle `subscribe` / `unsubscribe` Messages — `server/ws-handler.js`

Add handling for two new incoming message types:

```js
// Client is now viewing this session
if (data.type === 'subscribe') {
  leaveRoom(ws); // leave any previous room first
  if (data.sessionId) joinRoom(data.sessionId, ws);
  return;
}

// Client switched away or disconnected
if (data.type === 'unsubscribe') {
  leaveRoom(ws);
  return;
}
```

Also clean up on disconnect:

```js
ws.on('close', () => {
  leaveRoom(ws);
  // ... rest of existing close handler
});
```

---

### 3. Broadcast All Session Events — `server/ws-handler.js`

Every place the server calls `ws.send(...)` for a session-scoped event, replace it with a broadcast call.

The current pattern is:
```js
ws.send(JSON.stringify({ type: 'text', sessionId, content: '...' }));
```

It should become:
```js
const msg = { type: 'text', sessionId, content: '...' };
ws.send(JSON.stringify(msg));                      // send to originating client (already streaming)
broadcastToSession(sessionId, msg, ws);            // send to all other watchers
```

**All event types that need broadcasting:**
- `text`
- `tool`
- `tool_result`
- `result`
- `error`
- `aborted`
- `done`
- `permission_request`
- `workflow_started`, `workflow_step`, `workflow_completed`
- `agent_started`, `agent_progress`, `agent_completed`, `agent_error`, `agent_aborted`
- `agent_chain_started`, `agent_chain_step`, `agent_chain_completed`
- `dag_started`, `dag_level`, `dag_node`, `dag_completed`, `dag_error`
- `orchestrator_started`, `orchestrator_phase`, `orchestrator_dispatching`, `orchestrator_dispatch`, `orchestrator_completed`, `orchestrator_error`
- `worktree_created`, `worktree_completed`

---

### 4. Client Sends `subscribe` on Session Load/Switch — `js/core/ws.js`

Whenever the active session changes, the client must notify the server.

Find the existing places where sessions are loaded or switched — likely triggered by a store state change or event bus. Add:

```js
// When active session changes
function subscribeToSession(sessionId) {
  if (!sessionId) return;
  send({ type: 'subscribe', sessionId });
}
```

This should be called:
- On page load when restoring the active session from `localStorage`
- When the user clicks a session in the sidebar
- When a new session is created

On session switch (before subscribing to the new one), the server will automatically handle the room change via `leaveRoom(ws)` inside the `subscribe` handler — no explicit `unsubscribe` needed from the client.

---

### 5. Observer Clients Must Not Double-Render — `js/core/ws.js` or `features/chat/`

The client that **sent** the message is already rendering the stream live as it comes in. When it also receives the broadcast, it must not render it a second time.

**Simplest approach:** Tag the originating client's session with a `chatId` that it sent. When a broadcast message arrives with a `chatId` that the current client is actively streaming, skip it.

**Alternative (cleaner):** When the server broadcasts to observers (`excludeWs = ws`), add a flag to the message:

```js
// In broadcastToSession, add source marker for observers
broadcastToSession(sessionId, { ...msg, _broadcast: true }, ws);
```

The originating client receives the original message without `_broadcast` and renders it. Observer clients receive `_broadcast: true` and render it as a "replay" — same UI, but they know it's coming from another client's action.

This flag can also be used to show a subtle indicator like "Live from another device" if desired.

---

### 6. Parallel Mode — Room Key Includes `chatId`

In parallel mode (2×2 grid), a session has up to 4 independent streams identified by `chatId` (`chat-0` through `chat-3`). The room key should include the chatId for parallel sessions:

```js
// When subscribing in parallel mode, subscribe to each active pane
function subscribeToSession(sessionId, chatId = null) {
  const roomKey = chatId ? `${sessionId}:${chatId}` : sessionId;
  send({ type: 'subscribe', sessionId, chatId, roomKey });
}
```

On the server, use `roomKey = chatId ? \`${sessionId}:${chatId}\` : sessionId` as the Map key.

---

### 7. Permission Request Handling (Edge Case)

When Computer A triggers a permission modal, Computer B should see it too — both should be able to approve or deny. The existing `permission_response` message already carries an `id`, so whichever client responds first wins (same pattern as the existing Telegram race condition handling).

No extra work needed here — broadcasting `permission_request` to the room (step 3) is sufficient. The existing race condition logic handles the rest.

---

### 8. Abort Across Clients (Edge Case)

If Computer B sends `{ type: "abort" }`, it should cancel the stream for Computer A as well. This already works — `abort` goes to the server and cancels the SDK stream. Computer A's stream stops because the underlying process is killed, not because A receives a message. Both clients will receive the `aborted` event via broadcast.

---

## Existing Infrastructure to Leverage

The notification bell system already broadcasts WS messages across all connected clients:

```
server/notification-logger.js  →  already does multi-client WS broadcast
```

Check how that is implemented — the session broadcast can follow the same pattern.

There are also existing WebSocket performance benchmarks that include a broadcast scenario:

```
tests/perf/ws-perf.test.js  →  "approval latency, throughput, scaling, broadcast"
```

Read this file before implementing — it may already have a partial broadcast harness.

---

## Files to Touch

| File | Change |
|---|---|
| `server/ws-handler.js` | Add room registry, `subscribe`/`unsubscribe` handlers, broadcast on all session events, cleanup on disconnect |
| `js/core/ws.js` | Send `subscribe` on session load and switch |
| `js/features/sessions.js` or equivalent | Trigger `subscribeToSession()` on session selection |
| `tests/perf/ws-perf.test.js` | Extend broadcast scenario to cover session rooms |

---

## What NOT to Change

- No database schema changes needed
- No new API endpoints needed
- No changes to the Claude SDK integration
- No changes to the existing reconnect/backoff logic (it already re-syncs state on reconnect — just add a re-subscribe call after reconnect)

---

## Testing the Fix

1. Run Claudeck: `npx claudeck`
2. Open `http://localhost:9009` in **two separate browser windows**
3. In both windows, open the same session
4. In Window A, send a message
5. **Expected**: Window B shows the streaming response in real time
6. **Before fix**: Window B shows nothing until refresh

Also test:
- Switching sessions in Window B while Window A is streaming (should unsubscribe from old session)
- Closing Window A mid-stream (Window B should still receive the rest of the stream via broadcast)
- Parallel mode (each pane in Window B should sync its own stream)

---

## Context

- Claudeck GitHub: https://github.com/hamedafarag/claudeck
- Full documentation: https://github.com/hamedafarag/claudeck/blob/main/docs/DOCUMENTATION.md
- This bug was reported via Discord: two computers viewing the same session prompt don't receive each other's updates
- The current mechanism pulls full history on first load but has no live sync mechanism for ongoing streams

---

## Implementation Notes (v1.4.0)

### What Was Built

**Server (`server/ws-handler.js`):**
- Session room registry: `sessionRooms` Map with `joinRoom`, `leaveRoom`, `broadcastToSession` helpers
- `subscribe`/`unsubscribe` message handling in the WebSocket router
- `leaveRoom(ws)` on disconnect for automatic cleanup
- Broadcast added to all send functions: `wsSend` (chat), `wfSend` (workflow), `chainSend` (chain), `remSend` (/remember)
- Broadcast added to direct `ws.send` calls: `worktree_created`, `memories_injected`, `memories_captured`, `worktree_completed`, orchestrate errors
- `makeCanUseTool` extended with optional `getSessionId` parameter for broadcasting `permission_request` to observers
- All broadcast messages include `_broadcast: true` flag; sender is excluded via `excludeWs`

**Client (`public/js/core/ws.js`):**
- `subscribeToSession(sessionId)` exported function — sends subscribe message if WS is open
- Auto-subscribe on `ws.onopen` (connect and reconnect) using current `sessionId` from store

**Client (`public/js/features/sessions.js`):**
- `subscribeToSession` called in `onState("sessionId")` listener — any session change (click, new session, restore) triggers subscription

### Test Coverage (13 new tests)

**Backend (7 tests):**
1. Subscribe/unsubscribe room management
2. Room switching on re-subscribe
3. Broadcast delivery with `_broadcast: true` to observers
4. Closed observer skipped
5. Disconnect cleanup
6. Subscribe without sessionId
7. Permission request broadcast

**Frontend (6 tests):**
1. Auto-subscribe on connect with active session
2. No subscribe when no session
3. `subscribeToSession` — connected
4. `subscribeToSession` — disconnected
5. `subscribeToSession` — null ws
6. `subscribeToSession` — falsy sessionId

### Not Yet Implemented
- Agent/DAG/orchestrator broadcasts from external modules (`agent-loop.js`, `dag-executor.js`, `orchestrator.js`) — these pass `ws` directly and would need a wrapped proxy or explicit broadcast parameter. The core chat/workflow/chain handlers cover the primary use cases.
- Parallel mode room key with `chatId` (Section 6) — deferred; using `sessionId` only as the room key is sufficient since `chatId` is already in the message payload for client-side routing.

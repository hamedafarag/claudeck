# Message Queue Feature — Implementation Plan

## Context

Users often want to send follow-up messages while Claude is still responding. Currently, the send button is replaced with a stop button during streaming, and typing + Enter does nothing. This feature adds a queue: messages typed during streaming are queued as chips above the textarea and auto-fire sequentially when each request completes.

## Architecture

**Queue state lives on the pane object** (like `pane.isStreaming`), not in the global store. Each pane (single or parallel) has its own independent queue. Ephemeral — gone on reload.

## Files to Create (3 new)

### 1. `public/js/features/message-queue.js` — Core logic + UI rendering

Single module with all queue logic AND chip rendering (tightly coupled, no need to separate).

**Queue data model on pane:**
```js
pane._messageQueue = []          // Array of { id, text }
pane._queuePaused = false
pane._queuePauseReason = null    // 'error' | 'question' | 'user'
```

**Exported functions:**
- `initQueueOnPane(pane)` — Add queue properties to a pane object
- `enqueueMessage(text, pane)` — Push item, render chips
- `fireNextQueued(pane)` — Shift next item, call `_doSend(item.text, pane)`
- `removeFromQueue(pane, index)` — Remove by index, re-render
- `editQueueItem(pane, index, newText)` — Edit in place, re-render
- `reorderQueue(pane, fromIdx, toIdx)` — Splice + insert, re-render
- `clearQueue(pane)` — Empty array, re-render (strip hidden)
- `pauseQueue(pane, reason)` — Set paused flag, show paused indicator on chip strip
- `resumeQueue(pane)` — Clear paused flag, auto-fire if items exist
- `handleStopWithQueue(pane)` — Show 3-option modal, handle user choice
- `renderQueueChips(pane)` — Render chip strip in DOM (above textarea)

**Chip strip DOM position:**
- Single mode: inserted as first child of `.input-textarea-wrap` (above textarea)
- Parallel mode: inserted above textarea inside each pane's `.input-bar`
- Created lazily on first enqueue

**Chip HTML:**
```html
<div class="mq-chip-strip">
  <div class="mq-chip" draggable="true" data-queue-index="0">
    <span class="mq-chip-handle">⠿</span>
    <span class="mq-chip-text">Fix the login validat...</span>
    <button class="mq-chip-edit">✎</button>
    <button class="mq-chip-remove">×</button>
  </div>
  <!-- ... more chips ... -->
  <span class="mq-chip-count">3 queued</span>
  <!-- When paused: -->
  <span class="mq-queue-paused">⏸ Paused (error) <button class="mq-resume-btn">Resume</button></span>
</div>
```

**Inline editor (popover on chip click):**
```html
<div class="mq-editor-popover">
  <textarea class="mq-editor-textarea" rows="3">full message text</textarea>
  <div class="mq-editor-actions">
    <button class="mq-editor-save">Save</button>
    <button class="mq-editor-cancel">Cancel</button>
  </div>
</div>
```

**Drag-and-drop:** Follows `tab-sdk.js` pattern (lines 607-645) — dragstart/dragover/drop/dragend with placeholder element.

**Dependencies:** Imports `_doSend` from `chat.js` (needs export), `getPane` from `parallel.js`, `$` from `dom.js`.

### 2. `public/js/components/queue-stop-modal.js` — Web Component

Follows `bg-confirm-modal.js` pattern exactly:
```html
<div id="queue-stop-modal" class="modal-overlay hidden">
  <div class="modal queue-stop-modal">
    <div class="modal-header"><h3>Queue Active</h3></div>
    <p>You have queued messages. What would you like to do?</p>
    <div class="modal-actions">
      <button id="queue-stop-all" class="modal-btn-cancel queue-stop-terminate">Terminate All</button>
      <button id="queue-stop-skip" class="modal-btn-cancel">Skip to Next</button>
      <button id="queue-stop-pause" class="modal-btn-save">Just Stop Current</button>
    </div>
  </div>
</div>
```

### 3. `public/css/features/message-queue.css` — Styles

All classes prefixed `mq-`. Reuses existing design tokens:
- Chip: `var(--accent-dim)` bg, `var(--accent-mid)` border, `var(--font-mono)` 11px (matches `.fp-chip`)
- Editor popover: `var(--bg-secondary)` bg, `var(--border)` border, `var(--radius-md)`
- Stop modal: extends `.modal` pattern
- Animation: `mqChipIn` 0.15s scale+fade (matches `fpChipIn`)

## Files to Modify (6 existing)

### 4. `public/js/features/chat.js` — Main integration point

**a) Export `_doSend`:**
- Line 168: `function _doSend(text, pane)` → `export function _doSend(text, pane)`

**b) Add queue intercept in `sendMessage` (after line 100):**
```js
// If streaming, enqueue instead of sending
if (pane.isStreaming && text) {
  // Don't queue slash commands
  if (text.startsWith('/')) return;
  enqueueMessage(text, pane);
  pane.messageInput.value = "";
  pane.messageInput.style.height = "auto";
  dismissAutocomplete(pane);
  return;
}
```

**c) Add auto-fire hook at end of `finishStreamingHandler` (after line 291):**
```js
queueMicrotask(() => {
  if (pane._messageQueue?.length > 0 && !pane._queuePaused) {
    fireNextQueued(pane);
  }
});
```

**d) Pause on question in `done` case (after line 458):**
```js
if (isQuestionText(rawText)) {
  showWaitingForInput(pane);
  if (pane._messageQueue?.length > 0) pauseQueue(pane, 'question');
}
```

**e) Pause on error in `error` case (after line 470):**
```js
if (pane._messageQueue?.length > 0) pauseQueue(pane, 'error');
```

**f) Queue-aware stop in `stopGeneration` (before existing logic):**
```js
if (pane._messageQueue?.length > 0) {
  handleStopWithQueue(pane);
  return;
}
```

**g) Resume queue when user responds to a question, in `sendMessage`, before `_doSend` call:**
```js
if (pane._queuePaused && pane._queuePauseReason === 'question') {
  resumeQueue(pane);
}
```

**h) Add imports:**
```js
import { enqueueMessage, pauseQueue, resumeQueue, fireNextQueued, handleStopWithQueue } from './message-queue.js';
```

### 5. `public/js/ui/parallel.js` — Pane initialization

**a) In `initSinglePane()` (after line 28), add queue properties:**
```js
pane._messageQueue = [];
pane._queuePaused = false;
pane._queuePauseReason = null;
```

**b) In `createChatPane()` (after line 91), add same properties to state object.**

### 6. `public/index.html` — Add web component tag

After line 523 (`<claudeck-bg-confirm>`):
```html
<claudeck-queue-stop></claudeck-queue-stop>
```

### 7. `public/js/main.js` — Module imports

After line 16 (bg-confirm-modal):
```js
import './components/queue-stop-modal.js';
```

After line 65 (chat.js):
```js
import './features/message-queue.js';
```

### 8. `public/style.css` — CSS import

After line 44 (voice-input.css):
```css
@import url("css/features/message-queue.css");
```

### 9. `public/js/core/dom.js` — Modal DOM refs

Add after existing modal refs:
```js
queueStopModal: document.getElementById("queue-stop-modal"),
queueStopAll: document.getElementById("queue-stop-all"),
queueStopSkip: document.getElementById("queue-stop-skip"),
queueStopPause: document.getElementById("queue-stop-pause"),
```

## Event Flows

### Enqueue (user types while streaming):
```
Enter → sendMessage → pane.isStreaming? YES → enqueueMessage → renderChips → clear input
```

### Auto-fire (request completes):
```
"done" msg → finishStreamingHandler → queueMicrotask → queue not empty & not paused? → fireNextQueued → _doSend
```

### Pause on error:
```
"error" msg → finishStreamingHandler → pauseQueue('error') → microtask sees paused=true → skip
```

### Pause on question:
```
"done" msg → isQuestionText? YES → showWaitingForInput + pauseQueue('question')
User responds → sendMessage → resumeQueue → _doSend (user's response)
Next "done" → finishStreamingHandler → microtask auto-fires next queued
```

### Stop with queue:
```
Stop click → stopGeneration → queue.length > 0? → handleStopWithQueue → show modal
  "Terminate All" → abort WS + clearQueue
  "Skip to Next" → abort WS (finishStreamingHandler auto-fires next)
  "Just Stop"    → abort WS + pauseQueue('user')
```

## Edge Cases

| Case | Handling |
|------|----------|
| Slash command while streaming | Not queued — return early |
| Session switch with queue | Queue lost naturally (pane reinitialized) |
| Parallel mode toggle | Queues lost (panes recreated) |
| WebSocket disconnect | `finishStreamingHandler` called on reconnect, pause queue |
| Empty text after edit | Remove the item instead of saving |
| Rapid enqueues | Sync render, small N — no perf concern |
| `aborted` msg after "Skip to Next" | Not paused — auto-fire proceeds |
| `aborted` msg after "Just Stop" | Paused before abort round-trip — auto-fire blocked |

## Verification

1. Run `npm test` — all 2555 existing tests should pass (no test changes needed)
2. Manual test in browser:
   - Start a chat, send a message, while streaming type another and press Enter → chip appears
   - Queue 2-3 messages → verify they fire sequentially
   - Drag chips to reorder → verify order changes
   - Click edit on chip → popover opens, edit text, save → chip text updates
   - Delete a chip → chip removed
   - Trigger error (e.g. disconnect) → queue pauses, resume button appears
   - Stop with queue → modal shows 3 options, each works correctly

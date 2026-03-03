// WebSocket connection + message dispatch with exponential backoff
import { $ } from './dom.js';
import { getState, setState } from './store.js';
import { emit } from './events.js';

let backoffAttempt = 0;
let hasConnectedBefore = false;

const BACKOFF_BASE_MS = 2000;
const BACKOFF_FACTOR = 2;
const BACKOFF_MAX_MS = 30000;

function getBackoffDelay() {
  const delay = Math.min(BACKOFF_BASE_MS * Math.pow(BACKOFF_FACTOR, backoffAttempt), BACKOFF_MAX_MS);
  // Add 0-25% jitter
  const jitter = delay * Math.random() * 0.25;
  return delay + jitter;
}

export function connectWebSocket() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${location.host}/ws`);
  setState("ws", ws);

  ws.onopen = () => {
    console.log("WebSocket connected");
    $.connectionDot.className = "term-dot connected";
    $.connectionText.textContent = "connected";
    $.connectionText.className = "term-status ok";

    // Reset backoff on successful connection
    backoffAttempt = 0;

    if (hasConnectedBefore) {
      emit("ws:reconnected");
    } else {
      hasConnectedBefore = true;
      emit("ws:connected");
    }
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    emit("ws:message", msg);
  };

  ws.onclose = () => {
    const delay = getBackoffDelay();
    backoffAttempt++;
    console.log(`WebSocket disconnected, reconnecting in ${Math.round(delay)}ms (attempt ${backoffAttempt})...`);
    $.connectionDot.className = "term-dot reconnecting";
    $.connectionText.textContent = "reconnecting";
    $.connectionText.className = "term-status";
    emit("ws:disconnected");
    setTimeout(connectWebSocket, delay);
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
    $.connectionDot.className = "term-dot";
    $.connectionText.textContent = "disconnected";
    $.connectionText.className = "term-status";
  };
}

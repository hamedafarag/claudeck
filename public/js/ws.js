// WebSocket connection + message dispatch
import { $ } from './dom.js';
import { getState, setState } from './store.js';
import { emit } from './events.js';

export function connectWebSocket() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${location.host}/ws`);
  setState("ws", ws);

  ws.onopen = () => {
    console.log("WebSocket connected");
    $.connectionDot.className = "term-dot connected";
    $.connectionText.textContent = "connected";
    $.connectionText.className = "term-status ok";
    emit("ws:connected");
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    emit("ws:message", msg);
  };

  ws.onclose = () => {
    console.log("WebSocket disconnected, reconnecting...");
    $.connectionDot.className = "term-dot reconnecting";
    $.connectionText.textContent = "reconnecting";
    $.connectionText.className = "term-status";
    emit("ws:disconnected");
    setTimeout(connectWebSocket, 2000);
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
    $.connectionDot.className = "term-dot";
    $.connectionText.textContent = "disconnected";
    $.connectionText.className = "term-status";
  };
}

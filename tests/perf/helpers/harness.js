/**
 * Performance test harness utilities — server bootstrap and client management.
 * Mocks must be declared in the test file (vi.mock hoisting requires it).
 */
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { setupWebSocket } from "../../../server/ws-handler.js";
import { setWss } from "../../../server/notification-logger.js";

/**
 * Create a performance test server with real WS handler on an auto-assigned port.
 */
export async function createPerfServer() {
  const server = createServer();
  const wss = new WebSocketServer({ server, path: "/ws" });

  setupWebSocket(wss, new Map());
  setWss(wss);

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const url = `ws://127.0.0.1:${port}/ws`;

  return {
    wss,
    server,
    port,
    url,
    close() {
      return new Promise((resolve) => {
        for (const client of wss.clients) {
          client.terminate();
        }
        wss.close(() => {
          server.close(resolve);
        });
      });
    },
  };
}

/**
 * Open N WebSocket connections, resolving when all are in OPEN state.
 */
export async function connectClients(url, n) {
  const clients = [];
  const promises = [];

  for (let i = 0; i < n; i++) {
    const ws = new WebSocket(url);
    clients.push(ws);
    promises.push(
      new Promise((resolve, reject) => {
        ws.on("open", resolve);
        ws.on("error", reject);
      }),
    );
  }

  await Promise.all(promises);
  return clients;
}

/**
 * Gracefully close all client connections and wait for close events.
 */
export async function closeClients(clients) {
  await Promise.all(
    clients.map(
      (ws) =>
        new Promise((resolve) => {
          if (ws.readyState === WebSocket.CLOSED) return resolve();
          ws.on("close", resolve);
          ws.close();
        }),
    ),
  );
}

/**
 * WebSocket Performance Tests
 *
 * Measures relay-layer performance with real WebSocket connections over localhost.
 * Run with: npm run test:perf
 */
import { describe, it, beforeAll, afterAll, expect, vi } from "vitest";
import { WebSocket } from "ws";

// ── Mocks (must be in test file for vitest hoisting) ─────────────────────────
vi.mock("../../db.js", () => ({
  createSession: vi.fn(),
  updateClaudeSessionId: vi.fn(),
  getSession: vi.fn(() => null),
  touchSession: vi.fn(),
  addCost: vi.fn(),
  addMessage: vi.fn(),
  getTotalCost: vi.fn(() => 0),
  setClaudeSession: vi.fn(),
  updateSessionTitle: vi.fn(),
  getTopMemories: vi.fn(() => []),
  touchMemory: vi.fn(),
  createNotification: vi.fn((type, title, body, meta) => ({
    id: Date.now(),
    type,
    title,
    body,
    metadata: meta,
    created_at: new Date().toISOString(),
    read: 0,
  })),
  getUnreadNotificationCount: vi.fn(() => 0),
}));

vi.mock("../../server/routes/projects.js", () => ({
  getProjectSystemPrompt: vi.fn(() => null),
}));

vi.mock("../../server/push-sender.js", () => ({
  sendPushNotification: vi.fn(),
}));

vi.mock("../../server/telegram-sender.js", () => ({
  sendTelegramNotification: vi.fn(),
  sendPermissionRequest: vi.fn(async () => ({ result: { message_id: 42 } })),
  isEnabled: vi.fn(() => false),
  getConfig: vi.fn(() => ({})),
}));

vi.mock("../../server/telegram-poller.js", () => ({
  trackApprovalMessage: vi.fn(),
  markTelegramMessageResolved: vi.fn(async () => {}),
}));

vi.mock("../../server/memory-injector.js", () => ({
  buildMemoryPrompt: vi.fn(() => ({ prompt: null, count: 0, memories: [] })),
  parseRememberCommand: vi.fn(() => null),
  buildAgentMemoryPrompt: vi.fn(() => null),
  saveExplicitMemories: vi.fn(() => 0),
}));

vi.mock("../../server/memory-extractor.js", () => ({
  captureMemories: vi.fn(() => 0),
  runMaintenance: vi.fn(),
}));

vi.mock("../../server/summarizer.js", () => ({
  generateSessionSummary: vi.fn(async () => {}),
}));

vi.mock("../../server/agent-loop.js", () => ({
  runAgent: vi.fn(async () => ({ resolvedSid: "agent-sid", claudeSessionId: "agent-claude-sid" })),
}));

vi.mock("../../server/orchestrator.js", () => ({
  runOrchestrator: vi.fn(async () => {}),
}));

vi.mock("../../server/dag-executor.js", () => ({
  runDag: vi.fn(async () => {}),
}));

vi.mock("../../server/paths.js", () => ({
  configPath: vi.fn((name) => `/mock-config/${name}`),
}));

vi.mock("@anthropic-ai/claude-code", () => ({
  query: vi.fn(() =>
    (async function* () {
      yield { type: "system", subtype: "init", session_id: "perf-sid", model: "claude-sonnet-4-6" };
      yield { type: "result", subtype: "success", total_cost_usd: 0, duration_ms: 0, num_turns: 0, usage: { input_tokens: 0, output_tokens: 0 }, modelUsage: {} };
    })(),
  ),
}));

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { createPerfServer, connectClients, closeClients } from "./helpers/harness.js";
import { logNotification } from "../../server/notification-logger.js";
import { computeStats, formatTable, formatSummary } from "./helpers/stats.js";
import crypto from "crypto";

const WARMUP = 10;
const ITERATIONS = 100;
const allResults = [];

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Approval Round-Trip Latency
//
// Measures the full WebSocket round-trip that matters for tool approvals:
// server sends permission_request → client responds permission_response →
// server receives the response. This is the relay latency the user experiences.
// ─────────────────────────────────────────────────────────────────────────────
describe("Approval round-trip latency", () => {
  let srv;
  beforeAll(async () => { srv = await createPerfServer(); });
  afterAll(async () => { await srv.close(); });

  for (const n of [1, 5, 10, 25]) {
    it(`${n} concurrent session(s)`, async () => {
      const clients = await connectClients(srv.url, n);

      // Each client auto-approves permission_request instantly
      for (const ws of clients) {
        ws.on("message", (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "permission_request") {
            ws.send(JSON.stringify({ type: "permission_response", id: msg.id, behavior: "allow" }));
          }
        });
      }

      await new Promise((r) => setTimeout(r, 50));

      const serverSockets = [...srv.wss.clients];
      const latencies = [];

      for (let iter = 0; iter < WARMUP + ITERATIONS; iter++) {
        // Fire one round-trip per connection in parallel
        const promises = serverSockets.map((serverWs) => {
          return new Promise((resolve) => {
            const id = crypto.randomUUID();
            const t0 = performance.now();

            // Listen for the client's response arriving back at the server
            function onMsg(raw) {
              const msg = JSON.parse(raw.toString());
              if (msg.type === "permission_response" && msg.id === id) {
                serverWs.removeListener("message", onMsg);
                const elapsed = performance.now() - t0;
                if (iter >= WARMUP) latencies.push(elapsed);
                resolve();
              }
            }
            serverWs.on("message", onMsg);

            // Send permission_request from server to client
            serverWs.send(JSON.stringify({
              type: "permission_request",
              id,
              toolName: "Write",
              input: { path: "/test" },
            }));
          });
        });
        await Promise.all(promises);
      }

      const stats = computeStats(latencies);
      console.log(formatTable(`Approval round-trip (${n} sessions)`, stats));
      allResults.push({ label: "Approval round-trip", n, stats, unit: "ms" });

      await closeClients(clients);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Message Throughput
// ─────────────────────────────────────────────────────────────────────────────
describe("Message throughput", () => {
  let srv;
  beforeAll(async () => { srv = await createPerfServer(); });
  afterAll(async () => { await srv.close(); });

  for (const n of [1, 10, 50]) {
    it(`${n} client(s) receiving 10k messages`, async () => {
      const MESSAGE_COUNT = 10_000;
      const clients = await connectClients(srv.url, n);

      // Set up receive counters for each client
      const receiveCounts = clients.map(() => ({ count: 0, lastSeq: -1, outOfOrder: false }));
      const donePromises = clients.map((ws, idx) => {
        return new Promise((resolve) => {
          ws.on("message", (raw) => {
            const msg = JSON.parse(raw.toString());
            if (msg.type === "perf_msg") {
              if (msg.seq <= receiveCounts[idx].lastSeq) receiveCounts[idx].outOfOrder = true;
              receiveCounts[idx].lastSeq = msg.seq;
              receiveCounts[idx].count++;
              if (receiveCounts[idx].count >= MESSAGE_COUNT) resolve();
            }
          });
        });
      });

      await new Promise((r) => setTimeout(r, 50));

      // Send messages from server to all connected clients
      const serverSockets = [...srv.wss.clients];
      const t0 = performance.now();

      for (let seq = 0; seq < MESSAGE_COUNT; seq++) {
        const payload = JSON.stringify({ type: "perf_msg", seq, data: "x".repeat(64) });
        for (const serverWs of serverSockets) {
          if (serverWs.readyState === WebSocket.OPEN) serverWs.send(payload);
        }
      }

      // Wait for all clients to receive all messages (timeout 30s)
      await Promise.race([
        Promise.all(donePromises),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Throughput receive timeout")), 30_000)),
      ]);

      const elapsed = performance.now() - t0;
      const msgsPerSec = (MESSAGE_COUNT * n) / (elapsed / 1000);

      // Verify ordering
      for (const rc of receiveCounts) {
        expect(rc.outOfOrder).toBe(false);
        expect(rc.count).toBe(MESSAGE_COUNT);
      }

      const stats = { count: MESSAGE_COUNT * n, min: msgsPerSec, max: msgsPerSec, mean: msgsPerSec, p50: msgsPerSec, p95: msgsPerSec, p99: msgsPerSec, stddev: 0 };
      console.log(`\n  Throughput (${n} clients): ${Math.round(msgsPerSec).toLocaleString()} msg/s total (${elapsed.toFixed(1)} ms for ${(MESSAGE_COUNT * n).toLocaleString()} messages)\n`);
      allResults.push({ label: "Message throughput", n, stats, unit: "msg/s" });

      await closeClients(clients);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Connection Scaling
// ─────────────────────────────────────────────────────────────────────────────
describe("Connection scaling", () => {
  let srv;
  beforeAll(async () => { srv = await createPerfServer(); });
  afterAll(async () => { await srv.close(); });

  for (const n of [10, 50, 100]) {
    it(`${n} connections — establish time + memory`, async () => {
      // Force GC if exposed for cleaner measurements
      if (global.gc) global.gc();

      const memBefore = process.memoryUsage().heapUsed;
      const connectLatencies = [];

      // Connect one at a time to measure per-connection latency
      const clients = [];
      for (let i = 0; i < n; i++) {
        const t0 = performance.now();
        const [ws] = await connectClients(srv.url, 1);
        connectLatencies.push(performance.now() - t0);
        clients.push(ws);
      }

      const memAfter = process.memoryUsage().heapUsed;
      const memDelta = memAfter - memBefore;
      const perConn = memDelta / n;

      const stats = computeStats(connectLatencies);
      console.log(formatTable(`Connection establish (${n} conns)`, stats));
      console.log(`  Memory: +${(memDelta / 1024 / 1024).toFixed(2)} MB total, ${(perConn / 1024).toFixed(1)} KB/conn\n`);
      allResults.push({ label: "Connection establish", n, stats, unit: "ms" });

      await closeClients(clients);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Broadcast Fan-Out
// ─────────────────────────────────────────────────────────────────────────────
describe("Broadcast fan-out", () => {
  let srv;
  beforeAll(async () => { srv = await createPerfServer(); });
  afterAll(async () => { await srv.close(); });

  for (const n of [10, 50, 100]) {
    it(`${n} clients — notification broadcast`, async () => {
      const BROADCAST_ITERATIONS = 50;
      const clients = await connectClients(srv.url, n);

      await new Promise((r) => setTimeout(r, 50));

      const latencies = [];

      for (let iter = 0; iter < WARMUP + BROADCAST_ITERATIONS; iter++) {
        // Set up receive promises for all clients
        const receivePromises = clients.map((ws) => {
          return new Promise((resolve) => {
            function onMsg(raw) {
              const msg = JSON.parse(raw.toString());
              if (msg.type === "notification:new") {
                ws.removeListener("message", onMsg);
                resolve();
              }
            }
            ws.on("message", onMsg);
          });
        });

        const t0 = performance.now();
        logNotification("info", "perf-test", `Broadcast ${iter}`);

        await Promise.race([
          Promise.all(receivePromises),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Broadcast timeout")), 5000)),
        ]);

        const elapsed = performance.now() - t0;
        if (iter >= WARMUP) latencies.push(elapsed);
      }

      const stats = computeStats(latencies);
      console.log(formatTable(`Broadcast fan-out (${n} clients)`, stats));
      allResults.push({ label: "Broadcast fan-out", n, stats, unit: "ms" });

      await closeClients(clients);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
afterAll(() => {
  if (allResults.length > 0) {
    console.log(formatSummary(allResults));
  }
});

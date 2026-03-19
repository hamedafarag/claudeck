import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("../../../server/agent-loop.js", () => ({
  runAgent: vi.fn(),
}));
vi.mock("../../../server/push-sender.js", () => ({
  sendPushNotification: vi.fn(),
}));
vi.mock("../../../server/telegram-sender.js", () => ({
  sendTelegramNotification: vi.fn(),
  isEnabled: vi.fn(() => false),
}));

// dag-executor does not import db.js directly, but agent-loop.js does.
// We mock it to prevent side-effects from the real db being loaded.
vi.mock("../../../db.js", () => ({
  setAgentContext: vi.fn(),
  getAgentContext: vi.fn(),
  recordAgentRunStart: vi.fn(() => 1),
  recordAgentRunComplete: vi.fn(),
}));

import { runDag } from "../../../server/dag-executor.js";
import { runAgent } from "../../../server/agent-loop.js";
import { sendPushNotification } from "../../../server/push-sender.js";
import { sendTelegramNotification } from "../../../server/telegram-sender.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Create a mock WebSocket that records sent messages. */
function createMockWs() {
  const messages = [];
  return {
    readyState: 1, // OPEN
    send: vi.fn((raw) => messages.push(JSON.parse(raw))),
    messages,
  };
}

/** Shared default options that every runDag call needs. */
function baseOpts(overrides = {}) {
  return {
    ws: createMockWs(),
    dag: { id: "dag-1", title: "Test DAG", nodes: [], edges: [] },
    agents: [],
    cwd: "/tmp",
    sessionId: "sid-1",
    projectName: "proj",
    permissionMode: "auto",
    model: "test-model",
    sessionIds: new Map(),
    pendingApprovals: new Map(),
    makeCanUseTool: vi.fn(),
    activeQueries: new Map(),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("dag-executor — runDag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Single node DAG ──────────────────────────────────────────────────────
  it("executes a simple single-node DAG", async () => {
    runAgent.mockResolvedValue({ resolvedSid: "sid-resolved" });

    const ws = createMockWs();
    const agents = [{ id: "agent-a", title: "Agent A" }];
    const dag = {
      id: "dag-1",
      title: "Single Node",
      nodes: [{ id: "n1", agentId: "agent-a" }],
      edges: [],
    };

    await runDag(baseOpts({ ws, dag, agents }));

    // runAgent should have been called exactly once for node n1
    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentDef: agents[0],
        runType: "dag",
      }),
    );

    // Should send dag_started, dag_level (running), dag_node (running),
    // dag_node (completed), dag_level (completed), dag_completed
    const types = ws.messages.map((m) => m.type);
    expect(types).toContain("dag_started");
    expect(types).toContain("dag_completed");

    // dag_completed should reflect 1 succeeded, 0 failed
    const completed = ws.messages.find((m) => m.type === "dag_completed");
    expect(completed.succeeded).toBe(1);
    expect(completed.failed).toBe(0);

    // Push notification sent
    expect(sendPushNotification).toHaveBeenCalledTimes(1);
  });

  // ── Linear chain A -> B -> C ─────────────────────────────────────────────
  it("executes a linear chain (A -> B -> C) in order", async () => {
    const callOrder = [];
    runAgent.mockImplementation(async ({ agentDef }) => {
      callOrder.push(agentDef.id);
      return {};
    });

    const ws = createMockWs();
    const agents = [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "c", title: "C" },
    ];
    const dag = {
      id: "dag-chain",
      title: "Chain",
      nodes: [
        { id: "n1", agentId: "a" },
        { id: "n2", agentId: "b" },
        { id: "n3", agentId: "c" },
      ],
      edges: [
        { from: "n1", to: "n2" },
        { from: "n2", to: "n3" },
      ],
    };

    await runDag(baseOpts({ ws, dag, agents }));

    // All three agents ran
    expect(runAgent).toHaveBeenCalledTimes(3);
    // Order must be A before B before C
    expect(callOrder).toEqual(["a", "b", "c"]);
  });

  // ── Parallel nodes (no edges) ────────────────────────────────────────────
  it("executes parallel nodes (A and B with no edges)", async () => {
    runAgent.mockResolvedValue({});

    const ws = createMockWs();
    const agents = [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
    ];
    const dag = {
      id: "dag-parallel",
      title: "Parallel",
      nodes: [
        { id: "n1", agentId: "a" },
        { id: "n2", agentId: "b" },
      ],
      edges: [],
    };

    await runDag(baseOpts({ ws, dag, agents }));

    expect(runAgent).toHaveBeenCalledTimes(2);

    // Both nodes are in level 0 — they should be in the same level message
    const levelMsgs = ws.messages.filter(
      (m) => m.type === "dag_level" && m.status === "running",
    );
    expect(levelMsgs.length).toBe(1);
    expect(levelMsgs[0].nodeIds).toEqual(expect.arrayContaining(["n1", "n2"]));

    const completed = ws.messages.find((m) => m.type === "dag_completed");
    expect(completed.succeeded).toBe(2);
    expect(completed.failed).toBe(0);
  });

  // ── Agent execution failure ──────────────────────────────────────────────
  it("handles agent execution failure and marks node as error", async () => {
    runAgent.mockRejectedValue(new Error("Agent crashed"));

    const ws = createMockWs();
    const agents = [{ id: "a", title: "A" }];
    const dag = {
      id: "dag-fail",
      title: "Failing",
      nodes: [{ id: "n1", agentId: "a" }],
      edges: [],
    };

    await runDag(baseOpts({ ws, dag, agents }));

    // Should still complete the DAG (not throw)
    const nodeError = ws.messages.find(
      (m) => m.type === "dag_node" && m.status === "error",
    );
    expect(nodeError).toBeDefined();
    expect(nodeError.error).toBe("Agent crashed");

    const completed = ws.messages.find((m) => m.type === "dag_completed");
    expect(completed.failed).toBe(1);
    expect(completed.succeeded).toBe(0);
  });

  // ── Failure propagation (downstream nodes are skipped) ───────────────────
  it("skips downstream nodes when a dependency fails", async () => {
    runAgent.mockRejectedValueOnce(new Error("Boom"));
    runAgent.mockResolvedValue({});

    const ws = createMockWs();
    const agents = [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
    ];
    const dag = {
      id: "dag-skip",
      title: "Skip Downstream",
      nodes: [
        { id: "n1", agentId: "a" },
        { id: "n2", agentId: "b" },
      ],
      edges: [{ from: "n1", to: "n2" }],
    };

    await runDag(baseOpts({ ws, dag, agents }));

    // Only agent A should have been called; B should be skipped
    expect(runAgent).toHaveBeenCalledTimes(1);

    const skipped = ws.messages.find(
      (m) => m.type === "dag_node" && m.status === "skipped",
    );
    expect(skipped).toBeDefined();
    expect(skipped.nodeId).toBe("n2");
    expect(skipped.reason).toContain("n1");
  });

  // ── Missing agent definition ─────────────────────────────────────────────
  it("handles missing agent definitions by skipping the node", async () => {
    const ws = createMockWs();
    const agents = []; // no agents provided
    const dag = {
      id: "dag-missing",
      title: "Missing Agent",
      nodes: [{ id: "n1", agentId: "nonexistent" }],
      edges: [],
    };

    await runDag(baseOpts({ ws, dag, agents }));

    // runAgent should never be called
    expect(runAgent).not.toHaveBeenCalled();

    const skipped = ws.messages.find(
      (m) => m.type === "dag_node" && m.status === "skipped",
    );
    expect(skipped).toBeDefined();
    expect(skipped.reason).toContain("Agent not found");

    const completed = ws.messages.find((m) => m.type === "dag_completed");
    expect(completed.failed).toBe(1);
  });

  // ── WebSocket progress updates ───────────────────────────────────────────
  it("sends WebSocket progress updates for each lifecycle event", async () => {
    runAgent.mockResolvedValue({});

    const ws = createMockWs();
    const agents = [{ id: "a", title: "A" }];
    const dag = {
      id: "dag-ws",
      title: "WS Test",
      nodes: [{ id: "n1", agentId: "a" }],
      edges: [],
    };

    await runDag(baseOpts({ ws, dag, agents }));

    const types = ws.messages.map((m) => m.type);

    // Full lifecycle: started -> level running -> node running ->
    //                 node completed -> level completed -> dag completed
    expect(types).toEqual([
      "dag_started",
      "dag_level",     // running
      "dag_node",      // running
      "dag_node",      // completed
      "dag_level",     // completed
      "dag_completed",
    ]);

    // Verify dag_started payload
    const started = ws.messages[0];
    expect(started.dagId).toBe("dag-ws");
    expect(started.title).toBe("WS Test");
    expect(started.nodes).toHaveLength(1);
    expect(started.totalNodes).toBe(1);
    expect(started.runId).toBeDefined();
  });

  // ── Abort handling ───────────────────────────────────────────────────────
  it("marks node as aborted when AbortError is thrown", async () => {
    const abortError = new Error("Aborted");
    abortError.name = "AbortError";
    runAgent.mockRejectedValue(abortError);

    const ws = createMockWs();
    const agents = [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
    ];
    const dag = {
      id: "dag-abort",
      title: "Abort Test",
      nodes: [
        { id: "n1", agentId: "a" },
        { id: "n2", agentId: "b" },
      ],
      // n1 and n2 on separate levels so n2 would run in level 1
      edges: [{ from: "n1", to: "n2" }],
    };

    await runDag(baseOpts({ ws, dag, agents }));

    const aborted = ws.messages.find(
      (m) => m.type === "dag_node" && m.status === "aborted",
    );
    expect(aborted).toBeDefined();
    expect(aborted.nodeId).toBe("n1");
  });

  // ── Closed WebSocket ─────────────────────────────────────────────────────
  it("does not send messages when WebSocket is closed", async () => {
    runAgent.mockResolvedValue({});

    const ws = createMockWs();
    ws.readyState = 3; // CLOSED

    const agents = [{ id: "a", title: "A" }];
    const dag = {
      id: "dag-closed",
      title: "Closed WS",
      nodes: [{ id: "n1", agentId: "a" }],
      edges: [],
    };

    await runDag(baseOpts({ ws, dag, agents }));

    // ws.send should never be called (readyState !== 1)
    expect(ws.send).not.toHaveBeenCalled();
  });

  // ── Telegram notifications ───────────────────────────────────────────────
  it("sends Telegram notifications for start and completion", async () => {
    runAgent.mockResolvedValue({});

    const ws = createMockWs();
    const agents = [{ id: "a", title: "A" }];
    const dag = {
      id: "dag-tg",
      title: "TG Test",
      nodes: [{ id: "n1", agentId: "a" }],
      edges: [],
    };

    await runDag(baseOpts({ ws, dag, agents }));

    // Start notification
    expect(sendTelegramNotification).toHaveBeenCalledWith(
      "start",
      "DAG Started",
      expect.stringContaining("TG Test"),
    );

    // Completion notification
    expect(sendTelegramNotification).toHaveBeenCalledWith(
      "dag",
      "DAG Completed",
      expect.any(String),
      expect.objectContaining({ succeeded: 1, failed: 0 }),
    );
  });

  // ── Telegram failure notification ────────────────────────────────────────
  it("sends error-type Telegram notification when nodes fail", async () => {
    runAgent.mockRejectedValue(new Error("fail"));

    const ws = createMockWs();
    const agents = [{ id: "a", title: "A" }];
    const dag = {
      id: "dag-tg-err",
      title: "TG Error",
      nodes: [{ id: "n1", agentId: "a" }],
      edges: [],
    };

    await runDag(baseOpts({ ws, dag, agents }));

    const completionCall = sendTelegramNotification.mock.calls.find(
      (c) => c[0] === "error",
    );
    expect(completionCall).toBeDefined();
    expect(completionCall[1]).toBe("DAG Completed with Failures");
  });
});

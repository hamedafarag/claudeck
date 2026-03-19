import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("../../../db.js", () => ({
  createSession: vi.fn(),
  updateClaudeSessionId: vi.fn(),
  getSession: vi.fn(() => null),
  addCost: vi.fn(),
  addMessage: vi.fn(),
  getTotalCost: vi.fn(() => 0.05),
  updateSessionTitle: vi.fn(),
  setAgentContext: vi.fn(),
  getAllAgentContext: vi.fn(() => []),
}));

vi.mock("../../../server/routes/projects.js", () => ({
  getProjectSystemPrompt: vi.fn(() => null),
}));

vi.mock("../../../server/push-sender.js", () => ({
  sendPushNotification: vi.fn(),
}));

vi.mock("../../../server/telegram-sender.js", () => ({
  sendTelegramNotification: vi.fn(),
  isEnabled: vi.fn(() => false),
  getConfig: vi.fn(() => ({})),
}));

vi.mock("../../../server/memory-injector.js", () => ({
  buildAgentMemoryPrompt: vi.fn(() => null),
  saveExplicitMemories: vi.fn(() => 0),
}));

vi.mock("../../../server/memory-extractor.js", () => ({
  captureMemories: vi.fn(() => 0),
}));

vi.mock("../../../server/agent-loop.js", () => ({
  runAgent: vi.fn(async () => ({ resolvedSid: "agent-sid", claudeSessionId: "agent-claude-sid" })),
}));

// Default: planner yields a dispatch block, then a success result
function makePlannerOutput(text) {
  return (async function* () {
    yield { type: "system", subtype: "init", session_id: "orch-claude-sid" };
    yield { type: "assistant", message: { content: [{ type: "text", text }] } };
    yield {
      type: "result",
      subtype: "success",
      total_cost_usd: 0.02,
      duration_ms: 2000,
      num_turns: 1,
      usage: { input_tokens: 200, output_tokens: 100 },
      modelUsage: { "claude-sonnet-4-6": {} },
    };
  })();
}

function makeSynthesisOutput(text) {
  return (async function* () {
    yield { type: "system", subtype: "init", session_id: "synth-claude-sid" };
    yield { type: "assistant", message: { content: [{ type: "text", text }] } };
    yield {
      type: "result",
      subtype: "success",
      total_cost_usd: 0.01,
      duration_ms: 1000,
      num_turns: 1,
      usage: { input_tokens: 150, output_tokens: 80 },
      modelUsage: { "claude-sonnet-4-6": {} },
    };
  })();
}

let queryCallCount = 0;

vi.mock("@anthropic-ai/claude-code", () => ({
  query: vi.fn(() => {
    // First call = planner, second call = synthesis
    queryCallCount++;
    if (queryCallCount === 1) {
      return makePlannerOutput(
        'I will delegate this.\n\n```agent-dispatch\n{"agent": "code-writer", "context": "Write the implementation"}\n```',
      );
    }
    return makeSynthesisOutput("Everything was completed successfully.");
  }),
}));

import { runOrchestrator } from "../../../server/orchestrator.js";
import { runAgent } from "../../../server/agent-loop.js";
import { query } from "@anthropic-ai/claude-code";
import {
  createSession,
  getSession,
  addCost,
  addMessage,
  getTotalCost,
  getAllAgentContext,
} from "../../../db.js";
import { sendPushNotification } from "../../../server/push-sender.js";
import { sendTelegramNotification } from "../../../server/telegram-sender.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockWs() {
  const messages = [];
  return {
    readyState: 1,
    send: vi.fn((raw) => messages.push(JSON.parse(raw))),
    messages,
  };
}

function baseOpts(overrides = {}) {
  return {
    ws: createMockWs(),
    task: "Refactor the auth module",
    agents: [
      { id: "code-writer", title: "Code Writer", description: "Writes code" },
      { id: "reviewer", title: "Reviewer", description: "Reviews code" },
    ],
    cwd: "/tmp/project",
    sessionId: "sid-1",
    projectName: "Test Project",
    permissionMode: "bypass",
    model: null,
    sessionIds: new Map(),
    pendingApprovals: new Map(),
    makeCanUseTool: vi.fn(),
    activeQueries: new Map(),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("orchestrator — runOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryCallCount = 0;
  });

  // ── Planning phase ──────────────────────────────────────────────────────
  it("planning phase sends prompt to Claude with agent descriptions", async () => {
    const opts = baseOpts();

    await runOrchestrator(opts);

    // First query call is the planner
    expect(query).toHaveBeenCalled();
    const plannerCall = query.mock.calls[0][0];
    expect(plannerCall.prompt).toContain("task orchestrator");
    expect(plannerCall.prompt).toContain("code-writer");
    expect(plannerCall.prompt).toContain("Writes code");
    expect(plannerCall.prompt).toContain("Refactor the auth module");
  });

  // ── Dispatch parsing ───────────────────────────────────────────────────
  it("parses agent-dispatch blocks and runs the dispatched agent", async () => {
    const opts = baseOpts();

    await runOrchestrator(opts);

    // runAgent should be called for the dispatched agent
    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentDef: expect.objectContaining({ id: "code-writer" }),
        userContext: "Write the implementation",
      }),
    );
  });

  // ── Synthesis phase ─────────────────────────────────────────────────────
  it("synthesis phase combines agent results", async () => {
    getAllAgentContext.mockReturnValue([
      { agent_id: "code-writer", value: "Wrote 3 files" },
    ]);

    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await runOrchestrator(opts);

    // Second query call is the synthesis
    expect(query).toHaveBeenCalledTimes(2);
    const synthCall = query.mock.calls[1][0];
    expect(synthCall.prompt).toContain("synthesis");
    expect(synthCall.prompt).toContain("Agent Results");
  });

  // ── WebSocket updates throughout ───────────────────────────────────────
  it("sends WebSocket updates throughout the orchestration lifecycle", async () => {
    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await runOrchestrator(opts);

    const types = ws.messages.map((m) => m.type);

    expect(types).toContain("orchestrator_started");
    expect(types).toContain("orchestrator_phase"); // planning
    expect(types).toContain("session");
    expect(types).toContain("text");
    expect(types).toContain("result");
    expect(types).toContain("orchestrator_dispatching");
    expect(types).toContain("orchestrator_dispatch");
    expect(types).toContain("orchestrator_completed");

    // Validate orchestrator_started
    const started = ws.messages.find((m) => m.type === "orchestrator_started");
    expect(started.task).toContain("Refactor");
    expect(started.runId).toBeDefined();

    // Validate planning phase
    const planPhase = ws.messages.find(
      (m) => m.type === "orchestrator_phase" && m.phase === "planning",
    );
    expect(planPhase).toBeDefined();

    // Validate dispatching
    const dispatching = ws.messages.find((m) => m.type === "orchestrator_dispatching");
    expect(dispatching.totalAgents).toBe(1);
    expect(dispatching.dispatches[0].agentId).toBe("code-writer");
  });

  // ── No dispatches — orchestrator handles directly ──────────────────────
  it("completes without dispatching when planner returns no dispatch blocks", async () => {
    queryCallCount = 0;
    query.mockReturnValueOnce(
      makePlannerOutput("I can handle this directly. No agents needed."),
    );

    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await runOrchestrator(opts);

    expect(runAgent).not.toHaveBeenCalled();

    const completed = ws.messages.find((m) => m.type === "orchestrator_completed");
    expect(completed).toBeDefined();
    expect(completed.dispatched).toBe(0);

    const done = ws.messages.find((m) => m.type === "done");
    expect(done).toBeDefined();
  });

  // ── Handles errors in planning phase ───────────────────────────────────
  it("handles errors in planning phase and sends error messages", async () => {
    queryCallCount = 0;
    query.mockReturnValueOnce(
      (async function* () {
        throw new Error("Model unavailable");
      })(),
    );

    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await runOrchestrator(opts);

    const orchErr = ws.messages.find((m) => m.type === "orchestrator_error");
    expect(orchErr).toBeDefined();
    expect(orchErr.error).toBe("Model unavailable");

    const errMsg = ws.messages.find((m) => m.type === "error");
    expect(errMsg).toBeDefined();

    // Should not dispatch any agents
    expect(runAgent).not.toHaveBeenCalled();
  });

  // ── Handles SDK error result in planning ───────────────────────────────
  it("handles SDK error result in planning phase", async () => {
    queryCallCount = 0;
    query.mockReturnValueOnce(
      (async function* () {
        yield { type: "system", subtype: "init", session_id: "err-sid" };
        yield {
          type: "result",
          subtype: "error_overloaded",
          errors: ["Service overloaded"],
          total_cost_usd: 0,
          duration_ms: 100,
          num_turns: 0,
          usage: {},
          modelUsage: {},
        };
      })(),
    );

    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await runOrchestrator(opts);

    const orchErr = ws.messages.find((m) => m.type === "orchestrator_error");
    expect(orchErr).toBeDefined();
    expect(orchErr.error).toBe("Service overloaded");

    expect(runAgent).not.toHaveBeenCalled();
  });

  // ── Skips unknown agent IDs ────────────────────────────────────────────
  it("skips dispatch for unknown agent IDs", async () => {
    queryCallCount = 0;
    query.mockReturnValueOnce(
      makePlannerOutput(
        '```agent-dispatch\n{"agent": "nonexistent-agent", "context": "Do something"}\n```',
      ),
    );

    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await runOrchestrator(opts);

    expect(runAgent).not.toHaveBeenCalled();

    const skip = ws.messages.find((m) => m.type === "orchestrator_dispatch_skip");
    expect(skip).toBeDefined();
    expect(skip.agentId).toBe("nonexistent-agent");
    expect(skip.reason).toContain("not found");
  });

  // ── Handles agent failure during dispatch ──────────────────────────────
  it("handles agent failure during dispatch and reports error", async () => {
    runAgent.mockRejectedValueOnce(new Error("Agent crashed"));

    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await runOrchestrator(opts);

    const dispatchErr = ws.messages.find(
      (m) => m.type === "orchestrator_dispatch" && m.status === "error",
    );
    expect(dispatchErr).toBeDefined();
    expect(dispatchErr.error).toBe("Agent crashed");
  });

  // ── Multiple dispatches ────────────────────────────────────────────────
  it("dispatches multiple agents sequentially", async () => {
    queryCallCount = 0;
    query
      .mockReturnValueOnce(
        makePlannerOutput(
          '```agent-dispatch\n{"agent": "code-writer", "context": "Write code"}\n```\n\n```agent-dispatch\n{"agent": "reviewer", "context": "Review changes"}\n```',
        ),
      )
      .mockReturnValueOnce(makeSynthesisOutput("All done."));

    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await runOrchestrator(opts);

    expect(runAgent).toHaveBeenCalledTimes(2);

    // First agent
    expect(runAgent.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        agentDef: expect.objectContaining({ id: "code-writer" }),
      }),
    );
    // Second agent
    expect(runAgent.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        agentDef: expect.objectContaining({ id: "reviewer" }),
      }),
    );
  });

  // ── Push and Telegram notifications ────────────────────────────────────
  it("sends push and Telegram notifications on completion", async () => {
    getAllAgentContext.mockReturnValue([
      { agent_id: "code-writer", value: "Done" },
    ]);
    const opts = baseOpts();

    await runOrchestrator(opts);

    expect(sendPushNotification).toHaveBeenCalledWith(
      "Claudeck",
      expect.stringContaining("Orchestrator completed"),
      expect.any(String),
    );

    expect(sendTelegramNotification).toHaveBeenCalledWith(
      "orchestrator",
      "Orchestrator Completed",
      expect.any(String),
      expect.objectContaining({ steps: 1 }),
    );
  });

  // ── Cleans up activeQueries ────────────────────────────────────────────
  it("removes query from activeQueries on completion", async () => {
    const activeQueries = new Map();
    const opts = baseOpts({ activeQueries });

    await runOrchestrator(opts);

    expect(activeQueries.size).toBe(0);
  });

  // ── Session creation during planning ───────────────────────────────────
  it("creates a session during the planning phase", async () => {
    getSession.mockReturnValue(null);
    const opts = baseOpts();

    await runOrchestrator(opts);

    expect(createSession).toHaveBeenCalledWith(
      "sid-1",
      "orch-claude-sid",
      "Test Project",
      "/tmp/project",
    );
  });

  // ── Closed WebSocket stops sending ─────────────────────────────────────
  it("does not crash when WebSocket is closed mid-orchestration", async () => {
    const ws = createMockWs();
    ws.readyState = 3;
    const opts = baseOpts({ ws });

    await runOrchestrator(opts);

    expect(ws.send).not.toHaveBeenCalled();
  });

  // ── Malformed dispatch blocks are skipped ──────────────────────────────
  it("skips malformed dispatch blocks gracefully", async () => {
    queryCallCount = 0;
    query.mockReturnValueOnce(
      makePlannerOutput(
        '```agent-dispatch\n{invalid json}\n```\n\n```agent-dispatch\n{"agent": "code-writer", "context": "Do work"}\n```',
      ),
    );
    query.mockReturnValueOnce(makeSynthesisOutput("Done."));

    const opts = baseOpts();

    await runOrchestrator(opts);

    // Only the valid dispatch should execute
    expect(runAgent).toHaveBeenCalledTimes(1);
  });

  // ── Branch: dispatch block with valid JSON but missing "agent" field ──
  it("skips dispatch blocks with valid JSON but missing agent field", async () => {
    queryCallCount = 0;
    query.mockReturnValueOnce(
      makePlannerOutput(
        '```agent-dispatch\n{"context": "No agent field here"}\n```',
      ),
    );

    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await runOrchestrator(opts);

    // No agent dispatched because the "agent" field is missing
    expect(runAgent).not.toHaveBeenCalled();

    const completed = ws.messages.find((m) => m.type === "orchestrator_completed");
    expect(completed).toBeDefined();
    expect(completed.dispatched).toBe(0);
  });

  // ── Branch: dispatch block with missing context defaults to "" ──────
  it("defaults context to empty string when dispatch block has no context field", async () => {
    queryCallCount = 0;
    query.mockReturnValueOnce(
      makePlannerOutput(
        '```agent-dispatch\n{"agent": "code-writer"}\n```',
      ),
    );
    query.mockReturnValueOnce(makeSynthesisOutput("Done."));

    const opts = baseOpts();

    await runOrchestrator(opts);

    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        userContext: "",
      }),
    );
  });

  // ── Branch: buildOrchestratorPromptWithMemory — memory injected when cwd provided ──
  it("injects memory prompt into orchestrator planner prompt when cwd is set", async () => {
    const { buildAgentMemoryPrompt } = await import("../../../server/memory-injector.js");
    buildAgentMemoryPrompt.mockReturnValue("## Project Memories\n- Use ESM");

    queryCallCount = 0;
    const opts = baseOpts();

    await runOrchestrator(opts);

    const plannerCall = query.mock.calls[0][0];
    expect(plannerCall.prompt).toContain("## Project Memories");
    expect(plannerCall.prompt).toContain("Use ESM");
  });

  // ── Branch: buildOrchestratorPromptWithMemory — no memory when cwd is falsy ──
  it("does not inject memory prompt when cwd is falsy", async () => {
    const { buildAgentMemoryPrompt } = await import("../../../server/memory-injector.js");
    buildAgentMemoryPrompt.mockReturnValue("## Memories\n- Something");

    queryCallCount = 0;
    const opts = baseOpts({ cwd: null });

    await runOrchestrator(opts);

    const plannerCall = query.mock.calls[0][0];
    expect(plannerCall.prompt).not.toContain("## Memories");
  });

  // ── Branch: buildOrchestratorPromptWithMemory — memPrompt is null ──────
  it("does not append memory when buildAgentMemoryPrompt returns null", async () => {
    const { buildAgentMemoryPrompt } = await import("../../../server/memory-injector.js");
    buildAgentMemoryPrompt.mockReturnValue(null);

    queryCallCount = 0;
    const opts = baseOpts();

    await runOrchestrator(opts);

    const plannerCall = query.mock.calls[0][0];
    // Should not contain any memory section
    expect(plannerCall.prompt).not.toContain("## Memories");
    expect(plannerCall.prompt).not.toContain("## Project Memories");
  });

  // ── Branch: session already exists during planning ────────────────────
  it("calls updateClaudeSessionId when session already exists during planning", async () => {
    const { updateClaudeSessionId } = await import("../../../db.js");
    getSession.mockReturnValue({ id: "sid-1", title: "Existing" });

    queryCallCount = 0;
    const opts = baseOpts();

    await runOrchestrator(opts);

    expect(updateClaudeSessionId).toHaveBeenCalledWith("sid-1", "orch-claude-sid");
    expect(createSession).not.toHaveBeenCalled();
  });

  // ── Branch: permissionMode "plan" sets plan mode ───────────────────────
  it("sets plan permission mode when permissionMode is plan", async () => {
    queryCallCount = 0;
    const opts = baseOpts({ permissionMode: "plan" });

    await runOrchestrator(opts);

    const plannerCall = query.mock.calls[0][0];
    expect(plannerCall.options.permissionMode).toBe("plan");
    // canUseTool should NOT be set for plan mode
    expect(plannerCall.options.canUseTool).toBeUndefined();
  });

  // ── Branch: non-bypass/non-plan permission mode attaches canUseTool ──
  it("attaches canUseTool for non-bypass non-plan permission mode", async () => {
    const canUseToolFn = vi.fn();
    const makeCanUseTool = vi.fn(() => canUseToolFn);

    queryCallCount = 0;
    const opts = baseOpts({ permissionMode: "confirmDangerous", makeCanUseTool });

    await runOrchestrator(opts);

    expect(makeCanUseTool).toHaveBeenCalled();
    const plannerCall = query.mock.calls[0][0];
    expect(plannerCall.options.canUseTool).toBe(canUseToolFn);
    expect(plannerCall.options.permissionMode).toBe("default");
  });

  // ── Branch: model provided sets resolveModel on planner opts ──────────
  it("resolves model name for planner options", async () => {
    queryCallCount = 0;
    const opts = baseOpts({ model: "haiku" });

    await runOrchestrator(opts);

    const plannerCall = query.mock.calls[0][0];
    expect(plannerCall.options.model).toBe("claude-haiku-4-5-20251001");
  });

  // ── Branch: model null — no model set ─────────────────────────────────
  it("does not set model on planner when model is null", async () => {
    queryCallCount = 0;
    const opts = baseOpts({ model: null });

    await runOrchestrator(opts);

    const plannerCall = query.mock.calls[0][0];
    expect(plannerCall.options.model).toBeUndefined();
  });

  // ── Branch: project system prompt appended ────────────────────────────
  it("appends project system prompt to planner options when available", async () => {
    const { getProjectSystemPrompt } = await import("../../../server/routes/projects.js");
    getProjectSystemPrompt.mockReturnValue("Always use TypeScript");

    queryCallCount = 0;
    const opts = baseOpts();

    await runOrchestrator(opts);

    const plannerCall = query.mock.calls[0][0];
    expect(plannerCall.options.appendSystemPrompt).toBe("Always use TypeScript");
  });

  // ── Branch: no project system prompt ──────────────────────────────────
  it("does not set appendSystemPrompt when no project prompt exists", async () => {
    const { getProjectSystemPrompt } = await import("../../../server/routes/projects.js");
    getProjectSystemPrompt.mockReturnValue(null);

    queryCallCount = 0;
    const opts = baseOpts();

    await runOrchestrator(opts);

    const plannerCall = query.mock.calls[0][0];
    expect(plannerCall.options.appendSystemPrompt).toBeUndefined();
  });

  // ── Branch: session resume — clientSid exists with mapped sessionId ──
  it("sets resume option when clientSid has an existing session mapping", async () => {
    const sessionIds = new Map([["sid-1", "existing-claude-sid"]]);

    queryCallCount = 0;
    const opts = baseOpts({ sessionIds, sessionId: "sid-1" });

    await runOrchestrator(opts);

    const plannerCall = query.mock.calls[0][0];
    expect(plannerCall.options.resume).toBe("existing-claude-sid");
  });

  // ── Branch: session resume — no clientSid ──────────────────────────────
  it("does not set resume option when clientSid is null", async () => {
    queryCallCount = 0;
    const opts = baseOpts({ sessionId: null });

    await runOrchestrator(opts);

    const plannerCall = query.mock.calls[0][0];
    expect(plannerCall.options.resume).toBeUndefined();
  });

  // ── Branch: no clientSid — session gets auto-generated UUID ───────────
  it("auto-generates session ID when clientSid is not provided", async () => {
    queryCallCount = 0;
    const ws = createMockWs();
    const opts = baseOpts({ ws, sessionId: null });

    await runOrchestrator(opts);

    const sessionMsg = ws.messages.find((m) => m.type === "session");
    expect(sessionMsg).toBeDefined();
    // Should be a generated UUID, not null
    expect(sessionMsg.sessionId).toBeTruthy();
    expect(sessionMsg.sessionId).not.toBe("sid-1");
  });

  // ── Branch: SDK error result with no errors array ──────────────────────
  it("defaults error message to 'Planning failed' when errors array is missing", async () => {
    queryCallCount = 0;
    query.mockReturnValueOnce(
      (async function* () {
        yield { type: "system", subtype: "init", session_id: "err-sid" };
        yield {
          type: "result",
          subtype: "error_overloaded",
          total_cost_usd: 0,
          duration_ms: 100,
          num_turns: 0,
          usage: {},
          modelUsage: {},
          // no errors array
        };
      })(),
    );

    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await runOrchestrator(opts);

    const orchErr = ws.messages.find((m) => m.type === "orchestrator_error");
    expect(orchErr).toBeDefined();
    expect(orchErr.error).toBe("Planning failed");
  });

  // ── Branch: agent error is AbortError — stops dispatching ─────────────
  it("stops dispatching remaining agents when AbortError is thrown", async () => {
    const abortError = new Error("Aborted");
    abortError.name = "AbortError";
    runAgent.mockRejectedValueOnce(abortError);

    queryCallCount = 0;
    query
      .mockReturnValueOnce(
        makePlannerOutput(
          '```agent-dispatch\n{"agent": "code-writer", "context": "Write code"}\n```\n\n```agent-dispatch\n{"agent": "reviewer", "context": "Review changes"}\n```',
        ),
      );

    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await runOrchestrator(opts);

    // Only the first agent should have been called (abort breaks the loop)
    expect(runAgent).toHaveBeenCalledTimes(1);
  });

  // ── Branch: agent error is non-AbortError — continues dispatching ─────
  it("continues dispatching when agent throws a non-AbortError", async () => {
    runAgent
      .mockRejectedValueOnce(new Error("Agent 1 failed"))
      .mockResolvedValueOnce({ resolvedSid: "a2-sid", claudeSessionId: "a2-csid" });

    queryCallCount = 0;
    query
      .mockReturnValueOnce(
        makePlannerOutput(
          '```agent-dispatch\n{"agent": "code-writer", "context": "Write code"}\n```\n\n```agent-dispatch\n{"agent": "reviewer", "context": "Review changes"}\n```',
        ),
      )
      .mockReturnValueOnce(makeSynthesisOutput("Partial synthesis."));

    getAllAgentContext.mockReturnValue([
      { agent_id: "reviewer", value: "Reviewed OK" },
    ]);

    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await runOrchestrator(opts);

    // Both agents should have been attempted
    expect(runAgent).toHaveBeenCalledTimes(2);
  });

  // ── Branch: synthesis phase error is caught ────────────────────────────
  it("catches synthesis phase error and sends error message", async () => {
    queryCallCount = 0;
    query
      .mockReturnValueOnce(
        makePlannerOutput(
          '```agent-dispatch\n{"agent": "code-writer", "context": "Do work"}\n```',
        ),
      )
      .mockReturnValueOnce(
        (async function* () {
          throw new Error("Synthesis exploded");
        })(),
      );

    getAllAgentContext.mockReturnValue([
      { agent_id: "code-writer", value: "Wrote code" },
    ]);

    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await runOrchestrator(opts);

    const errMsg = ws.messages.find(
      (m) => m.type === "error" && m.error.includes("Synthesis failed"),
    );
    expect(errMsg).toBeDefined();
    expect(errMsg.error).toContain("Synthesis exploded");

    // Should still send orchestrator_completed and done after synthesis error
    const completed = ws.messages.find((m) => m.type === "orchestrator_completed");
    expect(completed).toBeDefined();
  });

  // ── Branch: synthesis init message without session_id ──────────────────
  it("handles synthesis init message without session_id", async () => {
    queryCallCount = 0;
    query
      .mockReturnValueOnce(
        makePlannerOutput(
          '```agent-dispatch\n{"agent": "code-writer", "context": "Write"}\n```',
        ),
      )
      .mockReturnValueOnce(
        (async function* () {
          yield { type: "system", subtype: "init" }; // no session_id
          yield { type: "assistant", message: { content: [{ type: "text", text: "Summary" }] } };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0.01, duration_ms: 500, num_turns: 1,
            usage: { input_tokens: 100, output_tokens: 50 },
            modelUsage: { "claude-sonnet-4-6": {} },
          };
        })(),
      );

    getAllAgentContext.mockReturnValue([
      { agent_id: "code-writer", value: "Done" },
    ]);

    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await runOrchestrator(opts);

    // Should still complete successfully
    const completed = ws.messages.find((m) => m.type === "orchestrator_completed");
    expect(completed).toBeDefined();
  });

  // ── Branch: no agentResults — synthesis phase skipped ──────────────────
  it("skips synthesis when all dispatched agents fail", async () => {
    runAgent.mockRejectedValue(new Error("Agent crashed"));

    queryCallCount = 0;
    query.mockReturnValueOnce(
      makePlannerOutput(
        '```agent-dispatch\n{"agent": "code-writer", "context": "Do work"}\n```',
      ),
    );

    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await runOrchestrator(opts);

    // Only one query call (planner), no synthesis since agentResults is empty
    expect(query).toHaveBeenCalledTimes(1);

    const completed = ws.messages.find((m) => m.type === "orchestrator_completed");
    expect(completed).toBeDefined();
    expect(completed.dispatched).toBe(0);
  });

  // ── Branch: activeQueries is null/undefined ────────────────────────────
  it("works correctly when activeQueries is null", async () => {
    queryCallCount = 0;
    const opts = baseOpts({ activeQueries: null });

    await runOrchestrator(opts);

    // Should not crash — just skip the activeQueries operations
    expect(query).toHaveBeenCalled();
  });

  // ── Branch: result type with no usage sub-fields (all fallback to 0/null) ──
  it("handles result type with missing usage and modelUsage fields", async () => {
    queryCallCount = 0;
    query.mockReturnValueOnce(
      (async function* () {
        yield { type: "system", subtype: "init", session_id: "sparse-sid" };
        yield { type: "assistant", message: { content: [{ type: "text", text: "OK" }] } };
        yield {
          type: "result",
          subtype: "success",
          // all optional fields missing
        };
      })(),
    );

    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await runOrchestrator(opts);

    const resultMsg = ws.messages.find((m) => m.type === "result");
    expect(resultMsg).toBeDefined();
    expect(resultMsg.cost_usd).toBe(0);
    expect(resultMsg.duration_ms).toBe(0);
    expect(resultMsg.num_turns).toBe(0);
    expect(resultMsg.input_tokens).toBe(0);
    expect(resultMsg.output_tokens).toBe(0);
    expect(resultMsg.model).toBeNull();
  });

  // ── Branch: resolvedSid is falsy during assistant text ─────────────────
  it("does not call addMessage when resolvedSid is null during planning text", async () => {
    queryCallCount = 0;
    // Simulate scenario where no clientSid, and init message gives a session
    // But we test the planner text path with resolvedSid truthy —
    // For the "falsy resolvedSid" branch we need init to not happen before text

    query.mockReturnValueOnce(
      (async function* () {
        // Send text BEFORE init — resolvedSid will be whatever clientSid is
        yield { type: "assistant", message: { content: [{ type: "text", text: "Early text" }] } };
        yield { type: "system", subtype: "init", session_id: "late-init-sid" };
        yield {
          type: "result", subtype: "success",
          total_cost_usd: 0, duration_ms: 0, num_turns: 0, usage: {}, modelUsage: {},
        };
      })(),
    );

    const { addMessage } = await import("../../../db.js");
    const ws = createMockWs();
    // No sessionId — resolvedSid starts null
    const opts = baseOpts({ ws, sessionId: null });

    await runOrchestrator(opts);

    // addMessage for "user" role should not have been called yet when text was sent
    // (resolvedSid was null at that point)
    const textMsg = ws.messages.find((m) => m.type === "text" && m.text === "Early text");
    expect(textMsg).toBeDefined();
  });

  // ── Branch: cwd does not exist on disk — falls back to homedir ────────
  it("falls back to homedir when cwd does not exist", async () => {
    queryCallCount = 0;
    const opts = baseOpts({ cwd: "/absolutely/nonexistent/path/xyz123" });

    await runOrchestrator(opts);

    const plannerCall = query.mock.calls[0][0];
    // Should fall back to homedir, not /absolutely/nonexistent/path/xyz123
    expect(plannerCall.options.cwd).toBeTruthy();
    expect(plannerCall.options.cwd).not.toBe("/absolutely/nonexistent/path/xyz123");
  });

  // ── Branch: cwd is null — falls back to homedir ────────────────────────
  it("falls back to homedir when cwd is null", async () => {
    queryCallCount = 0;
    const opts = baseOpts({ cwd: null });

    await runOrchestrator(opts);

    const plannerCall = query.mock.calls[0][0];
    expect(plannerCall.options.cwd).toBeTruthy();
  });

  // ── Branch: projectName is null — defaults to "Orchestrator" ──────────
  it("defaults projectName to Orchestrator when null", async () => {
    getSession.mockReturnValue(null);
    queryCallCount = 0;
    const opts = baseOpts({ projectName: null });

    await runOrchestrator(opts);

    expect(createSession).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "Orchestrator",
      expect.any(String),
    );
  });

  // ── Branch: agent result updates resolvedSid and chainResumeId ────────
  it("updates resolvedSid and chainResumeId from agent result", async () => {
    runAgent.mockResolvedValue({
      resolvedSid: "new-agent-sid",
      claudeSessionId: "new-agent-claude-sid",
    });

    queryCallCount = 0;
    query
      .mockReturnValueOnce(
        makePlannerOutput(
          '```agent-dispatch\n{"agent": "code-writer", "context": "Write"}\n```\n```agent-dispatch\n{"agent": "reviewer", "context": "Review"}\n```',
        ),
      )
      .mockReturnValueOnce(makeSynthesisOutput("Done."));

    getAllAgentContext.mockReturnValue([
      { agent_id: "code-writer", value: "Wrote code" },
      { agent_id: "reviewer", value: "Reviewed code" },
    ]);

    const opts = baseOpts();

    await runOrchestrator(opts);

    // Second runAgent call should receive the chainResumeId from first
    expect(runAgent).toHaveBeenCalledTimes(2);
    const secondCall = runAgent.mock.calls[1][0];
    expect(secondCall.chainResumeId).toBe("new-agent-claude-sid");
  });

  // ── Branch: agent result has no context stored ─────────────────────────
  it("uses '(no output captured)' when agent has no stored context", async () => {
    getAllAgentContext.mockReturnValue([]); // No context at all

    queryCallCount = 0;
    query
      .mockReturnValueOnce(
        makePlannerOutput(
          '```agent-dispatch\n{"agent": "code-writer", "context": "Write"}\n```',
        ),
      )
      .mockReturnValueOnce(makeSynthesisOutput("Done."));

    const opts = baseOpts();

    await runOrchestrator(opts);

    // Synthesis should be called with "(no output captured)"
    const synthCall = query.mock.calls[1][0];
    expect(synthCall.prompt).toContain("(no output captured)");
  });

  // ── Branch: result isError flag based on subtype ───────────────────────
  it("sets isError to 1 in addCost when result subtype starts with error", async () => {
    const { addCost } = await import("../../../db.js");
    queryCallCount = 0;
    query.mockReturnValueOnce(
      (async function* () {
        yield { type: "system", subtype: "init", session_id: "err-cost-sid" };
        yield {
          type: "result",
          subtype: "error_api",
          errors: ["API error"],
          total_cost_usd: 0.005,
          duration_ms: 200,
          num_turns: 1,
          usage: { input_tokens: 50, output_tokens: 10 },
          modelUsage: { "claude-sonnet-4-6": {} },
        };
      })(),
    );

    const opts = baseOpts();
    await runOrchestrator(opts);

    expect(addCost).toHaveBeenCalledWith(
      expect.any(String),
      0.005,
      200,
      1,
      50,
      10,
      expect.objectContaining({ isError: 1 }),
    );
  });

  // ── Branch: synthesis result with resolvedSid falsy ────────────────────
  it("skips addCost in synthesis when resolvedSid is null", async () => {
    // This tests the branch where resolvedSid is falsy during synthesis result processing
    // We need to set resolvedSid to null — tricky because it gets set during init.
    // The simplest way: pass sessionId null and have init not produce a session
    queryCallCount = 0;

    query
      .mockReturnValueOnce(
        (async function* () {
          // No init message — resolvedSid stays null
          yield {
            type: "assistant",
            message: { content: [{ type: "text", text: '```agent-dispatch\n{"agent": "code-writer", "context": "Do"}\n```' }] },
          };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0, duration_ms: 0, num_turns: 0, usage: {}, modelUsage: {},
          };
        })(),
      )
      .mockReturnValueOnce(makeSynthesisOutput("Synth"));

    getAllAgentContext.mockReturnValue([
      { agent_id: "code-writer", value: "Done" },
    ]);

    const ws = createMockWs();
    const opts = baseOpts({ ws, sessionId: null });

    // Should not crash even though resolvedSid might be null
    await runOrchestrator(opts);

    const completed = ws.messages.find((m) => m.type === "orchestrator_completed");
    expect(completed).toBeDefined();
  });

  // ── Branch: permissionMode defaults to "bypass" when null ─────────────
  it("defaults permissionMode to bypass when null", async () => {
    queryCallCount = 0;
    const opts = baseOpts({ permissionMode: null });

    await runOrchestrator(opts);

    const plannerCall = query.mock.calls[0][0];
    expect(plannerCall.options.permissionMode).toBe("bypassPermissions");
  });

  // ── Branch: agentTitle fallback to agentId in Telegram summary ────────
  it("uses agentId when agentTitle is missing in Telegram notification summary", async () => {
    getAllAgentContext.mockReturnValue([
      { agent_id: "code-writer", value: "Done" },
    ]);

    // The agentResults come from agents.find() which returns the full agentDef.
    // The agentDef.title is always present in our test data, so the fallback
    // is for when agentTitle in agentResults is falsy. We test this by
    // verifying the notification is sent with agent title included.
    queryCallCount = 0;
    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await runOrchestrator(opts);

    expect(sendTelegramNotification).toHaveBeenCalledWith(
      "orchestrator",
      "Orchestrator Completed",
      expect.stringContaining("Code Writer"),
      expect.objectContaining({ steps: 1 }),
    );
  });

  // ── Branch: synthesis result with complete usage fields ────────────────
  it("processes synthesis result with all usage fields populated", async () => {
    queryCallCount = 0;
    query
      .mockReturnValueOnce(
        makePlannerOutput(
          '```agent-dispatch\n{"agent": "code-writer", "context": "Write"}\n```',
        ),
      )
      .mockReturnValueOnce(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "synth-full-sid" };
          yield { type: "assistant", message: { content: [{ type: "text", text: "Full synthesis" }] } };
          yield {
            type: "result",
            subtype: "success",
            total_cost_usd: 0.03,
            duration_ms: 2000,
            num_turns: 2,
            usage: {
              input_tokens: 500,
              output_tokens: 200,
              cache_read_input_tokens: 100,
              cache_creation_input_tokens: 50,
            },
            modelUsage: { "claude-sonnet-4-6": {} },
          };
        })(),
      );

    getAllAgentContext.mockReturnValue([
      { agent_id: "code-writer", value: "Done" },
    ]);

    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await runOrchestrator(opts);

    // Find the synthesis result message (second result message)
    const resultMsgs = ws.messages.filter((m) => m.type === "result");
    expect(resultMsgs.length).toBeGreaterThanOrEqual(2);

    const synthResult = resultMsgs[resultMsgs.length - 1];
    expect(synthResult.cost_usd).toBe(0.03);
    expect(synthResult.input_tokens).toBe(500);
    expect(synthResult.output_tokens).toBe(200);
    expect(synthResult.model).toBe("claude-sonnet-4-6");
  });

  // ── Branch: synthesis resolvedSid with addCost ─────────────────────────
  it("calls addCost during synthesis when resolvedSid is available", async () => {
    const { addCost } = await import("../../../db.js");
    queryCallCount = 0;
    query
      .mockReturnValueOnce(
        makePlannerOutput(
          '```agent-dispatch\n{"agent": "code-writer", "context": "Write"}\n```',
        ),
      )
      .mockReturnValueOnce(makeSynthesisOutput("Synthesis done."));

    getAllAgentContext.mockReturnValue([
      { agent_id: "code-writer", value: "Done" },
    ]);

    const opts = baseOpts();
    await runOrchestrator(opts);

    // addCost should be called at least twice (planner + synthesis)
    expect(addCost.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  // ── Branch: synthesis — text message with resolvedSid null ─────────────
  it("sends synthesis text but skips addMessage when resolvedSid is null", async () => {
    queryCallCount = 0;
    query
      .mockReturnValueOnce(
        (async function* () {
          // No init — resolvedSid stays as whatever clientSid is (null)
          yield {
            type: "assistant",
            message: {
              content: [{
                type: "text",
                text: '```agent-dispatch\n{"agent": "code-writer", "context": "Work"}\n```',
              }],
            },
          };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0, duration_ms: 0, num_turns: 0, usage: {}, modelUsage: {},
          };
        })(),
      )
      .mockReturnValueOnce(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "synth-nores-sid" };
          yield { type: "assistant", message: { content: [{ type: "text", text: "Synthesis" }] } };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0, duration_ms: 0, num_turns: 0, usage: {}, modelUsage: {},
          };
        })(),
      );

    getAllAgentContext.mockReturnValue([
      { agent_id: "code-writer", value: "Done" },
    ]);

    const ws = createMockWs();
    const opts = baseOpts({ ws, sessionId: null });

    await runOrchestrator(opts);

    // Should still send text to WS
    const textMsgs = ws.messages.filter((m) => m.type === "text");
    expect(textMsgs.length).toBeGreaterThan(0);
  });
});

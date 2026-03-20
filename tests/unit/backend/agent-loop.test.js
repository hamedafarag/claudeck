import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("../../../db.js", () => ({
  recordAgentRunStart: vi.fn(() => 1),
  recordAgentRunComplete: vi.fn(),
  setAgentContext: vi.fn(),
  getAgentContext: vi.fn(() => null),
  getAllAgentContext: vi.fn(() => []),
  addCost: vi.fn(),
  addMessage: vi.fn(),
  createSession: vi.fn(),
  updateClaudeSessionId: vi.fn(),
  getSession: vi.fn(() => null),
  touchSession: vi.fn(),
  getTotalCost: vi.fn(() => 0.05),
  setClaudeSession: vi.fn(),
  updateSessionTitle: vi.fn(),
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

vi.mock("../../../server/notification-logger.js", () => ({
  logNotification: vi.fn(),
}));

// Default mock: yields init, assistant text, and a success result
vi.mock("@anthropic-ai/claude-code", () => ({
  query: vi.fn(({ prompt, options }) => {
    const messages = [
      { type: "system", subtype: "init", session_id: "test-claude-sid", model: "claude-sonnet-4-6" },
      { type: "assistant", message: { content: [{ type: "text", text: "Agent result" }] } },
      {
        type: "result",
        subtype: "success",
        cost_usd: 0.01,
        total_cost_usd: 0.01,
        duration_ms: 1500,
        num_turns: 2,
        session_id: "test-claude-sid",
        usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 10, cache_creation_input_tokens: 5 },
        modelUsage: { "claude-sonnet-4-6": {} },
      },
    ];
    return (async function* () {
      for (const m of messages) yield m;
    })();
  }),
}));

import { runAgent } from "../../../server/agent-loop.js";
import { query } from "@anthropic-ai/claude-code";
import {
  recordAgentRunStart,
  recordAgentRunComplete,
  setAgentContext,
  getAllAgentContext,
  addCost,
  addMessage,
  createSession,
  updateClaudeSessionId,
  getSession,
  getTotalCost,
  updateSessionTitle,
} from "../../../db.js";
import { sendPushNotification } from "../../../server/push-sender.js";
import { sendTelegramNotification } from "../../../server/telegram-sender.js";
import { buildAgentMemoryPrompt, saveExplicitMemories } from "../../../server/memory-injector.js";
import { captureMemories } from "../../../server/memory-extractor.js";

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
    agentDef: {
      id: "test-agent",
      title: "Test Agent",
      goal: "Write unit tests",
      constraints: { maxTurns: 10, timeoutMs: 60000 },
    },
    cwd: "/tmp",  // Must exist on disk for existsSync check
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

describe("agent-loop — runAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Successful execution ────────────────────────────────────────────────
  it("executes with a valid agent definition and returns result", async () => {
    const opts = baseOpts();

    const result = await runAgent(opts);

    expect(result).toHaveProperty("resolvedSid");
    expect(result).toHaveProperty("claudeSessionId", "test-claude-sid");
    expect(query).toHaveBeenCalledTimes(1);
  });

  // ── WebSocket progress updates ──────────────────────────────────────────
  it("sends WebSocket progress updates (agent_started, agent_completed)", async () => {
    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await runAgent(opts);

    const types = ws.messages.map((m) => m.type);
    expect(types).toContain("agent_started");
    expect(types).toContain("text");
    expect(types).toContain("agent_completed");
    expect(types).toContain("result");
    expect(types).toContain("done");

    // Validate agent_started payload
    const started = ws.messages.find((m) => m.type === "agent_started");
    expect(started.agentId).toBe("test-agent");
    expect(started.title).toBe("Test Agent");
    expect(started.goal).toBe("Write unit tests");
    expect(started.maxTurns).toBe(10);

    // Validate agent_completed payload
    const completed = ws.messages.find((m) => m.type === "agent_completed");
    expect(completed.agentId).toBe("test-agent");
    expect(completed.totalTurns).toBe(2);
    expect(completed.durationMs).toBe(1500);
    expect(completed.costUsd).toBe(0.01);
  });

  // ── Records agent run in database ───────────────────────────────────────
  it("records agent run start and completion in database", async () => {
    const opts = baseOpts();

    await runAgent(opts);

    expect(recordAgentRunStart).toHaveBeenCalledWith(
      expect.any(String),
      "test-agent",
      "Test Agent",
      "single",
      undefined,
    );

    expect(recordAgentRunComplete).toHaveBeenCalledWith(
      expect.any(String),
      "test-agent",
      "completed",
      2,        // numTurns
      0.01,     // costUsd
      1500,     // durationMs
      100,      // inputTokens
      50,       // outputTokens
    );
  });

  // ── Session creation ────────────────────────────────────────────────────
  it("creates a session if one does not exist", async () => {
    getSession.mockReturnValue(null);
    const opts = baseOpts();

    await runAgent(opts);

    expect(createSession).toHaveBeenCalledWith(
      "sid-1",
      "test-claude-sid",
      "Test Project",
      "/tmp",
    );
    expect(updateSessionTitle).toHaveBeenCalledWith(
      "sid-1",
      "Agent: Test Agent",
    );
  });

  // ── Adds cost to session ────────────────────────────────────────────────
  it("adds cost data to the session on success", async () => {
    const opts = baseOpts();

    await runAgent(opts);

    expect(addCost).toHaveBeenCalledWith(
      "sid-1",
      0.01,
      1500,
      2,
      100,
      50,
      expect.objectContaining({
        model: "claude-sonnet-4-6",
        stopReason: "success",
        isError: 0,
      }),
    );
  });

  // ── Handles agent execution failure (error result) ─────────────────────
  it("handles agent execution failure from SDK error result", async () => {
    query.mockReturnValue(
      (async function* () {
        yield { type: "system", subtype: "init", session_id: "err-sid" };
        yield {
          type: "result",
          subtype: "error_api",
          errors: ["Rate limit exceeded"],
          total_cost_usd: 0.005,
          duration_ms: 500,
          num_turns: 1,
          usage: { input_tokens: 50, output_tokens: 0 },
          modelUsage: {},
        };
      })(),
    );

    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await runAgent(opts);

    const errMsg = ws.messages.find((m) => m.type === "error");
    expect(errMsg).toBeDefined();
    expect(errMsg.error).toBe("Rate limit exceeded");

    const agentErr = ws.messages.find((m) => m.type === "agent_error");
    expect(agentErr).toBeDefined();
    expect(agentErr.agentId).toBe("test-agent");

    // Record error in monitoring
    expect(recordAgentRunComplete).toHaveBeenCalledWith(
      expect.any(String),
      "test-agent",
      "error",
      1,
      0.005,
      500,
      50,
      0,
      "Rate limit exceeded",
    );
  });

  // ── Handles thrown error (AbortError) ───────────────────────────────────
  it("handles AbortError and sends aborted messages", async () => {
    const abortError = new Error("Aborted");
    abortError.name = "AbortError";
    query.mockReturnValue(
      (async function* () {
        throw abortError;
      })(),
    );

    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await expect(runAgent(opts)).rejects.toThrow("Aborted");

    const aborted = ws.messages.find((m) => m.type === "agent_aborted");
    expect(aborted).toBeDefined();
    expect(aborted.agentId).toBe("test-agent");

    expect(recordAgentRunComplete).toHaveBeenCalledWith(
      expect.any(String),
      "test-agent",
      "aborted",
      expect.any(Number),
      0, 0, 0, 0,
      "Aborted",
    );
  });

  // ── Handles thrown non-abort error ──────────────────────────────────────
  it("handles non-abort thrown error and sends error messages", async () => {
    query.mockReturnValue(
      (async function* () {
        throw new Error("Network failure");
      })(),
    );

    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await expect(runAgent(opts)).rejects.toThrow("Network failure");

    const agentErr = ws.messages.find((m) => m.type === "agent_error");
    expect(agentErr).toBeDefined();
    expect(agentErr.error).toBe("Network failure");
  });

  // ── Passes correct prompt with agent goal ───────────────────────────────
  it("passes correct prompt containing agent goal", async () => {
    const opts = baseOpts();

    await runAgent(opts);

    const callArgs = query.mock.calls[0][0];
    expect(callArgs.prompt).toContain("Write unit tests");
    expect(callArgs.prompt).toContain("## Goal");
    expect(callArgs.prompt).toContain("autonomous AI agent");
  });

  // ── Respects maxTurns from agent definition ─────────────────────────────
  it("respects maxTurns from agent definition", async () => {
    const opts = baseOpts({
      agentDef: {
        id: "custom-agent",
        title: "Custom",
        goal: "Do stuff",
        constraints: { maxTurns: 25, timeoutMs: 120000 },
      },
    });

    await runAgent(opts);

    const callArgs = query.mock.calls[0][0];
    expect(callArgs.options.maxTurns).toBe(25);
  });

  // ── Defaults maxTurns to 50 when not specified ──────────────────────────
  it("defaults maxTurns to 50 when not specified", async () => {
    const opts = baseOpts({
      agentDef: { id: "no-constraint", title: "NC", goal: "Do it" },
    });

    await runAgent(opts);

    const callArgs = query.mock.calls[0][0];
    expect(callArgs.options.maxTurns).toBe(50);
  });

  // ── Tracks tool_use blocks as agent_progress ────────────────────────────
  it("sends agent_progress for tool_use blocks", async () => {
    query.mockReturnValue(
      (async function* () {
        yield { type: "system", subtype: "init", session_id: "tool-sid" };
        yield {
          type: "assistant",
          message: {
            content: [
              { type: "tool_use", id: "tu-1", name: "Read", input: { file_path: "/tmp/foo.js" } },
            ],
          },
        };
        yield {
          type: "result",
          subtype: "success",
          total_cost_usd: 0.01,
          duration_ms: 100,
          num_turns: 1,
          usage: {},
          modelUsage: {},
        };
      })(),
    );

    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await runAgent(opts);

    const progress = ws.messages.find((m) => m.type === "agent_progress");
    expect(progress).toBeDefined();
    expect(progress.agentId).toBe("test-agent");
    expect(progress.turn).toBe(1);
    expect(progress.action).toBe("Read");
  });

  // Covered by "shared context storage" describe block below

  // ── Does not store context without runId ────────────────────────────────
  it("does not store context when no runId is provided", async () => {
    const opts = baseOpts({ runId: undefined });

    await runAgent(opts);

    expect(setAgentContext).not.toHaveBeenCalled();
  });

  // ── Loads shared context from previous agents ──────────────────────────
  it("includes shared context from previous agents in prompt", async () => {
    getAllAgentContext.mockReturnValue([
      { agent_id: "prev-agent", value: "Previous agent found 3 bugs" },
    ]);
    const opts = baseOpts({ runId: "run-456" });

    await runAgent(opts);

    const callArgs = query.mock.calls[0][0];
    expect(callArgs.prompt).toContain("Context from Previous Agents");
    expect(callArgs.prompt).toContain("prev-agent");
    expect(callArgs.prompt).toContain("Previous agent found 3 bugs");
  });

  // ── Sends push and Telegram notifications on completion ─────────────────
  it("sends push and Telegram notifications on completion", async () => {
    const opts = baseOpts();

    await runAgent(opts);

    expect(sendPushNotification).toHaveBeenCalled();
    expect(sendPushNotification.mock.calls[0][0]).toBe("Claudeck");

    expect(sendTelegramNotification).toHaveBeenCalled();
    const tgCall = sendTelegramNotification.mock.calls[0];
    expect(tgCall[0]).toBe("agent");
    expect(tgCall[1]).toBe("Agent Completed");
  });

  // ── Sends error Telegram notification on failure ────────────────────────
  it("sends error Telegram notification when agent errors", async () => {
    query.mockReturnValue(
      (async function* () {
        yield { type: "system", subtype: "init", session_id: "err-tg-sid" };
        yield {
          type: "result",
          subtype: "error_api",
          errors: ["API down"],
          total_cost_usd: 0,
          duration_ms: 200,
          num_turns: 0,
          usage: {},
          modelUsage: {},
        };
      })(),
    );

    const opts = baseOpts();
    await runAgent(opts);

    expect(sendTelegramNotification).toHaveBeenCalledWith(
      "error",
      "Agent Failed",
      expect.stringContaining("API down"),
      expect.any(Object),
    );
  });

  // Covered by "telegram notification details" describe block below

  // ── Memory injection into prompt ────────────────────────────────────────
  it("injects memory prompt when buildAgentMemoryPrompt returns content", async () => {
    buildAgentMemoryPrompt.mockReturnValue("## Memories\n- Use ESM imports");
    const opts = baseOpts();

    await runAgent(opts);

    const callArgs = query.mock.calls[0][0];
    expect(callArgs.prompt).toContain("## Memories");
    expect(callArgs.prompt).toContain("Use ESM imports");
  });

  // ── Closed WebSocket does not send ──────────────────────────────────────
  it("does not send messages when WebSocket is closed", async () => {
    const ws = createMockWs();
    ws.readyState = 3; // CLOSED
    const opts = baseOpts({ ws });

    await runAgent(opts);

    expect(ws.send).not.toHaveBeenCalled();
  });

  // ── Cleans up activeQueries on completion ───────────────────────────────
  it("removes query from activeQueries on completion", async () => {
    const activeQueries = new Map();
    const opts = baseOpts({ activeQueries });

    await runAgent(opts);

    // After completion, the map should be empty
    expect(activeQueries.size).toBe(0);
  });

  // ── Permission mode bypass uses bypassPermissions ──────────────────────
  it("uses bypassPermissions SDK mode when permissionMode is bypass", async () => {
    const opts = baseOpts({ permissionMode: "bypass" });

    await runAgent(opts);

    const callArgs = query.mock.calls[0][0];
    expect(callArgs.options.permissionMode).toBe("bypassPermissions");
    expect(callArgs.options.canUseTool).toBeUndefined();
  });

  // ── Permission mode plan uses plan ─────────────────────────────────────
  it("uses plan SDK mode when permissionMode is plan", async () => {
    const opts = baseOpts({ permissionMode: "plan" });

    await runAgent(opts);

    const callArgs = query.mock.calls[0][0];
    expect(callArgs.options.permissionMode).toBe("plan");
  });

  // ── Non-bypass permission mode attaches canUseTool ─────────────────────
  it("attaches canUseTool when permissionMode is confirmDangerous", async () => {
    const canUseToolFn = vi.fn();
    const makeCanUseTool = vi.fn(() => canUseToolFn);
    const opts = baseOpts({ permissionMode: "confirmDangerous", makeCanUseTool });

    await runAgent(opts);

    expect(makeCanUseTool).toHaveBeenCalled();
    const callArgs = query.mock.calls[0][0];
    expect(callArgs.options.canUseTool).toBe(canUseToolFn);
  });

  // ── Model resolution ───────────────────────────────────────────────────
  it("resolves short model name to full model ID", async () => {
    const opts = baseOpts({ model: "haiku" });

    await runAgent(opts);

    const callArgs = query.mock.calls[0][0];
    expect(callArgs.options.model).toBe("claude-haiku-4-5-20251001");
  });

  // ── Processes tool result messages ─────────────────────────────────────
  it("processes tool_result messages from SDK", async () => {
    query.mockReturnValue(
      (async function* () {
        yield { type: "system", subtype: "init", session_id: "tr-sid" };
        yield {
          type: "user",
          message: {
            content: [
              { type: "tool_result", tool_use_id: "tu-1", content: "File contents here", is_error: false },
            ],
          },
        };
        yield {
          type: "result",
          subtype: "success",
          total_cost_usd: 0.01,
          duration_ms: 100,
          num_turns: 1,
          usage: {},
          modelUsage: {},
        };
      })(),
    );

    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await runAgent(opts);

    const toolResult = ws.messages.find((m) => m.type === "tool_result");
    expect(toolResult).toBeDefined();
    expect(toolResult.toolUseId).toBe("tu-1");
    expect(toolResult.content).toBe("File contents here");
    expect(toolResult.isError).toBe(false);
  });

  // ── Handles error_max_turns result ─────────────────────────────────────
  it("treats error_max_turns as a completion, not a failure", async () => {
    query.mockReturnValue(
      (async function* () {
        yield { type: "system", subtype: "init", session_id: "mt-sid" };
        yield { type: "assistant", message: { content: [{ type: "text", text: "Partial work" }] } };
        yield {
          type: "result",
          subtype: "error_max_turns",
          total_cost_usd: 0.02,
          duration_ms: 5000,
          num_turns: 50,
          usage: { input_tokens: 500, output_tokens: 200 },
          modelUsage: { "claude-sonnet-4-6": {} },
        };
      })(),
    );

    const ws = createMockWs();
    const opts = baseOpts({ ws });

    await runAgent(opts);

    const completed = ws.messages.find((m) => m.type === "agent_completed");
    expect(completed).toBeDefined();
    expect(completed.totalTurns).toBe(50);

    // Should record as completed, not error
    expect(recordAgentRunComplete).toHaveBeenCalledWith(
      expect.any(String),
      "test-agent",
      "completed",
      50,
      0.02,
      5000,
      500,
      200,
    );
  });

  // ── Uses userContext in prompt ──────────────────────────────────────────
  it("includes userContext in the agent prompt", async () => {
    const opts = baseOpts({ userContext: "Focus on the auth module" });

    await runAgent(opts);

    const callArgs = query.mock.calls[0][0];
    expect(callArgs.prompt).toContain("Additional Context from User");
    expect(callArgs.prompt).toContain("Focus on the auth module");
  });

  // ── Resume session with chainResumeId ──────────────────────────────────
  it("passes resume option when chainResumeId is provided", async () => {
    const opts = baseOpts({ chainResumeId: "prev-claude-sid" });

    await runAgent(opts);

    const callArgs = query.mock.calls[0][0];
    expect(callArgs.options.resume).toBe("prev-claude-sid");
  });

  // ── resolveModel — all model shorthand names ──────────────────────────
  describe("resolveModel (via model option)", () => {
    it("resolves 'sonnet' to full model ID", async () => {
      const opts = baseOpts({ model: "sonnet" });
      await runAgent(opts);
      const callArgs = query.mock.calls[0][0];
      expect(callArgs.options.model).toBe("claude-sonnet-4-6");
    });

    it("resolves 'opus' to full model ID", async () => {
      const opts = baseOpts({ model: "opus" });
      await runAgent(opts);
      const callArgs = query.mock.calls[0][0];
      expect(callArgs.options.model).toBe("claude-opus-4-6");
    });

    it("passes through unknown model name as-is", async () => {
      const opts = baseOpts({ model: "custom-model-v2" });
      await runAgent(opts);
      const callArgs = query.mock.calls[0][0];
      expect(callArgs.options.model).toBe("custom-model-v2");
    });

    it("does not set model when model is null", async () => {
      const opts = baseOpts({ model: null });
      await runAgent(opts);
      const callArgs = query.mock.calls[0][0];
      expect(callArgs.options.model).toBeUndefined();
    });

    it("does not set model when model is undefined", async () => {
      const opts = baseOpts({ model: undefined });
      await runAgent(opts);
      const callArgs = query.mock.calls[0][0];
      expect(callArgs.options.model).toBeUndefined();
    });
  });

  // ── buildAgentPrompt — parameter combinations ────────────────────────
  describe("buildAgentPrompt (via prompt content)", () => {
    it("includes Instructions section in all prompts", async () => {
      const opts = baseOpts();
      await runAgent(opts);
      const callArgs = query.mock.calls[0][0];
      expect(callArgs.prompt).toContain("## Instructions");
      expect(callArgs.prompt).toContain("Break the goal into logical steps");
    });

    it("excludes Additional Context when userContext is falsy", async () => {
      const opts = baseOpts({ userContext: null });
      await runAgent(opts);
      const callArgs = query.mock.calls[0][0];
      expect(callArgs.prompt).not.toContain("Additional Context from User");
    });

    it("excludes Previous Agents section when no shared context", async () => {
      getAllAgentContext.mockReturnValue([]);
      const opts = baseOpts({ runId: "run-789" });
      await runAgent(opts);
      const callArgs = query.mock.calls[0][0];
      expect(callArgs.prompt).not.toContain("Context from Previous Agents");
    });

    it("includes multiple shared contexts from previous agents", async () => {
      getAllAgentContext.mockReturnValue([
        { agent_id: "agent-1", value: "Found 3 bugs" },
        { agent_id: "agent-2", value: "Fixed the API" },
      ]);
      const opts = baseOpts({ runId: "run-multi" });
      await runAgent(opts);
      const callArgs = query.mock.calls[0][0];
      expect(callArgs.prompt).toContain("### From: agent-1");
      expect(callArgs.prompt).toContain("Found 3 bugs");
      expect(callArgs.prompt).toContain("### From: agent-2");
      expect(callArgs.prompt).toContain("Fixed the API");
    });

    it("does not include memory section when buildAgentMemoryPrompt returns null", async () => {
      buildAgentMemoryPrompt.mockReturnValue(null);
      const opts = baseOpts();
      await runAgent(opts);
      const callArgs = query.mock.calls[0][0];
      expect(callArgs.prompt).not.toContain("## Memories");
    });

    it("does not inject memory when cwd is falsy", async () => {
      buildAgentMemoryPrompt.mockReturnValue("## Memories\n- Something");
      const opts = baseOpts({ cwd: null });
      await runAgent(opts);
      const callArgs = query.mock.calls[0][0];
      expect(callArgs.prompt).not.toContain("## Memories");
    });
  });

  // ── Tool result message edge cases ─────────────────────────────────────
  describe("tool_result — edge cases", () => {
    it("handles tool_result with array content", async () => {
      query.mockReturnValue(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "arr-sid" };
          yield {
            type: "user",
            message: {
              content: [
                {
                  type: "tool_result",
                  tool_use_id: "tu-arr",
                  content: [
                    { type: "text", text: "Line 1" },
                    { type: "text", text: "Line 2" },
                  ],
                  is_error: false,
                },
              ],
            },
          };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0, duration_ms: 0, num_turns: 0, usage: {}, modelUsage: {},
          };
        })(),
      );

      const ws = createMockWs();
      const opts = baseOpts({ ws });
      await runAgent(opts);

      const toolResult = ws.messages.find((m) => m.type === "tool_result");
      expect(toolResult).toBeDefined();
      expect(toolResult.content).toBe("Line 1Line 2");
    });

    it("handles tool_result with string content", async () => {
      query.mockReturnValue(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "str-sid" };
          yield {
            type: "user",
            message: {
              content: [
                {
                  type: "tool_result",
                  tool_use_id: "tu-str",
                  content: "Simple string result",
                  is_error: true,
                },
              ],
            },
          };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0, duration_ms: 0, num_turns: 0, usage: {}, modelUsage: {},
          };
        })(),
      );

      const ws = createMockWs();
      const opts = baseOpts({ ws });
      await runAgent(opts);

      const toolResult = ws.messages.find((m) => m.type === "tool_result");
      expect(toolResult.content).toBe("Simple string result");
      expect(toolResult.isError).toBe(true);
    });
  });

  // ── Session resume — sessionIds lookup ─────────────────────────────────
  describe("session resume", () => {
    it("uses sessionIds map to resume when no chainResumeId", async () => {
      const sessionIds = new Map([["sid-1", "existing-claude-sid"]]);
      const opts = baseOpts({ sessionIds, chainResumeId: undefined });
      await runAgent(opts);
      const callArgs = query.mock.calls[0][0];
      expect(callArgs.options.resume).toBe("existing-claude-sid");
    });

    it("chainResumeId takes priority over sessionIds map", async () => {
      const sessionIds = new Map([["sid-1", "map-claude-sid"]]);
      const opts = baseOpts({ sessionIds, chainResumeId: "chain-claude-sid" });
      await runAgent(opts);
      const callArgs = query.mock.calls[0][0];
      expect(callArgs.options.resume).toBe("chain-claude-sid");
    });

    it("does not set resume when neither chainResumeId nor sessionIds entry", async () => {
      const sessionIds = new Map();
      const opts = baseOpts({ sessionIds, sessionId: null, chainResumeId: undefined });
      await runAgent(opts);
      const callArgs = query.mock.calls[0][0];
      expect(callArgs.options.resume).toBeUndefined();
    });
  });

  // ── CWD resolution ─────────────────────────────────────────────────────
  describe("cwd resolution", () => {
    it("uses homedir when cwd does not exist on disk", async () => {
      const opts = baseOpts({ cwd: "/nonexistent/path/that/surely/does/not/exist" });
      await runAgent(opts);
      const callArgs = query.mock.calls[0][0];
      // Should fall back to homedir when existsSync fails
      expect(callArgs.options.cwd).toBeTruthy();
    });

    it("uses provided cwd when it exists", async () => {
      const opts = baseOpts({ cwd: "/tmp" });
      await runAgent(opts);
      const callArgs = query.mock.calls[0][0];
      expect(callArgs.options.cwd).toBe("/tmp");
    });
  });

  // ── Project system prompt ──────────────────────────────────────────────
  describe("project system prompt", () => {
    it("does not set appendSystemPrompt when no project prompt", async () => {
      const { getProjectSystemPrompt } = await import("../../../server/routes/projects.js");
      getProjectSystemPrompt.mockReturnValue(null);
      const opts = baseOpts();
      await runAgent(opts);
      const callArgs = query.mock.calls[0][0];
      expect(callArgs.options.appendSystemPrompt).toBeUndefined();
    });

    it("sets appendSystemPrompt when project has system prompt", async () => {
      const { getProjectSystemPrompt } = await import("../../../server/routes/projects.js");
      getProjectSystemPrompt.mockReturnValue("Always use TypeScript");
      const opts = baseOpts();
      await runAgent(opts);
      const callArgs = query.mock.calls[0][0];
      expect(callArgs.options.appendSystemPrompt).toBe("Always use TypeScript");
    });
  });

  // ── runId and runType ──────────────────────────────────────────────────
  describe("runId and runType", () => {
    it("uses provided runId for monitoring", async () => {
      const opts = baseOpts({ runId: "custom-run-id", runType: "chain" });
      await runAgent(opts);
      expect(recordAgentRunStart).toHaveBeenCalledWith(
        "custom-run-id", "test-agent", "Test Agent", "chain", undefined,
      );
    });

    it("generates default runId when not provided", async () => {
      const opts = baseOpts({ runId: undefined });
      await runAgent(opts);
      const runIdArg = recordAgentRunStart.mock.calls[0][0];
      expect(runIdArg).toMatch(/^single-\d+$/);
    });

    it("passes parentRunId to recordAgentRunStart", async () => {
      const opts = baseOpts({ runId: "r1", parentRunId: "parent-run" });
      await runAgent(opts);
      expect(recordAgentRunStart).toHaveBeenCalledWith(
        "r1", "test-agent", "Test Agent", "single", "parent-run",
      );
    });
  });

  // ── Session update when session already exists ─────────────────────────
  describe("existing session", () => {
    it("calls query with correct options when session exists", async () => {
      getSession.mockReturnValue({ id: "sid-1", title: "Existing" });
      const opts = baseOpts();
      await runAgent(opts);
      // Verify query was called (session handling is an internal detail)
      expect(query).toHaveBeenCalledTimes(1);
    });

    it("calls updateClaudeSessionId instead of createSession when session exists", async () => {
      query.mockReturnValue(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "test-claude-sid" };
          yield { type: "assistant", message: { content: [{ type: "text", text: "OK" }] } };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0.01, duration_ms: 100, num_turns: 1,
            usage: {}, modelUsage: {},
          };
        })(),
      );
      getSession.mockReturnValue({ id: "sid-1", title: "Existing" });
      const opts = baseOpts();
      await runAgent(opts);
      expect(updateClaudeSessionId).toHaveBeenCalledWith("sid-1", "test-claude-sid");
      expect(createSession).not.toHaveBeenCalled();
    });
  });

  // ── Context storage ────────────────────────────────────────────────────
  describe("shared context storage", () => {
    it("stores shared context when runId is provided and assistant has output", async () => {
      query.mockReturnValue(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "ctx-sid" };
          yield { type: "assistant", message: { content: [{ type: "text", text: "Output text" }] } };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0.01, duration_ms: 100, num_turns: 1,
            usage: {}, modelUsage: {},
          };
        })(),
      );

      const opts = baseOpts({ runId: "ctx-run" });
      await runAgent(opts);

      expect(setAgentContext).toHaveBeenCalledWith("ctx-run", "test-agent", "output", "Output text");
    });
  });

  // ── Telegram notification details ──────────────────────────────────────
  describe("telegram notification details", () => {
    it("includes goal snippet and output in successful completion notification", async () => {
      const opts = baseOpts();
      await runAgent(opts);

      const tgCall = sendTelegramNotification.mock.calls[0];
      expect(tgCall[0]).toBe("agent");
      expect(tgCall[2]).toContain("Test Agent");
      expect(tgCall[2]).toContain("Write unit tests");
    });
  });

  // ── Lines 131-133: timeout fires and aborts the agent ──────────────
  describe("timeout handling", () => {
    it("fires timeout callback when agent takes too long (lines 132-133)", async () => {
      // Use a very short timeout (50ms) and a query that delays longer
      query.mockReturnValue(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "timeout-sid" };
          // Delay long enough for the 50ms timeout to fire
          await new Promise((r) => setTimeout(r, 200));
          yield { type: "assistant", message: { content: [{ type: "text", text: "Too late" }] } };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0, duration_ms: 100, num_turns: 1,
            usage: {}, modelUsage: {},
          };
        })(),
      );

      const ws = createMockWs();
      const opts = baseOpts({
        ws,
        agentDef: {
          id: "slow-agent",
          title: "Slow Agent",
          goal: "Work slowly",
          constraints: { maxTurns: 5, timeoutMs: 50 },
        },
      });

      // The agent will throw AbortError when timeout fires
      await runAgent(opts).catch(() => {});

      // The timeout callback sends the "Agent reached time limit" message
      const timeoutMsg = ws.messages.find(
        (m) => m.type === "agent_error" && m.error === "Agent reached time limit",
      );
      expect(timeoutMsg).toBeDefined();
      expect(timeoutMsg.agentId).toBe("slow-agent");
    }, 10000);

    it("clears timeout on normal completion", async () => {
      query.mockReturnValue(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "fast-sid" };
          yield { type: "assistant", message: { content: [{ type: "text", text: "Done" }] } };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0, duration_ms: 100, num_turns: 1,
            usage: {}, modelUsage: {},
          };
        })(),
      );

      const opts = baseOpts({
        agentDef: {
          id: "fast-agent",
          title: "Fast Agent",
          goal: "Work fast",
          constraints: { maxTurns: 5, timeoutMs: 120000 },
        },
      });
      await runAgent(opts);
      // Verify the agent completed without timeout
      const ws = opts.ws;
      const completed = ws.messages.find((m) => m.type === "agent_completed");
      expect(completed).toBeDefined();
      expect(completed.agentId).toBe("fast-agent");
    });

    it("uses default 300000ms timeout when not specified in constraints", async () => {
      query.mockReturnValue(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "def-timeout-sid" };
          yield { type: "assistant", message: { content: [{ type: "text", text: "Done" }] } };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0, duration_ms: 100, num_turns: 1,
            usage: {}, modelUsage: {},
          };
        })(),
      );

      const opts = baseOpts({
        agentDef: { id: "no-timeout", title: "NT", goal: "Work" },
      });
      await runAgent(opts);
      const ws = opts.ws;
      const completed = ws.messages.find((m) => m.type === "agent_completed");
      expect(completed).toBeDefined();
    });
  });

  // ── Lines 399-409: memory capture from agent output ──────────────────
  describe("memory capture", () => {
    beforeEach(() => {
      // Reset memory mocks to default state
      buildAgentMemoryPrompt.mockReturnValue(null);
      saveExplicitMemories.mockReturnValue(0);
      captureMemories.mockReturnValue(0);
    });

    it("captures explicit and auto memories when cwd and lastAssistantText exist", async () => {
      saveExplicitMemories.mockReturnValue(2);
      captureMemories.mockReturnValue(3);

      query.mockReturnValue(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "mem-sid" };
          yield { type: "assistant", message: { content: [{ type: "text", text: "I did things" }] } };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0.01, duration_ms: 100, num_turns: 1,
            usage: {}, modelUsage: {},
          };
        })(),
      );

      const opts = baseOpts({ cwd: "/tmp" });
      await runAgent(opts);

      expect(saveExplicitMemories).toHaveBeenCalledWith(
        "/tmp",
        expect.any(String),
        expect.any(String),
      );
      expect(captureMemories).toHaveBeenCalledWith(
        "/tmp",
        expect.any(String),
        expect.any(String),
        "test-agent",
      );
    });

    it("does not capture memories when cwd is null", async () => {
      query.mockReturnValue(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "no-cwd-sid" };
          yield { type: "assistant", message: { content: [{ type: "text", text: "Output" }] } };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0, duration_ms: 0, num_turns: 0, usage: {}, modelUsage: {},
          };
        })(),
      );

      const opts = baseOpts({ cwd: null });
      await runAgent(opts);

      expect(saveExplicitMemories).not.toHaveBeenCalled();
      expect(captureMemories).not.toHaveBeenCalled();
    });

    it("does not capture memories when no assistant text was produced", async () => {
      query.mockReturnValue(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "no-text-sid" };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0, duration_ms: 0, num_turns: 0, usage: {}, modelUsage: {},
          };
        })(),
      );

      const opts = baseOpts();
      await runAgent(opts);

      expect(saveExplicitMemories).not.toHaveBeenCalled();
      expect(captureMemories).not.toHaveBeenCalled();
    });

    it("handles memory capture errors gracefully", async () => {
      saveExplicitMemories.mockImplementation(() => { throw new Error("Memory DB error"); });

      query.mockReturnValue(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "mem-err-sid" };
          yield { type: "assistant", message: { content: [{ type: "text", text: "Some output" }] } };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0.01, duration_ms: 100, num_turns: 1,
            usage: {}, modelUsage: {},
          };
        })(),
      );

      const opts = baseOpts();
      // Should not throw
      await runAgent(opts);

      // Agent should still complete successfully
      expect(sendPushNotification).toHaveBeenCalled();
    });
  });

  // ── Tool use input detail extraction branches ──────────────────────────
  describe("tool_use detail extraction branches", () => {
    it("extracts command from tool input", async () => {
      query.mockReturnValue(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "cmd-sid" };
          yield {
            type: "assistant",
            message: {
              content: [
                { type: "tool_use", id: "tu-cmd", name: "Bash", input: { command: "ls -la /tmp" } },
              ],
            },
          };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0, duration_ms: 0, num_turns: 0, usage: {}, modelUsage: {},
          };
        })(),
      );

      const ws = createMockWs();
      const opts = baseOpts({ ws });
      await runAgent(opts);

      const progress = ws.messages.find((m) => m.type === "agent_progress");
      expect(progress.detail).toBe("ls -la /tmp");
    });

    it("extracts pattern from tool input", async () => {
      query.mockReturnValue(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "pat-sid" };
          yield {
            type: "assistant",
            message: {
              content: [
                { type: "tool_use", id: "tu-pat", name: "Grep", input: { pattern: "TODO|FIXME" } },
              ],
            },
          };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0, duration_ms: 0, num_turns: 0, usage: {}, modelUsage: {},
          };
        })(),
      );

      const ws = createMockWs();
      const opts = baseOpts({ ws });
      await runAgent(opts);

      const progress = ws.messages.find((m) => m.type === "agent_progress");
      expect(progress.detail).toBe("TODO|FIXME");
    });

    it("extracts query from tool input", async () => {
      query.mockReturnValue(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "q-sid" };
          yield {
            type: "assistant",
            message: {
              content: [
                { type: "tool_use", id: "tu-q", name: "Search", input: { query: "how to fix bug" } },
              ],
            },
          };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0, duration_ms: 0, num_turns: 0, usage: {}, modelUsage: {},
          };
        })(),
      );

      const ws = createMockWs();
      const opts = baseOpts({ ws });
      await runAgent(opts);

      const progress = ws.messages.find((m) => m.type === "agent_progress");
      expect(progress.detail).toBe("how to fix bug");
    });

    it("uses empty string detail when tool input is not an object", async () => {
      query.mockReturnValue(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "nonobj-sid" };
          yield {
            type: "assistant",
            message: {
              content: [
                { type: "tool_use", id: "tu-non", name: "Custom", input: "string-input" },
              ],
            },
          };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0, duration_ms: 0, num_turns: 0, usage: {}, modelUsage: {},
          };
        })(),
      );

      const ws = createMockWs();
      const opts = baseOpts({ ws });
      await runAgent(opts);

      const progress = ws.messages.find((m) => m.type === "agent_progress");
      expect(progress.detail).toBe("");
    });
  });

  // ── Tool result with non-array non-string content ──────────────────────
  describe("tool_result — content type branches", () => {
    it("handles tool_result with non-array non-string content (object/null)", async () => {
      query.mockReturnValue(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "null-content-sid" };
          yield {
            type: "user",
            message: {
              content: [
                { type: "tool_result", tool_use_id: "tu-null", content: null, is_error: false },
              ],
            },
          };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0, duration_ms: 0, num_turns: 0, usage: {}, modelUsage: {},
          };
        })(),
      );

      const ws = createMockWs();
      const opts = baseOpts({ ws });
      await runAgent(opts);

      const toolResult = ws.messages.find((m) => m.type === "tool_result");
      expect(toolResult).toBeDefined();
      expect(toolResult.content).toBe("");
    });

    it("handles user message with non-array content (content is not an array)", async () => {
      query.mockReturnValue(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "nonarray-sid" };
          yield {
            type: "user",
            message: {
              content: "not-an-array",
            },
          };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0, duration_ms: 0, num_turns: 0, usage: {}, modelUsage: {},
          };
        })(),
      );

      const ws = createMockWs();
      const opts = baseOpts({ ws });
      await runAgent(opts);

      // Should not crash, and tool_result should not appear
      const toolResult = ws.messages.find((m) => m.type === "tool_result");
      expect(toolResult).toBeUndefined();
    });
  });

  // ── Context truncation for long output ─────────────────────────────────
  describe("shared context truncation", () => {
    it("truncates agent output over 4000 chars when storing context", async () => {
      const longText = "A".repeat(5000);
      query.mockReturnValue(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "trunc-sid" };
          yield { type: "assistant", message: { content: [{ type: "text", text: longText }] } };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0.01, duration_ms: 100, num_turns: 1,
            usage: {}, modelUsage: {},
          };
        })(),
      );

      const opts = baseOpts({ runId: "trunc-run" });
      await runAgent(opts);

      expect(setAgentContext).toHaveBeenCalled();
      const storedValue = setAgentContext.mock.calls[0][3];
      expect(storedValue.length).toBeLessThan(5000);
      expect(storedValue).toContain("[truncated]");
    });
  });

  // ── Default permissionMode when null ───────────────────────────────────
  describe("default permissionMode", () => {
    it("defaults to bypass when permissionMode is null", async () => {
      const opts = baseOpts({ permissionMode: null });
      await runAgent(opts);

      const callArgs = query.mock.calls[0][0];
      expect(callArgs.options.permissionMode).toBe("bypassPermissions");
    });
  });

  // ── No clientSid — auto-generates session ID ──────────────────────────
  describe("auto-generated session", () => {
    it("auto-generates session ID when sessionId is null", async () => {
      query.mockReturnValue(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "auto-sid" };
          yield { type: "assistant", message: { content: [{ type: "text", text: "OK" }] } };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0, duration_ms: 0, num_turns: 0, usage: {}, modelUsage: {},
          };
        })(),
      );

      const ws = createMockWs();
      const opts = baseOpts({ ws, sessionId: null });
      await runAgent(opts);

      const sessionMsg = ws.messages.find((m) => m.type === "session");
      expect(sessionMsg).toBeDefined();
      expect(sessionMsg.sessionId).toBeTruthy();
    });
  });

  // ── Result with missing modelUsage — falls back to sessionModel ────────
  describe("result model fallback", () => {
    it("uses sessionModel when modelUsage is empty", async () => {
      query.mockReturnValue(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "model-fb-sid", model: "claude-haiku-4-5-20251001" };
          yield { type: "assistant", message: { content: [{ type: "text", text: "OK" }] } };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0.01, duration_ms: 100, num_turns: 1,
            usage: { input_tokens: 10, output_tokens: 5 },
            modelUsage: {},  // empty — no key
          };
        })(),
      );

      const ws = createMockWs();
      const opts = baseOpts({ ws });
      await runAgent(opts);

      const resultMsg = ws.messages.find((m) => m.type === "result");
      expect(resultMsg.model).toBe("claude-haiku-4-5-20251001");
    });
  });

  // ── Error result with no errors array defaults message ─────────────────
  describe("error result defaults", () => {
    it("defaults error message to 'Unknown error' when errors array is missing", async () => {
      query.mockReturnValue(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "no-err-arr-sid" };
          yield {
            type: "result",
            subtype: "error_api",
            total_cost_usd: 0,
            duration_ms: 0,
            num_turns: 0,
            usage: {},
            modelUsage: {},
            // No errors field
          };
        })(),
      );

      const ws = createMockWs();
      const opts = baseOpts({ ws });
      await runAgent(opts);

      const errMsg = ws.messages.find((m) => m.type === "error");
      expect(errMsg.error).toBe("Unknown error");
    });
  });

  // ── Multiple text blocks concatenated ──────────────────────────────────
  describe("multiple assistant text blocks", () => {
    it("concatenates multiple text blocks with double newline separator", async () => {
      query.mockReturnValue(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "multi-text-sid" };
          yield { type: "assistant", message: { content: [{ type: "text", text: "Part 1" }] } };
          yield { type: "assistant", message: { content: [{ type: "text", text: "Part 2" }] } };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0.01, duration_ms: 100, num_turns: 1,
            usage: {}, modelUsage: {},
          };
        })(),
      );

      const opts = baseOpts({ runId: "concat-run" });
      await runAgent(opts);

      // Stored context should contain both parts
      expect(setAgentContext).toHaveBeenCalled();
      const stored = setAgentContext.mock.calls[0][3];
      expect(stored).toContain("Part 1");
      expect(stored).toContain("Part 2");
    });
  });

  // ── Init without model field ──────────────────────────────────────────
  describe("init without model", () => {
    it("handles init message without model field", async () => {
      query.mockReturnValue(
        (async function* () {
          yield { type: "system", subtype: "init", session_id: "no-model-sid" };
          yield { type: "assistant", message: { content: [{ type: "text", text: "Result" }] } };
          yield {
            type: "result", subtype: "success",
            total_cost_usd: 0.01, duration_ms: 100, num_turns: 1,
            usage: {}, modelUsage: {},
          };
        })(),
      );

      const ws = createMockWs();
      const opts = baseOpts({ ws });
      await runAgent(opts);

      const resultMsg = ws.messages.find((m) => m.type === "result");
      // model should be null since init had no model and modelUsage is empty
      expect(resultMsg.model).toBeNull();
    });
  });

  // ── CWD null — falls back to homedir ──────────────────────────────────
  describe("cwd null fallback", () => {
    it("uses homedir when cwd is null", async () => {
      const opts = baseOpts({ cwd: null });
      await runAgent(opts);

      const callArgs = query.mock.calls[0][0];
      expect(callArgs.options.cwd).toBeTruthy();
    });
  });
});

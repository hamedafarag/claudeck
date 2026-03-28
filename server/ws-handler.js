import { query } from "@anthropic-ai/claude-code";
import { execPath } from "process";
import { existsSync } from "fs";
import { homedir } from "os";
import {
  createSession,
  updateClaudeSessionId,
  getSession,
  touchSession,
  addCost,
  addMessage,
  getTotalCost,
  setClaudeSession,
  updateSessionTitle,
  getTopMemories,
  touchMemory,
  createWorktreeRecord,
  updateWorktreeStatus,
  updateWorktreeSession,
} from "../db.js";
import { getProjectSystemPrompt } from "./routes/projects.js";
import { buildMemoryPrompt, parseRememberCommand, saveExplicitMemories } from "./memory-injector.js";
import { captureMemories, runMaintenance } from "./memory-extractor.js";
import { createWorktree, generateBranchName, getCurrentBranch, autoCommitWorktree, getWorktreeDiffStats } from "./utils/git-worktree.js";
import { logNotification } from "./notification-logger.js";

// Map short model names to current model IDs
export const MODEL_MAP = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6",
};
export function resolveModel(name) {
  if (!name) return undefined;
  return MODEL_MAP[name] || name;
}
import { sendPushNotification } from "./push-sender.js";
import { sendTelegramNotification, sendPermissionRequest, isEnabled as telegramEnabled, getConfig as getTelegramConfig } from "./telegram-sender.js";
import { trackApprovalMessage, markTelegramMessageResolved } from "./telegram-poller.js";
import { generateSessionSummary } from "./summarizer.js";
import { runAgent } from "./agent-loop.js";
import { runOrchestrator } from "./orchestrator.js";
import { runDag } from "./dag-executor.js";

// Tools that are read-only and safe to auto-approve in "confirmDangerous" mode
export const READ_ONLY_TOOLS = new Set([
  "Read", "Glob", "Grep", "WebSearch", "WebFetch", "Agent",
  "TodoRead", "TaskRead", "NotebookRead", "LS", "View", "ListFiles",
  "TaskList", "TaskGet",
]);

const DEFAULT_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes (web)
export function getApprovalTimeoutMs() {
  const cfg = getTelegramConfig();
  if (telegramEnabled()) {
    return (cfg.afkTimeoutMinutes || 15) * 60 * 1000;
  }
  return DEFAULT_APPROVAL_TIMEOUT_MS;
}

// Global tracking of active queries across all connections
// Key: sessionId, Value: Set<queryKey>
const globalActiveQueries = new Map();

export function registerGlobalQuery(sessionId, queryKey) {
  if (!sessionId) return;
  if (!globalActiveQueries.has(sessionId)) {
    globalActiveQueries.set(sessionId, new Set());
  }
  globalActiveQueries.get(sessionId).add(queryKey);
}

export function unregisterGlobalQuery(sessionId, queryKey) {
  if (!sessionId) return;
  const set = globalActiveQueries.get(sessionId);
  if (set) {
    set.delete(queryKey);
    if (set.size === 0) globalActiveQueries.delete(sessionId);
  }
}

export function getActiveSessionIds() {
  return [...globalActiveQueries.keys()];
}

/**
 * Creates a canUseTool callback that sends permission requests over WebSocket
 * AND Telegram (for AFK approval). Whichever channel responds first wins.
 */
export function makeCanUseTool(ws, pendingApprovals, permissionMode, chatId, sessionTitle) {
  return async (toolName, toolInput, options) => {
    // Bypass mode — auto-approve everything
    if (permissionMode === "bypass") {
      return { behavior: "allow", updatedInput: toolInput };
    }

    // Confirm-dangerous mode — auto-approve read-only tools
    if (permissionMode === "confirmDangerous" && READ_ONLY_TOOLS.has(toolName)) {
      return { behavior: "allow", updatedInput: toolInput };
    }

    // Send permission request to client and wait for response
    const id = crypto.randomUUID();
    const payload = { type: "permission_request", id, toolName, input: toolInput };
    if (chatId) payload.chatId = chatId;

    if (ws.readyState !== 1) {
      return { behavior: "deny", message: "WebSocket disconnected" };
    }

    ws.send(JSON.stringify(payload));

    // Also send to Telegram for AFK approval
    if (telegramEnabled()) {
      sendPermissionRequest(id, toolName, toolInput, sessionTitle).then((result) => {
        if (result?.result?.message_id) {
          trackApprovalMessage(id, result.result.message_id, toolName);
        }
      }).catch(() => {});
    }

    const timeoutMs = getApprovalTimeoutMs();

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingApprovals.delete(id);
        markTelegramMessageResolved(id, "timeout").catch(() => {});
        resolve({ behavior: "deny", message: `Approval timed out (${Math.round(timeoutMs / 60000)}min)` });
      }, timeoutMs);

      // Clean up if aborted via signal
      if (options?.signal) {
        options.signal.addEventListener("abort", () => {
          clearTimeout(timer);
          pendingApprovals.delete(id);
          markTelegramMessageResolved(id, "abort").catch(() => {});
          resolve({ behavior: "deny", message: "Aborted by user" });
        }, { once: true });
      }

      pendingApprovals.set(id, { resolve, timer, toolInput, ws });
    });
  };
}

// Shared SDK stream processor — deduplicates chat and workflow message parsing
export async function processSdkStream(q, { ws, wsSend, sessionIds, clientSid, chatId, cwd, projectName, isWorkflow, stepLabel, workflowId, stepIndex }) {
  let claudeSessionId = null;
  let resolvedSid = clientSid;
  let sessionModel = null;
  let lastMetrics = {}; // Captured from result for Telegram notifications
  const wfMeta = isWorkflow ? { workflowId: workflowId || null, stepIndex: stepIndex ?? null, stepLabel: stepLabel || null } : null;

  for await (const sdkMsg of q) {
    if (ws.readyState !== 1) break;

    // Capture session ID from init message
    if (sdkMsg.type === "system" && sdkMsg.subtype === "init") {
      claudeSessionId = sdkMsg.session_id;
      if (sdkMsg.model) sessionModel = sdkMsg.model;
      const ourSid = clientSid || crypto.randomUUID();
      resolvedSid = ourSid;

      const sKey = chatId ? `${ourSid}::${chatId}` : ourSid;
      sessionIds.set(sKey, claudeSessionId);

      if (!await getSession(ourSid)) {
        await createSession(ourSid, claudeSessionId, projectName || "Session", cwd || "");
        if (isWorkflow) {
          await updateSessionTitle(ourSid, `Workflow: ${stepLabel}`);
        }
      } else {
        await updateClaudeSessionId(ourSid, claudeSessionId);
      }

      if (chatId) {
        await setClaudeSession(ourSid, chatId, claudeSessionId);
      }

      wsSend({ type: "session", sessionId: ourSid });

      const msgText = isWorkflow ? `[${stepLabel}]` : null;
      // Save user message now that we have a resolved sid
      if (!isWorkflow) {
        // user message saved by caller for chat; for workflow, save with step label
      }
      if (isWorkflow) {
        await addMessage(resolvedSid, "user", JSON.stringify({ text: msgText }), null, wfMeta);
      }

      if (!isWorkflow) {
        // Auto-set session title from first user message
        const existingSession = await getSession(ourSid);
        if (existingSession && !existingSession.title) {
          // Title is set by caller
        }
      }
      continue;
    }

    // Assistant message — extract text and tool_use blocks
    if (sdkMsg.type === "assistant" && sdkMsg.message?.content) {
      for (const block of sdkMsg.message.content) {
        if (block.type === "text" && block.text) {
          wsSend({ type: "text", text: block.text });
          if (resolvedSid) {
            await addMessage(resolvedSid, "assistant", JSON.stringify({ text: block.text }), chatId || null, wfMeta);
          }
        } else if (block.type === "tool_use") {
          wsSend({ type: "tool", id: block.id, name: block.name, input: block.input });
          if (resolvedSid) {
            await addMessage(resolvedSid, "tool", JSON.stringify({ id: block.id, name: block.name, input: block.input }), chatId || null, wfMeta);
          }
        }
      }
      continue;
    }

    // Result message
    if (sdkMsg.type === "result") {
      if (sdkMsg.subtype === "success") {
        const costUsd = sdkMsg.total_cost_usd || 0;
        const durationMs = sdkMsg.duration_ms || 0;
        const numTurns = sdkMsg.num_turns || 0;
        const inputTokens = sdkMsg.usage?.input_tokens || 0;
        const outputTokens = sdkMsg.usage?.output_tokens || 0;
        const cacheReadTokens = sdkMsg.usage?.cache_read_input_tokens || 0;
        const cacheCreationTokens = sdkMsg.usage?.cache_creation_input_tokens || 0;
        const model = Object.keys(sdkMsg.modelUsage || {})[0] || sessionModel;
        const sid = resolvedSid || [...sessionIds.entries()].find(
          ([, v]) => v === claudeSessionId
        )?.[0];
        if (sid) {
          await addCost(sid, costUsd, durationMs, numTurns, inputTokens, outputTokens, { model, stopReason: "success", isError: 0, cacheReadTokens, cacheCreationTokens });
        }

        wsSend({
          type: "result",
          duration_ms: sdkMsg.duration_ms,
          num_turns: sdkMsg.num_turns,
          cost_usd: sdkMsg.total_cost_usd,
          totalCost: await getTotalCost(),
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cache_read_tokens: cacheReadTokens,
          cache_creation_tokens: cacheCreationTokens,
          model,
          stop_reason: "success",
        });

        lastMetrics = { durationMs, costUsd, inputTokens, outputTokens, model, turns: numTurns, isError: false };

        if (resolvedSid) {
          await addMessage(resolvedSid, "result", JSON.stringify({
            duration_ms: sdkMsg.duration_ms,
            num_turns: sdkMsg.num_turns,
            cost_usd: sdkMsg.total_cost_usd,
            model,
            stop_reason: "success",
          }), chatId || null, wfMeta);
        }
      } else if (sdkMsg.subtype?.startsWith("error")) {
        const errMsg = sdkMsg.errors?.join(", ") || "Unknown error";
        const costUsd = sdkMsg.total_cost_usd || 0;
        const durationMs = sdkMsg.duration_ms || 0;
        const numTurns = sdkMsg.num_turns || 0;
        const inputTokens = sdkMsg.usage?.input_tokens || 0;
        const outputTokens = sdkMsg.usage?.output_tokens || 0;
        const cacheReadTokens = sdkMsg.usage?.cache_read_input_tokens || 0;
        const cacheCreationTokens = sdkMsg.usage?.cache_creation_input_tokens || 0;
        const model = Object.keys(sdkMsg.modelUsage || {})[0] || sessionModel;
        const sid = resolvedSid || [...sessionIds.entries()].find(
          ([, v]) => v === claudeSessionId
        )?.[0];
        if (sid) {
          await addCost(sid, costUsd, durationMs, numTurns, inputTokens, outputTokens, { model, stopReason: sdkMsg.subtype, isError: 1, cacheReadTokens, cacheCreationTokens });
          await addMessage(sid, "error", JSON.stringify({ error: errMsg, subtype: sdkMsg.subtype, duration_ms: durationMs, cost_usd: costUsd, model }), chatId || null, wfMeta);
        }
        lastMetrics = { durationMs, costUsd, inputTokens, outputTokens, model, turns: numTurns, isError: true, error: errMsg };
        wsSend({ type: "error", error: errMsg });
      }
      continue;
    }

    // User messages (tool results from Claude executing tools)
    if (sdkMsg.type === "user" && sdkMsg.message?.content) {
      const content = sdkMsg.message.content;
      const blocks = Array.isArray(content) ? content : [];
      for (const block of blocks) {
        if (block.type === "tool_result") {
          const text = Array.isArray(block.content)
            ? block.content.map(c => c.type === "text" ? c.text : "").join("")
            : typeof block.content === "string" ? block.content : "";
          const wirePayload = {
            toolUseId: block.tool_use_id,
            content: text.slice(0, 2000),
            isError: block.is_error || false,
          };
          wsSend({ type: "tool_result", ...wirePayload });
          if (resolvedSid) {
            const dbPayload = {
              toolUseId: block.tool_use_id,
              content: text.slice(0, 10000),
              isError: block.is_error || false,
            };
            await addMessage(resolvedSid, "tool_result", JSON.stringify(dbPayload), chatId || null, wfMeta);
          }
        }
      }
      continue;
    }
  }

  return { claudeSessionId, resolvedSid, lastMetrics };
}

// ── Pure function: build prompt with optional images ──────────────────────
export function buildPrompt(text, imgs) {
  if (!imgs?.length) return text;
  return (async function*() {
    yield {
      type: "user",
      message: { role: "user", content: [
        { type: "text", text },
        ...imgs.map(img => ({
          type: "image",
          source: { type: "base64", media_type: img.mimeType, data: img.data },
        })),
      ]},
      parent_tool_use_id: null,
      session_id: "",
    };
  })();
}

// ── Extracted handler: close ──────────────────────────────────────────────
export function handleClose({ activeQueries, pendingApprovals }) {
  // Abort all active SDK streams first (they may be blocked on approval)
  for (const [, q] of activeQueries) {
    q.abort();
  }
  activeQueries.clear();

  for (const [id, { resolve, timer }] of pendingApprovals) {
    clearTimeout(timer);
    resolve({ behavior: "deny", message: "Client disconnected" });
  }
  pendingApprovals.clear();
}

// ── Extracted handler: abort ──────────────────────────────────────────────
export function handleAbort(msg, { activeQueries, pendingApprovals }) {
  if (msg.chatId) {
    const q = activeQueries.get(msg.chatId);
    if (q) { q.abort(); activeQueries.delete(msg.chatId); }
  } else {
    for (const q of activeQueries.values()) q.abort();
    activeQueries.clear();
  }
  // Also deny any pending approvals on abort
  for (const [id, { resolve, timer }] of pendingApprovals) {
    clearTimeout(timer);
    resolve({ behavior: "deny", message: "Aborted by user" });
  }
  pendingApprovals.clear();
}

// ── Extracted handler: permission response ────────────────────────────────
export function handlePermissionResponse(msg, { pendingApprovals }) {
  const pending = pendingApprovals.get(msg.id);
  if (pending) {
    clearTimeout(pending.timer);
    pendingApprovals.delete(msg.id);
    if (msg.behavior === "allow") {
      pending.resolve({ behavior: "allow", updatedInput: pending.toolInput });
    } else {
      pending.resolve({ behavior: "deny", message: "Denied by user" });
    }
    // Update Telegram message to show it was resolved via web
    markTelegramMessageResolved(msg.id, msg.behavior === "allow" ? "allow" : "deny").catch(() => {});
  }
}

// ── Extracted handler: workflow ────────────────────────────────────────────
export async function handleWorkflow(msg, { ws, sessionIds, activeQueries, pendingApprovals }) {
  const { workflow, cwd, sessionId: clientSid, projectName, permissionMode: wfPermMode, model: wfModel } = msg;
  if (!workflow || !workflow.steps) return;

  function wfSend(payload) {
    if (ws.readyState !== 1) return;
    ws.send(JSON.stringify(payload));
  }

  wfSend({ type: "workflow_started", workflow: { id: workflow.id, title: workflow.title, steps: workflow.steps.map((s) => s.label) } });

  // Telegram start notification
  const wfStepNames = workflow.steps.map((s, i) => `  ${i + 1}. ${s.label}`).join("\n");
  sendTelegramNotification("start", "Workflow Started", `${workflow.title}\n\n${workflow.steps.length} steps:\n${wfStepNames}`);

  let resumeId = clientSid ? sessionIds.get(clientSid) : undefined;
  let resolvedSid = clientSid;
  const wfQueryKey = `wf-${workflow.id}-${Date.now()}`;
  let wfAborted = false;

  for (let i = 0; i < workflow.steps.length; i++) {
    if (wfAborted || ws.readyState !== 1) break;

    const step = workflow.steps[i];
    wfSend({ type: "workflow_step", stepIndex: i, status: "running" });

    const abortController = new AbortController();
    activeQueries.set(wfQueryKey, { abort: () => abortController.abort() });

    const effectivePermMode = wfPermMode || "bypass";
    const useBypass = effectivePermMode === "bypass";
    const usePlan = effectivePermMode === "plan";
    const wfCwd = (cwd && existsSync(cwd)) ? cwd : homedir();
    const stepOpts = {
      cwd: wfCwd,
      permissionMode: usePlan ? "plan" : (useBypass ? "bypassPermissions" : "default"),
      abortController,
      maxTurns: 30,
      executable: execPath,
      settingSources: ["user", "project", "local"],
    };

    if (!useBypass && !usePlan) {
      stepOpts.canUseTool = makeCanUseTool(ws, pendingApprovals, effectivePermMode, null, `Workflow: ${workflow.title}`);
    }
    if (wfModel) stepOpts.model = resolveModel(wfModel);

    const projectPrompt = getProjectSystemPrompt(cwd);
    if (projectPrompt) stepOpts.appendSystemPrompt = projectPrompt;
    if (resumeId) stepOpts.resume = resumeId;

    try {
      const q = query({ prompt: step.prompt, options: stepOpts });
      const result = await processSdkStream(q, {
        ws, wsSend: wfSend, sessionIds,
        clientSid: resolvedSid, chatId: null,
        cwd, projectName: projectName || "Workflow",
        isWorkflow: true, stepLabel: step.label,
        workflowId: workflow.id, stepIndex: i,
      });

      if (result.resolvedSid) resolvedSid = result.resolvedSid;
      if (result.claudeSessionId) resumeId = result.claudeSessionId;

      if (i === 0 && result.resolvedSid && !clientSid) {
        wfSend({ type: "session", sessionId: result.resolvedSid });
      }
    } catch (err) {
      if (err.name === "AbortError" || abortController.signal.aborted) {
        wfAborted = true;
        wfSend({ type: "workflow_step", stepIndex: i, status: "aborted" });
        break;
      }
      wfSend({ type: "error", error: `Workflow step "${step.label}" failed: ${err.message}` });
      sendTelegramNotification("error", "Workflow Step Failed", `${workflow.title}\n\nStep ${i + 1}/${workflow.steps.length}: ${step.label}\nError: ${err.message}`);
      break;
    }

    wfSend({ type: "workflow_step", stepIndex: i, status: "completed" });
  }

  activeQueries.delete(wfQueryKey);

  if (wfAborted) {
    wfSend({ type: "workflow_completed", aborted: true });
    wfSend({ type: "done" });
    sendTelegramNotification("error", "Workflow Aborted", `${workflow.title}\nAborted during execution`);
  } else {
    wfSend({ type: "workflow_completed" });
    wfSend({ type: "done" });
    sendPushNotification("Claudeck", `Workflow "${workflow.title}" completed`, `wf-${resolvedSid}`);
    const stepNames = workflow.steps.map((s, i) => `  ${i + 1}. ${s.label}`).join("\n");
    sendTelegramNotification("workflow", "Workflow Completed", `${workflow.title}\n\nSteps:\n${stepNames}`, {
      steps: workflow.steps.length,
    });
  }
}

// ── Extracted handler: agent ──────────────────────────────────────────────
export async function handleAgent(msg, { ws, sessionIds, activeQueries, pendingApprovals }) {
  const { agentDef, cwd, sessionId: clientSid, projectName, permissionMode: agentPermMode, model: agentModel, userContext } = msg;
  if (!agentDef) return;

  runAgent({
    ws,
    agentDef,
    cwd,
    sessionId: clientSid,
    projectName,
    permissionMode: agentPermMode,
    model: agentModel,
    sessionIds,
    pendingApprovals,
    makeCanUseTool,
    userContext,
    activeQueries,
    runType: 'single',
  }).catch(() => {}); // errors already handled inside runAgent
}

// ── Extracted handler: agent chain ────────────────────────────────────────
export async function handleAgentChain(msg, { ws, sessionIds, activeQueries, pendingApprovals }) {
  const { chain, agents: agentDefs, cwd, sessionId: clientSid, projectName, permissionMode: chainPermMode, model: chainModel } = msg;
  if (!chain || !agentDefs?.length) return;

  const runId = crypto.randomUUID();

  function chainSend(payload) {
    if (ws.readyState !== 1) return;
    ws.send(JSON.stringify(payload));
  }

  chainSend({
    type: "agent_chain_started",
    chainId: chain.id,
    runId,
    title: chain.title,
    agents: agentDefs.map(a => ({ id: a.id, title: a.title })),
    totalSteps: agentDefs.length,
  });

  // Telegram start notification
  const chainAgentNames = agentDefs.map((a, i) => `  ${i + 1}. ${a.title}`).join("\n");
  sendTelegramNotification("start", "Chain Started", `${chain.title}\n\n${agentDefs.length} agents:\n${chainAgentNames}`);

  let chainResumeId = clientSid ? sessionIds.get(clientSid) : undefined;
  let resolvedSid = clientSid;

  for (let i = 0; i < agentDefs.length; i++) {
    const agentDef = agentDefs[i];
    if (ws.readyState !== 1) break;

    chainSend({
      type: "agent_chain_step",
      chainId: chain.id,
      stepIndex: i,
      agentId: agentDef.id,
      agentTitle: agentDef.title,
      status: "running",
    });

    try {
      const result = await runAgent({
        ws,
        agentDef,
        cwd,
        sessionId: resolvedSid,
        projectName: projectName || `Chain: ${chain.title}`,
        permissionMode: chainPermMode,
        model: chainModel,
        sessionIds,
        pendingApprovals,
        makeCanUseTool,
        activeQueries,
        chainResumeId,
        runId,
        runType: 'chain',
        parentRunId: chain.id,
      });

      if (result?.resolvedSid) resolvedSid = result.resolvedSid;
      if (result?.claudeSessionId) chainResumeId = result.claudeSessionId;

      chainSend({
        type: "agent_chain_step",
        chainId: chain.id,
        stepIndex: i,
        agentId: agentDef.id,
        agentTitle: agentDef.title,
        status: "completed",
      });
    } catch (err) {
      chainSend({
        type: "agent_chain_step",
        chainId: chain.id,
        stepIndex: i,
        agentId: agentDef.id,
        agentTitle: agentDef.title,
        status: "error",
        error: err.message,
      });
      sendTelegramNotification("error", "Chain Agent Failed", `${chain.title}\n\nAgent ${i + 1}/${agentDefs.length}: ${agentDef.title}\nError: ${err.message}`);
      break;
    }
  }

  chainSend({ type: "agent_chain_completed", chainId: chain.id, runId });
  sendPushNotification("Claudeck", `Chain "${chain.title}" completed`, `chain-${resolvedSid}`);
  const agentNames = agentDefs.map((a, i) => `  ${i + 1}. ${a.title}`).join("\n");
  sendTelegramNotification("chain", "Chain Completed", `${chain.title}\n\nAgents:\n${agentNames}`, {
    steps: agentDefs.length,
  });
}

// ── Extracted handler: DAG ────────────────────────────────────────────────
export async function handleDag(msg, { ws, sessionIds, activeQueries, pendingApprovals }) {
  const { dag, agents: agentDefs, cwd, sessionId: clientSid, projectName, permissionMode: dagPermMode, model: dagModel } = msg;
  if (!dag || !agentDefs?.length) return;

  runDag({
    ws,
    dag,
    agents: agentDefs,
    cwd,
    sessionId: clientSid,
    projectName,
    permissionMode: dagPermMode,
    model: dagModel,
    sessionIds,
    pendingApprovals,
    makeCanUseTool,
    activeQueries,
  });
}

// ── Extracted handler: orchestrate ────────────────────────────────────────
export async function handleOrchestrate(msg, { ws, sessionIds, activeQueries, pendingApprovals }) {
  const { task, cwd, sessionId: clientSid, projectName, permissionMode: orchPermMode, model: orchModel } = msg;
  if (!task) return;

  const { readFile } = await import("fs/promises");
  const { configPath } = await import("./paths.js");
  let agents;
  try {
    agents = JSON.parse(await readFile(configPath("agents.json"), "utf-8"));
  } catch {
    ws.send(JSON.stringify({ type: "error", error: "Failed to load agents" }));
    return;
  }

  runOrchestrator({
    ws,
    task,
    agents,
    cwd,
    sessionId: clientSid,
    projectName,
    permissionMode: orchPermMode,
    model: orchModel,
    sessionIds,
    pendingApprovals,
    makeCanUseTool,
    activeQueries,
  });
}

// ── Extracted handler: chat ───────────────────────────────────────────────
export async function handleChat(msg, { ws, sessionIds, activeQueries, pendingApprovals }) {
  const { message, cwd, sessionId: clientSid, projectName, chatId, permissionMode: clientPermMode, model: chatModel, maxTurns: clientMaxTurns, images, systemPrompt, disabledTools, worktree } = msg;

  // Handle /remember command — save memory and respond without calling Claude
  if (message && message.trim().toLowerCase().startsWith('/remember ') && cwd) {
    const result = await parseRememberCommand(message, cwd, clientSid);
    function remSend(payload) {
      if (ws.readyState !== 1) return;
      if (chatId) payload.chatId = chatId;
      ws.send(JSON.stringify(payload));
    }
    if (result) {
      remSend({ type: "text", text: result.saved
        ? `Saved memory [${result.category}]: ${result.content}`
        : `Memory already exists: ${result.content}` });
      remSend({ type: "memory_saved", category: result.category, content: result.content, isDuplicate: !result.saved });
    } else {
      remSend({ type: "text", text: "Usage: /remember [category] what to remember\nCategories: convention, decision, discovery, warning" });
    }
    remSend({ type: "done" });
    return;
  }

  const queryKey = chatId || "__default__";

  const sessionKey = chatId ? `${clientSid}::${chatId}` : clientSid;
  const resumeId = clientSid ? sessionIds.get(sessionKey) : undefined;

  if (clientSid && await getSession(clientSid)) {
    await touchSession(clientSid);
  }

  const abortController = new AbortController();
  const effectivePermMode = clientPermMode || "bypass";
  const useBypass = effectivePermMode === "bypass";
  const usePlan = effectivePermMode === "plan";
  const resolvedCwd = (cwd && existsSync(cwd)) ? cwd : homedir();

  // ── Worktree mode: create isolated worktree before SDK query ──
  let worktreeRecord = null;
  let effectiveCwd = resolvedCwd;

  console.log(`[worktree] flag=${worktree}, cwd=${cwd}, exists=${cwd ? existsSync(cwd) : 'n/a'}`);

  if (worktree && cwd && existsSync(cwd)) {
    try {
      const branchName = generateBranchName(message);
      console.log(`[worktree] Creating worktree: branch=${branchName}, project=${cwd}`);
      const baseBranch = await getCurrentBranch(cwd);
      const wtResult = await createWorktree(cwd, branchName);
      const wtId = crypto.randomUUID();

      await createWorktreeRecord(wtId, clientSid || null, cwd, wtResult.worktreePath, branchName, baseBranch, (message || "").slice(0, 200));
      worktreeRecord = { id: wtId, worktreePath: wtResult.worktreePath, branchName, baseBranch };
      effectiveCwd = wtResult.worktreePath;

      // Notify client of worktree creation
      if (ws.readyState === 1) {
        const wtPayload = { type: "worktree_created", worktreeId: wtId, branchName, baseBranch, worktreePath: wtResult.worktreePath };
        if (chatId) wtPayload.chatId = chatId;
        ws.send(JSON.stringify(wtPayload));
      }
    } catch (err) {
      console.error("Worktree creation failed:", err.message, err.stack);
      // Notify client of failure so they know it fell back to normal mode
      if (ws.readyState === 1) {
        const errPayload = { type: "worktree_error", error: err.message };
        if (chatId) errPayload.chatId = chatId;
        ws.send(JSON.stringify(errPayload));
      }
      // Fall back to normal cwd — don't block the query
    }
  }

  const stderrChunks = [];
  const effectiveMaxTurns = clientMaxTurns > 0 ? clientMaxTurns : undefined;
  const opts = {
    cwd: effectiveCwd,
    permissionMode: usePlan ? "plan" : (useBypass ? "bypassPermissions" : "default"),
    abortController,
    executable: execPath,
    stderr: (text) => stderrChunks.push(text),
    settingSources: ["user", "project", "local"],
  };
  if (effectiveMaxTurns) opts.maxTurns = effectiveMaxTurns;

  if (!useBypass && !usePlan) {
    opts.canUseTool = makeCanUseTool(ws, pendingApprovals, effectivePermMode, chatId, projectName || "Chat");
  }
  if (chatModel) opts.model = resolveModel(chatModel);
  if (Array.isArray(disabledTools) && disabledTools.length > 0) {
    opts.disallowedTools = disabledTools;
  }
  // Prevent SDK from creating nested worktrees when Claudeck manages them
  if (worktreeRecord) {
    opts.disallowedTools = [...(opts.disallowedTools || []), "EnterWorktree"];
  }

  const projectPrompt = getProjectSystemPrompt(cwd);
  if (projectPrompt) opts.appendSystemPrompt = projectPrompt;
  if (systemPrompt) {
    opts.appendSystemPrompt = (opts.appendSystemPrompt || '') +
      (opts.appendSystemPrompt ? '\n\n' : '') + systemPrompt;
  }
  // Run memory maintenance (decay stale, clean expired) on each session
  if (cwd) await runMaintenance(cwd);
  // Inject persistent memories for this project (smart: uses user message for relevance)
  if (cwd) {
    const { prompt: memPrompt, count: memCount, memories: memList } = await buildMemoryPrompt(cwd, 10, message);
    if (memPrompt) {
      opts.appendSystemPrompt = (opts.appendSystemPrompt || '') +
        (opts.appendSystemPrompt ? '\n\n' : '') + memPrompt;

      // Log memories being passed to Claude SDK
      console.log(`\n══════ MEMORY INJECTION ══════`);
      console.log(`Project: ${cwd}`);
      console.log(`User message: "${(message || '').slice(0, 100)}"`);
      console.log(`Memories injected: ${memCount}`);
      for (const m of memList) {
        console.log(`  [${m.category}] ${m.content.slice(0, 120)}`);
      }
      console.log(`Prompt appended to appendSystemPrompt (${memPrompt.length} chars)`);
      console.log(`══════════════════════════════\n`);

      // Notify client that memories were injected (include content for display)
      if (ws.readyState === 1) {
        const payload = { type: "memories_injected", count: memCount, memories: memList };
        if (chatId) payload.chatId = chatId;
        ws.send(JSON.stringify(payload));
      }
    } else {
      console.log(`\n══════ MEMORY INJECTION ══════`);
      console.log(`Project: ${cwd}`);
      console.log(`No memories found for this project`);
      console.log(`══════════════════════════════\n`);
    }
  }
  if (resumeId) opts.resume = resumeId;

  const state = { resolvedSid: clientSid, lastAssistantText: "", lastChatMetrics: {} };

  function wsSend(payload) {
    if (ws.readyState !== 1) return;
    if (chatId) payload.chatId = chatId;
    if (state.resolvedSid) payload.sessionId = state.resolvedSid;
    ws.send(JSON.stringify(payload));
  }

  // Register for global tracking if we already know the session
  if (clientSid) registerGlobalQuery(clientSid, queryKey);

  async function runChatQuery(queryOpts) {
    const q = query({ prompt: buildPrompt(message, images), options: queryOpts });
    activeQueries.set(queryKey, { abort: () => abortController.abort() });

    let claudeSessionId = null;
    let sessionModel = null;

    for await (const sdkMsg of q) {
      if (ws.readyState !== 1) break;

      if (sdkMsg.type === "system" && sdkMsg.subtype === "init") {
        claudeSessionId = sdkMsg.session_id;
        if (sdkMsg.model) sessionModel = sdkMsg.model;
        const ourSid = clientSid || crypto.randomUUID();
        state.resolvedSid = ourSid;

        const sKey = chatId ? `${ourSid}::${chatId}` : ourSid;
        sessionIds.set(sKey, claudeSessionId);

        if (!await getSession(ourSid)) {
          await createSession(ourSid, claudeSessionId, projectName || "Session", cwd || "");
        } else {
          await updateClaudeSessionId(ourSid, claudeSessionId);
        }

        if (chatId) {
          await setClaudeSession(ourSid, chatId, claudeSessionId);
        }

        wsSend({ type: "session", sessionId: ourSid });
        const userMsgData = { text: message };
        if (images?.length) {
          userMsgData.images = images.map(i => ({ name: i.name, data: i.data, mimeType: i.mimeType }));
        }
        await addMessage(state.resolvedSid, "user", JSON.stringify(userMsgData), chatId || null);

        // Register global query tracking now that we know the session
        if (!clientSid) registerGlobalQuery(state.resolvedSid, queryKey);

        const existingSession = await getSession(ourSid);
        if (existingSession && !existingSession.title) {
          const title = message.slice(0, 100).split("\n")[0];
          await updateSessionTitle(ourSid, title);
        }
        continue;
      }

      if (sdkMsg.type === "assistant" && sdkMsg.message?.content) {
        for (const block of sdkMsg.message.content) {
          if (block.type === "text" && block.text) {
            state.lastAssistantText += (state.lastAssistantText ? "\n\n" : "") + block.text;
            wsSend({ type: "text", text: block.text });
            if (state.resolvedSid) await addMessage(state.resolvedSid, "assistant", JSON.stringify({ text: block.text }), chatId || null);
          } else if (block.type === "tool_use") {
            wsSend({ type: "tool", id: block.id, name: block.name, input: block.input });
            if (state.resolvedSid) await addMessage(state.resolvedSid, "tool", JSON.stringify({ id: block.id, name: block.name, input: block.input }), chatId || null);
          }
        }
        continue;
      }

      if (sdkMsg.type === "result") {
        if (sdkMsg.subtype === "success") {
          const sid = state.resolvedSid || [...sessionIds.entries()].find(([, v]) => v === claudeSessionId)?.[0];
          const inputTokens = sdkMsg.usage?.input_tokens || 0;
          const outputTokens = sdkMsg.usage?.output_tokens || 0;
          const cacheReadTokens = sdkMsg.usage?.cache_read_input_tokens || 0;
          const cacheCreationTokens = sdkMsg.usage?.cache_creation_input_tokens || 0;
          const model = Object.keys(sdkMsg.modelUsage || {})[0] || sessionModel;
          if (sid) await addCost(sid, sdkMsg.total_cost_usd || 0, sdkMsg.duration_ms || 0, sdkMsg.num_turns || 0, inputTokens, outputTokens, { model, stopReason: "success", isError: 0, cacheReadTokens, cacheCreationTokens });
          wsSend({ type: "result", duration_ms: sdkMsg.duration_ms, num_turns: sdkMsg.num_turns, cost_usd: sdkMsg.total_cost_usd, totalCost: await getTotalCost(), input_tokens: inputTokens, output_tokens: outputTokens, cache_read_tokens: cacheReadTokens, cache_creation_tokens: cacheCreationTokens, model, stop_reason: "success" });
          state.lastChatMetrics = { durationMs: sdkMsg.duration_ms, costUsd: sdkMsg.total_cost_usd, inputTokens, outputTokens, model, turns: sdkMsg.num_turns, isError: false };
          if (state.resolvedSid) await addMessage(state.resolvedSid, "result", JSON.stringify({ duration_ms: sdkMsg.duration_ms, num_turns: sdkMsg.num_turns, cost_usd: sdkMsg.total_cost_usd, input_tokens: inputTokens, output_tokens: outputTokens, cache_read_tokens: cacheReadTokens, cache_creation_tokens: cacheCreationTokens, model, stop_reason: "success" }), chatId || null);
        } else if (sdkMsg.subtype === "error_max_turns") {
          // Max turns reached — treat as a normal completion with a notice
          const sid = state.resolvedSid || [...sessionIds.entries()].find(([, v]) => v === claudeSessionId)?.[0];
          const inputTokens = sdkMsg.usage?.input_tokens || 0;
          const outputTokens = sdkMsg.usage?.output_tokens || 0;
          const cacheReadTokens = sdkMsg.usage?.cache_read_input_tokens || 0;
          const cacheCreationTokens = sdkMsg.usage?.cache_creation_input_tokens || 0;
          const model = Object.keys(sdkMsg.modelUsage || {})[0] || sessionModel;
          if (sid) await addCost(sid, sdkMsg.total_cost_usd || 0, sdkMsg.duration_ms || 0, sdkMsg.num_turns || 0, inputTokens, outputTokens, { model, stopReason: "error_max_turns", isError: 0, cacheReadTokens, cacheCreationTokens });
          wsSend({ type: "result", duration_ms: sdkMsg.duration_ms, num_turns: sdkMsg.num_turns, cost_usd: sdkMsg.total_cost_usd, totalCost: await getTotalCost(), input_tokens: inputTokens, output_tokens: outputTokens, cache_read_tokens: cacheReadTokens, cache_creation_tokens: cacheCreationTokens, model, stop_reason: "error_max_turns" });
          wsSend({ type: "error", error: `Reached max turns limit (${sdkMsg.num_turns}). Send another message to continue.` });
        } else if (sdkMsg.subtype?.startsWith("error")) {
          const errMsg = sdkMsg.errors?.join(", ") || sdkMsg.error || sdkMsg.message || "Unknown error";
          console.error("SDK result error:", JSON.stringify(sdkMsg));
          const costUsd = sdkMsg.total_cost_usd || 0;
          const durationMs = sdkMsg.duration_ms || 0;
          const numTurns = sdkMsg.num_turns || 0;
          const inputTokens = sdkMsg.usage?.input_tokens || 0;
          const outputTokens = sdkMsg.usage?.output_tokens || 0;
          const cacheReadTokens = sdkMsg.usage?.cache_read_input_tokens || 0;
          const cacheCreationTokens = sdkMsg.usage?.cache_creation_input_tokens || 0;
          const model = Object.keys(sdkMsg.modelUsage || {})[0] || sessionModel;
          const sid = state.resolvedSid || [...sessionIds.entries()].find(([, v]) => v === claudeSessionId)?.[0];
          state.lastChatMetrics = { durationMs, costUsd, inputTokens, outputTokens, model, turns: numTurns, isError: true, error: errMsg };
          if (sid) {
            await addCost(sid, costUsd, durationMs, numTurns, inputTokens, outputTokens, { model, stopReason: sdkMsg.subtype, isError: 1, cacheReadTokens, cacheCreationTokens });
            await addMessage(sid, "error", JSON.stringify({ error: errMsg, subtype: sdkMsg.subtype, duration_ms: durationMs, cost_usd: costUsd, model }), chatId || null);
          }
          wsSend({ type: "error", error: errMsg });
        }
        continue;
      }

      if (sdkMsg.type === "user" && sdkMsg.message?.content) {
        const blocks = Array.isArray(sdkMsg.message.content) ? sdkMsg.message.content : [];
        for (const block of blocks) {
          if (block.type === "tool_result") {
            const text = Array.isArray(block.content) ? block.content.map(c => c.type === "text" ? c.text : "").join("") : typeof block.content === "string" ? block.content : "";
            const wirePayload = { toolUseId: block.tool_use_id, content: text.slice(0, 2000), isError: block.is_error || false };
            wsSend({ type: "tool_result", ...wirePayload });
            if (state.resolvedSid) {
              const dbPayload = { toolUseId: block.tool_use_id, content: text.slice(0, 10000), isError: block.is_error || false };
              await addMessage(state.resolvedSid, "tool_result", JSON.stringify(dbPayload), chatId || null);
            }
          }
        }
        continue;
      }
    }
  }

  try {
    await runChatQuery(opts);
    wsSend({ type: "done" });
  } catch (err) {
    if (err.name === "AbortError") {
      if (state.resolvedSid) await addMessage(state.resolvedSid, "aborted", JSON.stringify({ timestamp: Date.now() }), chatId || null);
      wsSend({ type: "aborted" });
    } else {
      const stderrOutput = stderrChunks.join("");
      // Retry without resume if the Claude session no longer exists
      if (opts.resume && stderrOutput.includes("No conversation found")) {
        console.warn("Stale session", opts.resume, "— retrying without resume");
        delete opts.resume;
        sessionIds.delete(sessionKey);
        stderrChunks.length = 0;
        try {
          await runChatQuery(opts);
          wsSend({ type: "done" });
        } catch (retryErr) {
          if (retryErr.name === "AbortError") {
            if (state.resolvedSid) await addMessage(state.resolvedSid, "aborted", JSON.stringify({ timestamp: Date.now() }), chatId || null);
            wsSend({ type: "aborted" });
          } else {
            console.error("Query retry error:", retryErr.message);
            wsSend({ type: "error", error: retryErr.message });
          }
        }
      } else {
        console.error("Query error:", err.message, stderrOutput ? "\nstderr: " + stderrOutput : "");
        wsSend({ type: "error", error: err.message });
      }
    }
  } finally {
    activeQueries.delete(queryKey);
    unregisterGlobalQuery(state.resolvedSid, queryKey);
    // Send push notification when query completes
    const session = state.resolvedSid ? await getSession(state.resolvedSid) : null;
    const pushTitle = session?.title || "Session complete";
    sendPushNotification("Claudeck", pushTitle, `chat-${state.resolvedSid}`);

    // Rich Telegram notification — meaningful for AFK developer
    const userQuery = (message || "").slice(0, 150).split("\n")[0];
    const answerSnippet = state.lastAssistantText
      ? state.lastAssistantText.slice(0, 300).replace(/\n{2,}/g, "\n")
      : "";

    if (state.lastChatMetrics.isError) {
      const errorBody = [
        userQuery ? `Q: ${userQuery}` : "",
        `Error: ${state.lastChatMetrics.error || "Unknown error"}`,
      ].filter(Boolean).join("\n");
      sendTelegramNotification("error", "Session Failed", errorBody, {
        durationMs: state.lastChatMetrics.durationMs,
        costUsd: state.lastChatMetrics.costUsd,
        inputTokens: state.lastChatMetrics.inputTokens,
        outputTokens: state.lastChatMetrics.outputTokens,
        model: state.lastChatMetrics.model,
      });
    } else {
      const body = [
        userQuery ? `Q: ${userQuery}` : pushTitle,
        answerSnippet ? `\nA: ${answerSnippet}` : "",
      ].filter(Boolean).join("\n");
      sendTelegramNotification("session", "Session Complete", body, {
        durationMs: state.lastChatMetrics.durationMs,
        costUsd: state.lastChatMetrics.costUsd,
        inputTokens: state.lastChatMetrics.inputTokens,
        outputTokens: state.lastChatMetrics.outputTokens,
        model: state.lastChatMetrics.model,
        turns: state.lastChatMetrics.turns,
      });
    }

    // Fire-and-forget summary generation
    if (state.resolvedSid) {
      generateSessionSummary(state.resolvedSid).catch(err =>
        console.error("Summary generation error:", err.message)
      );
    }

    // Auto-capture memories from assistant output
    if (cwd && state.lastAssistantText) {
      try {
        // 1. Parse explicit ```memory blocks (Claude-requested saves)
        const explicitCount = await saveExplicitMemories(cwd, state.lastAssistantText, state.resolvedSid);

        // 2. Heuristic extraction from assistant text
        const autoCount = await captureMemories(cwd, state.lastAssistantText, state.resolvedSid, null);

        const totalCaptured = explicitCount + autoCount;
        if (totalCaptured > 0) {
          console.log(`Captured ${totalCaptured} memories (${explicitCount} explicit, ${autoCount} auto) from session ${state.resolvedSid}`);
          // Notify client
          if (ws.readyState === 1) {
            const payload = { type: "memories_captured", count: totalCaptured, explicit: explicitCount, auto: autoCount };
            if (chatId) payload.chatId = chatId;
            ws.send(JSON.stringify(payload));
          }
        }
      } catch (e) { console.error("Memory capture error:", e.message); }
    }

    // Worktree post-completion: auto-commit, diff stats, notify
    if (worktreeRecord) {
      try {
        if (state.resolvedSid) await updateWorktreeSession(worktreeRecord.id, state.resolvedSid);

        const commitMsg = `claudeck: ${(message || "worktree changes").slice(0, 72)}`;
        await autoCommitWorktree(worktreeRecord.worktreePath, commitMsg);

        const stats = await getWorktreeDiffStats(worktreeRecord.worktreePath, worktreeRecord.baseBranch);
        await updateWorktreeStatus(worktreeRecord.id, "completed");

        if (ws.readyState === 1) {
          const wtPayload = {
            type: "worktree_completed",
            worktreeId: worktreeRecord.id,
            branchName: worktreeRecord.branchName,
            stats,
          };
          if (chatId) wtPayload.chatId = chatId;
          ws.send(JSON.stringify(wtPayload));
        }

        await logNotification(
          "worktree",
          `Worktree "${worktreeRecord.branchName}" ready`,
          `+${stats.insertions} -${stats.deletions} lines in ${stats.files} file(s)`,
          JSON.stringify({ worktreeId: worktreeRecord.id, branchName: worktreeRecord.branchName }),
          state.resolvedSid,
          null
        );
      } catch (e) {
        console.error("Worktree post-completion error:", e.message);
      }
    }
  }
}

// ── Main entry point: thin router ─────────────────────────────────────────
export function setupWebSocket(wss, sessionIds) {
  wss.on("connection", (ws) => {
    const ctx = { ws, sessionIds, activeQueries: new Map(), pendingApprovals: new Map() };

    ws.on("close", () => handleClose(ctx));

    ws.on("message", async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.type === "abort") return handleAbort(msg, ctx);
      if (msg.type === "permission_response") return handlePermissionResponse(msg, ctx);
      if (msg.type === "workflow") return handleWorkflow(msg, ctx);
      if (msg.type === "agent") return handleAgent(msg, ctx);
      if (msg.type === "agent_chain") return handleAgentChain(msg, ctx);
      if (msg.type === "agent_dag") return handleDag(msg, ctx);
      if (msg.type === "orchestrate") return handleOrchestrate(msg, ctx);
      if (msg.type === "chat") return handleChat(msg, ctx);
    });
  });
}

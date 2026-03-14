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
} from "../db.js";
import { getProjectSystemPrompt } from "./routes/projects.js";

// Map short model names to current model IDs
const MODEL_MAP = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6",
};
function resolveModel(name) {
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
const READ_ONLY_TOOLS = new Set([
  "Read", "Glob", "Grep", "WebSearch", "WebFetch", "Agent",
  "TodoRead", "TaskRead", "NotebookRead", "LS", "View", "ListFiles",
  "TaskList", "TaskGet",
]);

const DEFAULT_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes (web)
function getApprovalTimeoutMs() {
  const cfg = getTelegramConfig();
  if (telegramEnabled()) {
    return (cfg.afkTimeoutMinutes || 15) * 60 * 1000;
  }
  return DEFAULT_APPROVAL_TIMEOUT_MS;
}

// Global tracking of active queries across all connections
// Key: sessionId, Value: Set<queryKey>
const globalActiveQueries = new Map();

function registerGlobalQuery(sessionId, queryKey) {
  if (!sessionId) return;
  if (!globalActiveQueries.has(sessionId)) {
    globalActiveQueries.set(sessionId, new Set());
  }
  globalActiveQueries.get(sessionId).add(queryKey);
}

function unregisterGlobalQuery(sessionId, queryKey) {
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
async function processSdkStream(q, { ws, wsSend, sessionIds, clientSid, chatId, cwd, projectName, isWorkflow, stepLabel, workflowId, stepIndex }) {
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

      if (!getSession(ourSid)) {
        createSession(ourSid, claudeSessionId, projectName || "Session", cwd || "");
        if (isWorkflow) {
          updateSessionTitle(ourSid, `Workflow: ${stepLabel}`);
        }
      } else {
        updateClaudeSessionId(ourSid, claudeSessionId);
      }

      if (chatId) {
        setClaudeSession(ourSid, chatId, claudeSessionId);
      }

      wsSend({ type: "session", sessionId: ourSid });

      const msgText = isWorkflow ? `[${stepLabel}]` : null;
      // Save user message now that we have a resolved sid
      if (!isWorkflow) {
        // user message saved by caller for chat; for workflow, save with step label
      }
      if (isWorkflow) {
        addMessage(resolvedSid, "user", JSON.stringify({ text: msgText }), null, wfMeta);
      }

      if (!isWorkflow) {
        // Auto-set session title from first user message
        const existingSession = getSession(ourSid);
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
            addMessage(resolvedSid, "assistant", JSON.stringify({ text: block.text }), chatId || null, wfMeta);
          }
        } else if (block.type === "tool_use") {
          wsSend({ type: "tool", id: block.id, name: block.name, input: block.input });
          if (resolvedSid) {
            addMessage(resolvedSid, "tool", JSON.stringify({ id: block.id, name: block.name, input: block.input }), chatId || null, wfMeta);
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
          addCost(sid, costUsd, durationMs, numTurns, inputTokens, outputTokens, { model, stopReason: "success", isError: 0, cacheReadTokens, cacheCreationTokens });
        }

        wsSend({
          type: "result",
          duration_ms: sdkMsg.duration_ms,
          num_turns: sdkMsg.num_turns,
          cost_usd: sdkMsg.total_cost_usd,
          totalCost: getTotalCost(),
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cache_read_tokens: cacheReadTokens,
          cache_creation_tokens: cacheCreationTokens,
          model,
          stop_reason: "success",
        });

        lastMetrics = { durationMs, costUsd, inputTokens, outputTokens, model, turns: numTurns, isError: false };

        if (resolvedSid) {
          addMessage(resolvedSid, "result", JSON.stringify({
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
          addCost(sid, costUsd, durationMs, numTurns, inputTokens, outputTokens, { model, stopReason: sdkMsg.subtype, isError: 1, cacheReadTokens, cacheCreationTokens });
          addMessage(sid, "error", JSON.stringify({ error: errMsg, subtype: sdkMsg.subtype, duration_ms: durationMs, cost_usd: costUsd, model }), chatId || null, wfMeta);
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
            addMessage(resolvedSid, "tool_result", JSON.stringify(dbPayload), chatId || null, wfMeta);
          }
        }
      }
      continue;
    }
  }

  return { claudeSessionId, resolvedSid, lastMetrics };
}

export function setupWebSocket(wss, sessionIds) {
  wss.on("connection", (ws) => {
    const activeQueries = new Map();
    const pendingApprovals = new Map();

    // Abort active queries and deny all pending approvals on disconnect
    ws.on("close", () => {
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
    });

    ws.on("message", async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      // Abort handler
      if (msg.type === "abort") {
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
        return;
      }

      // Permission response handler (from web UI)
      if (msg.type === "permission_response") {
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
        return;
      }

      // Workflow handler
      if (msg.type === "workflow") {
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
        return;
      }

      // Agent handler
      if (msg.type === "agent") {
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
        return;
      }

      // Agent chain handler — sequential multi-agent execution with context passing
      if (msg.type === "agent_chain") {
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
        return;
      }

      // DAG handler — runs agents in dependency order with parallelism
      if (msg.type === "agent_dag") {
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
        return;
      }

      // Orchestrator handler — meta-agent that decomposes tasks and delegates
      if (msg.type === "orchestrate") {
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
        return;
      }

      // Chat handler
      if (msg.type !== "chat") return;

      const { message, cwd, sessionId: clientSid, projectName, chatId, permissionMode: clientPermMode, model: chatModel, maxTurns: clientMaxTurns, images, systemPrompt, disabledTools } = msg;
      const queryKey = chatId || "__default__";

      const sessionKey = chatId ? `${clientSid}::${chatId}` : clientSid;
      const resumeId = clientSid ? sessionIds.get(sessionKey) : undefined;

      if (clientSid && getSession(clientSid)) {
        touchSession(clientSid);
      }

      const abortController = new AbortController();
      const effectivePermMode = clientPermMode || "bypass";
      const useBypass = effectivePermMode === "bypass";
      const usePlan = effectivePermMode === "plan";
      const resolvedCwd = (cwd && existsSync(cwd)) ? cwd : homedir();
      const stderrChunks = [];
      const effectiveMaxTurns = clientMaxTurns > 0 ? clientMaxTurns : undefined;
      const opts = {
        cwd: resolvedCwd,
        permissionMode: usePlan ? "plan" : (useBypass ? "bypassPermissions" : "default"),
        abortController,
        executable: execPath,
        stderr: (text) => stderrChunks.push(text),
      };
      if (effectiveMaxTurns) opts.maxTurns = effectiveMaxTurns;

      if (!useBypass && !usePlan) {
        opts.canUseTool = makeCanUseTool(ws, pendingApprovals, effectivePermMode, chatId, projectName || "Chat");
      }
      if (chatModel) opts.model = resolveModel(chatModel);
      if (Array.isArray(disabledTools) && disabledTools.length > 0) {
        opts.disallowedTools = disabledTools;
      }

      const projectPrompt = getProjectSystemPrompt(cwd);
      if (projectPrompt) opts.appendSystemPrompt = projectPrompt;
      if (systemPrompt) {
        opts.appendSystemPrompt = (opts.appendSystemPrompt || '') +
          (opts.appendSystemPrompt ? '\n\n' : '') + systemPrompt;
      }
      if (resumeId) opts.resume = resumeId;

      let resolvedSid = clientSid;

      function wsSend(payload) {
        if (ws.readyState !== 1) return;
        if (chatId) payload.chatId = chatId;
        if (resolvedSid) payload.sessionId = resolvedSid;
        ws.send(JSON.stringify(payload));
      }

      // Register for global tracking if we already know the session
      if (clientSid) registerGlobalQuery(clientSid, queryKey);

      function buildPrompt(text, imgs) {
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

      let lastChatMetrics = {};
      let lastAssistantText = "";

      async function runQuery(queryOpts) {
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
            resolvedSid = ourSid;

            const sKey = chatId ? `${ourSid}::${chatId}` : ourSid;
            sessionIds.set(sKey, claudeSessionId);

            if (!getSession(ourSid)) {
              createSession(ourSid, claudeSessionId, projectName || "Session", cwd || "");
            } else {
              updateClaudeSessionId(ourSid, claudeSessionId);
            }

            if (chatId) {
              setClaudeSession(ourSid, chatId, claudeSessionId);
            }

            wsSend({ type: "session", sessionId: ourSid });
            const userMsgData = { text: message };
            if (images?.length) {
              userMsgData.images = images.map(i => ({ name: i.name, data: i.data, mimeType: i.mimeType }));
            }
            addMessage(resolvedSid, "user", JSON.stringify(userMsgData), chatId || null);

            // Register global query tracking now that we know the session
            if (!clientSid) registerGlobalQuery(resolvedSid, queryKey);

            const existingSession = getSession(ourSid);
            if (existingSession && !existingSession.title) {
              const title = message.slice(0, 100).split("\n")[0];
              updateSessionTitle(ourSid, title);
            }
            continue;
          }

          if (sdkMsg.type === "assistant" && sdkMsg.message?.content) {
            for (const block of sdkMsg.message.content) {
              if (block.type === "text" && block.text) {
                lastAssistantText = block.text;
                wsSend({ type: "text", text: block.text });
                if (resolvedSid) addMessage(resolvedSid, "assistant", JSON.stringify({ text: block.text }), chatId || null);
              } else if (block.type === "tool_use") {
                wsSend({ type: "tool", id: block.id, name: block.name, input: block.input });
                if (resolvedSid) addMessage(resolvedSid, "tool", JSON.stringify({ id: block.id, name: block.name, input: block.input }), chatId || null);
              }
            }
            continue;
          }

          if (sdkMsg.type === "result") {
            if (sdkMsg.subtype === "success") {
              const sid = resolvedSid || [...sessionIds.entries()].find(([, v]) => v === claudeSessionId)?.[0];
              const inputTokens = sdkMsg.usage?.input_tokens || 0;
              const outputTokens = sdkMsg.usage?.output_tokens || 0;
              const cacheReadTokens = sdkMsg.usage?.cache_read_input_tokens || 0;
              const cacheCreationTokens = sdkMsg.usage?.cache_creation_input_tokens || 0;
              const model = Object.keys(sdkMsg.modelUsage || {})[0] || sessionModel;
              if (sid) addCost(sid, sdkMsg.total_cost_usd || 0, sdkMsg.duration_ms || 0, sdkMsg.num_turns || 0, inputTokens, outputTokens, { model, stopReason: "success", isError: 0, cacheReadTokens, cacheCreationTokens });
              wsSend({ type: "result", duration_ms: sdkMsg.duration_ms, num_turns: sdkMsg.num_turns, cost_usd: sdkMsg.total_cost_usd, totalCost: getTotalCost(), input_tokens: inputTokens, output_tokens: outputTokens, cache_read_tokens: cacheReadTokens, cache_creation_tokens: cacheCreationTokens, model, stop_reason: "success" });
              lastChatMetrics = { durationMs: sdkMsg.duration_ms, costUsd: sdkMsg.total_cost_usd, inputTokens, outputTokens, model, turns: sdkMsg.num_turns, isError: false };
              if (resolvedSid) addMessage(resolvedSid, "result", JSON.stringify({ duration_ms: sdkMsg.duration_ms, num_turns: sdkMsg.num_turns, cost_usd: sdkMsg.total_cost_usd, input_tokens: inputTokens, output_tokens: outputTokens, cache_read_tokens: cacheReadTokens, cache_creation_tokens: cacheCreationTokens, model, stop_reason: "success" }), chatId || null);
            } else if (sdkMsg.subtype === "error_max_turns") {
              // Max turns reached — treat as a normal completion with a notice
              const sid = resolvedSid || [...sessionIds.entries()].find(([, v]) => v === claudeSessionId)?.[0];
              const inputTokens = sdkMsg.usage?.input_tokens || 0;
              const outputTokens = sdkMsg.usage?.output_tokens || 0;
              const cacheReadTokens = sdkMsg.usage?.cache_read_input_tokens || 0;
              const cacheCreationTokens = sdkMsg.usage?.cache_creation_input_tokens || 0;
              const model = Object.keys(sdkMsg.modelUsage || {})[0] || sessionModel;
              if (sid) addCost(sid, sdkMsg.total_cost_usd || 0, sdkMsg.duration_ms || 0, sdkMsg.num_turns || 0, inputTokens, outputTokens, { model, stopReason: "error_max_turns", isError: 0, cacheReadTokens, cacheCreationTokens });
              wsSend({ type: "result", duration_ms: sdkMsg.duration_ms, num_turns: sdkMsg.num_turns, cost_usd: sdkMsg.total_cost_usd, totalCost: getTotalCost(), input_tokens: inputTokens, output_tokens: outputTokens, cache_read_tokens: cacheReadTokens, cache_creation_tokens: cacheCreationTokens, model, stop_reason: "error_max_turns" });
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
              const sid = resolvedSid || [...sessionIds.entries()].find(([, v]) => v === claudeSessionId)?.[0];
              lastChatMetrics = { durationMs, costUsd, inputTokens, outputTokens, model, turns: numTurns, isError: true, error: errMsg };
              if (sid) {
                addCost(sid, costUsd, durationMs, numTurns, inputTokens, outputTokens, { model, stopReason: sdkMsg.subtype, isError: 1, cacheReadTokens, cacheCreationTokens });
                addMessage(sid, "error", JSON.stringify({ error: errMsg, subtype: sdkMsg.subtype, duration_ms: durationMs, cost_usd: costUsd, model }), chatId || null);
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
                if (resolvedSid) {
                  const dbPayload = { toolUseId: block.tool_use_id, content: text.slice(0, 10000), isError: block.is_error || false };
                  addMessage(resolvedSid, "tool_result", JSON.stringify(dbPayload), chatId || null);
                }
              }
            }
            continue;
          }
        }
      }

      try {
        await runQuery(opts);
        wsSend({ type: "done" });
      } catch (err) {
        if (err.name === "AbortError") {
          if (resolvedSid) addMessage(resolvedSid, "aborted", JSON.stringify({ timestamp: Date.now() }), chatId || null);
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
              await runQuery(opts);
              wsSend({ type: "done" });
            } catch (retryErr) {
              if (retryErr.name === "AbortError") {
                if (resolvedSid) addMessage(resolvedSid, "aborted", JSON.stringify({ timestamp: Date.now() }), chatId || null);
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
        unregisterGlobalQuery(resolvedSid, queryKey);
        // Send push notification when query completes
        const session = resolvedSid ? getSession(resolvedSid) : null;
        const pushTitle = session?.title || "Session complete";
        sendPushNotification("Claudeck", pushTitle, `chat-${resolvedSid}`);

        // Rich Telegram notification — meaningful for AFK developer
        const userQuery = (message || "").slice(0, 150).split("\n")[0];
        const answerSnippet = lastAssistantText
          ? lastAssistantText.slice(0, 300).replace(/\n{2,}/g, "\n")
          : "";

        if (lastChatMetrics.isError) {
          const errorBody = [
            userQuery ? `Q: ${userQuery}` : "",
            `Error: ${lastChatMetrics.error || "Unknown error"}`,
          ].filter(Boolean).join("\n");
          sendTelegramNotification("error", "Session Failed", errorBody, {
            durationMs: lastChatMetrics.durationMs,
            costUsd: lastChatMetrics.costUsd,
            inputTokens: lastChatMetrics.inputTokens,
            outputTokens: lastChatMetrics.outputTokens,
            model: lastChatMetrics.model,
          });
        } else {
          const body = [
            userQuery ? `Q: ${userQuery}` : pushTitle,
            answerSnippet ? `\nA: ${answerSnippet}` : "",
          ].filter(Boolean).join("\n");
          sendTelegramNotification("session", "Session Complete", body, {
            durationMs: lastChatMetrics.durationMs,
            costUsd: lastChatMetrics.costUsd,
            inputTokens: lastChatMetrics.inputTokens,
            outputTokens: lastChatMetrics.outputTokens,
            model: lastChatMetrics.model,
            turns: lastChatMetrics.turns,
          });
        }

        // Fire-and-forget summary generation
        if (resolvedSid) {
          generateSessionSummary(resolvedSid).catch(err =>
            console.error("Summary generation error:", err.message)
          );
        }
      }
    });
  });
}

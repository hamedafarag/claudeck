import { query } from "@anthropic-ai/claude-code";
import { execPath } from "process";
import { existsSync } from "fs";
import { homedir } from "os";

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
  setAgentContext,
  getAllAgentContext,
  recordAgentRunStart,
  recordAgentRunComplete,
} from "../db.js";
import { getProjectSystemPrompt } from "./routes/projects.js";
import { sendPushNotification } from "./push-sender.js";
import { sendTelegramNotification } from "./telegram-sender.js";
import { buildAgentMemoryPrompt } from "./memory-injector.js";
import { captureMemories } from "./memory-extractor.js";
import { saveExplicitMemories } from "./memory-injector.js";
import { logNotification } from "./notification-logger.js";

/**
 * Build the agent system prompt that instructs Claude to work autonomously
 * toward the given goal.
 */
function buildAgentPrompt(agentDef, userContext, sharedContext, cwd) {
  let prompt = `You are an autonomous AI agent. Work toward the following goal step by step, using any tools available to you.\n\n`;
  prompt += `## Goal\n${agentDef.goal}\n\n`;
  if (userContext) {
    prompt += `## Additional Context from User\n${userContext}\n\n`;
  }
  // Inject persistent memories from previous sessions
  if (cwd) {
    const memoryPrompt = buildAgentMemoryPrompt(cwd, 8);
    if (memoryPrompt) {
      prompt += memoryPrompt + '\n\n';
      console.log(`\n══════ AGENT MEMORY INJECTION ══════`);
      console.log(`Agent: ${agentDef.title || agentDef.id}`);
      console.log(`Project: ${cwd}`);
      console.log(`Memory prompt (${memoryPrompt.length} chars):`);
      console.log(memoryPrompt);
      console.log(`════════════════════════════════════\n`);
    }
  }
  if (sharedContext && sharedContext.length > 0) {
    prompt += `## Context from Previous Agents\n`;
    prompt += `The following is output from agents that ran before you in this chain. Use this context to inform your work.\n\n`;
    for (const ctx of sharedContext) {
      prompt += `### From: ${ctx.agent_id}\n${ctx.value}\n\n`;
    }
  }
  prompt += `## Instructions\n`;
  prompt += `- Break the goal into logical steps and execute them one by one.\n`;
  prompt += `- Use tools (read files, search, write, run commands) as needed.\n`;
  prompt += `- After completing all steps, provide a clear final summary of what you accomplished.\n`;
  prompt += `- If you encounter a blocker you cannot resolve, explain it clearly and stop.\n`;
  return prompt;
}

/**
 * Run an autonomous agent.
 * This uses a single SDK query() call with high maxTurns so Claude
 * autonomously decides what tools to use and when to stop.
 */
export async function runAgent({
  ws,
  agentDef,
  cwd,
  sessionId: clientSid,
  projectName,
  permissionMode,
  model,
  sessionIds,
  pendingApprovals,
  makeCanUseTool,
  userContext,
  activeQueries,
  chainResumeId,
  runId,
  runType,
  parentRunId,
}) {
  const agentId = agentDef.id;
  const maxTurns = agentDef.constraints?.maxTurns || 50;
  const timeoutMs = agentDef.constraints?.timeoutMs || 300000;

  // Record run start for monitoring dashboard
  const monitorRunId = runId || `single-${Date.now()}`;
  const effectiveRunType = runType || 'single';
  try {
    recordAgentRunStart(monitorRunId, agentId, agentDef.title, effectiveRunType, parentRunId);
  } catch (e) { /* ignore duplicates */ }

  function agentSend(payload) {
    if (ws.readyState !== 1) return;
    ws.send(JSON.stringify(payload));
  }

  // Notify client that agent has started
  agentSend({
    type: "agent_started",
    agentId,
    title: agentDef.title,
    goal: agentDef.goal,
    maxTurns,
  });

  const abortController = new AbortController();
  const queryKey = `agent-${agentId}-${Date.now()}`;
  if (activeQueries) {
    activeQueries.set(queryKey, { abort: () => abortController.abort() });
  }

  // Set up timeout
  const timeoutHandle = setTimeout(() => {
    abortController.abort();
    agentSend({ type: "agent_error", error: "Agent reached time limit", agentId });
  }, timeoutMs);

  const effectivePermMode = permissionMode || "bypass";
  const useBypass = effectivePermMode === "bypass";
  const usePlan = effectivePermMode === "plan";
  const resolvedCwd = (cwd && existsSync(cwd)) ? cwd : homedir();

  const opts = {
    cwd: resolvedCwd,
    permissionMode: usePlan ? "plan" : (useBypass ? "bypassPermissions" : "default"),
    abortController,
    maxTurns,
    executable: execPath,
  };

  if (!useBypass && !usePlan) {
    opts.canUseTool = makeCanUseTool(ws, pendingApprovals, effectivePermMode, null, agentDef.title || "Agent");
  }
  if (model) opts.model = resolveModel(model);

  const projectPrompt = getProjectSystemPrompt(cwd);
  if (projectPrompt) opts.appendSystemPrompt = projectPrompt;

  // Resume existing session — explicit chainResumeId takes priority
  const resumeId = chainResumeId || (clientSid ? sessionIds.get(clientSid) : undefined);
  if (resumeId) opts.resume = resumeId;

  // Load shared context from previous agents in this run
  const sharedContext = runId ? getAllAgentContext(runId) : [];
  const prompt = buildAgentPrompt(agentDef, userContext, sharedContext, cwd);
  let resolvedSid = clientSid;
  let claudeSessionId = null;
  let sessionModel = null;
  let turnCount = 0;
  let lastAssistantText = "";
  let lastAgentMetrics = {};

  try {
    const q = query({ prompt, options: opts });

    for await (const sdkMsg of q) {
      if (ws.readyState !== 1) break;

      // Init message — session setup
      if (sdkMsg.type === "system" && sdkMsg.subtype === "init") {
        claudeSessionId = sdkMsg.session_id;
        if (sdkMsg.model) sessionModel = sdkMsg.model;
        const ourSid = clientSid || crypto.randomUUID();
        resolvedSid = ourSid;

        sessionIds.set(ourSid, claudeSessionId);

        if (!getSession(ourSid)) {
          createSession(ourSid, claudeSessionId, projectName || "Agent Session", cwd || "");
          updateSessionTitle(ourSid, `Agent: ${agentDef.title}`);
        } else {
          updateClaudeSessionId(ourSid, claudeSessionId);
        }

        agentSend({ type: "session", sessionId: ourSid });
        addMessage(resolvedSid, "user", JSON.stringify({ text: `[Agent: ${agentDef.title}] ${agentDef.goal}` }), null);
        continue;
      }

      // Assistant message — text and tool_use blocks
      if (sdkMsg.type === "assistant" && sdkMsg.message?.content) {
        for (const block of sdkMsg.message.content) {
          if (block.type === "text" && block.text) {
            lastAssistantText += (lastAssistantText ? "\n\n" : "") + block.text;
            agentSend({ type: "text", text: block.text });
            if (resolvedSid) {
              addMessage(resolvedSid, "assistant", JSON.stringify({ text: block.text }), null);
            }
          } else if (block.type === "tool_use") {
            turnCount++;
            agentSend({ type: "tool", id: block.id, name: block.name, input: block.input });
            agentSend({
              type: "agent_progress",
              agentId,
              turn: turnCount,
              maxTurns,
              action: block.name,
              detail: typeof block.input === "object"
                ? (block.input.command || block.input.pattern || block.input.file_path || block.input.query || "").slice(0, 120)
                : "",
            });
            if (resolvedSid) {
              addMessage(resolvedSid, "tool", JSON.stringify({ id: block.id, name: block.name, input: block.input }), null);
            }
          }
        }
        continue;
      }

      // Tool results
      if (sdkMsg.type === "user" && sdkMsg.message?.content) {
        const blocks = Array.isArray(sdkMsg.message.content) ? sdkMsg.message.content : [];
        for (const block of blocks) {
          if (block.type === "tool_result") {
            const text = Array.isArray(block.content)
              ? block.content.map(c => c.type === "text" ? c.text : "").join("")
              : typeof block.content === "string" ? block.content : "";
            agentSend({
              type: "tool_result",
              toolUseId: block.tool_use_id,
              content: text.slice(0, 2000),
              isError: block.is_error || false,
            });
            if (resolvedSid) {
              addMessage(resolvedSid, "tool_result", JSON.stringify({
                toolUseId: block.tool_use_id,
                content: text.slice(0, 10000),
                isError: block.is_error || false,
              }), null);
            }
          }
        }
        continue;
      }

      // Result message
      if (sdkMsg.type === "result") {
        if (sdkMsg.subtype === "success" || sdkMsg.subtype === "error_max_turns") {
          const costUsd = sdkMsg.total_cost_usd || 0;
          const durationMs = sdkMsg.duration_ms || 0;
          const numTurns = sdkMsg.num_turns || 0;
          const inputTokens = sdkMsg.usage?.input_tokens || 0;
          const outputTokens = sdkMsg.usage?.output_tokens || 0;
          const cacheReadTokens = sdkMsg.usage?.cache_read_input_tokens || 0;
          const cacheCreationTokens = sdkMsg.usage?.cache_creation_input_tokens || 0;
          const resultModel = Object.keys(sdkMsg.modelUsage || {})[0] || sessionModel;

          if (resolvedSid) {
            addCost(resolvedSid, costUsd, durationMs, numTurns, inputTokens, outputTokens, {
              model: resultModel,
              stopReason: sdkMsg.subtype,
              isError: 0,
              cacheReadTokens,
              cacheCreationTokens,
            });
          }

          agentSend({
            type: "result",
            duration_ms: durationMs,
            num_turns: numTurns,
            cost_usd: costUsd,
            totalCost: getTotalCost(),
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cache_read_tokens: cacheReadTokens,
            cache_creation_tokens: cacheCreationTokens,
            model: resultModel,
            stop_reason: sdkMsg.subtype,
          });

          lastAgentMetrics = { durationMs, costUsd, inputTokens, outputTokens, model: resultModel, turns: numTurns, isError: false };

          agentSend({
            type: "agent_completed",
            agentId,
            totalTurns: numTurns,
            durationMs,
            costUsd,
          });

          // Record completion for monitoring
          try {
            recordAgentRunComplete(monitorRunId, agentId, 'completed', numTurns, costUsd, durationMs, inputTokens, outputTokens);
          } catch (e) { /* ignore */ }

          // Log notification
          logNotification('agent', `Agent "${agentDef.title}" completed`,
            `${numTurns} turns · $${costUsd.toFixed(4)} · ${(durationMs / 1000).toFixed(1)}s`,
            JSON.stringify({ costUsd, durationMs, inputTokens, outputTokens, turns: numTurns }),
            resolvedSid, agentId);

          // Store agent output as shared context for downstream agents
          if (runId && lastAssistantText) {
            const summary = lastAssistantText.length > 4000
              ? lastAssistantText.slice(0, 4000) + "\n\n[truncated]"
              : lastAssistantText;
            setAgentContext(runId, agentId, "output", summary);
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
          const resultModel = Object.keys(sdkMsg.modelUsage || {})[0] || sessionModel;

          if (resolvedSid) {
            addCost(resolvedSid, costUsd, durationMs, numTurns, inputTokens, outputTokens, {
              model: resultModel,
              stopReason: sdkMsg.subtype,
              isError: 1,
              cacheReadTokens,
              cacheCreationTokens,
            });
            addMessage(resolvedSid, "error", JSON.stringify({ error: errMsg, subtype: sdkMsg.subtype }), null);
          }

          lastAgentMetrics = { durationMs, costUsd, inputTokens, outputTokens, model: resultModel, turns: numTurns, isError: true, error: errMsg };
          agentSend({ type: "error", error: errMsg });
          agentSend({ type: "agent_error", agentId, error: errMsg, turn: turnCount });

          // Record error for monitoring
          try {
            recordAgentRunComplete(monitorRunId, agentId, 'error', numTurns, costUsd, durationMs, inputTokens, outputTokens, errMsg);
          } catch (e) { /* ignore */ }

          // Log error notification
          logNotification('error', `Agent "${agentDef.title}" failed`,
            errMsg.slice(0, 200),
            JSON.stringify({ costUsd, durationMs, error: errMsg }),
            resolvedSid, agentId);
        }
        continue;
      }
    }
  } catch (err) {
    if (err.name === "AbortError") {
      agentSend({ type: "agent_aborted", agentId, turn: turnCount });
      agentSend({ type: "aborted" });
      try { recordAgentRunComplete(monitorRunId, agentId, 'aborted', turnCount, 0, 0, 0, 0, 'Aborted'); } catch (e) { /* ignore */ }
    } else {
      agentSend({ type: "agent_error", agentId, error: err.message, turn: turnCount });
      agentSend({ type: "error", error: err.message });
      try { recordAgentRunComplete(monitorRunId, agentId, 'error', turnCount, 0, 0, 0, 0, err.message); } catch (e) { /* ignore */ }
    }
    throw err; // Re-throw so callers (chains, DAGs) know the agent failed
  } finally {
    clearTimeout(timeoutHandle);
    if (activeQueries) activeQueries.delete(queryKey);
    agentSend({ type: "done" });
    sendPushNotification("Claudeck", `Agent "${agentDef.title}" completed`, `agent-${resolvedSid}`);

    // Rich Telegram notification — meaningful for AFK developer
    const goalSnippet = agentDef.goal ? agentDef.goal.slice(0, 150).split("\n")[0] : "";
    const outputSnippet = lastAssistantText
      ? lastAssistantText.slice(0, 300).replace(/\n{2,}/g, "\n")
      : "";

    if (lastAgentMetrics.isError) {
      const errorBody = [
        agentDef.title,
        goalSnippet ? `Goal: ${goalSnippet}` : "",
        `Error: ${lastAgentMetrics.error || "Unknown error"}`,
      ].filter(Boolean).join("\n");
      sendTelegramNotification("error", "Agent Failed", errorBody, {
        durationMs: lastAgentMetrics.durationMs,
        costUsd: lastAgentMetrics.costUsd,
        inputTokens: lastAgentMetrics.inputTokens,
        outputTokens: lastAgentMetrics.outputTokens,
        model: lastAgentMetrics.model,
        turns: lastAgentMetrics.turns,
      });
    } else {
      const body = [
        agentDef.title,
        goalSnippet ? `Goal: ${goalSnippet}` : "",
        outputSnippet ? `\nResult: ${outputSnippet}` : "",
      ].filter(Boolean).join("\n");
      sendTelegramNotification("agent", "Agent Completed", body, {
        durationMs: lastAgentMetrics.durationMs,
        costUsd: lastAgentMetrics.costUsd,
        inputTokens: lastAgentMetrics.inputTokens,
        outputTokens: lastAgentMetrics.outputTokens,
        model: lastAgentMetrics.model,
        turns: lastAgentMetrics.turns,
      });
    }

    // Auto-capture memories from agent output
    if (cwd && lastAssistantText) {
      try {
        const explicitCount = saveExplicitMemories(cwd, lastAssistantText, resolvedSid);
        const autoCount = captureMemories(cwd, lastAssistantText, resolvedSid, agentId);
        const totalCaptured = explicitCount + autoCount;
        if (totalCaptured > 0) {
          console.log(`Captured ${totalCaptured} memories (${explicitCount} explicit, ${autoCount} auto) from agent ${agentId}`);
        }
      } catch (e) { console.error("Memory capture error:", e.message); }
    }
  }

  return { resolvedSid, claudeSessionId };
}

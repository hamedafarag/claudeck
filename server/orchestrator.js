/**
 * Meta-Orchestrator — decomposes a user task and delegates to specialist agents.
 *
 * Flow:
 * 1. Run a planner query() with available agent descriptions
 * 2. Parse response for ```agent-dispatch code blocks
 * 3. Execute each dispatched agent via runAgent()
 * 4. Feed results back to orchestrator for synthesis (via session resume)
 */

import { query } from "@anthropic-ai/claude-code";
import { execPath } from "process";
import { existsSync } from "fs";
import { homedir } from "os";
import {
  createSession,
  updateClaudeSessionId,
  getSession,
  addCost,
  addMessage,
  getTotalCost,
  updateSessionTitle,
  setAgentContext,
  getAllAgentContext,
} from "../db.js";
import { getProjectSystemPrompt } from "./routes/projects.js";
import { runAgent } from "./agent-loop.js";
import { sendPushNotification } from "./push-sender.js";
import { sendTelegramNotification } from "./telegram-sender.js";
import { buildAgentMemoryPrompt } from "./memory-injector.js";

const MODEL_MAP = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6",
};
function resolveModel(name) {
  if (!name) return undefined;
  return MODEL_MAP[name] || name;
}

function buildOrchestratorPrompt(task, agents) {
  const agentList = agents
    .map((a) => `- **${a.id}**: ${a.title} — ${a.description}`)
    .join("\n");

  return `You are a task orchestrator. Your job is to analyze a task, break it into sub-tasks, and delegate each to the most appropriate specialist agent.

## Available Agents
${agentList}

## How to Delegate
For each sub-task you want to delegate, output a fenced code block with the language tag \`agent-dispatch\`:

\`\`\`agent-dispatch
{"agent": "agent-id", "context": "Specific instructions for what this agent should focus on"}
\`\`\`

## Rules
- You may dispatch multiple agents. They will run sequentially.
- Each agent will see the outputs of agents that ran before it.
- Choose the most appropriate agent for each sub-task.
- Provide specific, actionable context for each agent — not generic instructions.
- If no agent is suitable for a sub-task, handle it yourself directly.
- After dispatching agents, briefly explain your delegation plan.

## Task
${task}`;
}

function buildOrchestratorPromptWithMemory(task, agents, cwd) {
  let prompt = buildOrchestratorPrompt(task, agents);
  if (cwd) {
    const memPrompt = buildAgentMemoryPrompt(cwd, 6);
    if (memPrompt) {
      prompt += '\n\n' + memPrompt;
    }
  }
  return prompt;
}

function buildSynthesisPrompt(task, agentResults) {
  let prompt = `You previously decomposed the following task and delegated sub-tasks to specialist agents. All agents have completed. Review their outputs and provide a final synthesis.\n\n`;
  prompt += `## Original Task\n${task}\n\n`;
  prompt += `## Agent Results\n`;
  for (const { agentId, agentTitle, output } of agentResults) {
    prompt += `### ${agentTitle} (${agentId})\n${output}\n\n`;
  }
  prompt += `## Instructions\nProvide a concise summary of what was accomplished across all agents. Highlight key findings, changes made, and any remaining issues.`;
  return prompt;
}

function parseDispatchBlocks(text) {
  const dispatches = [];
  const regex = /```agent-dispatch\s*\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed.agent) {
        dispatches.push({
          agentId: parsed.agent,
          context: parsed.context || "",
        });
      }
    } catch {
      // Skip malformed dispatch blocks
    }
  }
  return dispatches;
}

export async function runOrchestrator({
  ws,
  task,
  agents,
  cwd,
  sessionId: clientSid,
  projectName,
  permissionMode,
  model,
  sessionIds,
  pendingApprovals,
  makeCanUseTool,
  activeQueries,
}) {
  const runId = crypto.randomUUID();

  function orchSend(payload) {
    if (ws.readyState !== 1) return;
    ws.send(JSON.stringify(payload));
  }

  orchSend({
    type: "orchestrator_started",
    runId,
    task: task.slice(0, 200),
  });

  const abortController = new AbortController();
  const queryKey = `orchestrator-${runId}`;
  if (activeQueries) {
    activeQueries.set(queryKey, { abort: () => abortController.abort() });
  }

  const effectivePermMode = permissionMode || "bypass";
  const useBypass = effectivePermMode === "bypass";
  const usePlan = effectivePermMode === "plan";
  const resolvedCwd = cwd && existsSync(cwd) ? cwd : homedir();

  const plannerOpts = {
    cwd: resolvedCwd,
    permissionMode: usePlan
      ? "plan"
      : useBypass
        ? "bypassPermissions"
        : "default",
    abortController,
    maxTurns: 3, // Planner should just think, not use many tools
    executable: execPath,
    settingSources: ["user", "project", "local"],
  };

  if (!useBypass && !usePlan) {
    plannerOpts.canUseTool = makeCanUseTool(
      ws,
      pendingApprovals,
      effectivePermMode,
      null,
      `Orchestrator: ${task.slice(0, 40)}`,
    );
  }
  if (model) plannerOpts.model = resolveModel(model);

  const projectPrompt = getProjectSystemPrompt(cwd);
  if (projectPrompt) plannerOpts.appendSystemPrompt = projectPrompt;

  const resumeId = clientSid ? sessionIds.get(clientSid) : undefined;
  if (resumeId) plannerOpts.resume = resumeId;

  let resolvedSid = clientSid;
  let claudeSessionId = null;
  let plannerText = "";

  // ── Phase 1: Planning ──
  orchSend({ type: "orchestrator_phase", phase: "planning" });

  try {
    const prompt = buildOrchestratorPromptWithMemory(task, agents, cwd);
    const q = query({ prompt, options: plannerOpts });

    for await (const sdkMsg of q) {
      if (ws.readyState !== 1) break;

      if (sdkMsg.type === "system" && sdkMsg.subtype === "init") {
        claudeSessionId = sdkMsg.session_id;
        const ourSid = clientSid || crypto.randomUUID();
        resolvedSid = ourSid;
        sessionIds.set(ourSid, claudeSessionId);

        if (!getSession(ourSid)) {
          createSession(
            ourSid,
            claudeSessionId,
            projectName || "Orchestrator",
            cwd || "",
          );
          updateSessionTitle(ourSid, `Orchestrator: ${task.slice(0, 60)}`);
        } else {
          updateClaudeSessionId(ourSid, claudeSessionId);
        }

        orchSend({ type: "session", sessionId: ourSid });
        addMessage(
          resolvedSid,
          "user",
          JSON.stringify({ text: `[Orchestrator] ${task}` }),
          null,
        );
        continue;
      }

      if (sdkMsg.type === "assistant" && sdkMsg.message?.content) {
        for (const block of sdkMsg.message.content) {
          if (block.type === "text" && block.text) {
            plannerText += block.text;
            orchSend({ type: "text", text: block.text });
            if (resolvedSid) {
              addMessage(
                resolvedSid,
                "assistant",
                JSON.stringify({ text: block.text }),
                null,
              );
            }
          }
        }
        continue;
      }

      if (sdkMsg.type === "result") {
        const costUsd = sdkMsg.total_cost_usd || 0;
        const durationMs = sdkMsg.duration_ms || 0;
        const numTurns = sdkMsg.num_turns || 0;
        const inputTokens = sdkMsg.usage?.input_tokens || 0;
        const outputTokens = sdkMsg.usage?.output_tokens || 0;
        const cacheReadTokens =
          sdkMsg.usage?.cache_read_input_tokens || 0;
        const cacheCreationTokens =
          sdkMsg.usage?.cache_creation_input_tokens || 0;
        const resultModel =
          Object.keys(sdkMsg.modelUsage || {})[0] || null;

        if (resolvedSid) {
          addCost(
            resolvedSid,
            costUsd,
            durationMs,
            numTurns,
            inputTokens,
            outputTokens,
            {
              model: resultModel,
              stopReason: sdkMsg.subtype,
              isError: sdkMsg.subtype?.startsWith("error") ? 1 : 0,
              cacheReadTokens,
              cacheCreationTokens,
            },
          );
        }

        orchSend({
          type: "result",
          duration_ms: durationMs,
          num_turns: numTurns,
          cost_usd: costUsd,
          totalCost: getTotalCost(),
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          model: resultModel,
          stop_reason: sdkMsg.subtype,
        });

        if (sdkMsg.subtype?.startsWith("error")) {
          const errMsg = sdkMsg.errors?.join(", ") || "Planning failed";
          orchSend({ type: "error", error: errMsg });
          orchSend({
            type: "orchestrator_error",
            runId,
            error: errMsg,
          });
          return;
        }
        continue;
      }
    }
  } catch (err) {
    orchSend({
      type: "orchestrator_error",
      runId,
      error: err.message,
    });
    orchSend({ type: "error", error: err.message });
    return;
  }

  // ── Phase 2: Parse dispatches and execute agents ──
  const dispatches = parseDispatchBlocks(plannerText);

  if (dispatches.length === 0) {
    // No agents dispatched — orchestrator handled it directly
    orchSend({ type: "orchestrator_completed", runId, dispatched: 0 });
    orchSend({ type: "done" });
    if (activeQueries) activeQueries.delete(queryKey);
    return;
  }

  orchSend({
    type: "orchestrator_dispatching",
    runId,
    dispatches: dispatches.map((d) => ({
      agentId: d.agentId,
      context: d.context.slice(0, 100),
    })),
    totalAgents: dispatches.length,
  });

  const agentResults = [];
  let chainResumeId = claudeSessionId;

  for (let i = 0; i < dispatches.length; i++) {
    const dispatch = dispatches[i];
    const agentDef = agents.find((a) => a.id === dispatch.agentId);

    if (!agentDef) {
      orchSend({
        type: "orchestrator_dispatch_skip",
        runId,
        stepIndex: i,
        agentId: dispatch.agentId,
        reason: "Agent not found",
      });
      continue;
    }

    orchSend({
      type: "orchestrator_dispatch",
      runId,
      stepIndex: i,
      agentId: agentDef.id,
      agentTitle: agentDef.title,
      context: dispatch.context.slice(0, 200),
      status: "running",
    });

    try {
      const result = await runAgent({
        ws,
        agentDef,
        cwd,
        sessionId: resolvedSid,
        projectName: projectName || "Orchestrator",
        permissionMode,
        model,
        sessionIds,
        pendingApprovals,
        makeCanUseTool,
        userContext: dispatch.context,
        activeQueries,
        chainResumeId,
        runId,
      });

      if (result?.resolvedSid) resolvedSid = result.resolvedSid;
      if (result?.claudeSessionId) chainResumeId = result.claudeSessionId;

      // Read context that the agent stored
      const ctx = getAllAgentContext(runId).find(
        (c) => c.agent_id === agentDef.id,
      );

      agentResults.push({
        agentId: agentDef.id,
        agentTitle: agentDef.title,
        output: ctx?.value || "(no output captured)",
      });

      orchSend({
        type: "orchestrator_dispatch",
        runId,
        stepIndex: i,
        agentId: agentDef.id,
        agentTitle: agentDef.title,
        status: "completed",
      });
    } catch (err) {
      orchSend({
        type: "orchestrator_dispatch",
        runId,
        stepIndex: i,
        agentId: agentDef.id,
        agentTitle: agentDef.title,
        status: "error",
        error: err.message,
      });
      if (err.name === "AbortError") break; // Stop dispatching on abort
    }
  }

  // ── Phase 3: Synthesis ──
  if (agentResults.length > 0) {
    orchSend({ type: "orchestrator_phase", phase: "synthesizing" });

    try {
      const synthPrompt = buildSynthesisPrompt(task, agentResults);
      const synthOpts = {
        ...plannerOpts,
        maxTurns: 3,
        resume: chainResumeId,
      };
      delete synthOpts.abortController;
      synthOpts.abortController = new AbortController();

      const sq = query({ prompt: synthPrompt, options: synthOpts });

      for await (const sdkMsg of sq) {
        if (ws.readyState !== 1) break;

        if (sdkMsg.type === "system" && sdkMsg.subtype === "init") {
          if (sdkMsg.session_id) {
            claudeSessionId = sdkMsg.session_id;
            if (resolvedSid) sessionIds.set(resolvedSid, claudeSessionId);
          }
          continue;
        }

        if (sdkMsg.type === "assistant" && sdkMsg.message?.content) {
          for (const block of sdkMsg.message.content) {
            if (block.type === "text" && block.text) {
              orchSend({ type: "text", text: block.text });
              if (resolvedSid) {
                addMessage(
                  resolvedSid,
                  "assistant",
                  JSON.stringify({ text: block.text }),
                  null,
                );
              }
            }
          }
          continue;
        }

        if (sdkMsg.type === "result") {
          const costUsd = sdkMsg.total_cost_usd || 0;
          const durationMs = sdkMsg.duration_ms || 0;
          const numTurns = sdkMsg.num_turns || 0;
          const inputTokens = sdkMsg.usage?.input_tokens || 0;
          const outputTokens = sdkMsg.usage?.output_tokens || 0;
          const cacheReadTokens =
            sdkMsg.usage?.cache_read_input_tokens || 0;
          const cacheCreationTokens =
            sdkMsg.usage?.cache_creation_input_tokens || 0;
          const resultModel =
            Object.keys(sdkMsg.modelUsage || {})[0] || null;

          if (resolvedSid) {
            addCost(
              resolvedSid,
              costUsd,
              durationMs,
              numTurns,
              inputTokens,
              outputTokens,
              {
                model: resultModel,
                stopReason: sdkMsg.subtype,
                isError: 0,
                cacheReadTokens,
                cacheCreationTokens,
              },
            );
          }

          orchSend({
            type: "result",
            duration_ms: durationMs,
            num_turns: numTurns,
            cost_usd: costUsd,
            totalCost: getTotalCost(),
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            model: resultModel,
            stop_reason: sdkMsg.subtype,
          });
          continue;
        }
      }
    } catch (err) {
      orchSend({ type: "error", error: `Synthesis failed: ${err.message}` });
    }
  }

  orchSend({
    type: "orchestrator_completed",
    runId,
    dispatched: agentResults.length,
  });
  orchSend({ type: "done" });

  if (activeQueries) activeQueries.delete(queryKey);

  sendPushNotification(
    "Claudeck",
    `Orchestrator completed (${agentResults.length} agents)`,
    `orch-${resolvedSid}`,
  );
  const agentSummary = agentResults
    .map((r, i) => `  ${i + 1}. ${r.agentTitle || r.agentId}`)
    .join("\n");
  sendTelegramNotification(
    "orchestrator",
    "Orchestrator Completed",
    `${task.slice(0, 200)}\n\nDispatched ${agentResults.length} agents:\n${agentSummary}`,
    { steps: agentResults.length },
  );
}

/**
 * DAG Executor — runs agents in dependency order with parallelism.
 *
 * Topologically sorts nodes, groups by level, and runs each level
 * with Promise.all (max 3 concurrent agents). Shared context flows
 * from completed nodes to dependents via the agent_context table.
 */

import { runAgent } from "./agent-loop.js";
import { sendPushNotification } from "./push-sender.js";
import { sendTelegramNotification } from "./telegram-sender.js";

const MAX_CONCURRENT = 3;

/**
 * Topological sort — returns array of arrays (levels).
 * Each level contains nodes whose dependencies are all in earlier levels.
 */
function topologicalLevels(nodes, edges) {
  const inDegree = new Map();
  const adj = new Map();
  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
  }

  const levels = [];
  const remaining = new Set(nodes.map((n) => n.id));

  while (remaining.size > 0) {
    const level = [];
    for (const id of remaining) {
      if (inDegree.get(id) === 0) level.push(id);
    }
    if (level.length === 0) {
      // Cycle detected — break to avoid infinite loop
      break;
    }
    levels.push(level);
    for (const id of level) {
      remaining.delete(id);
      for (const next of adj.get(id) || []) {
        inDegree.set(next, (inDegree.get(next) || 0) - 1);
      }
    }
  }

  return levels;
}

/**
 * Run agents in batches with a concurrency limit.
 */
async function runBatch(tasks, limit) {
  const results = [];
  for (let i = 0; i < tasks.length; i += limit) {
    const batch = tasks.slice(i, i + limit);
    const batchResults = await Promise.allSettled(batch.map((fn) => fn()));
    results.push(...batchResults);
  }
  return results;
}

export async function runDag({
  ws,
  dag,
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

  function dagSend(payload) {
    if (ws.readyState !== 1) return;
    ws.send(JSON.stringify(payload));
  }

  const levels = topologicalLevels(dag.nodes, dag.edges);
  const nodeMap = new Map(dag.nodes.map((n) => [n.id, n]));

  dagSend({
    type: "dag_started",
    dagId: dag.id,
    runId,
    title: dag.title,
    nodes: dag.nodes.map((n) => ({
      id: n.id,
      agentId: n.agentId,
      title: agents.find((a) => a.id === n.agentId)?.title || n.agentId,
    })),
    edges: dag.edges,
    levels: levels.map((l) => [...l]),
    totalNodes: dag.nodes.length,
  });

  // Telegram start notification
  const nodeNames = dag.nodes.map((n) => {
    const title = agents.find((a) => a.id === n.agentId)?.title || n.agentId;
    return `  \u{2022} ${title}`;
  }).join("\n");
  sendTelegramNotification("start", "DAG Started", `${dag.title}\n\n${dag.nodes.length} nodes:\n${nodeNames}`);

  let resolvedSid = clientSid;
  const failedNodes = new Set();
  let aborted = false;
  // Track which nodes have dependents that failed
  const edgeMap = new Map();
  for (const e of dag.edges) {
    if (!edgeMap.has(e.to)) edgeMap.set(e.to, []);
    edgeMap.get(e.to).push(e.from);
  }

  for (let li = 0; li < levels.length; li++) {
    const level = levels[li];
    if (ws.readyState !== 1 || aborted) break;

    dagSend({
      type: "dag_level",
      dagId: dag.id,
      levelIndex: li,
      nodeIds: level,
      status: "running",
    });

    const tasks = level.map((nodeId) => {
      return async () => {
        const node = nodeMap.get(nodeId);
        if (!node) return;

        // Check if any dependency failed
        const deps = edgeMap.get(nodeId) || [];
        const failedDep = deps.find((d) => failedNodes.has(d));
        if (failedDep) {
          failedNodes.add(nodeId);
          dagSend({
            type: "dag_node",
            dagId: dag.id,
            nodeId,
            agentId: node.agentId,
            status: "skipped",
            reason: `Dependency "${failedDep}" failed`,
          });
          return;
        }

        const agentDef = agents.find((a) => a.id === node.agentId);
        if (!agentDef) {
          failedNodes.add(nodeId);
          dagSend({
            type: "dag_node",
            dagId: dag.id,
            nodeId,
            agentId: node.agentId,
            status: "skipped",
            reason: "Agent not found",
          });
          return;
        }

        dagSend({
          type: "dag_node",
          dagId: dag.id,
          nodeId,
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
            projectName: projectName || `DAG: ${dag.title}`,
            permissionMode,
            model,
            sessionIds,
            pendingApprovals,
            makeCanUseTool,
            activeQueries,
            runId,
            runType: 'dag',
            parentRunId: dag.id,
          });

          if (result?.resolvedSid) resolvedSid = result.resolvedSid;

          dagSend({
            type: "dag_node",
            dagId: dag.id,
            nodeId,
            agentId: agentDef.id,
            agentTitle: agentDef.title,
            status: "completed",
          });
        } catch (err) {
          failedNodes.add(nodeId);
          if (err.name === "AbortError") aborted = true;
          dagSend({
            type: "dag_node",
            dagId: dag.id,
            nodeId,
            agentId: agentDef.id,
            agentTitle: agentDef.title,
            status: err.name === "AbortError" ? "aborted" : "error",
            error: err.message,
          });
        }
      };
    });

    await runBatch(tasks, MAX_CONCURRENT);

    dagSend({
      type: "dag_level",
      dagId: dag.id,
      levelIndex: li,
      nodeIds: level,
      status: "completed",
    });
  }

  dagSend({
    type: "dag_completed",
    dagId: dag.id,
    runId,
    totalNodes: dag.nodes.length,
    succeeded: dag.nodes.length - failedNodes.size,
    failed: failedNodes.size,
  });

  sendPushNotification(
    "Claudeck",
    `DAG "${dag.title}" completed`,
    `dag-${resolvedSid}`,
  );
  const nodeStatus = dag.nodes.map((n) => {
    const title = agents.find((a) => a.id === n.agentId)?.title || n.agentId;
    const icon = failedNodes.has(n.id) ? "\u{274C}" : "\u{2705}";
    return `  ${icon} ${title}`;
  }).join("\n");
  const dagEventType = failedNodes.size > 0 ? "error" : "dag";
  const dagLabel = failedNodes.size > 0 ? "DAG Completed with Failures" : "DAG Completed";
  sendTelegramNotification(
    dagEventType,
    dagLabel,
    `${dag.title}\n\n${nodeStatus}`,
    {
      succeeded: dag.nodes.length - failedNodes.size,
      failed: failedNodes.size,
    },
  );
}

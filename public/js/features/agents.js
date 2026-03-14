// Agents — autonomous AI agents with CRUD + Agent Chains
import { $ } from '../core/dom.js';
import { getState, setState } from '../core/store.js';
import { escapeHtml, scrollToBottom } from '../core/utils.js';
import * as api from '../core/api.js';
import { commandRegistry, registerCommand } from '../ui/commands.js';
import { getPane } from '../ui/parallel.js';
import { showThinking, removeThinking, addStatus } from '../ui/messages.js';
import { getPermissionMode } from '../ui/permissions.js';
import { getSelectedModel } from '../ui/model-selector.js';
import { openDagModal, closeDagModal } from './dag-editor.js';
import { openAgentMonitor } from './agent-monitor.js';
import { renderWorkflowSidebar } from './workflows.js';

// ══════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════

/** Reset streaming state — swap stop→send button, re-enable input */
function finishAgentStreaming(pane) {
  if (!pane) return;
  pane.isStreaming = false;
  if ($.streamingTokens) $.streamingTokens.classList.add("hidden");
  if ($.streamingTokensSep) $.streamingTokensSep.classList.add("hidden");
  const parallelMode = getState("parallelMode");
  if (parallelMode) {
    if (pane.sendBtn) pane.sendBtn.classList.remove("hidden");
    if (pane.stopBtn) pane.stopBtn.classList.add("hidden");
    if (pane.messageInput) pane.messageInput.focus();
  } else {
    $.sendBtn.classList.remove("hidden");
    $.stopBtn.classList.add("hidden");
    $.sendBtn.disabled = false;
    $.messageInput.focus();
  }
}

// ══════════════════════════════════════════════════════════
// Agents
// ══════════════════════════════════════════════════════════

export async function loadAgents() {
  try {
    const [agents, chains, dags] = await Promise.all([
      api.fetchAgents(),
      api.fetchChains(),
      api.fetchDags(),
    ]);
    setState("agents", agents);
    setState("agentChains", chains);
    setState("agentDags", dags);
    renderAgentPanel();
    registerAgentCommands();
  } catch (err) {
    console.error("Failed to load agents:", err);
  }
}

function renderAgentPanel() {
  const agents = getState("agents");
  const chains = getState("agentChains") || [];
  $.agentPanel.innerHTML = "";

  // ── Orchestrate card ──
  const orchCard = document.createElement("div");
  orchCard.className = "toolbox-card agent-card orch-card";
  orchCard.innerHTML = `
    <div class="toolbox-card-title">
      <span class="agent-icon">${getOrchIcon()}</span>
      Orchestrate
    </div>
    <div class="toolbox-card-desc">Describe a task — the orchestrator decomposes it and delegates to the right agents automatically.</div>
  `;
  orchCard.addEventListener("click", () => {
    $.agentSidebar?.classList.add("hidden");
    $.agentBtn.classList.remove("active");
    openOrchModal();
  });
  $.agentPanel.appendChild(orchCard);

  // ── Monitor button ──
  const monitorCard = document.createElement("div");
  monitorCard.className = "toolbox-card agent-card monitor-card";
  monitorCard.innerHTML = `
    <div class="toolbox-card-title">
      <span class="agent-icon">${getMonitorIcon()}</span>
      Agent Monitor
    </div>
    <div class="toolbox-card-desc">Real-time metrics, cost aggregation, and comparative analysis across all agents.</div>
  `;
  monitorCard.addEventListener("click", () => {
    $.agentSidebar?.classList.add("hidden");
    $.agentBtn.classList.remove("active");
    openAgentMonitor();
  });
  $.agentPanel.appendChild(monitorCard);

  // ── Chains section ──
  if (chains.length > 0 || true) {
    const chainHeader = document.createElement("div");
    chainHeader.className = "agent-section-header";
    chainHeader.textContent = "Chains";
    $.agentPanel.appendChild(chainHeader);

    for (const chain of chains) {
      const agentNames = chain.agents.map(id => {
        const a = agents.find(ag => ag.id === id);
        return a ? a.title : id;
      });
      const card = document.createElement("div");
      card.className = "toolbox-card agent-card chain-card";
      card.innerHTML = `
        <div class="agent-card-actions">
          <button class="agent-card-edit" data-chain-id="${escapeHtml(chain.id)}" title="Edit chain">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="agent-card-delete" data-chain-id="${escapeHtml(chain.id)}" title="Delete chain">&times;</button>
        </div>
        <div class="toolbox-card-title">
          <span class="agent-icon">${getChainIcon()}</span>
          ${escapeHtml(chain.title)}
        </div>
        <div class="toolbox-card-desc">${escapeHtml(chain.description || agentNames.join(" → "))}</div>
        <div class="chain-steps-preview">${agentNames.map(n => `<span class="chain-step-tag">${escapeHtml(n)}</span>`).join('<span class="chain-arrow">→</span>')}</div>
      `;
      card.addEventListener("click", (e) => {
        if (e.target.closest(".agent-card-edit") || e.target.closest(".agent-card-delete")) return;
        $.agentSidebar?.classList.add("hidden");
        $.agentBtn.classList.remove("active");
        startChain(chain, getPane(null));
      });
      card.querySelector(".agent-card-edit").addEventListener("click", (e) => {
        e.stopPropagation();
        openChainModal(chain);
      });
      card.querySelector(".agent-card-delete").addEventListener("click", (e) => {
        e.stopPropagation();
        deleteChain(chain.id, chain.title);
      });
      $.agentPanel.appendChild(card);
    }

    const addChainCard = document.createElement("div");
    addChainCard.className = "toolbox-card-add";
    addChainCard.innerHTML = `+ Add Chain`;
    addChainCard.addEventListener("click", () => openChainModal());
    $.agentPanel.appendChild(addChainCard);
  }

  // ── DAGs section ──
  const dags = getState("agentDags") || [];
  {
    const dagHeader = document.createElement("div");
    dagHeader.className = "agent-section-header";
    dagHeader.textContent = "DAGs";
    $.agentPanel.appendChild(dagHeader);

    for (const dag of dags) {
      const nodeNames = dag.nodes.map(n => {
        const a = agents.find(ag => ag.id === n.agentId);
        return a ? a.title : n.agentId;
      });
      const card = document.createElement("div");
      card.className = "toolbox-card agent-card dag-card";
      card.innerHTML = `
        <div class="agent-card-actions">
          <button class="agent-card-edit" data-dag-id="${escapeHtml(dag.id)}" title="Edit DAG">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="agent-card-delete" data-dag-id="${escapeHtml(dag.id)}" title="Delete DAG">&times;</button>
        </div>
        <div class="toolbox-card-title">
          <span class="agent-icon">${getDagIcon()}</span>
          ${escapeHtml(dag.title)}
        </div>
        <div class="toolbox-card-desc">${escapeHtml(dag.description || `${dag.nodes.length} nodes, ${dag.edges.length} edges`)}</div>
        <div class="dag-nodes-preview">${nodeNames.map(n => `<span class="chain-step-tag">${escapeHtml(n)}</span>`).join('')}</div>
      `;
      card.addEventListener("click", (e) => {
        if (e.target.closest(".agent-card-edit") || e.target.closest(".agent-card-delete")) return;
        $.agentSidebar?.classList.add("hidden");
        $.agentBtn.classList.remove("active");
        startDag(dag, getPane(null));
      });
      card.querySelector(".agent-card-edit").addEventListener("click", (e) => {
        e.stopPropagation();
        openDagModal(dag);
      });
      card.querySelector(".agent-card-delete").addEventListener("click", (e) => {
        e.stopPropagation();
        deleteDag(dag.id, dag.title);
      });
      $.agentPanel.appendChild(card);
    }

    const addDagCard = document.createElement("div");
    addDagCard.className = "toolbox-card-add";
    addDagCard.innerHTML = `+ Add DAG`;
    addDagCard.addEventListener("click", () => openDagModal());
    $.agentPanel.appendChild(addDagCard);
  }

  // ── Agents section ──
  const agentHeader = document.createElement("div");
  agentHeader.className = "agent-section-header";
  agentHeader.textContent = "Agents";
  $.agentPanel.appendChild(agentHeader);

  for (const agent of agents) {
    const card = document.createElement("div");
    card.className = "toolbox-card agent-card";
    card.innerHTML = `
      <div class="agent-card-actions">
        <button class="agent-card-edit" data-id="${escapeHtml(agent.id)}" title="Edit agent">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="agent-card-delete" data-id="${escapeHtml(agent.id)}" title="Delete agent">&times;</button>
      </div>
      <div class="toolbox-card-title">
        <span class="agent-icon">${getAgentIcon(agent.icon)}</span>
        ${escapeHtml(agent.title)}
        ${agent.custom ? '<span class="agent-custom-badge">custom</span>' : ''}
      </div>
      <div class="toolbox-card-desc">${escapeHtml(agent.description)}</div>
    `;
    card.addEventListener("click", (e) => {
      if (e.target.closest(".agent-card-edit") || e.target.closest(".agent-card-delete")) return;
      $.agentSidebar?.classList.add("hidden");
      $.agentBtn.classList.remove("active");
      startAgent(agent, getPane(null));
    });
    card.querySelector(".agent-card-edit").addEventListener("click", (e) => {
      e.stopPropagation();
      openAgentModal(agent);
    });
    card.querySelector(".agent-card-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteAgent(agent.id, agent.title);
    });
    $.agentPanel.appendChild(card);
  }

  const addCard = document.createElement("div");
  addCard.className = "toolbox-card-add";
  addCard.innerHTML = `+ Add Agent`;
  addCard.addEventListener("click", () => openAgentModal());
  $.agentPanel.appendChild(addCard);

  // Render workflow cards in the sidebar
  renderWorkflowSidebar();
}

// ══════════════════════════════════════════════════════════
// Agent CRUD Modal
// ══════════════════════════════════════════════════════════

function openAgentModal(agent) {
  $.agentForm.reset();
  if (agent) {
    $.agentModalTitle.textContent = "Edit Agent";
    $.agentFormTitle.value = agent.title;
    $.agentFormDesc.value = agent.description;
    $.agentFormIcon.value = agent.icon || "tool";
    $.agentFormGoal.value = agent.goal;
    $.agentFormMaxTurns.value = agent.constraints?.maxTurns || 50;
    $.agentFormTimeout.value = Math.round((agent.constraints?.timeoutMs || 300000) / 1000);
    $.agentFormEditId.value = agent.id;
  } else {
    $.agentModalTitle.textContent = "New Agent";
    $.agentFormEditId.value = "";
    $.agentFormMaxTurns.value = 50;
    $.agentFormTimeout.value = 300;
  }
  $.agentModal.classList.remove("hidden");
  $.agentFormTitle.focus();
}

function closeAgentModal() {
  $.agentModal.classList.add("hidden");
}

$.agentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const editId = $.agentFormEditId.value;
  const data = {
    title: $.agentFormTitle.value.trim(),
    description: $.agentFormDesc.value.trim(),
    icon: $.agentFormIcon.value,
    goal: $.agentFormGoal.value.trim(),
    constraints: {
      maxTurns: parseInt($.agentFormMaxTurns.value, 10) || 50,
      timeoutMs: (parseInt($.agentFormTimeout.value, 10) || 300) * 1000,
    },
  };
  if (!data.title || !data.goal) return;
  try {
    if (editId) {
      await api.updateAgent(editId, data);
    } else {
      await api.createAgent(data);
    }
    closeAgentModal();
    await loadAgents();
  } catch (err) {
    console.error("Failed to save agent:", err);
    alert(err.message);
  }
});

$.agentModalClose.addEventListener("click", closeAgentModal);
$.agentModalCancel.addEventListener("click", closeAgentModal);
$.agentModal.addEventListener("click", (e) => {
  if (e.target === $.agentModal) closeAgentModal();
});

async function deleteAgent(id, title) {
  if (!confirm(`Delete agent "${title}"?`)) return;
  try {
    await api.deleteAgentApi(id);
    await loadAgents();
  } catch (err) {
    console.error("Failed to delete agent:", err);
  }
}

// ══════════════════════════════════════════════════════════
// Chain CRUD Modal
// ══════════════════════════════════════════════════════════

function openChainModal(chain) {
  $.chainForm.reset();
  $.chainAgentList.innerHTML = "";

  if (chain) {
    $.chainModalTitle.textContent = "Edit Chain";
    $.chainFormTitle.value = chain.title;
    $.chainFormDesc.value = chain.description || "";
    $.chainFormContext.value = chain.contextPassing || "summary";
    $.chainFormEditId.value = chain.id;
    for (const agentId of chain.agents) {
      addChainAgentRow(agentId);
    }
  } else {
    $.chainModalTitle.textContent = "New Chain";
    $.chainFormEditId.value = "";
    $.chainFormContext.value = "summary";
    // Start with two empty rows
    addChainAgentRow();
    addChainAgentRow();
  }
  $.chainModal.classList.remove("hidden");
  $.chainFormTitle.focus();
}

function closeChainModal() {
  $.chainModal.classList.add("hidden");
}

function addChainAgentRow(selectedId) {
  const agents = getState("agents") || [];
  const row = document.createElement("div");
  row.className = "chain-agent-row";

  const stepNum = $.chainAgentList.children.length + 1;
  row.innerHTML = `
    <span class="chain-agent-step">${stepNum}</span>
    <select class="chain-agent-select">
      <option value="">Select agent...</option>
      ${agents.map(a => `<option value="${escapeHtml(a.id)}" ${a.id === selectedId ? 'selected' : ''}>${escapeHtml(a.title)}</option>`).join("")}
    </select>
    <button type="button" class="chain-agent-up" title="Move up">↑</button>
    <button type="button" class="chain-agent-down" title="Move down">↓</button>
    <button type="button" class="chain-agent-remove" title="Remove">&times;</button>
  `;

  row.querySelector(".chain-agent-up").addEventListener("click", () => {
    const prev = row.previousElementSibling;
    if (prev) {
      $.chainAgentList.insertBefore(row, prev);
      renumberChainSteps();
    }
  });

  row.querySelector(".chain-agent-down").addEventListener("click", () => {
    const next = row.nextElementSibling;
    if (next) {
      $.chainAgentList.insertBefore(next, row);
      renumberChainSteps();
    }
  });

  row.querySelector(".chain-agent-remove").addEventListener("click", () => {
    row.remove();
    renumberChainSteps();
  });

  $.chainAgentList.appendChild(row);
}

function renumberChainSteps() {
  const rows = $.chainAgentList.querySelectorAll(".chain-agent-row");
  rows.forEach((row, i) => {
    row.querySelector(".chain-agent-step").textContent = i + 1;
  });
}

$.chainAddAgentBtn.addEventListener("click", () => addChainAgentRow());

$.chainForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const editId = $.chainFormEditId.value;
  const selects = $.chainAgentList.querySelectorAll(".chain-agent-select");
  const agentIds = [...selects].map(s => s.value).filter(Boolean);

  if (agentIds.length < 2) {
    alert("A chain needs at least 2 agents.");
    return;
  }

  const data = {
    title: $.chainFormTitle.value.trim(),
    description: $.chainFormDesc.value.trim(),
    agents: agentIds,
    contextPassing: $.chainFormContext.value,
  };
  if (!data.title) return;

  try {
    if (editId) {
      await api.updateChain(editId, data);
    } else {
      await api.createChain(data);
    }
    closeChainModal();
    await loadAgents();
  } catch (err) {
    console.error("Failed to save chain:", err);
    alert(err.message);
  }
});

$.chainModalClose.addEventListener("click", closeChainModal);
$.chainModalCancel.addEventListener("click", closeChainModal);
$.chainModal.addEventListener("click", (e) => {
  if (e.target === $.chainModal) closeChainModal();
});

async function deleteChain(id, title) {
  if (!confirm(`Delete chain "${title}"?`)) return;
  try {
    await api.deleteChainApi(id);
    await loadAgents();
  } catch (err) {
    console.error("Failed to delete chain:", err);
  }
}

// ══════════════════════════════════════════════════════════
// Commands
// ══════════════════════════════════════════════════════════

export function registerAgentCommands() {
  for (const [name, cmd] of Object.entries(commandRegistry)) {
    if (cmd.category === "agent") delete commandRegistry[name];
  }
  const agents = getState("agents");
  for (const agent of agents) {
    registerCommand(`agent-${agent.id}`, {
      category: "agent",
      description: agent.description,
      execute(args, pane) {
        startAgent(agent, pane, args.trim() || undefined);
      },
    });
  }
  // Orchestrate command
  registerCommand("orchestrate", {
    category: "agent",
    description: "Orchestrate: decompose a task and delegate to specialist agents",
    execute(args, pane) {
      if (args.trim()) {
        startOrchestration(args.trim(), pane);
      }
    },
  });

  const chains = getState("agentChains") || [];
  for (const chain of chains) {
    registerCommand(`chain-${chain.id}`, {
      category: "agent",
      description: `Chain: ${chain.description || chain.title}`,
      execute(args, pane) {
        startChain(chain, pane);
      },
    });
  }

  const dags = getState("agentDags") || [];
  for (const dag of dags) {
    registerCommand(`dag-${dag.id}`, {
      category: "agent",
      description: `DAG: ${dag.description || dag.title}`,
      execute(args, pane) {
        startDag(dag, pane);
      },
    });
  }
}

// ══════════════════════════════════════════════════════════
// Start Agent
// ══════════════════════════════════════════════════════════

export function startAgent(agentDef, pane, userContext) {
  pane = pane || getPane(null);
  const cwd = $.projectSelect.value;
  if (!cwd) {
    addStatus("Select a project first", true, pane);
    return;
  }

  // Render agent header card
  const div = document.createElement("div");
  div.className = "msg";
  const header = document.createElement("div");
  header.className = "agent-header";
  header.id = `agent-header-${agentDef.id}`;
  header.innerHTML = `
    <div class="agent-header-top">
      <span class="agent-header-icon">${getAgentIcon(agentDef.icon)}</span>
      <span class="agent-header-title">${escapeHtml(agentDef.title)}</span>
      <span class="agent-status-badge running" id="agent-badge-${agentDef.id}">Running</span>
    </div>
    <div class="agent-header-goal">${escapeHtml(agentDef.goal)}</div>
    <div class="agent-header-stats" id="agent-stats-${agentDef.id}">
      <span class="agent-stat" id="agent-elapsed-${agentDef.id}">0s</span>
      <span class="agent-stat-sep"></span>
      <span class="agent-stat" id="agent-turns-${agentDef.id}">0/${agentDef.constraints?.maxTurns || 50} turns</span>
    </div>
    <div class="agent-activity-log" id="agent-log-${agentDef.id}"></div>
  `;
  div.appendChild(header);
  pane.messagesDiv.appendChild(div);
  scrollToBottom(pane);

  // Start elapsed timer
  const startTime = Date.now();
  const timerId = setInterval(() => {
    const el = document.getElementById(`agent-elapsed-${agentDef.id}`);
    if (!el) { clearInterval(timerId); return; }
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    el.textContent = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }, 1000);

  pane._agentTimerId = timerId;
  pane._agentId = agentDef.id;

  pane.isStreaming = true;
  if (!getState("parallelMode")) {
    $.sendBtn.classList.add("hidden");
    $.stopBtn.classList.remove("hidden");
  }

  const selectedOption = $.projectSelect.options[$.projectSelect.selectedIndex];
  const projectName = selectedOption?.textContent || "Session";
  const ws = getState("ws");

  const model = getSelectedModel();
  const payload = {
    type: "agent",
    agentDef,
    cwd,
    sessionId: getState("sessionId"),
    projectName,
    permissionMode: getPermissionMode(),
  };
  if (userContext) payload.userContext = userContext;
  if (model) payload.model = model;
  ws.send(JSON.stringify(payload));

  showThinking(`Agent: ${agentDef.title} starting...`, pane);
}

// ══════════════════════════════════════════════════════════
// Start Chain
// ══════════════════════════════════════════════════════════

export function startChain(chain, pane) {
  pane = pane || getPane(null);
  const cwd = $.projectSelect.value;
  if (!cwd) {
    addStatus("Select a project first", true, pane);
    return;
  }

  const allAgents = getState("agents") || [];
  const agentDefs = chain.agents.map(id => allAgents.find(a => a.id === id)).filter(Boolean);
  if (agentDefs.length === 0) {
    addStatus("No valid agents in this chain", true, pane);
    return;
  }

  // Render chain header card
  const div = document.createElement("div");
  div.className = "msg";
  const header = document.createElement("div");
  header.className = "chain-header";
  header.id = `chain-header-${chain.id}`;
  header.innerHTML = `
    <div class="chain-header-top">
      <span class="chain-header-icon">${getChainIcon()}</span>
      <span class="chain-header-title">${escapeHtml(chain.title)}</span>
      <span class="agent-status-badge running" id="chain-badge-${chain.id}">Running</span>
    </div>
    <div class="chain-pipeline" id="chain-pipeline-${chain.id}">
      ${agentDefs.map((a, i) => `
        <div class="chain-pipeline-step" id="chain-step-${chain.id}-${i}">
          <span class="chain-pipeline-num">${i + 1}</span>
          <span class="chain-pipeline-name">${escapeHtml(a.title)}</span>
          <span class="chain-pipeline-status" id="chain-step-status-${chain.id}-${i}">pending</span>
        </div>
        ${i < agentDefs.length - 1 ? '<div class="chain-pipeline-connector"></div>' : ''}
      `).join("")}
    </div>
  `;
  div.appendChild(header);
  pane.messagesDiv.appendChild(div);
  scrollToBottom(pane);

  // Start elapsed timer
  const startTime = Date.now();
  const timerId = setInterval(() => {
    const badge = document.getElementById(`chain-badge-${chain.id}`);
    if (!badge || !badge.classList.contains("running")) { clearInterval(timerId); return; }
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    badge.textContent = mins > 0 ? `Running ${mins}m ${secs}s` : `Running ${secs}s`;
  }, 1000);

  pane._chainTimerId = timerId;

  pane.isStreaming = true;
  if (!getState("parallelMode")) {
    $.sendBtn.classList.add("hidden");
    $.stopBtn.classList.remove("hidden");
  }

  const selectedOption = $.projectSelect.options[$.projectSelect.selectedIndex];
  const projectName = selectedOption?.textContent || "Session";
  const ws = getState("ws");
  const model = getSelectedModel();

  ws.send(JSON.stringify({
    type: "agent_chain",
    chain,
    agents: agentDefs,
    cwd,
    sessionId: getState("sessionId"),
    projectName,
    permissionMode: getPermissionMode(),
    model,
  }));

  showThinking(`Chain: ${chain.title} starting...`, pane);
}

// ══════════════════════════════════════════════════════════
// Start Orchestration
// ══════════════════════════════════════════════════════════

export function startOrchestration(task, pane) {
  pane = pane || getPane(null);
  const cwd = $.projectSelect.value;
  if (!cwd) {
    addStatus("Select a project first", true, pane);
    return;
  }

  // Render orchestrator header
  const orchId = `orch-${Date.now()}`;
  const div = document.createElement("div");
  div.className = "msg";
  const header = document.createElement("div");
  header.className = "orchestrator-header";
  header.id = orchId;
  header.innerHTML = `
    <div class="orch-header-top">
      <span class="orch-header-icon">${getOrchIcon()}</span>
      <span class="orch-header-title">Orchestrator</span>
      <span class="agent-status-badge running" id="${orchId}-badge">Planning</span>
    </div>
    <div class="orch-task">${escapeHtml(task.length > 200 ? task.slice(0, 200) + '...' : task)}</div>
    <div class="orch-dispatches" id="${orchId}-dispatches"></div>
  `;
  div.appendChild(header);
  pane.messagesDiv.appendChild(div);
  scrollToBottom(pane);

  // Store orchId on pane for message routing
  pane._orchId = orchId;

  pane.isStreaming = true;
  if (!getState("parallelMode")) {
    $.sendBtn.classList.add("hidden");
    $.stopBtn.classList.remove("hidden");
  }

  const selectedOption = $.projectSelect.options[$.projectSelect.selectedIndex];
  const projectName = selectedOption?.textContent || "Session";
  const ws = getState("ws");
  const model = getSelectedModel();

  ws.send(JSON.stringify({
    type: "orchestrate",
    task,
    cwd,
    sessionId: getState("sessionId"),
    projectName,
    permissionMode: getPermissionMode(),
    model,
  }));

  showThinking("Orchestrator: analyzing task...", pane);
}

// ══════════════════════════════════════════════════════════
// DAG
// ══════════════════════════════════════════════════════════

async function deleteDag(id, title) {
  if (!confirm(`Delete DAG "${title}"?`)) return;
  try {
    await api.deleteDagApi(id);
    await loadAgents();
  } catch (err) {
    console.error("Failed to delete DAG:", err);
  }
}

export function startDag(dag, pane) {
  pane = pane || getPane(null);
  const cwd = $.projectSelect.value;
  if (!cwd) {
    addStatus("Select a project first", true, pane);
    return;
  }

  const allAgents = getState("agents") || [];
  const agentDefs = dag.nodes.map(n => {
    const a = allAgents.find(ag => ag.id === n.agentId);
    return a ? { ...a, nodeId: n.id } : null;
  }).filter(Boolean);

  if (agentDefs.length < 2) {
    addStatus("DAG needs at least 2 valid agent nodes", true, pane);
    return;
  }

  const dagRunId = `dag-${Date.now()}`;

  // Render DAG execution header
  const div = document.createElement("div");
  div.className = "msg";
  const header = document.createElement("div");
  header.className = "dag-header";
  header.id = dagRunId;
  header.innerHTML = `
    <div class="dag-header-top">
      <span class="dag-header-icon">${getDagIcon()}</span>
      <span class="dag-header-title">${escapeHtml(dag.title)}</span>
      <span class="agent-status-badge running" id="${dagRunId}-badge">Running</span>
    </div>
    <div class="dag-desc">${escapeHtml(dag.description || `${dag.nodes.length} nodes, ${dag.edges.length} edges`)}</div>
    <div class="dag-graph" id="${dagRunId}-graph">
      ${dag.nodes.map(n => {
        const a = allAgents.find(ag => ag.id === n.agentId);
        const name = a ? a.title : n.agentId;
        return `<div class="dag-graph-node" id="${dagRunId}-node-${n.id}">
          <span class="dag-graph-node-name">${escapeHtml(name)}</span>
          <span class="dag-graph-node-status" id="${dagRunId}-node-status-${n.id}">pending</span>
        </div>`;
      }).join('')}
    </div>
  `;
  div.appendChild(header);
  pane.messagesDiv.appendChild(div);
  scrollToBottom(pane);

  // Store dagRunId on pane for message routing
  pane._dagRunId = dagRunId;

  pane.isStreaming = true;
  if (!getState("parallelMode")) {
    $.sendBtn.classList.add("hidden");
    $.stopBtn.classList.remove("hidden");
  }

  const selectedOption = $.projectSelect.options[$.projectSelect.selectedIndex];
  const projectName = selectedOption?.textContent || "Session";
  const ws = getState("ws");
  const model = getSelectedModel();

  ws.send(JSON.stringify({
    type: "agent_dag",
    dag,
    agents: allAgents,
    cwd,
    sessionId: getState("sessionId"),
    projectName,
    permissionMode: getPermissionMode(),
    model,
  }));

  showThinking(`DAG: ${dag.title} starting...`, pane);
}

// ══════════════════════════════════════════════════════════
// WebSocket Message Handlers
// ══════════════════════════════════════════════════════════

export function handleAgentMessage(msg, pane) {
  switch (msg.type) {
    case "agent_started":
      showThinking(`Agent: ${msg.title} working...`, pane);
      break;

    case "agent_progress": {
      const turnsEl = document.getElementById(`agent-turns-${msg.agentId}`);
      if (turnsEl) turnsEl.textContent = `${msg.turn}/${msg.maxTurns} turns`;

      const log = document.getElementById(`agent-log-${msg.agentId}`);
      if (log) {
        const entry = document.createElement("div");
        entry.className = "agent-log-entry";
        const detail = msg.detail ? ` ${escapeHtml(msg.detail)}` : "";
        entry.innerHTML = `<span class="agent-log-action">${escapeHtml(msg.action)}</span>${detail}`;
        log.appendChild(entry);
        log.scrollTop = log.scrollHeight;
      }

      showThinking(`Agent: ${msg.action}...`, pane);
      break;
    }

    case "agent_completed": {
      const badge = document.getElementById(`agent-badge-${msg.agentId}`);
      if (badge) {
        badge.textContent = "Completed";
        badge.className = "agent-status-badge completed";
      }

      if (pane._agentTimerId) {
        clearInterval(pane._agentTimerId);
        pane._agentTimerId = null;
      }

      const turnsEl = document.getElementById(`agent-turns-${msg.agentId}`);
      if (turnsEl) turnsEl.textContent = `${msg.totalTurns} turns`;

      const elapsedEl = document.getElementById(`agent-elapsed-${msg.agentId}`);
      if (elapsedEl) {
        const secs = Math.round((msg.durationMs || 0) / 1000);
        const mins = Math.floor(secs / 60);
        const s = secs % 60;
        elapsedEl.textContent = mins > 0 ? `${mins}m ${s}s` : `${secs}s`;
      }

      removeThinking(pane);
      addStatus(`Agent completed (${msg.totalTurns} turns, $${(msg.costUsd || 0).toFixed(4)})`, false, pane);
      finishAgentStreaming(pane);
      break;
    }

    case "agent_error": {
      const badge = document.getElementById(`agent-badge-${msg.agentId}`);
      if (badge) {
        badge.textContent = "Error";
        badge.className = "agent-status-badge error";
      }
      if (pane._agentTimerId) {
        clearInterval(pane._agentTimerId);
        pane._agentTimerId = null;
      }
      removeThinking(pane);
      finishAgentStreaming(pane);
      break;
    }

    case "agent_aborted": {
      const badge = document.getElementById(`agent-badge-${msg.agentId}`);
      if (badge) {
        badge.textContent = "Aborted";
        badge.className = "agent-status-badge error";
      }
      if (pane._agentTimerId) {
        clearInterval(pane._agentTimerId);
        pane._agentTimerId = null;
      }
      removeThinking(pane);
      finishAgentStreaming(pane);
      break;
    }

    // ── Chain messages ──

    case "agent_chain_started":
      showThinking(`Chain: ${msg.title} — ${msg.totalSteps} agents...`, pane);
      break;

    case "agent_chain_step": {
      const statusEl = document.getElementById(`chain-step-status-${msg.chainId}-${msg.stepIndex}`);
      const stepEl = document.getElementById(`chain-step-${msg.chainId}-${msg.stepIndex}`);
      if (statusEl) {
        statusEl.textContent = msg.status;
        statusEl.className = `chain-pipeline-status ${msg.status}`;
      }
      if (stepEl) {
        stepEl.className = `chain-pipeline-step ${msg.status}`;
      }
      if (msg.status === "running") {
        showThinking(`Chain step ${msg.stepIndex + 1}: ${msg.agentTitle} working...`, pane);
      }
      break;
    }

    case "agent_chain_completed": {
      const chainBadge = document.getElementById(`chain-badge-${msg.chainId}`);
      if (chainBadge) {
        chainBadge.textContent = "Completed";
        chainBadge.className = "agent-status-badge completed";
      }
      if (pane._chainTimerId) {
        clearInterval(pane._chainTimerId);
        pane._chainTimerId = null;
      }

      // Show shared context summary
      if (msg.runId) {
        api.fetchAgentContext(msg.runId).then(contexts => {
          if (contexts.length > 0) {
            const ctxDiv = document.createElement("div");
            ctxDiv.className = "chain-context-summary";
            ctxDiv.innerHTML = `
              <div class="chain-context-header">Shared Context (${contexts.length} entries)</div>
              ${contexts.map(c => `
                <div class="chain-context-entry">
                  <span class="chain-context-agent">${escapeHtml(c.agent_id)}</span>
                  <span class="chain-context-preview">${escapeHtml((c.value || "").slice(0, 150))}${c.value?.length > 150 ? '...' : ''}</span>
                </div>
              `).join("")}
            `;
            const pipeline = document.getElementById(`chain-pipeline-${msg.chainId}`);
            if (pipeline) pipeline.parentElement.appendChild(ctxDiv);
          }
        }).catch(() => {});
      }

      removeThinking(pane);
      addStatus(`Chain completed`, false, pane);
      finishAgentStreaming(pane);
      break;
    }

    // ── Orchestrator messages ──

    case "orchestrator_started":
      showThinking("Orchestrator: planning...", pane);
      break;

    case "orchestrator_phase": {
      const orchId = pane._orchId;
      const badge = orchId ? document.getElementById(`${orchId}-badge`) : null;
      if (badge) {
        badge.textContent = msg.phase === "planning" ? "Planning" : "Synthesizing";
      }
      showThinking(`Orchestrator: ${msg.phase}...`, pane);
      break;
    }

    case "orchestrator_dispatching": {
      const orchId = pane._orchId;
      const badge = orchId ? document.getElementById(`${orchId}-badge`) : null;
      if (badge) badge.textContent = `Dispatching ${msg.totalAgents} agents`;

      const container = orchId ? document.getElementById(`${orchId}-dispatches`) : null;
      if (container && msg.dispatches) {
        container.innerHTML = msg.dispatches.map((d, i) => `
          <div class="orch-dispatch-row" id="orch-dispatch-${i}">
            <span class="orch-dispatch-num">${i + 1}</span>
            <span class="orch-dispatch-agent">${escapeHtml(d.agentId)}</span>
            <span class="orch-dispatch-ctx">${escapeHtml(d.context)}</span>
            <span class="orch-dispatch-status" id="orch-dispatch-status-${i}">queued</span>
          </div>
        `).join("");
      }
      showThinking(`Orchestrator: dispatching ${msg.totalAgents} agents...`, pane);
      break;
    }

    case "orchestrator_dispatch": {
      const statusEl = document.getElementById(`orch-dispatch-status-${msg.stepIndex}`);
      const rowEl = document.getElementById(`orch-dispatch-${msg.stepIndex}`);
      if (statusEl) {
        statusEl.textContent = msg.status;
        statusEl.className = `orch-dispatch-status ${msg.status}`;
      }
      if (rowEl) {
        rowEl.className = `orch-dispatch-row ${msg.status}`;
      }
      if (msg.status === "running") {
        showThinking(`Orchestrator: ${msg.agentTitle} working...`, pane);
      }
      break;
    }

    case "orchestrator_dispatch_skip":
      addStatus(`Skipped agent "${msg.agentId}": ${msg.reason}`, true, pane);
      break;

    case "orchestrator_error": {
      const orchId = pane._orchId;
      const badge = orchId ? document.getElementById(`${orchId}-badge`) : null;
      if (badge) {
        badge.textContent = "Error";
        badge.className = "agent-status-badge error";
      }
      removeThinking(pane);
      finishAgentStreaming(pane);
      break;
    }

    case "orchestrator_completed": {
      const orchId = pane._orchId;
      const badge = orchId ? document.getElementById(`${orchId}-badge`) : null;
      if (badge) {
        badge.textContent = "Completed";
        badge.className = "agent-status-badge completed";
      }
      removeThinking(pane);
      addStatus(`Orchestrator completed (${msg.dispatched} agents dispatched)`, false, pane);
      finishAgentStreaming(pane);
      break;
    }

    // ── DAG messages ──

    case "dag_started":
      showThinking(`DAG: ${msg.title} — ${msg.totalNodes} nodes...`, pane);
      break;

    case "dag_level":
      showThinking(`DAG: running level ${msg.level + 1} (${msg.nodeIds.length} parallel nodes)...`, pane);
      break;

    case "dag_node": {
      const dagRunId = pane._dagRunId;
      if (dagRunId) {
        const statusEl = document.getElementById(`${dagRunId}-node-status-${msg.nodeId}`);
        const nodeEl = document.getElementById(`${dagRunId}-node-${msg.nodeId}`);
        if (statusEl) {
          statusEl.textContent = msg.status;
          statusEl.className = `dag-graph-node-status ${msg.status}`;
        }
        if (nodeEl) {
          nodeEl.className = `dag-graph-node ${msg.status}`;
        }
      }
      if (msg.status === "running") {
        showThinking(`DAG: ${msg.agentTitle || msg.nodeId} working...`, pane);
      }
      break;
    }

    case "dag_completed": {
      const dagRunId = pane._dagRunId;
      if (dagRunId) {
        const badge = document.getElementById(`${dagRunId}-badge`);
        if (badge) {
          badge.textContent = "Completed";
          badge.className = "agent-status-badge completed";
        }
      }
      removeThinking(pane);
      addStatus(`DAG completed (${msg.succeeded}/${msg.totalNodes} succeeded)`, false, pane);
      finishAgentStreaming(pane);
      break;
    }

    case "dag_error": {
      const dagRunId = pane._dagRunId;
      if (dagRunId) {
        const badge = document.getElementById(`${dagRunId}-badge`);
        if (badge) {
          badge.textContent = "Error";
          badge.className = "agent-status-badge error";
        }
      }
      removeThinking(pane);
      addStatus(`DAG error: ${msg.error}`, true, pane);
      finishAgentStreaming(pane);
      break;
    }
  }
}

// ══════════════════════════════════════════════════════════
// Icons
// ══════════════════════════════════════════════════════════

function getAgentIcon(icon) {
  const icons = {
    search: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    bug: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>`,
    check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    tool: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  };
  return icons[icon] || icons.tool;
}

function getChainIcon() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
}

function getOrchIcon() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><path d="M12 8v4M8.5 16.5 10.5 13M15.5 16.5 13.5 13"/></svg>`;
}

function getMonitorIcon() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>`;
}

function getDagIcon() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="9" y="15" width="6" height="6" rx="1"/><path d="M9 6h6M6 9v3l3 3M18 9v3l-3 3"/></svg>`;
}

// ══════════════════════════════════════════════════════════
// Panel toggle
// ══════════════════════════════════════════════════════════

function toggleAgentSidebar(forceOpen) {
  const sidebar = $.agentSidebar;
  if (!sidebar) return;
  const isOpen = !sidebar.classList.contains("hidden");
  if (forceOpen === true || !isOpen) {
    sidebar.classList.remove("hidden");
    $.agentBtn.classList.add("active");
  } else {
    sidebar.classList.add("hidden");
    $.agentBtn.classList.remove("active");
  }
}

$.agentBtn.addEventListener("click", () => {
  $.toolboxPanel.classList.add("hidden");
  $.toolboxBtn.classList.remove("active");
  if ($.workflowPanel) $.workflowPanel.classList.add("hidden");
  if ($.workflowBtn) $.workflowBtn.classList.remove("active");
  toggleAgentSidebar();
});

$.agentSidebarClose?.addEventListener("click", () => {
  toggleAgentSidebar(false);
  $.agentSidebar.classList.add("hidden");
  $.agentBtn.classList.remove("active");
});

// ══════════════════════════════════════════════════════════
// Orchestrate Modal
// ══════════════════════════════════════════════════════════

function openOrchModal() {
  if (!$.orchModal) return;
  $.orchTaskInput.value = "";
  $.orchModal.classList.remove("hidden");
  setTimeout(() => $.orchTaskInput.focus(), 100);
}

function closeOrchModal() {
  if (!$.orchModal) return;
  $.orchModal.classList.add("hidden");
}

$.orchModalClose?.addEventListener("click", closeOrchModal);
$.orchModalCancel?.addEventListener("click", closeOrchModal);
$.orchModal?.addEventListener("click", (e) => {
  if (e.target === $.orchModal) closeOrchModal();
});

$.orchModalRun?.addEventListener("click", () => {
  const task = $.orchTaskInput.value.trim();
  if (!task) {
    $.orchTaskInput.focus();
    return;
  }
  closeOrchModal();
  startOrchestration(task, getPane(null));
});

// Ctrl/Cmd+Enter to submit
$.orchTaskInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    $.orchModalRun?.click();
  }
  if (e.key === "Escape") closeOrchModal();
});

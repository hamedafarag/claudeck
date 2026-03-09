// Agents — autonomous AI agents
import { $ } from './dom.js';
import { getState, setState } from './store.js';
import { escapeHtml, scrollToBottom } from './utils.js';
import * as api from './api.js';
import { commandRegistry, registerCommand } from './commands.js';
import { getPane } from './parallel.js';
import { showThinking, removeThinking, addStatus } from './messages.js';
import { getPermissionMode } from './permissions.js';
import { getSelectedModel } from './model-selector.js';

export async function loadAgents() {
  try {
    const agents = await api.fetchAgents();
    setState("agents", agents);
    renderAgentPanel();
    registerAgentCommands();
  } catch (err) {
    console.error("Failed to load agents:", err);
  }
}

function renderAgentPanel() {
  const agents = getState("agents");
  $.agentPanel.innerHTML = "";
  for (const agent of agents) {
    const card = document.createElement("div");
    card.className = "toolbox-card agent-card";
    card.innerHTML = `
      <div class="toolbox-card-title">
        <span class="agent-icon">${getAgentIcon(agent.icon)}</span>
        ${escapeHtml(agent.title)}
      </div>
      <div class="toolbox-card-desc">${escapeHtml(agent.description)}</div>
    `;
    card.addEventListener("click", () => {
      $.agentPanel.classList.add("hidden");
      $.agentBtn.classList.remove("active");
      startAgent(agent, getPane(null));
    });
    $.agentPanel.appendChild(card);
  }
}

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
}

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

  // Store timer for cleanup
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

/**
 * Handle agent-specific WebSocket messages.
 * Called from chat.js handleServerMessage.
 */
export function handleAgentMessage(msg, pane) {
  switch (msg.type) {
    case "agent_started":
      showThinking(`Agent: ${msg.title} working...`, pane);
      break;

    case "agent_progress": {
      // Update turn counter
      const turnsEl = document.getElementById(`agent-turns-${msg.agentId}`);
      if (turnsEl) turnsEl.textContent = `${msg.turn}/${msg.maxTurns} turns`;

      // Append to activity log
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

      // Stop timer
      if (pane._agentTimerId) {
        clearInterval(pane._agentTimerId);
        pane._agentTimerId = null;
      }

      // Update final stats
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
      break;
    }
  }
}

function getAgentIcon(icon) {
  const icons = {
    search: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    bug: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>`,
    check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    tool: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  };
  return icons[icon] || icons.tool;
}

// Agent panel toggle
$.agentBtn.addEventListener("click", () => {
  const isOpen = !$.agentPanel.classList.contains("hidden");
  // Close other panels
  $.toolboxPanel.classList.add("hidden");
  $.toolboxBtn.classList.remove("active");
  $.workflowPanel.classList.add("hidden");
  $.workflowBtn.classList.remove("active");
  if (isOpen) {
    $.agentPanel.classList.add("hidden");
    $.agentBtn.classList.remove("active");
  } else {
    $.agentPanel.classList.remove("hidden");
    $.agentBtn.classList.add("active");
  }
});

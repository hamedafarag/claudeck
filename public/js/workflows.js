// Workflows
import { $ } from './dom.js';
import { getState, setState } from './store.js';
import { escapeHtml, scrollToBottom } from './utils.js';
import * as api from './api.js';
import { commandRegistry, registerCommand } from './commands.js';
import { getPane, panes } from './parallel.js';
import { showThinking, addStatus } from './messages.js';
import { getPermissionMode } from './permissions.js';

export async function loadWorkflows() {
  try {
    const workflows = await api.fetchWorkflows();
    setState("workflows", workflows);
    renderWorkflowPanel();
    registerWorkflowCommands();
  } catch (err) {
    console.error("Failed to load workflows:", err);
  }
}

function renderWorkflowPanel() {
  const workflows = getState("workflows");
  $.workflowPanel.innerHTML = "";
  for (const wf of workflows) {
    const card = document.createElement("div");
    card.className = "toolbox-card";
    card.innerHTML = `
      <div class="toolbox-card-title">${escapeHtml(wf.title)}</div>
      <div class="toolbox-card-desc">${escapeHtml(wf.description)}</div>
    `;
    card.addEventListener("click", () => {
      $.workflowPanel.classList.add("hidden");
      $.workflowBtn.classList.remove("active");
      startWorkflow(wf, getPane(null));
    });
    $.workflowPanel.appendChild(card);
  }
}

export function registerWorkflowCommands() {
  for (const [name, cmd] of Object.entries(commandRegistry)) {
    if (cmd.category === "workflow") delete commandRegistry[name];
  }
  const workflows = getState("workflows");
  for (const wf of workflows) {
    registerCommand(wf.id, {
      category: "workflow",
      description: wf.description,
      execute(args, pane) {
        startWorkflow(wf, pane);
      },
    });
  }
}

export function startWorkflow(workflow, pane) {
  pane = pane || getPane(null);
  const cwd = $.projectSelect.value;
  if (!cwd) {
    addStatus("Select a project first", true, pane);
    return;
  }

  const div = document.createElement("div");
  div.className = "msg";
  const header = document.createElement("div");
  header.className = "workflow-header";
  header.innerHTML = `
    <div class="workflow-title">${escapeHtml(workflow.title)}</div>
    <div class="workflow-progress" id="workflow-progress">
      ${workflow.steps.map((s, i) => `
        <div class="workflow-step" data-step="${i}">
          <span class="workflow-step-dot pending"></span>
          <span class="workflow-step-label">${escapeHtml(s.label)}</span>
        </div>
      `).join("")}
    </div>
  `;
  div.appendChild(header);
  pane.messagesDiv.appendChild(div);
  scrollToBottom(pane);

  pane.isStreaming = true;
  if (!getState("parallelMode")) {
    $.sendBtn.classList.add("hidden");
    $.stopBtn.classList.remove("hidden");
  }

  const selectedOption = $.projectSelect.options[$.projectSelect.selectedIndex];
  const projectName = selectedOption?.textContent || "Session";
  const ws = getState("ws");

  ws.send(JSON.stringify({
    type: "workflow",
    workflow,
    cwd,
    sessionId: getState("sessionId"),
    projectName,
    permissionMode: getPermissionMode(),
  }));

  showThinking(`Running workflow: ${workflow.title}...`, pane);
}

// Workflow panel toggle
$.workflowBtn.addEventListener("click", () => {
  const isOpen = !$.workflowPanel.classList.contains("hidden");
  $.toolboxPanel.classList.add("hidden");
  $.toolboxBtn.classList.remove("active");
  if (isOpen) {
    $.workflowPanel.classList.add("hidden");
    $.workflowBtn.classList.remove("active");
  } else {
    $.workflowPanel.classList.remove("hidden");
    $.workflowBtn.classList.add("active");
  }
});

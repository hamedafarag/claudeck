// Workflows
import { $ } from '../core/dom.js';
import { getState, setState } from '../core/store.js';
import { escapeHtml, scrollToBottom } from '../core/utils.js';
import * as api from '../core/api.js';
import { commandRegistry, registerCommand } from '../ui/commands.js';
import { getPane, panes } from '../ui/parallel.js';
import { showThinking, addStatus } from '../ui/messages.js';
import { getPermissionMode } from '../ui/permissions.js';
import { getSelectedModel } from '../ui/model-selector.js';

export async function loadWorkflows() {
  try {
    const workflows = await api.fetchWorkflows();
    setState("workflows", workflows);
    renderWorkflowSidebar();
    registerWorkflowCommands();
  } catch (err) {
    console.error("Failed to load workflows:", err);
  }
}

// ══════════════════════════════════════════════════════════
// Workflow cards in Agent Sidebar
// ══════════════════════════════════════════════════════════

const editSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';

function getWorkflowIcon() {
  return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>';
}

export function renderWorkflowSidebar() {
  const workflows = getState("workflows") || [];
  // Remove existing workflow section if present
  const existing = $.agentPanel?.querySelectorAll(".wf-sidebar-section");
  if (existing) existing.forEach(el => el.remove());

  if (!$.agentPanel) return;

  const header = document.createElement("div");
  header.className = "agent-section-header wf-sidebar-section";
  header.textContent = "Workflows";
  $.agentPanel.appendChild(header);

  for (const wf of workflows) {
    const stepLabels = (wf.steps || []).map(s => s.label).filter(Boolean);
    const card = document.createElement("div");
    card.className = "toolbox-card agent-card wf-card wf-sidebar-section";
    card.innerHTML = `
      <div class="agent-card-actions">
        <button class="agent-card-edit" data-wf-id="${escapeHtml(wf.id)}" title="Edit workflow">${editSvg}</button>
        <button class="agent-card-delete" data-wf-id="${escapeHtml(wf.id)}" title="Delete workflow">&times;</button>
      </div>
      <div class="toolbox-card-title">
        <span class="agent-icon">${getWorkflowIcon()}</span>
        ${escapeHtml(wf.title)}
      </div>
      <div class="toolbox-card-desc">${escapeHtml(wf.description || stepLabels.join(" → "))}</div>
      ${stepLabels.length ? `<div class="chain-steps-preview">${stepLabels.map(l => `<span class="chain-step-tag">${escapeHtml(l)}</span>`).join('<span class="chain-arrow">→</span>')}</div>` : ""}
    `;
    card.addEventListener("click", (e) => {
      if (e.target.closest(".agent-card-edit") || e.target.closest(".agent-card-delete")) return;
      $.agentSidebar?.classList.add("hidden");
      $.agentBtn.classList.remove("active");
      startWorkflow(wf, getPane(null));
    });
    card.querySelector(".agent-card-edit").addEventListener("click", (e) => {
      e.stopPropagation();
      openWorkflowModal(wf);
    });
    card.querySelector(".agent-card-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteWorkflow(wf.id, wf.title);
    });
    $.agentPanel.appendChild(card);
  }

  const addCard = document.createElement("div");
  addCard.className = "toolbox-card-add wf-sidebar-section";
  addCard.innerHTML = `+ New Workflow`;
  addCard.addEventListener("click", () => openWorkflowModal());
  $.agentPanel.appendChild(addCard);
}

// ══════════════════════════════════════════════════════════
// Workflow CRUD Modal
// ══════════════════════════════════════════════════════════

function addStepRow(label = "", prompt = "") {
  const row = document.createElement("div");
  row.className = "wf-step-row";
  const num = $.wfStepsList.children.length + 1;
  row.innerHTML = `
    <div class="wf-step-number">${num}</div>
    <div class="wf-step-fields">
      <input type="text" placeholder="Step label (e.g. Analyze)" value="${escapeHtml(label)}">
      <textarea placeholder="Prompt for this step..." rows="2">${escapeHtml(prompt)}</textarea>
    </div>
    <button type="button" class="wf-step-remove" title="Remove step">&times;</button>
  `;
  row.querySelector(".wf-step-remove").addEventListener("click", () => {
    row.remove();
    renumberSteps();
  });
  $.wfStepsList.appendChild(row);
}

function renumberSteps() {
  const rows = $.wfStepsList.querySelectorAll(".wf-step-row");
  rows.forEach((row, i) => {
    row.querySelector(".wf-step-number").textContent = i + 1;
  });
}

function getStepsFromForm() {
  const rows = $.wfStepsList.querySelectorAll(".wf-step-row");
  const steps = [];
  rows.forEach(row => {
    const label = row.querySelector("input").value.trim();
    const prompt = row.querySelector("textarea").value.trim();
    if (label || prompt) {
      steps.push({ label: label || `Step ${steps.length + 1}`, prompt });
    }
  });
  return steps;
}

function openWorkflowModal(wf) {
  $.wfForm.reset();
  $.wfStepsList.innerHTML = "";

  if (wf) {
    $.wfModalTitle.textContent = "Edit Workflow";
    $.wfFormTitle.value = wf.title;
    $.wfFormDesc.value = wf.description || "";
    $.wfFormEditId.value = wf.id;
    for (const step of wf.steps || []) {
      addStepRow(step.label, step.prompt);
    }
  } else {
    $.wfModalTitle.textContent = "New Workflow";
    $.wfFormEditId.value = "";
    addStepRow();
    addStepRow();
  }
  $.wfModal.classList.remove("hidden");
  $.wfFormTitle.focus();
}

function closeWorkflowModal() {
  $.wfModal.classList.add("hidden");
}

$.wfAddStepBtn.addEventListener("click", () => addStepRow());

$.wfForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const editId = $.wfFormEditId.value;
  const steps = getStepsFromForm();
  if (steps.length === 0) {
    alert("Add at least one step with a prompt.");
    return;
  }
  const data = {
    title: $.wfFormTitle.value.trim(),
    description: $.wfFormDesc.value.trim(),
    steps,
  };
  if (!data.title) return;
  try {
    if (editId) {
      await api.updateWorkflow(editId, data);
    } else {
      await api.createWorkflow(data);
    }
    closeWorkflowModal();
    await loadWorkflows();
  } catch (err) {
    console.error("Failed to save workflow:", err);
    alert(err.message);
  }
});

$.wfModalClose.addEventListener("click", closeWorkflowModal);
$.wfModalCancel.addEventListener("click", closeWorkflowModal);
$.wfModal.addEventListener("click", (e) => {
  if (e.target === $.wfModal) closeWorkflowModal();
});

async function deleteWorkflow(id, title) {
  if (!confirm(`Delete workflow "${title}"?`)) return;
  try {
    await api.deleteWorkflowApi(id);
    await loadWorkflows();
  } catch (err) {
    console.error("Failed to delete workflow:", err);
  }
}

// ══════════════════════════════════════════════════════════
// Commands
// ══════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════
// Run Workflow
// ══════════════════════════════════════════════════════════

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

  const model = getSelectedModel();
  const wfPayload = {
    type: "workflow",
    workflow,
    cwd,
    sessionId: getState("sessionId"),
    projectName,
    permissionMode: getPermissionMode(),
  };
  if (model) wfPayload.model = model;
  ws.send(JSON.stringify(wfPayload));

  showThinking(`Running workflow: ${workflow.title}...`, pane);
}

// Workflow button removed — merged into agent-btn which opens the sidebar

// Project selection & system prompts
import { $ } from './dom.js';
import { getState, setState } from './store.js';
import { CHAT_IDS } from './constants.js';
import { slugify } from './utils.js';
import * as api from './api.js';
import { commandRegistry, registerCommand } from './commands.js';
import { panes } from './parallel.js';
import { loadSessions } from './sessions.js';
import { loadStats } from './cost-dashboard.js';

export async function loadProjects() {
  try {
    const projects = await api.fetchProjects();
    setState("projectsData", projects);
    const saved = localStorage.getItem("shawkat-ai-cwd") || "";

    for (const p of projects) {
      const opt = document.createElement("option");
      opt.value = p.path;
      opt.textContent = p.name;
      $.projectSelect.appendChild(opt);
    }

    if (saved && [...$.projectSelect.options].some((o) => o.value === saved)) {
      $.projectSelect.value = saved;
    }
    updateSystemPromptIndicator();
    updateHeaderProjectName();
    loadProjectCommands();
    // Load sessions after project dropdown is populated so they filter correctly
    loadSessions();
  } catch (err) {
    console.error("Failed to load projects:", err);
  }
}

export function updateSystemPromptIndicator() {
  const cwd = $.projectSelect.value;
  const project = getState("projectsData").find((p) => p.path === cwd);
  if (project && project.systemPrompt) {
    $.spBadge.classList.remove("hidden");
  } else {
    $.spBadge.classList.add("hidden");
  }
}

export function openSystemPromptModal() {
  const cwd = $.projectSelect.value;
  if (!cwd) return;
  const project = getState("projectsData").find((p) => p.path === cwd);
  $.spTextarea.value = project?.systemPrompt || "";
  $.spModal.classList.remove("hidden");
  $.spTextarea.focus();
}

export async function saveSystemPrompt(prompt) {
  const cwd = $.projectSelect.value;
  if (!cwd) return;
  try {
    await api.saveSystemPromptApi(cwd, prompt);
    const project = getState("projectsData").find((p) => p.path === cwd);
    if (project) project.systemPrompt = prompt;
    updateSystemPromptIndicator();
  } catch (err) {
    console.error("Failed to save system prompt:", err);
  }
}

export function updateHeaderProjectName() {
  const opt = $.projectSelect.options[$.projectSelect.selectedIndex];
  $.headerProjectName.textContent = opt && opt.value ? opt.textContent : "";
}

export async function loadProjectCommands() {
  // Remove old project commands and skills
  for (const [name, cmd] of Object.entries(commandRegistry)) {
    if (cmd.category === "project" || cmd.category === "skill") delete commandRegistry[name];
  }

  const cwd = $.projectSelect.value;
  if (!cwd) return;

  try {
    const commands = await api.fetchProjectCommands(cwd);
    if (!Array.isArray(commands) || commands.length === 0) return;

    for (const c of commands) {
      const slug = c.command;
      if (!slug || commandRegistry[slug]) continue;
      const hasArgs = c.prompt.includes("$ARGUMENTS");
      const label = c.source === "skill" ? `${c.description}` : (c.description || c.command);
      registerCommand(slug, {
        category: c.source === "skill" ? "skill" : "project",
        description: label,
        needsArgs: hasArgs,
        argumentHint: c.argumentHint || "",
        execute(args, pane) {
          let prompt = c.prompt;
          if (hasArgs) {
            prompt = prompt.replace(/\$ARGUMENTS/g, args || "");
          }
          pane.messageInput.value = prompt;
          pane.messageInput.style.height = "auto";
          pane.messageInput.style.height = Math.min(pane.messageInput.scrollHeight, 200) + "px";
          // Lazy import to avoid circular dep
          import('./chat.js').then(({ sendMessage }) => sendMessage(pane));
        },
      });
    }
  } catch (err) {
    console.error("Failed to load project commands:", err);
  }
}

// System prompt modal event listeners
$.spEditBtn.addEventListener("click", openSystemPromptModal);
$.spForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await saveSystemPrompt($.spTextarea.value.trim());
  $.spModal.classList.add("hidden");
});
document.getElementById("sp-cancel-btn").addEventListener("click", () => {
  $.spModal.classList.add("hidden");
});
document.getElementById("sp-modal-close").addEventListener("click", () => {
  $.spModal.classList.add("hidden");
});
document.getElementById("sp-clear-btn").addEventListener("click", async () => {
  $.spTextarea.value = "";
  await saveSystemPrompt("");
  $.spModal.classList.add("hidden");
});
$.spModal.addEventListener("click", (e) => {
  if (e.target === $.spModal) $.spModal.classList.add("hidden");
});

// Project change handler
$.projectSelect.addEventListener("change", async () => {
  const { guardSwitch } = await import('./background-sessions.js');
  guardSwitch(() => {
    localStorage.setItem("shawkat-ai-cwd", $.projectSelect.value);
    setState("sessionId", null);
    updateSystemPromptIndicator();
    updateHeaderProjectName();
    loadProjectCommands();
    if (getState("parallelMode")) {
      for (const chatId of CHAT_IDS) {
        const pane = panes.get(chatId);
        if (pane) pane.messagesDiv.innerHTML = "";
      }
    } else {
      $.messagesDiv.innerHTML = "";
    }
    loadSessions();
    loadStats();
  });
});

// New session button
$.newSessionBtn.addEventListener("click", async () => {
  const { guardSwitch } = await import('./background-sessions.js');
  guardSwitch(() => {
    setState("sessionId", null);
    if (getState("parallelMode")) {
      for (const chatId of CHAT_IDS) {
        const pane = panes.get(chatId);
        if (pane) {
          pane.messagesDiv.innerHTML = "";
          pane.currentAssistantMsg = null;
        }
      }
    } else {
      $.messagesDiv.innerHTML = "";
    }
    loadSessions();
    if (!getState("parallelMode")) $.messageInput.focus();
  });
});

// Parallel mode toggle
$.toggleParallelBtn.addEventListener("change", () => {
  if ($.toggleParallelBtn.checked) {
    import('./parallel.js').then(({ enterParallelMode }) => enterParallelMode());
  } else {
    import('./parallel.js').then(({ exitParallelMode }) => exitParallelMode());
  }
});

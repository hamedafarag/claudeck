// Prompt toolbox + variable templates
import { $ } from '../core/dom.js';
import { getState, setState } from '../core/store.js';
import { escapeHtml, slugify } from '../core/utils.js';
import * as api from '../core/api.js';
import { commandRegistry, registerCommand } from '../ui/commands.js';
import { getPane } from '../ui/parallel.js';

export function extractVariables(promptText) {
  const matches = promptText.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

export function renderVariablesForm(promptText, variables, onSubmit) {
  const form = document.createElement("div");
  form.className = "prompt-variables-form";

  const title = document.createElement("h4");
  title.textContent = "Fill in template variables";
  form.appendChild(title);

  const inputs = {};
  for (const varName of variables) {
    const group = document.createElement("div");
    group.className = "prompt-var-group";

    const label = document.createElement("label");
    label.textContent = `{{${varName}}}`;
    group.appendChild(label);

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = varName;
    input.dataset.varName = varName;
    group.appendChild(input);

    inputs[varName] = input;
    form.appendChild(group);
  }

  const sendBtn = document.createElement("button");
  sendBtn.className = "prompt-var-send";
  sendBtn.textContent = "Send";
  sendBtn.addEventListener("click", () => {
    let result = promptText;
    for (const [varName, input] of Object.entries(inputs)) {
      const value = input.value.trim() || varName;
      result = result.replace(new RegExp(`\\{\\{${varName}\\}\\}`, "g"), value);
    }
    form.remove();
    onSubmit(result);
  });
  form.appendChild(sendBtn);

  const inputEls = Object.values(inputs);
  if (inputEls.length > 0) {
    inputEls[inputEls.length - 1].addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendBtn.click();
      }
    });
  }

  return form;
}

export function registerPromptCommands() {
  // Remove old prompt commands
  for (const [name, cmd] of Object.entries(commandRegistry)) {
    if (cmd.category === "prompt") delete commandRegistry[name];
  }
  const prompts = getState("prompts");
  for (const p of prompts) {
    const slug = slugify(p.title);
    if (!slug || commandRegistry[slug]) continue;
    registerCommand(slug, {
      category: "prompt",
      description: p.description,
      execute(args, pane) {
        const variables = extractVariables(p.prompt);
        if (variables.length > 0) {
          const existingForm = document.querySelector(".prompt-variables-form");
          if (existingForm) existingForm.remove();
          const chatArea = document.querySelector(".chat-area");
          if (!chatArea) return;
          const form = renderVariablesForm(p.prompt, variables, (filledPrompt) => {
            pane.messageInput.value = filledPrompt;
            pane.messageInput.style.height = "auto";
            pane.messageInput.style.height = Math.min(pane.messageInput.scrollHeight, 200) + "px";
            import('./chat.js').then(({ sendMessage }) => sendMessage(pane));
          });
          chatArea.appendChild(form);
          const firstInput = form.querySelector("input");
          if (firstInput) firstInput.focus();
        } else {
          pane.messageInput.value = p.prompt;
          pane.messageInput.style.height = "auto";
          pane.messageInput.style.height = Math.min(pane.messageInput.scrollHeight, 200) + "px";
          import('./chat.js').then(({ sendMessage }) => sendMessage(pane));
        }
      },
    });
  }
}

export async function loadPrompts() {
  try {
    const prompts = await api.fetchPrompts();
    setState("prompts", prompts);
    renderToolbox();
    registerPromptCommands();
  } catch (err) {
    console.error("Failed to load prompts:", err);
  }
}

function renderToolbox() {
  const prompts = getState("prompts");
  $.toolboxPanel.innerHTML = "";
  prompts.forEach((p, idx) => {
    const card = document.createElement("div");
    card.className = "toolbox-card";
    card.innerHTML = `
      <button class="toolbox-card-delete" data-idx="${idx}" title="Delete prompt">&times;</button>
      <div class="toolbox-card-title">${escapeHtml(p.title)}</div>
      <div class="toolbox-card-desc">${escapeHtml(p.description)}</div>
    `;
    card.title = p.description;
    card.addEventListener("click", (e) => {
      if (e.target.closest(".toolbox-card-delete")) return;
      const variables = extractVariables(p.prompt);
      $.toolboxPanel.classList.add("hidden");
      $.toolboxBtn.classList.remove("active");
      if (variables.length > 0) {
        const existingForm = document.querySelector(".prompt-variables-form");
        if (existingForm) existingForm.remove();
        const form = renderVariablesForm(p.prompt, variables, (filledPrompt) => {
          $.messageInput.value = filledPrompt;
          $.messageInput.style.height = "auto";
          $.messageInput.style.height = Math.min($.messageInput.scrollHeight, 200) + "px";
          import('./chat.js').then(({ sendMessage }) => sendMessage(getPane(null)));
        });
        $.toolboxPanel.parentElement.appendChild(form);
        const firstInput = form.querySelector("input");
        if (firstInput) firstInput.focus();
      } else {
        $.messageInput.value = p.prompt;
        $.messageInput.style.height = "auto";
        $.messageInput.style.height = Math.min($.messageInput.scrollHeight, 200) + "px";
        $.messageInput.focus();
      }
    });
    card.querySelector(".toolbox-card-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      deletePrompt(idx);
    });
    $.toolboxPanel.appendChild(card);
  });

  const addCard = document.createElement("div");
  addCard.className = "toolbox-card-add";
  addCard.innerHTML = `+ Add Prompt`;
  addCard.addEventListener("click", () => openPromptModal());
  $.toolboxPanel.appendChild(addCard);
}

function openPromptModal() {
  $.promptForm.reset();
  $.promptModal.classList.remove("hidden");
  document.getElementById("prompt-title").focus();
}

function closePromptModal() {
  $.promptModal.classList.add("hidden");
}

async function savePrompt(title, description, prompt) {
  try {
    await api.createPrompt(title, description, prompt);
    await loadPrompts();
  } catch (err) {
    console.error("Failed to save prompt:", err);
  }
}

async function deletePrompt(idx) {
  try {
    await api.deletePromptApi(idx);
    await loadPrompts();
  } catch (err) {
    console.error("Failed to delete prompt:", err);
  }
}

$.promptForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("prompt-title").value.trim();
  const description = document.getElementById("prompt-desc").value.trim();
  const prompt = document.getElementById("prompt-text").value.trim();
  if (title && description && prompt) {
    await savePrompt(title, description, prompt);
    closePromptModal();
  }
});

$.modalCloseBtn.addEventListener("click", closePromptModal);
$.modalCancelBtn.addEventListener("click", closePromptModal);
$.promptModal.addEventListener("click", (e) => {
  if (e.target === $.promptModal) closePromptModal();
});

// Toolbox toggle
$.toolboxBtn.addEventListener("click", () => {
  const isOpen = !$.toolboxPanel.classList.contains("hidden");
  if ($.workflowPanel) $.workflowPanel.classList.add("hidden");
  if ($.workflowBtn) $.workflowBtn.classList.remove("active");
  if ($.agentSidebar) { $.agentSidebar.classList.add("hidden"); }
  if ($.agentBtn) { $.agentBtn.classList.remove("active"); }
  if (isOpen) {
    $.toolboxPanel.classList.add("hidden");
    $.toolboxBtn.classList.remove("active");
  } else {
    $.toolboxPanel.classList.remove("hidden");
    $.toolboxBtn.classList.add("active");
  }
});

// File attachments
import { $ } from './dom.js';
import { getState, setState } from './store.js';
import * as api from './api.js';
import { registerCommand } from './commands.js';

export function updateAttachmentBadge() {
  const attachedFiles = getState("attachedFiles");
  if (attachedFiles.length > 0) {
    $.attachBadge.textContent = attachedFiles.length;
    $.attachBadge.classList.remove("hidden");
  } else {
    $.attachBadge.classList.add("hidden");
  }
}

export async function openFilePicker() {
  const cwd = $.projectSelect.value;
  if (!cwd) return;
  $.fpModal.classList.remove("hidden");
  $.fpSearch.value = "";
  $.fpSearch.focus();

  try {
    const files = await api.fetchFiles(cwd);
    setState("allProjectFiles", files);
    renderFilePicker("");
  } catch (err) {
    console.error("Failed to load files:", err);
    setState("allProjectFiles", []);
    renderFilePicker("");
  }
}

export function renderFilePicker(filter) {
  $.fpList.innerHTML = "";
  const lower = filter.toLowerCase();
  const allProjectFiles = getState("allProjectFiles");
  const attachedFiles = getState("attachedFiles");
  const filtered = lower
    ? allProjectFiles.filter((f) => f.toLowerCase().includes(lower))
    : allProjectFiles;

  for (const filePath of filtered.slice(0, 200)) {
    const item = document.createElement("div");
    item.className = "file-picker-item";
    const isSelected = attachedFiles.some((f) => f.path === filePath);
    if (isSelected) item.classList.add("selected");
    item.textContent = filePath;
    item.addEventListener("click", () => toggleFileAttachment(filePath, item));
    $.fpList.appendChild(item);
  }
}

async function toggleFileAttachment(filePath, itemEl) {
  const attachedFiles = [...getState("attachedFiles")];
  const idx = attachedFiles.findIndex((f) => f.path === filePath);
  if (idx >= 0) {
    attachedFiles.splice(idx, 1);
    setState("attachedFiles", attachedFiles);
    itemEl.classList.remove("selected");
  } else {
    try {
      const cwd = $.projectSelect.value;
      const data = await api.fetchFileContent(cwd, filePath);
      attachedFiles.push({ path: filePath, content: data.content });
      setState("attachedFiles", attachedFiles);
      itemEl.classList.add("selected");
    } catch (err) {
      console.error("Failed to read file:", err);
      return;
    }
  }
  $.fpCount.textContent = `${attachedFiles.length} file${attachedFiles.length !== 1 ? "s" : ""} selected`;
  updateAttachmentBadge();
}

function closeFilePicker() {
  $.fpModal.classList.add("hidden");
}

$.attachBtn.addEventListener("click", openFilePicker);
document.getElementById("fp-modal-close").addEventListener("click", closeFilePicker);
document.getElementById("fp-done-btn").addEventListener("click", closeFilePicker);
$.fpModal.addEventListener("click", (e) => {
  if (e.target === $.fpModal) closeFilePicker();
});
$.fpSearch.addEventListener("input", () => {
  renderFilePicker($.fpSearch.value.trim());
});

registerCommand("attach", {
  category: "app",
  description: "Attach files to next message",
  execute() {
    openFilePicker();
  },
});

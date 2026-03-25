// File & image attachments
import { $ } from '../core/dom.js';
import { getState, setState } from '../core/store.js';
import * as api from '../core/api.js';
import { registerCommand } from '../ui/commands.js';

const SUPPORTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

// ── File type categorization ─────────────────────────────
const FILE_TYPES = {
  code:   new Set(['js','jsx','ts','tsx','mjs','cjs','py','go','rs','java','rb','php','c','cpp','h','hpp','swift','kt','scala','sh','bash','zsh','lua','r','pl','ex','exs','elm','hs','clj','dart','cs','vue','svelte']),
  config: new Set(['json','yaml','yml','toml','env','ini','lock','conf','cfg','properties','editorconfig','gitignore','dockerignore','eslintrc','prettierrc','babelrc','nvmrc']),
  markup: new Set(['html','htm','css','scss','sass','less','xml','svg','astro','njk','ejs','hbs','pug','styl']),
  docs:   new Set(['md','txt','rst','adoc','tex','org','log']),
  data:   new Set(['csv','sql','graphql','gql','prisma','tsv']),
};

const BINARY_EXTENSIONS = new Set([
  'png','jpg','jpeg','gif','webp','bmp','ico','tiff','tif',
  'pdf','zip','gz','tar','rar','7z','bz2','xz',
  'exe','dll','so','dylib','o','a','wasm','bin','dat',
  'db','sqlite','sqlite3',
  'mp3','mp4','avi','mov','flv','wmv','wav','ogg','flac','aac','m4a',
  'ttf','otf','woff','woff2','eot',
  'class','jar','pyc','pyo',
  'DS_Store',
]);

function getFileExt(filePath) {
  const dot = filePath.lastIndexOf('.');
  if (dot < 0) return '';
  return filePath.slice(dot + 1).toLowerCase();
}

function getFileCategory(filePath) {
  const ext = getFileExt(filePath);
  if (BINARY_EXTENSIONS.has(ext)) return 'binary';
  for (const [cat, exts] of Object.entries(FILE_TYPES)) {
    if (exts.has(ext)) return cat;
  }
  return 'default';
}

function isBinaryFile(filePath) {
  return BINARY_EXTENSIONS.has(getFileExt(filePath));
}

// ── Badge ────────────────────────────────────────────────
export function updateAttachmentBadge() {
  const attachedFiles = getState("attachedFiles");
  const imageAttachments = getState("imageAttachments");
  const total = attachedFiles.length + imageAttachments.length;
  if (total > 0) {
    $.attachBadge.textContent = total;
    $.attachBadge.classList.remove("hidden");
  } else {
    $.attachBadge.classList.add("hidden");
  }
}

// ── Selected chips ───────────────────────────────────────
function renderSelectedChips() {
  const attachedFiles = getState("attachedFiles");
  $.fpSelected.innerHTML = "";

  if (attachedFiles.length === 0) {
    $.fpSelected.classList.add("hidden");
    return;
  }

  $.fpSelected.classList.remove("hidden");
  for (const file of attachedFiles) {
    const chip = document.createElement("div");
    chip.className = "fp-chip";

    const name = document.createElement("span");
    name.className = "fp-chip-name";
    name.textContent = file.path;
    name.title = file.path;

    const removeBtn = document.createElement("button");
    removeBtn.className = "fp-chip-remove";
    removeBtn.textContent = "\u00d7";
    removeBtn.title = "Remove";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeFileByPath(file.path);
    });

    chip.appendChild(name);
    chip.appendChild(removeBtn);
    $.fpSelected.appendChild(chip);
  }
}

function removeFileByPath(path) {
  const attachedFiles = getState("attachedFiles").filter(f => f.path !== path);
  setState("attachedFiles", attachedFiles);
  renderSelectedChips();
  updateFooterCount();
  updateAttachmentBadge();
  // Update item in list if visible
  const items = $.fpList.querySelectorAll(".file-picker-item");
  for (const item of items) {
    if (item.dataset.path === path) {
      item.classList.remove("selected");
      const check = item.querySelector(".fp-check");
      if (check) check.style.opacity = "0";
    }
  }
}

// ── File picker ──────────────────────────────────────────
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

  const visible = filtered.slice(0, 200);

  // Show/hide empty state
  if (visible.length === 0) {
    $.fpEmpty.classList.remove("hidden");
    $.fpList.style.display = "none";
  } else {
    $.fpEmpty.classList.add("hidden");
    $.fpList.style.display = "";
  }

  for (const filePath of visible) {
    const category = getFileCategory(filePath);
    const binary = category === 'binary';
    const isSelected = attachedFiles.some((f) => f.path === filePath);

    const item = document.createElement("div");
    item.className = "file-picker-item";
    item.dataset.path = filePath;
    if (isSelected) item.classList.add("selected");
    if (binary) item.classList.add("binary-warn");

    // Type dot
    const dot = document.createElement("span");
    dot.className = `fp-type-dot type-${category}`;
    item.appendChild(dot);

    // File path
    const pathEl = document.createElement("span");
    pathEl.className = "fp-path";
    pathEl.textContent = filePath;
    item.appendChild(pathEl);

    if (binary) {
      // Binary label
      const label = document.createElement("span");
      label.className = "fp-binary-label";
      label.textContent = "binary";
      item.appendChild(label);
    } else {
      // Checkmark
      const check = document.createElement("span");
      check.className = "fp-check";
      check.textContent = "\u2713";
      item.appendChild(check);

      item.addEventListener("click", () => toggleFileAttachment(filePath, item));
    }

    $.fpList.appendChild(item);
  }

  renderSelectedChips();
  updateFooterCount();
}

function updateFooterCount() {
  const attachedFiles = getState("attachedFiles");
  const count = attachedFiles.length;
  $.fpCount.textContent = `${count} file${count !== 1 ? "s" : ""} selected`;
}

async function toggleFileAttachment(filePath, itemEl) {
  const attachedFiles = [...getState("attachedFiles")];
  const idx = attachedFiles.findIndex((f) => f.path === filePath);

  if (idx >= 0) {
    // Deselect
    attachedFiles.splice(idx, 1);
    setState("attachedFiles", attachedFiles);
    itemEl.classList.remove("selected");
    renderSelectedChips();
    updateFooterCount();
    updateAttachmentBadge();
    return;
  }

  // Show loading state
  itemEl.classList.add("loading");
  const check = itemEl.querySelector(".fp-check");
  if (check) check.style.display = "none";
  const spinner = document.createElement("span");
  spinner.className = "fp-spinner";
  itemEl.appendChild(spinner);

  try {
    const cwd = $.projectSelect.value;
    const data = await api.fetchFileContent(cwd, filePath);
    // Remove spinner, show selected
    spinner.remove();
    if (check) check.style.display = "";
    itemEl.classList.remove("loading");
    itemEl.classList.add("selected");

    const updated = [...getState("attachedFiles")];
    updated.push({ path: filePath, content: data.content });
    setState("attachedFiles", updated);
    renderSelectedChips();
    updateFooterCount();
    updateAttachmentBadge();
  } catch (err) {
    // Remove spinner, show error
    spinner.remove();
    if (check) check.style.display = "";
    itemEl.classList.remove("loading");
    showItemError(itemEl, parseFileError(err.message));
  }
}

function parseFileError(message) {
  if (message.includes("50KB") || message.includes("too large") || message.includes("413")) {
    return "Too large (50KB limit)";
  }
  if (message.includes("ENOENT") || message.includes("not found")) {
    return "File not found";
  }
  if (message.includes("EACCES") || message.includes("permission")) {
    return "Permission denied";
  }
  return "Cannot read file";
}

function showItemError(itemEl, message) {
  itemEl.classList.add("error");
  // Remove existing error msg if any
  const existing = itemEl.querySelector(".fp-error-msg");
  if (existing) existing.remove();

  const errorMsg = document.createElement("span");
  errorMsg.className = "fp-error-msg";
  errorMsg.textContent = message;
  itemEl.appendChild(errorMsg);

  // Auto-clear after 3s
  setTimeout(() => {
    itemEl.classList.remove("error");
    errorMsg.remove();
  }, 3000);
}

function closeFilePicker() {
  $.fpModal.classList.add("hidden");
}

// ── Image attachments ────────────────────────────────────
export function addImageAttachment(file) {
  if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
    showImageError(`Unsupported type: ${file.type || "unknown"}. Use PNG, JPEG, GIF, or WebP.`);
    return;
  }
  if (file.size > MAX_IMAGE_SIZE) {
    showImageError(`Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.`);
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const base64 = reader.result.split(",")[1];
    const images = [...getState("imageAttachments")];
    images.push({ name: file.name, data: base64, mimeType: file.type });
    setState("imageAttachments", images);
    renderImagePreview();
    updateAttachmentBadge();
  };
  reader.readAsDataURL(file);
}

export function removeImageAttachment(index) {
  const images = [...getState("imageAttachments")];
  images.splice(index, 1);
  setState("imageAttachments", images);
  renderImagePreview();
  updateAttachmentBadge();
}

export function getImageAttachments() {
  return getState("imageAttachments");
}

export function clearImageAttachments() {
  setState("imageAttachments", []);
  renderImagePreview();
  updateAttachmentBadge();
}

function renderImagePreview() {
  const strip = $.imagePreviewStrip;
  const images = getState("imageAttachments");
  strip.innerHTML = "";

  if (images.length === 0) {
    strip.classList.add("hidden");
    return;
  }

  strip.classList.remove("hidden");
  images.forEach((img, i) => {
    const item = document.createElement("div");
    item.className = "image-preview-item";

    const imgEl = document.createElement("img");
    imgEl.src = `data:${img.mimeType};base64,${img.data}`;
    imgEl.alt = img.name;
    imgEl.title = `${img.name}`;

    const removeBtn = document.createElement("button");
    removeBtn.className = "image-preview-remove";
    removeBtn.textContent = "\u00d7";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeImageAttachment(i);
    });

    item.appendChild(imgEl);
    item.appendChild(removeBtn);
    strip.appendChild(item);
  });
}

function showImageError(message) {
  const container = document.getElementById("toast-container");
  if (container) {
    const toast = document.createElement("div");
    toast.className = "toast error";
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  } else {
    alert(message);
  }
}

// ── Event listeners ──────────────────────────────────────

// File picker buttons
$.attachBtn.addEventListener("click", openFilePicker);
document.getElementById("fp-modal-close").addEventListener("click", closeFilePicker);
document.getElementById("fp-done-btn").addEventListener("click", closeFilePicker);
$.fpModal.addEventListener("click", (e) => {
  if (e.target === $.fpModal) closeFilePicker();
});
$.fpSearch.addEventListener("input", () => {
  renderFilePicker($.fpSearch.value.trim());
});

// Image button → open file picker
$.imageBtn.addEventListener("click", () => {
  $.imageFileInput.click();
});

// Hidden file input change
$.imageFileInput.addEventListener("change", () => {
  for (const file of $.imageFileInput.files) {
    addImageAttachment(file);
  }
  $.imageFileInput.value = "";
});

// Paste handler — detect images in clipboard
document.addEventListener("paste", (e) => {
  const active = document.activeElement;
  if (active !== $.messageInput && !$.messageInput.contains(active)) return;

  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.kind === "file" && SUPPORTED_IMAGE_TYPES.includes(item.type)) {
      e.preventDefault();
      addImageAttachment(item.getAsFile());
    }
  }
});

// Drag-and-drop on message input
$.messageInput.addEventListener("dragover", (e) => {
  if ([...e.dataTransfer.types].includes("Files")) {
    e.preventDefault();
    $.messageInput.classList.add("drag-highlight");
  }
});

$.messageInput.addEventListener("dragleave", () => {
  $.messageInput.classList.remove("drag-highlight");
});

$.messageInput.addEventListener("drop", (e) => {
  $.messageInput.classList.remove("drag-highlight");
  if (!e.dataTransfer.files.length) return;
  e.preventDefault();

  let hasUnsupported = false;
  for (const file of e.dataTransfer.files) {
    if (SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      addImageAttachment(file);
    } else {
      hasUnsupported = true;
    }
  }

  if (hasUnsupported) {
    showImageError("Only images (PNG, JPEG, GIF, WebP) can be dropped here. Use the attach button for code files.");
  }
});

// ── Commands ─────────────────────────────────────────────
registerCommand("attach", {
  category: "app",
  description: "Attach files to next message",
  execute() {
    openFilePicker();
  },
});

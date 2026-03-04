// File Explorer — lazy-loaded tree view with file preview
import { $ } from "./dom.js";
import { on } from "./events.js";
import { getState, on as onState } from "./store.js";
import { fetchFileTree, fetchFileContent, searchFiles } from "./api.js";
import { highlightCodeBlocks } from "./formatting.js";
import { escapeHtml } from "./utils.js";

const treeCache = new Map();
let currentProject = null;
let activeFilePath = null;
let searchMode = false;
let searchDebounce = null;

function isFilesTabActive() {
  const pane = $.rightPanel?.querySelector('.right-panel-pane[data-tab="files"]');
  return pane && pane.classList.contains("active") && !$.rightPanel.classList.contains("hidden");
}

// SVG icons
const CHEVRON_SVG = `<svg class="file-tree-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`;
const FOLDER_SVG = `<svg class="file-tree-icon folder" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
const FILE_SVG = `<svg class="file-tree-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`;

function getProjectPath() {
  const projects = getState("projectsData");
  const selected = $.projectSelect.value;
  if (!selected || !projects) return null;
  const proj = projects.find((p) => p.path === selected);
  return proj ? proj.path : selected;
}

async function loadTree(dir = "") {
  const base = getProjectPath();
  if (!base) return;

  const cacheKey = `${base}::${dir}`;
  if (treeCache.has(cacheKey)) return treeCache.get(cacheKey);

  const entries = await fetchFileTree(base, dir);
  treeCache.set(cacheKey, entries);
  return entries;
}

function createTreeItem(entry, depth) {
  const item = document.createElement("div");
  item.className = "file-tree-item";
  item.style.paddingLeft = `${8 + depth * 16}px`;
  item.dataset.path = entry.path;
  item.dataset.type = entry.type;

  const isDir = entry.type === "dir";
  const chevron = isDir ? CHEVRON_SVG : `<svg class="file-tree-chevron hidden" viewBox="0 0 24 24"></svg>`;
  const icon = isDir ? FOLDER_SVG : FILE_SVG;

  item.innerHTML = `${chevron}${icon}<span class="file-tree-name">${escapeHtml(entry.name)}</span>`;

  // Make all items draggable
  item.draggable = true;
  item.addEventListener("dragstart", (e) => {
    const base = getProjectPath() || "";
    const fullPath = base ? `${base}/${entry.path}` : entry.path;
    e.dataTransfer.setData("text/plain", fullPath);
    e.dataTransfer.setData("application/x-file-path", fullPath);
    e.dataTransfer.effectAllowed = "copy";
    item.classList.add("dragging");
  });
  item.addEventListener("dragend", () => {
    item.classList.remove("dragging");
  });

  if (isDir) {
    const childrenContainer = document.createElement("div");
    childrenContainer.className = "file-tree-children";
    item.after(childrenContainer);

    item.addEventListener("click", async () => {
      const chevronEl = item.querySelector(".file-tree-chevron");
      const isExpanded = childrenContainer.classList.contains("expanded");

      if (isExpanded) {
        childrenContainer.classList.remove("expanded");
        chevronEl.classList.remove("expanded");
      } else {
        chevronEl.classList.add("expanded");
        if (childrenContainer.children.length === 0) {
          childrenContainer.innerHTML = `<div class="file-tree-loading" style="padding-left:${8 + (depth + 1) * 16}px">Loading...</div>`;
          childrenContainer.classList.add("expanded");
          try {
            const children = await loadTree(entry.path);
            childrenContainer.innerHTML = "";
            renderEntries(children, childrenContainer, depth + 1);
          } catch {
            childrenContainer.innerHTML = `<div class="file-tree-loading" style="padding-left:${8 + (depth + 1) * 16}px">Failed to load</div>`;
          }
        } else {
          childrenContainer.classList.add("expanded");
        }
      }
    });

    return [item, childrenContainer];
  }

  // File click — show preview
  item.addEventListener("click", () => openFilePreview(entry));
  return [item];
}

function renderEntries(entries, container, depth) {
  if (!entries || entries.length === 0) {
    container.innerHTML = `<div class="file-tree-loading" style="padding-left:${8 + depth * 16}px">Empty</div>`;
    return;
  }
  for (const entry of entries) {
    const elements = createTreeItem(entry, depth);
    for (const el of elements) {
      container.appendChild(el);
    }
  }
}

async function openFilePreview(entry) {
  const base = getProjectPath();
  if (!base) return;

  // Highlight active item
  $.fileTree.querySelectorAll(".file-tree-item.active").forEach((el) => el.classList.remove("active"));
  const item = $.fileTree.querySelector(`[data-path="${CSS.escape(entry.path)}"][data-type="file"]`);
  if (item) item.classList.add("active");

  activeFilePath = entry.path;
  $.filePreviewName.textContent = entry.path;
  $.filePreviewContent.querySelector("code").textContent = "Loading...";
  $.filePreview.classList.remove("hidden");

  try {
    const data = await fetchFileContent(base, entry.path);
    if (activeFilePath !== entry.path) return; // stale
    const code = $.filePreviewContent.querySelector("code");
    code.textContent = data.content;
    code.className = ""; // reset hljs classes
    delete code.dataset.highlighted;
    highlightCodeBlocks($.filePreviewContent);
  } catch (err) {
    if (activeFilePath !== entry.path) return;
    $.filePreviewContent.querySelector("code").textContent = `Error: ${err.message}`;
  }
}

function closePreview() {
  $.filePreview.classList.add("hidden");
  activeFilePath = null;
  $.fileTree.querySelectorAll(".file-tree-item.active").forEach((el) => el.classList.remove("active"));
}

async function loadRootTree() {
  const base = getProjectPath();
  if (!base) {
    $.fileTree.innerHTML = `<div class="file-tree-loading">Select a project</div>`;
    return;
  }

  if (currentProject === base && $.fileTree.children.length > 0) return;
  currentProject = base;

  $.fileTree.innerHTML = `<div class="file-tree-loading">Loading...</div>`;
  closePreview();

  try {
    const entries = await loadTree("");
    $.fileTree.innerHTML = "";
    renderEntries(entries, $.fileTree, 0);
  } catch {
    $.fileTree.innerHTML = `<div class="file-tree-loading">Failed to load</div>`;
  }
}

async function searchTree(query) {
  const base = getProjectPath();
  if (!base) return;

  if (!query) {
    // Restore normal tree view
    if (searchMode) {
      searchMode = false;
      currentProject = null; // force reload
      loadRootTree();
    }
    return;
  }

  searchMode = true;
  $.fileTree.innerHTML = `<div class="file-tree-loading">Searching...</div>`;

  try {
    const results = await searchFiles(base, query);
    $.fileTree.innerHTML = "";

    if (!results || results.length === 0) {
      $.fileTree.innerHTML = `<div class="file-tree-loading">No matches</div>`;
      return;
    }

    for (const entry of results) {
      const item = document.createElement("div");
      item.className = "file-tree-item file-search-result";
      item.dataset.path = entry.path;
      item.dataset.type = entry.type;

      const isDir = entry.type === "dir";
      const icon = isDir ? FOLDER_SVG : FILE_SVG;

      // Show filename prominent + relative path dimmed
      const dirPart = entry.path.includes("/")
        ? entry.path.slice(0, entry.path.lastIndexOf("/"))
        : "";

      item.innerHTML = `${icon}<span class="file-search-name">${escapeHtml(entry.name)}</span>${
        dirPart ? `<span class="file-search-path">${escapeHtml(dirPart)}</span>` : ""
      }`;

      // Draggable
      item.draggable = true;
      item.addEventListener("dragstart", (e) => {
        const fullPath = base ? `${base}/${entry.path}` : entry.path;
        e.dataTransfer.setData("text/plain", fullPath);
        e.dataTransfer.setData("application/x-file-path", fullPath);
        e.dataTransfer.effectAllowed = "copy";
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", () => item.classList.remove("dragging"));

      if (!isDir) {
        item.addEventListener("click", () => openFilePreview(entry));
      }

      $.fileTree.appendChild(item);
    }
  } catch {
    $.fileTree.innerHTML = `<div class="file-tree-loading">Search failed</div>`;
  }
}

function resetExplorer() {
  treeCache.clear();
  currentProject = null;
  activeFilePath = null;
  $.fileTree.innerHTML = "";
  closePreview();
}

function initFileExplorer() {
  $.filePreviewClose.addEventListener("click", closePreview);

  $.fileExplorerSearch.addEventListener("input", (e) => {
    clearTimeout(searchDebounce);
    const q = e.target.value.trim();
    searchDebounce = setTimeout(() => searchTree(q), 250);
  });

  // Load tree when Files tab is opened
  on("rightPanel:opened", (tab) => {
    if (tab === "files") loadRootTree();
  });
  on("rightPanel:tabChanged", (tab) => {
    if (tab === "files") loadRootTree();
  });

  // Reset and reload on project switch
  $.projectSelect.addEventListener("change", () => {
    resetExplorer();
    if (isFilesTabActive()) loadRootTree();
  });

  // Load tree when projects data arrives (covers initial page load)
  // setTimeout(0) defers until after loadProjects() finishes populating the select
  onState("projectsData", () => {
    setTimeout(() => {
      if (isFilesTabActive()) loadRootTree();
    }, 0);
  });

  // ── Context menu on right-click ──
  initContextMenu();

  // ── Drag-to-chat: drop file paths into message input ──
  initDropTargets();
}

// ── Context Menu ────────────────────────────────────────
let ctxMenu = null;

function hideContextMenu() {
  if (ctxMenu) {
    ctxMenu.remove();
    ctxMenu = null;
  }
}

function showContextMenu(e, relPath) {
  e.preventDefault();
  hideContextMenu();

  const base = getProjectPath() || "";
  const fullPath = base ? `${base}/${relPath}` : relPath;

  ctxMenu = document.createElement("div");
  ctxMenu.className = "file-ctx-menu";
  ctxMenu.innerHTML = `
    <button data-action="full">Copy Full Path</button>
    <button data-action="relative">Copy Relative Path</button>
  `;

  // Position at cursor
  ctxMenu.style.left = e.clientX + "px";
  ctxMenu.style.top = e.clientY + "px";
  document.body.appendChild(ctxMenu);

  // Keep menu within viewport
  const rect = ctxMenu.getBoundingClientRect();
  if (rect.right > window.innerWidth) ctxMenu.style.left = (e.clientX - rect.width) + "px";
  if (rect.bottom > window.innerHeight) ctxMenu.style.top = (e.clientY - rect.height) + "px";

  ctxMenu.addEventListener("click", (ev) => {
    const action = ev.target.dataset.action;
    if (action === "full") navigator.clipboard.writeText(fullPath);
    if (action === "relative") navigator.clipboard.writeText(relPath);
    hideContextMenu();
  });
}

function initContextMenu() {
  // Delegate on file tree container
  $.fileTree.addEventListener("contextmenu", (e) => {
    const item = e.target.closest(".file-tree-item");
    if (!item) return;
    const relPath = item.dataset.path;
    if (relPath) showContextMenu(e, relPath);
  });

  // Close on click outside or Escape
  document.addEventListener("click", (e) => {
    if (ctxMenu && !ctxMenu.contains(e.target)) hideContextMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideContextMenu();
  });
}

function initDropTargets() {
  // Target the entire chat area so it works for both normal and parallel mode inputs
  const chatArea = document.querySelector(".chat-area");
  if (!chatArea) return;

  chatArea.addEventListener("dragover", (e) => {
    if (!e.dataTransfer.types.includes("application/x-file-path")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    // Highlight the nearest textarea
    const textarea = findNearestTextarea(e.target);
    if (textarea) textarea.classList.add("file-drop-hover");
  });

  chatArea.addEventListener("dragleave", (e) => {
    const textarea = findNearestTextarea(e.target);
    if (textarea) textarea.classList.remove("file-drop-hover");
  });

  chatArea.addEventListener("drop", (e) => {
    const filePath = e.dataTransfer.getData("application/x-file-path");
    if (!filePath) return;
    e.preventDefault();

    // Find the closest textarea to drop into
    let textarea = findNearestTextarea(e.target);
    if (!textarea) textarea = $.messageInput;

    textarea.classList.remove("file-drop-hover");

    // Insert path at cursor position (or append)
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = textarea.value;
    const insert = filePath;

    // Add space before if there's already text and it doesn't end with space/newline
    const prefix = current.length > 0 && start > 0 && !/[\s\n]$/.test(current.slice(0, start)) ? " " : "";

    textarea.value = current.slice(0, start) + prefix + insert + current.slice(end);
    textarea.selectionStart = textarea.selectionEnd = start + prefix.length + insert.length;
    textarea.focus();

    // Trigger input event for auto-resize
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function findNearestTextarea(el) {
  // Walk up to find a textarea (message input)
  if (el?.tagName === "TEXTAREA") return el;
  // Check within the input-bar or parallel pane
  const bar = el?.closest?.(".input-bar, .parallel-pane");
  if (bar) return bar.querySelector("textarea");
  return null;
}

initFileExplorer();

import { $ } from "./dom.js";
import { on } from "./events.js";
import { fetchTodos, createTodoApi, updateTodoApi, deleteTodoApi, archiveTodoApi } from "./api.js";

let todos = [];
let loaded = false;
let showArchived = false;

// ── Render ──────────────────────────────────────────────
function renderTodos() {
  const list = $.todoList;
  const emptyMsg = showArchived ? "No archived todos" : "No todos yet";
  if (!todos.length) {
    list.innerHTML = `<div class="todo-empty">${emptyMsg}</div>`;
    return;
  }
  list.innerHTML = "";
  for (const t of todos) {
    const row = document.createElement("div");
    row.className = "todo-item" + (t.done ? " done" : "");
    row.dataset.id = t.id;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!t.done;
    cb.addEventListener("change", () => handleToggle(t.id, cb.checked ? 1 : 0));

    const span = document.createElement("span");
    span.className = "todo-text";
    span.textContent = t.text;
    if (!showArchived) span.addEventListener("dblclick", () => startEdit(span, t));

    const actions = document.createElement("span");
    actions.className = "todo-actions";

    // Archive / Unarchive button
    const archBtn = document.createElement("button");
    archBtn.className = "todo-action-btn todo-archive-btn";
    archBtn.title = showArchived ? "Unarchive" : "Archive";
    archBtn.innerHTML = showArchived
      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>'
      : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>';
    archBtn.addEventListener("click", () => handleArchive(t.id, !showArchived));

    const del = document.createElement("button");
    del.className = "todo-action-btn todo-delete-btn";
    del.textContent = "\u00d7";
    del.title = "Delete";
    del.addEventListener("click", () => handleDelete(t.id));

    actions.append(archBtn, del);
    row.append(cb, span, actions);
    list.appendChild(row);
  }
}

function updateHeaderToggle() {
  const btn = document.getElementById("todo-archive-toggle");
  if (btn) {
    btn.classList.toggle("active", showArchived);
    btn.title = showArchived ? "Show active todos" : "Show archived";
  }
}

// ── CRUD handlers ───────────────────────────────────────
async function loadTodos() {
  try {
    todos = await fetchTodos(showArchived);
    renderTodos();
  } catch { /* ignore */ }
}

async function handleAdd() {
  $.todoInputBar.style.display = "";
  $.todoInput.value = "";
  $.todoInput.focus();
}

async function handleSubmit() {
  const text = $.todoInput.value.trim();
  if (!text) return;
  $.todoInput.value = "";
  $.todoInputBar.style.display = "none";
  try {
    await createTodoApi(text);
    await loadTodos();
  } catch { /* ignore */ }
}

async function handleToggle(id, done) {
  try {
    await updateTodoApi(id, { done });
    const t = todos.find((x) => x.id === id);
    if (t) t.done = done;
    renderTodos();
  } catch { /* ignore */ }
}

async function handleArchive(id, archived) {
  try {
    await archiveTodoApi(id, archived);
    todos = todos.filter((x) => x.id !== id);
    renderTodos();
  } catch { /* ignore */ }
}

async function handleDelete(id) {
  try {
    await deleteTodoApi(id);
    todos = todos.filter((x) => x.id !== id);
    renderTodos();
  } catch { /* ignore */ }
}

function startEdit(span, todo) {
  span.contentEditable = "true";
  span.classList.add("editing");
  span.focus();

  const range = document.createRange();
  range.selectNodeContents(span);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const finish = async () => {
    span.contentEditable = "false";
    span.classList.remove("editing");
    const newText = span.textContent.trim();
    if (newText && newText !== todo.text) {
      try {
        await updateTodoApi(todo.id, { text: newText });
        todo.text = newText;
      } catch {
        span.textContent = todo.text;
      }
    } else {
      span.textContent = todo.text;
    }
  };

  span.addEventListener("blur", finish, { once: true });
  span.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); span.blur(); }
    if (e.key === "Escape") { span.textContent = todo.text; span.blur(); }
  });
}

// ── Split drag handle ───────────────────────────────────
function initSplitDrag() {
  const handle = $.tasksSplitHandle;
  const container = handle?.parentElement;
  if (!handle || !container) return;

  const saved = localStorage.getItem("tasks-split-ratio");
  const ratio = saved ? parseFloat(saved) : 0.5;
  applyRatio(ratio);

  handle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    handle.classList.add("dragging");
    const startY = e.clientY;
    const handleH = handle.offsetHeight;
    const totalH = container.getBoundingClientRect().height - handleH;
    const startTop = $.tasksLinearSection.getBoundingClientRect().height;

    const onMove = (ev) => {
      const dy = ev.clientY - startY;
      let newTop = startTop + dy;
      const min = 60;
      newTop = Math.max(min, Math.min(totalH - min, newTop));
      applyRatio(newTop / totalH);
    };

    const onUp = () => {
      handle.classList.remove("dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const topH = $.tasksLinearSection.getBoundingClientRect().height;
      const tot = container.getBoundingClientRect().height - handleH;
      if (tot > 0) localStorage.setItem("tasks-split-ratio", (topH / tot).toFixed(3));
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}

function applyRatio(ratio) {
  const r = Math.max(0.1, Math.min(0.9, ratio));
  const container = $.tasksSplitHandle?.parentElement;
  if (container) {
    container.style.setProperty("--tasks-split-top", r);
    container.style.setProperty("--tasks-split-bottom", 1 - r);
  }
}

// ── Init ────────────────────────────────────────────────
function initTodoPanel() {
  if (!$.todoAddBtn) return;

  $.todoAddBtn.addEventListener("click", handleAdd);

  $.todoInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSubmit();
    if (e.key === "Escape") {
      $.todoInputBar.style.display = "none";
    }
  });

  // Archive toggle button in header
  const archToggle = document.getElementById("todo-archive-toggle");
  if (archToggle) {
    archToggle.addEventListener("click", () => {
      showArchived = !showArchived;
      updateHeaderToggle();
      // Hide add button and input bar when viewing archived
      $.todoAddBtn.style.display = showArchived ? "none" : "";
      $.todoInputBar.style.display = "none";
      loadTodos();
    });
  }

  initSplitDrag();

  const maybeLoad = (tab) => {
    if (tab === "tasks" && !loaded) {
      loaded = true;
      loadTodos();
    }
  };

  on("rightPanel:opened", maybeLoad);
  on("rightPanel:tabChanged", maybeLoad);

  const pane = document.querySelector('.right-panel-pane[data-tab="tasks"]');
  if (pane && pane.classList.contains("active") && !document.getElementById("right-panel")?.classList.contains("hidden")) {
    loaded = true;
    loadTodos();
  }
}

initTodoPanel();

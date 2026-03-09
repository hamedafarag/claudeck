import { $ } from "./dom.js";
import { on } from "./events.js";
import { fetchTodos, createTodoApi, updateTodoApi, deleteTodoApi, archiveTodoApi, bragTodoApi, fetchBrags, deleteBragApi, fetchTodoCounts } from "./api.js";

let todos = [];
let brags = [];
let loaded = false;
let showArchived = false;
let showBrags = false;

// ── Render ──────────────────────────────────────────────
function renderTodos() {
  const list = $.todoList;

  // Brag list view
  if (showBrags) {
    if (!brags.length) {
      list.innerHTML = `<div class="todo-empty">No brags yet</div>`;
      return;
    }
    list.innerHTML = "";
    for (const b of brags) {
      const row = document.createElement("div");
      row.className = "brag-item";

      const text = document.createElement("div");
      text.className = "brag-text";
      text.textContent = b.text;

      const summary = document.createElement("div");
      summary.className = "brag-summary";
      summary.textContent = b.summary;

      const date = document.createElement("div");
      date.className = "brag-date";
      date.textContent = new Date(b.created_at * 1000).toLocaleDateString();

      const del = document.createElement("button");
      del.className = "todo-action-btn todo-delete-btn brag-delete";
      del.textContent = "\u00d7";
      del.title = "Delete";
      del.addEventListener("click", async () => {
        try {
          await deleteBragApi(b.id);
          brags = brags.filter(x => x.id !== b.id);
          renderTodos();
          refreshCounts();
        } catch { /* ignore */ }
      });

      row.append(text, summary, date, del);
      list.appendChild(row);
    }
    return;
  }

  const emptyMsg = showArchived ? "No archived todos" : "No todos yet";
  if (!todos.length) {
    list.innerHTML = `<div class="todo-empty">${emptyMsg}</div>`;
    return;
  }
  const PRIORITY_LABELS = ["none", "low", "medium", "high"];

  list.innerHTML = "";
  for (const t of todos) {
    const pri = t.priority || 0;
    const row = document.createElement("div");
    row.className = "todo-item" + (t.done ? " done" : "");
    if (pri > 0) row.classList.add(`priority-${pri}`);
    row.dataset.id = t.id;

    // Priority dot — click to cycle
    const priDot = document.createElement("button");
    priDot.className = `todo-priority-dot priority-${pri}`;
    priDot.title = `Priority: ${PRIORITY_LABELS[pri]} (click to change)`;
    priDot.addEventListener("click", () => handlePriority(t.id, (pri + 1) % 4));

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

    // Brag button (not in archived view)
    if (!showArchived) {
      const bragBtn = document.createElement("button");
      bragBtn.className = "todo-action-btn todo-brag-btn";
      bragBtn.title = "Brag about this";
      bragBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
      bragBtn.addEventListener("click", () => showBragPrompt(t));
      actions.appendChild(bragBtn);
    }

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
    row.append(priDot, cb, span, actions);
    list.appendChild(row);
  }
}

function updateHeaderToggle() {
  const btn = document.getElementById("todo-archive-toggle");
  if (btn) {
    btn.classList.toggle("active", showArchived);
    btn.title = showArchived ? "Show active todos" : "Show archived";
  }
  const bragBtn = document.getElementById("todo-brag-toggle");
  if (bragBtn) {
    bragBtn.classList.toggle("active", showBrags);
    bragBtn.title = showBrags ? "Show active todos" : "Show brag list";
  }
}

async function refreshCounts() {
  try {
    const counts = await fetchTodoCounts();
    const header = document.querySelector(".todo-panel-header h3");
    if (header) {
      const label = showBrags ? "Brags" : showArchived ? "Archived" : "Todo";
      const count = showBrags ? counts.brags : showArchived ? counts.archived : counts.active;
      header.textContent = `${label} (${count})`;
    }
    // Badges on toggle buttons
    setBadge("todo-archive-toggle", counts.archived);
    setBadge("todo-brag-toggle", counts.brags);
  } catch { /* ignore */ }
}

function setBadge(btnId, count) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  let badge = btn.querySelector(".todo-count-badge");
  if (count > 0) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "todo-count-badge";
      btn.appendChild(badge);
    }
    badge.textContent = count;
  } else if (badge) {
    badge.remove();
  }
}

// ── CRUD handlers ───────────────────────────────────────
async function loadTodos() {
  try {
    todos = await fetchTodos(showArchived);
    renderTodos();
    refreshCounts();
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
    await loadTodos(); // loadTodos already calls refreshCounts
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
    refreshCounts();
  } catch { /* ignore */ }
}

async function handlePriority(id, priority) {
  try {
    await updateTodoApi(id, { priority });
    const t = todos.find((x) => x.id === id);
    if (t) t.priority = priority;
    renderTodos();
  } catch { /* ignore */ }
}

async function handleDelete(id) {
  try {
    await deleteTodoApi(id);
    todos = todos.filter((x) => x.id !== id);
    renderTodos();
    refreshCounts();
  } catch { /* ignore */ }
}

function showBragPrompt(todo) {
  // Remove any existing brag prompt
  const existing = document.querySelector(".brag-prompt-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.className = "brag-prompt-overlay";

  overlay.innerHTML = `
    <div class="brag-prompt">
      <div class="brag-prompt-title">Brag about it!</div>
      <div class="brag-prompt-task">${todo.text}</div>
      <textarea class="brag-prompt-input" placeholder="Write a summary of what you accomplished..." maxlength="500" rows="4"></textarea>
      <div class="brag-prompt-counter"><span class="brag-char-count">0</span>/500</div>
      <div class="brag-prompt-actions">
        <button class="brag-prompt-cancel">Cancel</button>
        <button class="brag-prompt-submit">Brag it!</button>
      </div>
    </div>
  `;

  const textarea = overlay.querySelector(".brag-prompt-input");
  const counter = overlay.querySelector(".brag-char-count");
  const submitBtn = overlay.querySelector(".brag-prompt-submit");
  const cancelBtn = overlay.querySelector(".brag-prompt-cancel");

  textarea.addEventListener("input", () => {
    counter.textContent = textarea.value.length;
  });

  cancelBtn.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  submitBtn.addEventListener("click", async () => {
    const summary = textarea.value.trim();
    if (!summary) { textarea.focus(); return; }
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";
    try {
      await bragTodoApi(todo.id, summary);
      overlay.remove();
      todos = todos.filter(x => x.id !== todo.id);
      renderTodos();
      refreshCounts();
    } catch {
      submitBtn.disabled = false;
      submitBtn.textContent = "Brag it!";
    }
  });

  document.body.appendChild(overlay);
  textarea.focus();
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
      showBrags = false;
      updateHeaderToggle();
      $.todoAddBtn.style.display = showArchived ? "none" : "";
      $.todoInputBar.style.display = "none";
      loadTodos();
    });
  }

  // Brag toggle button in header
  const bragToggle = document.getElementById("todo-brag-toggle");
  if (bragToggle) {
    bragToggle.addEventListener("click", async () => {
      showBrags = !showBrags;
      showArchived = false;
      updateHeaderToggle();
      $.todoAddBtn.style.display = showBrags ? "none" : "";
      $.todoInputBar.style.display = "none";
      if (showBrags) {
        try {
          brags = await fetchBrags();
        } catch { brags = []; }
        renderTodos();
        refreshCounts();
      } else {
        loadTodos();
      }
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

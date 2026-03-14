// MCP Server Management — CRUD modal for global + per-project mcpServers
import { $ } from "../core/dom.js";
import { fetchMcpServers, saveMcpServer, deleteMcpServer } from "../core/api.js";
import { registerCommand } from "../ui/commands.js";

let editingName = null;
let editingScope = "global";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function getCurrentProject() {
  return $.projectSelect?.value || null;
}

// ── Modal ───────────────────────────────────────────────

function openModal() {
  $.mcpModal.classList.remove("hidden");
  hideForm();
  loadServers();
}

function closeModal() {
  $.mcpModal.classList.add("hidden");
  hideForm();
}

// ── Server List ─────────────────────────────────────────

function renderSectionHeader(label, count, icon) {
  const el = document.createElement("div");
  el.className = "mcp-scope-header";
  el.innerHTML = `<span>${icon} ${label}</span><span class="mcp-scope-count">${count}</span>`;
  return el;
}

function renderEmpty(text) {
  const el = document.createElement("div");
  el.className = "mcp-empty mcp-empty-compact";
  el.textContent = text;
  return el;
}

async function loadServers() {
  $.mcpServerList.innerHTML = `<div class="mcp-empty">Loading...</div>`;

  try {
    const projectPath = getCurrentProject();

    // Fetch both scopes in parallel
    const [globalData, projectData] = await Promise.all([
      fetchMcpServers(),
      projectPath ? fetchMcpServers(projectPath) : Promise.resolve({ servers: {} }),
    ]);

    const globalServers = globalData.servers || {};
    const projectServers = projectData.servers || {};

    $.mcpServerList.innerHTML = "";

    // Project section (only when a project is selected)
    if (projectPath) {
      const projectNames = Object.keys(projectServers);
      $.mcpServerList.appendChild(renderSectionHeader("Project", projectNames.length, "\u{1F4C1}"));
      if (projectNames.length === 0) {
        $.mcpServerList.appendChild(renderEmpty("No project-level MCP servers"));
      } else {
        for (const name of projectNames) {
          $.mcpServerList.appendChild(renderCard(name, projectServers[name], "project"));
        }
      }
    }

    // Global section
    const globalNames = Object.keys(globalServers);
    $.mcpServerList.appendChild(renderSectionHeader("Global", globalNames.length, "\u{1F310}"));
    if (globalNames.length === 0) {
      $.mcpServerList.appendChild(renderEmpty("No global MCP servers"));
    } else {
      for (const name of globalNames) {
        $.mcpServerList.appendChild(renderCard(name, globalServers[name], "global"));
      }
    }
  } catch {
    $.mcpServerList.innerHTML = `<div class="mcp-empty">Failed to load servers</div>`;
  }
}

function getServerType(config) {
  if (config.command) return "stdio";
  if (config.url && config.url.includes("/sse")) return "sse";
  if (config.url) return "http";
  return config.type || "stdio";
}

function getServerDetail(config) {
  if (config.command) {
    const args = config.args ? " " + config.args.join(" ") : "";
    return config.command + args;
  }
  if (config.url) return config.url;
  return "";
}

function renderCard(name, config, scope) {
  const type = getServerType(config);
  const detail = getServerDetail(config);

  const card = document.createElement("div");
  card.className = "mcp-server-card";
  card.innerHTML = `
    <div class="mcp-server-info">
      <div class="mcp-server-name">
        ${escapeHtml(name)}
        <span class="mcp-server-type">${type}</span>
      </div>
      <div class="mcp-server-detail" title="${escapeHtml(detail)}">${escapeHtml(detail)}</div>
    </div>
    <div class="mcp-server-actions">
      <button class="edit" title="Edit">&#9998;</button>
      <button class="delete" title="Delete">&times;</button>
    </div>
  `;

  card.querySelector(".edit").addEventListener("click", () => showEditForm(name, config, scope));
  card.querySelector(".delete").addEventListener("click", () => handleDelete(name, scope));

  return card;
}

// ── Scope Selector ─────────────────────────────────────

function ensureScopeSelector() {
  let sel = document.getElementById("mcp-scope");
  if (sel) return sel;

  // Create label + select, insert before the Type label
  const label = document.createElement("label");
  label.setAttribute("for", "mcp-scope");
  label.textContent = "Scope";
  label.id = "mcp-scope-label";

  sel = document.createElement("select");
  sel.id = "mcp-scope";

  const typeLabel = $.mcpType.previousElementSibling;
  $.mcpForm.insertBefore(sel, typeLabel);
  $.mcpForm.insertBefore(label, sel);

  sel.addEventListener("change", () => { editingScope = sel.value; });
  return sel;
}

function updateScopeSelector(disabled) {
  const sel = ensureScopeSelector();
  const label = document.getElementById("mcp-scope-label");
  const projectPath = getCurrentProject();

  sel.innerHTML = `<option value="global">Global (~/.claude)</option>`;
  if (projectPath) {
    sel.innerHTML += `<option value="project">Project (.claude/)</option>`;
  }
  sel.value = editingScope;
  sel.disabled = !!disabled;

  // Hide scope selector entirely if no project selected
  const hidden = !projectPath;
  sel.style.display = hidden ? "none" : "";
  label.style.display = hidden ? "none" : "";
}

// ── Form ────────────────────────────────────────────────

function showAddForm() {
  editingName = null;
  editingScope = "global";
  $.mcpFormTitle.textContent = "Add Server";
  $.mcpForm.reset();
  $.mcpName.disabled = false;
  updateTypeFields();
  updateScopeSelector(false);
  $.mcpFormContainer.classList.remove("hidden");
  $.mcpAddBtn.classList.add("hidden");
  $.mcpName.focus();
}

function showEditForm(name, config, scope) {
  editingName = name;
  editingScope = scope;
  $.mcpFormTitle.textContent = "Edit Server";
  $.mcpName.value = name;
  $.mcpName.disabled = true;

  const type = getServerType(config);
  $.mcpType.value = type;
  updateTypeFields();
  updateScopeSelector(true); // can't change scope when editing

  if (config.command) {
    $.mcpCommand.value = config.command || "";
    $.mcpArgs.value = (config.args || []).join("\n");
    const envLines = Object.entries(config.env || {}).map(([k, v]) => `${k}=${v}`);
    $.mcpEnv.value = envLines.join("\n");
  }
  if (config.url) {
    $.mcpUrl.value = config.url;
  }

  $.mcpFormContainer.classList.remove("hidden");
  $.mcpAddBtn.classList.add("hidden");
}

function hideForm() {
  $.mcpFormContainer.classList.add("hidden");
  $.mcpAddBtn.classList.remove("hidden");
  editingName = null;
}

function updateTypeFields() {
  const type = $.mcpType.value;
  if (type === "stdio") {
    $.mcpStdioFields.classList.remove("hidden");
    $.mcpUrlFields.classList.add("hidden");
  } else {
    $.mcpStdioFields.classList.add("hidden");
    $.mcpUrlFields.classList.remove("hidden");
  }
}

async function handleSubmit(e) {
  e.preventDefault();
  const name = editingName || $.mcpName.value.trim();
  if (!name) return;

  const type = $.mcpType.value;
  let config = {};

  if (type === "stdio") {
    config.command = $.mcpCommand.value.trim();
    const argsText = $.mcpArgs.value.trim();
    if (argsText) config.args = argsText.split("\n").map((s) => s.trim()).filter(Boolean);
    const envText = $.mcpEnv.value.trim();
    if (envText) {
      config.env = {};
      for (const line of envText.split("\n")) {
        const eq = line.indexOf("=");
        if (eq > 0) {
          config.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
        }
      }
    }
  } else {
    config.url = $.mcpUrl.value.trim();
    config.type = type;
  }

  const projectPath = editingScope === "project" ? getCurrentProject() : undefined;

  $.mcpFormSave.disabled = true;
  $.mcpFormSave.textContent = "Saving...";

  try {
    await saveMcpServer(name, config, projectPath);
    hideForm();
    await loadServers();
  } catch {
    $.mcpFormSave.textContent = "Failed";
  } finally {
    $.mcpFormSave.disabled = false;
    $.mcpFormSave.textContent = "Save";
  }
}

async function handleDelete(name, scope) {
  if (!confirm(`Delete MCP server "${name}"?`)) return;

  const projectPath = scope === "project" ? getCurrentProject() : undefined;
  try {
    await deleteMcpServer(name, projectPath);
    await loadServers();
  } catch {}
}

// ── Init ────────────────────────────────────────────────

function initMcpManager() {
  $.mcpToggleBtn.addEventListener("click", () => openModal());
  $.mcpModalClose.addEventListener("click", () => closeModal());
  $.mcpModal.addEventListener("click", (e) => {
    if (e.target === $.mcpModal) closeModal();
  });
  $.mcpAddBtn.addEventListener("click", () => showAddForm());
  $.mcpFormCancel.addEventListener("click", () => hideForm());
  $.mcpType.addEventListener("change", () => updateTypeFields());
  $.mcpForm.addEventListener("submit", handleSubmit);

  // Register /mcp slash command
  registerCommand("mcp", {
    category: "app",
    description: "Manage MCP servers",
    execute() {
      openModal();
    },
  });
}

initMcpManager();

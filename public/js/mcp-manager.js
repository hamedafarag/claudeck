// MCP Server Management — CRUD modal for ~/.claude/settings.json mcpServers
import { $ } from "./dom.js";
import { fetchMcpServers, saveMcpServer, deleteMcpServer } from "./api.js";
import { registerCommand } from "./commands.js";

let editingName = null;

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
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

async function loadServers() {
  $.mcpServerList.innerHTML = `<div class="mcp-empty">Loading...</div>`;

  try {
    const data = await fetchMcpServers();
    const servers = data.servers || {};
    const names = Object.keys(servers);

    if (names.length === 0) {
      $.mcpServerList.innerHTML = `<div class="mcp-empty">No MCP servers configured</div>`;
      return;
    }

    $.mcpServerList.innerHTML = "";
    for (const name of names) {
      const config = servers[name];
      $.mcpServerList.appendChild(renderCard(name, config));
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

function renderCard(name, config) {
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

  card.querySelector(".edit").addEventListener("click", () => showEditForm(name, config));
  card.querySelector(".delete").addEventListener("click", () => handleDelete(name));

  return card;
}

// ── Form ────────────────────────────────────────────────

function showAddForm() {
  editingName = null;
  $.mcpFormTitle.textContent = "Add Server";
  $.mcpForm.reset();
  $.mcpName.disabled = false;
  updateTypeFields();
  $.mcpFormContainer.classList.remove("hidden");
  $.mcpAddBtn.classList.add("hidden");
  $.mcpName.focus();
}

function showEditForm(name, config) {
  editingName = name;
  $.mcpFormTitle.textContent = "Edit Server";
  $.mcpName.value = name;
  $.mcpName.disabled = true;

  const type = getServerType(config);
  $.mcpType.value = type;
  updateTypeFields();

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

  $.mcpFormSave.disabled = true;
  $.mcpFormSave.textContent = "Saving...";

  try {
    await saveMcpServer(name, config);
    hideForm();
    await loadServers();
  } catch {
    $.mcpFormSave.textContent = "Failed";
  } finally {
    $.mcpFormSave.disabled = false;
    $.mcpFormSave.textContent = "Save";
  }
}

async function handleDelete(name) {
  if (!confirm(`Delete MCP server "${name}"?`)) return;

  try {
    await deleteMcpServer(name);
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

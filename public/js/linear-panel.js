// Linear Panel — fetch, render (toggle delegated to right-panel.js)
import { $ } from "./dom.js";
import { on } from "./events.js";
import { fetchLinearIssues, fetchLinearTeams, fetchLinearTeamStates, createLinearIssue } from "./api.js";

const CACHE_TTL = 60_000; // 60s

let cachedData = null;
let cacheTime = 0;
let loading = false;

async function loadIssues() {
  if (loading) return;
  loading = true;
  $.linearRefreshBtn.classList.add("spinning");
  $.linearIssuesList.innerHTML = renderLoading();

  try {
    const data = await fetchLinearIssues();
    cachedData = data;
    cacheTime = Date.now();

    if (data.error && data.issues.length === 0) {
      $.linearIssuesList.innerHTML = renderEmpty(data.error);
      $.linearFooter.textContent = "";
    } else {
      renderIssues(data.issues);
      $.linearFooter.textContent = `\u2500\u2500\u2500 ${data.issues.length} issue${data.issues.length !== 1 ? "s" : ""} \u2500\u2500\u2500`;
    }
  } catch (err) {
    $.linearIssuesList.innerHTML = renderEmpty("Failed to fetch issues");
    $.linearFooter.textContent = "";
  } finally {
    loading = false;
    $.linearRefreshBtn.classList.remove("spinning");
  }
}

function renderLoading() {
  return `<div class="linear-empty"><span class="linear-empty-icon">&#8987;</span>Loading...</div>`;
}

function renderEmpty(msg) {
  const isKeyError = msg.includes("not configured");
  const icon = isKeyError ? "&#128273;" : "&#128196;";
  const hint = isKeyError
    ? `<br><span style="font-size:10px;margin-top:4px;display:block;">Set LINEAR_API_KEY env var</span>`
    : "";
  return `<div class="linear-empty"><span class="linear-empty-icon">${icon}</span>${msg}${hint}</div>`;
}

function priorityColor(priority) {
  switch (priority) {
    case 1: return "var(--error)";
    case 2: return "var(--warning)";
    case 3: return "var(--accent)";
    case 4: return "var(--text-dim)";
    default: return "var(--border)";
  }
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function renderIssues(issues) {
  $.linearIssuesList.innerHTML = "";
  for (const issue of issues) {
    const a = document.createElement("a");
    a.className = "linear-issue";
    a.href = issue.url;
    a.target = "_blank";
    a.rel = "noopener";

    const due = formatDate(issue.dueDate);
    const labels = (issue.labels?.nodes || [])
      .map(l => `<span class="linear-issue-label" style="background:${l.color}22;color:${l.color}">${l.name}</span>`)
      .join("");

    a.innerHTML = `
      <div class="linear-issue-top">
        <span class="linear-issue-priority" style="background:${priorityColor(issue.priority)}" title="${issue.priorityLabel}"></span>
        <span class="linear-issue-id">${issue.identifier}</span>
        <span class="linear-issue-title">${escapeHtml(issue.title)}</span>
      </div>
      <div class="linear-issue-meta">
        <span class="linear-issue-state">
          <span class="linear-issue-state-dot" style="background:${issue.state?.color || "var(--text-dim)"}"></span>
          ${escapeHtml(issue.state?.name || "")}
        </span>
        ${due ? `<span class="linear-issue-due">Due ${due}</span>` : ""}
        ${labels}
      </div>
    `;

    $.linearIssuesList.appendChild(a);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ── Create Issue Modal ──────────────────────────────────

function openCreateModal() {
  $.linearCreateModal.classList.remove("hidden");
  $.linearCreateForm.reset();
  $.linearCreateState.disabled = true;
  $.linearCreateState.innerHTML = `<option value="">Select a team first...</option>`;
  $.linearCreateSubmit.disabled = false;
  $.linearCreateSubmit.textContent = "Create";
  $.linearCreateTitle.focus();

  fetchLinearTeams().then((data) => {
    const opts = (data.teams || [])
      .map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`)
      .join("");
    $.linearCreateTeam.innerHTML = `<option value="">Select a team...</option>${opts}`;
  });
}

function closeCreateModal() {
  $.linearCreateModal.classList.add("hidden");
}

function handleTeamChange() {
  const teamId = $.linearCreateTeam.value;
  if (!teamId) {
    $.linearCreateState.disabled = true;
    $.linearCreateState.innerHTML = `<option value="">Select a team first...</option>`;
    return;
  }

  $.linearCreateState.disabled = true;
  $.linearCreateState.innerHTML = `<option value="">Loading...</option>`;

  fetchLinearTeamStates(teamId).then((data) => {
    const states = data.states || [];
    const opts = states
      .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
      .join("");
    $.linearCreateState.innerHTML = `<option value="">Select state...</option>${opts}`;
    $.linearCreateState.disabled = false;
  });
}

async function handleCreateSubmit(e) {
  e.preventDefault();
  const title = $.linearCreateTitle.value.trim();
  const teamId = $.linearCreateTeam.value;
  if (!title || !teamId) return;

  $.linearCreateSubmit.disabled = true;
  $.linearCreateSubmit.textContent = "Creating...";

  try {
    const result = await createLinearIssue({
      title,
      description: $.linearCreateDesc.value.trim() || undefined,
      teamId,
      stateId: $.linearCreateState.value || undefined,
    });

    if (result.success) {
      cachedData = null;
      cacheTime = 0;
      loadIssues();
      closeCreateModal();
    } else {
      $.linearCreateSubmit.textContent = "Failed \u2014 retry";
      $.linearCreateSubmit.disabled = false;
    }
  } catch {
    $.linearCreateSubmit.textContent = "Failed \u2014 retry";
    $.linearCreateSubmit.disabled = false;
  }
}

// Init
export function initLinearPanel() {
  // Refresh button
  $.linearRefreshBtn.addEventListener("click", () => loadIssues());

  // Create issue
  $.linearCreateBtn.addEventListener("click", () => openCreateModal());
  $.linearCreateClose.addEventListener("click", () => closeCreateModal());
  $.linearCreateCancel.addEventListener("click", () => closeCreateModal());
  $.linearCreateModal.addEventListener("click", (e) => {
    if (e.target === $.linearCreateModal) closeCreateModal();
  });
  $.linearCreateTeam.addEventListener("change", handleTeamChange);
  $.linearCreateForm.addEventListener("submit", handleCreateSubmit);

  // Listen for right panel tab changes — auto-fetch when Tasks tab opens
  on("rightPanel:opened", (tabName) => {
    if (tabName === "tasks" && (!cachedData || Date.now() - cacheTime > CACHE_TTL)) {
      loadIssues();
    }
  });

  on("rightPanel:tabChanged", (tabName) => {
    if (tabName === "tasks" && (!cachedData || Date.now() - cacheTime > CACHE_TTL)) {
      loadIssues();
    }
  });
}

initLinearPanel();

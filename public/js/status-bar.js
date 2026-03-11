// Status Bar — VS Code-style bottom bar showing project info, git branch, model, costs
import { $ } from './dom.js';
import { getState, on as onState } from './store.js';
import { on } from './events.js';
import * as api from './api.js';
import { openCostDashboard } from './cost-dashboard.js';

// ── DOM refs ──
const sbDot = document.getElementById("sb-dot");
const sbConnText = document.getElementById("sb-connection-text");
const sbBranchName = document.getElementById("sb-branch-name");
const sbProjectName = document.getElementById("sb-project-name");
const sbActivity = document.getElementById("sb-activity");
const sbModelName = document.getElementById("sb-model-name");
const sbPermMode = document.getElementById("sb-perm-mode");
const sbSessionCost = document.getElementById("sb-session-cost");
const sbTotalCost = document.getElementById("sb-total-cost");
const sbBgSessions = document.getElementById("sb-bg-sessions");
const sbBgSep = document.getElementById("sb-bg-sep");
const sbBgCount = document.getElementById("sb-bg-count");

// ── Connection status ──
on("ws:connected", () => {
  sbDot.className = "sb-dot connected";
  sbConnText.textContent = "connected";
});

on("ws:reconnected", () => {
  sbDot.className = "sb-dot connected";
  sbConnText.textContent = "connected";
});

on("ws:disconnected", () => {
  sbDot.className = "sb-dot reconnecting";
  sbConnText.textContent = "reconnecting";
});

// ── Project name ──
function updateProject() {
  const select = $.projectSelect;
  if (!select) return;
  const opt = select.options[select.selectedIndex];
  const name = opt?.textContent?.trim() || "no project";
  sbProjectName.textContent = name;
}

// Listen for project changes
if ($.projectSelect) {
  $.projectSelect.addEventListener("change", () => {
    updateProject();
    fetchBranch();
  });
  // Watch for options being added (async project loading on page refresh)
  const selectObserver = new MutationObserver(() => {
    updateProject();
    fetchBranch();
  });
  selectObserver.observe($.projectSelect, { childList: true });
}
updateProject();

// ── Git branch ──
async function fetchBranch() {
  const cwd = $.projectSelect?.value;
  if (!cwd) {
    sbBranchName.textContent = "--";
    return;
  }
  try {
    const data = await api.execCommand("git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '--'", cwd);
    const branch = (data.stdout || data.output || "--").trim();
    sbBranchName.textContent = branch || "--";
  } catch {
    sbBranchName.textContent = "--";
  }
}


// Click branch → open git panel
document.getElementById("sb-branch")?.addEventListener("click", () => {
  const gitTab = document.querySelector('.right-panel-tab[data-tab="git"]');
  if (gitTab) {
    gitTab.click();
    const panel = document.getElementById("right-panel");
    if (panel?.classList.contains("hidden")) {
      document.getElementById("right-panel-toggle-btn")?.click();
    }
  }
});

// Click project → focus project selector
document.getElementById("sb-project")?.addEventListener("click", () => {
  $.projectSelect?.focus();
});

// ── Model ──
function updateModel() {
  const val = $.modelSelect?.value || "";
  sbModelName.textContent = val || "auto";
}

if ($.modelSelect) {
  $.modelSelect.addEventListener("change", updateModel);
}
// Also listen for header dropdown changes
const modelDisplay = document.getElementById("model-display");
if (modelDisplay) {
  const observer = new MutationObserver(() => {
    sbModelName.textContent = modelDisplay.textContent?.trim() || "auto";
  });
  observer.observe(modelDisplay, { childList: true, characterData: true, subtree: true });
}
updateModel();

// Click model → toggle session dropdown
document.getElementById("sb-model")?.addEventListener("click", () => {
  const trigger = document.querySelector('.header-dropdown-trigger');
  if (trigger) trigger.click();
});

// ── Permission mode ──
function updatePermMode() {
  const val = $.permModeSelect?.value || "confirmDangerous";
  const labels = {
    bypass: "bypass",
    confirmDangerous: "confirm",
    confirmAll: "confirm all",
    plan: "plan",
  };
  sbPermMode.textContent = labels[val] || val;
}

if ($.permModeSelect) {
  $.permModeSelect.addEventListener("change", updatePermMode);
}
// Listen for header dropdown display changes
const permDisplay = document.getElementById("perm-mode-display");
if (permDisplay) {
  const observer = new MutationObserver(() => {
    sbPermMode.textContent = permDisplay.textContent?.trim() || "confirm";
  });
  observer.observe(permDisplay, { childList: true, characterData: true, subtree: true });
}
updatePermMode();

// ── Max Turns ──
const sbMaxTurns = document.getElementById("sb-max-turns-val");

function updateMaxTurns() {
  const val = $.maxTurnsSelect?.value || "30";
  sbMaxTurns.textContent = val === "0" ? "\u221e" : val;
}

if ($.maxTurnsSelect) {
  $.maxTurnsSelect.addEventListener("change", updateMaxTurns);
}
// Listen for header dropdown display changes
const maxTurnsDisplay = document.getElementById("max-turns-display");
if (maxTurnsDisplay) {
  const observer = new MutationObserver(() => {
    const val = maxTurnsDisplay.textContent?.trim() || "30";
    sbMaxTurns.textContent = val === "0" ? "\u221e" : val;
  });
  observer.observe(maxTurnsDisplay, { childList: true, characterData: true, subtree: true });
}
updateMaxTurns();

// Click max turns → toggle session dropdown
document.getElementById("sb-max-turns")?.addEventListener("click", () => {
  const trigger = document.querySelector('.header-dropdown-trigger');
  if (trigger) trigger.click();
});

// ── Costs ──
// Mirror the header cost values
function syncCosts() {
  if ($.projectCostEl) sbSessionCost.textContent = $.projectCostEl.textContent;
  if ($.totalCostEl) sbTotalCost.textContent = $.totalCostEl.textContent;
}

// Observe cost changes in header
if ($.projectCostEl) {
  const obs = new MutationObserver(syncCosts);
  obs.observe($.projectCostEl, { childList: true, characterData: true, subtree: true });
}
if ($.totalCostEl) {
  const obs = new MutationObserver(syncCosts);
  obs.observe($.totalCostEl, { childList: true, characterData: true, subtree: true });
}
syncCosts();

// Click cost → open cost dashboard
document.getElementById("sb-cost")?.addEventListener("click", () => {
  openCostDashboard();
});

// ── Background sessions ──
function updateBgSessions() {
  const bgMap = getState("backgroundSessions");
  const count = bgMap ? bgMap.size : 0;
  if (count > 0) {
    sbBgSessions.classList.remove("hidden");
    sbBgSep.classList.remove("hidden");
    sbBgCount.textContent = count;
  } else {
    sbBgSessions.classList.add("hidden");
    sbBgSep.classList.add("hidden");
  }
}

onState("backgroundSessions", updateBgSessions);
updateBgSessions();

// ── Activity indicator ──
// Listen for streaming state changes
on("ws:message", (msg) => {
  if (msg.type === "text" || msg.type === "tool") {
    sbActivity.textContent = msg.type === "tool"
      ? `running ${msg.name}...`
      : "streaming...";
  }
  if (msg.type === "done" || msg.type === "aborted" || msg.type === "error") {
    sbActivity.textContent = "";
  }
  if (msg.type === "agent_started") {
    sbActivity.textContent = `agent: ${msg.title}...`;
  }
  if (msg.type === "agent_progress") {
    sbActivity.textContent = `agent: ${msg.action}...`;
  }
  if (msg.type === "agent_completed" || msg.type === "agent_error" || msg.type === "agent_aborted") {
    sbActivity.textContent = "";
  }
  if (msg.type === "workflow_step" && msg.status === "running") {
    sbActivity.textContent = "workflow running...";
  }
  if (msg.type === "workflow_completed") {
    sbActivity.textContent = "";
  }

  // Sync costs on result messages
  if (msg.type === "result") {
    setTimeout(syncCosts, 100);
  }
});

// Refresh branch when sessions reload (might have changed branch)
on("ws:message", (msg) => {
  if (msg.type === "session") {
    setTimeout(fetchBranch, 500);
  }
});

// Git Panel — status, staging, commit, branch, log
import { $ } from "./dom.js";
import { on } from "./events.js";
import { on as onState } from "./store.js";
import { execCommand } from "./api.js";

let currentCwd = null;

function getCwd() {
  return $.projectSelect.value || null;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ── Branch ──────────────────────────────────────────────

async function loadBranches() {
  const cwd = getCwd();
  if (!cwd) return;

  try {
    const result = await execCommand("git branch --no-color", cwd);
    if (result.error) return;

    const lines = result.stdout.split("\n").filter(Boolean);
    $.gitBranchSelect.innerHTML = "";

    for (const line of lines) {
      const isCurrent = line.startsWith("*");
      const name = line.replace(/^\*?\s*/, "").trim();
      if (!name) continue;
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      if (isCurrent) opt.selected = true;
      $.gitBranchSelect.appendChild(opt);
    }
  } catch {}
}

async function switchBranch(branch) {
  const cwd = getCwd();
  if (!cwd || !branch) return;

  try {
    const result = await execCommand(`git checkout "${branch}"`, cwd);
    if (result.error && result.stderr) {
      console.error("Branch switch error:", result.stderr);
    }
    await refreshAll();
  } catch {}
}

// ── Status ──────────────────────────────────────────────

function parseStatusCode(x, y) {
  if (x === "?" && y === "?") return { group: "untracked", badge: "?", cls: "untracked" };
  if (x === "A") return { group: "staged", badge: "A", cls: "added" };
  if (x === "M") return { group: "staged", badge: "M", cls: "modified" };
  if (x === "D") return { group: "staged", badge: "D", cls: "deleted" };
  if (x === "R") return { group: "staged", badge: "R", cls: "renamed" };
  if (y === "M") return { group: "changes", badge: "M", cls: "modified" };
  if (y === "D") return { group: "changes", badge: "D", cls: "deleted" };
  return { group: "changes", badge: x || y, cls: "modified" };
}

async function loadStatus() {
  const cwd = getCwd();
  if (!cwd) {
    $.gitStatusList.innerHTML = `<div class="git-empty">Select a project</div>`;
    return;
  }

  try {
    const result = await execCommand("git status --porcelain=v1", cwd);
    if (result.error) {
      $.gitStatusList.innerHTML = `<div class="git-empty">Not a git repository</div>`;
      return;
    }

    const lines = result.stdout.split("\n").filter(Boolean);
    const groups = { staged: [], changes: [], untracked: [] };

    for (const line of lines) {
      const x = line[0];
      const y = line[1];
      const file = line.slice(3);
      const info = parseStatusCode(x, y);
      groups[info.group].push({ file, badge: info.badge, cls: info.cls });

      // Files with both staged and unstaged changes
      if (x !== " " && x !== "?" && y !== " " && y !== "?") {
        groups.changes.push({ file, badge: y === "M" ? "M" : y, cls: y === "D" ? "deleted" : "modified" });
      }
    }

    $.gitStatusList.innerHTML = "";

    if (groups.staged.length === 0 && groups.changes.length === 0 && groups.untracked.length === 0) {
      $.gitStatusList.innerHTML = `<div class="git-empty">Working tree clean</div>`;
      return;
    }

    renderGroup("Staged Changes", groups.staged, "unstage");
    renderGroup("Changes", groups.changes, "stage");
    renderGroup("Untracked", groups.untracked, "stage");
  } catch {
    $.gitStatusList.innerHTML = `<div class="git-empty">Failed to load status</div>`;
  }
}

function renderGroup(title, files, action) {
  if (files.length === 0) return;

  const group = document.createElement("div");
  group.className = "git-status-group";
  group.innerHTML = `<div class="git-status-group-title">${title} (${files.length})</div>`;

  for (const f of files) {
    const row = document.createElement("div");
    row.className = "git-status-file";
    row.innerHTML = `
      <span class="git-status-badge ${f.cls}">${f.badge}</span>
      <span class="git-status-name" title="${escapeHtml(f.file)}">${escapeHtml(f.file)}</span>
      <button class="git-status-action" title="${action === "stage" ? "Stage" : "Unstage"}">${action === "stage" ? "+" : "\u2212"}</button>
    `;

    row.querySelector(".git-status-action").addEventListener("click", async () => {
      const cwd = getCwd();
      if (!cwd) return;
      const cmd = action === "stage"
        ? `git add "${f.file}"`
        : `git reset HEAD "${f.file}"`;
      await execCommand(cmd, cwd);
      await loadStatus();
    });

    group.appendChild(row);
  }

  $.gitStatusList.appendChild(group);
}

// ── Commit ──────────────────────────────────────────────

async function handleCommit() {
  const cwd = getCwd();
  const msg = $.gitCommitMsg.value.trim();
  if (!cwd || !msg) return;

  $.gitCommitBtn.disabled = true;
  $.gitCommitBtn.textContent = "Committing...";

  // Remove old error
  const oldErr = $.gitCommitBtn.parentElement.querySelector(".git-commit-error");
  if (oldErr) oldErr.remove();

  try {
    const escaped = msg.replace(/"/g, '\\"');
    const result = await execCommand(`git commit -m "${escaped}"`, cwd);
    if (result.error || (result.stderr && result.stderr.includes("nothing to commit"))) {
      showCommitError(result.stderr || result.stdout || "Nothing to commit");
    } else {
      $.gitCommitMsg.value = "";
      await refreshAll();
    }
  } catch {
    showCommitError("Commit failed");
  } finally {
    $.gitCommitBtn.disabled = false;
    $.gitCommitBtn.textContent = "Commit";
  }
}

function showCommitError(msg) {
  const oldErr = $.gitCommitBtn.parentElement.querySelector(".git-commit-error");
  if (oldErr) oldErr.remove();

  const errEl = document.createElement("div");
  errEl.className = "git-commit-error";
  errEl.textContent = msg;
  $.gitCommitBtn.parentElement.appendChild(errEl);
}

// ── Log ─────────────────────────────────────────────────

async function loadLog() {
  const cwd = getCwd();
  if (!cwd) return;

  try {
    const result = await execCommand('git log --oneline --no-color -10 --format="%h|%s|%ar"', cwd);
    if (result.error) {
      $.gitLogList.innerHTML = "";
      return;
    }

    const lines = result.stdout.split("\n").filter(Boolean);
    $.gitLogList.innerHTML = "";

    for (const line of lines) {
      const [hash, subject, time] = line.split("|");
      if (!hash) continue;
      const item = document.createElement("div");
      item.className = "git-log-item";
      item.innerHTML = `
        <span class="git-log-hash">${escapeHtml(hash)}</span>
        <span class="git-log-subject">${escapeHtml(subject || "")}</span>
        <span class="git-log-time">${escapeHtml(time || "")}</span>
      `;
      $.gitLogList.appendChild(item);
    }
  } catch {}
}

// ── Refresh ─────────────────────────────────────────────

async function refreshAll() {
  $.gitRefreshBtn.classList.add("spinning");
  try {
    await Promise.all([loadBranches(), loadStatus(), loadLog()]);
  } finally {
    $.gitRefreshBtn.classList.remove("spinning");
  }
}

function initGitPanel() {
  $.gitRefreshBtn.addEventListener("click", () => refreshAll());
  $.gitCommitBtn.addEventListener("click", () => handleCommit());
  $.gitBranchSelect.addEventListener("change", (e) => switchBranch(e.target.value));

  // Load when Git tab opens
  on("rightPanel:opened", (tab) => {
    if (tab === "git") refreshAll();
  });
  on("rightPanel:tabChanged", (tab) => {
    if (tab === "git") refreshAll();
  });

  // Reset and reload on project switch
  $.projectSelect.addEventListener("change", () => {
    currentCwd = null;
    $.gitStatusList.innerHTML = "";
    $.gitLogList.innerHTML = "";
    $.gitBranchSelect.innerHTML = "";
    if (isGitTabActive()) refreshAll();
  });

  // Load when projects data arrives (covers initial page load)
  // setTimeout(0) defers until after loadProjects() finishes populating the select
  onState("projectsData", () => {
    setTimeout(() => {
      if (isGitTabActive()) refreshAll();
    }, 0);
  });
}

function isGitTabActive() {
  const pane = $.rightPanel?.querySelector('.right-panel-pane[data-tab="git"]');
  return pane && pane.classList.contains("active") && !$.rightPanel.classList.contains("hidden");
}

initGitPanel();

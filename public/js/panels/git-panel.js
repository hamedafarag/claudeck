// Git Panel — status, staging, commit, branch, log
import { $ } from "../core/dom.js";
import { on } from "../core/events.js";
import { on as onState } from "../core/store.js";
import { execCommand } from "../core/api.js";

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
    if (result.exitCode !== 0 || (result.error && result.stderr)) {
      // Show error to the user — typically "uncommitted changes" blocking the switch
      const errMsg = (result.stderr || result.stdout || "").trim();
      showBranchError(errMsg || "Cannot switch branch");
      // Reset dropdown to actual current branch
      await loadBranches();
      return;
    }
    await refreshAll();
  } catch {}
}

function showBranchError(msg) {
  // Remove old error
  const old = $.gitBranchSelect.parentElement.querySelector(".git-branch-error");
  if (old) old.remove();

  const el = document.createElement("div");
  el.className = "git-branch-error";
  el.textContent = msg.split("\n")[0]; // first line only
  $.gitBranchSelect.parentElement.appendChild(el);

  // Auto-dismiss after 5s
  setTimeout(() => el.remove(), 5000);
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
    $.gitStatusList.innerHTML = `
      <div class="git-empty">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
        <span>Select a project to view git status</span>
      </div>`;
    return;
  }

  try {
    const result = await execCommand("git status --porcelain=v1", cwd);
    if (result.error) {
      $.gitStatusList.innerHTML = `
        <div class="git-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <span>Not a git repository</span>
        </div>`;
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
      $.gitStatusList.innerHTML = `
        <div class="git-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <span>Working tree clean</span>
        </div>`;
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

  // Group header with bulk action button
  const bulkLabel = action === "stage" ? "Stage All" : "Unstage All";
  const bulkSymbol = action === "stage" ? "++" : "\u2212\u2212";
  group.innerHTML = `
    <div class="git-status-group-title">
      <span>${title} (${files.length})</span>
      <button class="git-bulk-action" title="${bulkLabel}">${bulkSymbol}</button>
    </div>
  `;

  group.querySelector(".git-bulk-action").addEventListener("click", async () => {
    const cwd = getCwd();
    if (!cwd) return;
    const fileArgs = files.map((f) => `"${f.file}"`).join(" ");
    const cmd = action === "stage"
      ? `git add ${fileArgs}`
      : `git reset HEAD ${fileArgs}`;
    await execCommand(cmd, cwd);
    await loadStatus();
  });

  for (const f of files) {
    const row = document.createElement("div");
    row.className = "git-status-file";
    row.innerHTML = `
      <span class="git-status-badge ${f.cls}">${f.badge}</span>
      <span class="git-status-name" title="${escapeHtml(f.file)}">${escapeHtml(f.file)}</span>
      <button class="git-status-action git-stage-btn" title="${action === "stage" ? "Stage" : "Unstage"}">${action === "stage" ? "+" : "\u2212"}</button>
    `;

    // File diff preview on name click
    row.querySelector(".git-status-name").addEventListener("click", () => {
      showFileDiff(f.file, action === "unstage", f.badge === "?");
    });

    // Stage / unstage button
    row.querySelector(".git-stage-btn").addEventListener("click", async () => {
      const cwd = getCwd();
      if (!cwd) return;
      const cmd = action === "stage"
        ? `git add "${f.file}"`
        : `git reset HEAD "${f.file}"`;
      await execCommand(cmd, cwd);
      await loadStatus();
    });

    // Discard button — only for tracked changed files (not staged, not untracked)
    if (action === "stage" && f.badge !== "?") {
      const discardBtn = document.createElement("button");
      discardBtn.className = "git-status-action git-discard-btn";
      discardBtn.title = "Discard changes";
      discardBtn.textContent = "\u2715";
      discardBtn.addEventListener("click", async () => {
        const cwd = getCwd();
        if (!cwd) return;
        await execCommand(`git checkout -- "${f.file}"`, cwd);
        await loadStatus();
      });
      row.appendChild(discardBtn);
    }

    group.appendChild(row);
  }

  $.gitStatusList.appendChild(group);
}

// ── File Diff ──────────────────────────────────────────

async function showFileDiff(file, isStaged, isUntracked) {
  const cwd = getCwd();
  if (!cwd) return;

  let diffText = "";
  if (isUntracked) {
    // Untracked file — show full content as additions
    const result = await execCommand(`cat "${file}"`, cwd);
    if (!result.error && result.stdout) {
      diffText = result.stdout.split("\n").map((l) => "+" + l).join("\n");
    }
  } else if (isStaged) {
    const result = await execCommand(`git diff --cached -- "${file}"`, cwd);
    diffText = result.stdout || "";
  } else {
    const result = await execCommand(`git diff -- "${file}"`, cwd);
    diffText = result.stdout || "";
  }

  showDiffModal(diffText, file);
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

      // Clickable commit hash → show commit diff
      item.querySelector(".git-log-hash").addEventListener("click", () => showCommitDiff(hash));

      $.gitLogList.appendChild(item);
    }
  } catch {}
}

async function showCommitDiff(hash) {
  const cwd = getCwd();
  if (!cwd) return;
  const result = await execCommand(`git show "${hash}" --stat --patch`, cwd);
  if (!result.error) showDiffModal(result.stdout, `Commit ${hash}`);
}

// ── Branch Info ────────────────────────────────────────

async function loadBranchInfo() {
  const cwd = getCwd();
  if (!cwd || !$.gitBranchInfo) return;

  try {
    const branchResult = await execCommand("git rev-parse --abbrev-ref HEAD", cwd);
    const branch = branchResult.stdout?.trim();
    if (!branch || branchResult.error) {
      $.gitBranchInfo.classList.add("hidden");
      return;
    }

    // Get ahead/behind tracking info
    const trackResult = await execCommand(
      "git rev-list --left-right --count HEAD...@{upstream}",
      cwd
    );

    let trackingHtml = "";
    if (!trackResult.error && trackResult.stdout?.trim()) {
      const [ahead, behind] = trackResult.stdout.trim().split(/\s+/);
      const parts = [];
      if (parseInt(ahead) > 0) parts.push(`<span class="git-branch-ahead">\u2191${ahead}</span>`);
      if (parseInt(behind) > 0) parts.push(`<span class="git-branch-behind">\u2193${behind}</span>`);
      if (parts.length > 0) trackingHtml = parts.join(" ");
    }

    $.gitBranchInfo.classList.remove("hidden");
    $.gitBranchInfo.innerHTML = `
      <svg class="git-branch-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
      </svg>
      <strong>${escapeHtml(branch)}</strong>
      ${trackingHtml ? `<span class="git-branch-tracking">${trackingHtml}</span>` : '<span class="git-branch-tracking git-branch-synced">in sync</span>'}
    `;
  } catch {
    $.gitBranchInfo.classList.add("hidden");
  }
}

// ── Worktrees ──────────────────────────────────────────

async function loadWorktrees() {
  const cwd = getCwd();
  if (!cwd || !$.gitWorktreeSection) return;

  try {
    const res = await fetch(`/api/worktrees?project_path=${encodeURIComponent(cwd)}`);
    const worktrees = await res.json();
    const visible = worktrees.filter((wt) => wt.status === "active" || wt.status === "completed");

    if (visible.length === 0) {
      $.gitWorktreeSection.classList.add("hidden");
      return;
    }

    $.gitWorktreeSection.classList.remove("hidden");
    $.gitWorktreeList.innerHTML = "";

    for (const wt of visible) {
      const badgeClass = wt.status === "active" ? "running" : "ready";
      const item = document.createElement("div");
      item.className = "git-worktree-item";
      item.innerHTML = `
        <span class="git-worktree-badge ${badgeClass}">${escapeHtml(wt.status)}</span>
        <span class="git-worktree-name" title="${escapeHtml(wt.branch_name)}">${escapeHtml(wt.branch_name)}</span>
        <div class="git-worktree-actions">
          <button class="wt-view" data-tooltip="View Diff" title="View Diff">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </button>
          <button class="wt-merge" data-tooltip="Squash Merge" title="Squash Merge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/></svg>
          </button>
          <button class="wt-discard" data-tooltip="Discard Worktree" title="Discard Worktree">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      `;

      item.querySelector(".wt-view").addEventListener("click", async () => {
        try {
          const r = await fetch(`/api/worktrees/${encodeURIComponent(wt.id)}/diff`);
          const data = await r.json();
          if (data.error) return;
          showDiffModal(data.diff, `Worktree: ${wt.branch_name}`);
        } catch {}
      });

      item.querySelector(".wt-merge").addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          const r = await fetch(`/api/worktrees/${encodeURIComponent(wt.id)}/merge`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          const data = await r.json();
          if (data.ok) {
            loadWorktrees();
            loadLog();
          }
        } catch {} finally {
          btn.disabled = false;
        }
      });

      item.querySelector(".wt-discard").addEventListener("click", (e) => {
        const btn = e.currentTarget;
        const actions = btn.closest(".git-worktree-actions");

        // Show inline confirm/cancel replacing the action buttons
        const confirm = document.createElement("div");
        confirm.className = "git-wt-confirm";
        confirm.innerHTML = `
          <span class="git-wt-confirm-label">Delete?</span>
          <button class="git-wt-confirm-yes" data-tooltip="Confirm delete" title="Confirm">Yes</button>
          <button class="git-wt-confirm-no" data-tooltip="Cancel" title="Cancel">No</button>
        `;
        actions.classList.add("hidden");
        actions.parentElement.appendChild(confirm);

        confirm.querySelector(".git-wt-confirm-no").addEventListener("click", () => {
          confirm.remove();
          actions.classList.remove("hidden");
        });

        confirm.querySelector(".git-wt-confirm-yes").addEventListener("click", async () => {
          confirm.querySelector(".git-wt-confirm-yes").disabled = true;
          confirm.querySelector(".git-wt-confirm-no").disabled = true;
          confirm.querySelector(".git-wt-confirm-label").textContent = "Deleting...";
          try {
            const r = await fetch(`/api/worktrees/${encodeURIComponent(wt.id)}`, { method: "DELETE" });
            const data = await r.json();
            if (data.ok) loadWorktrees();
          } catch {
            confirm.remove();
            actions.classList.remove("hidden");
          }
        });
      });

      $.gitWorktreeList.appendChild(item);
    }
  } catch {
    $.gitWorktreeSection.classList.add("hidden");
  }
}

/**
 * Parse a unified diff into per-file sections.
 * Splits on "diff --git" boundaries.
 */
function parseDiffSections(diffText) {
  const sections = [];
  const lines = diffText.split("\n");
  let current = null;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (current) sections.push(current);
      // Extract filename from "diff --git a/path b/path"
      const match = line.match(/diff --git a\/(.+?) b\/(.+)/);
      const fileName = match ? match[2] : line;
      current = { fileName, lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      // Lines before the first "diff --git" (e.g., commit stats from git show)
      if (!sections.length && !current) {
        current = { fileName: "", lines: [] };
      }
      if (current) current.lines.push(line);
    }
  }
  if (current) sections.push(current);
  return sections;
}

/**
 * Count additions and deletions in diff lines.
 */
function countDiffStats(lines) {
  let add = 0, del = 0;
  for (const l of lines) {
    if (l.startsWith("+") && !l.startsWith("+++")) add++;
    else if (l.startsWith("-") && !l.startsWith("---")) del++;
  }
  return { add, del };
}

/**
 * Render colored diff lines into a container element.
 */
function renderDiffLines(container, lines) {
  for (const line of lines) {
    const span = document.createElement("span");
    span.textContent = line + "\n";
    if (line.startsWith("+++") || line.startsWith("---")) {
      span.className = "diff-line-meta";
    } else if (line.startsWith("+")) {
      span.className = "diff-line-added";
    } else if (line.startsWith("-")) {
      span.className = "diff-line-removed";
    } else if (line.startsWith("@@")) {
      span.className = "diff-line-hunk";
    }
    container.appendChild(span);
  }
}

function showDiffModal(diffText, title) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal git-diff-modal">
      <div class="modal-header">
        <h3>${escapeHtml(title)}</h3>
        <button class="modal-close">&times;</button>
      </div>
      <div class="git-diff-body"></div>
    </div>
  `;

  const body = overlay.querySelector(".git-diff-body");

  if (!diffText || !diffText.trim()) {
    body.innerHTML = '<div class="git-diff-empty">(no changes)</div>';
  } else {
    const sections = parseDiffSections(diffText);

    if (sections.length <= 1 && sections[0]?.fileName === "") {
      // Single block without file headers (e.g., single file diff)
      const pre = document.createElement("pre");
      pre.className = "git-diff-content";
      renderDiffLines(pre, sections[0]?.lines || diffText.split("\n"));
      body.appendChild(pre);
    } else {
      // Multi-file diff — render per-file collapsible sections
      for (const section of sections) {
        const { add, del } = countDiffStats(section.lines);

        const fileSection = document.createElement("div");
        fileSection.className = "git-diff-file";

        const header = document.createElement("div");
        header.className = "git-diff-file-header";
        header.innerHTML = `
          <svg class="git-diff-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
          <span class="git-diff-file-name">${escapeHtml(section.fileName)}</span>
          <span class="git-diff-file-stats">
            ${add ? `<span class="diff-stat-add">+${add}</span>` : ""}
            ${del ? `<span class="diff-stat-del">-${del}</span>` : ""}
          </span>
        `;

        const content = document.createElement("pre");
        content.className = "git-diff-content git-diff-file-content";
        renderDiffLines(content, section.lines);

        // Toggle collapse on header click
        header.addEventListener("click", () => {
          fileSection.classList.toggle("collapsed");
        });

        fileSection.appendChild(header);
        fileSection.appendChild(content);
        body.appendChild(fileSection);
      }
    }
  }

  overlay.querySelector(".modal-close").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", esc); }
  });
  document.body.appendChild(overlay);
}

// ── Refresh ─────────────────────────────────────────────

async function refreshAll() {
  $.gitRefreshBtn.classList.add("spinning");
  try {
    await Promise.all([loadBranches(), loadBranchInfo(), loadStatus(), loadLog(), loadWorktrees()]);
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

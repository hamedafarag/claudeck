// Skills Marketplace — SkillsMP integration panel
import { registerTab } from '../ui/tab-sdk.js';
import { registerCommand } from '../ui/commands.js';

const ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="7.5 4.21 12 6.81 16.5 4.21"/><polyline points="7.5 19.79 7.5 14.6 3 12"/><polyline points="21 12 16.5 14.6 16.5 19.79"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';

const STAR_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
const TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';
const KEY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>';
const SKILL_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>';

let ctx = null;
let activated = false;
let root = null;
let installedCache = [];
let currentPage = 1;
let lastSearchQuery = "";
let searchMode = "keyword";
let defaultScope = "project";
let quotaRemaining = null;

// ── Helpers ─────────────────────────────────────────────

function relativeTime(unixStr) {
  const ts = Number(unixStr) * 1000;
  if (!ts || isNaN(ts)) return "";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function isInstalled(skill) {
  return installedCache.some(
    (s) => s.dirName === skill.name || s.name === skill.name
  );
}

function getProjectPath() {
  return ctx ? ctx.getProjectPath() : "";
}

// ── Tab registration ────────────────────────────────────

registerTab({
  id: "skills",
  title: "Skills",
  icon: ICON,
  lazy: true,

  init(_ctx) {
    ctx = _ctx;
    root = document.createElement("div");
    root.className = "skills-panel";

    // Restore from localStorage
    searchMode = localStorage.getItem("claudeck-skills-mode") || "keyword";
    lastSearchQuery = localStorage.getItem("claudeck-skills-query") || "";

    checkActivation();

    ctx.on("projectChanged", () => {
      if (activated) refreshInstalled();
    });

    return root;
  },

  onActivate() {
    if (activated) refreshInstalled();
  },
});

// ── /skills command ─────────────────────────────────────

registerCommand("skills", {
  category: "app",
  description: "Open Skills Marketplace",
  execute() {
    import("../ui/right-panel.js").then((m) => m.openRightPanel("skills"));
  },
});

// ── Activation check ────────────────────────────────────

async function checkActivation() {
  try {
    const config = await ctx.api.fetchSkillsConfig();
    activated = config.activated;
    defaultScope = config.defaultScope || "project";
    if (config.searchMode) searchMode = config.searchMode;

    if (activated) {
      renderMarketplace();
      refreshInstalled();
    } else {
      renderActivationForm();
    }
  } catch {
    renderActivationForm();
  }
}

// ── Activation Form ─────────────────────────────────────

function renderActivationForm() {
  root.innerHTML = "";
  const form = document.createElement("div");
  form.className = "skills-activate";
  form.innerHTML = `
    <div class="skills-activate-icon">${KEY_SVG}</div>
    <h3>Skills Marketplace</h3>
    <p>Browse and install agent skills from SkillsMP. Skills extend Claude Code with custom slash commands, workflows, and domain knowledge.</p>
    <a href="https://skillsmp.com/docs/api" target="_blank" rel="noopener">Get your free API key</a>
    <input type="password" class="skills-activate-input" placeholder="sk_live_skillsmp_..." autocomplete="off">
    <button class="skills-activate-btn">Activate</button>
    <div class="skills-activate-error"></div>
  `;

  const input = form.querySelector("input");
  const btn = form.querySelector("button");
  const errEl = form.querySelector(".skills-activate-error");

  btn.addEventListener("click", async () => {
    const key = input.value.trim();
    if (!key) { errEl.textContent = "Please enter your API key"; return; }
    btn.disabled = true;
    btn.textContent = "Validating...";
    errEl.textContent = "";

    try {
      const res = await ctx.api.saveSkillsConfig({ apiKey: key });
      if (res.error) {
        errEl.textContent = res.error;
        btn.disabled = false;
        btn.textContent = "Activate";
        return;
      }
      activated = true;
      root.style.opacity = "0";
      setTimeout(() => {
        renderMarketplace();
        refreshInstalled();
        root.style.opacity = "1";
      }, 150);
    } catch (err) {
      errEl.textContent = err.message || "Activation failed";
      btn.disabled = false;
      btn.textContent = "Activate";
    }
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btn.click();
  });

  root.appendChild(form);
  root.style.transition = "opacity 0.15s";
}

// ── Marketplace UI ──────────────────────────────────────

let browseContent, installedContent, settingsContent;

function renderMarketplace() {
  root.innerHTML = "";

  // Sub-tab bar
  const tabBar = document.createElement("div");
  tabBar.className = "skills-subtabs";

  const tabs = [
    { id: "browse", label: "Browse" },
    { id: "installed", label: "Installed" },
    { id: "settings", label: "Settings" },
  ];

  const contents = {};

  for (const t of tabs) {
    const btn = document.createElement("button");
    btn.className = "skills-subtab" + (t.id === "browse" ? " active" : "");
    btn.textContent = t.label;
    btn.dataset.subtab = t.id;
    btn.addEventListener("click", () => {
      tabBar.querySelectorAll(".skills-subtab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      Object.values(contents).forEach((c) => c.classList.remove("active"));
      contents[t.id].classList.add("active");
      if (t.id !== "browse") clearBrowseSearch();
      if (t.id === "installed") refreshInstalled();
      if (t.id === "settings") renderSettings();
    });
    tabBar.appendChild(btn);
  }

  root.appendChild(tabBar);

  // Browse content
  browseContent = document.createElement("div");
  browseContent.className = "skills-subtab-content active";
  contents.browse = browseContent;
  renderBrowseTab();
  root.appendChild(browseContent);

  // Installed content
  installedContent = document.createElement("div");
  installedContent.className = "skills-subtab-content";
  contents.installed = installedContent;
  root.appendChild(installedContent);

  // Settings content
  settingsContent = document.createElement("div");
  settingsContent.className = "skills-subtab-content";
  contents.settings = settingsContent;
  root.appendChild(settingsContent);
}

// ── Browse Tab ──────────────────────────────────────────

let searchTimeout = null;

function renderBrowseTab() {
  browseContent.innerHTML = "";

  // Search bar
  const searchBar = document.createElement("div");
  searchBar.className = "skills-search-bar";

  const searchInput = document.createElement("input");
  searchInput.className = "skills-search-input";
  searchInput.placeholder = "Search skills...";
  searchInput.value = lastSearchQuery;

  const modeToggle = document.createElement("div");
  modeToggle.className = "skills-search-mode";
  const kwBtn = document.createElement("button");
  kwBtn.textContent = "Keyword";
  kwBtn.title = "Fast keyword search (~200ms)";
  kwBtn.className = searchMode === "keyword" ? "active" : "";
  const aiBtn = document.createElement("button");
  aiBtn.textContent = "Semantic";
  aiBtn.title = "AI semantic search (~2.5s)";
  aiBtn.className = searchMode === "ai" ? "active" : "";

  modeToggle.appendChild(kwBtn);
  modeToggle.appendChild(aiBtn);
  searchBar.appendChild(searchInput);
  searchBar.appendChild(modeToggle);
  browseContent.appendChild(searchBar);

  // Search mode hint
  const HINTS = {
    keyword: "Search by skill name or keyword — fast, exact matching",
    ai: "Describe what you need in plain English — AI finds the best match",
  };
  const searchHint = document.createElement("div");
  searchHint.className = "skills-search-hint";
  searchHint.textContent = HINTS[searchMode];
  browseContent.appendChild(searchHint);

  function updateHint() {
    searchHint.textContent = HINTS[searchMode];
  }

  kwBtn.addEventListener("click", () => {
    searchMode = "keyword";
    localStorage.setItem("claudeck-skills-mode", searchMode);
    kwBtn.classList.add("active");
    aiBtn.classList.remove("active");
    sortBar.style.display = "";
    updateHint();
    if (searchInput.value.trim()) doSearch(searchInput.value.trim());
  });
  aiBtn.addEventListener("click", () => {
    searchMode = "ai";
    localStorage.setItem("claudeck-skills-mode", searchMode);
    aiBtn.classList.add("active");
    kwBtn.classList.remove("active");
    sortBar.style.display = "none";
    updateHint();
    if (searchInput.value.trim()) doSearch(searchInput.value.trim());
  });

  // Sort bar (keyword only)
  const sortBar = document.createElement("div");
  sortBar.className = "skills-sort-bar";
  if (searchMode === "ai") sortBar.style.display = "none";

  const sortLabel = document.createElement("label");
  sortLabel.textContent = "Sort:";
  const sortSelect = document.createElement("select");
  sortSelect.className = "skills-sort-select";
  sortSelect.innerHTML = '<option value="stars">Stars</option><option value="recent">Recent</option>';
  sortSelect.addEventListener("change", () => {
    if (searchInput.value.trim()) doSearch(searchInput.value.trim());
  });

  sortBar.appendChild(sortLabel);
  sortBar.appendChild(sortSelect);
  browseContent.appendChild(sortBar);

  // Results container
  const results = document.createElement("div");
  results.className = "skills-results";
  browseContent.appendChild(results);

  // Pagination
  const pagination = document.createElement("div");
  pagination.className = "skills-pagination";
  pagination.style.display = "none";
  browseContent.appendChild(pagination);

  // Search debounce
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const q = searchInput.value.trim();
      localStorage.setItem("claudeck-skills-query", q);
      lastSearchQuery = q;
      currentPage = 1;
      if (q) doSearch(q);
      else {
        results.innerHTML = "";
        pagination.style.display = "none";
        showInitialState(results);
      }
    }, 300);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      clearTimeout(searchTimeout);
      const q = searchInput.value.trim();
      if (q) { currentPage = 1; doSearch(q); }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const firstCard = results.querySelector(".skill-card");
      if (firstCard) firstCard.focus();
    }
  });

  // Keyboard navigation within results
  results.addEventListener("keydown", (e) => {
    const card = e.target.closest(".skill-card");
    if (!card) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = card.nextElementSibling;
      if (next?.classList.contains("skill-card")) next.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = card.previousElementSibling;
      if (prev?.classList.contains("skill-card")) prev.focus();
      else searchInput.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      card.click();
    }
  });

  // Auto-search if there's a saved query, otherwise show initial state
  if (lastSearchQuery) {
    doSearch(lastSearchQuery);
  } else {
    showInitialState(results);
  }

  // ── Search logic ────────────────────────────────────

  async function doSearch(q) {
    results.innerHTML = "";
    pagination.style.display = "none";

    // Loading indicator with mode-aware message
    const loader = document.createElement("div");
    loader.className = "skills-search-loading";
    const spinner = document.createElement("div");
    spinner.className = "skills-spinner";
    const loadMsg = document.createElement("span");
    loadMsg.className = "skills-search-loading-text";
    loadMsg.textContent = searchMode === "ai"
      ? `Finding skills matching "${q}"...`
      : `Searching for "${q}"...`;
    loader.appendChild(spinner);
    loader.appendChild(loadMsg);
    results.appendChild(loader);

    // Skeleton cards
    for (let i = 0; i < 4; i++) {
      const skel = document.createElement("div");
      skel.className = "skills-skeleton";
      skel.innerHTML = `
        <div class="skills-skeleton-header">
          <div class="skills-skeleton-line" style="width:35%"></div>
          <div class="skills-skeleton-line short" style="width:15%"></div>
        </div>
        <div class="skills-skeleton-line" style="width:90%"></div>
        <div class="skills-skeleton-line" style="width:65%"></div>
        <div class="skills-skeleton-footer">
          <div class="skills-skeleton-line short" style="width:10%"></div>
          <div class="skills-skeleton-line short" style="width:18%"></div>
        </div>`;
      results.appendChild(skel);
    }

    try {
      if (searchMode === "ai") {
        const { data } = await ctx.api.aiSearchSkills(q);
        results.innerHTML = "";

        if (!data.success && data.error) {
          showErrorBanner(results, data.error.message || data.error);
          return;
        }

        const items = data.data?.data || [];
        if (items.length === 0) {
          showEmpty(results, `No results for "${q}"`);
          return;
        }

        for (const item of items) {
          const skill = item.skill;
          if (!skill) continue;
          const card = createSkillCard(skill, Math.round((item.score || 0) * 100));
          results.appendChild(card);
        }
      } else {
        const { data, headers } = await ctx.api.searchSkills(q, currentPage, 20, sortSelect.value);
        results.innerHTML = "";

        // Track quota
        const rem = headers.get("X-RateLimit-Daily-Remaining");
        if (rem) quotaRemaining = Number(rem);

        if (!data.success && data.error) {
          showErrorBanner(results, data.error.message || data.error);
          return;
        }

        const skills = data.data?.skills || [];
        const pag = data.data?.pagination;

        if (skills.length === 0) {
          showEmpty(results, `No results for "${q}"`);
          return;
        }

        for (const skill of skills) {
          const card = createSkillCard(skill);
          results.appendChild(card);
        }

        // Pagination
        if (pag && (pag.hasNext || pag.hasPrev)) {
          pagination.style.display = "";
          pagination.innerHTML = "";
          const prevBtn = document.createElement("button");
          prevBtn.textContent = "Previous";
          prevBtn.disabled = !pag.hasPrev;
          prevBtn.addEventListener("click", () => { currentPage--; doSearch(q); });

          const info = document.createElement("span");
          info.className = "skills-pagination-info";
          info.textContent = `Page ${pag.page}${pag.totalPages ? ` of ${pag.totalPages}` : ""}`;

          const nextBtn = document.createElement("button");
          nextBtn.textContent = "Next";
          nextBtn.disabled = !pag.hasNext;
          nextBtn.addEventListener("click", () => { currentPage++; doSearch(q); });

          pagination.appendChild(prevBtn);
          pagination.appendChild(info);
          pagination.appendChild(nextBtn);
        } else {
          pagination.style.display = "none";
        }
      }
    } catch (err) {
      results.innerHTML = "";
      showErrorBanner(results, err.message || "Search failed");
    }
  }
}

// ── Skill Card ──────────────────────────────────────────

function createSkillCard(skill, score) {
  const card = document.createElement("div");
  card.className = "skill-card";
  card.tabIndex = 0;

  const header = document.createElement("div");
  header.className = "skill-card-header";

  const nameEl = document.createElement("span");
  nameEl.className = "skill-card-name";
  nameEl.textContent = skill.name;

  const authorEl = document.createElement("span");
  authorEl.className = "skill-card-author";
  authorEl.textContent = `@${skill.author}`;

  header.appendChild(nameEl);
  header.appendChild(authorEl);

  const desc = document.createElement("div");
  desc.className = "skill-card-desc";
  desc.textContent = skill.description || "";

  const footer = document.createElement("div");
  footer.className = "skill-card-footer";

  const stars = document.createElement("span");
  stars.className = "skill-card-stars";
  stars.innerHTML = `${STAR_SVG} ${skill.stars || 0}`;

  const time = document.createElement("span");
  time.className = "skill-card-time";
  time.textContent = relativeTime(skill.updatedAt);

  footer.appendChild(stars);
  if (score !== undefined) {
    const scoreEl = document.createElement("span");
    scoreEl.className = "skill-card-score";
    scoreEl.textContent = `${score}% match`;
    footer.appendChild(scoreEl);
  }
  footer.appendChild(time);

  // Install actions
  const actions = document.createElement("div");
  actions.className = "skill-card-actions";

  const scopeSelect = document.createElement("select");
  scopeSelect.className = "skill-scope-select";
  scopeSelect.innerHTML = `<option value="global">Global</option>`;
  const pp = getProjectPath();
  if (pp) {
    scopeSelect.innerHTML += `<option value="project">Project</option>`;
    if (defaultScope === "project") scopeSelect.value = "project";
  }

  const installBtn = document.createElement("button");
  installBtn.className = "skill-install-btn";

  if (isInstalled(skill)) {
    installBtn.textContent = "Installed";
    installBtn.classList.add("installed");
  } else {
    installBtn.textContent = "Install";
    installBtn.addEventListener("click", async (e) => {
      e.stopPropagation();

      // Check for duplicate
      const scope = scopeSelect.value;
      const duplicate = installedCache.find(
        (s) => (s.dirName === skill.name || s.name === skill.name) && s.scope === scope
      );

      if (duplicate) {
        showConfirm({
          title: `"${skill.name}" is already installed`,
          message: `This will overwrite the existing skill in ${scope === "global" ? "global (~/.claude/)" : "project (.claude/)"} scope.`,
          confirmLabel: "Overwrite",
          danger: true,
          onConfirm: () => doInstall(),
        });
      } else {
        doInstall();
      }

      async function doInstall() {
        installBtn.disabled = true;
        installBtn.textContent = "Installing...";

        try {
          const res = await ctx.api.installSkill({
            githubUrl: skill.githubUrl,
            name: skill.name,
            description: skill.description || "",
            scope,
            projectPath: getProjectPath(),
          });

          if (res.error) {
            installBtn.textContent = "Error";
            setTimeout(() => { installBtn.textContent = "Install"; installBtn.disabled = false; }, 2000);
            return;
          }

          installBtn.textContent = "Installed";
          installBtn.classList.add("installed");
          installBtn.disabled = false;

          showSkillToast(`Installed "${skill.name}"`, "success");
          refreshInstalled();
          refreshProjectCommands();
        } catch {
          installBtn.textContent = "Failed";
          showSkillToast(`Failed to install "${skill.name}"`, "error");
          setTimeout(() => { installBtn.textContent = "Install"; installBtn.disabled = false; }, 2000);
        }
      }
    });
  }

  actions.appendChild(scopeSelect);
  actions.appendChild(installBtn);
  footer.appendChild(actions);

  card.appendChild(header);
  card.appendChild(desc);
  card.appendChild(footer);

  // Detail expansion
  const detail = document.createElement("div");
  detail.className = "skill-card-detail";

  const fullDesc = document.createElement("div");
  fullDesc.className = "skill-card-desc";
  fullDesc.style.cssText = "-webkit-line-clamp: unset; margin-bottom: 4px;";
  fullDesc.textContent = skill.description || "";

  const links = document.createElement("div");
  links.className = "skill-card-detail-links";
  if (skill.githubUrl) links.innerHTML += `<a href="${skill.githubUrl}" target="_blank" rel="noopener">GitHub</a>`;
  if (skill.skillUrl) links.innerHTML += `<a href="${skill.skillUrl}" target="_blank" rel="noopener">SkillsMP</a>`;

  const dateEl = document.createElement("div");
  dateEl.className = "skill-card-detail-date";
  if (skill.updatedAt) {
    const d = new Date(Number(skill.updatedAt) * 1000);
    dateEl.textContent = `Updated: ${d.toLocaleDateString()}`;
  }

  detail.appendChild(fullDesc);
  detail.appendChild(links);
  detail.appendChild(dateEl);
  card.appendChild(detail);

  card.addEventListener("click", () => detail.classList.toggle("open"));

  return card;
}

// ── Installed Tab ───────────────────────────────────────

async function refreshInstalled() {
  try {
    installedCache = await ctx.api.fetchInstalledSkills(getProjectPath());
  } catch {
    installedCache = [];
  }
  if (installedContent) renderInstalledTab();
}

function renderInstalledTab() {
  installedContent.innerHTML = "";

  if (installedCache.length === 0) {
    showEmpty(installedContent, "No skills installed");
    return;
  }

  const projectSkills = installedCache.filter((s) => s.scope === "project");
  const globalSkills = installedCache.filter((s) => s.scope === "global");

  if (projectSkills.length > 0) {
    const header = document.createElement("div");
    header.className = "skills-scope-header";
    header.textContent = "Project";
    installedContent.appendChild(header);
    for (const skill of projectSkills) installedContent.appendChild(createInstalledRow(skill));
  }

  if (globalSkills.length > 0) {
    const header = document.createElement("div");
    header.className = "skills-scope-header";
    header.textContent = "Global";
    installedContent.appendChild(header);
    for (const skill of globalSkills) installedContent.appendChild(createInstalledRow(skill));
  }
}

function createInstalledRow(skill) {
  const row = document.createElement("div");
  row.className = "skill-installed-row";

  const info = document.createElement("div");
  info.className = "skill-installed-info";
  info.innerHTML = `<div class="skill-installed-name">${skill.name}</div><div class="skill-installed-desc">${skill.description || ""}</div>`;

  const badge = document.createElement("span");
  badge.className = `skill-scope-badge ${skill.scope}`;
  badge.textContent = skill.scope;

  // Toggle
  const toggle = document.createElement("label");
  toggle.className = "skill-toggle";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = skill.enabled;
  const slider = document.createElement("span");
  slider.className = "skill-toggle-slider";
  toggle.appendChild(checkbox);
  toggle.appendChild(slider);

  checkbox.addEventListener("change", async () => {
    try {
      await ctx.api.toggleSkill(skill.dirName, skill.scope, getProjectPath());
      refreshProjectCommands();
    } catch {
      checkbox.checked = !checkbox.checked;
    }
  });

  // Uninstall
  const delBtn = document.createElement("button");
  delBtn.className = "skill-uninstall-btn";
  delBtn.title = "Uninstall";
  delBtn.innerHTML = TRASH_SVG;
  delBtn.addEventListener("click", () => {
    showConfirm({
      title: `Uninstall "${skill.name}"?`,
      message: "This will remove the skill files from disk. You can reinstall it anytime from the marketplace.",
      confirmLabel: "Uninstall",
      danger: true,
      onConfirm: async () => {
        try {
          await ctx.api.uninstallSkill(skill.dirName, skill.scope, getProjectPath());
          showSkillToast(`Uninstalled "${skill.name}"`, "success");
          refreshInstalled();
          refreshProjectCommands();
        } catch {
          showSkillToast(`Failed to uninstall "${skill.name}"`, "error");
        }
      },
    });
  });

  row.appendChild(info);
  row.appendChild(badge);
  row.appendChild(toggle);
  row.appendChild(delBtn);
  return row;
}

// ── Settings Tab ────────────────────────────────────────

async function renderSettings() {
  settingsContent.innerHTML = "";
  const container = document.createElement("div");
  container.className = "skills-settings";

  // API Key section
  let config;
  try {
    config = await ctx.api.fetchSkillsConfig();
  } catch {
    config = { apiKey: "", activated: false };
  }

  const keyGroup = document.createElement("div");
  keyGroup.className = "skills-settings-group";
  keyGroup.innerHTML = `<div class="skills-settings-label">API Key</div><div class="skills-settings-value">${config.apiKey || "Not set"}</div>`;

  const keyBtns = document.createElement("div");
  keyBtns.className = "skills-settings-row";

  const changeBtn = document.createElement("button");
  changeBtn.className = "skills-settings-btn";
  changeBtn.textContent = "Change Key";
  changeBtn.addEventListener("click", () => {
    const key = prompt("Enter new SkillsMP API key:");
    if (key === null) return;
    ctx.api.saveSkillsConfig({ apiKey: key }).then((res) => {
      if (res.error) alert(res.error);
      else renderSettings();
    });
  });

  const removeBtn = document.createElement("button");
  removeBtn.className = "skills-settings-btn danger";
  removeBtn.textContent = "Remove Key";
  removeBtn.addEventListener("click", async () => {
    showConfirm({
      title: "Disable Skills Marketplace?",
      message: "This will remove your API key. You can reactivate anytime by entering a new key.",
      confirmLabel: "Disable",
      danger: true,
      onConfirm: async () => {
        await ctx.api.saveSkillsConfig({ apiKey: "" });
        activated = false;
        root.style.opacity = "0";
        setTimeout(() => {
          renderActivationForm();
          root.style.opacity = "1";
        }, 150);
      },
    });
  });

  keyBtns.appendChild(changeBtn);
  keyBtns.appendChild(removeBtn);
  keyGroup.appendChild(keyBtns);
  container.appendChild(keyGroup);

  // Quota
  if (quotaRemaining !== null) {
    const quotaGroup = document.createElement("div");
    quotaGroup.className = "skills-settings-group";
    quotaGroup.innerHTML = `<div class="skills-settings-label">Daily Quota</div><div class="skills-quota">${quotaRemaining} requests remaining (resets midnight UTC)</div>`;
    container.appendChild(quotaGroup);
  }

  // Default scope
  const scopeGroup = document.createElement("div");
  scopeGroup.className = "skills-settings-group";
  scopeGroup.innerHTML = '<div class="skills-settings-label">Default Install Scope</div>';
  const scopeSelect = document.createElement("select");
  scopeSelect.innerHTML = '<option value="project">Project (.claude/)</option><option value="global">Global (~/.claude/)</option>';
  scopeSelect.value = defaultScope;
  scopeSelect.addEventListener("change", () => {
    defaultScope = scopeSelect.value;
    ctx.api.saveSkillsConfig({ defaultScope });
  });
  scopeGroup.appendChild(scopeSelect);
  container.appendChild(scopeGroup);

  // Default search mode
  const modeGroup = document.createElement("div");
  modeGroup.className = "skills-settings-group";
  modeGroup.innerHTML = '<div class="skills-settings-label">Default Search Mode</div>';
  const modeSelect = document.createElement("select");
  modeSelect.innerHTML = '<option value="keyword">Keyword</option><option value="ai">AI Semantic</option>';
  modeSelect.value = searchMode;
  modeSelect.addEventListener("change", () => {
    searchMode = modeSelect.value;
    localStorage.setItem("claudeck-skills-mode", searchMode);
    ctx.api.saveSkillsConfig({ searchMode });
  });
  modeGroup.appendChild(modeSelect);
  container.appendChild(modeGroup);

  settingsContent.appendChild(container);
}

// ── Shared helpers ──────────────────────────────────────

function showEmpty(container, text) {
  const empty = document.createElement("div");
  empty.className = "skills-empty";
  empty.innerHTML = `${ICON}<span>${text}</span>`;
  container.appendChild(empty);
}

function showInitialState(container) {
  const el = document.createElement("div");
  el.className = "skills-initial-state";
  el.innerHTML = `
    <div class="skills-initial-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    </div>
    <div class="skills-initial-title">Discover agent skills</div>
    <div class="skills-initial-desc">Search for skills by name, or switch to Semantic mode to describe what you need in plain English.</div>
    <div class="skills-initial-examples">
      <span class="skills-initial-example">code-review</span>
      <span class="skills-initial-example">commit-message</span>
      <span class="skills-initial-example">testing</span>
    </div>
  `;

  // Clicking an example fills the search input
  el.querySelectorAll(".skills-initial-example").forEach((tag) => {
    tag.addEventListener("click", () => {
      const input = browseContent?.querySelector(".skills-search-input");
      if (input) {
        input.value = tag.textContent;
        input.dispatchEvent(new Event("input"));
        input.focus();
      }
    });
  });

  container.appendChild(el);
}

function showErrorBanner(container, message) {
  const banner = document.createElement("div");
  banner.className = "skills-error-banner";
  banner.innerHTML = `<span>${message}</span>`;

  if (message.includes("API key") || message.includes("INVALID")) {
    const btn = document.createElement("button");
    btn.textContent = "Re-enter Key";
    btn.addEventListener("click", () => {
      root.querySelector('[data-subtab="settings"]')?.click();
    });
    banner.appendChild(btn);
  } else if (message.includes("quota") || message.includes("QUOTA")) {
    banner.innerHTML = `<span>Daily quota reached — try again tomorrow</span>`;
  } else {
    const btn = document.createElement("button");
    btn.textContent = "Retry";
    btn.addEventListener("click", () => {
      banner.remove();
      const q = lastSearchQuery;
      if (q) {
        const input = browseContent?.querySelector(".skills-search-input");
        if (input) { input.value = q; input.dispatchEvent(new Event("input")); }
      }
    });
    banner.appendChild(btn);
  }

  container.prepend(banner);
}

function clearBrowseSearch() {
  const input = browseContent?.querySelector(".skills-search-input");
  if (input) input.value = "";
  lastSearchQuery = "";
  localStorage.removeItem("claudeck-skills-query");
  const results = browseContent?.querySelector(".skills-results");
  if (results) {
    results.innerHTML = "";
    showInitialState(results);
  }
  const pagination = browseContent?.querySelector(".skills-pagination");
  if (pagination) pagination.style.display = "none";
  currentPage = 1;
}

function showConfirm({ title, message, confirmLabel = "Confirm", danger = false, onConfirm }) {
  const overlay = document.createElement("div");
  overlay.className = "skills-confirm-overlay";

  const dialog = document.createElement("div");
  dialog.className = "skills-confirm-dialog";

  dialog.innerHTML = `
    <div class="skills-confirm-title">${title}</div>
    <div class="skills-confirm-message">${message}</div>
    <div class="skills-confirm-actions">
      <button class="skills-confirm-cancel">Cancel</button>
      <button class="skills-confirm-ok ${danger ? "danger" : ""}">${confirmLabel}</button>
    </div>
  `;

  const close = () => overlay.remove();
  dialog.querySelector(".skills-confirm-cancel").addEventListener("click", close);
  dialog.querySelector(".skills-confirm-ok").addEventListener("click", () => {
    close();
    onConfirm();
  });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  dialog.querySelector(".skills-confirm-cancel").focus();
}

function showSkillToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `bg-toast ${type === "error" ? "bg-toast-error" : ""}`;
  toast.innerHTML = `
    <span class="bg-toast-dot ${type === "error" ? "error" : ""}"></span>
    <div class="bg-toast-body">
      <div class="bg-toast-label"${type === "error" ? ' style="color:var(--error)"' : ""}>Skills Marketplace</div>
      <div class="bg-toast-title">${message}</div>
    </div>
    <button class="bg-toast-close" title="Dismiss">&times;</button>
  `;

  toast.querySelector(".bg-toast-close").addEventListener("click", () => {
    toast.classList.add("toast-exit");
    toast.addEventListener("animationend", () => toast.remove());
  });

  container.appendChild(toast);

  // Auto-dismiss after 4s
  setTimeout(() => {
    if (toast.parentNode) {
      toast.classList.add("toast-exit");
      toast.addEventListener("animationend", () => toast.remove());
    }
  }, 4000);
}

function refreshProjectCommands() {
  import("../features/projects.js").then(({ loadProjectCommands }) => loadProjectCommands());
}

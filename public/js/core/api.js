// All fetch() calls consolidated into named functions

// Global 401 interceptor — redirect to login on auth failure
const _origFetch = window.fetch;
window.fetch = async (...args) => {
  const res = await _origFetch(...args);
  if (res.status === 401 && !window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
  return res;
};

export async function fetchProjects() {
  const res = await fetch("/api/projects");
  return res.json();
}

export async function fetchSessions(projectPath) {
  const url = projectPath
    ? `/api/sessions?project_path=${encodeURIComponent(projectPath)}`
    : "/api/sessions";
  const res = await fetch(url);
  return res.json();
}

export async function searchSessions(query, projectPath) {
  let url = `/api/sessions/search?q=${encodeURIComponent(query)}`;
  if (projectPath) url += `&project_path=${encodeURIComponent(projectPath)}`;
  const res = await fetch(url);
  return res.json();
}

export async function fetchActiveSessionIds() {
  const res = await fetch("/api/sessions/active");
  const data = await res.json();
  return data.activeSessionIds || [];
}

function _appendPaginationParams(url, { limit, before } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set("limit", limit);
  if (before) params.set("before", before);
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function fetchMessages(sessionId, opts) {
  const url = _appendPaginationParams(
    `/api/sessions/${encodeURIComponent(sessionId)}/messages`, opts
  );
  const res = await fetch(url);
  return res.json();
}

export async function fetchMessagesByChatId(sessionId, chatId, opts) {
  const url = _appendPaginationParams(
    `/api/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(chatId)}`, opts
  );
  const res = await fetch(url);
  return res.json();
}

export async function fetchSingleMessages(sessionId, opts) {
  const url = _appendPaginationParams(
    `/api/sessions/${encodeURIComponent(sessionId)}/messages-single`, opts
  );
  const res = await fetch(url);
  return res.json();
}

export async function fetchStats(projectPath) {
  const url = projectPath
    ? `/api/stats?project_path=${encodeURIComponent(projectPath)}`
    : "/api/stats";
  const res = await fetch(url);
  return res.json();
}

export async function fetchHomeData() {
  const res = await fetch("/api/stats/home");
  return res.json();
}

export async function fetchDashboard(projectPath) {
  const url = projectPath
    ? `/api/stats/dashboard?project_path=${encodeURIComponent(projectPath)}`
    : "/api/stats/dashboard";
  const res = await fetch(url);
  return res.json();
}

export async function fetchPrompts() {
  const res = await fetch("/api/prompts");
  return res.json();
}

export async function createPrompt(title, description, prompt) {
  const res = await fetch("/api/prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description, prompt }),
  });
  if (!res.ok) throw new Error("Failed to save");
  return res.json();
}

export async function deletePromptApi(idx) {
  const res = await fetch(`/api/prompts/${idx}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete");
  return res.json();
}

export async function fetchWorkflows() {
  const res = await fetch("/api/workflows");
  return res.json();
}

export async function createWorkflow(workflow) {
  const res = await fetch("/api/workflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(workflow),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create workflow");
  }
  return res.json();
}

export async function updateWorkflow(id, workflow) {
  const res = await fetch(`/api/workflows/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(workflow),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to update workflow");
  }
  return res.json();
}

export async function deleteWorkflowApi(id) {
  const res = await fetch(`/api/workflows/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to delete workflow");
  }
  return res.json();
}

export async function fetchAgents() {
  const res = await fetch("/api/agents");
  return res.json();
}

export async function createAgent(agent) {
  const res = await fetch("/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(agent),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create agent");
  }
  return res.json();
}

export async function updateAgent(id, agent) {
  const res = await fetch(`/api/agents/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(agent),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to update agent");
  }
  return res.json();
}

export async function deleteAgentApi(id) {
  const res = await fetch(`/api/agents/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to delete agent");
  }
  return res.json();
}

// Agent Chains
export async function fetchChains() {
  const res = await fetch("/api/agents/chains");
  return res.json();
}

export async function createChain(chain) {
  const res = await fetch("/api/agents/chains", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(chain),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create chain");
  }
  return res.json();
}

export async function updateChain(id, chain) {
  const res = await fetch(`/api/agents/chains/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(chain),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to update chain");
  }
  return res.json();
}

export async function fetchAgentContext(runId) {
  const res = await fetch(`/api/agents/context/${encodeURIComponent(runId)}`);
  return res.json();
}

// Agent DAGs
export async function fetchDags() {
  const res = await fetch("/api/agents/dags");
  return res.json();
}

export async function createDag(dag) {
  const res = await fetch("/api/agents/dags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dag),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create DAG");
  }
  return res.json();
}

export async function updateDag(id, dag) {
  const res = await fetch(`/api/agents/dags/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dag),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to update DAG");
  }
  return res.json();
}

export async function deleteDagApi(id) {
  const res = await fetch(`/api/agents/dags/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to delete DAG");
  }
  return res.json();
}

export async function deleteChainApi(id) {
  const res = await fetch(`/api/agents/chains/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to delete chain");
  }
  return res.json();
}

export async function browseFolders(dir) {
  const url = dir
    ? `/api/projects/browse?dir=${encodeURIComponent(dir)}`
    : "/api/projects/browse";
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }
  return res.json();
}

export async function addProject(name, path) {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, path }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }
  return res.json();
}

export async function deleteProject(path) {
  const res = await fetch("/api/projects", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }
  return res.json();
}

export async function fetchProjectCommands(path) {
  const res = await fetch(`/api/projects/commands?path=${encodeURIComponent(path)}`);
  return res.json();
}

export async function fetchFiles(path) {
  const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
  return res.json();
}

export async function fetchFileContent(base, filePath) {
  const res = await fetch(`/api/files/content?base=${encodeURIComponent(base)}&path=${encodeURIComponent(filePath)}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }
  return res.json();
}

export async function writeFileContent(base, filePath, content) {
  const res = await fetch("/api/files/content", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base, path: filePath, content }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }
  return res.json();
}

export async function fetchFileTree(base, dir = "") {
  let url = `/api/files/tree?base=${encodeURIComponent(base)}`;
  if (dir) url += `&dir=${encodeURIComponent(dir)}`;
  const res = await fetch(url);
  return res.json();
}

export async function searchFiles(base, query) {
  const url = `/api/files/search?base=${encodeURIComponent(base)}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  return res.json();
}

export async function fetchMcpServers(projectPath) {
  let url = "/api/mcp/servers";
  if (projectPath) url += `?project=${encodeURIComponent(projectPath)}`;
  const res = await fetch(url);
  return res.json();
}

export async function saveMcpServer(name, config, projectPath) {
  let url = `/api/mcp/servers/${encodeURIComponent(name)}`;
  if (projectPath) url += `?project=${encodeURIComponent(projectPath)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error("Failed to save MCP server");
  return res.json();
}

export async function deleteMcpServer(name, projectPath) {
  let url = `/api/mcp/servers/${encodeURIComponent(name)}`;
  if (projectPath) url += `?project=${encodeURIComponent(projectPath)}`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete MCP server");
  return res.json();
}

export async function fetchAnalytics(projectPath) {
  const url = projectPath
    ? `/api/stats/analytics?project_path=${encodeURIComponent(projectPath)}`
    : "/api/stats/analytics";
  const res = await fetch(url);
  return res.json();
}

export async function fetchAccountInfo() {
  const res = await fetch("/api/account");
  return res.json();
}

export async function fetchAgentMetrics() {
  const res = await fetch("/api/stats/agent-metrics");
  return res.json();
}

export async function updateSessionTitle(sessionId, title) {
  await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/title`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
}

export async function deleteSessionApi(id) {
  await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function toggleSessionPin(sessionId) {
  await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/pin`, { method: "PUT" });
}

export async function generateSummary(sessionId) {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/summary`, { method: "POST" });
  return res.json();
}

export async function forkSession(sessionId, messageId) {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/fork`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Fork failed");
  }
  return res.json();
}

export async function fetchBranches(sessionId) {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/branches`);
  return res.json();
}

export async function fetchLineage(sessionId) {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/lineage`);
  return res.json();
}

export async function saveSystemPromptApi(path, systemPrompt) {
  await fetch("/api/projects/system-prompt", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, systemPrompt }),
  });
}

export async function execCommand(command, cwd) {
  const res = await fetch("/api/exec", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command, cwd }),
  });
  return res.json();
}


// Tips
export async function fetchTips() {
  const res = await fetch("/api/tips");
  return res.json();
}

export async function fetchRssFeed(url) {
  const res = await fetch(`/api/tips/rss?url=${encodeURIComponent(url)}`);
  return res.json();
}

// Todos
const CT = { "Content-Type": "application/json" };

export async function fetchTodoCounts() {
  const res = await fetch("/api/plugins/tasks/counts");
  return res.json();
}

export async function fetchTodos(archived = false) {
  const res = await fetch("/api/plugins/tasks" + (archived ? "?archived=1" : ""));
  return res.json();
}

export async function archiveTodoApi(id, archived = true) {
  const res = await fetch(`/api/plugins/tasks/${id}/archive`, { method: "PUT", headers: CT, body: JSON.stringify({ archived }) });
  return res.json();
}

export async function createTodoApi(text) {
  const res = await fetch("/api/plugins/tasks", { method: "POST", headers: CT, body: JSON.stringify({ text }) });
  return res.json();
}

export async function updateTodoApi(id, data) {
  const res = await fetch(`/api/plugins/tasks/${id}`, { method: "PUT", headers: CT, body: JSON.stringify(data) });
  return res.json();
}

export async function deleteTodoApi(id) {
  const res = await fetch(`/api/plugins/tasks/${id}`, { method: "DELETE" });
  return res.json();
}

export async function bragTodoApi(id, summary) {
  const res = await fetch(`/api/plugins/tasks/${id}/brag`, { method: "POST", headers: CT, body: JSON.stringify({ summary }) });
  return res.json();
}

export async function fetchBrags() {
  const res = await fetch("/api/plugins/tasks/brags");
  return res.json();
}

export async function deleteBragApi(id) {
  const res = await fetch(`/api/plugins/tasks/brags/${id}`, { method: "DELETE" });
  return res.json();
}

// Repos
async function throwApiError(res) {
  const text = await res.text();
  try {
    const err = JSON.parse(text);
    throw new Error(err.error || `Request failed (${res.status})`);
  } catch (e) {
    if (e.message && !e.message.startsWith("Unexpected")) throw e;
    throw new Error(`Request failed (${res.status})`);
  }
}

export async function fetchRepos() {
  const res = await fetch("/api/plugins/repos");
  return res.json();
}

export async function addRepo(name, path, groupId, url) {
  const body = { name, groupId };
  if (path) body.path = path;
  if (url) body.url = url;
  const res = await fetch("/api/plugins/repos/repos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

export async function updateRepo(id, updates) {
  const res = await fetch(`/api/plugins/repos/repos/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

export async function deleteRepo(id) {
  const res = await fetch(`/api/plugins/repos/repos/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

export async function createRepoGroup(name, parentId) {
  const res = await fetch("/api/plugins/repos/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parentId }),
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

export async function updateRepoGroup(id, updates) {
  const res = await fetch(`/api/plugins/repos/groups/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

export async function deleteRepoGroup(id) {
  const res = await fetch(`/api/plugins/repos/groups/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

// ── Skills Marketplace (SkillsMP) ───────────────────────

export async function fetchSkillsConfig() {
  const res = await fetch("/api/skills/config");
  return res.json();
}

export async function saveSkillsConfig(config) {
  const res = await fetch("/api/skills/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  return res.json();
}

export async function searchSkills(q, page, limit, sortBy) {
  let url = `/api/skills/search?q=${encodeURIComponent(q)}`;
  if (page) url += `&page=${page}`;
  if (limit) url += `&limit=${limit}`;
  if (sortBy) url += `&sortBy=${encodeURIComponent(sortBy)}`;
  const res = await fetch(url);
  return { data: await res.json(), headers: res.headers };
}

export async function aiSearchSkills(q) {
  const res = await fetch(`/api/skills/ai-search?q=${encodeURIComponent(q)}`);
  return { data: await res.json(), headers: res.headers };
}

export async function fetchInstalledSkills(projectPath) {
  let url = "/api/skills/installed";
  if (projectPath) url += `?projectPath=${encodeURIComponent(projectPath)}`;
  const res = await fetch(url);
  return res.json();
}

export async function installSkill(body) {
  const res = await fetch("/api/skills/install", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function uninstallSkill(name, scope, projectPath) {
  let url = `/api/skills/${encodeURIComponent(name)}?scope=${scope}`;
  if (projectPath) url += `&projectPath=${encodeURIComponent(projectPath)}`;
  const res = await fetch(url, { method: "DELETE" });
  return res.json();
}

export async function toggleSkill(name, scope, projectPath) {
  let url = `/api/skills/${encodeURIComponent(name)}/toggle?scope=${scope}`;
  if (projectPath) url += `&projectPath=${encodeURIComponent(projectPath)}`;
  const res = await fetch(url, { method: "PUT" });
  return res.json();
}

// All fetch() calls consolidated into named functions

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

export async function fetchMessages(sessionId) {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages`);
  return res.json();
}

export async function fetchMessagesByChatId(sessionId, chatId) {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(chatId)}`);
  return res.json();
}

export async function fetchSingleMessages(sessionId) {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages-single`);
  return res.json();
}

export async function fetchStats(projectPath) {
  const url = projectPath
    ? `/api/stats?project_path=${encodeURIComponent(projectPath)}`
    : "/api/stats";
  const res = await fetch(url);
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

export async function fetchAgents() {
  const res = await fetch("/api/agents");
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

export async function fetchMcpServers() {
  const res = await fetch("/api/mcp/servers");
  return res.json();
}

export async function saveMcpServer(name, config) {
  const res = await fetch(`/api/mcp/servers/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error("Failed to save MCP server");
  return res.json();
}

export async function deleteMcpServer(name) {
  const res = await fetch(`/api/mcp/servers/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
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

export async function fetchLinearIssues() {
  const res = await fetch("/api/linear/issues");
  return res.json();
}

export async function fetchLinearTeams() {
  const res = await fetch("/api/linear/teams");
  return res.json();
}

export async function fetchLinearTeamStates(teamId) {
  const res = await fetch(`/api/linear/teams/${encodeURIComponent(teamId)}/states`);
  return res.json();
}

export async function createLinearIssue({ title, description, teamId, stateId }) {
  const res = await fetch("/api/linear/issues", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, description, teamId, stateId }),
  });
  if (!res.ok) throw new Error("Failed to create issue");
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
  const res = await fetch("/api/todos/counts");
  return res.json();
}

export async function fetchTodos(archived = false) {
  const res = await fetch("/api/todos" + (archived ? "?archived=1" : ""));
  return res.json();
}

export async function archiveTodoApi(id, archived = true) {
  const res = await fetch(`/api/todos/${id}/archive`, { method: "PUT", headers: CT, body: JSON.stringify({ archived }) });
  return res.json();
}

export async function createTodoApi(text) {
  const res = await fetch("/api/todos", { method: "POST", headers: CT, body: JSON.stringify({ text }) });
  return res.json();
}

export async function updateTodoApi(id, data) {
  const res = await fetch(`/api/todos/${id}`, { method: "PUT", headers: CT, body: JSON.stringify(data) });
  return res.json();
}

export async function deleteTodoApi(id) {
  const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
  return res.json();
}

export async function bragTodoApi(id, summary) {
  const res = await fetch(`/api/todos/${id}/brag`, { method: "POST", headers: CT, body: JSON.stringify({ summary }) });
  return res.json();
}

export async function fetchBrags() {
  const res = await fetch("/api/todos/brags");
  return res.json();
}

export async function deleteBragApi(id) {
  const res = await fetch(`/api/todos/brags/${id}`, { method: "DELETE" });
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
  const res = await fetch("/api/repos");
  return res.json();
}

export async function addRepo(name, path, groupId, url) {
  const body = { name, groupId };
  if (path) body.path = path;
  if (url) body.url = url;
  const res = await fetch("/api/repos/repos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

export async function updateRepo(id, updates) {
  const res = await fetch(`/api/repos/repos/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

export async function deleteRepo(id) {
  const res = await fetch(`/api/repos/repos/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

export async function createRepoGroup(name, parentId) {
  const res = await fetch("/api/repos/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parentId }),
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

export async function updateRepoGroup(id, updates) {
  const res = await fetch(`/api/repos/groups/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

export async function deleteRepoGroup(id) {
  const res = await fetch(`/api/repos/groups/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) await throwApiError(res);
  return res.json();
}

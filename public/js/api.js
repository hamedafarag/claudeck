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

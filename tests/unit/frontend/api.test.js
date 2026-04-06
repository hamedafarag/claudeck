// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockJson = vi.fn(() => Promise.resolve({}));
const mockText = vi.fn(() => Promise.resolve(""));
const mockFetch = vi.fn(() =>
  Promise.resolve({ ok: true, json: mockJson, text: mockText })
);
vi.stubGlobal("fetch", mockFetch);

import {
  fetchProjects,
  fetchSessions,
  searchSessions,
  fetchActiveSessionIds,
  fetchMessages,
  fetchMessagesByChatId,
  fetchSingleMessages,
  fetchStats,
  fetchHomeData,
  fetchDashboard,
  fetchPrompts,
  createPrompt,
  deletePromptApi,
  fetchWorkflows,
  createWorkflow,
  updateWorkflow,
  deleteWorkflowApi,
  fetchAgents,
  createAgent,
  updateAgent,
  deleteAgentApi,
  fetchChains,
  createChain,
  updateChain,
  fetchAgentContext,
  fetchDags,
  createDag,
  updateDag,
  deleteDagApi,
  deleteChainApi,
  browseFolders,
  addProject,
  deleteProject,
  fetchProjectCommands,
  fetchFiles,
  fetchFileContent,
  writeFileContent,
  fetchFileTree,
  searchFiles,
  fetchMcpServers,
  saveMcpServer,
  deleteMcpServer,
  fetchAnalytics,
  fetchAccountInfo,
  fetchAgentMetrics,
  updateSessionTitle,
  deleteSessionApi,
  toggleSessionPin,
  generateSummary,
  saveSystemPromptApi,
  execCommand,
  fetchTips,
  fetchRssFeed,
  fetchTodoCounts,
  fetchTodos,
  archiveTodoApi,
  createTodoApi,
  updateTodoApi,
  deleteTodoApi,
  bragTodoApi,
  fetchBrags,
  deleteBragApi,
  fetchRepos,
  addRepo,
  updateRepo,
  deleteRepo,
  createRepoGroup,
  updateRepoGroup,
  deleteRepoGroup,
} from "../../../public/js/core/api.js";

beforeEach(() => {
  mockFetch.mockClear();
  mockJson.mockClear();
  mockText.mockClear();
  // Reset to default ok response
  mockFetch.mockImplementation(() =>
    Promise.resolve({ ok: true, json: mockJson, text: mockText })
  );
  mockJson.mockImplementation(() => Promise.resolve({}));
  mockText.mockImplementation(() => Promise.resolve(""));
});

// ─── Sessions ───────────────────────────────────────────────────────

describe("Sessions", () => {
  it("fetchSessions without project path", async () => {
    await fetchSessions();
    expect(mockFetch).toHaveBeenCalledWith("/api/sessions");
  });

  it("fetchSessions with project path", async () => {
    await fetchSessions("/my/path");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/sessions?project_path=${encodeURIComponent("/my/path")}`
    );
  });

  it("searchSessions with query only", async () => {
    await searchSessions("hello world");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/sessions/search?q=${encodeURIComponent("hello world")}`
    );
  });

  it("searchSessions with query and project path", async () => {
    await searchSessions("test", "/proj");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/sessions/search?q=${encodeURIComponent("test")}&project_path=${encodeURIComponent("/proj")}`
    );
  });

  it("fetchActiveSessionIds returns array from response", async () => {
    mockJson.mockResolvedValueOnce({ activeSessionIds: ["a", "b"] });
    const result = await fetchActiveSessionIds();
    expect(mockFetch).toHaveBeenCalledWith("/api/sessions/active");
    expect(result).toEqual(["a", "b"]);
  });

  it("fetchActiveSessionIds returns empty array if missing", async () => {
    mockJson.mockResolvedValueOnce({});
    const result = await fetchActiveSessionIds();
    expect(result).toEqual([]);
  });

  it("fetchMessages encodes sessionId", async () => {
    await fetchMessages("sess/123");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/sessions/${encodeURIComponent("sess/123")}/messages`
    );
  });

  it("fetchMessages appends limit param", async () => {
    await fetchMessages("s1", { limit: 30 });
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/sessions/${encodeURIComponent("s1")}/messages?limit=30`
    );
  });

  it("fetchMessages appends limit and before params", async () => {
    await fetchMessages("s1", { limit: 30, before: 100 });
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/sessions/${encodeURIComponent("s1")}/messages?limit=30&before=100`
    );
  });

  it("fetchMessagesByChatId encodes both params", async () => {
    await fetchMessagesByChatId("sess/1", "chat/2");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/sessions/${encodeURIComponent("sess/1")}/messages/${encodeURIComponent("chat/2")}`
    );
  });

  it("fetchMessagesByChatId appends pagination params", async () => {
    await fetchMessagesByChatId("s1", "chat-0", { limit: 20, before: 50 });
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/sessions/${encodeURIComponent("s1")}/messages/${encodeURIComponent("chat-0")}?limit=20&before=50`
    );
  });

  it("fetchSingleMessages encodes sessionId", async () => {
    await fetchSingleMessages("s1");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/sessions/${encodeURIComponent("s1")}/messages-single`
    );
  });

  it("fetchSingleMessages appends pagination params", async () => {
    await fetchSingleMessages("s1", { limit: 30 });
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/sessions/${encodeURIComponent("s1")}/messages-single?limit=30`
    );
  });

  it("updateSessionTitle sends PUT with title", async () => {
    await updateSessionTitle("s1", "New Title");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/sessions/${encodeURIComponent("s1")}/title`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Title" }),
      }
    );
  });

  it("deleteSessionApi sends DELETE", async () => {
    await deleteSessionApi("s1");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/sessions/${encodeURIComponent("s1")}`,
      { method: "DELETE" }
    );
  });

  it("toggleSessionPin sends PUT", async () => {
    await toggleSessionPin("s1");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/sessions/${encodeURIComponent("s1")}/pin`,
      { method: "PUT" }
    );
  });

  it("generateSummary sends POST and returns json", async () => {
    mockJson.mockResolvedValueOnce({ summary: "test" });
    const result = await generateSummary("s1");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/sessions/${encodeURIComponent("s1")}/summary`,
      { method: "POST" }
    );
    expect(result).toEqual({ summary: "test" });
  });
});

// ─── Projects ───────────────────────────────────────────────────────

describe("Projects", () => {
  it("fetchProjects calls correct URL", async () => {
    await fetchProjects();
    expect(mockFetch).toHaveBeenCalledWith("/api/projects");
  });

  it("browseFolders without dir", async () => {
    await browseFolders();
    expect(mockFetch).toHaveBeenCalledWith("/api/projects/browse");
  });

  it("browseFolders with dir", async () => {
    await browseFolders("/home/user");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/projects/browse?dir=${encodeURIComponent("/home/user")}`
    );
  });

  it("browseFolders throws on error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Not found" }),
    });
    await expect(browseFolders("/bad")).rejects.toThrow("Not found");
  });

  it("addProject sends POST with name and path", async () => {
    await addProject("My Project", "/proj/path");
    expect(mockFetch).toHaveBeenCalledWith("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My Project", path: "/proj/path" }),
    });
  });

  it("addProject throws on error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Duplicate" }),
    });
    await expect(addProject("x", "/x")).rejects.toThrow("Duplicate");
  });

  it("deleteProject sends DELETE with path", async () => {
    await deleteProject("/proj");
    expect(mockFetch).toHaveBeenCalledWith("/api/projects", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/proj" }),
    });
  });

  it("fetchProjectCommands encodes path", async () => {
    await fetchProjectCommands("/my proj");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/projects/commands?path=${encodeURIComponent("/my proj")}`
    );
  });

  it("saveSystemPromptApi sends PUT", async () => {
    await saveSystemPromptApi("/p", "You are helpful");
    expect(mockFetch).toHaveBeenCalledWith("/api/projects/system-prompt", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/p", systemPrompt: "You are helpful" }),
    });
  });
});

// ─── Stats ──────────────────────────────────────────────────────────

describe("Stats", () => {
  it("fetchStats without project path", async () => {
    await fetchStats();
    expect(mockFetch).toHaveBeenCalledWith("/api/stats");
  });

  it("fetchStats with project path", async () => {
    await fetchStats("/proj");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/stats?project_path=${encodeURIComponent("/proj")}`
    );
  });

  it("fetchHomeData calls correct URL", async () => {
    await fetchHomeData();
    expect(mockFetch).toHaveBeenCalledWith("/api/stats/home");
  });

  it("fetchDashboard without project path", async () => {
    await fetchDashboard();
    expect(mockFetch).toHaveBeenCalledWith("/api/stats/dashboard");
  });

  it("fetchDashboard with project path", async () => {
    await fetchDashboard("/proj");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/stats/dashboard?project_path=${encodeURIComponent("/proj")}`
    );
  });

  it("fetchAnalytics without project path", async () => {
    await fetchAnalytics();
    expect(mockFetch).toHaveBeenCalledWith("/api/stats/analytics");
  });

  it("fetchAnalytics with project path", async () => {
    await fetchAnalytics("/proj");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/stats/analytics?project_path=${encodeURIComponent("/proj")}`
    );
  });

  it("fetchAccountInfo calls correct URL", async () => {
    await fetchAccountInfo();
    expect(mockFetch).toHaveBeenCalledWith("/api/account");
  });

  it("fetchAgentMetrics calls correct URL", async () => {
    await fetchAgentMetrics();
    expect(mockFetch).toHaveBeenCalledWith("/api/stats/agent-metrics");
  });
});

// ─── Prompts ────────────────────────────────────────────────────────

describe("Prompts", () => {
  it("fetchPrompts calls correct URL", async () => {
    await fetchPrompts();
    expect(mockFetch).toHaveBeenCalledWith("/api/prompts");
  });

  it("createPrompt sends POST with body", async () => {
    await createPrompt("Title", "Desc", "Prompt text");
    expect(mockFetch).toHaveBeenCalledWith("/api/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Title", description: "Desc", prompt: "Prompt text" }),
    });
  });

  it("createPrompt throws on error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    await expect(createPrompt("a", "b", "c")).rejects.toThrow("Failed to save");
  });

  it("deletePromptApi sends DELETE with index", async () => {
    await deletePromptApi(3);
    expect(mockFetch).toHaveBeenCalledWith("/api/prompts/3", { method: "DELETE" });
  });

  it("deletePromptApi throws on error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    await expect(deletePromptApi(0)).rejects.toThrow("Failed to delete");
  });
});

// ─── Workflows ──────────────────────────────────────────────────────

describe("Workflows", () => {
  it("fetchWorkflows calls correct URL", async () => {
    await fetchWorkflows();
    expect(mockFetch).toHaveBeenCalledWith("/api/workflows");
  });

  it("createWorkflow sends POST with workflow object", async () => {
    const wf = { name: "wf1", steps: [] };
    await createWorkflow(wf);
    expect(mockFetch).toHaveBeenCalledWith("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(wf),
    });
  });

  it("createWorkflow throws error from response body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Bad workflow" }),
    });
    await expect(createWorkflow({})).rejects.toThrow("Bad workflow");
  });

  it("createWorkflow throws default on empty error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    });
    await expect(createWorkflow({})).rejects.toThrow("Failed to create workflow");
  });

  it("updateWorkflow sends PUT with encoded id", async () => {
    const wf = { name: "wf2" };
    await updateWorkflow("wf/1", wf);
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/workflows/${encodeURIComponent("wf/1")}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wf),
      }
    );
  });

  it("updateWorkflow throws on error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Not found" }),
    });
    await expect(updateWorkflow("x", {})).rejects.toThrow("Not found");
  });

  it("deleteWorkflowApi sends DELETE", async () => {
    await deleteWorkflowApi("wf1");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/workflows/${encodeURIComponent("wf1")}`,
      { method: "DELETE" }
    );
  });

  it("deleteWorkflowApi throws on error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    });
    await expect(deleteWorkflowApi("x")).rejects.toThrow("Failed to delete workflow");
  });
});

// ─── Agents ─────────────────────────────────────────────────────────

describe("Agents", () => {
  it("fetchAgents calls correct URL", async () => {
    await fetchAgents();
    expect(mockFetch).toHaveBeenCalledWith("/api/agents");
  });

  it("createAgent sends POST", async () => {
    const agent = { name: "a1" };
    await createAgent(agent);
    expect(mockFetch).toHaveBeenCalledWith("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(agent),
    });
  });

  it("createAgent throws on error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Duplicate" }),
    });
    await expect(createAgent({})).rejects.toThrow("Duplicate");
  });

  it("updateAgent sends PUT with encoded id", async () => {
    const agent = { name: "a2" };
    await updateAgent("a/1", agent);
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/agents/${encodeURIComponent("a/1")}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agent),
      }
    );
  });

  it("updateAgent throws on error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    });
    await expect(updateAgent("x", {})).rejects.toThrow("Failed to update agent");
  });

  it("deleteAgentApi sends DELETE", async () => {
    await deleteAgentApi("a1");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/agents/${encodeURIComponent("a1")}`,
      { method: "DELETE" }
    );
  });

  it("deleteAgentApi throws on error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Cannot delete" }),
    });
    await expect(deleteAgentApi("x")).rejects.toThrow("Cannot delete");
  });
});

// ─── Agent Chains ───────────────────────────────────────────────────

describe("Agent Chains", () => {
  it("fetchChains calls correct URL", async () => {
    await fetchChains();
    expect(mockFetch).toHaveBeenCalledWith("/api/agents/chains");
  });

  it("createChain sends POST", async () => {
    const chain = { name: "c1" };
    await createChain(chain);
    expect(mockFetch).toHaveBeenCalledWith("/api/agents/chains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chain),
    });
  });

  it("createChain throws on error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    });
    await expect(createChain({})).rejects.toThrow("Failed to create chain");
  });

  it("updateChain sends PUT with encoded id", async () => {
    const chain = { name: "c2" };
    await updateChain("c/1", chain);
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/agents/chains/${encodeURIComponent("c/1")}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chain),
      }
    );
  });

  it("updateChain throws on error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Bad chain" }),
    });
    await expect(updateChain("x", {})).rejects.toThrow("Bad chain");
  });

  it("deleteChainApi sends DELETE", async () => {
    await deleteChainApi("c1");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/agents/chains/${encodeURIComponent("c1")}`,
      { method: "DELETE" }
    );
  });

  it("deleteChainApi throws on error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    });
    await expect(deleteChainApi("x")).rejects.toThrow("Failed to delete chain");
  });

  it("fetchAgentContext encodes runId", async () => {
    await fetchAgentContext("run/1");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/agents/context/${encodeURIComponent("run/1")}`
    );
  });
});

// ─── Agent DAGs ─────────────────────────────────────────────────────

describe("Agent DAGs", () => {
  it("fetchDags calls correct URL", async () => {
    await fetchDags();
    expect(mockFetch).toHaveBeenCalledWith("/api/agents/dags");
  });

  it("createDag sends POST", async () => {
    const dag = { name: "d1", nodes: [] };
    await createDag(dag);
    expect(mockFetch).toHaveBeenCalledWith("/api/agents/dags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dag),
    });
  });

  it("createDag throws on error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    });
    await expect(createDag({})).rejects.toThrow("Failed to create DAG");
  });

  it("updateDag sends PUT with encoded id", async () => {
    const dag = { name: "d2" };
    await updateDag("d/1", dag);
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/agents/dags/${encodeURIComponent("d/1")}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dag),
      }
    );
  });

  it("updateDag throws on error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Bad DAG" }),
    });
    await expect(updateDag("x", {})).rejects.toThrow("Bad DAG");
  });

  it("deleteDagApi sends DELETE", async () => {
    await deleteDagApi("d1");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/agents/dags/${encodeURIComponent("d1")}`,
      { method: "DELETE" }
    );
  });

  it("deleteDagApi throws on error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({}),
    });
    await expect(deleteDagApi("x")).rejects.toThrow("Failed to delete DAG");
  });
});

// ─── Files ──────────────────────────────────────────────────────────

describe("Files", () => {
  it("fetchFiles encodes path", async () => {
    await fetchFiles("/my path");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/files?path=${encodeURIComponent("/my path")}`
    );
  });

  it("fetchFileContent encodes base and filePath", async () => {
    await fetchFileContent("/base", "src/file.js");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/files/content?base=${encodeURIComponent("/base")}&path=${encodeURIComponent("src/file.js")}`
    );
  });

  it("fetchFileContent throws on error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "File not found" }),
    });
    await expect(fetchFileContent("/b", "x")).rejects.toThrow("File not found");
  });

  it("writeFileContent sends PUT with base, path, content", async () => {
    await writeFileContent("/base", "file.js", "content here");
    expect(mockFetch).toHaveBeenCalledWith("/api/files/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base: "/base", path: "file.js", content: "content here" }),
    });
  });

  it("writeFileContent throws on error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "Permission denied" }),
    });
    await expect(writeFileContent("/b", "f", "c")).rejects.toThrow("Permission denied");
  });

  it("fetchFileTree with base only", async () => {
    await fetchFileTree("/base");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/files/tree?base=${encodeURIComponent("/base")}`
    );
  });

  it("fetchFileTree with base and dir", async () => {
    await fetchFileTree("/base", "src");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/files/tree?base=${encodeURIComponent("/base")}&dir=${encodeURIComponent("src")}`
    );
  });

  it("searchFiles encodes base and query", async () => {
    await searchFiles("/base", "hello world");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/files/search?base=${encodeURIComponent("/base")}&q=${encodeURIComponent("hello world")}`
    );
  });
});

// ─── MCP ────────────────────────────────────────────────────────────

describe("MCP", () => {
  it("fetchMcpServers without project path", async () => {
    await fetchMcpServers();
    expect(mockFetch).toHaveBeenCalledWith("/api/mcp/servers");
  });

  it("fetchMcpServers with project path", async () => {
    await fetchMcpServers("/proj");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/mcp/servers?project=${encodeURIComponent("/proj")}`
    );
  });

  it("saveMcpServer sends PUT with encoded name", async () => {
    const config = { command: "node", args: ["server.js"] };
    await saveMcpServer("my server", config);
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/mcp/servers/${encodeURIComponent("my server")}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      }
    );
  });

  it("saveMcpServer with project path", async () => {
    await saveMcpServer("srv", {}, "/proj");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/mcp/servers/${encodeURIComponent("srv")}?project=${encodeURIComponent("/proj")}`,
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("saveMcpServer throws on error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    await expect(saveMcpServer("s", {})).rejects.toThrow("Failed to save MCP server");
  });

  it("deleteMcpServer sends DELETE", async () => {
    await deleteMcpServer("srv");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/mcp/servers/${encodeURIComponent("srv")}`,
      { method: "DELETE" }
    );
  });

  it("deleteMcpServer with project path", async () => {
    await deleteMcpServer("srv", "/proj");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/mcp/servers/${encodeURIComponent("srv")}?project=${encodeURIComponent("/proj")}`,
      { method: "DELETE" }
    );
  });

  it("deleteMcpServer throws on error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    await expect(deleteMcpServer("s")).rejects.toThrow("Failed to delete MCP server");
  });
});

// ─── Exec ───────────────────────────────────────────────────────────

describe("Exec", () => {
  it("execCommand sends POST with command and cwd", async () => {
    await execCommand("ls -la", "/home");
    expect(mockFetch).toHaveBeenCalledWith("/api/exec", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "ls -la", cwd: "/home" }),
    });
  });
});


// ─── Tips ───────────────────────────────────────────────────────────

describe("Tips", () => {
  it("fetchTips calls correct URL", async () => {
    await fetchTips();
    expect(mockFetch).toHaveBeenCalledWith("/api/tips");
  });

  it("fetchRssFeed encodes url", async () => {
    await fetchRssFeed("https://example.com/feed");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/tips/rss?url=${encodeURIComponent("https://example.com/feed")}`
    );
  });
});

// ─── Todos ──────────────────────────────────────────────────────────

describe("Todos", () => {
  it("fetchTodoCounts calls correct URL", async () => {
    await fetchTodoCounts();
    expect(mockFetch).toHaveBeenCalledWith("/api/plugins/tasks/counts");
  });

  it("fetchTodos without archived", async () => {
    await fetchTodos();
    expect(mockFetch).toHaveBeenCalledWith("/api/plugins/tasks");
  });

  it("fetchTodos with archived=true", async () => {
    await fetchTodos(true);
    expect(mockFetch).toHaveBeenCalledWith("/api/plugins/tasks?archived=1");
  });

  it("archiveTodoApi sends PUT", async () => {
    await archiveTodoApi(42, true);
    expect(mockFetch).toHaveBeenCalledWith("/api/plugins/tasks/42/archive", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
  });

  it("archiveTodoApi defaults to archived=true", async () => {
    await archiveTodoApi(7);
    expect(mockFetch).toHaveBeenCalledWith("/api/plugins/tasks/7/archive", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
  });

  it("createTodoApi sends POST with text", async () => {
    await createTodoApi("Buy milk");
    expect(mockFetch).toHaveBeenCalledWith("/api/plugins/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Buy milk" }),
    });
  });

  it("updateTodoApi sends PUT with data", async () => {
    await updateTodoApi(1, { text: "Updated", done: true });
    expect(mockFetch).toHaveBeenCalledWith("/api/plugins/tasks/1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Updated", done: true }),
    });
  });

  it("deleteTodoApi sends DELETE", async () => {
    await deleteTodoApi(5);
    expect(mockFetch).toHaveBeenCalledWith("/api/plugins/tasks/5", { method: "DELETE" });
  });

  it("bragTodoApi sends POST with summary", async () => {
    await bragTodoApi(3, "Did great work");
    expect(mockFetch).toHaveBeenCalledWith("/api/plugins/tasks/3/brag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary: "Did great work" }),
    });
  });

  it("fetchBrags calls correct URL", async () => {
    await fetchBrags();
    expect(mockFetch).toHaveBeenCalledWith("/api/plugins/tasks/brags");
  });

  it("deleteBragApi sends DELETE", async () => {
    await deleteBragApi(9);
    expect(mockFetch).toHaveBeenCalledWith("/api/plugins/tasks/brags/9", { method: "DELETE" });
  });
});

// ─── Repos ──────────────────────────────────────────────────────────

describe("Repos", () => {
  it("fetchRepos calls correct URL", async () => {
    await fetchRepos();
    expect(mockFetch).toHaveBeenCalledWith("/api/plugins/repos");
  });

  it("addRepo sends POST with name, path, groupId", async () => {
    await addRepo("myrepo", "/home/repo", "g1");
    expect(mockFetch).toHaveBeenCalledWith("/api/plugins/repos/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "myrepo", groupId: "g1", path: "/home/repo" }),
    });
  });

  it("addRepo sends POST with url instead of path", async () => {
    await addRepo("myrepo", null, "g1", "https://github.com/repo");
    expect(mockFetch).toHaveBeenCalledWith("/api/plugins/repos/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "myrepo", groupId: "g1", url: "https://github.com/repo" }),
    });
  });

  it("addRepo throws on error with JSON error body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: () => Promise.resolve(JSON.stringify({ error: "Already exists" })),
    });
    await expect(addRepo("r", "/p", "g")).rejects.toThrow("Already exists");
  });

  it("addRepo throws generic on non-JSON error body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });
    await expect(addRepo("r", "/p", "g")).rejects.toThrow("Request failed (500)");
  });

  it("updateRepo sends PUT with encoded id", async () => {
    await updateRepo("r/1", { name: "updated" });
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/plugins/repos/repos/${encodeURIComponent("r/1")}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "updated" }),
      }
    );
  });

  it("updateRepo throws on error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: () => Promise.resolve(JSON.stringify({ error: "Not found" })),
    });
    await expect(updateRepo("x", {})).rejects.toThrow("Not found");
  });

  it("deleteRepo sends DELETE", async () => {
    await deleteRepo("r1");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/plugins/repos/repos/${encodeURIComponent("r1")}`,
      { method: "DELETE" }
    );
  });

  it("deleteRepo throws on error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve(JSON.stringify({ error: "Not found" })),
    });
    await expect(deleteRepo("x")).rejects.toThrow("Not found");
  });

  it("createRepoGroup sends POST", async () => {
    await createRepoGroup("Frontend", "parent1");
    expect(mockFetch).toHaveBeenCalledWith("/api/plugins/repos/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Frontend", parentId: "parent1" }),
    });
  });

  it("createRepoGroup throws on error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: () => Promise.resolve(JSON.stringify({ error: "Duplicate group" })),
    });
    await expect(createRepoGroup("x")).rejects.toThrow("Duplicate group");
  });

  it("updateRepoGroup sends PUT with encoded id", async () => {
    await updateRepoGroup("g/1", { name: "New Name" });
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/plugins/repos/groups/${encodeURIComponent("g/1")}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name" }),
      }
    );
  });

  it("deleteRepoGroup sends DELETE", async () => {
    await deleteRepoGroup("g1");
    expect(mockFetch).toHaveBeenCalledWith(
      `/api/plugins/repos/groups/${encodeURIComponent("g1")}`,
      { method: "DELETE" }
    );
  });

  it("deleteRepoGroup throws on error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve(JSON.stringify({ error: "Group not empty" })),
    });
    await expect(deleteRepoGroup("x")).rejects.toThrow("Group not empty");
  });
});

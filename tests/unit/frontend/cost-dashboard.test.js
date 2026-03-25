// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetchStats = vi.fn();
const mockFetchAccountInfo = vi.fn();
const mockFetchDashboard = vi.fn();

const mock$ = {
  projectSelect: { value: "/test/project" },
  totalCostEl: { textContent: "" },
  projectCostEl: { textContent: "" },
  accountEmail: { textContent: "" },
  accountPlan: { textContent: "" },
  costDashboardModal: {
    classList: { add: vi.fn(), remove: vi.fn() },
    addEventListener: vi.fn(),
  },
  costModalClose: {
    addEventListener: vi.fn(),
  },
};

vi.mock("../../../public/js/core/dom.js", () => ({ $: mock$ }));
vi.mock("../../../public/js/core/utils.js", () => ({
  escapeHtml: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
}));
vi.mock("../../../public/js/core/api.js", () => ({
  fetchStats: (...args) => mockFetchStats(...args),
  fetchAccountInfo: (...args) => mockFetchAccountInfo(...args),
  fetchDashboard: (...args) => mockFetchDashboard(...args),
}));
vi.mock("../../../public/js/ui/commands.js", () => ({
  registerCommand: vi.fn(),
}));

let loadStats, loadAccountInfo, openCostDashboard;
let registerCommand;

beforeEach(async () => {
  vi.resetModules();
  mockFetchStats.mockReset();
  mockFetchAccountInfo.mockReset();
  mockFetchDashboard.mockReset();
  mock$.totalCostEl.textContent = "";
  mock$.projectCostEl.textContent = "";
  mock$.accountEmail.textContent = "";
  mock$.accountPlan.textContent = "";
  mock$.projectSelect.value = "/test/project";
  mock$.costDashboardModal.classList.add.mockClear();
  mock$.costDashboardModal.classList.remove.mockClear();

  // Create DOM elements the module accesses at load time via querySelector/getElementById
  document.body.innerHTML = `
    <div class="term-costs"></div>
    <div id="cost-summary-cards"></div>
    <table><tbody id="cost-table-body"></tbody></table>
    <div id="cost-chart"></div>
    <table class="cost-table"><thead><tr>
      <th data-sort="title">Session</th>
      <th data-sort="turns">Turns</th>
      <th data-sort="tokens">Tokens</th>
      <th data-sort="cost">Cost</th>
    </tr></thead></table>
  `;

  vi.doMock("../../../public/js/core/dom.js", () => ({ $: mock$ }));
  vi.doMock("../../../public/js/core/utils.js", () => ({
    escapeHtml: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  }));
  vi.doMock("../../../public/js/core/api.js", () => ({
    fetchStats: (...args) => mockFetchStats(...args),
    fetchAccountInfo: (...args) => mockFetchAccountInfo(...args),
    fetchDashboard: (...args) => mockFetchDashboard(...args),
  }));
  vi.doMock("../../../public/js/ui/commands.js", () => ({
    registerCommand: vi.fn(),
  }));

  const mod = await import("../../../public/js/features/cost-dashboard.js");
  loadStats = mod.loadStats;
  loadAccountInfo = mod.loadAccountInfo;
  openCostDashboard = mod.openCostDashboard;

  const cmdMod = await import("../../../public/js/ui/commands.js");
  registerCommand = cmdMod.registerCommand;
});

describe("cost-dashboard module", () => {
  it("loads without error", () => {
    expect(true).toBe(true);
  });

  it("registers the 'costs' command at load time", () => {
    expect(registerCommand).toHaveBeenCalledWith("costs", expect.objectContaining({
      category: "app",
      description: "Open cost dashboard",
      execute: expect.any(Function),
    }));
  });
});

describe("loadStats", () => {
  it("sets totalCostEl text from API response", async () => {
    mockFetchStats.mockResolvedValue({ totalCost: 12.34, projectCost: 5.67 });

    await loadStats();

    expect(mock$.totalCostEl.textContent).toBe("$12.34");
  });

  it("sets projectCostEl text from API response", async () => {
    mockFetchStats.mockResolvedValue({ totalCost: 10.00, projectCost: 3.21 });

    await loadStats();

    expect(mock$.projectCostEl.textContent).toBe("$3.21");
  });

  it("sets projectCostEl to $0.00 when projectCost is null", async () => {
    mockFetchStats.mockResolvedValue({ totalCost: 10.00, projectCost: null });

    await loadStats();

    expect(mock$.projectCostEl.textContent).toBe("$0.00");
  });

  it("passes project cwd to fetchStats", async () => {
    mock$.projectSelect.value = "/my/project";
    mockFetchStats.mockResolvedValue({ totalCost: 1.00 });

    await loadStats();

    expect(mockFetchStats).toHaveBeenCalledWith("/my/project");
  });

  it("passes undefined when no project selected", async () => {
    mock$.projectSelect.value = "";
    mockFetchStats.mockResolvedValue({ totalCost: 1.00 });

    await loadStats();

    expect(mockFetchStats).toHaveBeenCalledWith(undefined);
  });

  it("handles fetchStats failure gracefully", async () => {
    mockFetchStats.mockRejectedValue(new Error("Network error"));

    // Should not throw
    await loadStats();

    // textContent unchanged
    expect(mock$.totalCostEl.textContent).toBe("");
  });
});

describe("loadAccountInfo", () => {
  it("sets email text from API response", async () => {
    mockFetchAccountInfo.mockResolvedValue({ email: "user@example.com", plan: "pro" });

    await loadAccountInfo();

    expect(mock$.accountEmail.textContent).toBe("user@example.com");
  });

  it("sets plan text with brackets from API response", async () => {
    mockFetchAccountInfo.mockResolvedValue({ email: "user@example.com", plan: "pro" });

    await loadAccountInfo();

    expect(mock$.accountPlan.textContent).toBe("[pro]");
  });

  it("sets plan to empty when plan is not provided", async () => {
    mockFetchAccountInfo.mockResolvedValue({ email: "user@example.com" });

    await loadAccountInfo();

    expect(mock$.accountEmail.textContent).toBe("user@example.com");
    expect(mock$.accountPlan.textContent).toBe("");
  });

  it("shows --- when no email in response", async () => {
    mockFetchAccountInfo.mockResolvedValue({});

    await loadAccountInfo();

    expect(mock$.accountEmail.textContent).toBe("---");
    expect(mock$.accountPlan.textContent).toBe("");
  });

  it("handles fetchAccountInfo failure gracefully", async () => {
    mockFetchAccountInfo.mockRejectedValue(new Error("Unauthorized"));

    // Should not throw
    await loadAccountInfo();

    expect(mock$.accountEmail.textContent).toBe("");
  });
});

describe("openCostDashboard", () => {
  it("removes hidden class from modal", async () => {
    mockFetchDashboard.mockResolvedValue({
      totalCost: 10,
      projectCost: 5,
      totalTokens: { input_tokens: 1000, output_tokens: 500 },
      timeline: [],
      sessions: [],
    });

    await openCostDashboard();

    expect(mock$.costDashboardModal.classList.remove).toHaveBeenCalledWith("hidden");
  });

  it("calls fetchDashboard with project path", async () => {
    mock$.projectSelect.value = "/my/project";
    mockFetchDashboard.mockResolvedValue({
      totalCost: 10,
      projectCost: 5,
      totalTokens: { input_tokens: 0, output_tokens: 0 },
      timeline: [],
      sessions: [],
    });

    await openCostDashboard();

    expect(mockFetchDashboard).toHaveBeenCalledWith("/my/project");
  });

  it("renders summary cards with cost data", async () => {
    mockFetchDashboard.mockResolvedValue({
      totalCost: 25.50,
      projectCost: 12.75,
      totalTokens: { input_tokens: 50000, output_tokens: 10000 },
      timeline: [],
      sessions: [],
    });

    await openCostDashboard();

    const cards = document.getElementById("cost-summary-cards");
    expect(cards.innerHTML).toContain("$25.50");
    expect(cards.innerHTML).toContain("$12.75");
    expect(cards.innerHTML).toContain("60.0k"); // 50000 + 10000 tokens
  });

  it("renders session rows in table body", async () => {
    mockFetchDashboard.mockResolvedValue({
      totalCost: 10,
      projectCost: 5,
      totalTokens: { input_tokens: 0, output_tokens: 0 },
      timeline: [],
      sessions: [
        { id: "s1", title: "Test Session", turns: 5, input_tokens: 1000, output_tokens: 500, total_cost: 0.1234 },
        { id: "s2", title: "Another Session", turns: 3, input_tokens: 200, output_tokens: 100, total_cost: 0.0567 },
      ],
    });

    await openCostDashboard();

    const tbody = document.getElementById("cost-table-body");
    const rows = tbody.querySelectorAll("tr");
    expect(rows.length).toBe(2);
    expect(rows[0].innerHTML).toContain("Test Session");
    expect(rows[0].innerHTML).toContain("$0.1234");
  });

  it("skips sessions with zero cost", async () => {
    mockFetchDashboard.mockResolvedValue({
      totalCost: 10,
      projectCost: 5,
      totalTokens: { input_tokens: 0, output_tokens: 0 },
      timeline: [],
      sessions: [
        { id: "s1", title: "Has cost", turns: 5, total_cost: 0.05 },
        { id: "s2", title: "No cost", turns: 1, total_cost: 0 },
      ],
    });

    await openCostDashboard();

    const tbody = document.getElementById("cost-table-body");
    const rows = tbody.querySelectorAll("tr");
    expect(rows.length).toBe(1);
    expect(rows[0].innerHTML).toContain("Has cost");
  });

  it("renders timeline chart bars", async () => {
    mockFetchDashboard.mockResolvedValue({
      totalCost: 10,
      projectCost: 5,
      totalTokens: { input_tokens: 0, output_tokens: 0 },
      timeline: [
        { date: "2026-03-20", cost: 2.50 },
        { date: "2026-03-21", cost: 1.25 },
      ],
      sessions: [],
    });

    await openCostDashboard();

    const chart = document.getElementById("cost-chart");
    const rows = chart.querySelectorAll(".cost-chart-row");
    expect(rows.length).toBe(2);
    expect(chart.innerHTML).toContain("$2.50");
    expect(chart.innerHTML).toContain("$1.25");
  });

  it("shows 'No cost data yet' when timeline is empty", async () => {
    mockFetchDashboard.mockResolvedValue({
      totalCost: 0,
      projectCost: 0,
      totalTokens: { input_tokens: 0, output_tokens: 0 },
      timeline: [],
      sessions: [],
    });

    await openCostDashboard();

    const chart = document.getElementById("cost-chart");
    expect(chart.innerHTML).toContain("No cost data yet");
  });

  it("handles fetchDashboard failure gracefully", async () => {
    mockFetchDashboard.mockRejectedValue(new Error("Server error"));

    // Should not throw
    await openCostDashboard();

    expect(mock$.costDashboardModal.classList.remove).toHaveBeenCalledWith("hidden");
  });

  it("formats large token counts with M suffix", async () => {
    mockFetchDashboard.mockResolvedValue({
      totalCost: 10,
      projectCost: 5,
      totalTokens: { input_tokens: 2_500_000, output_tokens: 500_000 },
      timeline: [],
      sessions: [],
    });

    await openCostDashboard();

    const cards = document.getElementById("cost-summary-cards");
    expect(cards.innerHTML).toContain("3.0M");
  });
});

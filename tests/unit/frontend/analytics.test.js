// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetState = vi.fn(() => null);
const mockFetchAnalytics = vi.fn();
const mockFetchProjects = vi.fn();

vi.mock("../../../public/js/core/dom.js", () => ({
  $: {},
}));

vi.mock("../../../public/js/core/utils.js", () => ({
  escapeHtml: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
}));

vi.mock("../../../public/js/core/store.js", () => ({
  getState: (...args) => mockGetState(...args),
}));

vi.mock("../../../public/js/core/api.js", () => ({
  fetchAnalytics: (...args) => mockFetchAnalytics(...args),
  fetchProjects: (...args) => mockFetchProjects(...args),
}));

function makeAnalyticsData(overrides = {}) {
  return {
    overview: {
      totalCost: 0.5,
      sessions: 10,
      queries: 50,
      totalTurns: 100,
      totalOutputTokens: 5000,
      errorRate: 2.5,
      ...overrides.overview,
    },
    dailyBreakdown: overrides.dailyBreakdown || [
      { date: "2026-03-20", cost: 0.25 },
      { date: "2026-03-21", cost: 0.15 },
    ],
    hourlyActivity: overrides.hourlyActivity || [
      { hour: 9, queries: 10, cost: 0.1 },
      { hour: 14, queries: 20, cost: 0.2 },
    ],
    projectBreakdown: overrides.projectBreakdown || [],
    toolUsage: overrides.toolUsage || [],
    topSessions: overrides.topSessions || [],
    sessionDepth: overrides.sessionDepth || [],
    msgLength: overrides.msgLength || [],
    topBashCommands: overrides.topBashCommands || [],
    topFiles: overrides.topFiles || [],
    errorCategories: overrides.errorCategories || null,
    errorTimeline: overrides.errorTimeline || null,
    errorsByTool: overrides.errorsByTool || null,
    recentErrors: overrides.recentErrors || null,
    toolErrors: overrides.toolErrors || null,
  };
}

let loadHomeAnalytics;

beforeEach(async () => {
  vi.resetModules();
  mockGetState.mockReset();
  mockFetchAnalytics.mockReset();
  mockFetchProjects.mockReset();

  // Create DOM elements required at module load time
  document.body.innerHTML = `
    <select id="home-analytics-filter"></select>
    <div id="home-analytics-content"></div>
  `;

  // Re-declare mocks after resetModules
  vi.doMock("../../../public/js/core/dom.js", () => ({ $: {} }));
  vi.doMock("../../../public/js/core/utils.js", () => ({
    escapeHtml: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  }));
  vi.doMock("../../../public/js/core/store.js", () => ({
    getState: (...args) => mockGetState(...args),
  }));
  vi.doMock("../../../public/js/core/api.js", () => ({
    fetchAnalytics: (...args) => mockFetchAnalytics(...args),
    fetchProjects: (...args) => mockFetchProjects(...args),
  }));

  const mod = await import("../../../public/js/features/analytics.js");
  loadHomeAnalytics = mod.loadHomeAnalytics;
});

describe("loadHomeAnalytics", () => {
  it("calls fetchAnalytics and renders output", async () => {
    const data = makeAnalyticsData();
    mockGetState.mockReturnValue(null);
    mockFetchProjects.mockResolvedValue([]);
    mockFetchAnalytics.mockResolvedValue(data);

    await loadHomeAnalytics();

    expect(mockFetchAnalytics).toHaveBeenCalled();
    const content = document.getElementById("home-analytics-content");
    expect(content.innerHTML).not.toBe("");
  });

  it("populates project filter from store data", async () => {
    const projects = [
      { name: "Project A", path: "/path/a" },
      { name: "Project B", path: "/path/b" },
    ];
    mockGetState.mockReturnValue(projects);
    mockFetchAnalytics.mockResolvedValue(makeAnalyticsData());

    await loadHomeAnalytics();

    const filterEl = document.getElementById("home-analytics-filter");
    const options = filterEl.querySelectorAll("option");
    // "All Projects" + 2 project options
    expect(options.length).toBe(3);
    expect(options[0].textContent).toBe("All Projects");
    expect(options[1].textContent).toBe("Project A");
    expect(options[2].textContent).toBe("Project B");
  });

  it("fetches projects from API when store is empty", async () => {
    mockGetState.mockReturnValue(null);
    mockFetchProjects.mockResolvedValue([{ name: "API Project", path: "/api" }]);
    mockFetchAnalytics.mockResolvedValue(makeAnalyticsData());

    await loadHomeAnalytics();

    expect(mockFetchProjects).toHaveBeenCalled();
    const filterEl = document.getElementById("home-analytics-filter");
    const options = filterEl.querySelectorAll("option");
    expect(options.length).toBe(2);
    expect(options[1].textContent).toBe("API Project");
  });

  it("handles fetchProjects failure gracefully", async () => {
    mockGetState.mockReturnValue(null);
    mockFetchProjects.mockRejectedValue(new Error("Network error"));
    mockFetchAnalytics.mockResolvedValue(makeAnalyticsData());

    await loadHomeAnalytics();

    const filterEl = document.getElementById("home-analytics-filter");
    const options = filterEl.querySelectorAll("option");
    // Only "All Projects" option
    expect(options.length).toBe(1);
  });
});

describe("renderAnalytics (indirect via loadHomeAnalytics)", () => {
  it("renders overview cards with formatted cost >= 100", async () => {
    mockGetState.mockReturnValue(null);
    mockFetchProjects.mockResolvedValue([]);
    mockFetchAnalytics.mockResolvedValue(
      makeAnalyticsData({ overview: { totalCost: 150, sessions: 5, queries: 20, totalTurns: 40, totalOutputTokens: 3000, errorRate: 0 } })
    );

    await loadHomeAnalytics();

    const content = document.getElementById("home-analytics-content");
    const cards = content.querySelectorAll(".cost-card-value");
    // formatCost(150) => "$150"
    expect(cards[0].textContent).toBe("$150");
  });

  it("formats cost >= 1 with 2 decimal places", async () => {
    mockGetState.mockReturnValue(null);
    mockFetchProjects.mockResolvedValue([]);
    mockFetchAnalytics.mockResolvedValue(
      makeAnalyticsData({ overview: { totalCost: 5.678, sessions: 1, queries: 1, totalTurns: 1, totalOutputTokens: 1, errorRate: 0 } })
    );

    await loadHomeAnalytics();

    const content = document.getElementById("home-analytics-content");
    const cards = content.querySelectorAll(".cost-card-value");
    expect(cards[0].textContent).toBe("$5.68");
  });

  it("formats cost < 1 with 4 decimal places", async () => {
    mockGetState.mockReturnValue(null);
    mockFetchProjects.mockResolvedValue([]);
    mockFetchAnalytics.mockResolvedValue(
      makeAnalyticsData({ overview: { totalCost: 0.0025, sessions: 1, queries: 1, totalTurns: 1, totalOutputTokens: 1, errorRate: 0 } })
    );

    await loadHomeAnalytics();

    const content = document.getElementById("home-analytics-content");
    const cards = content.querySelectorAll(".cost-card-value");
    expect(cards[0].textContent).toBe("$0.0025");
  });

  it("formats large numbers with 'M' suffix", async () => {
    mockGetState.mockReturnValue(null);
    mockFetchProjects.mockResolvedValue([]);
    mockFetchAnalytics.mockResolvedValue(
      makeAnalyticsData({ overview: { totalCost: 1, sessions: 2_500_000, queries: 1, totalTurns: 1, totalOutputTokens: 1, errorRate: 0 } })
    );

    await loadHomeAnalytics();

    const content = document.getElementById("home-analytics-content");
    const cards = content.querySelectorAll(".cost-card-value");
    // Sessions card (index 1)
    expect(cards[1].textContent).toBe("2.5M");
  });

  it("formats thousands with 'k' suffix", async () => {
    mockGetState.mockReturnValue(null);
    mockFetchProjects.mockResolvedValue([]);
    mockFetchAnalytics.mockResolvedValue(
      makeAnalyticsData({ overview: { totalCost: 1, sessions: 1500, queries: 1, totalTurns: 1, totalOutputTokens: 1, errorRate: 0 } })
    );

    await loadHomeAnalytics();

    const content = document.getElementById("home-analytics-content");
    const cards = content.querySelectorAll(".cost-card-value");
    expect(cards[1].textContent).toBe("1.5k");
  });

  it("formats small numbers as plain strings", async () => {
    mockGetState.mockReturnValue(null);
    mockFetchProjects.mockResolvedValue([]);
    mockFetchAnalytics.mockResolvedValue(
      makeAnalyticsData({ overview: { totalCost: 1, sessions: 42, queries: 1, totalTurns: 1, totalOutputTokens: 1, errorRate: 0 } })
    );

    await loadHomeAnalytics();

    const content = document.getElementById("home-analytics-content");
    const cards = content.querySelectorAll(".cost-card-value");
    expect(cards[1].textContent).toBe("42");
  });

  it("renders daily activity section", async () => {
    mockGetState.mockReturnValue(null);
    mockFetchProjects.mockResolvedValue([]);
    mockFetchAnalytics.mockResolvedValue(makeAnalyticsData());

    await loadHomeAnalytics();

    const content = document.getElementById("home-analytics-content");
    const sections = content.querySelectorAll(".analytics-section h4");
    const titles = Array.from(sections).map((h) => h.textContent);
    expect(titles).toContain("Daily Activity (Last 30 Days)");
    expect(titles).toContain("Activity by Hour");
  });

  it("renders error rate percentage in overview", async () => {
    mockGetState.mockReturnValue(null);
    mockFetchProjects.mockResolvedValue([]);
    mockFetchAnalytics.mockResolvedValue(
      makeAnalyticsData({ overview: { totalCost: 1, sessions: 1, queries: 1, totalTurns: 1, totalOutputTokens: 1, errorRate: 3.5 } })
    );

    await loadHomeAnalytics();

    const content = document.getElementById("home-analytics-content");
    expect(content.innerHTML).toContain("3.5%");
  });

  it("shows error message when fetchAnalytics fails", async () => {
    mockGetState.mockReturnValue(null);
    mockFetchProjects.mockResolvedValue([]);
    mockFetchAnalytics.mockRejectedValue(new Error("Server error"));

    await loadHomeAnalytics();

    const content = document.getElementById("home-analytics-content");
    expect(content.innerHTML).toContain("Failed to load analytics");
    expect(content.innerHTML).toContain("Server error");
  });
});

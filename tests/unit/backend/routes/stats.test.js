import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

// ── Mocks ────────────────────────────────────────────────────────────────────
const { mockExecFile, mockExec } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
  mockExec: vi.fn(),
}));
vi.mock("child_process", () => ({
  execFile: mockExecFile,
  exec: mockExec,
}));

vi.mock("../../../../db.js", () => ({
  getTotalCost: vi.fn(() => 12.5),
  getProjectCost: vi.fn(() => 3.2),
  getSessionCosts: vi.fn(() => []),
  getCostTimeline: vi.fn(() => []),
  getTotalTokens: vi.fn(() => 50000),
  getProjectTokens: vi.fn(() => 10000),
  getAnalyticsOverview: vi.fn(() => ({ totalSessions: 5 })),
  getDailyBreakdown: vi.fn(() => []),
  getHourlyActivity: vi.fn(() => []),
  getProjectBreakdown: vi.fn(() => []),
  getTopSessionsByCost: vi.fn(() => []),
  getToolUsage: vi.fn(() => []),
  getToolErrors: vi.fn(() => []),
  getSessionDepth: vi.fn(() => []),
  getMsgLengthDistribution: vi.fn(() => []),
  getTopBashCommands: vi.fn(() => []),
  getTopFiles: vi.fn(() => []),
  getErrorCategories: vi.fn(() => []),
  getErrorTimeline: vi.fn(() => []),
  getErrorsByTool: vi.fn(() => []),
  getRecentErrors: vi.fn(() => []),
  getModelUsage: vi.fn(() => []),
  getCacheEfficiency: vi.fn(() => ({})),
  getYearlyActivity: vi.fn(() => []),
  getAgentRunsOverview: vi.fn(() => ({})),
  getAgentRunsSummary: vi.fn(() => []),
  getAgentRunsByType: vi.fn(() => []),
  getAgentRunsDaily: vi.fn(() => []),
  getAgentRunsRecent: vi.fn(() => []),
}));

import statsRouter from "../../../../server/routes/stats.js";
import {
  getTotalCost,
  getProjectCost,
  getSessionCosts,
  getCostTimeline,
  getTotalTokens,
  getProjectTokens,
  getAnalyticsOverview,
  getYearlyActivity,
  getDailyBreakdown,
  getHourlyActivity,
  getProjectBreakdown,
  getTopSessionsByCost,
  getToolUsage,
  getToolErrors,
  getSessionDepth,
  getMsgLengthDistribution,
  getTopBashCommands,
  getTopFiles,
  getErrorCategories,
  getErrorTimeline,
  getErrorsByTool,
  getRecentErrors,
  getModelUsage,
  getCacheEfficiency,
  getAgentRunsOverview,
  getAgentRunsSummary,
  getAgentRunsByType,
  getAgentRunsDaily,
  getAgentRunsRecent,
} from "../../../../db.js";

// ── App setup ────────────────────────────────────────────────────────────────
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/stats", statsRouter);
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("stats routes", () => {
  let app;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset any mockImplementation overrides from error tests
    getAgentRunsOverview.mockReturnValue({});
    getAgentRunsSummary.mockReturnValue([]);
    getAgentRunsByType.mockReturnValue([]);
    getAgentRunsDaily.mockReturnValue([]);
    getAgentRunsRecent.mockReturnValue([]);
    app = buildApp();
  });

  // ── GET / ──────────────────────────────────────────────────────────────
  describe("GET /stats", () => {
    it("returns total cost stats", async () => {
      getTotalCost.mockReturnValue(25.0);

      const res = await request(app).get("/stats");

      expect(res.status).toBe(200);
      expect(res.body.totalCost).toBe(25.0);
      expect(res.body.projectCost).toBeNull();
      expect(getTotalCost).toHaveBeenCalled();
    });

    it("includes project cost when project_path is given", async () => {
      getTotalCost.mockReturnValue(25.0);
      getProjectCost.mockReturnValue(8.5);

      const res = await request(app).get("/stats?project_path=/my/proj");

      expect(res.status).toBe(200);
      expect(res.body.totalCost).toBe(25.0);
      expect(res.body.projectCost).toBe(8.5);
      expect(getProjectCost).toHaveBeenCalledWith("/my/proj");
    });

    it("returns 500 on database error", async () => {
      getTotalCost.mockImplementation(() => {
        throw new Error("DB down");
      });

      const res = await request(app).get("/stats");
      expect(res.status).toBe(500);
      expect(res.body.error).toBe("DB down");
    });
  });

  // ── GET /home ──────────────────────────────────────────────────────────
  describe("GET /stats/home", () => {
    it("returns home page stats with yearly activity and overview", async () => {
      const mockActivity = [{ date: "2026-01-01", count: 5 }];
      const mockOverview = { totalSessions: 10, totalCost: 5.0 };
      getYearlyActivity.mockReturnValue(mockActivity);
      getAnalyticsOverview.mockReturnValue(mockOverview);

      const res = await request(app).get("/stats/home");

      expect(res.status).toBe(200);
      expect(res.body.yearlyActivity).toEqual(mockActivity);
      expect(res.body.overview).toEqual(mockOverview);
      expect(getYearlyActivity).toHaveBeenCalled();
      expect(getAnalyticsOverview).toHaveBeenCalledWith();
    });

    it("returns 500 on error", async () => {
      getYearlyActivity.mockImplementation(() => {
        throw new Error("Activity error");
      });

      const res = await request(app).get("/stats/home");
      expect(res.status).toBe(500);
    });
  });

  // ── GET /dashboard ─────────────────────────────────────────────────────
  describe("GET /stats/dashboard", () => {
    it("returns dashboard data without project filter", async () => {
      getSessionCosts.mockReturnValue([{ id: "s1", cost: 1 }]);
      getCostTimeline.mockReturnValue([{ date: "2026-01", cost: 2 }]);
      getTotalCost.mockReturnValue(100);
      getTotalTokens.mockReturnValue(500000);

      const res = await request(app).get("/stats/dashboard");

      expect(res.status).toBe(200);
      expect(res.body.sessions).toEqual([{ id: "s1", cost: 1 }]);
      expect(res.body.timeline).toEqual([{ date: "2026-01", cost: 2 }]);
      expect(res.body.totalCost).toBe(100);
      expect(res.body.totalTokens).toBe(500000);
      expect(res.body.projectCost).toBeNull();
      expect(res.body.projectTokens).toBeNull();
    });

    it("includes project-specific costs when project_path is given", async () => {
      getSessionCosts.mockReturnValue([]);
      getCostTimeline.mockReturnValue([]);
      getTotalCost.mockReturnValue(100);
      getProjectCost.mockReturnValue(30);
      getTotalTokens.mockReturnValue(500000);
      getProjectTokens.mockReturnValue(150000);

      const res = await request(app).get(
        "/stats/dashboard?project_path=/my/proj",
      );

      expect(res.status).toBe(200);
      expect(res.body.projectCost).toBe(30);
      expect(res.body.projectTokens).toBe(150000);
      expect(getProjectCost).toHaveBeenCalledWith("/my/proj");
      expect(getProjectTokens).toHaveBeenCalledWith("/my/proj");
      expect(getSessionCosts).toHaveBeenCalledWith("/my/proj");
      expect(getCostTimeline).toHaveBeenCalledWith("/my/proj");
    });

    it("returns 500 on error", async () => {
      getSessionCosts.mockImplementation(() => {
        throw new Error("Dashboard error");
      });

      const res = await request(app).get("/stats/dashboard");
      expect(res.status).toBe(500);
    });
  });

  // ── GET /analytics ─────────────────────────────────────────────────────
  describe("GET /stats/analytics", () => {
    it("returns full analytics payload", async () => {
      const res = await request(app).get("/stats/analytics");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("overview");
      expect(res.body).toHaveProperty("dailyBreakdown");
      expect(res.body).toHaveProperty("hourlyActivity");
      expect(res.body).toHaveProperty("projectBreakdown");
      expect(res.body).toHaveProperty("topSessions");
      expect(res.body).toHaveProperty("toolUsage");
      expect(res.body).toHaveProperty("toolErrors");
      expect(res.body).toHaveProperty("sessionDepth");
      expect(res.body).toHaveProperty("msgLength");
      expect(res.body).toHaveProperty("topBashCommands");
      expect(res.body).toHaveProperty("topFiles");
      expect(res.body).toHaveProperty("errorCategories");
      expect(res.body).toHaveProperty("errorTimeline");
      expect(res.body).toHaveProperty("errorsByTool");
      expect(res.body).toHaveProperty("recentErrors");
      expect(res.body).toHaveProperty("modelUsage");
      expect(res.body).toHaveProperty("cacheEfficiency");

      expect(getAnalyticsOverview).toHaveBeenCalled();
      expect(getDailyBreakdown).toHaveBeenCalled();
    });

    it("passes project_path to analytics queries", async () => {
      await request(app).get("/stats/analytics?project_path=/proj");

      expect(getAnalyticsOverview).toHaveBeenCalledWith("/proj");
      expect(getDailyBreakdown).toHaveBeenCalledWith("/proj");
      expect(getHourlyActivity).toHaveBeenCalledWith("/proj");
      expect(getTopSessionsByCost).toHaveBeenCalledWith("/proj");
      expect(getToolUsage).toHaveBeenCalledWith("/proj");
    });

    it("passes project_path to ALL 16+ analytics queries", async () => {
      await request(app).get("/stats/analytics?project_path=/my/project");

      expect(getAnalyticsOverview).toHaveBeenCalledWith("/my/project");
      expect(getDailyBreakdown).toHaveBeenCalledWith("/my/project");
      expect(getHourlyActivity).toHaveBeenCalledWith("/my/project");
      expect(getProjectBreakdown).toHaveBeenCalledWith();
      expect(getTopSessionsByCost).toHaveBeenCalledWith("/my/project");
      expect(getToolUsage).toHaveBeenCalledWith("/my/project");
      expect(getToolErrors).toHaveBeenCalledWith("/my/project");
      expect(getSessionDepth).toHaveBeenCalledWith("/my/project");
      expect(getMsgLengthDistribution).toHaveBeenCalledWith("/my/project");
      expect(getTopBashCommands).toHaveBeenCalledWith("/my/project");
      expect(getTopFiles).toHaveBeenCalledWith("/my/project");
      expect(getErrorCategories).toHaveBeenCalledWith("/my/project");
      expect(getErrorTimeline).toHaveBeenCalledWith("/my/project");
      expect(getErrorsByTool).toHaveBeenCalledWith("/my/project");
      expect(getRecentErrors).toHaveBeenCalledWith("/my/project");
      expect(getModelUsage).toHaveBeenCalledWith("/my/project");
      expect(getCacheEfficiency).toHaveBeenCalledWith("/my/project");
    });

    it("calls analytics queries with undefined when no project_path", async () => {
      await request(app).get("/stats/analytics");

      // project_path || undefined => undefined
      expect(getAnalyticsOverview).toHaveBeenCalledWith(undefined);
      expect(getDailyBreakdown).toHaveBeenCalledWith(undefined);
      expect(getToolErrors).toHaveBeenCalledWith(undefined);
      expect(getSessionDepth).toHaveBeenCalledWith(undefined);
      expect(getMsgLengthDistribution).toHaveBeenCalledWith(undefined);
      expect(getTopBashCommands).toHaveBeenCalledWith(undefined);
      expect(getTopFiles).toHaveBeenCalledWith(undefined);
      expect(getErrorCategories).toHaveBeenCalledWith(undefined);
      expect(getErrorTimeline).toHaveBeenCalledWith(undefined);
      expect(getErrorsByTool).toHaveBeenCalledWith(undefined);
      expect(getRecentErrors).toHaveBeenCalledWith(undefined);
      expect(getModelUsage).toHaveBeenCalledWith(undefined);
      expect(getCacheEfficiency).toHaveBeenCalledWith(undefined);
    });

    it("returns actual mock data from each analytics function", async () => {
      getAnalyticsOverview.mockReturnValue({ totalSessions: 50, totalCost: 12.5 });
      getDailyBreakdown.mockReturnValue([{ date: "2026-01-01", cost: 1.5 }]);
      getHourlyActivity.mockReturnValue([{ hour: 10, count: 5 }]);
      getProjectBreakdown.mockReturnValue([{ project: "A", cost: 2 }]);
      getTopSessionsByCost.mockReturnValue([{ id: "s1", cost: 5 }]);
      getToolUsage.mockReturnValue([{ tool: "Bash", count: 100 }]);
      getToolErrors.mockReturnValue([{ tool: "Bash", errors: 3 }]);
      getSessionDepth.mockReturnValue([{ depth: 5, count: 2 }]);
      getMsgLengthDistribution.mockReturnValue([{ bucket: "short", count: 10 }]);
      getTopBashCommands.mockReturnValue([{ command: "ls", count: 50 }]);
      getTopFiles.mockReturnValue([{ file: "main.js", count: 20 }]);
      getErrorCategories.mockReturnValue([{ category: "timeout", count: 1 }]);
      getErrorTimeline.mockReturnValue([{ date: "2026-01-01", count: 1 }]);
      getErrorsByTool.mockReturnValue([{ tool: "Bash", count: 2 }]);
      getRecentErrors.mockReturnValue([{ error: "timeout", ts: "2026-01-01" }]);
      getModelUsage.mockReturnValue([{ model: "sonnet", count: 30 }]);
      getCacheEfficiency.mockReturnValue({ hitRate: 0.85 });

      const res = await request(app).get("/stats/analytics");

      expect(res.status).toBe(200);
      expect(res.body.overview).toEqual({ totalSessions: 50, totalCost: 12.5 });
      expect(res.body.dailyBreakdown).toEqual([{ date: "2026-01-01", cost: 1.5 }]);
      expect(res.body.hourlyActivity).toEqual([{ hour: 10, count: 5 }]);
      expect(res.body.projectBreakdown).toEqual([{ project: "A", cost: 2 }]);
      expect(res.body.topSessions).toEqual([{ id: "s1", cost: 5 }]);
      expect(res.body.toolUsage).toEqual([{ tool: "Bash", count: 100 }]);
      expect(res.body.toolErrors).toEqual([{ tool: "Bash", errors: 3 }]);
      expect(res.body.sessionDepth).toEqual([{ depth: 5, count: 2 }]);
      expect(res.body.msgLength).toEqual([{ bucket: "short", count: 10 }]);
      expect(res.body.topBashCommands).toEqual([{ command: "ls", count: 50 }]);
      expect(res.body.topFiles).toEqual([{ file: "main.js", count: 20 }]);
      expect(res.body.errorCategories).toEqual([{ category: "timeout", count: 1 }]);
      expect(res.body.errorTimeline).toEqual([{ date: "2026-01-01", count: 1 }]);
      expect(res.body.errorsByTool).toEqual([{ tool: "Bash", count: 2 }]);
      expect(res.body.recentErrors).toEqual([{ error: "timeout", ts: "2026-01-01" }]);
      expect(res.body.modelUsage).toEqual([{ model: "sonnet", count: 30 }]);
      expect(res.body.cacheEfficiency).toEqual({ hitRate: 0.85 });
    });

    it("returns 500 on analytics error", async () => {
      getAnalyticsOverview.mockImplementation(() => {
        throw new Error("Analytics query failed");
      });

      const res = await request(app).get("/stats/analytics");
      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Analytics query failed");
    });
  });

  // ── GET /agent-metrics ─────────────────────────────────────────────────
  describe("GET /stats/agent-metrics", () => {
    it("returns agent monitoring data", async () => {
      getAgentRunsOverview.mockReturnValue({ totalRuns: 10 });
      getAgentRunsSummary.mockReturnValue([{ agentId: "a1", runs: 5 }]);
      getAgentRunsByType.mockReturnValue([{ type: "single", count: 8 }]);
      getAgentRunsDaily.mockReturnValue([{ date: "2026-03-01", count: 3 }]);
      getAgentRunsRecent.mockReturnValue([{ id: "run1" }]);

      const res = await request(app).get("/stats/agent-metrics");

      expect(res.status).toBe(200);
      expect(res.body.overview).toEqual({ totalRuns: 10 });
      expect(res.body.agents).toEqual([{ agentId: "a1", runs: 5 }]);
      expect(res.body.byType).toEqual([{ type: "single", count: 8 }]);
      expect(res.body.daily).toEqual([{ date: "2026-03-01", count: 3 }]);
      expect(res.body.recent).toEqual([{ id: "run1" }]);
      expect(getAgentRunsRecent).toHaveBeenCalledWith(30);
    });

    it("returns 500 on error", async () => {
      getAgentRunsOverview.mockImplementation(() => {
        throw new Error("Agent metrics error");
      });

      const res = await request(app).get("/stats/agent-metrics");
      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Agent metrics error");
    });

    it("calls all agent metric sub-queries", async () => {
      await request(app).get("/stats/agent-metrics");

      expect(getAgentRunsOverview).toHaveBeenCalledWith();
      expect(getAgentRunsSummary).toHaveBeenCalledWith();
      expect(getAgentRunsByType).toHaveBeenCalledWith();
      expect(getAgentRunsDaily).toHaveBeenCalledWith();
      expect(getAgentRunsRecent).toHaveBeenCalledWith(30);
    });
  });

  // ── GET /dashboard — edge cases ─────────────────────────────────────
  describe("GET /stats/dashboard — edge cases", () => {
    it("converts empty project_path query to undefined", async () => {
      getSessionCosts.mockReturnValue([]);
      getCostTimeline.mockReturnValue([]);
      getTotalCost.mockReturnValue(0);
      getTotalTokens.mockReturnValue(0);

      const res = await request(app).get("/stats/dashboard");

      expect(res.status).toBe(200);
      // project_path || undefined => getSessionCosts called with undefined
      expect(getSessionCosts).toHaveBeenCalledWith(undefined);
      expect(getCostTimeline).toHaveBeenCalledWith(undefined);
      // projectCost and projectTokens are null when no project_path
      expect(res.body.projectCost).toBeNull();
      expect(res.body.projectTokens).toBeNull();
      expect(getProjectCost).not.toHaveBeenCalled();
      expect(getProjectTokens).not.toHaveBeenCalled();
    });

    it("returns all six fields in dashboard response", async () => {
      getSessionCosts.mockReturnValue([{ id: "s1" }]);
      getCostTimeline.mockReturnValue([{ date: "2026-03" }]);
      getTotalCost.mockReturnValue(42);
      getProjectCost.mockReturnValue(10);
      getTotalTokens.mockReturnValue(99999);
      getProjectTokens.mockReturnValue(5000);

      const res = await request(app).get("/stats/dashboard?project_path=/proj");

      expect(res.status).toBe(200);
      expect(Object.keys(res.body)).toEqual(
        expect.arrayContaining(["sessions", "timeline", "totalCost", "projectCost", "totalTokens", "projectTokens"]),
      );
      expect(res.body.sessions).toEqual([{ id: "s1" }]);
      expect(res.body.timeline).toEqual([{ date: "2026-03" }]);
      expect(res.body.totalCost).toBe(42);
      expect(res.body.projectCost).toBe(10);
      expect(res.body.totalTokens).toBe(99999);
      expect(res.body.projectTokens).toBe(5000);
    });
  });

  // ── GET /home — edge cases ──────────────────────────────────────────
  describe("GET /stats/home — edge cases", () => {
    it("returns both yearlyActivity and overview fields", async () => {
      getYearlyActivity.mockReturnValue([]);
      getAnalyticsOverview.mockReturnValue({});

      const res = await request(app).get("/stats/home");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("yearlyActivity");
      expect(res.body).toHaveProperty("overview");
      expect(Object.keys(res.body)).toHaveLength(2);
    });

    it("returns 500 with error message when getAnalyticsOverview throws", async () => {
      getYearlyActivity.mockReturnValue([]);
      getAnalyticsOverview.mockImplementation(() => {
        throw new Error("Overview error");
      });

      const res = await request(app).get("/stats/home");
      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Overview error");
    });
  });

  // ── GET / — edge cases ──────────────────────────────────────────────
  describe("GET /stats — edge cases", () => {
    it("does not call getProjectCost when project_path is absent", async () => {
      getTotalCost.mockReturnValue(10);

      await request(app).get("/stats");

      expect(getProjectCost).not.toHaveBeenCalled();
    });

    it("returns 500 when getProjectCost throws", async () => {
      getTotalCost.mockReturnValue(10);
      getProjectCost.mockImplementation(() => {
        throw new Error("Project cost error");
      });

      const res = await request(app).get("/stats?project_path=/bad");
      expect(res.status).toBe(500);
      expect(res.body.error).toBe("Project cost error");
    });
  });

  // ── GET /account ───────────────────────────────────────────────────
  describe("GET /stats/account", () => {
    it("returns account info from execFile (non-Windows)", async () => {
      // execFile is called on non-win32; the mock should invoke the callback
      mockExecFile.mockImplementation((bin, args, opts, cb) => {
        cb(null, JSON.stringify({ email: "user@example.com", subscriptionType: "pro" }), "");
      });

      const res = await request(app).get("/stats/account");

      expect(res.status).toBe(200);
      expect(res.body.email).toBe("user@example.com");
      expect(res.body.plan).toBe("pro");
    });

    it("returns cached account info on second call without invoking execFile again", async () => {
      // The previous test populated the module-level cache
      mockExecFile.mockClear();

      const res = await request(app).get("/stats/account");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("email");
      expect(res.body).toHaveProperty("plan");
      expect(mockExecFile).not.toHaveBeenCalled();
    });
  });
});

// ── /account endpoint — fresh module imports for error & edge-case paths ──
// The /account route caches its result in a module-level variable that
// cannot be reset. Each describe below re-imports the router module so
// that cachedAccountInfo starts as null.

describe("stats /account — execFile error path", () => {
  let app;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Re-register the hoisted child_process mock after resetModules
    vi.doMock("child_process", () => ({
      execFile: mockExecFile,
      exec: mockExec,
    }));

    const { default: freshRouter } = await import("../../../../server/routes/stats.js");
    app = express();
    app.use(express.json());
    app.use("/stats", freshRouter);
  });

  it("returns { email: null, plan: null } when execFile errors", async () => {
    mockExecFile.mockImplementation((bin, args, opts, cb) => {
      cb(new Error("Command failed"), "", "");
    });

    const res = await request(app).get("/stats/account");

    expect(res.status).toBe(200);
    expect(res.body.email).toBeNull();
    expect(res.body.plan).toBeNull();
  });
});

describe("stats /account — non-JSON stdout", () => {
  let app;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    vi.doMock("child_process", () => ({
      execFile: mockExecFile,
      exec: mockExec,
    }));

    const { default: freshRouter } = await import("../../../../server/routes/stats.js");
    app = express();
    app.use(express.json());
    app.use("/stats", freshRouter);
  });

  it("handles non-JSON stdout by returning email/plan as null with raw output", async () => {
    mockExecFile.mockImplementation((bin, args, opts, cb) => {
      cb(null, "Logged in as user@example.com on Pro plan", "");
    });

    const res = await request(app).get("/stats/account");

    expect(res.status).toBe(200);
    // Non-JSON path: email and subscriptionType are extracted as null
    expect(res.body.email).toBeNull();
    expect(res.body.plan).toBeNull();
  });
});

// ── Windows-specific branches in findClaudeBinary & /account ──────────────
// These tests mock process.platform to "win32" before importing the module
// so that the Windows code paths execute at module load time.

describe("stats — Windows platform branches", () => {
  let app;
  let originalPlatform;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Mock process.platform to "win32" — must be done before module import
    originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", writable: true });

    vi.doMock("child_process", () => ({
      execFile: mockExecFile,
      exec: mockExec,
    }));

    // Mock existsSync to return false for all candidates so fallback path is hit
    vi.doMock("fs", () => ({
      existsSync: vi.fn(() => false),
    }));

    const { default: freshRouter } = await import("../../../../server/routes/stats.js");
    app = express();
    app.use(express.json());
    app.use("/stats", freshRouter);
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, writable: true });
  });

  it("uses exec with shell on Windows for /account", async () => {
    mockExec.mockImplementation((cmd, opts, cb) => {
      cb(null, JSON.stringify({ email: "win@example.com", subscriptionType: "team" }), "");
    });

    const res = await request(app).get("/stats/account");

    expect(res.status).toBe(200);
    expect(res.body.email).toBe("win@example.com");
    expect(res.body.plan).toBe("team");
    // On Windows, exec (not execFile) should be called
    expect(mockExec).toHaveBeenCalled();
    expect(mockExecFile).not.toHaveBeenCalled();
  });
});

describe("stats — Windows findClaudeBinary with existing binary", () => {
  let app;
  let originalPlatform;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", writable: true });

    vi.doMock("child_process", () => ({
      execFile: mockExecFile,
      exec: mockExec,
    }));

    // Mock existsSync to return true for the first Windows candidate
    vi.doMock("fs", () => ({
      existsSync: vi.fn((p) => p.includes("AppData") && p.endsWith("claude.exe")),
    }));

    const { default: freshRouter } = await import("../../../../server/routes/stats.js");
    app = express();
    app.use(express.json());
    app.use("/stats", freshRouter);
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, writable: true });
  });

  it("finds Windows binary in AppData and uses it with exec", async () => {
    mockExec.mockImplementation((cmd, opts, cb) => {
      // The cmd should contain the Windows binary path
      expect(cmd).toContain("claude.exe");
      cb(null, JSON.stringify({ email: "found@example.com", subscriptionType: "pro" }), "");
    });

    const res = await request(app).get("/stats/account");

    expect(res.status).toBe(200);
    expect(res.body.email).toBe("found@example.com");
    expect(mockExec).toHaveBeenCalled();
  });
});

describe("stats — findClaudeBinary fallback to PATH", () => {
  let app;
  let originalPlatform;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    originalPlatform = process.platform;
    // Use a non-Windows platform to avoid Windows branches,
    // but mock existsSync to always return false so it falls through to the fallback
    Object.defineProperty(process, "platform", { value: "linux", writable: true });

    vi.doMock("child_process", () => ({
      execFile: mockExecFile,
      exec: mockExec,
    }));

    vi.doMock("fs", () => ({
      existsSync: vi.fn(() => false),
    }));

    const { default: freshRouter } = await import("../../../../server/routes/stats.js");
    app = express();
    app.use(express.json());
    app.use("/stats", freshRouter);
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform, writable: true });
  });

  it("falls back to 'claude' in PATH when no candidate binary exists", async () => {
    mockExecFile.mockImplementation((bin, args, opts, cb) => {
      // The binary should be the fallback "claude"
      expect(bin).toBe("claude");
      cb(null, JSON.stringify({ email: "path@example.com", subscriptionType: "free" }), "");
    });

    const res = await request(app).get("/stats/account");

    expect(res.status).toBe(200);
    expect(res.body.email).toBe("path@example.com");
    expect(mockExecFile).toHaveBeenCalled();
  });
});

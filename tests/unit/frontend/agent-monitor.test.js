// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetchAgentMetrics = vi.fn();

vi.mock("../../../public/js/core/dom.js", () => ({
  $: {
    agentMonitorModal: {
      classList: { add: vi.fn(), remove: vi.fn() },
      addEventListener: vi.fn(),
    },
    agentMonitorClose: {
      addEventListener: vi.fn(),
    },
    agentMonitorContent: {
      innerHTML: "",
    },
  },
}));

vi.mock("../../../public/js/core/utils.js", () => ({
  escapeHtml: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
}));

vi.mock("../../../public/js/core/api.js", () => ({
  fetchAgentMetrics: (...args) => mockFetchAgentMetrics(...args),
}));

vi.mock("../../../public/js/ui/commands.js", () => ({
  registerCommand: vi.fn(),
}));

import { openAgentMonitor } from "../../../public/js/features/agent-monitor.js";
import { $ } from "../../../public/js/core/dom.js";
import { registerCommand } from "../../../public/js/ui/commands.js";

beforeEach(() => {
  mockFetchAgentMetrics.mockReset();
  $.agentMonitorModal.classList.add.mockClear();
  $.agentMonitorModal.classList.remove.mockClear();
  $.agentMonitorContent.innerHTML = "";
});

describe("agent-monitor module", () => {
  it("loads without error", () => {
    // If we got here, the module loaded successfully
    expect(true).toBe(true);
  });

  it("exports openAgentMonitor as a function", () => {
    expect(typeof openAgentMonitor).toBe("function");
  });

  it("registers the 'monitor' command at load time", () => {
    expect(registerCommand).toHaveBeenCalledWith("monitor", expect.objectContaining({
      category: "agent",
      description: "Open multi-agent monitoring dashboard",
      execute: expect.any(Function),
    }));
  });
});

describe("openAgentMonitor", () => {
  it("removes hidden class from modal", async () => {
    mockFetchAgentMetrics.mockResolvedValue({
      overview: {},
      agents: [],
      byType: [],
      daily: [],
      recent: [],
    });

    await openAgentMonitor();

    expect($.agentMonitorModal.classList.remove).toHaveBeenCalledWith("hidden");
  });

  it("calls fetchAgentMetrics", async () => {
    mockFetchAgentMetrics.mockResolvedValue({
      overview: {},
      agents: [],
      byType: [],
      daily: [],
      recent: [],
    });

    await openAgentMonitor();

    expect(mockFetchAgentMetrics).toHaveBeenCalled();
  });

  it("renders summary cards from metrics data", async () => {
    mockFetchAgentMetrics.mockResolvedValue({
      overview: {
        total_runs: 25,
        total_cost: 3.50,
        avg_duration: 45000,
        completed: 20,
        avg_turns: 8,
        total_input_tokens: 50000,
        total_output_tokens: 10000,
      },
      agents: [],
      byType: [],
      daily: [],
      recent: [],
    });

    await openAgentMonitor();

    const html = $.agentMonitorContent.innerHTML;
    expect(html).toContain("25"); // total_runs
    expect(html).toContain("$3.50"); // total_cost formatted
    expect(html).toContain("45s"); // avg_duration formatted
    expect(html).toContain("80%"); // success rate (20/25 = 80%)
  });

  it("renders agent leaderboard when agents present", async () => {
    mockFetchAgentMetrics.mockResolvedValue({
      overview: { total_runs: 10, total_cost: 1, avg_duration: 1000, completed: 8, avg_turns: 5, total_input_tokens: 0, total_output_tokens: 0 },
      agents: [
        { agent_title: "Code Agent", runs: 5, successes: 4, avg_duration: 2000, avg_cost: 0.5, total_cost: 2.5, avg_turns: 3 },
      ],
      byType: [],
      daily: [],
      recent: [],
    });

    await openAgentMonitor();

    const html = $.agentMonitorContent.innerHTML;
    expect(html).toContain("Agent Leaderboard");
    expect(html).toContain("Code Agent");
  });

  it("renders empty message when no agents or recent runs", async () => {
    mockFetchAgentMetrics.mockResolvedValue({
      overview: {},
      agents: [],
      byType: [],
      daily: [],
      recent: [],
    });

    await openAgentMonitor();

    const html = $.agentMonitorContent.innerHTML;
    expect(html).toContain("No agent runs recorded yet");
  });

  it("handles fetchAgentMetrics failure", async () => {
    mockFetchAgentMetrics.mockRejectedValue(new Error("Network error"));

    await openAgentMonitor();

    expect($.agentMonitorContent.innerHTML).toContain("Failed to load metrics");
  });

  it("renders recent runs when present", async () => {
    mockFetchAgentMetrics.mockResolvedValue({
      overview: { total_runs: 1, total_cost: 0.1, avg_duration: 5000, completed: 1, avg_turns: 2, total_input_tokens: 0, total_output_tokens: 0 },
      agents: [],
      byType: [],
      daily: [],
      recent: [
        {
          agent_title: "Test Agent",
          run_type: "single",
          status: "completed",
          duration_ms: 3000,
          cost_usd: 0.05,
          started_at: 1711234567,
        },
      ],
    });

    await openAgentMonitor();

    const html = $.agentMonitorContent.innerHTML;
    expect(html).toContain("Recent Runs");
    expect(html).toContain("Test Agent");
    expect(html).toContain("completed");
    expect(html).toContain("3s"); // formatDuration(3000)
    expect(html).toContain("$0.05"); // formatCost(0.05)
  });

  it("renders run type breakdown when present", async () => {
    mockFetchAgentMetrics.mockResolvedValue({
      overview: { total_runs: 5, total_cost: 1, avg_duration: 1000, completed: 5, avg_turns: 3, total_input_tokens: 0, total_output_tokens: 0 },
      agents: [],
      byType: [
        { run_type: "chain", runs: 3, cost: 0.75 },
        { run_type: "single", runs: 2, cost: 0.25 },
      ],
      daily: [],
      recent: [],
    });

    await openAgentMonitor();

    const html = $.agentMonitorContent.innerHTML;
    expect(html).toContain("By Run Type");
    expect(html).toContain("chain");
    expect(html).toContain("3 runs");
  });

  it("formats duration with minutes and seconds", async () => {
    mockFetchAgentMetrics.mockResolvedValue({
      overview: { total_runs: 1, total_cost: 0, avg_duration: 125000, completed: 1, avg_turns: 1, total_input_tokens: 0, total_output_tokens: 0 },
      agents: [],
      byType: [],
      daily: [],
      recent: [],
    });

    await openAgentMonitor();

    const html = $.agentMonitorContent.innerHTML;
    // 125000ms = 125s = 2m 5s
    expect(html).toContain("2m 5s");
  });

  it("formats tokens with k suffix", async () => {
    mockFetchAgentMetrics.mockResolvedValue({
      overview: { total_runs: 1, total_cost: 0, avg_duration: 0, completed: 1, avg_turns: 1, total_input_tokens: 5000, total_output_tokens: 3000 },
      agents: [],
      byType: [],
      daily: [],
      recent: [],
    });

    await openAgentMonitor();

    const html = $.agentMonitorContent.innerHTML;
    // 5000 + 3000 = 8000 => "8.0k"
    expect(html).toContain("8.0k");
  });
});

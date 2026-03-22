import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs/promises
vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// Mock server/paths.js
vi.mock("../../../server/paths.js", () => ({
  configPath: vi.fn((name) => `/mock/config/${name}`),
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { readFile, writeFile } from "fs/promises";

// We need to reimport the module fresh each time because it has module-level state
let mod;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();

  // Default: readFile throws (no config file)
  const { readFile: rf, writeFile: wf } = await import("fs/promises");
  rf.mockRejectedValue(new Error("ENOENT"));
  wf.mockResolvedValue(undefined);

  mod = await import("../../../server/telegram-sender.js");
});

describe("isEnabled", () => {
  it("returns false when config is default (disabled)", () => {
    expect(mod.isEnabled()).toBe(false);
  });

  it("returns false when enabled but no token", async () => {
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({ enabled: true, botToken: "", chatId: "123" }));
    await mod.initTelegramSender();
    expect(mod.isEnabled()).toBe(false);
  });

  it("returns false when enabled but no chatId", async () => {
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({ enabled: true, botToken: "tok", chatId: "" }));
    await mod.initTelegramSender();
    expect(mod.isEnabled()).toBe(false);
  });

  it("returns true when enabled with token and chatId", async () => {
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({ enabled: true, botToken: "123:ABCDEF", chatId: "999" }));
    await mod.initTelegramSender();
    expect(mod.isEnabled()).toBe(true);
  });
});

describe("getTelegramConfig", () => {
  it("masks the bot token", async () => {
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({ enabled: true, botToken: "123456:ABCDEFGHIJKLMN", chatId: "999" }));
    await mod.initTelegramSender();

    const cfg = mod.getTelegramConfig();
    expect(cfg.botToken).toBe("****:IJKLMN");
    expect(cfg.botToken).not.toContain("123456");
  });

  it("returns empty string when no token set", () => {
    const cfg = mod.getTelegramConfig();
    expect(cfg.botToken).toBe("");
  });

  it("returns chatId and afkTimeoutMinutes", async () => {
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({ enabled: true, botToken: "tok12345", chatId: "42", afkTimeoutMinutes: 30 }));
    await mod.initTelegramSender();

    const cfg = mod.getTelegramConfig();
    expect(cfg.chatId).toBe("42");
    expect(cfg.afkTimeoutMinutes).toBe(30);
  });
});

describe("sendTelegramNotification", () => {
  it("returns early when disabled", async () => {
    await mod.sendTelegramNotification("session", "Title", "Body");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("respects notify preferences (sessionComplete = false)", async () => {
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({
      enabled: true, botToken: "123:ABCDEF", chatId: "999",
      notify: { sessionComplete: false },
    }));
    await mod.initTelegramSender();

    await mod.sendTelegramNotification("session", "Session Done", "Body");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends notification when enabled and preference is true", async () => {
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({
      enabled: true, botToken: "123:ABCDEF", chatId: "999",
      notify: { sessionComplete: true },
    }));
    await mod.initTelegramSender();

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }),
    });

    await mod.sendTelegramNotification("session", "Session Done", "All tasks completed");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("sendMessage");
    const body = JSON.parse(opts.body);
    expect(body.chat_id).toBe("999");
    expect(body.parse_mode).toBe("HTML");
  });

  it("formats metrics correctly in the message", async () => {
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({
      enabled: true, botToken: "123:ABCDEF", chatId: "999",
    }));
    await mod.initTelegramSender();

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: {} }),
    });

    await mod.sendTelegramNotification("session", "Title", "Body", {
      durationMs: 65000,
      costUsd: 0.15,
      inputTokens: 1500,
      outputTokens: 2500000,
      model: "claude-sonnet",
      turns: 5,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.text).toContain("1m 5s");
    expect(body.text).toContain("$0.15");
    expect(body.text).toContain("1.5K");
    expect(body.text).toContain("2.5M");
    expect(body.text).toContain("claude-sonnet");
    expect(body.text).toContain("5 turns");
  });
});

describe("sendPermissionRequest", () => {
  it("sends inline keyboard with approve/deny buttons", async () => {
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({
      enabled: true, botToken: "123:ABCDEF", chatId: "999",
    }));
    await mod.initTelegramSender();

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: { message_id: 42 } }),
    });

    await mod.sendPermissionRequest("approval-123", "Bash", { command: "rm -rf" }, "My Session");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.reply_markup).toBeDefined();
    expect(body.reply_markup.inline_keyboard).toHaveLength(1);
    expect(body.reply_markup.inline_keyboard[0]).toHaveLength(2);

    const [approveBtn, denyBtn] = body.reply_markup.inline_keyboard[0];
    expect(approveBtn.callback_data).toBe("approve:approval-123");
    expect(denyBtn.callback_data).toBe("deny:approval-123");
    expect(approveBtn.text).toContain("Approve");
    expect(denyBtn.text).toContain("Deny");
  });

  it("returns null when disabled", async () => {
    const result = await mod.sendPermissionRequest("id", "Bash", {}, "title");
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("editMessageText", () => {
  it("calls editMessageText API endpoint", async () => {
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({
      enabled: true, botToken: "123:ABCDEF", chatId: "999",
    }));
    await mod.initTelegramSender();

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });

    await mod.editMessageText(42, "<b>Updated</b>");

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("editMessageText");
    const body = JSON.parse(opts.body);
    expect(body.message_id).toBe(42);
    expect(body.chat_id).toBe("999");
    expect(body.text).toBe("<b>Updated</b>");
    expect(body.parse_mode).toBe("HTML");
  });

  it("returns null when disabled", async () => {
    const result = await mod.editMessageText(1, "text");
    expect(result).toBeNull();
  });
});

describe("formatDuration (via sendTelegramNotification)", () => {
  // We test formatDuration indirectly via the notification output since it's not exported.
  async function setupAndSend(durationMs) {
    vi.clearAllMocks();
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({
      enabled: true, botToken: "123:ABCDEF", chatId: "999",
    }));
    await mod.initTelegramSender();

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: {} }),
    });

    await mod.sendTelegramNotification("session", "T", "B", { durationMs });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    return body.text;
  }

  it("formats seconds correctly", async () => {
    const text = await setupAndSend(5000);
    expect(text).toContain("5s");
  });

  it("formats minutes correctly", async () => {
    const text = await setupAndSend(125000); // 2m 5s
    expect(text).toContain("2m 5s");
  });

  it("formats hours correctly", async () => {
    const text = await setupAndSend(3660000); // 1h 1m
    expect(text).toContain("1h 1m");
  });

  it("formats exact hours without minutes", async () => {
    const text = await setupAndSend(7200000); // 2h
    expect(text).toContain("2h");
  });

  it("formats sub-second as <1s", async () => {
    const text = await setupAndSend(500);
    expect(text).toContain("<1s");
  });
});

describe("formatCost (via sendTelegramNotification)", () => {
  async function setupAndSend(costUsd) {
    vi.clearAllMocks();
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({
      enabled: true, botToken: "123:ABCDEF", chatId: "999",
    }));
    await mod.initTelegramSender();

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: {} }),
    });

    await mod.sendTelegramNotification("session", "T", "B", { costUsd });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    return body.text;
  }

  it("formats small cost with 4 decimal places", async () => {
    const text = await setupAndSend(0.005);
    expect(text).toContain("$0.0050");
  });

  it("formats larger cost with 2 decimal places", async () => {
    const text = await setupAndSend(1.50);
    expect(text).toContain("$1.50");
  });
});

describe("formatTokens (via sendTelegramNotification)", () => {
  async function setupAndSend(inputTokens, outputTokens) {
    vi.clearAllMocks();
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({
      enabled: true, botToken: "123:ABCDEF", chatId: "999",
    }));
    await mod.initTelegramSender();

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: {} }),
    });

    await mod.sendTelegramNotification("session", "T", "B", { inputTokens, outputTokens });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    return body.text;
  }

  it("formats tokens with K suffix", async () => {
    const text = await setupAndSend(1500, 500);
    expect(text).toContain("1.5K");
  });

  it("formats tokens with M suffix", async () => {
    const text = await setupAndSend(2000000, 100);
    expect(text).toContain("2.0M");
  });
});

describe("saveTelegramConfig", () => {
  it("writes config file and updates internal state", async () => {
    const { writeFile: wf } = await import("fs/promises");

    await mod.saveTelegramConfig({
      enabled: true,
      botToken: "new-token-12345",
      chatId: "888",
    });

    expect(wf).toHaveBeenCalledTimes(1);
    const [path, content] = wf.mock.calls[0];
    expect(path).toBe("/mock/config/telegram-config.json");
    const parsed = JSON.parse(content);
    expect(parsed.enabled).toBe(true);
    expect(parsed.botToken).toBe("new-token-12345");
    expect(parsed.chatId).toBe("888");
    // Verify default notify keys are merged
    expect(parsed.notify.sessionComplete).toBe(true);
    expect(parsed.notify.errors).toBe(true);
  });
});

describe("API call failure handling", () => {
  it("returns null when fetch response is not ok", async () => {
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({
      enabled: true, botToken: "123:ABCDEF", chatId: "999",
    }));
    await mod.initTelegramSender();

    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("Bad Request"),
    });

    const result = await mod.sendTelegramNotification("session", "T", "B");
    expect(result).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({
      enabled: true, botToken: "123:ABCDEF", chatId: "999",
    }));
    await mod.initTelegramSender();

    mockFetch.mockRejectedValue(new Error("Network error"));

    const result = await mod.sendTelegramNotification("session", "T", "B");
    expect(result).toBeNull();
  });
});

// ── Notification preference checks for every event type ──

describe("sendTelegramNotification — all event type preferences", () => {
  async function setupEnabled(notifyOverrides = {}) {
    vi.clearAllMocks();
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({
      enabled: true, botToken: "123:ABCDEF", chatId: "999",
      notify: notifyOverrides,
    }));
    await mod.initTelegramSender();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: {} }),
    });
  }

  it("respects workflowComplete = false", async () => {
    await setupEnabled({ workflowComplete: false });
    await mod.sendTelegramNotification("workflow", "Workflow Done", "Body");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("respects chainComplete = false", async () => {
    await setupEnabled({ chainComplete: false });
    await mod.sendTelegramNotification("chain", "Chain Done", "Body");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("respects agentComplete = false", async () => {
    await setupEnabled({ agentComplete: false });
    await mod.sendTelegramNotification("agent", "Agent Done", "Body");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("respects orchestratorComplete = false", async () => {
    await setupEnabled({ orchestratorComplete: false });
    await mod.sendTelegramNotification("orchestrator", "Orchestrator Done", "Body");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("respects dagComplete = false", async () => {
    await setupEnabled({ dagComplete: false });
    await mod.sendTelegramNotification("dag", "DAG Done", "Body");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("respects errors = false", async () => {
    await setupEnabled({ errors: false });
    await mod.sendTelegramNotification("error", "Error", "Body");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("respects taskStart = false", async () => {
    await setupEnabled({ taskStart: false });
    await mod.sendTelegramNotification("start", "Started", "Body");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends notification for each event type when enabled", async () => {
    const types = ["session", "workflow", "chain", "agent", "orchestrator", "dag", "error", "start"];
    for (const eventType of types) {
      await setupEnabled();
      await mod.sendTelegramNotification(eventType, `${eventType} Title`, "Body");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    }
  });

  it("disables notification sound for start event", async () => {
    await setupEnabled();
    await mod.sendTelegramNotification("start", "Started", "Body");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.disable_notification).toBe(true);
  });

  it("does NOT disable notification sound for non-start events", async () => {
    await setupEnabled();
    await mod.sendTelegramNotification("session", "Session", "Body");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.disable_notification).toBe(false);
  });

  it("sends with unknown event type (no icon, no pref check)", async () => {
    await setupEnabled();
    await mod.sendTelegramNotification("custom_unknown", "Custom", "Body");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.text).toContain("Custom");
  });
});

// ── sendTelegramNotification — metrics edge cases ──

describe("sendTelegramNotification — metrics edge cases", () => {
  async function setupAndSendWithMetrics(metrics) {
    vi.clearAllMocks();
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({
      enabled: true, botToken: "123:ABCDEF", chatId: "999",
    }));
    await mod.initTelegramSender();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: {} }),
    });
    await mod.sendTelegramNotification("session", "T", "B", metrics);
    return JSON.parse(mockFetch.mock.calls[0][1].body).text;
  }

  it("includes steps in metrics", async () => {
    const text = await setupAndSendWithMetrics({ steps: 7 });
    expect(text).toContain("7 steps");
  });

  it("includes succeeded/failed counts", async () => {
    const text = await setupAndSendWithMetrics({ succeeded: 3, failed: 1 });
    expect(text).toContain("3");
    expect(text).toContain("1");
  });

  it("does not include metrics line when no metrics provided", async () => {
    const text = await setupAndSendWithMetrics({});
    // No metrics separator
    expect(text).not.toContain("\u{00B7}");
  });

  it("handles zero cost (falsy) — no cost line", async () => {
    const text = await setupAndSendWithMetrics({ costUsd: 0 });
    expect(text).not.toContain("$");
  });

  it("handles null durationMs (falsy) — no duration line", async () => {
    const text = await setupAndSendWithMetrics({ durationMs: null });
    expect(text).not.toContain("\u{23F1}");
  });

  it("handles only outputTokens without inputTokens", async () => {
    const text = await setupAndSendWithMetrics({ inputTokens: 0, outputTokens: 500 });
    expect(text).toContain("0in");
    expect(text).toContain("500out");
  });
});

// ── formatDuration edge cases ──

describe("formatDuration — additional edge cases", () => {
  async function getDurationText(durationMs) {
    vi.clearAllMocks();
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({
      enabled: true, botToken: "123:ABCDEF", chatId: "999",
    }));
    await mod.initTelegramSender();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: {} }),
    });
    await mod.sendTelegramNotification("session", "T", "B", { durationMs });
    return JSON.parse(mockFetch.mock.calls[0][1].body).text;
  }

  it("formats exactly 60 seconds as 1m (no seconds)", async () => {
    const text = await getDurationText(60000);
    expect(text).toContain("1m");
    expect(text).not.toContain("1m 0s");
  });

  it("formats exactly 1 hour as 1h (no minutes)", async () => {
    const text = await getDurationText(3600000);
    expect(text).toContain("1h");
    expect(text).not.toContain("1h 0m");
  });

  it("formats 0 as <1s", async () => {
    const text = await getDurationText(0);
    // durationMs=0 is falsy, so no duration line
    expect(text).not.toContain("\u{23F1}");
  });

  it("formats 999ms as <1s", async () => {
    const text = await getDurationText(999);
    expect(text).toContain("<1s");
  });

  it("formats 59 seconds without minutes", async () => {
    const text = await getDurationText(59000);
    expect(text).toContain("59s");
    expect(text).not.toContain("m");
  });
});

// ── formatCost edge cases ──

describe("formatCost — additional edge cases", () => {
  async function getCostText(costUsd) {
    vi.clearAllMocks();
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({
      enabled: true, botToken: "123:ABCDEF", chatId: "999",
    }));
    await mod.initTelegramSender();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: {} }),
    });
    await mod.sendTelegramNotification("session", "T", "B", { costUsd });
    return JSON.parse(mockFetch.mock.calls[0][1].body).text;
  }

  it("formats exactly 0.01 with 2 decimal places (boundary)", async () => {
    const text = await getCostText(0.01);
    expect(text).toContain("$0.01");
  });

  it("formats 0.009 with 4 decimal places", async () => {
    const text = await getCostText(0.009);
    expect(text).toContain("$0.0090");
  });

  it("formats large cost with 2 decimal places", async () => {
    const text = await getCostText(100.5);
    expect(text).toContain("$100.50");
  });
});

// ── formatTokens edge cases ──

describe("formatTokens — additional edge cases", () => {
  async function getTokenText(inputTokens, outputTokens) {
    vi.clearAllMocks();
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({
      enabled: true, botToken: "123:ABCDEF", chatId: "999",
    }));
    await mod.initTelegramSender();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: {} }),
    });
    await mod.sendTelegramNotification("session", "T", "B", { inputTokens, outputTokens });
    return JSON.parse(mockFetch.mock.calls[0][1].body).text;
  }

  it("formats sub-1000 tokens as plain number", async () => {
    const text = await getTokenText(500, 1);
    expect(text).toContain("500in");
  });

  it("formats exactly 1000 as 1.0K", async () => {
    const text = await getTokenText(1000, 1);
    expect(text).toContain("1.0K");
  });

  it("formats exactly 1000000 as 1.0M", async () => {
    const text = await getTokenText(1000000, 1);
    expect(text).toContain("1.0M");
  });

  it("formats 0 tokens as 0", async () => {
    const text = await getTokenText(1, 0);
    expect(text).toContain("0out");
  });
});

// ── getToolSummary via sendPermissionRequest ──

describe("sendPermissionRequest — tool summary for each tool type", () => {
  async function setupAndGetPermText(toolName, toolInput) {
    vi.clearAllMocks();
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({
      enabled: true, botToken: "123:ABCDEF", chatId: "999",
    }));
    await mod.initTelegramSender();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }),
    });
    await mod.sendPermissionRequest("appr-1", toolName, toolInput, "Session");
    return JSON.parse(mockFetch.mock.calls[0][1].body).text;
  }

  it("shows command for Bash tool", async () => {
    const text = await setupAndGetPermText("Bash", { command: "npm test" });
    expect(text).toContain("npm test");
  });

  it("shows command for Shell tool", async () => {
    const text = await setupAndGetPermText("Shell", { command: "ls -la" });
    expect(text).toContain("ls -la");
  });

  it("shows file_path for Read tool", async () => {
    const text = await setupAndGetPermText("Read", { file_path: "/src/main.js" });
    expect(text).toContain("/src/main.js");
  });

  it("shows file_path for Write tool", async () => {
    const text = await setupAndGetPermText("Write", { file_path: "/out.json" });
    expect(text).toContain("/out.json");
  });

  it("shows file_path for Edit tool", async () => {
    const text = await setupAndGetPermText("Edit", { file_path: "/src/edit.js" });
    expect(text).toContain("/src/edit.js");
  });

  it("shows pattern for Glob tool", async () => {
    const text = await setupAndGetPermText("Glob", { pattern: "**/*.ts" });
    expect(text).toContain("**/*.ts");
  });

  it("shows pattern and path for Grep tool", async () => {
    const text = await setupAndGetPermText("Grep", { pattern: "TODO", path: "/src" });
    expect(text).toContain("/TODO/");
    expect(text).toContain("/src");
  });

  it("shows query for WebSearch tool", async () => {
    const text = await setupAndGetPermText("WebSearch", { query: "vitest mocking" });
    expect(text).toContain("vitest mocking");
  });

  it("shows url for WebFetch tool", async () => {
    const text = await setupAndGetPermText("WebFetch", { url: "https://example.com" });
    expect(text).toContain("https://example.com");
  });

  it("shows JSON for unknown tool", async () => {
    const text = await setupAndGetPermText("CustomTool", { foo: "bar" });
    expect(text).toContain("foo");
    expect(text).toContain("bar");
  });

  it("truncates long summaries to 200 chars", async () => {
    const longCommand = "a".repeat(300);
    const text = await setupAndGetPermText("Bash", { command: longCommand });
    // The summary should be truncated to 200 + "..."
    expect(text).toContain("...");
  });

  it("shows tool name when input is null", async () => {
    const text = await setupAndGetPermText("Bash", null);
    expect(text).toContain("Bash");
  });

  it("omits session label when sessionTitle is empty", async () => {
    vi.clearAllMocks();
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({
      enabled: true, botToken: "123:ABCDEF", chatId: "999",
    }));
    await mod.initTelegramSender();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }),
    });
    await mod.sendPermissionRequest("appr-2", "Bash", { command: "ls" }, "");
    const text = JSON.parse(mockFetch.mock.calls[0][1].body).text;
    // No folder icon when no sessionTitle
    expect(text).not.toContain("\u{1F4C1}");
  });

  it("returns null when permission notifications disabled", async () => {
    vi.clearAllMocks();
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({
      enabled: true, botToken: "123:ABCDEF", chatId: "999",
      notify: { permissionRequests: false },
    }));
    await mod.initTelegramSender();

    const result = await mod.sendPermissionRequest("appr-3", "Bash", { command: "ls" }, "Session");
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── escapeHtml edge cases ──

describe("escapeHtml (via sendTelegramNotification)", () => {
  async function getNotifText(title, body) {
    vi.clearAllMocks();
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({
      enabled: true, botToken: "123:ABCDEF", chatId: "999",
    }));
    await mod.initTelegramSender();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, result: {} }),
    });
    await mod.sendTelegramNotification("session", title, body);
    return JSON.parse(mockFetch.mock.calls[0][1].body).text;
  }

  it("escapes & characters", async () => {
    const text = await getNotifText("A & B", "C & D");
    expect(text).toContain("A &amp; B");
    expect(text).toContain("C &amp; D");
  });

  it("escapes < and > characters", async () => {
    const text = await getNotifText("<script>", "a > b");
    expect(text).toContain("&lt;script&gt;");
    expect(text).toContain("a &gt; b");
  });

  it("handles empty/null body gracefully", async () => {
    const text = await getNotifText("Title", "");
    expect(text).toContain("Title");
  });
});

// ── getTelegramConfig — maskToken edge cases ──

describe("getTelegramConfig — maskToken edge cases", () => {
  it("returns **** for very short token (< 8 chars)", async () => {
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({ enabled: true, botToken: "short", chatId: "1" }));
    await mod.initTelegramSender();
    const cfg = mod.getTelegramConfig();
    expect(cfg.botToken).toBe("****");
  });

  it("returns default afkTimeoutMinutes when not set", () => {
    const cfg = mod.getTelegramConfig();
    expect(cfg.afkTimeoutMinutes).toBe(15);
  });
});

// ── getRawBotToken ──

describe("getRawBotToken", () => {
  it("returns empty string when no token configured", () => {
    expect(mod.getRawBotToken()).toBe("");
  });

  it("returns actual token after init", async () => {
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({ enabled: true, botToken: "realtoken123", chatId: "1" }));
    await mod.initTelegramSender();
    expect(mod.getRawBotToken()).toBe("realtoken123");
  });
});

// ── getConfig ──

describe("getConfig", () => {
  it("returns internal config object", () => {
    const cfg = mod.getConfig();
    expect(cfg).toHaveProperty("enabled");
    expect(cfg).toHaveProperty("botToken");
    expect(cfg).toHaveProperty("chatId");
    expect(cfg).toHaveProperty("notify");
  });
});

// ── editMessageReplyMarkup ──

describe("editMessageReplyMarkup", () => {
  it("sends editMessageReplyMarkup API call", async () => {
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({
      enabled: true, botToken: "123:ABCDEF", chatId: "999",
    }));
    await mod.initTelegramSender();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });

    await mod.editMessageReplyMarkup(42);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("editMessageReplyMarkup");
    const body = JSON.parse(opts.body);
    expect(body.message_id).toBe(42);
    expect(body.reply_markup).toEqual({ inline_keyboard: [] });
  });

  it("returns null when disabled", async () => {
    const result = await mod.editMessageReplyMarkup(1);
    expect(result).toBeNull();
  });
});

// ── answerCallbackQuery ──

describe("answerCallbackQuery", () => {
  it("sends answerCallbackQuery API call with text", async () => {
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({
      enabled: true, botToken: "123:ABCDEF", chatId: "999",
    }));
    await mod.initTelegramSender();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });

    await mod.answerCallbackQuery("cbq-1", "Approved!");

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("answerCallbackQuery");
    const body = JSON.parse(opts.body);
    expect(body.callback_query_id).toBe("cbq-1");
    expect(body.text).toBe("Approved!");
  });

  it("sends empty text when no text provided", async () => {
    const { readFile: rf } = await import("fs/promises");
    rf.mockResolvedValue(JSON.stringify({
      enabled: true, botToken: "123:ABCDEF", chatId: "999",
    }));
    await mod.initTelegramSender();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });

    await mod.answerCallbackQuery("cbq-2");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.text).toBe("");
  });

  it("returns null when botToken is empty", async () => {
    // Default config has empty botToken
    const result = await mod.answerCallbackQuery("cbq-3", "hi");
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock tab-sdk ────────────────────────────────────────────────────────────

const registeredTabs = {};
vi.mock("../../../public/js/ui/tab-sdk.js", () => ({
  registerTab: vi.fn((config) => { registeredTabs[config.id] = config; }),
}));

// ── Mock commands ───────────────────────────────────────────────────────────

const registeredCommands = {};
vi.mock("../../../public/js/ui/commands.js", () => ({
  registerCommand: vi.fn((name, config) => { registeredCommands[name] = config; }),
  commandRegistry: registeredCommands,
}));

// ── Mock right-panel ────────────────────────────────────────────────────────

vi.mock("../../../public/js/ui/right-panel.js", () => ({
  openRightPanel: vi.fn(),
}));

// ── Mock utils ──────────────────────────────────────────────────────────────

vi.mock("../../../public/js/core/utils.js", () => ({
  escapeHtml: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  getToolDetail: vi.fn(),
  scrollToBottom: vi.fn(),
}));

vi.mock("../../../public/js/ui/formatting.js", () => ({
  renderMarkdown: (s) => s,
  highlightCodeBlocks: vi.fn(),
  addCopyButtons: vi.fn(),
  renderMermaidBlocks: vi.fn(),
}));

vi.mock("../../../public/js/ui/diff.js", () => ({
  renderDiffView: vi.fn(),
  renderAdditionsView: vi.fn(),
}));

vi.mock("../../../public/js/core/store.js", () => ({
  getState: vi.fn(),
  setState: vi.fn(),
  on: vi.fn(),
}));

vi.mock("../../../public/js/core/dom.js", () => ({
  $: { messagesDiv: document.createElement("div") },
}));

vi.mock("../../../public/js/ui/parallel.js", () => ({
  getPane: () => ({
    messagesDiv: document.createElement("div"),
    currentAssistantMsg: null,
  }),
}));

// ── Mock api helpers used by skills-manager ─────────────────────────────────

const mockApi = {
  fetchSkillsConfig: vi.fn(),
  saveSkillsConfig: vi.fn(),
  searchSkills: vi.fn(),
  aiSearchSkills: vi.fn(),
  fetchInstalledSkills: vi.fn(),
  installSkill: vi.fn(),
  uninstallSkill: vi.fn(),
  toggleSkill: vi.fn(),
};

// ── Import modules ──────────────────────────────────────────────────────────

await import("../../../public/js/panels/skills-manager.js");

// ── Tests ───────────────────────────────────────────────────────────────────

describe("skills-manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  describe("tab registration", () => {
    it("registers a tab with id 'skills'", () => {
      expect(registeredTabs.skills).toBeDefined();
      expect(registeredTabs.skills.id).toBe("skills");
      expect(registeredTabs.skills.title).toBe("Skills");
    });

    it("has lazy loading enabled", () => {
      expect(registeredTabs.skills.lazy).toBe(true);
    });

    it("has an init function", () => {
      expect(typeof registeredTabs.skills.init).toBe("function");
    });
  });

  describe("/skills command", () => {
    it("registers /skills command", () => {
      expect(registeredCommands.skills).toBeDefined();
      expect(registeredCommands.skills.category).toBe("app");
    });
  });

  describe("init function", () => {
    it("returns an HTMLElement", () => {
      const ctx = {
        api: mockApi,
        on: vi.fn(),
        getProjectPath: () => "/test/project",
        getSessionId: () => "session-1",
      };
      mockApi.fetchSkillsConfig.mockResolvedValue({ activated: false, apiKey: "", defaultScope: "project" });

      const el = registeredTabs.skills.init(ctx);
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.className).toBe("skills-panel");
    });
  });

  describe("activation form", () => {
    it("renders activation form when not activated", async () => {
      const ctx = {
        api: mockApi,
        on: vi.fn(),
        getProjectPath: () => "/test",
        getSessionId: () => "s1",
      };
      mockApi.fetchSkillsConfig.mockResolvedValue({ activated: false, apiKey: "" });

      const el = registeredTabs.skills.init(ctx);
      document.body.appendChild(el);

      // Wait for async checkActivation
      await new Promise((r) => setTimeout(r, 50));

      expect(el.querySelector(".skills-activate")).not.toBeNull();
      expect(el.querySelector(".skills-activate h3").textContent).toBe("Skills Marketplace");
      expect(el.querySelector(".skills-activate-input")).not.toBeNull();
      expect(el.querySelector(".skills-activate-btn")).not.toBeNull();
    });
  });

  describe("marketplace UI", () => {
    it("renders marketplace when activated", async () => {
      const ctx = {
        api: mockApi,
        on: vi.fn(),
        getProjectPath: () => "/test",
        getSessionId: () => "s1",
      };
      mockApi.fetchSkillsConfig.mockResolvedValue({
        activated: true,
        apiKey: "sk_live_skillsmp_...1234",
        defaultScope: "project",
        searchMode: "keyword",
      });
      mockApi.fetchInstalledSkills.mockResolvedValue([]);

      const el = registeredTabs.skills.init(ctx);
      document.body.appendChild(el);

      await new Promise((r) => setTimeout(r, 50));

      expect(el.querySelector(".skills-subtabs")).not.toBeNull();
      const tabs = el.querySelectorAll(".skills-subtab");
      expect(tabs.length).toBe(3);
      expect(tabs[0].textContent).toBe("Browse");
      expect(tabs[1].textContent).toBe("Installed");
      expect(tabs[2].textContent).toBe("Settings");
    });
  });

  describe("initial browse state", () => {
    it("shows discover message when no search query", async () => {
      const ctx = {
        api: mockApi,
        on: vi.fn(),
        getProjectPath: () => "/test",
        getSessionId: () => "s1",
      };
      mockApi.fetchSkillsConfig.mockResolvedValue({
        activated: true,
        apiKey: "sk_live_skillsmp_...1234",
        defaultScope: "project",
        searchMode: "keyword",
      });
      mockApi.fetchInstalledSkills.mockResolvedValue([]);

      // Clear saved query
      localStorage.removeItem("claudeck-skills-query");

      const el = registeredTabs.skills.init(ctx);
      document.body.appendChild(el);
      await new Promise((r) => setTimeout(r, 50));

      const initial = el.querySelector(".skills-initial-state");
      expect(initial).not.toBeNull();
      expect(initial.querySelector(".skills-initial-title").textContent).toBe("Discover agent skills");
    });
  });

  describe("installed tab", () => {
    it("shows empty state when no skills installed", async () => {
      const ctx = {
        api: mockApi,
        on: vi.fn(),
        getProjectPath: () => "/test",
        getSessionId: () => "s1",
      };
      mockApi.fetchSkillsConfig.mockResolvedValue({
        activated: true,
        apiKey: "sk_live_skillsmp_...1234",
        defaultScope: "project",
        searchMode: "keyword",
      });
      mockApi.fetchInstalledSkills.mockResolvedValue([]);

      const el = registeredTabs.skills.init(ctx);
      document.body.appendChild(el);
      await new Promise((r) => setTimeout(r, 50));

      // Click Installed tab
      const installedTab = el.querySelectorAll(".skills-subtab")[1];
      installedTab.click();
      await new Promise((r) => setTimeout(r, 50));

      const empty = el.querySelector(".skills-empty");
      expect(empty).not.toBeNull();
      expect(empty.textContent).toContain("No skills installed");
    });

    it("renders installed skills grouped by scope", async () => {
      const ctx = {
        api: mockApi,
        on: vi.fn(),
        getProjectPath: () => "/test",
        getSessionId: () => "s1",
      };
      mockApi.fetchSkillsConfig.mockResolvedValue({
        activated: true,
        apiKey: "sk_live_skillsmp_...1234",
        defaultScope: "project",
        searchMode: "keyword",
      });
      mockApi.fetchInstalledSkills.mockResolvedValue([
        { name: "skill-a", dirName: "skill-a", description: "Desc A", scope: "project", enabled: true, path: "/test/.claude/skills/skill-a" },
        { name: "skill-b", dirName: "skill-b", description: "Desc B", scope: "global", enabled: false, path: "/home/.claude/skills/skill-b" },
      ]);

      const el = registeredTabs.skills.init(ctx);
      document.body.appendChild(el);
      await new Promise((r) => setTimeout(r, 50));

      const installedTab = el.querySelectorAll(".skills-subtab")[1];
      installedTab.click();
      await new Promise((r) => setTimeout(r, 50));

      const headers = el.querySelectorAll(".skills-scope-header");
      expect(headers.length).toBe(2);
      expect(headers[0].textContent).toBe("Project");
      expect(headers[1].textContent).toBe("Global");

      const rows = el.querySelectorAll(".skill-installed-row");
      expect(rows.length).toBe(2);
    });
  });

  describe("search mode hint", () => {
    it("shows keyword hint by default", async () => {
      const ctx = {
        api: mockApi,
        on: vi.fn(),
        getProjectPath: () => "/test",
        getSessionId: () => "s1",
      };
      mockApi.fetchSkillsConfig.mockResolvedValue({
        activated: true,
        apiKey: "sk_live_skillsmp_...1234",
        defaultScope: "project",
        searchMode: "keyword",
      });
      mockApi.fetchInstalledSkills.mockResolvedValue([]);
      localStorage.removeItem("claudeck-skills-query");
      localStorage.setItem("claudeck-skills-mode", "keyword");

      const el = registeredTabs.skills.init(ctx);
      document.body.appendChild(el);
      await new Promise((r) => setTimeout(r, 50));

      const hint = el.querySelector(".skills-search-hint");
      expect(hint).not.toBeNull();
      expect(hint.textContent).toContain("keyword");
    });
  });
});

// ── renderMessagesIntoPane skill rendering ───────────────────────────────────

describe("renderMessagesIntoPane skill messages", () => {
  it("renders skill-used indicator for Skill tool_use messages on reload", async () => {
    const { renderMessagesIntoPane } = await import("../../../public/js/ui/messages.js");

    const messagesDiv = document.createElement("div");
    const pane = { messagesDiv, currentAssistantMsg: null };

    const messages = [
      { id: 1, role: "tool", content: JSON.stringify({ id: "t1", name: "Skill", input: { skill: "code-review", description: "Review code" } }) },
    ];

    renderMessagesIntoPane(messages, pane);

    const skillMsg = messagesDiv.querySelector(".skill-used-message");
    expect(skillMsg).not.toBeNull();
    expect(skillMsg.querySelector(".skill-used-name").textContent).toContain("code-review");
  });

  it("renders explicit skill role messages on reload", async () => {
    const { renderMessagesIntoPane } = await import("../../../public/js/ui/messages.js");

    const messagesDiv = document.createElement("div");
    const pane = { messagesDiv, currentAssistantMsg: null };

    const messages = [
      { id: 1, role: "skill", content: JSON.stringify({ skill: "commit-msg", description: "Generate commits" }) },
    ];

    renderMessagesIntoPane(messages, pane);

    const skillMsg = messagesDiv.querySelector(".skill-used-message");
    expect(skillMsg).not.toBeNull();
    expect(skillMsg.querySelector(".skill-used-name").textContent).toContain("commit-msg");
  });
});

// ── addSkillUsedMessage tests ───────────────────────────────────────────────

describe("addSkillUsedMessage", () => {
  it("renders skill-used message with name and description", async () => {
    const { addSkillUsedMessage } = await import("../../../public/js/ui/messages.js");

    const messagesDiv = document.createElement("div");
    const pane = { messagesDiv, currentAssistantMsg: null };

    addSkillUsedMessage("code-review", "Perform code review", pane);

    const msg = messagesDiv.querySelector(".skill-used-message");
    expect(msg).not.toBeNull();
    expect(msg.querySelector(".skill-used-name").textContent).toContain("code-review");
    expect(msg.querySelector(".skill-used-desc").textContent).toContain("Perform code review");
  });

  it("renders without description when not provided", async () => {
    const { addSkillUsedMessage } = await import("../../../public/js/ui/messages.js");

    const messagesDiv = document.createElement("div");
    const pane = { messagesDiv, currentAssistantMsg: null };

    addSkillUsedMessage("my-skill", "", pane);

    const msg = messagesDiv.querySelector(".skill-used-message");
    expect(msg).not.toBeNull();
    expect(msg.querySelector(".skill-used-name").textContent).toContain("my-skill");
    expect(msg.querySelector(".skill-used-desc")).toBeNull();
  });
});

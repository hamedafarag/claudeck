// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Shared spies ────────────────────────────────────────
const mockOn = vi.fn();
const mockOnState = vi.fn();
const mockExecCommand = vi.fn(() =>
  Promise.resolve({ stdout: "", stderr: "", exitCode: 0, error: false })
);

// ── Top-level vi.mock (hoisted) ─────────────────────────
vi.mock("../../../public/js/core/events.js", () => ({
  on: (...args) => mockOn(...args),
}));

vi.mock("../../../public/js/core/store.js", () => ({
  on: (...args) => mockOnState(...args),
}));

vi.mock("../../../public/js/core/api.js", () => ({
  execCommand: (...args) => mockExecCommand(...args),
}));

// DOM element references that the module needs
let domElements;

function buildDOM() {
  document.body.innerHTML = `
    <div id="right-panel">
      <div class="right-panel-pane" data-tab="git"></div>
    </div>
    <select id="project-select"><option value="/tmp/project">/tmp/project</option></select>
    <select id="git-branch-select"></select>
    <button id="git-refresh-btn"></button>
    <div id="git-status-list"></div>
    <textarea id="git-commit-msg"></textarea>
    <button id="git-commit-btn">Commit</button>
    <div id="git-log-list"></div>
    <div id="git-branch-info"></div>
    <div id="git-worktree-section" class="hidden">
      <div id="git-worktree-list"></div>
    </div>
  `;

  domElements = {
    rightPanel: document.getElementById("right-panel"),
    projectSelect: document.getElementById("project-select"),
    gitBranchSelect: document.getElementById("git-branch-select"),
    gitRefreshBtn: document.getElementById("git-refresh-btn"),
    gitStatusList: document.getElementById("git-status-list"),
    gitCommitMsg: document.getElementById("git-commit-msg"),
    gitCommitBtn: document.getElementById("git-commit-btn"),
    gitLogList: document.getElementById("git-log-list"),
    gitBranchInfo: document.getElementById("git-branch-info"),
    gitWorktreeSection: document.getElementById("git-worktree-section"),
    gitWorktreeList: document.getElementById("git-worktree-list"),
  };
}

// ── Tests ───────────────────────────────────────────────

beforeEach(async () => {
  vi.resetModules();
  mockOn.mockClear();
  mockOnState.mockClear();
  mockExecCommand.mockClear();

  // Mock fetch for worktree API calls
  globalThis.fetch = vi.fn(() =>
    Promise.resolve({ json: () => Promise.resolve([]) })
  );

  buildDOM();

  vi.doMock("../../../public/js/core/dom.js", () => ({
    $: domElements,
  }));
  vi.doMock("../../../public/js/core/events.js", () => ({
    on: (...args) => mockOn(...args),
  }));
  vi.doMock("../../../public/js/core/store.js", () => ({
    on: (...args) => mockOnState(...args),
  }));
  vi.doMock("../../../public/js/core/api.js", () => ({
    execCommand: (...args) => mockExecCommand(...args),
  }));

  await import("../../../public/js/panels/git-panel.js");
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("git-panel", () => {
  it("loads without error", () => {
    expect(true).toBe(true);
  });

  it("registers rightPanel:opened event handler", () => {
    expect(mockOn).toHaveBeenCalledWith("rightPanel:opened", expect.any(Function));
  });

  it("registers rightPanel:tabChanged event handler", () => {
    expect(mockOn).toHaveBeenCalledWith("rightPanel:tabChanged", expect.any(Function));
  });

  it("registers projectsData state listener", () => {
    expect(mockOnState).toHaveBeenCalledWith("projectsData", expect.any(Function));
  });

  it("gitRefreshBtn has click handler that calls execCommand", () => {
    domElements.gitRefreshBtn.click();
    // refreshAll calls loadBranches, loadStatus, loadLog, loadBranchInfo, loadWorktrees
    // which all call execCommand with various git commands
    expect(mockExecCommand).toHaveBeenCalled();
  });

  it("gitCommitBtn has click handler", () => {
    // Set a commit message and click — handleCommit should call execCommand with git commit
    domElements.gitCommitMsg.value = "test commit message";
    domElements.gitCommitBtn.click();
    // handleCommit calls execCommand('git commit -m "test commit message"', cwd)
    expect(mockExecCommand).toHaveBeenCalledWith(
      expect.stringContaining("git commit"),
      expect.any(String)
    );
  });

  it("gitBranchSelect has change handler that calls execCommand", () => {
    // Add an option and trigger change
    const opt = document.createElement("option");
    opt.value = "feature-branch";
    opt.textContent = "feature-branch";
    domElements.gitBranchSelect.appendChild(opt);
    domElements.gitBranchSelect.value = "feature-branch";
    domElements.gitBranchSelect.dispatchEvent(new Event("change"));
    // switchBranch calls execCommand('git checkout "feature-branch"', cwd)
    expect(mockExecCommand).toHaveBeenCalledWith(
      expect.stringContaining("git checkout"),
      expect.any(String)
    );
  });

  it("projectSelect change handler clears status, log, and branch lists", () => {
    domElements.gitStatusList.innerHTML = "<div>status</div>";
    domElements.gitLogList.innerHTML = "<div>log</div>";
    domElements.gitBranchSelect.innerHTML = "<option>main</option>";

    domElements.projectSelect.dispatchEvent(new Event("change"));

    expect(domElements.gitStatusList.innerHTML).toBe("");
    expect(domElements.gitLogList.innerHTML).toBe("");
    expect(domElements.gitBranchSelect.innerHTML).toBe("");
  });

  // ── loadStatus via refresh ──────────────────────────────

  it("renders staged files in status list", async () => {
    mockExecCommand.mockImplementation((cmd) => {
      if (cmd.includes("git status"))
        return Promise.resolve({ stdout: "A  newfile.js\n", error: false });
      if (cmd.includes("git branch"))
        return Promise.resolve({ stdout: "* main\n", error: false });
      if (cmd.includes("git log"))
        return Promise.resolve({ stdout: "", error: false });
      if (cmd.includes("git rev-parse"))
        return Promise.resolve({ stdout: "main\n", error: false });
      if (cmd.includes("git rev-list"))
        return Promise.resolve({ stdout: "", error: true });
      return Promise.resolve({ stdout: "", error: false });
    });

    domElements.gitRefreshBtn.dispatchEvent(new Event("click"));

    await vi.waitFor(() => {
      const group = domElements.gitStatusList.querySelector(".git-status-group");
      expect(group).not.toBeNull();
      const title = group.querySelector(".git-status-group-title");
      expect(title.textContent).toContain("Staged");
      const fileRow = group.querySelector(".git-status-file");
      expect(fileRow).not.toBeNull();
      expect(fileRow.textContent).toContain("newfile.js");
    });
  });

  it("renders changed files in status list", async () => {
    mockExecCommand.mockImplementation((cmd) => {
      if (cmd.includes("git status"))
        return Promise.resolve({ stdout: " M changed.js\n", error: false });
      if (cmd.includes("git branch"))
        return Promise.resolve({ stdout: "* main\n", error: false });
      if (cmd.includes("git log"))
        return Promise.resolve({ stdout: "", error: false });
      if (cmd.includes("git rev-parse"))
        return Promise.resolve({ stdout: "main\n", error: false });
      if (cmd.includes("git rev-list"))
        return Promise.resolve({ stdout: "", error: true });
      return Promise.resolve({ stdout: "", error: false });
    });

    domElements.gitRefreshBtn.dispatchEvent(new Event("click"));

    await vi.waitFor(() => {
      const group = domElements.gitStatusList.querySelector(".git-status-group");
      expect(group).not.toBeNull();
      const title = group.querySelector(".git-status-group-title");
      expect(title.textContent).toContain("Changes");
      const fileRow = group.querySelector(".git-status-file");
      expect(fileRow).not.toBeNull();
      expect(fileRow.textContent).toContain("changed.js");
    });
  });

  it("renders untracked files", async () => {
    mockExecCommand.mockImplementation((cmd) => {
      if (cmd.includes("git status"))
        return Promise.resolve({ stdout: "?? untracked.txt\n", error: false });
      if (cmd.includes("git branch"))
        return Promise.resolve({ stdout: "* main\n", error: false });
      if (cmd.includes("git log"))
        return Promise.resolve({ stdout: "", error: false });
      if (cmd.includes("git rev-parse"))
        return Promise.resolve({ stdout: "main\n", error: false });
      if (cmd.includes("git rev-list"))
        return Promise.resolve({ stdout: "", error: true });
      return Promise.resolve({ stdout: "", error: false });
    });

    domElements.gitRefreshBtn.dispatchEvent(new Event("click"));

    await vi.waitFor(() => {
      const group = domElements.gitStatusList.querySelector(".git-status-group");
      expect(group).not.toBeNull();
      const title = group.querySelector(".git-status-group-title");
      expect(title.textContent).toContain("Untracked");
      const fileRow = group.querySelector(".git-status-file");
      expect(fileRow).not.toBeNull();
      expect(fileRow.textContent).toContain("untracked.txt");
    });
  });

  it("renders clean working tree message", async () => {
    mockExecCommand.mockImplementation((cmd) => {
      if (cmd.includes("git status"))
        return Promise.resolve({ stdout: "", error: false });
      if (cmd.includes("git branch"))
        return Promise.resolve({ stdout: "* main\n", error: false });
      if (cmd.includes("git log"))
        return Promise.resolve({ stdout: "", error: false });
      if (cmd.includes("git rev-parse"))
        return Promise.resolve({ stdout: "main\n", error: false });
      if (cmd.includes("git rev-list"))
        return Promise.resolve({ stdout: "", error: true });
      return Promise.resolve({ stdout: "", error: false });
    });

    domElements.gitRefreshBtn.dispatchEvent(new Event("click"));

    await vi.waitFor(() => {
      const emptyMsg = domElements.gitStatusList.querySelector(".git-empty");
      expect(emptyMsg).not.toBeNull();
      expect(emptyMsg.textContent).toContain("Working tree clean");
    });
  });

  it("renders commit log entries", async () => {
    mockExecCommand.mockImplementation((cmd) => {
      if (cmd.includes("git status"))
        return Promise.resolve({ stdout: "", error: false });
      if (cmd.includes("git branch"))
        return Promise.resolve({ stdout: "* main\n", error: false });
      if (cmd.includes("git log"))
        return Promise.resolve({
          stdout: "abc1234|Fix bug|2h ago\ndef5678|Add feature|1d ago\n",
          error: false,
        });
      if (cmd.includes("git rev-parse"))
        return Promise.resolve({ stdout: "main\n", error: false });
      if (cmd.includes("git rev-list"))
        return Promise.resolve({ stdout: "", error: true });
      return Promise.resolve({ stdout: "", error: false });
    });

    domElements.gitRefreshBtn.dispatchEvent(new Event("click"));

    await vi.waitFor(() => {
      const logItems = domElements.gitLogList.querySelectorAll(".git-log-item");
      expect(logItems.length).toBe(2);
    });
  });

  it("populates branch select with branches", async () => {
    mockExecCommand.mockImplementation((cmd) => {
      if (cmd.includes("git status"))
        return Promise.resolve({ stdout: "", error: false });
      if (cmd.includes("git branch"))
        return Promise.resolve({
          stdout: "  main\n* feature\n  dev\n",
          error: false,
        });
      if (cmd.includes("git log"))
        return Promise.resolve({ stdout: "", error: false });
      if (cmd.includes("git rev-parse"))
        return Promise.resolve({ stdout: "feature\n", error: false });
      if (cmd.includes("git rev-list"))
        return Promise.resolve({ stdout: "", error: true });
      return Promise.resolve({ stdout: "", error: false });
    });

    domElements.gitRefreshBtn.dispatchEvent(new Event("click"));

    await vi.waitFor(() => {
      const options = domElements.gitBranchSelect.querySelectorAll("option");
      expect(options.length).toBe(3);
      expect(domElements.gitBranchSelect.value).toBe("feature");
    });
  });
});

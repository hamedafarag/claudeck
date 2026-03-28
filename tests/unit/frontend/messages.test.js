// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies ────────────────────────────────────────────────────────

vi.mock("../../../public/js/core/utils.js", () => ({
  escapeHtml: vi.fn((s) => s),
  getToolDetail: vi.fn(() => ""),
  scrollToBottom: vi.fn(),
}));

vi.mock("../../../public/js/ui/formatting.js", () => ({
  renderMarkdown: vi.fn((s) => s),
  highlightCodeBlocks: vi.fn(),
  addCopyButtons: vi.fn(),
  renderMermaidBlocks: vi.fn(),
}));

vi.mock("../../../public/js/ui/diff.js", () => ({
  renderDiffView: vi.fn(() => null),
  renderAdditionsView: vi.fn(() => null),
}));

vi.mock("../../../public/js/core/store.js", () => ({
  getState: vi.fn(() => 0),
  setState: vi.fn(),
}));

vi.mock("../../../public/js/core/dom.js", () => {
  const streamingTokensValue = document.createElement("span");
  const streamingTokensSep = document.createElement("span");
  const streamingTokens = document.createElement("span");
  streamingTokens.classList.add("hidden");
  streamingTokensSep.classList.add("hidden");
  return {
    $: {
      streamingTokens,
      streamingTokensValue,
      streamingTokensSep,
    },
  };
});

vi.mock("../../../public/js/ui/parallel.js", () => ({
  getPane: vi.fn(),
}));

vi.mock("../../../public/js/core/api.js", () => ({
  fetchSingleMessages: vi.fn(() => Promise.resolve([])),
  fetchMessagesByChatId: vi.fn(() => Promise.resolve([])),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import {
  addUserMessage,
  addStatus,
  addResultSummary,
  showThinking,
  removeThinking,
  showWhalyPlaceholder,
  removeWhalyPlaceholder,
  addSkillUsedMessage,
  appendCliOutput,
  appendAssistantText,
  appendToolIndicator,
  appendToolResult,
  renderMessagesIntoPane,
  prependOlderMessages,
  showLoadingIndicator,
  hideLoadingIndicator,
} from "../../../public/js/ui/messages.js";
import { scrollToBottom } from "../../../public/js/core/utils.js";
import { renderDiffView, renderAdditionsView } from "../../../public/js/ui/diff.js";
import { setState } from "../../../public/js/core/store.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockPane() {
  return {
    messagesDiv: document.createElement("div"),
    messageInput: document.createElement("textarea"),
    currentAssistantMsg: null,
    statusEl: null,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("messages", () => {
  let pane;

  beforeEach(() => {
    vi.clearAllMocks();
    pane = createMockPane();
  });

  // ─── addUserMessage ──────────────────────────────────────────────────────

  describe("addUserMessage", () => {
    it("creates a msg div with correct class", () => {
      addUserMessage("hello", pane);
      const msg = pane.messagesDiv.querySelector(".msg.msg-user");
      expect(msg).not.toBeNull();
    });

    it("adds a YOU label", () => {
      addUserMessage("hello", pane);
      const label = pane.messagesDiv.querySelector(".msg-user-label");
      expect(label).not.toBeNull();
      expect(label.textContent).toBe("YOU");
    });

    it("adds body with text", () => {
      addUserMessage("test message", pane);
      const body = pane.messagesDiv.querySelector(".msg-user-body");
      expect(body).not.toBeNull();
      expect(body.textContent).toBe("test message");
    });

    it("adds file tags when filePaths provided", () => {
      addUserMessage("msg", pane, [], ["file1.js", "file2.py"]);
      const fileTags = pane.messagesDiv.querySelectorAll(".msg-user-file-tag");
      expect(fileTags).toHaveLength(2);
      expect(fileTags[0].textContent).toBe("file1.js");
      expect(fileTags[0].title).toBe("file1.js");
      expect(fileTags[1].textContent).toBe("file2.py");
    });

    it("wraps file tags in msg-user-files div", () => {
      addUserMessage("msg", pane, [], ["a.txt"]);
      const filesDiv = pane.messagesDiv.querySelector(".msg-user-files");
      expect(filesDiv).not.toBeNull();
    });

    it("does not add files div when filePaths is empty", () => {
      addUserMessage("msg", pane, [], []);
      const filesDiv = pane.messagesDiv.querySelector(".msg-user-files");
      expect(filesDiv).toBeNull();
    });

    it("appends div to messagesDiv", () => {
      addUserMessage("hello", pane);
      expect(pane.messagesDiv.children).toHaveLength(1);
    });

    it("calls scrollToBottom", () => {
      addUserMessage("hello", pane);
      expect(scrollToBottom).toHaveBeenCalledWith(pane);
    });

    it("resets currentAssistantMsg to null", () => {
      pane.currentAssistantMsg = document.createElement("div");
      addUserMessage("hello", pane);
      expect(pane.currentAssistantMsg).toBeNull();
    });

    it("removes whaly placeholder before adding message", () => {
      showWhalyPlaceholder(pane);
      expect(pane.messagesDiv.querySelector(".whaly-placeholder")).not.toBeNull();
      addUserMessage("hello", pane);
      expect(pane.messagesDiv.querySelector(".whaly-placeholder")).toBeNull();
    });
  });

  // ─── addStatus ───────────────────────────────────────────────────────────

  describe("addStatus", () => {
    it("creates a status div", () => {
      addStatus("connected", false, pane);
      const status = pane.messagesDiv.querySelector(".status");
      expect(status).not.toBeNull();
      expect(status.textContent).toBe("connected");
    });

    it("does not add error class when isError is false", () => {
      addStatus("ok", false, pane);
      const status = pane.messagesDiv.querySelector(".status");
      expect(status.className).toBe("status");
    });

    it("adds error class when isError is true", () => {
      addStatus("fail", true, pane);
      const status = pane.messagesDiv.querySelector(".status.error");
      expect(status).not.toBeNull();
    });

    it("appends to messagesDiv", () => {
      addStatus("msg", false, pane);
      expect(pane.messagesDiv.children).toHaveLength(1);
    });

    it("calls scrollToBottom", () => {
      addStatus("msg", false, pane);
      expect(scrollToBottom).toHaveBeenCalledWith(pane);
    });
  });

  // ─── showThinking ────────────────────────────────────────────────────────

  describe("showThinking", () => {
    it("adds a thinking bar to messagesDiv", () => {
      showThinking("analyzing", pane);
      const bar = pane.messagesDiv.querySelector(".thinking-bar");
      expect(bar).not.toBeNull();
    });

    it("sets data-thinking-bar attribute", () => {
      showThinking("thinking", pane);
      const bar = pane.messagesDiv.querySelector('[data-thinking-bar="true"]');
      expect(bar).not.toBeNull();
    });

    it("includes thinking label text", () => {
      showThinking("reading files", pane);
      const label = pane.messagesDiv.querySelector(".thinking-label");
      expect(label).not.toBeNull();
      expect(label.textContent).toBe("reading files");
    });

    it("includes thinking dots", () => {
      showThinking("working", pane);
      const dots = pane.messagesDiv.querySelectorAll(".thinking-dot");
      expect(dots).toHaveLength(3);
    });

    it("removes existing thinking bar before adding new one", () => {
      showThinking("first", pane);
      showThinking("second", pane);
      const bars = pane.messagesDiv.querySelectorAll(".thinking-bar");
      expect(bars).toHaveLength(1);
      expect(bars[0].querySelector(".thinking-label").textContent).toBe("second");
    });

    it("sets status to streaming when pane has statusEl", () => {
      pane.statusEl = document.createElement("span");
      showThinking("working", pane);
      expect(pane.statusEl.textContent).toBe("streaming");
      expect(pane.statusEl.className).toBe("chat-pane-status streaming");
    });

    it("calls scrollToBottom", () => {
      showThinking("thinking", pane);
      expect(scrollToBottom).toHaveBeenCalledWith(pane);
    });
  });

  // ─── removeThinking ─────────────────────────────────────────────────────

  describe("removeThinking", () => {
    it("removes the thinking bar from messagesDiv", () => {
      showThinking("test", pane);
      expect(pane.messagesDiv.querySelector(".thinking-bar")).not.toBeNull();
      removeThinking(pane);
      expect(pane.messagesDiv.querySelector(".thinking-bar")).toBeNull();
    });

    it("does nothing if no thinking bar exists", () => {
      expect(() => removeThinking(pane)).not.toThrow();
    });
  });

  // ─── showWhalyPlaceholder ────────────────────────────────────────────────

  describe("showWhalyPlaceholder", () => {
    it("adds a placeholder element to messagesDiv", () => {
      showWhalyPlaceholder(pane);
      const placeholder = pane.messagesDiv.querySelector(".whaly-placeholder");
      expect(placeholder).not.toBeNull();
    });

    it("includes whaly image", () => {
      showWhalyPlaceholder(pane);
      const img = pane.messagesDiv.querySelector(".whaly-placeholder img");
      expect(img).not.toBeNull();
      expect(img.alt).toBe("Whaly");
    });

    it("includes whaly text", () => {
      showWhalyPlaceholder(pane);
      const text = pane.messagesDiv.querySelector(".whaly-text");
      expect(text).not.toBeNull();
    });

    it("removes existing placeholder before adding new one", () => {
      showWhalyPlaceholder(pane);
      showWhalyPlaceholder(pane);
      const placeholders = pane.messagesDiv.querySelectorAll(".whaly-placeholder");
      expect(placeholders).toHaveLength(1);
    });
  });

  // ─── removeWhalyPlaceholder ──────────────────────────────────────────────

  describe("removeWhalyPlaceholder", () => {
    it("removes the whaly placeholder", () => {
      showWhalyPlaceholder(pane);
      expect(pane.messagesDiv.querySelector(".whaly-placeholder")).not.toBeNull();
      removeWhalyPlaceholder(pane);
      expect(pane.messagesDiv.querySelector(".whaly-placeholder")).toBeNull();
    });

    it("does nothing if no placeholder exists", () => {
      expect(() => removeWhalyPlaceholder(pane)).not.toThrow();
    });
  });

  // ─── addResultSummary ────────────────────────────────────────────────────

  describe("addResultSummary", () => {
    it("formats model name", () => {
      addResultSummary({ model: "claude-3.5-sonnet" }, pane);
      const status = pane.messagesDiv.querySelector(".status");
      expect(status.textContent).toContain("claude-3.5-sonnet");
    });

    it("formats turn count singular", () => {
      addResultSummary({ num_turns: 1 }, pane);
      const status = pane.messagesDiv.querySelector(".status");
      expect(status.textContent).toContain("1 turn");
      expect(status.textContent).not.toContain("1 turns");
    });

    it("formats turn count plural", () => {
      addResultSummary({ num_turns: 5 }, pane);
      const status = pane.messagesDiv.querySelector(".status");
      expect(status.textContent).toContain("5 turns");
    });

    it("formats duration in seconds", () => {
      addResultSummary({ duration_ms: 12345 }, pane);
      const status = pane.messagesDiv.querySelector(".status");
      expect(status.textContent).toContain("12.3s");
    });

    it("formats cost in USD", () => {
      addResultSummary({ cost_usd: 0.0523 }, pane);
      const status = pane.messagesDiv.querySelector(".status");
      expect(status.textContent).toContain("$0.0523");
    });

    it("formats token counts with k suffix for large numbers", () => {
      addResultSummary({ input_tokens: 1500, output_tokens: 300 }, pane);
      const status = pane.messagesDiv.querySelector(".status");
      expect(status.textContent).toContain("1.5k in / 300 out");
    });

    it("formats all fields joined with middle dot", () => {
      addResultSummary({
        model: "opus",
        num_turns: 3,
        duration_ms: 5000,
        cost_usd: 0.01,
      }, pane);
      const status = pane.messagesDiv.querySelector(".status");
      expect(status.textContent).toContain("\u00b7");
    });

    it("includes stop_reason when not success", () => {
      addResultSummary({ stop_reason: "max_turns" }, pane);
      const status = pane.messagesDiv.querySelector(".status");
      expect(status.textContent).toContain("[max_turns]");
    });

    it("omits stop_reason when it is success", () => {
      addResultSummary({ model: "test", stop_reason: "success" }, pane);
      const status = pane.messagesDiv.querySelector(".status");
      expect(status.textContent).not.toContain("[success]");
    });

    it("does not add status if no parts", () => {
      addResultSummary({}, pane);
      expect(pane.messagesDiv.children).toHaveLength(0);
    });
  });

  // ─── addSkillUsedMessage ─────────────────────────────────────────────────

  describe("addSkillUsedMessage", () => {
    it("creates a skill-used-message div", () => {
      addSkillUsedMessage("code-review", "Reviews code", pane);
      const msg = pane.messagesDiv.querySelector(".skill-used-message");
      expect(msg).not.toBeNull();
    });

    it("shows skill name", () => {
      addSkillUsedMessage("code-review", "Reviews code", pane);
      const name = pane.messagesDiv.querySelector(".skill-used-name");
      expect(name).not.toBeNull();
      expect(name.textContent).toContain("code-review");
    });

    it("shows skill description when provided", () => {
      addSkillUsedMessage("my-skill", "Does something", pane);
      const desc = pane.messagesDiv.querySelector(".skill-used-desc");
      expect(desc).not.toBeNull();
      expect(desc.textContent).toContain("Does something");
    });

    it("omits description span when description is empty", () => {
      addSkillUsedMessage("my-skill", "", pane);
      const desc = pane.messagesDiv.querySelector(".skill-used-desc");
      expect(desc).toBeNull();
    });

    it("appends to messagesDiv", () => {
      addSkillUsedMessage("skill", "desc", pane);
      expect(pane.messagesDiv.children).toHaveLength(1);
    });

    it("calls scrollToBottom", () => {
      addSkillUsedMessage("skill", "desc", pane);
      expect(scrollToBottom).toHaveBeenCalledWith(pane);
    });
  });

  // ─── appendCliOutput ─────────────────────────────────────────────────────

  describe("appendCliOutput", () => {
    it("creates a cli-output div", () => {
      appendCliOutput({ command: "ls", exitCode: 0 }, pane);
      const cli = pane.messagesDiv.querySelector(".cli-output");
      expect(cli).not.toBeNull();
    });

    it("shows the command text", () => {
      appendCliOutput({ command: "git status", exitCode: 0 }, pane);
      const cmd = pane.messagesDiv.querySelector(".cli-cmd");
      expect(cmd).not.toBeNull();
      expect(cmd.textContent).toBe("git status");
    });

    it("shows exit code", () => {
      appendCliOutput({ command: "ls", exitCode: 1 }, pane);
      const exit = pane.messagesDiv.querySelector(".cli-exit");
      expect(exit.textContent).toBe("exit 1");
    });

    it("shows success icon for exit code 0", () => {
      appendCliOutput({ command: "ls", exitCode: 0 }, pane);
      const icon = pane.messagesDiv.querySelector(".cli-icon");
      expect(icon.classList.contains("success")).toBe(true);
    });

    it("shows error icon for non-zero exit code", () => {
      appendCliOutput({ command: "ls", exitCode: 1 }, pane);
      const icon = pane.messagesDiv.querySelector(".cli-icon");
      expect(icon.classList.contains("error")).toBe(true);
    });

    it("renders stdout in a pre tag", () => {
      appendCliOutput({ command: "echo hi", exitCode: 0, stdout: "hi\n" }, pane);
      const body = pane.messagesDiv.querySelector(".cli-output-body");
      const pre = body.querySelector("pre");
      expect(pre).not.toBeNull();
      expect(pre.textContent).toBe("hi\n");
    });

    it("renders stderr in a pre tag with stderr class", () => {
      appendCliOutput({ command: "fail", exitCode: 1, stderr: "error msg" }, pane);
      const stderrPre = pane.messagesDiv.querySelector(".cli-output-stderr");
      expect(stderrPre).not.toBeNull();
      expect(stderrPre.textContent).toBe("error msg");
    });

    it("shows (no output) when neither stdout nor stderr", () => {
      appendCliOutput({ command: "noop", exitCode: 0 }, pane);
      const body = pane.messagesDiv.querySelector(".cli-output-body");
      expect(body.textContent).toContain("(no output)");
    });

    it("resets currentAssistantMsg to null", () => {
      pane.currentAssistantMsg = document.createElement("div");
      appendCliOutput({ command: "ls", exitCode: 0 }, pane);
      expect(pane.currentAssistantMsg).toBeNull();
    });

    it("calls scrollToBottom", () => {
      appendCliOutput({ command: "ls", exitCode: 0 }, pane);
      expect(scrollToBottom).toHaveBeenCalledWith(pane);
    });
  });

  // ─── appendAssistantText ─────────────────────────────────────────────────

  describe("appendAssistantText", () => {
    it("creates a new assistant message div when none exists", () => {
      appendAssistantText("hello", pane);
      const msg = pane.messagesDiv.querySelector(".msg.msg-assistant");
      expect(msg).not.toBeNull();
      const content = msg.querySelector(".text-content");
      expect(content).not.toBeNull();
    });

    it("appends text to existing assistant message", () => {
      appendAssistantText("hello ", pane);
      appendAssistantText("world", pane);
      const msgs = pane.messagesDiv.querySelectorAll(".msg.msg-assistant");
      expect(msgs).toHaveLength(1);
    });

    it("sets currentAssistantMsg on pane", () => {
      appendAssistantText("test", pane);
      expect(pane.currentAssistantMsg).not.toBeNull();
    });
  });

  // ─── appendToolIndicator ─────────────────────────────────────────────────

  describe("appendToolIndicator", () => {
    it("creates a tool-indicator div", () => {
      appendToolIndicator("Read", { file_path: "/test.js" }, pane, "t1", true);
      const indicator = pane.messagesDiv.querySelector(".tool-indicator");
      expect(indicator).not.toBeNull();
    });

    it("sets tool-running class when isLive is true", () => {
      appendToolIndicator("Read", {}, pane, "t1", true);
      const indicator = pane.messagesDiv.querySelector(".tool-indicator");
      expect(indicator.classList.contains("tool-running")).toBe(true);
    });

    it("does not set tool-running class when isLive is false", () => {
      appendToolIndicator("Read", {}, pane, "t1", false);
      const indicator = pane.messagesDiv.querySelector(".tool-indicator");
      expect(indicator.classList.contains("tool-running")).toBe(false);
    });

    it("sets data-tool-id when toolId provided", () => {
      appendToolIndicator("Read", {}, pane, "tool-123", true);
      const indicator = pane.messagesDiv.querySelector('.tool-indicator[data-tool-id="tool-123"]');
      expect(indicator).not.toBeNull();
    });

    it("shows tool name", () => {
      appendToolIndicator("Bash", {}, pane, "t1", true);
      const name = pane.messagesDiv.querySelector(".tool-name");
      expect(name.textContent).toBe("Bash");
    });

    it("resets currentAssistantMsg to null", () => {
      pane.currentAssistantMsg = document.createElement("div");
      appendToolIndicator("Read", {}, pane, "t1", true);
      expect(pane.currentAssistantMsg).toBeNull();
    });
  });

  // ─── appendToolResult ────────────────────────────────────────────────────

  describe("appendToolResult", () => {
    it("updates existing indicator when toolUseId matches", () => {
      appendToolIndicator("Read", {}, pane, "t1", true);
      appendToolResult("t1", "file content", false, pane);
      const indicator = pane.messagesDiv.querySelector(".tool-indicator");
      expect(indicator.classList.contains("tool-done")).toBe(true);
      expect(indicator.classList.contains("tool-running")).toBe(false);
    });

    it("marks indicator with tool-error class on error", () => {
      appendToolIndicator("Read", {}, pane, "t2", true);
      appendToolResult("t2", "not found", true, pane);
      const indicator = pane.messagesDiv.querySelector(".tool-indicator");
      expect(indicator.classList.contains("tool-error")).toBe(true);
    });

    it("creates standalone result when no matching indicator", () => {
      appendToolResult(null, "some result", false, pane);
      const indicator = pane.messagesDiv.querySelector(".tool-indicator.tool-done");
      expect(indicator).not.toBeNull();
    });

    it("creates standalone error result when no matching indicator", () => {
      appendToolResult(null, "error content", true, pane);
      const indicator = pane.messagesDiv.querySelector(".tool-indicator.tool-error");
      expect(indicator).not.toBeNull();
    });
  });

  // ─── renderMessagesIntoPane ───────────────────────────────────────────────

  describe("renderMessagesIntoPane", () => {
    it("shows whaly placeholder for empty messages", () => {
      renderMessagesIntoPane([], pane);
      expect(pane.messagesDiv.querySelector(".whaly-placeholder")).not.toBeNull();
    });

    it("shows whaly placeholder for null messages", () => {
      renderMessagesIntoPane(null, pane);
      expect(pane.messagesDiv.querySelector(".whaly-placeholder")).not.toBeNull();
    });

    it("renders user message", () => {
      renderMessagesIntoPane([
        { role: "user", content: JSON.stringify({ text: "Hello Claude" }) },
      ], pane);
      expect(pane.messagesDiv.querySelector(".msg-user")).not.toBeNull();
      expect(pane.messagesDiv.querySelector(".msg-user-body").textContent).toBe("Hello Claude");
    });

    it("renders assistant message", () => {
      renderMessagesIntoPane([
        { role: "assistant", content: JSON.stringify({ text: "Hi there" }) },
      ], pane);
      expect(pane.messagesDiv.querySelector(".msg-assistant")).not.toBeNull();
    });

    it("renders tool indicator with isLive=false", () => {
      renderMessagesIntoPane([
        { role: "tool", content: JSON.stringify({ name: "Read", input: { file_path: "/test.js" }, id: "t1" }) },
      ], pane);
      const indicator = pane.messagesDiv.querySelector(".tool-indicator");
      expect(indicator).not.toBeNull();
      expect(indicator.classList.contains("tool-running")).toBe(false);
    });

    it("renders tool_result", () => {
      renderMessagesIntoPane([
        { role: "tool", content: JSON.stringify({ name: "Read", input: {}, id: "t1" }) },
        { role: "tool_result", content: JSON.stringify({ toolUseId: "t1", content: "file contents", isError: false }) },
      ], pane);
      const indicator = pane.messagesDiv.querySelector(".tool-indicator.tool-done");
      expect(indicator).not.toBeNull();
    });

    it("renders result summary", () => {
      renderMessagesIntoPane([
        { role: "assistant", content: JSON.stringify({ text: "Done" }), id: "a1" },
        { role: "result", content: JSON.stringify({ model: "sonnet", num_turns: 2, cost_usd: 0.01 }) },
      ], pane);
      const status = pane.messagesDiv.querySelector(".status");
      expect(status).not.toBeNull();
      expect(status.textContent).toContain("sonnet");
    });

    it("renders error status", () => {
      renderMessagesIntoPane([
        { role: "error", content: JSON.stringify({ error: "API error", subtype: "overloaded" }) },
      ], pane);
      const status = pane.messagesDiv.querySelector(".status.error");
      expect(status).not.toBeNull();
      expect(status.textContent).toContain("[overloaded]");
      expect(status.textContent).toContain("API error");
    });

    it("renders aborted status", () => {
      renderMessagesIntoPane([
        { role: "aborted", content: JSON.stringify({}) },
      ], pane);
      const status = pane.messagesDiv.querySelector(".status.error");
      expect(status).not.toBeNull();
      expect(status.textContent).toBe("Aborted");
    });

    it("renders skill message for Skill tool_use", () => {
      renderMessagesIntoPane([
        { role: "tool", content: JSON.stringify({ name: "Skill", input: { skill: "commit", description: "Auto commit" }, id: "s1" }) },
      ], pane);
      const skillMsg = pane.messagesDiv.querySelector(".skill-used-message");
      expect(skillMsg).not.toBeNull();
    });

    it("renders skill role message", () => {
      renderMessagesIntoPane([
        { role: "skill", content: JSON.stringify({ skill: "review", description: "Code review" }) },
      ], pane);
      const skillMsg = pane.messagesDiv.querySelector(".skill-used-message");
      expect(skillMsg).not.toBeNull();
    });

    it("extracts file paths from user message content", () => {
      const text = 'Check this\n<file path="src/app.js">content here</file>';
      renderMessagesIntoPane([
        { role: "user", content: JSON.stringify({ text }) },
      ], pane);
      const fileTags = pane.messagesDiv.querySelectorAll(".msg-user-file-tag");
      expect(fileTags.length).toBe(1);
      expect(fileTags[0].textContent).toBe("src/app.js");
      // User text should NOT contain the <file> block
      const body = pane.messagesDiv.querySelector(".msg-user-body");
      expect(body.textContent).toBe("Check this");
    });

    it("clears messagesDiv before rendering", () => {
      pane.messagesDiv.innerHTML = "<div>old content</div>";
      renderMessagesIntoPane([
        { role: "user", content: JSON.stringify({ text: "new" }) },
      ], pane);
      expect(pane.messagesDiv.querySelector("div:first-child").textContent).not.toBe("old content");
    });

    it("resets currentAssistantMsg after rendering", () => {
      renderMessagesIntoPane([
        { role: "assistant", content: JSON.stringify({ text: "hello" }) },
      ], pane);
      expect(pane.currentAssistantMsg).toBeNull();
    });

    it("renders full conversation with multiple message types", () => {
      renderMessagesIntoPane([
        { role: "user", content: JSON.stringify({ text: "Fix the bug" }) },
        { role: "assistant", content: JSON.stringify({ text: "Let me look at the code" }), id: "a1" },
        { role: "tool", content: JSON.stringify({ name: "Read", input: { file_path: "app.js" }, id: "t1" }) },
        { role: "tool_result", content: JSON.stringify({ toolUseId: "t1", content: "code...", isError: false }) },
        { role: "assistant", content: JSON.stringify({ text: "Found the issue" }), id: "a2" },
        { role: "result", content: JSON.stringify({ model: "sonnet", num_turns: 3 }) },
      ], pane);
      // Should have: user msg + assistant msg + tool indicator + assistant msg + result status
      expect(pane.messagesDiv.querySelector(".msg-user")).not.toBeNull();
      expect(pane.messagesDiv.querySelectorAll(".msg-assistant").length).toBe(2);
      expect(pane.messagesDiv.querySelector(".tool-indicator")).not.toBeNull();
      expect(pane.messagesDiv.querySelector(".status")).not.toBeNull();
    });
  });

  // ─── showLoadingIndicator / hideLoadingIndicator ────────────────────────────

  describe("showLoadingIndicator", () => {
    it("prepends a loading indicator to messagesDiv", () => {
      showLoadingIndicator(pane);
      const indicator = pane.messagesDiv.querySelector(".load-more-indicator");
      expect(indicator).not.toBeNull();
      expect(indicator.textContent).toContain("Loading older messages");
    });

    it("includes a spinner element", () => {
      showLoadingIndicator(pane);
      const spinner = pane.messagesDiv.querySelector(".load-more-spinner");
      expect(spinner).not.toBeNull();
    });

    it("does not add duplicate indicators", () => {
      showLoadingIndicator(pane);
      showLoadingIndicator(pane);
      const indicators = pane.messagesDiv.querySelectorAll(".load-more-indicator");
      expect(indicators).toHaveLength(1);
    });
  });

  describe("hideLoadingIndicator", () => {
    it("removes the loading indicator", () => {
      showLoadingIndicator(pane);
      expect(pane.messagesDiv.querySelector(".load-more-indicator")).not.toBeNull();
      hideLoadingIndicator(pane);
      expect(pane.messagesDiv.querySelector(".load-more-indicator")).toBeNull();
    });

    it("does nothing if no indicator exists", () => {
      expect(() => hideLoadingIndicator(pane)).not.toThrow();
    });
  });

  // ─── prependOlderMessages ─────────────────────────────────────────────────

  describe("prependOlderMessages", () => {
    it("does nothing for empty messages", () => {
      pane.messagesDiv.innerHTML = '<div class="msg">existing</div>';
      prependOlderMessages([], pane);
      expect(pane.messagesDiv.children).toHaveLength(1);
    });

    it("does nothing for null messages", () => {
      pane.messagesDiv.innerHTML = '<div class="msg">existing</div>';
      prependOlderMessages(null, pane);
      expect(pane.messagesDiv.children).toHaveLength(1);
    });

    it("prepends rendered messages before existing content", () => {
      // Add an existing message
      const existing = document.createElement("div");
      existing.className = "msg msg-user";
      existing.textContent = "existing";
      pane.messagesDiv.appendChild(existing);

      const olderMessages = [
        { role: "user", content: JSON.stringify({ text: "older message" }) },
      ];
      prependOlderMessages(olderMessages, pane);

      // The older message should appear before the existing one
      const children = pane.messagesDiv.children;
      expect(children.length).toBeGreaterThan(1);
      expect(children[children.length - 1].textContent).toContain("existing");
    });

    it("inserts after loading indicator when present", () => {
      showLoadingIndicator(pane);
      const existing = document.createElement("div");
      existing.className = "msg";
      existing.textContent = "existing";
      pane.messagesDiv.appendChild(existing);

      const olderMessages = [
        { role: "user", content: JSON.stringify({ text: "older" }) },
      ];
      prependOlderMessages(olderMessages, pane);

      // First child should still be the loading indicator
      expect(pane.messagesDiv.firstChild.classList.contains("load-more-indicator")).toBe(true);
    });
  });

  // ─── appendToolIndicator — diff branches ──────────────────────────────────

  describe("appendToolIndicator — diff branches", () => {
    it("renders diff view for Edit tool when renderDiffView returns element", () => {
      const diffEl = document.createElement("div");
      diffEl.className = "diff-view";
      renderDiffView.mockReturnValueOnce(diffEl);

      appendToolIndicator("Edit", { old_string: "a", new_string: "b", file_path: "test.js" }, pane, "t1", true);
      expect(pane.messagesDiv.querySelector(".diff-view")).not.toBeNull();
      // Should NOT have a regular tool-indicator
      expect(pane.messagesDiv.querySelector(".tool-indicator")).toBeNull();
    });

    it("renders additions view for Write tool when renderAdditionsView returns element", () => {
      const addEl = document.createElement("div");
      addEl.className = "additions-view";
      renderAdditionsView.mockReturnValueOnce(addEl);

      appendToolIndicator("Write", { content: "new file content", file_path: "new.js" }, pane, "t2", true);
      expect(pane.messagesDiv.querySelector(".additions-view")).not.toBeNull();
    });

    it("falls through to default indicator when renderDiffView returns null", () => {
      appendToolIndicator("Edit", { old_string: "a", new_string: "b", file_path: "test.js" }, pane, "t1", true);
      expect(pane.messagesDiv.querySelector(".tool-indicator")).not.toBeNull();
    });
  });

  // ─── appendToolResult — in-place updates ──────────────────────────────────

  describe("appendToolResult — in-place updates", () => {
    it("hides spinner on completion", () => {
      appendToolIndicator("Read", {}, pane, "t1", true);
      appendToolResult("t1", "done", false, pane);
      const spinner = pane.messagesDiv.querySelector(".tool-spinner");
      expect(spinner.style.display).toBe("none");
    });

    it("shows success status icon", () => {
      appendToolIndicator("Read", {}, pane, "t1", true);
      appendToolResult("t1", "content", false, pane);
      const icon = pane.messagesDiv.querySelector(".tool-status-icon");
      expect(icon.style.display).toBe("");
      expect(icon.innerHTML).toContain("\u2713");
    });

    it("shows error status icon", () => {
      appendToolIndicator("Read", {}, pane, "t1", true);
      appendToolResult("t1", "not found", true, pane);
      const icon = pane.messagesDiv.querySelector(".tool-status-icon");
      expect(icon.innerHTML).toContain("\u2717");
    });

    it("shows result preview text", () => {
      appendToolIndicator("Read", {}, pane, "t1", true);
      appendToolResult("t1", "file content here", false, pane);
      const preview = pane.messagesDiv.querySelector(".tool-result-preview");
      expect(preview.style.display).toBe("");
      expect(preview.textContent).toBe("file content here");
    });

    it("truncates result preview to 150 chars", () => {
      appendToolIndicator("Read", {}, pane, "t1", true);
      const longContent = "x".repeat(200);
      appendToolResult("t1", longContent, false, pane);
      const preview = pane.messagesDiv.querySelector(".tool-result-preview");
      expect(preview.textContent.length).toBe(150);
    });

    it("appends result to tool-body", () => {
      appendToolIndicator("Read", {}, pane, "t1", true);
      appendToolResult("t1", "result text", false, pane);
      const body = pane.messagesDiv.querySelector(".tool-body");
      expect(body.innerHTML).toContain("Result");
      expect(body.innerHTML).toContain("result text");
    });

    it("adds error class to result preview on error", () => {
      appendToolIndicator("Read", {}, pane, "t1", true);
      appendToolResult("t1", "error msg", true, pane);
      const preview = pane.messagesDiv.querySelector(".tool-result-preview");
      expect(preview.className).toContain("error");
    });
  });

  // ─── appendAssistantText — streaming counter ──────────────────────────────

  describe("appendAssistantText — streaming counter", () => {
    it("accumulates raw text in dataset", () => {
      appendAssistantText("hello ", pane);
      appendAssistantText("world", pane);
      expect(pane.currentAssistantMsg.dataset.raw).toBe("hello world");
    });

    it("calls setState with updated char count", () => {
      appendAssistantText("test", pane);
      expect(setState).toHaveBeenCalledWith("streamingCharCount", 4);
    });
  });

  // ─── appendToolIndicator — click toggle ───────────────────────────────────

  describe("appendToolIndicator — click toggle", () => {
    it("toggles expanded class on click", () => {
      appendToolIndicator("Read", {}, pane, "t1", true);
      const indicator = pane.messagesDiv.querySelector(".tool-indicator");
      indicator.click();
      expect(indicator.classList.contains("expanded")).toBe(true);
      indicator.click();
      expect(indicator.classList.contains("expanded")).toBe(false);
    });
  });
});

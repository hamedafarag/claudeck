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
} from "../../../public/js/ui/messages.js";
import { scrollToBottom } from "../../../public/js/core/utils.js";

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
});

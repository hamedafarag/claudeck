// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../public/js/core/utils.js", () => ({
  escapeHtml: vi.fn((s) => s),
}));

vi.mock("../../../public/js/ui/formatting.js", () => ({
  renderMarkdown: vi.fn((s) => s),
}));

// Mock URL.createObjectURL and revokeObjectURL
globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-url");
globalThis.URL.revokeObjectURL = vi.fn();

// Blob must be a real constructor (vi.fn returns a plain function, not a class)
const OriginalBlob = globalThis.Blob;
let capturedBlobParts = [];
class MockBlob extends OriginalBlob {
  constructor(parts, opts) {
    super(parts, opts);
    capturedBlobParts.push(...(parts || []));
  }
}
globalThis.Blob = MockBlob;

import { exportAsMarkdown, exportAsHtml } from "../../../public/js/ui/export.js";

function createMockMsg(type, text, raw) {
  const div = document.createElement("div");

  if (type === "user") {
    const userEl = document.createElement("span");
    userEl.className = "msg-user";
    div.appendChild(userEl);
    div.appendChild(document.createTextNode(text));
  } else if (type === "assistant") {
    const content = document.createElement("div");
    content.className = "text-content";
    content.textContent = text;
    if (raw) content.dataset.raw = raw;
    div.appendChild(content);
  } else if (type === "tool") {
    const indicator = document.createElement("div");
    indicator.className = "tool-indicator";
    const toolName = document.createElement("span");
    toolName.className = "tool-name";
    toolName.textContent = text;
    indicator.appendChild(toolName);
    div.appendChild(indicator);
  }

  return div;
}

describe("export", () => {
  let clickSpy;

  beforeEach(() => {
    capturedBlobParts = [];
    clickSpy = vi.fn();
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      const el = document.constructor.prototype.createElement.call(document, tag);
      if (tag === "a") {
        el.click = clickSpy;
      }
      return el;
    });
  });

  describe("exportAsMarkdown", () => {
    it("generates markdown header", () => {
      exportAsMarkdown([]);
      expect(capturedBlobParts[0]).toContain("# Chat Export");
    });

    it("includes user message in markdown", () => {
      const msgs = [createMockMsg("user", "Hello world")];
      exportAsMarkdown(msgs);
      const md = capturedBlobParts[0];
      expect(md).toContain("## User");
      expect(md).toContain("Hello world");
    });

    it("includes assistant message in markdown", () => {
      const msgs = [createMockMsg("assistant", "Hi there", "Hi there")];
      exportAsMarkdown(msgs);
      const md = capturedBlobParts[0];
      expect(md).toContain("## Assistant");
      expect(md).toContain("Hi there");
    });

    it("includes tool indicator in markdown", () => {
      const msgs = [createMockMsg("tool", "Bash")];
      exportAsMarkdown(msgs);
      const md = capturedBlobParts[0];
      expect(md).toContain("> Tool: Bash");
    });

    it("triggers download", () => {
      exportAsMarkdown([]);
      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe("exportAsHtml", () => {
    it("generates HTML with user message", () => {
      const msgs = [createMockMsg("user", "Test input")];
      exportAsHtml(msgs);
      const html = capturedBlobParts[0];
      expect(html).toContain("msg-user");
      expect(html).toContain("Test input");
    });

    it("generates HTML with assistant message", () => {
      const msgs = [createMockMsg("assistant", "Response", "Response")];
      exportAsHtml(msgs);
      const html = capturedBlobParts[0];
      expect(html).toContain("msg-assistant");
      expect(html).toContain("text-content");
    });

    it("generates HTML with tool message", () => {
      const msgs = [createMockMsg("tool", "Read")];
      exportAsHtml(msgs);
      const html = capturedBlobParts[0];
      expect(html).toContain("tool-use");
      expect(html).toContain("Read");
    });

    it("includes full HTML page structure", () => {
      exportAsHtml([]);
      const html = capturedBlobParts[0];
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<title>Chat Export");
      expect(html).toContain("Claudeck");
    });
  });
});

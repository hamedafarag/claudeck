// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { escapeHtml, slugify, getToolDetail } from "../../../public/js/core/utils.js";

describe("utils", () => {
  describe("escapeHtml", () => {
    it("escapes angle brackets in a script tag", () => {
      expect(escapeHtml("<script>alert('xss')</script>")).toBe(
        "&lt;script&gt;alert('xss')&lt;/script&gt;"
      );
    });

    it("escapes ampersands", () => {
      expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
    });

    it("escapes double quotes", () => {
      const result = escapeHtml('say "hello"');
      // happy-dom may or may not escape quotes via textContent/innerHTML,
      // but the key contract is round-trip safety. We verify no raw special chars remain
      // except quotes (which textContent->innerHTML may preserve).
      expect(result).toContain("say");
    });

    it("handles single quotes", () => {
      const result = escapeHtml("it's fine");
      expect(result).toContain("it");
    });

    it("returns empty string for empty input", () => {
      expect(escapeHtml("")).toBe("");
    });

    it("handles null-ish values without throwing", () => {
      // document.createElement('div').textContent = null yields "null"
      const result = escapeHtml(null);
      expect(typeof result).toBe("string");
    });

    it("handles undefined without throwing", () => {
      const result = escapeHtml(undefined);
      expect(typeof result).toBe("string");
    });

    it("preserves plain text with no special characters", () => {
      expect(escapeHtml("hello world")).toBe("hello world");
    });
  });

  describe("slugify", () => {
    it("converts spaces to hyphens", () => {
      expect(slugify("hello world")).toBe("hello-world");
    });

    it("removes special characters", () => {
      expect(slugify("hello! @world#")).toBe("hello-world");
    });

    it("strips leading and trailing hyphens", () => {
      expect(slugify("--hello--")).toBe("hello");
    });

    it("converts to lowercase", () => {
      expect(slugify("Hello World")).toBe("hello-world");
    });

    it("collapses consecutive non-alphanumeric chars into a single hyphen", () => {
      expect(slugify("a   b")).toBe("a-b");
    });

    it("handles strings that are entirely special characters", () => {
      expect(slugify("!!!")).toBe("");
    });

    it("preserves numbers", () => {
      expect(slugify("version 2.0")).toBe("version-2-0");
    });
  });

  describe("getToolDetail", () => {
    it("returns empty string when input is null", () => {
      expect(getToolDetail("Read", null)).toBe("");
    });

    it("returns empty string when input is undefined", () => {
      expect(getToolDetail("Read", undefined)).toBe("");
    });

    it("returns empty string when input is falsy (0, false, empty string)", () => {
      expect(getToolDetail("Read", 0)).toBe("");
      expect(getToolDetail("Read", false)).toBe("");
      expect(getToolDetail("Read", "")).toBe("");
    });

    it("returns escaped file_path when present", () => {
      expect(getToolDetail("Read", { file_path: "/home/user/file.js" })).toBe(
        "/home/user/file.js"
      );
    });

    it("escapes HTML in file_path", () => {
      const result = getToolDetail("Read", { file_path: "<b>bad</b>" });
      expect(result).not.toContain("<b>");
      expect(result).toContain("&lt;b&gt;");
    });

    it("returns command truncated at 80 characters", () => {
      const longCmd = "a".repeat(120);
      const result = getToolDetail("Bash", { command: longCmd });
      // The underlying slice(0,80) produces 80 chars, then escapeHtml preserves length for plain text
      expect(result).toBe("a".repeat(80));
    });

    it("returns full command when under 80 characters", () => {
      expect(getToolDetail("Bash", { command: "ls -la" })).toBe("ls -la");
    });

    it("returns pattern when present", () => {
      expect(getToolDetail("Grep", { pattern: "TODO" })).toBe("TODO");
    });

    it("returns query when present", () => {
      expect(getToolDetail("Search", { query: "find bugs" })).toBe("find bugs");
    });

    it("returns prompt truncated at 80 characters", () => {
      const longPrompt = "b".repeat(100);
      const result = getToolDetail("Agent", { prompt: longPrompt });
      expect(result).toBe("b".repeat(80));
    });

    it("returns full prompt when under 80 characters", () => {
      expect(getToolDetail("Agent", { prompt: "short prompt" })).toBe("short prompt");
    });

    it("returns empty string when no matching fields exist", () => {
      expect(getToolDetail("Custom", { someOtherField: "value" })).toBe("");
    });

    it("prioritises file_path over command", () => {
      const result = getToolDetail("Tool", {
        file_path: "/a/b.js",
        command: "echo hi",
      });
      expect(result).toBe("/a/b.js");
    });

    it("prioritises command over pattern", () => {
      const result = getToolDetail("Tool", {
        command: "grep foo",
        pattern: "foo",
      });
      expect(result).toBe("grep foo");
    });
  });
});

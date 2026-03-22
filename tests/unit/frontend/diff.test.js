// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import {
  computeLineDiff,
  renderDiffView,
  renderAdditionsView,
} from "../../../public/js/ui/diff.js";

describe("diff", () => {
  // ---------------------------------------------------------------------------
  // computeLineDiff
  // ---------------------------------------------------------------------------
  describe("computeLineDiff", () => {
    it("returns all context entries for identical arrays", () => {
      const lines = ["a", "b", "c"];
      const result = computeLineDiff(lines, lines);
      expect(result).toHaveLength(3);
      result.forEach((entry) => {
        expect(entry.type).toBe("context");
      });
    });

    it("marks a single added line", () => {
      const old = ["a", "b"];
      const new_ = ["a", "b", "c"];
      const result = computeLineDiff(old, new_);
      const added = result.filter((e) => e.type === "added");
      expect(added).toHaveLength(1);
      expect(added[0].line).toBe("c");
    });

    it("marks a single removed line", () => {
      const old = ["a", "b", "c"];
      const new_ = ["a", "b"];
      const result = computeLineDiff(old, new_);
      const removed = result.filter((e) => e.type === "removed");
      expect(removed).toHaveLength(1);
      expect(removed[0].line).toBe("c");
    });

    it("handles mixed additions and removals", () => {
      const old = ["a", "b", "c"];
      const new_ = ["a", "x", "c"];
      const result = computeLineDiff(old, new_);
      const types = result.map((e) => e.type);
      expect(types).toContain("context");
      expect(types).toContain("added");
      expect(types).toContain("removed");
      // "a" and "c" are context, "b" removed, "x" added
      expect(result.filter((e) => e.type === "context")).toHaveLength(2);
      expect(result.filter((e) => e.type === "removed")).toHaveLength(1);
      expect(result.filter((e) => e.type === "added")).toHaveLength(1);
    });

    it("treats empty old array as all added", () => {
      const result = computeLineDiff([], ["a", "b"]);
      expect(result).toHaveLength(2);
      result.forEach((entry) => {
        expect(entry.type).toBe("added");
      });
    });

    it("treats empty new array as all removed", () => {
      const result = computeLineDiff(["a", "b"], []);
      expect(result).toHaveLength(2);
      result.forEach((entry) => {
        expect(entry.type).toBe("removed");
      });
    });

    it("returns null when combined length exceeds 1000", () => {
      const big = Array.from({ length: 501 }, (_, i) => `line${i}`);
      const result = computeLineDiff(big, big);
      expect(result).toBeNull();
    });

    it("does not return null when combined length is exactly 1000", () => {
      const a = Array.from({ length: 500 }, (_, i) => `line${i}`);
      const b = Array.from({ length: 500 }, (_, i) => `line${i}`);
      const result = computeLineDiff(a, b);
      expect(result).not.toBeNull();
    });

    it("produces correct LCS-based diff", () => {
      // Classic LCS example: "ABCBDAB" vs "BDCABA"
      const old = ["A", "B", "C", "B", "D", "A", "B"];
      const new_ = ["B", "D", "C", "A", "B", "A"];
      const result = computeLineDiff(old, new_);
      // LCS length should be 4 (e.g., B, C, A, B or B, D, A, B)
      const contextCount = result.filter((e) => e.type === "context").length;
      expect(contextCount).toBe(4);
    });

    it("sets oldNum and newNum correctly for context entries", () => {
      const result = computeLineDiff(["a", "b"], ["a", "b"]);
      expect(result[0]).toEqual({ type: "context", line: "a", oldNum: 1, newNum: 1 });
      expect(result[1]).toEqual({ type: "context", line: "b", oldNum: 2, newNum: 2 });
    });

    it("sets oldNum for removed entries", () => {
      const result = computeLineDiff(["a"], []);
      expect(result[0].oldNum).toBe(1);
      expect(result[0].newNum).toBeUndefined();
    });

    it("sets newNum for added entries", () => {
      const result = computeLineDiff([], ["a"]);
      expect(result[0].newNum).toBe(1);
      expect(result[0].oldNum).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // renderDiffView
  // ---------------------------------------------------------------------------
  describe("renderDiffView", () => {
    it("returns a DOM container with diff-view class", () => {
      const el = renderDiffView("a", "a", "file.js");
      expect(el).not.toBeNull();
      expect(el.className).toBe("diff-view");
    });

    it("header shows the filePath", () => {
      const el = renderDiffView("a", "b", "/src/index.js");
      const header = el.querySelector(".diff-header");
      expect(header.textContent).toBe("/src/index.js");
    });

    it("header falls back to 'Edit' when no filePath is provided", () => {
      const el = renderDiffView("a", "b");
      const header = el.querySelector(".diff-header");
      expect(header.textContent).toBe("Edit");
    });

    it("each diff entry has the correct class", () => {
      const el = renderDiffView("a\nb", "a\nc", "f.js");
      const lines = el.querySelectorAll(".diff-line");
      const classes = Array.from(lines).map((l) => l.className);
      // Should contain context, removed, and added
      expect(classes.some((c) => c.includes("diff-context"))).toBe(true);
      expect(classes.some((c) => c.includes("diff-removed"))).toBe(true);
      expect(classes.some((c) => c.includes("diff-added"))).toBe(true);
    });

    it("added lines show + sign", () => {
      const el = renderDiffView("", "new line", "f.js");
      const addedLine = el.querySelector(".diff-added");
      const sign = addedLine.querySelector(".diff-sign");
      expect(sign.textContent).toBe("+");
    });

    it("removed lines show - sign", () => {
      const el = renderDiffView("old line", "", "f.js");
      const removedLine = el.querySelector(".diff-removed");
      const sign = removedLine.querySelector(".diff-sign");
      expect(sign.textContent).toBe("-");
    });

    it("context lines show space sign", () => {
      const el = renderDiffView("same", "same", "f.js");
      const contextLine = el.querySelector(".diff-context");
      const sign = contextLine.querySelector(".diff-sign");
      expect(sign.textContent).toBe(" ");
    });

    it("returns null for huge diffs (>1000 combined lines)", () => {
      const bigOld = Array(600).fill("x").join("\n");
      const bigNew = Array(600).fill("y").join("\n");
      const result = renderDiffView(bigOld, bigNew, "f.js");
      expect(result).toBeNull();
    });

    it("content spans contain the actual line text", () => {
      const el = renderDiffView("hello\nworld", "hello\nworld", "f.js");
      const contents = el.querySelectorAll(".diff-content");
      expect(contents[0].textContent).toBe("hello");
      expect(contents[1].textContent).toBe("world");
    });

    it("contains a diff-body element", () => {
      const el = renderDiffView("a", "b", "f.js");
      const body = el.querySelector(".diff-body");
      expect(body).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // renderAdditionsView
  // ---------------------------------------------------------------------------
  describe("renderAdditionsView", () => {
    it("marks all lines as added", () => {
      const el = renderAdditionsView("a\nb\nc", "new.js");
      const lines = el.querySelectorAll(".diff-line");
      lines.forEach((line) => {
        expect(line.className).toContain("diff-added");
      });
    });

    it("all lines show + sign", () => {
      const el = renderAdditionsView("line1\nline2", "new.js");
      const signs = el.querySelectorAll(".diff-sign");
      signs.forEach((sign) => {
        expect(sign.textContent).toBe("+");
      });
    });

    it("returns null when content exceeds 1000 lines", () => {
      const big = Array(1001).fill("x").join("\n");
      expect(renderAdditionsView(big, "big.js")).toBeNull();
    });

    it("does not return null at exactly 1000 lines", () => {
      const content = Array(1000).fill("x").join("\n");
      expect(renderAdditionsView(content, "ok.js")).not.toBeNull();
    });

    it("uses default header text 'Write (new file)' when no filePath", () => {
      const el = renderAdditionsView("content");
      const header = el.querySelector(".diff-header");
      expect(header.textContent).toBe("Write (new file)");
    });

    it("shows provided filePath in header", () => {
      const el = renderAdditionsView("content", "/src/new.js");
      const header = el.querySelector(".diff-header");
      expect(header.textContent).toBe("/src/new.js");
    });

    it("gutter numbers are 1-indexed and sequential", () => {
      const el = renderAdditionsView("a\nb\nc", "f.js");
      const gutters = el.querySelectorAll(".diff-gutter");
      expect(gutters[0].textContent).toBe("1");
      expect(gutters[1].textContent).toBe("2");
      expect(gutters[2].textContent).toBe("3");
    });

    it("content spans contain the correct text", () => {
      const el = renderAdditionsView("hello\nworld", "f.js");
      const contents = el.querySelectorAll(".diff-content");
      expect(contents[0].textContent).toBe("hello");
      expect(contents[1].textContent).toBe("world");
    });

    it("has diff-view class on container", () => {
      const el = renderAdditionsView("x", "f.js");
      expect(el.className).toBe("diff-view");
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockTransaction = vi.fn((fn) => fn);
vi.mock("../../../db.js", () => ({
  listMemories: vi.fn(() => []),
  createMemory: vi.fn(),
  deleteMemory: vi.fn(),
  getDb: vi.fn(() => ({ transaction: mockTransaction })),
}));

vi.mock("@anthropic-ai/claude-code", () => ({
  query: vi.fn(() =>
    (async function* () {
      yield {
        type: "assistant",
        message: {
          content: [
            {
              type: "text",
              text: '```json\n{"optimized": [{"category": "convention", "content": "Use ESM imports throughout the project"}], "removed_ids": [2, 3], "summary": "Removed 2, kept 1"}\n```',
            },
          ],
        },
      };
      yield { type: "result", subtype: "success" };
    })(),
  ),
}));

import {
  prefilterMemories,
  optimizeMemories,
  applyOptimization,
} from "../../../server/memory-optimizer.js";
import { listMemories, createMemory, deleteMemory, getDb } from "../../../db.js";
import { query } from "@anthropic-ai/claude-code";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMemory(id, content, category = "discovery") {
  return {
    id,
    content,
    category,
    created_at: Math.floor(Date.now() / 1000),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("memory-optimizer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset transaction mock to call the function
    mockTransaction.mockImplementation((fn) => fn);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // prefilterMemories
  // ══════════════════════════════════════════════════════════════════════════
  describe("prefilterMemories", () => {
    it("keeps well-formed memories", () => {
      const memories = [
        makeMemory(1, "The project uses Vitest for unit testing"),
        makeMemory(2, "Authentication is handled via JWT tokens in the auth middleware"),
      ];

      const { kept, removed } = prefilterMemories(memories);

      expect(kept).toHaveLength(2);
      expect(removed).toHaveLength(0);
    });

    it("removes content shorter than 15 characters", () => {
      const memories = [
        makeMemory(1, "Short"),
        makeMemory(2, "Valid content that is long enough to be kept"),
      ];

      const { kept, removed } = prefilterMemories(memories);

      expect(kept).toHaveLength(1);
      expect(kept[0].id).toBe(2);
      expect(removed).toHaveLength(1);
      expect(removed[0].id).toBe(1);
      expect(removed[0].reason).toBe("noise");
    });

    it("removes null/empty content", () => {
      const memories = [
        makeMemory(1, null),
        makeMemory(2, ""),
      ];

      const { kept, removed } = prefilterMemories(memories);

      expect(kept).toHaveLength(0);
      expect(removed).toHaveLength(2);
    });

    it("removes content longer than 500 characters", () => {
      const longContent = "a".repeat(501);
      const memories = [makeMemory(1, longContent)];

      const { kept, removed } = prefilterMemories(memories);

      expect(kept).toHaveLength(0);
      expect(removed).toHaveLength(1);
    });

    it("removes markdown bold header patterns", () => {
      const memories = [
        makeMemory(1, "**Added to service-base.ts:**"),
      ];

      const { kept, removed } = prefilterMemories(memories);

      expect(kept).toHaveLength(0);
      expect(removed).toHaveLength(1);
    });

    it("removes tool output patterns", () => {
      const memories = [
        makeMemory(1, "prettier 42 files formatted"),
        makeMemory(2, "eslint 15 errors found in files"),
      ];

      const { kept, removed } = prefilterMemories(memories);

      expect(kept).toHaveLength(0);
      expect(removed).toHaveLength(2);
    });

    it("removes action summary patterns", () => {
      const memories = [
        makeMemory(1, "removed all old configuration"),
        makeMemory(2, "added the new middleware handler to the project"),
        makeMemory(3, "updated 5 test files that needed changes"),
      ];

      const { kept, removed } = prefilterMemories(memories);

      expect(kept).toHaveLength(0);
      expect(removed).toHaveLength(3);
    });

    it("removes bare bullet points", () => {
      const memories = [
        makeMemory(1, "- just a bullet point item"),
        makeMemory(2, "* another bullet point item"),
      ];

      const { kept, removed } = prefilterMemories(memories);

      expect(kept).toHaveLength(0);
      expect(removed).toHaveLength(2);
    });

    it("removes numbered list items", () => {
      const memories = [
        makeMemory(1, "1. first numbered list item here"),
      ];

      const { kept, removed } = prefilterMemories(memories);

      expect(kept).toHaveLength(0);
      expect(removed).toHaveLength(1);
    });

    it("removes presentational openers", () => {
      const memories = [
        makeMemory(1, "Here are the changes that were applied"),
        makeMemory(2, "This is a summary of the work done"),
        makeMemory(3, "These are the files that were changed"),
      ];

      const { kept, removed } = prefilterMemories(memories);

      expect(kept).toHaveLength(0);
      expect(removed).toHaveLength(3);
    });

    it("removes markdown-heavy content (>15% markdown chars)", () => {
      // Content with lots of markdown formatting characters
      const memories = [
        makeMemory(1, "**`code`** [link](url) | *italic* ## heading ### sub"),
      ];

      const { kept, removed } = prefilterMemories(memories);

      expect(kept).toHaveLength(0);
      expect(removed).toHaveLength(1);
    });

    it("handles empty input array", () => {
      const { kept, removed } = prefilterMemories([]);

      expect(kept).toHaveLength(0);
      expect(removed).toHaveLength(0);
    });

    it("preserves memory properties in output", () => {
      const memories = [
        makeMemory(5, "The project uses ESM module system throughout"),
      ];

      const { kept } = prefilterMemories(memories);

      expect(kept[0].id).toBe(5);
      expect(kept[0].category).toBe("discovery");
      expect(kept[0].content).toBe("The project uses ESM module system throughout");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // optimizeMemories
  // ══════════════════════════════════════════════════════════════════════════
  describe("optimizeMemories", () => {
    it("returns early when no memories exist", async () => {
      listMemories.mockReturnValue([]);

      const result = await optimizeMemories("/tmp/project");

      expect(result.preview.before).toBe(0);
      expect(result.preview.after).toBe(0);
      expect(result.preview.summary).toContain("No memories");
      expect(query).not.toHaveBeenCalled();
    });

    it("returns all-noise result when prefilter removes everything", async () => {
      listMemories.mockReturnValue([
        makeMemory(1, "Short"),
        makeMemory(2, "Tiny"),
      ]);

      const result = await optimizeMemories("/tmp/project");

      expect(result.preview.before).toBe(2);
      expect(result.preview.after).toBe(0);
      expect(result.preview.noiseRemoved).toBe(2);
      expect(result.preview.summary).toContain("noise");
      expect(query).not.toHaveBeenCalled();
    });

    it("calls Claude with correct prompt for model-based optimization", async () => {
      listMemories.mockReturnValue([
        makeMemory(1, "The project uses Vitest for all unit tests"),
        makeMemory(2, "Database is SQLite via better-sqlite3 library"),
      ]);

      await optimizeMemories("/tmp/project");

      expect(query).toHaveBeenCalledTimes(1);
      const callArgs = query.mock.calls[0][0];
      expect(callArgs.prompt).toContain("memory curator");
      expect(callArgs.prompt).toContain("/tmp/project");
      expect(callArgs.prompt).toContain("Vitest");
      expect(callArgs.prompt).toContain("SQLite");
      expect(callArgs.options.model).toBe("claude-haiku-4-5-20251001");
      expect(callArgs.options.maxTurns).toBe(1);
    });

    it("calls onProgress with phase updates", async () => {
      listMemories.mockReturnValue([
        makeMemory(1, "The project uses TypeScript for all source files"),
      ]);

      const progress = [];
      await optimizeMemories("/tmp/project", (p) => progress.push(p));

      expect(progress.some((p) => p.phase === "prefilter")).toBe(true);
      expect(progress.some((p) => p.phase === "prefilter_done")).toBe(true);
      expect(progress.some((p) => p.phase === "model")).toBe(true);
      expect(progress.some((p) => p.phase === "parsing")).toBe(true);
    });

    it("returns correct preview structure on success", async () => {
      listMemories.mockReturnValue([
        makeMemory(1, "Valid memory content that should be kept around"),
        makeMemory(2, "Short"),
        makeMemory(3, "Another valid memory about project conventions"),
      ]);

      const result = await optimizeMemories("/tmp/project");

      expect(result.preview).toBeDefined();
      expect(result.preview.before).toBe(3);
      expect(result.preview.noiseRemoved).toBe(1); // id=2 is too short
      expect(result.preview.modelOptimized).toBe(true);
      expect(result.preview.optimized).toBeInstanceOf(Array);
      expect(result.preview.summary).toBeDefined();
      expect(result.preview.original).toHaveLength(3);
    });

    it("throws when model returns empty output", async () => {
      listMemories.mockReturnValue([
        makeMemory(1, "Some valid memory content for the project"),
      ]);

      query.mockReturnValueOnce(
        (async function* () {
          yield { type: "result", subtype: "success" };
        })(),
      );

      await expect(optimizeMemories("/tmp/project")).rejects.toThrow("empty output");
    });

    it("throws when model call fails", async () => {
      listMemories.mockReturnValue([
        makeMemory(1, "Some valid memory content for the project"),
      ]);

      query.mockReturnValueOnce(
        (async function* () {
          throw new Error("API error");
        })(),
      );

      await expect(optimizeMemories("/tmp/project")).rejects.toThrow("Optimization model call failed");
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // parseOptimizerOutput (tested indirectly through optimizeMemories)
  // ══════════════════════════════════════════════════════════════════════════
  describe("parseOptimizerOutput (via optimizeMemories)", () => {
    beforeEach(() => {
      listMemories.mockReturnValue([
        makeMemory(1, "Valid content that passes prefilter checks"),
      ]);
    });

    it("handles valid JSON in code block", async () => {
      query.mockReturnValueOnce(
        (async function* () {
          yield {
            type: "assistant",
            message: {
              content: [
                {
                  type: "text",
                  text: '```json\n{"optimized": [{"category": "convention", "content": "Use ESM imports"}], "removed_ids": [1], "summary": "Cleaned up"}\n```',
                },
              ],
            },
          };
          yield { type: "result", subtype: "success" };
        })(),
      );

      const result = await optimizeMemories("/tmp/project");

      expect(result.preview.optimized).toHaveLength(1);
      expect(result.preview.optimized[0].category).toBe("convention");
      expect(result.preview.optimized[0].content).toBe("Use ESM imports");
    });

    it("handles valid JSON without code block fences", async () => {
      query.mockReturnValueOnce(
        (async function* () {
          yield {
            type: "assistant",
            message: {
              content: [
                {
                  type: "text",
                  text: '{"optimized": [{"category": "warning", "content": "Do not use var declarations in any files"}], "removed_ids": [], "summary": "Kept 1"}',
                },
              ],
            },
          };
          yield { type: "result", subtype: "success" };
        })(),
      );

      const result = await optimizeMemories("/tmp/project");

      expect(result.preview.optimized).toHaveLength(1);
      expect(result.preview.optimized[0].category).toBe("warning");
    });

    it("throws on malformed JSON", async () => {
      query.mockReturnValueOnce(
        (async function* () {
          yield {
            type: "assistant",
            message: {
              content: [{ type: "text", text: "This is not JSON at all" }],
            },
          };
          yield { type: "result", subtype: "success" };
        })(),
      );

      await expect(optimizeMemories("/tmp/project")).rejects.toThrow("Failed to parse optimizer output");
    });

    it("throws when optimized array is missing", async () => {
      query.mockReturnValueOnce(
        (async function* () {
          yield {
            type: "assistant",
            message: {
              content: [
                { type: "text", text: '```json\n{"removed_ids": [1], "summary": "All removed"}\n```' },
              ],
            },
          };
          yield { type: "result", subtype: "success" };
        })(),
      );

      await expect(optimizeMemories("/tmp/project")).rejects.toThrow("Missing 'optimized' array");
    });

    it("filters out optimized entries with very short content", async () => {
      query.mockReturnValueOnce(
        (async function* () {
          yield {
            type: "assistant",
            message: {
              content: [
                {
                  type: "text",
                  text: '```json\n{"optimized": [{"category": "convention", "content": "OK"}, {"category": "discovery", "content": "The project uses better-sqlite3 for database access"}], "removed_ids": [], "summary": "Filtered"}\n```',
                },
              ],
            },
          };
          yield { type: "result", subtype: "success" };
        })(),
      );

      const result = await optimizeMemories("/tmp/project");

      // "OK" should be filtered (length <= 5)
      expect(result.preview.optimized).toHaveLength(1);
      expect(result.preview.optimized[0].content).toContain("better-sqlite3");
    });

    it("defaults invalid category to discovery", async () => {
      query.mockReturnValueOnce(
        (async function* () {
          yield {
            type: "assistant",
            message: {
              content: [
                {
                  type: "text",
                  text: '```json\n{"optimized": [{"category": "invalid_cat", "content": "This memory has an invalid category assigned by model"}], "removed_ids": [], "summary": "Defaulted"}\n```',
                },
              ],
            },
          };
          yield { type: "result", subtype: "success" };
        })(),
      );

      const result = await optimizeMemories("/tmp/project");

      expect(result.preview.optimized[0].category).toBe("discovery");
    });

    it("truncates content to 300 characters", async () => {
      const longContent = "a".repeat(400);
      query.mockReturnValueOnce(
        (async function* () {
          yield {
            type: "assistant",
            message: {
              content: [
                {
                  type: "text",
                  text: `\`\`\`json\n{"optimized": [{"category": "convention", "content": "${longContent}"}], "removed_ids": [], "summary": "Truncated"}\n\`\`\``,
                },
              ],
            },
          };
          yield { type: "result", subtype: "success" };
        })(),
      );

      const result = await optimizeMemories("/tmp/project");

      expect(result.preview.optimized[0].content.length).toBeLessThanOrEqual(300);
    });

    it("handles missing summary with default", async () => {
      query.mockReturnValueOnce(
        (async function* () {
          yield {
            type: "assistant",
            message: {
              content: [
                {
                  type: "text",
                  text: '```json\n{"optimized": [{"category": "convention", "content": "Use semicolons in all JavaScript files"}], "removed_ids": []}\n```',
                },
              ],
            },
          };
          yield { type: "result", subtype: "success" };
        })(),
      );

      const result = await optimizeMemories("/tmp/project");

      expect(result.preview.summary).toContain("Optimized to 1 memories");
    });

    it("handles missing removed_ids with empty array", async () => {
      query.mockReturnValueOnce(
        (async function* () {
          yield {
            type: "assistant",
            message: {
              content: [
                {
                  type: "text",
                  text: '```json\n{"optimized": [{"category": "convention", "content": "Always use async/await over raw promises"}], "summary": "Done"}\n```',
                },
              ],
            },
          };
          yield { type: "result", subtype: "success" };
        })(),
      );

      const result = await optimizeMemories("/tmp/project");

      // Should not throw, removedIds defaults to []
      expect(result.preview.removedIds).toBeDefined();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // applyOptimization
  // ══════════════════════════════════════════════════════════════════════════
  describe("applyOptimization", () => {
    it("deletes existing memories and creates new ones", async () => {
      listMemories.mockReturnValue([
        makeMemory(1, "Old memory one"),
        makeMemory(2, "Old memory two"),
      ]);

      const optimized = [
        { category: "convention", content: "Use ESM imports" },
        { category: "warning", content: "Do not use eval" },
      ];

      const result = await applyOptimization("/tmp/project", optimized);

      expect(deleteMemory).toHaveBeenCalledTimes(2);
      expect(deleteMemory).toHaveBeenCalledWith(1);
      expect(deleteMemory).toHaveBeenCalledWith(2);

      expect(createMemory).toHaveBeenCalledTimes(2);
      expect(createMemory).toHaveBeenCalledWith("/tmp/project", "convention", "Use ESM imports", null, "optimizer");
      expect(createMemory).toHaveBeenCalledWith("/tmp/project", "warning", "Do not use eval", null, "optimizer");

      expect(result).toEqual({ deleted: 2, created: 2 });
    });

    it("skips empty content entries", async () => {
      listMemories.mockReturnValue([]);

      const optimized = [
        { category: "convention", content: "Valid content" },
        { category: "discovery", content: "" },
        { category: "warning", content: "   " },
      ];

      const result = await applyOptimization("/tmp/project", optimized);

      expect(createMemory).toHaveBeenCalledTimes(1);
      expect(result.created).toBe(1);
    });

    it("defaults invalid category to discovery", async () => {
      listMemories.mockReturnValue([]);

      const optimized = [
        { category: "bogus", content: "Some content here" },
      ];

      await applyOptimization("/tmp/project", optimized);

      expect(createMemory).toHaveBeenCalledWith("/tmp/project", "discovery", "Some content here", null, "optimizer");
    });

    it("handles empty optimized array", async () => {
      listMemories.mockReturnValue([
        makeMemory(1, "Old memory"),
      ]);

      const result = await applyOptimization("/tmp/project", []);

      expect(deleteMemory).toHaveBeenCalledTimes(1);
      expect(createMemory).not.toHaveBeenCalled();
      expect(result).toEqual({ deleted: 1, created: 0 });
    });

    it("runs within a database transaction", async () => {
      listMemories.mockReturnValue([]);

      await applyOptimization("/tmp/project", [
        { category: "convention", content: "Test content" },
      ]);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockTransaction).toHaveBeenCalledWith(expect.any(Function));
    });

    it("trims whitespace from content", async () => {
      listMemories.mockReturnValue([]);

      await applyOptimization("/tmp/project", [
        { category: "convention", content: "  Padded content  " },
      ]);

      expect(createMemory).toHaveBeenCalledWith("/tmp/project", "convention", "Padded content", null, "optimizer");
    });
  });
});

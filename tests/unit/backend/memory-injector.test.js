import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db.js", () => ({
  getTopMemories: vi.fn(() => []),
  searchMemories: vi.fn(() => []),
  touchMemory: vi.fn(),
  createMemory: vi.fn(() => ({ isDuplicate: false, lastInsertRowid: 1 })),
}));

import {
  buildMemoryPrompt,
  buildAgentMemoryPrompt,
  parseMemoryBlocks,
  saveExplicitMemories,
  parseRememberCommand,
} from "../../../server/memory-injector.js";

import { getTopMemories, searchMemories, touchMemory, createMemory } from "../../../db.js";

beforeEach(() => {
  vi.clearAllMocks();
  getTopMemories.mockReturnValue([]);
  searchMemories.mockReturnValue([]);
});

// ---------------------------------------------------------------------------
// buildMemoryPrompt
// ---------------------------------------------------------------------------
describe("buildMemoryPrompt", () => {
  it("returns { prompt: null, count: 0 } for null projectPath", () => {
    expect(buildMemoryPrompt(null)).toEqual({ prompt: null, count: 0 });
  });

  it("returns { prompt: null, count: 0 } for undefined projectPath", () => {
    expect(buildMemoryPrompt(undefined)).toEqual({ prompt: null, count: 0 });
  });

  it("returns { prompt: null, count: 0 } when no memories exist", () => {
    getTopMemories.mockReturnValue([]);
    const result = buildMemoryPrompt("/project");
    expect(result.prompt).toBeNull();
    expect(result.count).toBe(0);
  });

  it("returns formatted prompt when memories exist", () => {
    getTopMemories.mockReturnValue([
      { id: 1, category: "convention", content: "Use camelCase" },
    ]);
    const result = buildMemoryPrompt("/project");
    expect(result.prompt).toContain("Project Memory");
    expect(result.prompt).toContain("Use camelCase");
    expect(result.count).toBe(1);
  });

  it("includes category labels in prompt", () => {
    getTopMemories.mockReturnValue([
      { id: 1, category: "convention", content: "Use ESLint" },
      { id: 2, category: "decision", content: "Chose PostgreSQL" },
      { id: 3, category: "warning", content: "Avoid global state" },
      { id: 4, category: "discovery", content: "Config loaded from env" },
    ]);
    const result = buildMemoryPrompt("/project");
    expect(result.prompt).toContain("[Convention]");
    expect(result.prompt).toContain("[Decision]");
    expect(result.prompt).toContain("[Warning]");
    expect(result.prompt).toContain("[Discovery]");
  });

  it("calls touchMemory for each memory", () => {
    getTopMemories.mockReturnValue([
      { id: 10, category: "convention", content: "Always lint" },
      { id: 20, category: "decision", content: "Use Vite" },
    ]);
    buildMemoryPrompt("/project");
    expect(touchMemory).toHaveBeenCalledTimes(2);
    expect(touchMemory).toHaveBeenCalledWith(10);
    expect(touchMemory).toHaveBeenCalledWith(20);
  });

  it("includes the saving memories instructions", () => {
    getTopMemories.mockReturnValue([
      { id: 1, category: "discovery", content: "Test content" },
    ]);
    const result = buildMemoryPrompt("/project");
    expect(result.prompt).toContain("Saving Memories");
    expect(result.prompt).toContain("```memory");
  });

  it("returns memories array in result", () => {
    getTopMemories.mockReturnValue([
      { id: 1, category: "convention", content: "Use tabs", extraField: "ignored" },
    ]);
    const result = buildMemoryPrompt("/project");
    expect(result.memories).toEqual([
      { id: 1, category: "convention", content: "Use tabs" },
    ]);
  });

  describe("query-relevant memories via userMessage", () => {
    it("merges query-relevant memories from searchMemories", () => {
      getTopMemories.mockReturnValue([
        { id: 1, category: "convention", content: "Use ESLint" },
      ]);
      searchMemories.mockReturnValue([
        { id: 2, category: "discovery", content: "Database uses SQLite" },
      ]);
      const result = buildMemoryPrompt("/project", 10, "tell me about database setup");
      expect(result.count).toBe(2);
      expect(result.prompt).toContain("Database uses SQLite");
    });

    it("deduplicates merged memories by id", () => {
      const sharedMemory = { id: 1, category: "convention", content: "Use ESLint" };
      getTopMemories.mockReturnValue([sharedMemory]);
      searchMemories.mockReturnValue([sharedMemory]);
      const result = buildMemoryPrompt("/project", 10, "tell me about linting rules");
      expect(result.count).toBe(1);
    });

    it("does not call searchMemories when userMessage is too short", () => {
      getTopMemories.mockReturnValue([
        { id: 1, category: "convention", content: "Use ESLint" },
      ]);
      buildMemoryPrompt("/project", 10, "short");
      expect(searchMemories).not.toHaveBeenCalled();
    });

    it("does not call searchMemories when userMessage is null", () => {
      getTopMemories.mockReturnValue([
        { id: 1, category: "convention", content: "Use ESLint" },
      ]);
      buildMemoryPrompt("/project", 10, null);
      expect(searchMemories).not.toHaveBeenCalled();
    });

    it("extracts keywords from userMessage skipping stop words", () => {
      getTopMemories.mockReturnValue([
        { id: 1, category: "convention", content: "Something" },
      ]);
      searchMemories.mockReturnValue([]);
      buildMemoryPrompt("/project", 10, "what is the database configuration for this project");
      // Should have called searchMemories with keywords (no stop words)
      expect(searchMemories).toHaveBeenCalledTimes(1);
      const query = searchMemories.mock.calls[0][1];
      // Stop words like "what", "is", "the", "for", "this" should be removed
      expect(query).not.toMatch(/\bwhat\b/);
      expect(query).not.toMatch(/\bthe\b/);
      expect(query).not.toMatch(/\bfor\b/);
      expect(query).not.toMatch(/\bthis\b/);
      expect(query).toContain("database");
      expect(query).toContain("configuration");
      expect(query).toContain("project");
    });

    it("does not call searchMemories when all words are stop words", () => {
      getTopMemories.mockReturnValue([
        { id: 1, category: "convention", content: "Something" },
      ]);
      buildMemoryPrompt("/project", 10, "what is the it");
      // All words are stop words or too short, so no search
      expect(searchMemories).not.toHaveBeenCalled();
    });

    it("handles searchMemories errors gracefully", () => {
      getTopMemories.mockReturnValue([
        { id: 1, category: "convention", content: "Use ESLint" },
      ]);
      searchMemories.mockImplementation(() => { throw new Error("FTS error"); });
      const result = buildMemoryPrompt("/project", 10, "tell me about database setup");
      // Should still return top memories
      expect(result.count).toBe(1);
      expect(result.prompt).toContain("Use ESLint");
    });
  });

  describe("caps to limit", () => {
    it("caps returned memories to the specified limit", () => {
      const manyMemories = Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        category: "discovery",
        content: `Memory number ${i + 1}`,
      }));
      getTopMemories.mockReturnValue(manyMemories);
      const result = buildMemoryPrompt("/project", 5);
      expect(result.count).toBe(5);
      expect(touchMemory).toHaveBeenCalledTimes(5);
    });
  });
});

// ---------------------------------------------------------------------------
// buildAgentMemoryPrompt
// ---------------------------------------------------------------------------
describe("buildAgentMemoryPrompt", () => {
  it("returns null for null projectPath", () => {
    expect(buildAgentMemoryPrompt(null)).toBeNull();
  });

  it("returns null for undefined projectPath", () => {
    expect(buildAgentMemoryPrompt(undefined)).toBeNull();
  });

  it("returns null when no memories exist", () => {
    getTopMemories.mockReturnValue([]);
    expect(buildAgentMemoryPrompt("/project")).toBeNull();
  });

  it("returns null when memories is null", () => {
    getTopMemories.mockReturnValue(null);
    expect(buildAgentMemoryPrompt("/project")).toBeNull();
  });

  it("returns formatted prompt with shorter format", () => {
    getTopMemories.mockReturnValue([
      { id: 1, category: "convention", content: "Use tabs" },
    ]);
    const result = buildAgentMemoryPrompt("/project");
    expect(result).toContain("Prior Knowledge");
    expect(result).toContain("[convention] Use tabs");
    // Should NOT contain the full buildMemoryPrompt format
    expect(result).not.toContain("Saving Memories");
  });

  it("calls touchMemory for each memory", () => {
    getTopMemories.mockReturnValue([
      { id: 5, category: "warning", content: "Watch out for X" },
      { id: 6, category: "discovery", content: "Y depends on Z" },
    ]);
    buildAgentMemoryPrompt("/project");
    expect(touchMemory).toHaveBeenCalledTimes(2);
    expect(touchMemory).toHaveBeenCalledWith(5);
    expect(touchMemory).toHaveBeenCalledWith(6);
  });

  it("passes limit to getTopMemories", () => {
    getTopMemories.mockReturnValue([]);
    buildAgentMemoryPrompt("/project", 3);
    expect(getTopMemories).toHaveBeenCalledWith("/project", 3);
  });

  it("uses default limit of 8", () => {
    getTopMemories.mockReturnValue([]);
    buildAgentMemoryPrompt("/project");
    expect(getTopMemories).toHaveBeenCalledWith("/project", 8);
  });
});

// ---------------------------------------------------------------------------
// parseMemoryBlocks
// ---------------------------------------------------------------------------
describe("parseMemoryBlocks", () => {
  it("returns [] for null", () => {
    expect(parseMemoryBlocks(null)).toEqual([]);
  });

  it("returns [] for undefined", () => {
    expect(parseMemoryBlocks(undefined)).toEqual([]);
  });

  it("returns [] for empty string", () => {
    expect(parseMemoryBlocks("")).toEqual([]);
  });

  it("returns [] for text without memory blocks", () => {
    expect(parseMemoryBlocks("Just some regular text")).toEqual([]);
  });

  it("parses a valid ```memory code block", () => {
    const text = 'Some text\n```memory\n{"category": "discovery", "content": "The API uses GraphQL"}\n```\nMore text';
    const result = parseMemoryBlocks(text);
    expect(result).toEqual([
      { category: "discovery", content: "The API uses GraphQL" },
    ]);
  });

  it("parses multiple blocks", () => {
    const text = [
      "```memory",
      '{"category": "convention", "content": "Use 2-space indent"}',
      "```",
      "Some text between",
      "```memory",
      '{"category": "warning", "content": "Never run raw SQL"}',
      "```",
    ].join("\n");
    const result = parseMemoryBlocks(text);
    expect(result).toHaveLength(2);
    expect(result[0].category).toBe("convention");
    expect(result[1].category).toBe("warning");
  });

  it("skips malformed JSON", () => {
    const text = '```memory\n{not valid json}\n```';
    expect(parseMemoryBlocks(text)).toEqual([]);
  });

  it("skips blocks with no content field", () => {
    const text = '```memory\n{"category": "discovery"}\n```';
    expect(parseMemoryBlocks(text)).toEqual([]);
  });

  it("skips blocks where content is not a string", () => {
    const text = '```memory\n{"category": "discovery", "content": 123}\n```';
    expect(parseMemoryBlocks(text)).toEqual([]);
  });

  it("defaults category to 'discovery' for invalid categories", () => {
    const text = '```memory\n{"category": "invalid_cat", "content": "Some content here"}\n```';
    const result = parseMemoryBlocks(text);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("discovery");
  });

  it("defaults category to 'discovery' when category is missing", () => {
    const text = '```memory\n{"content": "Some content here"}\n```';
    const result = parseMemoryBlocks(text);
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("discovery");
  });

  it("truncates content to 300 chars", () => {
    const longContent = "A".repeat(400);
    const text = `\`\`\`memory\n{"category": "discovery", "content": "${longContent}"}\n\`\`\``;
    const result = parseMemoryBlocks(text);
    expect(result).toHaveLength(1);
    expect(result[0].content.length).toBe(300);
  });

  it("trims whitespace from content", () => {
    const text = '```memory\n{"category": "discovery", "content": "  some content with spaces  "}\n```';
    const result = parseMemoryBlocks(text);
    expect(result[0].content).toBe("some content with spaces");
  });
});

// ---------------------------------------------------------------------------
// saveExplicitMemories
// ---------------------------------------------------------------------------
describe("saveExplicitMemories", () => {
  it("returns 0 for null projectPath", () => {
    expect(saveExplicitMemories(null, "text")).toBe(0);
  });

  it("returns 0 for null assistantText", () => {
    expect(saveExplicitMemories("/project", null)).toBe(0);
  });

  it("returns 0 for empty assistantText", () => {
    expect(saveExplicitMemories("/project", "")).toBe(0);
  });

  it("returns 0 when text has no memory blocks", () => {
    expect(saveExplicitMemories("/project", "Just normal text")).toBe(0);
  });

  it("saves parsed memory blocks", () => {
    createMemory.mockReturnValue({ isDuplicate: false, lastInsertRowid: 1 });
    const text = '```memory\n{"category": "convention", "content": "Always use strict mode"}\n```';
    const count = saveExplicitMemories("/project", text, "sess-1");
    expect(count).toBe(1);
    expect(createMemory).toHaveBeenCalledWith("/project", "convention", "Always use strict mode", "sess-1", null);
  });

  it("returns count of non-duplicates", () => {
    createMemory
      .mockReturnValueOnce({ isDuplicate: false, lastInsertRowid: 1 })
      .mockReturnValueOnce({ isDuplicate: true });
    const text = [
      "```memory",
      '{"category": "convention", "content": "Use tabs"}',
      "```",
      "```memory",
      '{"category": "warning", "content": "Avoid globals"}',
      "```",
    ].join("\n");
    const count = saveExplicitMemories("/project", text);
    expect(count).toBe(1);
  });

  it("handles createMemory errors gracefully", () => {
    createMemory.mockImplementation(() => { throw new Error("DB error"); });
    const text = '```memory\n{"category": "discovery", "content": "Test content"}\n```';
    expect(() => saveExplicitMemories("/project", text)).not.toThrow();
    expect(saveExplicitMemories("/project", text)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseRememberCommand
// ---------------------------------------------------------------------------
describe("parseRememberCommand", () => {
  it("returns null for null message", () => {
    expect(parseRememberCommand(null, "/project")).toBeNull();
  });

  it("returns null for null projectPath", () => {
    expect(parseRememberCommand("/remember something important", null)).toBeNull();
  });

  it("returns null for non-/remember messages", () => {
    expect(parseRememberCommand("hello world", "/project")).toBeNull();
  });

  it("returns null for empty /remember command", () => {
    expect(parseRememberCommand("/remember ", "/project")).toBeNull();
  });

  it("returns null for text shorter than 5 chars after /remember", () => {
    expect(parseRememberCommand("/remember hi", "/project")).toBeNull();
  });

  it("parses basic /remember command with discovery category", () => {
    createMemory.mockReturnValue({ isDuplicate: false, lastInsertRowid: 1 });
    const result = parseRememberCommand("/remember this project uses GraphQL for the API", "/project");
    expect(result).not.toBeNull();
    expect(result.category).toBe("discovery");
    expect(result.content).toBe("this project uses GraphQL for the API");
    expect(result.saved).toBe(true);
  });

  it("parses [convention] prefix", () => {
    createMemory.mockReturnValue({ isDuplicate: false, lastInsertRowid: 1 });
    const result = parseRememberCommand("/remember [convention] always use semicolons in JavaScript", "/project");
    expect(result.category).toBe("convention");
    expect(result.content).toBe("always use semicolons in JavaScript");
  });

  it("parses [warning] prefix", () => {
    createMemory.mockReturnValue({ isDuplicate: false, lastInsertRowid: 1 });
    const result = parseRememberCommand("/remember [warning] never run migrations without backup", "/project");
    expect(result.category).toBe("warning");
    expect(result.content).toBe("never run migrations without backup");
  });

  it("parses [decision] prefix", () => {
    createMemory.mockReturnValue({ isDuplicate: false, lastInsertRowid: 1 });
    const result = parseRememberCommand("/remember [decision] switched to PostgreSQL for better perf", "/project");
    expect(result.category).toBe("decision");
    expect(result.content).toBe("switched to PostgreSQL for better perf");
  });

  it("parses [discovery] prefix", () => {
    createMemory.mockReturnValue({ isDuplicate: false, lastInsertRowid: 1 });
    const result = parseRememberCommand("/remember [discovery] config loaded from YAML files at boot", "/project");
    expect(result.category).toBe("discovery");
    expect(result.content).toBe("config loaded from YAML files at boot");
  });

  it("parses case-insensitive category prefix", () => {
    createMemory.mockReturnValue({ isDuplicate: false, lastInsertRowid: 1 });
    const result = parseRememberCommand("/remember [WARNING] never do this dangerous thing", "/project");
    expect(result.category).toBe("warning");
  });

  it("truncates content to 300 chars", () => {
    createMemory.mockReturnValue({ isDuplicate: false, lastInsertRowid: 1 });
    const longText = "A".repeat(400);
    const result = parseRememberCommand(`/remember ${longText}`, "/project");
    expect(result.content.length).toBe(300);
  });

  it("reports saved: false for duplicate", () => {
    createMemory.mockReturnValue({ isDuplicate: true });
    const result = parseRememberCommand("/remember this project uses GraphQL for the API", "/project");
    expect(result.saved).toBe(false);
  });

  it("passes sessionId to createMemory", () => {
    createMemory.mockReturnValue({ isDuplicate: false, lastInsertRowid: 1 });
    parseRememberCommand("/remember this is a test of session tracking", "/project", "sess-42");
    expect(createMemory).toHaveBeenCalledWith(
      "/project",
      "discovery",
      "this is a test of session tracking",
      "sess-42",
      null,
    );
  });

  it("returns null when createMemory throws", () => {
    createMemory.mockImplementation(() => { throw new Error("DB error"); });
    const result = parseRememberCommand("/remember this project uses GraphQL for the API", "/project");
    expect(result).toBeNull();
  });

  it("trims leading/trailing whitespace from message", () => {
    createMemory.mockReturnValue({ isDuplicate: false, lastInsertRowid: 1 });
    const result = parseRememberCommand("  /remember this project uses GraphQL for API  ", "/project");
    expect(result).not.toBeNull();
    expect(result.content).toBe("this project uses GraphQL for API");
  });
});

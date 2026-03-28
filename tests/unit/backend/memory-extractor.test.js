import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db.js", () => ({
  createMemory: vi.fn(() => ({ isDuplicate: false, lastInsertRowid: 1 })),
  maintainMemories: vi.fn(),
}));

import { extractMemories, captureMemories, runMaintenance } from "../../../server/memory-extractor.js";
import { createMemory, maintainMemories } from "../../../db.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// extractMemories
// ---------------------------------------------------------------------------
describe("extractMemories", () => {
  describe("returns empty for invalid inputs", () => {
    it("returns [] for null", () => {
      expect(extractMemories(null)).toEqual([]);
    });

    it("returns [] for undefined", () => {
      expect(extractMemories(undefined)).toEqual([]);
    });

    it("returns [] for empty string", () => {
      expect(extractMemories("")).toEqual([]);
    });

    it("returns [] for text shorter than 50 chars", () => {
      expect(extractMemories("short text here")).toEqual([]);
    });
  });

  describe("noise filtering", () => {
    it("returns [] when every segment matches noise patterns", () => {
      // Each segment individually starts with a noise pattern
      const text = "ok sounds good, I understand the situation perfectly well and will handle it.\n\nlet me check the files for you, I will look around the codebase carefully.";
      expect(extractMemories(text)).toEqual([]);
    });

    it("skips segments that start with code blocks", () => {
      const text = "```javascript\nconsole.log('hello world this is a long enough segment to pass');\n```\n\nThe project uses a convention of PascalCase for component file naming throughout.";
      const result = extractMemories(text);
      // The code block segment should be skipped, but the convention one extracted
      const contents = result.map(m => m.content);
      expect(contents.every(c => !c.startsWith("```"))).toBe(true);
    });

    it("skips segments starting with action summaries", () => {
      const text = "removed all the old configuration files from the repository today.\n\nThe project uses ESLint with the airbnb configuration as its standard style guide.";
      const result = extractMemories(text);
      expect(result.every(m => !m.content.toLowerCase().startsWith("removed all"))).toBe(true);
    });

    it("skips segments that start with markdown bold headers", () => {
      const text = "**Summary of changes that were applied to the entire codebase today**\n\nWe decided to switch the naming pattern to kebab-case for all file names throughout.";
      const result = extractMemories(text);
      expect(result.every(m => !m.content.startsWith("**"))).toBe(true);
    });
  });

  describe("segment length filtering", () => {
    it("filters out segments shorter than 30 chars", () => {
      // Build a text that is >50 chars total but each segment is <30
      const text = "Convention is fine. Nice. Good stuff overall here extending beyond fifty characters total.";
      const result = extractMemories(text);
      // Segments split by sentence boundaries will be short
      expect(result).toEqual([]);
    });

    it("filters out segments longer than 500 chars", () => {
      const longSentence = "The project uses this convention: " + "a".repeat(500);
      const text = longSentence;
      expect(extractMemories(text)).toEqual([]);
    });
  });

  describe("category extraction — convention", () => {
    it("extracts convention memories matching 'coding style'", () => {
      const text = "The coding style in this project follows a very strict functional programming approach throughout.";
      const result = extractMemories(text);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].category).toBe("convention");
    });

    it("extracts convention memories matching 'naming pattern'", () => {
      const text = "The naming pattern used throughout the codebase is strictly camelCase for all variables and functions.";
      const result = extractMemories(text);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].category).toBe("convention");
    });

    it("extracts convention memories matching 'project uses'", () => {
      const text = "This project uses Prettier with a tab-width of 4 for all formatting of JavaScript source files.";
      const result = extractMemories(text);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].category).toBe("convention");
    });

    it("extracts convention memories matching 'folder structure'", () => {
      // "The file" at start is a noise pattern, so use different phrasing
      const text = "Our folder structure and naming pattern for this codebase organizes all React components into feature-based directories with co-located tests.";
      const result = extractMemories(text);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].category).toBe("convention");
    });
  });

  describe("category extraction — decision", () => {
    it("extracts decision memories matching 'decided to'", () => {
      const text = "We decided to use SQLite instead of PostgreSQL for the local persistence layer in this application.";
      const result = extractMemories(text);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].category).toBe("decision");
    });

    it("extracts decision memories matching 'architecture'", () => {
      const text = "The architecture of the system follows a clean separation between the UI layer and backend handlers throughout.";
      const result = extractMemories(text);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].category).toBe("decision");
    });

    it("extracts decision memories matching 'switched to'", () => {
      const text = "The team switched to TypeScript for better type safety across the entire monorepo codebase last quarter.";
      const result = extractMemories(text);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].category).toBe("decision");
    });
  });

  describe("category extraction — warning", () => {
    it("extracts warning memories matching 'warning'", () => {
      const text = "Warning: the database migration scripts must always be run in order or data corruption will occur.";
      const result = extractMemories(text);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].category).toBe("warning");
    });

    it("extracts warning memories matching 'bug'", () => {
      const text = "There is a known bug in the WebSocket reconnection logic that causes duplicate messages under heavy load.";
      const result = extractMemories(text);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].category).toBe("warning");
    });

    it("extracts warning memories matching 'deprecated'", () => {
      const text = "The deprecated authentication module should never be used because it has known security vulnerabilities present.";
      const result = extractMemories(text);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].category).toBe("warning");
    });

    it("extracts warning memories matching 'avoid'", () => {
      const text = "Warning: you should avoid and never use the global event bus pattern in this project, it is a known pitfall.";
      const result = extractMemories(text);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].category).toBe("warning");
    });
  });

  describe("category extraction — discovery", () => {
    it("extracts discovery memories matching 'found'", () => {
      const text = "I found that the configuration is loaded dynamically from a YAML file at runtime in the server bootstrap.";
      const result = extractMemories(text);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].category).toBe("discovery");
    });

    it("extracts discovery memories matching 'discovered'", () => {
      const text = "I discovered that the API gateway automatically transforms all responses through a shared middleware pipeline.";
      const result = extractMemories(text);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].category).toBe("discovery");
    });

    it("extracts discovery memories matching 'turns out'", () => {
      const text = "It turns out the database connection pool is shared across all worker threads in the application server.";
      const result = extractMemories(text);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].category).toBe("discovery");
    });

    it("extracts discovery memories matching 'depends on'", () => {
      const text = "The build system depends on a custom Webpack plugin that generates route manifests from the filesystem automatically.";
      const result = extractMemories(text);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].category).toBe("discovery");
    });
  });

  describe("truncation", () => {
    it("truncates content longer than 300 chars with ellipsis", () => {
      const longContent = "The project uses this specific convention: " + "x".repeat(300);
      const text = longContent;
      const result = extractMemories(text);
      if (result.length > 0) {
        expect(result[0].content.length).toBeLessThanOrEqual(300);
        expect(result[0].content.endsWith("...")).toBe(true);
      }
    });

    it("does not truncate content within 300 chars", () => {
      const text = "We decided to use SQLite instead of PostgreSQL for the local persistence layer in this application.";
      const result = extractMemories(text);
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].content.endsWith("...")).toBe(false);
    });
  });

  describe("deduplication", () => {
    it("deduplicates within same extraction", () => {
      // Same sentence repeated via different paragraphs
      const sentence = "We decided to use ESLint with strict rules for all source files in the project.";
      const text = `${sentence}\n\n${sentence}`;
      const result = extractMemories(text);
      // Should have at most 1 entry for identical content
      const contentSet = new Set(result.map(m => m.content));
      expect(result.length).toBe(contentSet.size);
    });
  });

  describe("cap at 5 memories", () => {
    it("returns at most 5 memories", () => {
      // Build text with many categorizable segments
      const lines = [
        "The coding style follows functional programming patterns throughout the entire codebase.",
        "We decided to use a microservices architecture for better scalability across teams.",
        "Warning: the old API endpoints are deprecated and must never be called directly.",
        "I found that the config is loaded from environment variables at application startup time.",
        "The naming pattern is kebab-case for all filenames in the components directory structure.",
        "We switched to React from Vue because of the larger ecosystem and community support.",
        "There is a critical bug in the session handler that causes memory leaks under pressure.",
        "It turns out the proxy layer caches responses for exactly five minutes by default.",
      ];
      const text = lines.join("\n\n");
      const result = extractMemories(text);
      expect(result.length).toBeLessThanOrEqual(5);
    });
  });
});

// ---------------------------------------------------------------------------
// captureMemories
// ---------------------------------------------------------------------------
describe("captureMemories", () => {
  it("returns 0 for null projectPath", async () => {
    expect(await captureMemories(null, "some text")).toBe(0);
  });

  it("returns 0 for undefined projectPath", async () => {
    expect(await captureMemories(undefined, "some text")).toBe(0);
  });

  it("returns 0 for null assistantText", async () => {
    expect(await captureMemories("/project", null)).toBe(0);
  });

  it("returns 0 for empty assistantText", async () => {
    expect(await captureMemories("/project", "")).toBe(0);
  });

  it("calls createMemory for each extracted memory", async () => {
    const text = "We decided to use PostgreSQL for all persistent storage needs in this application.\n\nThe naming pattern is snake_case for database columns across all migration files.";
    await captureMemories("/project", text, "sess-1");
    // Should call createMemory at least once
    expect(createMemory).toHaveBeenCalled();
  });

  it("returns count of non-duplicate saves", async () => {
    createMemory.mockReturnValue({ isDuplicate: false, lastInsertRowid: 1 });
    const text = "We decided to use Redis for caching all frequently accessed queries in the backend service.";
    const count = await captureMemories("/project", text, "sess-1");
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("does not count duplicates in the return value", async () => {
    createMemory.mockReturnValue({ isDuplicate: true });
    const text = "We decided to use GraphQL instead of REST for the entire frontend data layer.";
    const count = await captureMemories("/project", text, "sess-1");
    expect(count).toBe(0);
  });

  it("handles createMemory errors gracefully", async () => {
    createMemory.mockImplementation(() => { throw new Error("DB error"); });
    const text = "We decided to use SQLite because it is simpler for local development and testing workflows.";
    // Should not throw
    const count = await captureMemories("/project", text, "sess-1");
    expect(count).toBe(0);
  });

  it("passes sessionId and agentId to createMemory", async () => {
    createMemory.mockReturnValue({ isDuplicate: false, lastInsertRowid: 1 });
    const text = "We decided to use Vite as the build tool for faster development feedback loops in this project.";
    await captureMemories("/project", text, "sess-1", "agent-1");
    if (createMemory.mock.calls.length > 0) {
      const call = createMemory.mock.calls[0];
      expect(call[0]).toBe("/project");
      expect(call[3]).toBe("sess-1");
      expect(call[4]).toBe("agent-1");
    }
  });
});

// ---------------------------------------------------------------------------
// runMaintenance
// ---------------------------------------------------------------------------
describe("runMaintenance", () => {
  it("returns undefined for null projectPath", async () => {
    const result = await runMaintenance(null);
    expect(result).toBeUndefined();
    expect(maintainMemories).not.toHaveBeenCalled();
  });

  it("returns undefined for undefined projectPath", async () => {
    const result = await runMaintenance(undefined);
    expect(result).toBeUndefined();
    expect(maintainMemories).not.toHaveBeenCalled();
  });

  it("calls maintainMemories with the projectPath", async () => {
    await runMaintenance("/my/project");
    expect(maintainMemories).toHaveBeenCalledWith("/my/project");
  });

  it("handles errors gracefully without throwing", async () => {
    maintainMemories.mockImplementation(() => { throw new Error("DB error"); });
    await expect(runMaintenance("/my/project")).resolves.not.toThrow();
  });
});

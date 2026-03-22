import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @anthropic-ai/claude-code
vi.mock("@anthropic-ai/claude-code", () => ({
  query: vi.fn(),
}));

// Mock db.js
vi.mock("../../../db.js", () => ({
  getSession: vi.fn(),
  getMessagesNoChatId: vi.fn(() => []),
  updateSessionSummary: vi.fn(),
}));

import { generateSessionSummary } from "../../../server/summarizer.js";
import { query } from "@anthropic-ai/claude-code";
import { getSession, getMessagesNoChatId, updateSessionSummary } from "../../../db.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateSessionSummary", () => {
  it("with missing session returns null", async () => {
    getSession.mockReturnValue(null);
    const result = await generateSessionSummary("nonexistent");
    expect(result).toBeNull();
  });

  it("with missing session does not query messages", async () => {
    getSession.mockReturnValue(null);
    await generateSessionSummary("nonexistent");
    expect(getMessagesNoChatId).not.toHaveBeenCalled();
  });

  it("with < 2 parseable messages returns null", async () => {
    getSession.mockReturnValue({ id: "sess-1", title: "Test" });
    getMessagesNoChatId.mockReturnValue([
      { role: "user", content: JSON.stringify({ text: "Hello" }) },
    ]);

    const result = await generateSessionSummary("sess-1");
    expect(result).toBeNull();
  });

  it("with 0 messages returns null", async () => {
    getSession.mockReturnValue({ id: "sess-1", title: "Test" });
    getMessagesNoChatId.mockReturnValue([]);

    const result = await generateSessionSummary("sess-1");
    expect(result).toBeNull();
  });

  it("with valid conversation calls query and updates DB", async () => {
    getSession.mockReturnValue({ id: "sess-1", title: "Test Session" });
    getMessagesNoChatId.mockReturnValue([
      { role: "user", content: JSON.stringify({ text: "Fix the bug in auth" }) },
      { role: "assistant", content: JSON.stringify({ text: "I fixed the authentication bug" }) },
    ]);

    // Mock the async iterator returned by query
    const mockMessages = [
      {
        type: "assistant",
        message: {
          content: [{ type: "text", text: "Fixed authentication bug in login module" }],
        },
      },
    ];
    query.mockReturnValue({
      [Symbol.asyncIterator]: () => {
        let idx = 0;
        return {
          next: () => {
            if (idx < mockMessages.length) {
              return Promise.resolve({ value: mockMessages[idx++], done: false });
            }
            return Promise.resolve({ done: true });
          },
        };
      },
    });

    const result = await generateSessionSummary("sess-1");
    expect(result).toBe("Fixed authentication bug in login module");
    expect(query).toHaveBeenCalledTimes(1);
    expect(updateSessionSummary).toHaveBeenCalledWith("sess-1", "Fixed authentication bug in login module");
  });

  it("summary truncated to 200 chars", async () => {
    getSession.mockReturnValue({ id: "sess-1", title: "Test" });
    getMessagesNoChatId.mockReturnValue([
      { role: "user", content: JSON.stringify({ text: "Do something" }) },
      { role: "assistant", content: JSON.stringify({ text: "Done" }) },
    ]);

    const longText = "A".repeat(300);
    query.mockReturnValue({
      [Symbol.asyncIterator]: () => {
        let done = false;
        return {
          next: () => {
            if (!done) {
              done = true;
              return Promise.resolve({
                value: {
                  type: "assistant",
                  message: { content: [{ type: "text", text: longText }] },
                },
                done: false,
              });
            }
            return Promise.resolve({ done: true });
          },
        };
      },
    });

    const result = await generateSessionSummary("sess-1");
    expect(result.length).toBe(200);
  });

  it("SDK returns no text returns null", async () => {
    getSession.mockReturnValue({ id: "sess-1", title: "Test" });
    getMessagesNoChatId.mockReturnValue([
      { role: "user", content: JSON.stringify({ text: "Hello" }) },
      { role: "assistant", content: JSON.stringify({ text: "World" }) },
    ]);

    // Return messages with no text blocks
    query.mockReturnValue({
      [Symbol.asyncIterator]: () => {
        let done = false;
        return {
          next: () => {
            if (!done) {
              done = true;
              return Promise.resolve({
                value: { type: "assistant", message: { content: [{ type: "tool_use" }] } },
                done: false,
              });
            }
            return Promise.resolve({ done: true });
          },
        };
      },
    });

    const result = await generateSessionSummary("sess-1");
    expect(result).toBeNull();
    expect(updateSessionSummary).not.toHaveBeenCalled();
  });

  it("messages with unparseable JSON are skipped", async () => {
    getSession.mockReturnValue({ id: "sess-1", title: "Test" });
    getMessagesNoChatId.mockReturnValue([
      { role: "user", content: "not json at all" },
      { role: "user", content: JSON.stringify({ text: "Valid message" }) },
      { role: "assistant", content: "{bad json" },
      { role: "assistant", content: JSON.stringify({ text: "Valid response" }) },
    ]);

    // 2 parseable messages => should proceed
    query.mockReturnValue({
      [Symbol.asyncIterator]: () => {
        let done = false;
        return {
          next: () => {
            if (!done) {
              done = true;
              return Promise.resolve({
                value: {
                  type: "assistant",
                  message: { content: [{ type: "text", text: "Summary of session" }] },
                },
                done: false,
              });
            }
            return Promise.resolve({ done: true });
          },
        };
      },
    });

    const result = await generateSessionSummary("sess-1");
    expect(result).toBe("Summary of session");
  });

  it("does not count messages without text field", async () => {
    getSession.mockReturnValue({ id: "sess-1", title: "Test" });
    getMessagesNoChatId.mockReturnValue([
      { role: "user", content: JSON.stringify({ image: "base64data" }) },
      { role: "assistant", content: JSON.stringify({ toolUse: true }) },
    ]);

    // Both messages parse but have no "text" field => conversation.length < 2
    const result = await generateSessionSummary("sess-1");
    expect(result).toBeNull();
  });
});

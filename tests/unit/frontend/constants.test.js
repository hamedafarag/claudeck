// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";

import { CHAT_IDS, AUTOCOMPLETE_LIMIT, BOT_CHAT_ID } from "../../../public/js/core/constants.js";

describe("constants", () => {
  describe("CHAT_IDS", () => {
    it("has 4 chat IDs", () => {
      expect(CHAT_IDS).toHaveLength(4);
    });

    it("contains expected values", () => {
      expect(CHAT_IDS).toEqual(["chat-0", "chat-1", "chat-2", "chat-3"]);
    });

    it("is an array", () => {
      expect(Array.isArray(CHAT_IDS)).toBe(true);
    });
  });

  describe("AUTOCOMPLETE_LIMIT", () => {
    it("is 20", () => {
      expect(AUTOCOMPLETE_LIMIT).toBe(20);
    });

    it("is a number", () => {
      expect(typeof AUTOCOMPLETE_LIMIT).toBe("number");
    });
  });

  describe("BOT_CHAT_ID", () => {
    it("is 'assistant-bot'", () => {
      expect(BOT_CHAT_ID).toBe("assistant-bot");
    });

    it("is a string", () => {
      expect(typeof BOT_CHAT_ID).toBe("string");
    });
  });
});

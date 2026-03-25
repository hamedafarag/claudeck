// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const STORAGE_KEY = "claudeck-disabled-tools";

let getDisabledTools;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();

  const mod = await import("../../../public/js/ui/disabled-tools.js");
  getDisabledTools = mod.getDisabledTools;
});

describe("disabled-tools", () => {
  describe("getDisabledTools", () => {
    it("returns empty array by default when nothing is stored", () => {
      expect(getDisabledTools()).toEqual([]);
    });

    it("parses stored JSON array from localStorage", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(["Bash", "Read"]));
      expect(getDisabledTools()).toEqual(["Bash", "Read"]);
    });

    it("returns empty array when stored value is invalid JSON", () => {
      localStorage.setItem(STORAGE_KEY, "not-valid-json{{{");
      expect(getDisabledTools()).toEqual([]);
    });

    it("returns empty array when stored value is null JSON", () => {
      localStorage.setItem(STORAGE_KEY, "null");
      expect(getDisabledTools()).toEqual([]);
    });

    it("returns stored single-item array", () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(["Write"]));
      expect(getDisabledTools()).toEqual(["Write"]);
    });
  });
});

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const STORAGE_KEY = "claudeck-max-turns";

const mockMaxTurnsSelect = {
  value: "",
  addEventListener: vi.fn(),
};

vi.mock("../../../public/js/core/dom.js", () => ({
  $: {
    maxTurnsSelect: mockMaxTurnsSelect,
  },
}));

let getMaxTurns;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  mockMaxTurnsSelect.value = "";
  mockMaxTurnsSelect.addEventListener = vi.fn();

  vi.doMock("../../../public/js/core/dom.js", () => ({
    $: {
      maxTurnsSelect: mockMaxTurnsSelect,
    },
  }));

  const mod = await import("../../../public/js/ui/max-turns.js");
  getMaxTurns = mod.getMaxTurns;
});

describe("max-turns", () => {
  describe("getMaxTurns", () => {
    it("returns 0 when select has no value", () => {
      mockMaxTurnsSelect.value = "";
      expect(getMaxTurns()).toBe(0);
    });

    it("returns 0 when select value is non-numeric", () => {
      mockMaxTurnsSelect.value = "abc";
      expect(getMaxTurns()).toBe(0);
    });

    it("returns parsed integer from select value", () => {
      mockMaxTurnsSelect.value = "25";
      expect(getMaxTurns()).toBe(25);
    });

    it("returns parsed integer for single-digit value", () => {
      mockMaxTurnsSelect.value = "5";
      expect(getMaxTurns()).toBe(5);
    });
  });

  describe("init", () => {
    it("restores saved value from localStorage to select element", async () => {
      vi.resetModules();
      localStorage.setItem(STORAGE_KEY, "10");
      mockMaxTurnsSelect.value = "";
      mockMaxTurnsSelect.addEventListener = vi.fn();

      vi.doMock("../../../public/js/core/dom.js", () => ({
        $: {
          maxTurnsSelect: mockMaxTurnsSelect,
        },
      }));

      await import("../../../public/js/ui/max-turns.js");
      expect(mockMaxTurnsSelect.value).toBe("10");
    });

    it("registers a change event listener on the select", async () => {
      vi.resetModules();
      mockMaxTurnsSelect.addEventListener = vi.fn();

      vi.doMock("../../../public/js/core/dom.js", () => ({
        $: {
          maxTurnsSelect: mockMaxTurnsSelect,
        },
      }));

      await import("../../../public/js/ui/max-turns.js");
      expect(mockMaxTurnsSelect.addEventListener).toHaveBeenCalledWith(
        "change",
        expect.any(Function)
      );
    });
  });
});

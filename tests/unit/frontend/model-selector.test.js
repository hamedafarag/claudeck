// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const STORAGE_KEY = "claudeck-model";

const mockModelSelect = {
  value: "",
  addEventListener: vi.fn(),
};

vi.mock("../../../public/js/core/dom.js", () => ({
  $: {
    modelSelect: mockModelSelect,
  },
}));

let getSelectedModel;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  mockModelSelect.value = "";
  mockModelSelect.addEventListener = vi.fn();

  vi.doMock("../../../public/js/core/dom.js", () => ({
    $: {
      modelSelect: mockModelSelect,
    },
  }));

  const mod = await import("../../../public/js/ui/model-selector.js");
  getSelectedModel = mod.getSelectedModel;
});

describe("model-selector", () => {
  describe("getSelectedModel", () => {
    it("returns empty string when select has no value", () => {
      mockModelSelect.value = "";
      expect(getSelectedModel()).toBe("");
    });

    it("returns the current select value", () => {
      mockModelSelect.value = "claude-sonnet-4-20250514";
      expect(getSelectedModel()).toBe("claude-sonnet-4-20250514");
    });

    it("returns value for any model string", () => {
      mockModelSelect.value = "claude-opus-4-20250514";
      expect(getSelectedModel()).toBe("claude-opus-4-20250514");
    });
  });

  describe("init", () => {
    it("restores saved model from localStorage to select element", async () => {
      vi.resetModules();
      localStorage.setItem(STORAGE_KEY, "claude-sonnet-4-20250514");
      mockModelSelect.value = "";
      mockModelSelect.addEventListener = vi.fn();

      vi.doMock("../../../public/js/core/dom.js", () => ({
        $: {
          modelSelect: mockModelSelect,
        },
      }));

      await import("../../../public/js/ui/model-selector.js");
      expect(mockModelSelect.value).toBe("claude-sonnet-4-20250514");
    });

    it("registers a change event listener on the select", async () => {
      vi.resetModules();
      mockModelSelect.addEventListener = vi.fn();

      vi.doMock("../../../public/js/core/dom.js", () => ({
        $: {
          modelSelect: mockModelSelect,
        },
      }));

      await import("../../../public/js/ui/model-selector.js");
      expect(mockModelSelect.addEventListener).toHaveBeenCalledWith(
        "change",
        expect.any(Function)
      );
    });
  });
});

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

let mockTokens;
const mockGetState = vi.fn();
const mockSetState = vi.fn();

const mockContextGauge = {
  classList: {
    _classes: new Set(),
    add(c) { this._classes.add(c); },
    remove(...cs) { cs.forEach((c) => this._classes.delete(c)); },
    contains(c) { return this._classes.has(c); },
  },
  title: "",
};
const mockContextGaugeFill = {
  style: { width: "" },
  classList: {
    _classes: new Set(),
    add(c) { this._classes.add(c); },
    remove(...cs) { cs.forEach((c) => this._classes.delete(c)); },
    contains(c) { return this._classes.has(c); },
  },
};
const mockContextGaugeLabel = { textContent: "" };

vi.mock("../../../public/js/core/store.js", () => ({
  getState: (...args) => mockGetState(...args),
  setState: (...args) => mockSetState(...args),
}));

vi.mock("../../../public/js/core/dom.js", () => ({
  $: {
    contextGauge: mockContextGauge,
    contextGaugeFill: mockContextGaugeFill,
    contextGaugeLabel: mockContextGaugeLabel,
  },
}));

let updateContextGauge, resetContextGauge;

beforeEach(async () => {
  vi.resetModules();

  mockTokens = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
  mockGetState.mockReset();
  mockSetState.mockReset();
  mockGetState.mockReturnValue(mockTokens);

  // Reset mock DOM element state
  mockContextGauge.classList._classes.clear();
  mockContextGauge.title = "";
  mockContextGaugeFill.style.width = "";
  mockContextGaugeFill.classList._classes.clear();
  mockContextGaugeLabel.textContent = "";

  vi.doMock("../../../public/js/core/store.js", () => ({
    getState: (...args) => mockGetState(...args),
    setState: (...args) => mockSetState(...args),
  }));

  vi.doMock("../../../public/js/core/dom.js", () => ({
    $: {
      contextGauge: mockContextGauge,
      contextGaugeFill: mockContextGaugeFill,
      contextGaugeLabel: mockContextGaugeLabel,
    },
  }));

  const mod = await import("../../../public/js/ui/context-gauge.js");
  updateContextGauge = mod.updateContextGauge;
  resetContextGauge = mod.resetContextGauge;
});

describe("context-gauge", () => {
  describe("updateContextGauge", () => {
    it("accumulates input tokens and calls setState", () => {
      updateContextGauge(100, 0, 0, 0);
      expect(mockTokens.input).toBe(100);
      expect(mockSetState).toHaveBeenCalledWith("sessionTokens", expect.objectContaining({ input: 100 }));
    });

    it("accumulates all token types", () => {
      updateContextGauge(100, 50, 200, 30);
      expect(mockTokens.input).toBe(100);
      expect(mockTokens.output).toBe(50);
      expect(mockTokens.cacheRead).toBe(200);
      expect(mockTokens.cacheCreation).toBe(30);
    });

    it("accumulates across multiple calls", () => {
      updateContextGauge(100, 0, 0, 0);
      updateContextGauge(50, 0, 0, 0);
      expect(mockTokens.input).toBe(150);
    });

    it("renders gauge label with formatted tokens", () => {
      updateContextGauge(1500, 500, 0, 0);
      // total = 2000, limit = 200000
      expect(mockContextGaugeLabel.textContent).toBe("2.0k/200.0k");
    });

    it("sets gauge fill width as percentage", () => {
      // 100000 / 200000 = 50%
      updateContextGauge(100000, 0, 0, 0);
      expect(mockContextGaugeFill.style.width).toBe("50%");
    });

    it("adds warning class when usage >= 50%", () => {
      updateContextGauge(100000, 0, 0, 0); // 50%
      expect(mockContextGaugeFill.classList.contains("warning")).toBe(true);
      expect(mockContextGauge.classList.contains("warning")).toBe(true);
    });

    it("adds critical class when usage >= 80%", () => {
      updateContextGauge(160000, 0, 0, 0); // 80%
      expect(mockContextGaugeFill.classList.contains("critical")).toBe(true);
      expect(mockContextGauge.classList.contains("critical")).toBe(true);
    });

    it("does not add warning or critical class when usage < 50%", () => {
      updateContextGauge(10000, 0, 0, 0); // 5%
      expect(mockContextGaugeFill.classList.contains("warning")).toBe(false);
      expect(mockContextGaugeFill.classList.contains("critical")).toBe(false);
    });

    it("removes hidden class from gauge on render", () => {
      mockContextGauge.classList.add("hidden");
      updateContextGauge(1000, 0, 0, 0);
      expect(mockContextGauge.classList.contains("hidden")).toBe(false);
    });

    it("handles undefined/null token values gracefully", () => {
      updateContextGauge(undefined, null, undefined, null);
      expect(mockTokens.input).toBe(0);
      expect(mockTokens.output).toBe(0);
    });
  });

  describe("resetContextGauge", () => {
    it("sets sessionTokens to zeroed object", () => {
      resetContextGauge();
      expect(mockSetState).toHaveBeenCalledWith("sessionTokens", {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheCreation: 0,
      });
    });

    it("adds hidden class to gauge", () => {
      mockContextGauge.classList._classes.clear();
      resetContextGauge();
      expect(mockContextGauge.classList.contains("hidden")).toBe(true);
    });
  });

  describe("formatTokens (via gauge label output)", () => {
    it("formats millions with M suffix", () => {
      updateContextGauge(1_000_000, 0, 0, 0);
      expect(mockContextGaugeLabel.textContent).toContain("1.0M");
    });

    it("formats thousands with k suffix", () => {
      updateContextGauge(5000, 0, 0, 0);
      expect(mockContextGaugeLabel.textContent).toContain("5.0k");
    });

    it("formats small numbers as plain string", () => {
      updateContextGauge(500, 0, 0, 0);
      expect(mockContextGaugeLabel.textContent).toBe("500/200.0k");
    });
  });
});

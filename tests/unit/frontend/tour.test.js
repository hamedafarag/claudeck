// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

let startTour;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();

  // Ensure window.driver is undefined by default
  delete window.driver;

  const mod = await import("../../../public/js/features/tour.js");
  startTour = mod.startTour;
});

describe("tour", () => {
  describe("startTour", () => {
    it("warns and returns when Driver.js is not loaded", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      startTour();

      expect(warnSpy).toHaveBeenCalledWith("Driver.js not loaded");
      warnSpy.mockRestore();
    });

    it("does not throw when Driver.js is not loaded", () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(() => startTour()).not.toThrow();
      console.warn.mockRestore();
    });

    it("calls driver.js.driver() and drive() when Driver.js is loaded", () => {
      const mockDrive = vi.fn();
      const mockDriverFn = vi.fn(() => ({ drive: mockDrive }));

      window.driver = {
        js: {
          driver: mockDriverFn,
        },
      };

      startTour();

      expect(mockDriverFn).toHaveBeenCalledTimes(1);
      expect(mockDrive).toHaveBeenCalledTimes(1);
    });

    it("passes steps array to the driver config", () => {
      const mockDrive = vi.fn();
      const mockDriverFn = vi.fn(() => ({ drive: mockDrive }));

      window.driver = {
        js: {
          driver: mockDriverFn,
        },
      };

      startTour();

      const config = mockDriverFn.mock.calls[0][0];
      expect(config.steps).toBeDefined();
      expect(Array.isArray(config.steps)).toBe(true);
      expect(config.steps.length).toBeGreaterThan(0);
    });

    it("provides an onDestroyed callback that sets localStorage", () => {
      const mockDrive = vi.fn();
      const mockDriverFn = vi.fn(() => ({ drive: mockDrive }));

      window.driver = {
        js: {
          driver: mockDriverFn,
        },
      };

      startTour();

      const config = mockDriverFn.mock.calls[0][0];
      expect(typeof config.onDestroyed).toBe("function");

      // Simulate tour completion
      config.onDestroyed();
      expect(localStorage.getItem("claudeck-tour-completed")).toBe("1");
    });

    it("includes expected config options", () => {
      const mockDrive = vi.fn();
      const mockDriverFn = vi.fn(() => ({ drive: mockDrive }));

      window.driver = {
        js: {
          driver: mockDriverFn,
        },
      };

      startTour();

      const config = mockDriverFn.mock.calls[0][0];
      expect(config.showProgress).toBe(true);
      expect(config.animate).toBe(true);
      expect(config.allowClose).toBe(true);
      expect(config.popoverClass).toBe("claudeck-tour");
    });
  });
});

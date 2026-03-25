// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockThemeIconSun = { style: { display: "" } };
const mockThemeIconMoon = { style: { display: "" } };
const mockThemeToggleBtn = { addEventListener: vi.fn() };

vi.mock("../../../public/js/core/dom.js", () => ({
  $: {
    themeIconSun: mockThemeIconSun,
    themeIconMoon: mockThemeIconMoon,
    themeToggleBtn: mockThemeToggleBtn,
  },
}));

let applyTheme;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  mockThemeIconSun.style.display = "";
  mockThemeIconMoon.style.display = "";
  mockThemeToggleBtn.addEventListener = vi.fn();

  vi.doMock("../../../public/js/core/dom.js", () => ({
    $: {
      themeIconSun: mockThemeIconSun,
      themeIconMoon: mockThemeIconMoon,
      themeToggleBtn: mockThemeToggleBtn,
    },
  }));

  const mod = await import("../../../public/js/ui/theme.js");
  applyTheme = mod.applyTheme;
});

describe("theme", () => {
  describe("applyTheme", () => {
    it("sets data-theme attribute on document element", () => {
      applyTheme("light");
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });

    it("persists theme to localStorage", () => {
      applyTheme("dark");
      expect(localStorage.getItem("claudeck-theme")).toBe("dark");
    });

    it("hides sun icon and shows moon icon for light theme", () => {
      applyTheme("light");
      expect(mockThemeIconSun.style.display).toBe("none");
      expect(mockThemeIconMoon.style.display).toBe("block");
    });

    it("shows sun icon and hides moon icon for dark theme", () => {
      applyTheme("dark");
      expect(mockThemeIconSun.style.display).toBe("block");
      expect(mockThemeIconMoon.style.display).toBe("none");
    });

    it("sets hljs-theme link href for light theme", () => {
      const link = document.createElement("link");
      link.id = "hljs-theme";
      document.head.appendChild(link);

      applyTheme("light");
      expect(link.href).toContain("github.min.css");
      expect(link.href).not.toContain("github-dark");

      link.remove();
    });

    it("sets hljs-theme link href for dark theme", () => {
      const link = document.createElement("link");
      link.id = "hljs-theme";
      document.head.appendChild(link);

      applyTheme("dark");
      expect(link.href).toContain("github-dark.min.css");

      link.remove();
    });

    it("does not throw when hljs-theme link is absent", () => {
      expect(() => applyTheme("dark")).not.toThrow();
    });
  });

  describe("init", () => {
    it("applies default dark theme when no saved theme", async () => {
      vi.resetModules();
      localStorage.clear();
      mockThemeToggleBtn.addEventListener = vi.fn();

      vi.doMock("../../../public/js/core/dom.js", () => ({
        $: {
          themeIconSun: mockThemeIconSun,
          themeIconMoon: mockThemeIconMoon,
          themeToggleBtn: mockThemeToggleBtn,
        },
      }));

      await import("../../../public/js/ui/theme.js");
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    it("applies saved theme from localStorage on load", async () => {
      vi.resetModules();
      localStorage.setItem("claudeck-theme", "light");
      mockThemeToggleBtn.addEventListener = vi.fn();

      vi.doMock("../../../public/js/core/dom.js", () => ({
        $: {
          themeIconSun: mockThemeIconSun,
          themeIconMoon: mockThemeIconMoon,
          themeToggleBtn: mockThemeToggleBtn,
        },
      }));

      await import("../../../public/js/ui/theme.js");
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });

    it("registers click listener on theme toggle button", async () => {
      vi.resetModules();
      mockThemeToggleBtn.addEventListener = vi.fn();

      vi.doMock("../../../public/js/core/dom.js", () => ({
        $: {
          themeIconSun: mockThemeIconSun,
          themeIconMoon: mockThemeIconMoon,
          themeToggleBtn: mockThemeToggleBtn,
        },
      }));

      await import("../../../public/js/ui/theme.js");
      expect(mockThemeToggleBtn.addEventListener).toHaveBeenCalledWith(
        "click",
        expect.any(Function)
      );
    });
  });
});

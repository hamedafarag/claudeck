// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let registerDocSection, openDevDocs, closeDevDocs;

beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = "";

  // dev-docs.js init() looks for this element
  const btn = document.createElement("button");
  btn.id = "dev-docs-btn";
  document.body.appendChild(btn);

  const mod = await import("../../../public/js/panels/dev-docs.js");
  registerDocSection = mod.registerDocSection;
  openDevDocs = mod.openDevDocs;
  closeDevDocs = mod.closeDevDocs;
});

afterEach(() => {
  closeDevDocs();
  document.body.innerHTML = "";
});

describe("dev-docs", () => {
  describe("registerDocSection", () => {
    it("throws if missing id", () => {
      expect(() =>
        registerDocSection({ title: "T", render: () => "" })
      ).toThrow("registerDocSection requires id, title, and render");
    });

    it("throws if missing title", () => {
      expect(() =>
        registerDocSection({ id: "x", render: () => "" })
      ).toThrow("registerDocSection requires id, title, and render");
    });

    it("throws if missing render", () => {
      expect(() =>
        registerDocSection({ id: "x", title: "T" })
      ).toThrow("registerDocSection requires id, title, and render");
    });

    it("does not throw with valid section", () => {
      expect(() =>
        registerDocSection({ id: "test-section", title: "Test", render: () => "<p>hi</p>" })
      ).not.toThrow();
    });
  });

  describe("built-in sections", () => {
    it("registers tab-sdk section", () => {
      openDevDocs("tab-sdk");
      const overlay = document.querySelector(".dev-docs-overlay");
      expect(overlay).not.toBeNull();
      const section = overlay.querySelector('.dev-docs-section[data-section="tab-sdk"]');
      expect(section).not.toBeNull();
      expect(section.innerHTML).toContain("Tab SDK");
    });

    it("registers architecture section", () => {
      openDevDocs("architecture");
      const overlay = document.querySelector(".dev-docs-overlay");
      const section = overlay.querySelector('.dev-docs-section[data-section="architecture"]');
      expect(section).not.toBeNull();
      expect(section.innerHTML).toContain("Architecture");
    });

    it("registers adding-features section", () => {
      openDevDocs("adding-features");
      const overlay = document.querySelector(".dev-docs-overlay");
      const section = overlay.querySelector('.dev-docs-section[data-section="adding-features"]');
      expect(section).not.toBeNull();
    });

    it("registers user-plugins section", () => {
      openDevDocs("user-plugins");
      const overlay = document.querySelector(".dev-docs-overlay");
      const section = overlay.querySelector('.dev-docs-section[data-section="user-plugins"]');
      expect(section).not.toBeNull();
    });

    it("registers resources section", () => {
      openDevDocs("resources");
      const overlay = document.querySelector(".dev-docs-overlay");
      const section = overlay.querySelector('.dev-docs-section[data-section="resources"]');
      expect(section).not.toBeNull();
    });
  });

  describe("openDevDocs", () => {
    it("creates overlay in document.body", () => {
      openDevDocs();
      const overlay = document.querySelector(".dev-docs-overlay");
      expect(overlay).not.toBeNull();
      expect(document.body.contains(overlay)).toBe(true);
    });

    it("renders nav items for all built-in sections", () => {
      openDevDocs();
      const navItems = document.querySelectorAll(".dev-docs-nav-item");
      // At least the 5 built-in sections
      expect(navItems.length).toBeGreaterThanOrEqual(5);
    });

    it("does not create duplicate overlays when called twice", () => {
      openDevDocs();
      openDevDocs();
      const overlays = document.querySelectorAll(".dev-docs-overlay");
      expect(overlays.length).toBe(1);
    });

    it("switches section when called again with a different sectionId", () => {
      openDevDocs("tab-sdk");
      const overlay = document.querySelector(".dev-docs-overlay");
      // tab-sdk section should be active
      const tabSdk = overlay.querySelector('.dev-docs-section[data-section="tab-sdk"]');
      expect(tabSdk.classList.contains("active")).toBe(true);

      // Open again with different section
      openDevDocs("architecture");
      const arch = overlay.querySelector('.dev-docs-section[data-section="architecture"]');
      expect(arch.classList.contains("active")).toBe(true);
    });

    it("shows close button", () => {
      openDevDocs();
      const closeBtn = document.querySelector(".dev-docs-close");
      expect(closeBtn).not.toBeNull();
    });
  });

  describe("closeDevDocs", () => {
    it("removes overlay from document.body", () => {
      openDevDocs();
      expect(document.querySelector(".dev-docs-overlay")).not.toBeNull();
      closeDevDocs();
      expect(document.querySelector(".dev-docs-overlay")).toBeNull();
    });

    it("does nothing if overlay is not open", () => {
      expect(() => closeDevDocs()).not.toThrow();
    });
  });

  describe("init", () => {
    it("wires up the dev-docs-btn click handler", () => {
      const btn = document.getElementById("dev-docs-btn");
      expect(btn).not.toBeNull();
      btn.click();
      const overlay = document.querySelector(".dev-docs-overlay");
      expect(overlay).not.toBeNull();
    });
  });
});

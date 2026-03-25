// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

beforeEach(async () => {
  // Create and insert the component
  const el = document.createElement("claudeck-shortcuts-modal");
  document.body.appendChild(el);

  // Define the custom element (dynamic import so resetModules works)
  await import("../../../public/js/components/shortcuts-modal.js");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("claudeck-shortcuts-modal", () => {
  it("renders the modal overlay", () => {
    const overlay = document.getElementById("shortcuts-modal");
    expect(overlay).not.toBeNull();
    expect(overlay.classList.contains("modal-overlay")).toBe(true);
  });

  it("starts hidden", () => {
    const overlay = document.getElementById("shortcuts-modal");
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("renders the close button", () => {
    const closeBtn = document.getElementById("shortcuts-modal-close");
    expect(closeBtn).not.toBeNull();
  });

  it("renders all keyboard shortcut rows", () => {
    const rows = document.querySelectorAll(".shortcuts-table tr");
    expect(rows.length).toBeGreaterThanOrEqual(15);
  });

  it("contains expected shortcuts", () => {
    const table = document.querySelector(".shortcuts-table");
    const text = table.textContent;
    expect(text).toContain("Focus session search");
    expect(text).toContain("New session");
    expect(text).toContain("Toggle right panel");
    expect(text).toContain("Send message");
    expect(text).toContain("Slash commands autocomplete");
  });

  it("close button hides the modal", () => {
    const overlay = document.getElementById("shortcuts-modal");
    const closeBtn = document.getElementById("shortcuts-modal-close");

    overlay.classList.remove("hidden");
    closeBtn.click();
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking backdrop hides the modal", () => {
    const overlay = document.getElementById("shortcuts-modal");
    overlay.classList.remove("hidden");

    // Click directly on the overlay (not the inner .modal)
    overlay.dispatchEvent(new Event("click", { bubbles: true }));
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking inside modal does not hide it", () => {
    const overlay = document.getElementById("shortcuts-modal");
    overlay.classList.remove("hidden");

    const modal = overlay.querySelector(".modal");
    modal.click();
    expect(overlay.classList.contains("hidden")).toBe(false);
  });
});

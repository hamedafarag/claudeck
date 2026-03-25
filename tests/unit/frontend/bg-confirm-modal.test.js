// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

beforeEach(async () => {
  const el = document.createElement("claudeck-bg-confirm");
  document.body.appendChild(el);
  await import("../../../public/js/components/bg-confirm-modal.js");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("claudeck-bg-confirm", () => {
  it("renders the modal overlay", () => {
    expect(document.getElementById("bg-confirm-modal")).not.toBeNull();
  });

  it("starts hidden", () => {
    expect(
      document.getElementById("bg-confirm-modal").classList.contains("hidden")
    ).toBe(true);
  });

  it("has data-persistent attribute", () => {
    const overlay = document.getElementById("bg-confirm-modal");
    expect(overlay.hasAttribute("data-persistent")).toBe(true);
  });

  it("has cancel button", () => {
    expect(document.getElementById("bg-confirm-cancel")).not.toBeNull();
  });

  it("has abort button", () => {
    expect(document.getElementById("bg-confirm-abort")).not.toBeNull();
  });

  it("has background button", () => {
    expect(document.getElementById("bg-confirm-background")).not.toBeNull();
  });

  it("does not close on backdrop click (no handler registered)", () => {
    const overlay = document.getElementById("bg-confirm-modal");
    overlay.classList.remove("hidden");
    overlay.dispatchEvent(new Event("click", { bubbles: true }));
    expect(overlay.classList.contains("hidden")).toBe(false);
  });
});

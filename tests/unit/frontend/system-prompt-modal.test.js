// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

beforeEach(async () => {
  const el = document.createElement("claudeck-system-prompt-modal");
  document.body.appendChild(el);
  await import("../../../public/js/components/system-prompt-modal.js");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("claudeck-system-prompt-modal", () => {
  it("renders the modal overlay", () => {
    const overlay = document.getElementById("system-prompt-modal");
    expect(overlay).not.toBeNull();
  });

  it("starts hidden", () => {
    const overlay = document.getElementById("system-prompt-modal");
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("has a system prompt form", () => {
    expect(document.getElementById("system-prompt-form")).not.toBeNull();
  });

  it("has a textarea", () => {
    expect(document.getElementById("sp-textarea")).not.toBeNull();
  });

  it("has a clear button", () => {
    expect(document.getElementById("sp-clear-btn")).not.toBeNull();
  });

  it("has a cancel button", () => {
    expect(document.getElementById("sp-cancel-btn")).not.toBeNull();
  });

  it("close button hides the modal", () => {
    const overlay = document.getElementById("system-prompt-modal");
    const closeBtn = document.getElementById("sp-modal-close");

    overlay.classList.remove("hidden");
    closeBtn.click();
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking backdrop hides the modal", () => {
    const overlay = document.getElementById("system-prompt-modal");
    overlay.classList.remove("hidden");

    overlay.dispatchEvent(new Event("click", { bubbles: true }));
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking inside modal does not hide it", () => {
    const overlay = document.getElementById("system-prompt-modal");
    overlay.classList.remove("hidden");

    const modal = overlay.querySelector(".modal");
    modal.click();
    expect(overlay.classList.contains("hidden")).toBe(false);
  });
});

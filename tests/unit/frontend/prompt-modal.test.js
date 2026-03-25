// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

beforeEach(async () => {
  const el = document.createElement("claudeck-prompt-modal");
  document.body.appendChild(el);
  await import("../../../public/js/components/prompt-modal.js");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("claudeck-prompt-modal", () => {
  it("renders the modal overlay", () => {
    const overlay = document.getElementById("prompt-modal");
    expect(overlay).not.toBeNull();
  });

  it("starts hidden", () => {
    const overlay = document.getElementById("prompt-modal");
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("has a prompt form", () => {
    expect(document.getElementById("prompt-form")).not.toBeNull();
  });

  it("has a prompt title input", () => {
    expect(document.getElementById("prompt-title")).not.toBeNull();
  });

  it("has a prompt description input", () => {
    expect(document.getElementById("prompt-desc")).not.toBeNull();
  });

  it("has a prompt text area", () => {
    expect(document.getElementById("prompt-text")).not.toBeNull();
  });

  it("has a cancel button", () => {
    expect(document.getElementById("modal-cancel")).not.toBeNull();
  });

  it("close button hides the modal", () => {
    const overlay = document.getElementById("prompt-modal");
    const closeBtn = document.getElementById("modal-close");

    overlay.classList.remove("hidden");
    closeBtn.click();
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking backdrop hides the modal", () => {
    const overlay = document.getElementById("prompt-modal");
    overlay.classList.remove("hidden");

    overlay.dispatchEvent(new Event("click", { bubbles: true }));
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking inside modal does not hide it", () => {
    const overlay = document.getElementById("prompt-modal");
    overlay.classList.remove("hidden");

    const modal = overlay.querySelector(".modal");
    modal.click();
    expect(overlay.classList.contains("hidden")).toBe(false);
  });
});

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

beforeEach(async () => {
  const el = document.createElement("claudeck-dag-editor");
  document.body.appendChild(el);
  await import("../../../public/js/components/dag-editor-modal.js");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("claudeck-dag-editor", () => {
  it("renders the modal overlay", () => {
    expect(document.getElementById("dag-modal")).not.toBeNull();
  });

  it("starts hidden", () => {
    expect(
      document.getElementById("dag-modal").classList.contains("hidden")
    ).toBe(true);
  });

  it("close button hides the modal", () => {
    const overlay = document.getElementById("dag-modal");
    overlay.classList.remove("hidden");
    document.getElementById("dag-modal-close").click();
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking backdrop hides the modal", () => {
    const overlay = document.getElementById("dag-modal");
    overlay.classList.remove("hidden");
    overlay.dispatchEvent(new Event("click", { bubbles: true }));
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking inside modal does not hide it", () => {
    const overlay = document.getElementById("dag-modal");
    overlay.classList.remove("hidden");
    overlay.querySelector(".modal").click();
    expect(overlay.classList.contains("hidden")).toBe(false);
  });

  it("has dag canvas SVG", () => {
    const canvas = document.getElementById("dag-canvas");
    expect(canvas).not.toBeNull();
    expect(canvas.tagName.toLowerCase()).toBe("svg");
  });

  it("has node palette", () => {
    expect(document.getElementById("dag-node-palette")).not.toBeNull();
  });

  it("has form title input", () => {
    expect(document.getElementById("dag-form-title")).not.toBeNull();
  });

  it("has save button", () => {
    expect(document.getElementById("dag-modal-save")).not.toBeNull();
  });
});

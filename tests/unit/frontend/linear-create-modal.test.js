// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

beforeEach(async () => {
  const el = document.createElement("claudeck-linear-create");
  document.body.appendChild(el);
  await import("../../../public/js/components/linear-create-modal.js");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("claudeck-linear-create", () => {
  it("renders the modal overlay", () => {
    const overlay = document.getElementById("linear-create-modal");
    expect(overlay).not.toBeNull();
  });

  it("starts hidden", () => {
    const overlay = document.getElementById("linear-create-modal");
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("has a create form", () => {
    expect(document.getElementById("linear-create-form")).not.toBeNull();
  });

  it("has a title input", () => {
    expect(document.getElementById("linear-create-title")).not.toBeNull();
  });

  it("has a team select", () => {
    expect(document.getElementById("linear-create-team")).not.toBeNull();
  });

  it("has a state select", () => {
    expect(document.getElementById("linear-create-state")).not.toBeNull();
  });

  it("close button hides the modal", () => {
    const overlay = document.getElementById("linear-create-modal");
    const closeBtn = document.getElementById("linear-create-close");

    overlay.classList.remove("hidden");
    closeBtn.click();
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking backdrop hides the modal", () => {
    const overlay = document.getElementById("linear-create-modal");
    overlay.classList.remove("hidden");

    overlay.dispatchEvent(new Event("click", { bubbles: true }));
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking inside modal does not hide it", () => {
    const overlay = document.getElementById("linear-create-modal");
    overlay.classList.remove("hidden");

    const modal = overlay.querySelector(".modal");
    modal.click();
    expect(overlay.classList.contains("hidden")).toBe(false);
  });
});

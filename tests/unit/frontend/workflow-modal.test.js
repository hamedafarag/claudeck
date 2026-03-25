// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

beforeEach(async () => {
  const el = document.createElement("claudeck-workflow-modal");
  document.body.appendChild(el);
  await import("../../../public/js/components/workflow-modal.js");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("claudeck-workflow-modal", () => {
  it("renders the modal overlay", () => {
    expect(document.getElementById("wf-modal")).not.toBeNull();
  });

  it("starts hidden", () => {
    expect(
      document.getElementById("wf-modal").classList.contains("hidden")
    ).toBe(true);
  });

  it("close button hides the modal", () => {
    const overlay = document.getElementById("wf-modal");
    overlay.classList.remove("hidden");
    document.getElementById("wf-modal-close").click();
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking backdrop hides the modal", () => {
    const overlay = document.getElementById("wf-modal");
    overlay.classList.remove("hidden");
    overlay.dispatchEvent(new Event("click", { bubbles: true }));
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking inside modal does not hide it", () => {
    const overlay = document.getElementById("wf-modal");
    overlay.classList.remove("hidden");
    overlay.querySelector(".modal").click();
    expect(overlay.classList.contains("hidden")).toBe(false);
  });

  it("has workflow form", () => {
    const form = document.getElementById("wf-form");
    expect(form).not.toBeNull();
    expect(form.tagName.toLowerCase()).toBe("form");
  });

  it("has steps list", () => {
    expect(document.getElementById("wf-steps-list")).not.toBeNull();
  });

  it("has add step button", () => {
    expect(document.getElementById("wf-add-step-btn")).not.toBeNull();
  });
});

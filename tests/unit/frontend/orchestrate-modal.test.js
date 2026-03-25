// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

beforeEach(async () => {
  const el = document.createElement("claudeck-orchestrate-modal");
  document.body.appendChild(el);
  await import("../../../public/js/components/orchestrate-modal.js");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("claudeck-orchestrate-modal", () => {
  it("renders the modal overlay", () => {
    expect(document.getElementById("orch-modal")).not.toBeNull();
  });

  it("starts hidden", () => {
    expect(
      document.getElementById("orch-modal").classList.contains("hidden")
    ).toBe(true);
  });

  it("close button hides the modal", () => {
    const overlay = document.getElementById("orch-modal");
    overlay.classList.remove("hidden");
    document.getElementById("orch-modal-close").click();
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking backdrop hides the modal", () => {
    const overlay = document.getElementById("orch-modal");
    overlay.classList.remove("hidden");
    overlay.dispatchEvent(new Event("click", { bubbles: true }));
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking inside modal does not hide it", () => {
    const overlay = document.getElementById("orch-modal");
    overlay.classList.remove("hidden");
    overlay.querySelector(".modal").click();
    expect(overlay.classList.contains("hidden")).toBe(false);
  });

  it("has task input textarea", () => {
    expect(document.getElementById("orch-task-input")).not.toBeNull();
    expect(
      document.getElementById("orch-task-input").tagName.toLowerCase()
    ).toBe("textarea");
  });

  it("has run button", () => {
    expect(document.getElementById("orch-modal-run")).not.toBeNull();
  });

  it("has explainer steps", () => {
    const overlay = document.getElementById("orch-modal");
    const steps = overlay.querySelectorAll(".explainer-step, .orch-step, ol li");
    expect(steps.length).toBeGreaterThan(0);
  });
});

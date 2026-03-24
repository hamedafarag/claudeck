// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

beforeEach(async () => {
  const el = document.createElement("claudeck-agent-modal");
  document.body.appendChild(el);
  await import("../../../public/js/components/agent-modal.js");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("claudeck-agent-modal", () => {
  it("renders the modal overlay", () => {
    expect(document.getElementById("agent-modal")).not.toBeNull();
  });

  it("starts hidden", () => {
    expect(
      document.getElementById("agent-modal").classList.contains("hidden")
    ).toBe(true);
  });

  it("close button hides the modal", () => {
    const overlay = document.getElementById("agent-modal");
    overlay.classList.remove("hidden");
    document.getElementById("agent-modal-close").click();
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking backdrop hides the modal", () => {
    const overlay = document.getElementById("agent-modal");
    overlay.classList.remove("hidden");
    overlay.dispatchEvent(new Event("click", { bubbles: true }));
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking inside modal does not hide it", () => {
    const overlay = document.getElementById("agent-modal");
    overlay.classList.remove("hidden");
    overlay.querySelector(".modal").click();
    expect(overlay.classList.contains("hidden")).toBe(false);
  });

  it("has agent form", () => {
    const form = document.getElementById("agent-form");
    expect(form).not.toBeNull();
    expect(form.tagName.toLowerCase()).toBe("form");
  });

  it("has title input", () => {
    expect(document.getElementById("agent-form-title")).not.toBeNull();
  });

  it("has goal input", () => {
    expect(document.getElementById("agent-form-goal")).not.toBeNull();
  });

  it("has max turns input", () => {
    expect(document.getElementById("agent-form-max-turns")).not.toBeNull();
  });
});

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

beforeEach(async () => {
  const el = document.createElement("claudeck-permission-modal");
  document.body.appendChild(el);
  await import("../../../public/js/components/permission-modal.js");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("claudeck-permission-modal", () => {
  it("renders the modal overlay", () => {
    expect(document.getElementById("perm-modal")).not.toBeNull();
  });

  it("starts hidden", () => {
    expect(
      document.getElementById("perm-modal").classList.contains("hidden")
    ).toBe(true);
  });

  it("has data-persistent attribute", () => {
    const overlay = document.getElementById("perm-modal");
    expect(overlay.hasAttribute("data-persistent")).toBe(true);
  });

  it("has tool name element", () => {
    expect(document.getElementById("perm-modal-tool-name")).not.toBeNull();
  });

  it("has summary element", () => {
    expect(document.getElementById("perm-modal-summary")).not.toBeNull();
  });

  it("has input element", () => {
    expect(document.getElementById("perm-modal-input")).not.toBeNull();
  });

  it("has allow button", () => {
    expect(document.getElementById("perm-allow-btn")).not.toBeNull();
  });

  it("has deny button", () => {
    expect(document.getElementById("perm-deny-btn")).not.toBeNull();
  });

  it("has always-allow checkbox", () => {
    const cb = document.getElementById("perm-always-allow-cb");
    expect(cb).not.toBeNull();
    expect(cb.type).toBe("checkbox");
  });

  it("does not close on backdrop click (no handler registered)", () => {
    const overlay = document.getElementById("perm-modal");
    overlay.classList.remove("hidden");
    overlay.dispatchEvent(new Event("click", { bubbles: true }));
    expect(overlay.classList.contains("hidden")).toBe(false);
  });
});

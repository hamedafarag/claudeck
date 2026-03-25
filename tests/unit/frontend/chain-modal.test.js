// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

beforeEach(async () => {
  const el = document.createElement("claudeck-chain-modal");
  document.body.appendChild(el);
  await import("../../../public/js/components/chain-modal.js");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("claudeck-chain-modal", () => {
  it("renders the modal overlay", () => {
    expect(document.getElementById("chain-modal")).not.toBeNull();
  });

  it("starts hidden", () => {
    expect(
      document.getElementById("chain-modal").classList.contains("hidden")
    ).toBe(true);
  });

  it("close button hides the modal", () => {
    const overlay = document.getElementById("chain-modal");
    overlay.classList.remove("hidden");
    document.getElementById("chain-modal-close").click();
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking backdrop hides the modal", () => {
    const overlay = document.getElementById("chain-modal");
    overlay.classList.remove("hidden");
    overlay.dispatchEvent(new Event("click", { bubbles: true }));
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking inside modal does not hide it", () => {
    const overlay = document.getElementById("chain-modal");
    overlay.classList.remove("hidden");
    overlay.querySelector(".modal").click();
    expect(overlay.classList.contains("hidden")).toBe(false);
  });

  it("has chain form", () => {
    const form = document.getElementById("chain-form");
    expect(form).not.toBeNull();
    expect(form.tagName.toLowerCase()).toBe("form");
  });

  it("has agent list", () => {
    expect(document.getElementById("chain-agent-list")).not.toBeNull();
  });

  it("has add agent button", () => {
    expect(document.getElementById("chain-add-agent-btn")).not.toBeNull();
  });

  it("has context select", () => {
    const select = document.getElementById("chain-form-context");
    expect(select).not.toBeNull();
    expect(select.tagName.toLowerCase()).toBe("select");
  });
});

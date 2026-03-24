// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

beforeEach(async () => {
  const el = document.createElement("claudeck-mcp-modal");
  document.body.appendChild(el);
  await import("../../../public/js/components/mcp-modal.js");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("claudeck-mcp-modal", () => {
  it("renders the modal overlay", () => {
    expect(document.getElementById("mcp-modal")).not.toBeNull();
  });

  it("starts hidden", () => {
    expect(
      document.getElementById("mcp-modal").classList.contains("hidden")
    ).toBe(true);
  });

  it("close button hides the modal", () => {
    const overlay = document.getElementById("mcp-modal");
    overlay.classList.remove("hidden");
    document.getElementById("mcp-modal-close").click();
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking backdrop hides the modal", () => {
    const overlay = document.getElementById("mcp-modal");
    overlay.classList.remove("hidden");
    overlay.dispatchEvent(new Event("click", { bubbles: true }));
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking inside modal does not hide it", () => {
    const overlay = document.getElementById("mcp-modal");
    overlay.classList.remove("hidden");
    overlay.querySelector(".modal").click();
    expect(overlay.classList.contains("hidden")).toBe(false);
  });

  it("has server list container", () => {
    expect(document.getElementById("mcp-server-list")).not.toBeNull();
  });

  it("has form container", () => {
    expect(document.getElementById("mcp-form-container")).not.toBeNull();
  });

  it("has form element", () => {
    const form = document.getElementById("mcp-form");
    expect(form).not.toBeNull();
    expect(form.tagName.toLowerCase()).toBe("form");
  });

  it("has name input", () => {
    expect(document.getElementById("mcp-name")).not.toBeNull();
  });

  it("has type select", () => {
    const select = document.getElementById("mcp-type");
    expect(select).not.toBeNull();
    expect(select.tagName.toLowerCase()).toBe("select");
  });

  it("has command input", () => {
    expect(document.getElementById("mcp-command")).not.toBeNull();
  });

  it("has url input", () => {
    expect(document.getElementById("mcp-url")).not.toBeNull();
  });

  it("has add server button", () => {
    expect(document.getElementById("mcp-add-btn")).not.toBeNull();
  });
});

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

beforeEach(async () => {
  const el = document.createElement("claudeck-add-project");
  document.body.appendChild(el);
  await import("../../../public/js/components/add-project-modal.js");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("claudeck-add-project", () => {
  it("renders the modal overlay", () => {
    const overlay = document.getElementById("add-project-modal");
    expect(overlay).not.toBeNull();
  });

  it("starts hidden", () => {
    const overlay = document.getElementById("add-project-modal");
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("has a folder breadcrumb", () => {
    expect(document.getElementById("folder-breadcrumb")).not.toBeNull();
  });

  it("has a folder list", () => {
    expect(document.getElementById("folder-list")).not.toBeNull();
  });

  it("has a project name input", () => {
    expect(document.getElementById("add-project-name")).not.toBeNull();
  });

  it("has a confirm button", () => {
    expect(document.getElementById("add-project-confirm")).not.toBeNull();
  });

  it("close button hides the modal", () => {
    const overlay = document.getElementById("add-project-modal");
    const closeBtn = document.getElementById("add-project-close");

    overlay.classList.remove("hidden");
    closeBtn.click();
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking backdrop hides the modal", () => {
    const overlay = document.getElementById("add-project-modal");
    overlay.classList.remove("hidden");

    overlay.dispatchEvent(new Event("click", { bubbles: true }));
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking inside modal does not hide it", () => {
    const overlay = document.getElementById("add-project-modal");
    overlay.classList.remove("hidden");

    const modal = overlay.querySelector(".modal");
    modal.click();
    expect(overlay.classList.contains("hidden")).toBe(false);
  });
});

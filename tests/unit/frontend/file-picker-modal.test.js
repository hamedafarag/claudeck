// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

beforeEach(async () => {
  const el = document.createElement("claudeck-file-picker");
  document.body.appendChild(el);
  await import("../../../public/js/components/file-picker-modal.js");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("claudeck-file-picker", () => {
  it("renders the modal overlay", () => {
    const overlay = document.getElementById("file-picker-modal");
    expect(overlay).not.toBeNull();
  });

  it("starts hidden", () => {
    const overlay = document.getElementById("file-picker-modal");
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("has a search input", () => {
    expect(document.getElementById("fp-search")).not.toBeNull();
  });

  it("has a file list container", () => {
    expect(document.getElementById("fp-list")).not.toBeNull();
  });

  it("has a file count element", () => {
    expect(document.getElementById("fp-count")).not.toBeNull();
  });

  it("has a selected files container", () => {
    expect(document.getElementById("fp-selected")).not.toBeNull();
  });

  it("has an empty state element", () => {
    expect(document.getElementById("fp-empty")).not.toBeNull();
  });

  it("close button hides the modal", () => {
    const overlay = document.getElementById("file-picker-modal");
    const closeBtn = document.getElementById("fp-modal-close");

    overlay.classList.remove("hidden");
    closeBtn.click();
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("done button hides the modal", () => {
    const overlay = document.getElementById("file-picker-modal");
    const doneBtn = document.getElementById("fp-done-btn");

    overlay.classList.remove("hidden");
    doneBtn.click();
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking backdrop hides the modal", () => {
    const overlay = document.getElementById("file-picker-modal");
    overlay.classList.remove("hidden");

    overlay.dispatchEvent(new Event("click", { bubbles: true }));
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking inside modal does not hide it", () => {
    const overlay = document.getElementById("file-picker-modal");
    overlay.classList.remove("hidden");

    const modal = overlay.querySelector(".modal");
    modal.click();
    expect(overlay.classList.contains("hidden")).toBe(false);
  });
});

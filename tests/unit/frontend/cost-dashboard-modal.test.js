// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

beforeEach(async () => {
  const el = document.createElement("claudeck-cost-dashboard");
  document.body.appendChild(el);
  await import("../../../public/js/components/cost-dashboard-modal.js");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("claudeck-cost-dashboard", () => {
  it("renders the modal overlay", () => {
    const overlay = document.getElementById("cost-dashboard-modal");
    expect(overlay).not.toBeNull();
  });

  it("starts hidden", () => {
    const overlay = document.getElementById("cost-dashboard-modal");
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("has summary cards container", () => {
    expect(document.getElementById("cost-summary-cards")).not.toBeNull();
  });

  it("has a table body for cost data", () => {
    expect(document.getElementById("cost-table-body")).not.toBeNull();
  });

  it("has a cost chart element", () => {
    expect(document.getElementById("cost-chart")).not.toBeNull();
  });

  it("has sortable table headers", () => {
    const headers = document.querySelectorAll(".cost-table th[data-sort]");
    expect(headers.length).toBeGreaterThan(0);
  });

  it("close button hides the modal", () => {
    const overlay = document.getElementById("cost-dashboard-modal");
    const closeBtn = document.getElementById("cost-modal-close");

    overlay.classList.remove("hidden");
    closeBtn.click();
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking backdrop hides the modal", () => {
    const overlay = document.getElementById("cost-dashboard-modal");
    overlay.classList.remove("hidden");

    overlay.dispatchEvent(new Event("click", { bubbles: true }));
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking inside modal does not hide it", () => {
    const overlay = document.getElementById("cost-dashboard-modal");
    overlay.classList.remove("hidden");

    const modal = overlay.querySelector(".modal");
    modal.click();
    expect(overlay.classList.contains("hidden")).toBe(false);
  });
});

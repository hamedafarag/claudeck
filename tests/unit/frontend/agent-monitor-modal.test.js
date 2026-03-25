// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

beforeEach(async () => {
  const el = document.createElement("claudeck-agent-monitor-modal");
  document.body.appendChild(el);
  await import("../../../public/js/components/agent-monitor-modal.js");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("claudeck-agent-monitor-modal", () => {
  it("renders the modal overlay", () => {
    expect(document.getElementById("agent-monitor-modal")).not.toBeNull();
  });

  it("starts hidden", () => {
    expect(
      document
        .getElementById("agent-monitor-modal")
        .classList.contains("hidden")
    ).toBe(true);
  });

  it("close button hides the modal", () => {
    const overlay = document.getElementById("agent-monitor-modal");
    overlay.classList.remove("hidden");
    document.getElementById("agent-monitor-close").click();
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking backdrop hides the modal", () => {
    const overlay = document.getElementById("agent-monitor-modal");
    overlay.classList.remove("hidden");
    overlay.dispatchEvent(new Event("click", { bubbles: true }));
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking inside modal does not hide it", () => {
    const overlay = document.getElementById("agent-monitor-modal");
    overlay.classList.remove("hidden");
    overlay.querySelector(".modal").click();
    expect(overlay.classList.contains("hidden")).toBe(false);
  });

  it("has agent monitor content div", () => {
    expect(document.getElementById("agent-monitor-content")).not.toBeNull();
  });
});

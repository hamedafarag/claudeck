// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

beforeEach(async () => {
  const el = document.createElement("claudeck-welcome-overlay");
  document.body.appendChild(el);
  await import("../../../public/js/components/welcome-overlay.js");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("claudeck-welcome-overlay", () => {
  it("renders the welcome overlay", () => {
    expect(document.getElementById("welcome-overlay")).not.toBeNull();
  });

  it("starts hidden", () => {
    expect(
      document.getElementById("welcome-overlay").classList.contains("hidden")
    ).toBe(true);
  });

  it("has get started button", () => {
    expect(document.getElementById("welcome-get-started")).not.toBeNull();
  });

  it("has take tour button", () => {
    expect(document.getElementById("welcome-take-tour")).not.toBeNull();
  });

  it("contains welcome text", () => {
    const overlay = document.getElementById("welcome-overlay");
    expect(overlay.textContent).toContain("Welcome to");
    expect(overlay.textContent).toContain("Claudeck");
  });

  it("has AI Chat feature description", () => {
    const overlay = document.getElementById("welcome-overlay");
    expect(overlay.textContent).toContain("AI Chat");
  });

  it("has Agents & Workflows feature description", () => {
    const overlay = document.getElementById("welcome-overlay");
    expect(overlay.textContent).toContain("Agents & Workflows");
  });

  it("has Dev Tools feature description", () => {
    const overlay = document.getElementById("welcome-overlay");
    expect(overlay.textContent).toContain("Dev Tools");
  });

  it("has exactly 3 feature blocks", () => {
    const features = document.querySelectorAll(".welcome-feature");
    expect(features.length).toBe(3);
  });
});

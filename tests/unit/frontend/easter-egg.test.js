// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("easter-egg", () => {
  it("loads without error", async () => {
    await expect(
      import("../../../public/js/features/easter-egg.js")
    ).resolves.not.toThrow();
  });

  it("registers a click listener on document", async () => {
    const spy = vi.spyOn(document, "addEventListener");
    vi.resetModules();
    await import("../../../public/js/features/easter-egg.js");
    const clickCalls = spy.mock.calls.filter(
      ([event]) => event === "click"
    );
    expect(clickCalls.length).toBeGreaterThanOrEqual(1);
    spy.mockRestore();
  });

  it("does not activate with fewer than 5 clicks", async () => {
    vi.resetModules();
    await import("../../../public/js/features/easter-egg.js");

    // Create a .whaly-placeholder with an img inside
    const placeholder = document.createElement("div");
    placeholder.className = "whaly-placeholder";
    const img = document.createElement("img");
    placeholder.appendChild(img);
    document.body.appendChild(placeholder);

    // Click 3 times — should not activate
    for (let i = 0; i < 3; i++) {
      img.click();
    }

    expect(placeholder.querySelector(".whaly-bubble")).toBeNull();
    placeholder.remove();
  });

  it("activates after 5 rapid clicks on .whaly-placeholder img", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    await import("../../../public/js/features/easter-egg.js");

    const placeholder = document.createElement("div");
    placeholder.className = "whaly-placeholder";
    const img = document.createElement("img");
    placeholder.appendChild(img);
    document.body.appendChild(placeholder);

    // Click 5 times rapidly
    for (let i = 0; i < 5; i++) {
      img.click();
    }

    const bubble = placeholder.querySelector(".whaly-bubble");
    expect(bubble).not.toBeNull();
    expect(img.classList.contains("whaly-wiggle")).toBe(true);

    placeholder.remove();
    vi.useRealTimers();
  });
});

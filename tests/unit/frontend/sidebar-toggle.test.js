// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSessionList = { addEventListener: vi.fn() };

vi.mock("../../../public/js/core/dom.js", () => ({
  $: {
    sessionList: mockSessionList,
  },
}));

beforeEach(async () => {
  vi.resetModules();
  document.body.classList.remove("sidebar-open");

  // Create required DOM elements
  const btn = document.createElement("button");
  btn.id = "sidebar-toggle-btn";
  document.body.appendChild(btn);

  const backdrop = document.createElement("div");
  backdrop.id = "sidebar-backdrop";
  document.body.appendChild(backdrop);

  mockSessionList.addEventListener = vi.fn();

  vi.doMock("../../../public/js/core/dom.js", () => ({
    $: {
      sessionList: mockSessionList,
    },
  }));

  await import("../../../public/js/ui/sidebar-toggle.js");
});

afterEach(() => {
  document.getElementById("sidebar-toggle-btn")?.remove();
  document.getElementById("sidebar-backdrop")?.remove();
  document.body.classList.remove("sidebar-open");
});

describe("sidebar-toggle", () => {
  it("imports without error", () => {
    expect(true).toBe(true);
  });

  it("toggles sidebar-open class on button click", () => {
    const btn = document.getElementById("sidebar-toggle-btn");
    btn.click();
    expect(document.body.classList.contains("sidebar-open")).toBe(true);

    btn.click();
    expect(document.body.classList.contains("sidebar-open")).toBe(false);
  });

  it("closes sidebar on backdrop click", () => {
    const btn = document.getElementById("sidebar-toggle-btn");
    const backdrop = document.getElementById("sidebar-backdrop");

    btn.click(); // open
    expect(document.body.classList.contains("sidebar-open")).toBe(true);

    backdrop.click(); // close
    expect(document.body.classList.contains("sidebar-open")).toBe(false);
  });
});

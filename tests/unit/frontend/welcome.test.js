// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

const STORAGE_KEY = "claudeck-welcome-seen";

const mockStartTour = vi.fn();

vi.mock("../../../public/js/features/tour.js", () => ({
  startTour: (...args) => mockStartTour(...args),
}));

function createOverlayDOM() {
  const overlay = document.createElement("div");
  overlay.id = "welcome-overlay";
  overlay.classList.add("hidden");
  document.body.appendChild(overlay);

  const getStartedBtn = document.createElement("button");
  getStartedBtn.id = "welcome-get-started";
  overlay.appendChild(getStartedBtn);

  const tourBtn = document.createElement("button");
  tourBtn.id = "welcome-take-tour";
  overlay.appendChild(tourBtn);

  return { overlay, getStartedBtn, tourBtn };
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  mockStartTour.mockClear();

  // Clean up any DOM leftovers
  document.body.innerHTML = "";

  vi.doMock("../../../public/js/features/tour.js", () => ({
    startTour: (...args) => mockStartTour(...args),
  }));
});

describe("welcome", () => {
  it("does not show overlay when already seen", async () => {
    localStorage.setItem(STORAGE_KEY, "1");
    const { overlay } = createOverlayDOM();

    await import("../../../public/js/features/welcome.js");

    // Overlay should remain hidden
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("shows overlay when not previously seen", async () => {
    const { overlay } = createOverlayDOM();

    await import("../../../public/js/features/welcome.js");

    // init() removes the 'hidden' class
    expect(overlay.classList.contains("hidden")).toBe(false);
  });

  it("sets localStorage and starts hiding overlay on get-started click", async () => {
    const { overlay, getStartedBtn } = createOverlayDOM();

    await import("../../../public/js/features/welcome.js");

    getStartedBtn.click();

    expect(localStorage.getItem(STORAGE_KEY)).toBe("1");
    // The dismiss function adds 'hiding' class
    expect(overlay.classList.contains("hiding")).toBe(true);
  });

  it("sets localStorage on take-tour click", async () => {
    const { tourBtn } = createOverlayDOM();

    await import("../../../public/js/features/welcome.js");

    tourBtn.click();

    expect(localStorage.getItem(STORAGE_KEY)).toBe("1");
  });

  it("does not show overlay when overlay element is missing", async () => {
    // Don't create any DOM elements
    await expect(
      import("../../../public/js/features/welcome.js")
    ).resolves.not.toThrow();
  });
});

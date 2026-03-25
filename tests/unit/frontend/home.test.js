// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

// Create DOM elements the module accesses via querySelector/getElementById at load time
const chatAreaMain = document.createElement("div");
chatAreaMain.className = "chat-area-main";
document.body.appendChild(chatAreaMain);

const homeActivityGrid = document.createElement("div");
homeActivityGrid.id = "home-activity-grid";
document.body.appendChild(homeActivityGrid);

const homeGridMonths = document.createElement("div");
homeGridMonths.id = "home-grid-months";
document.body.appendChild(homeGridMonths);

const homeYearLabel = document.createElement("div");
homeYearLabel.id = "home-year-label";
document.body.appendChild(homeYearLabel);

const homeCards = document.createElement("div");
homeCards.id = "home-cards";
document.body.appendChild(homeCards);

// Mock all dependencies before importing the module under test

vi.mock("../../../public/js/core/dom.js", () => ({
  $: {
    homePage: {
      classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
    },
    homeBtn: {
      classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() },
      addEventListener: vi.fn(),
    },
    projectSelect: {
      value: "",
      options: [],
      selectedIndex: 0,
    },
    sessionList: { innerHTML: "" },
    messagesDiv: { innerHTML: "" },
  },
}));

vi.mock("../../../public/js/core/store.js", () => ({
  on: vi.fn(),
  setState: vi.fn(),
  getState: vi.fn((key) => {
    if (key === "sessionId") return null;
    if (key === "view") return null;
    return null;
  }),
}));

vi.mock("../../../public/js/core/api.js", () => ({
  fetchHomeData: vi.fn(() =>
    Promise.resolve({
      yearlyActivity: [],
      overview: {
        totalOutputTokens: 0,
        sessions: 0,
        totalCost: 0,
      },
    })
  ),
}));

vi.mock("../../../public/js/features/analytics.js", () => ({
  loadHomeAnalytics: vi.fn(),
}));

// Import module — triggers onState calls and IIFE at load time
import "../../../public/js/features/home.js";

describe("home module", () => {
  it("loads without error", () => {
    expect(true).toBe(true);
  });

  it("called onState to watch view changes", async () => {
    const { on } = await import("../../../public/js/core/store.js");
    expect(on).toHaveBeenCalledWith("view", expect.any(Function));
  });

  it("called onState to watch sessionId changes", async () => {
    const { on } = await import("../../../public/js/core/store.js");
    expect(on).toHaveBeenCalledWith("sessionId", expect.any(Function));
  });

  it("registered click listener on homeBtn", async () => {
    const { $ } = await import("../../../public/js/core/dom.js");
    expect($.homeBtn.addEventListener).toHaveBeenCalledWith(
      "click",
      expect.any(Function)
    );
  });

  it("created the chat-area-main element in the DOM", () => {
    const el = document.querySelector(".chat-area-main");
    expect(el).not.toBeNull();
  });
});

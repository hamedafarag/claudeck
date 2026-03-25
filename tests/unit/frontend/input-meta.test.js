// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";

// ── Set up DOM elements BEFORE mock and import ───────────────────────────────

// These elements are captured at module top-level via document.getElementById
const elModel = document.createElement("span");
elModel.id = "input-meta-model";
document.body.appendChild(elModel);

const elPerm = document.createElement("span");
elPerm.id = "input-meta-perm";
document.body.appendChild(elPerm);

const elTurns = document.createElement("span");
elTurns.id = "input-meta-turns";
document.body.appendChild(elTurns);

// Create mock select elements that the module reads via $.modelSelect etc.
const modelSelect = document.createElement("select");
modelSelect.innerHTML = '<option value="">default</option><option value="claude-3.5-sonnet">Sonnet</option><option value="claude-opus">Opus</option>';
modelSelect.value = "";

const permModeSelect = document.createElement("select");
permModeSelect.innerHTML = '<option value="bypass">Bypass</option><option value="confirmDangerous">Confirm Dangerous</option><option value="confirmAll">Confirm All</option><option value="plan">Plan</option>';
permModeSelect.value = "confirmDangerous";

const maxTurnsSelect = document.createElement("select");
maxTurnsSelect.innerHTML = '<option value="0">Unlimited</option><option value="10">10</option><option value="30">30</option>';
maxTurnsSelect.value = "30";

// ── Mock dom.js ──────────────────────────────────────────────────────────────

vi.mock("../../../public/js/core/dom.js", () => ({
  $: {
    modelSelect,
    permModeSelect,
    maxTurnsSelect,
  },
}));

// ── Import module (triggers init: updateModel, updatePerm, updateTurns) ──────

await import("../../../public/js/ui/input-meta.js");

// ── Tests ────────────────────────────────────────────────────────────────────

describe("input-meta", () => {
  it("module loads without error", () => {
    // If we got here, the import succeeded
    expect(true).toBe(true);
  });

  it("sets default model text when modelSelect value is empty", () => {
    // On init, modelSelect.value was ""
    expect(elModel.textContent).toBe("default model");
  });

  it("sets permission label for confirmDangerous on init", () => {
    // On init, permModeSelect.value was "confirmDangerous"
    expect(elPerm.textContent).toBe("confirm dangerous");
  });

  it("sets turns label with count on init", () => {
    // On init, maxTurnsSelect.value was "30"
    expect(elTurns.textContent).toBe("30 turns");
  });

  it("updates model text when modelSelect changes", () => {
    modelSelect.value = "claude-3.5-sonnet";
    modelSelect.dispatchEvent(new Event("change"));
    expect(elModel.textContent).toBe("claude-3.5-sonnet");
  });

  it("updates permission label when permModeSelect changes to bypass", () => {
    permModeSelect.value = "bypass";
    permModeSelect.dispatchEvent(new Event("change"));
    expect(elPerm.textContent).toBe("bypass");
  });

  it("updates permission label when permModeSelect changes to confirmAll", () => {
    permModeSelect.value = "confirmAll";
    permModeSelect.dispatchEvent(new Event("change"));
    expect(elPerm.textContent).toBe("confirm all");
  });

  it("updates permission label when permModeSelect changes to plan", () => {
    permModeSelect.value = "plan";
    permModeSelect.dispatchEvent(new Event("change"));
    expect(elPerm.textContent).toBe("plan only");
  });

  it("updates turns label to unlimited when value is 0", () => {
    maxTurnsSelect.value = "0";
    maxTurnsSelect.dispatchEvent(new Event("change"));
    expect(elTurns.textContent).toBe("unlimited turns");
  });

  it("updates turns label with specific count", () => {
    maxTurnsSelect.value = "10";
    maxTurnsSelect.dispatchEvent(new Event("change"));
    expect(elTurns.textContent).toBe("10 turns");
  });

  it("reverts model text to default model when value cleared", () => {
    modelSelect.value = "claude-opus";
    modelSelect.dispatchEvent(new Event("change"));
    expect(elModel.textContent).toBe("claude-opus");

    modelSelect.value = "";
    modelSelect.dispatchEvent(new Event("change"));
    expect(elModel.textContent).toBe("default model");
  });
});

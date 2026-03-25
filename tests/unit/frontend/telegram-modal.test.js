// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

beforeEach(async () => {
  const el = document.createElement("claudeck-telegram-modal");
  document.body.appendChild(el);
  await import("../../../public/js/components/telegram-modal.js");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("claudeck-telegram-modal", () => {
  it("renders the modal overlay", () => {
    expect(document.getElementById("telegram-modal")).not.toBeNull();
  });

  it("starts hidden", () => {
    expect(
      document.getElementById("telegram-modal").classList.contains("hidden")
    ).toBe(true);
  });

  it("close button hides the modal", () => {
    const overlay = document.getElementById("telegram-modal");
    overlay.classList.remove("hidden");
    document.getElementById("telegram-close").click();
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking backdrop hides the modal", () => {
    const overlay = document.getElementById("telegram-modal");
    overlay.classList.remove("hidden");
    overlay.dispatchEvent(new Event("click", { bubbles: true }));
    expect(overlay.classList.contains("hidden")).toBe(true);
  });

  it("clicking inside modal does not hide it", () => {
    const overlay = document.getElementById("telegram-modal");
    overlay.classList.remove("hidden");
    overlay.querySelector(".modal").click();
    expect(overlay.classList.contains("hidden")).toBe(false);
  });

  it("has enabled checkbox", () => {
    const cb = document.getElementById("telegram-enabled");
    expect(cb).not.toBeNull();
    expect(cb.type).toBe("checkbox");
  });

  it("has bot token input", () => {
    const input = document.getElementById("telegram-bot-token");
    expect(input).not.toBeNull();
    expect(input.type).toBe("password");
  });

  it("has chat id input", () => {
    expect(document.getElementById("telegram-chat-id")).not.toBeNull();
  });

  it("has afk timeout input", () => {
    const input = document.getElementById("telegram-afk-timeout");
    expect(input).not.toBeNull();
    expect(input.type).toBe("number");
  });

  it("has test button", () => {
    expect(document.getElementById("telegram-test-btn")).not.toBeNull();
  });

  it("has save button", () => {
    expect(document.getElementById("telegram-save-btn")).not.toBeNull();
  });

  it("has notification event checkboxes", () => {
    const ids = [
      "tg-notify-session",
      "tg-notify-workflow",
      "tg-notify-chain",
      "tg-notify-agent",
      "tg-notify-orchestrator",
      "tg-notify-dag",
      "tg-notify-errors",
      "tg-notify-permissions",
      "tg-notify-start",
    ];
    for (const id of ids) {
      const cb = document.getElementById(id);
      expect(cb, `${id} should exist`).not.toBeNull();
      expect(cb.type).toBe("checkbox");
    }
  });
});

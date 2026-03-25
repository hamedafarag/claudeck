// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

beforeEach(async () => {
  const el = document.createElement("claudeck-status-bar");
  document.body.appendChild(el);
  await import("../../../public/js/components/status-bar.js");
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("claudeck-status-bar", () => {
  it("renders a footer element with status-bar class", () => {
    const footer = document.querySelector("footer.status-bar");
    expect(footer).not.toBeNull();
  });

  it("has connection dot", () => {
    expect(document.getElementById("sb-dot")).not.toBeNull();
  });

  it("has connection text", () => {
    expect(document.getElementById("sb-connection-text")).not.toBeNull();
  });

  it("has branch name", () => {
    expect(document.getElementById("sb-branch-name")).not.toBeNull();
  });

  it("has project name", () => {
    expect(document.getElementById("sb-project-name")).not.toBeNull();
  });

  it("has activity element", () => {
    expect(document.getElementById("sb-activity")).not.toBeNull();
  });

  it("has session cost", () => {
    expect(document.getElementById("sb-session-cost")).not.toBeNull();
  });

  it("has total cost", () => {
    expect(document.getElementById("sb-total-cost")).not.toBeNull();
  });

  it("has version element", () => {
    expect(document.getElementById("sb-version")).not.toBeNull();
  });

  it("has background count", () => {
    expect(document.getElementById("sb-bg-count")).not.toBeNull();
  });

  it("has context gauge", () => {
    expect(document.getElementById("context-gauge")).not.toBeNull();
  });

  it("has context gauge fill", () => {
    expect(document.getElementById("context-gauge-fill")).not.toBeNull();
  });

  it("has context gauge label", () => {
    expect(document.getElementById("context-gauge-label")).not.toBeNull();
  });
});

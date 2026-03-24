// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("header-dropdowns", () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = "";
  });

  function setupDOM() {
    document.body.innerHTML = `
      <div class="header-dropdown" id="dropdown1">
        <button class="header-dropdown-trigger">Menu</button>
        <div class="header-dropdown-menu">
          <div class="header-dropdown-item has-submenu">
            <span class="header-dropdown-item-value">Option 1</span>
            <div class="header-submenu">
              <div class="header-submenu-item active" data-target="hidden-select" data-value="val1">Value 1</div>
              <div class="header-submenu-item" data-target="hidden-select" data-value="val2">Value 2</div>
            </div>
          </div>
          <div class="header-dropdown-item" id="tool-item">Tool Item</div>
        </div>
      </div>
      <div class="header-dropdown" id="dropdown2">
        <button class="header-dropdown-trigger">Menu 2</button>
        <div class="header-dropdown-menu">
          <div class="header-dropdown-item">Item 2</div>
        </div>
      </div>
      <select id="hidden-select" style="display:none">
        <option value="val1">Value 1</option>
        <option value="val2">Value 2</option>
      </select>
    `;
  }

  it("module imports without error", async () => {
    setupDOM();
    await expect(
      import("../../../public/js/ui/header-dropdowns.js")
    ).resolves.not.toThrow();
  });

  it("clicking a trigger opens the dropdown", async () => {
    setupDOM();
    await import("../../../public/js/ui/header-dropdowns.js");

    const trigger = document.querySelector("#dropdown1 .header-dropdown-trigger");
    const dropdown = document.getElementById("dropdown1");

    trigger.click();

    expect(dropdown.classList.contains("open")).toBe(true);
  });

  it("clicking a trigger on an open dropdown closes it", async () => {
    setupDOM();
    await import("../../../public/js/ui/header-dropdowns.js");

    const trigger = document.querySelector("#dropdown1 .header-dropdown-trigger");
    const dropdown = document.getElementById("dropdown1");

    // Open
    trigger.click();
    expect(dropdown.classList.contains("open")).toBe(true);

    // Close
    trigger.click();
    expect(dropdown.classList.contains("open")).toBe(false);
  });

  it("clicking outside closes open dropdowns", async () => {
    setupDOM();
    await import("../../../public/js/ui/header-dropdowns.js");

    const trigger = document.querySelector("#dropdown1 .header-dropdown-trigger");
    const dropdown = document.getElementById("dropdown1");

    // Open the dropdown
    trigger.click();
    expect(dropdown.classList.contains("open")).toBe(true);

    // Click outside (on body)
    document.body.click();
    expect(dropdown.classList.contains("open")).toBe(false);
  });

  it("Escape key closes open dropdowns", async () => {
    setupDOM();
    await import("../../../public/js/ui/header-dropdowns.js");

    const trigger = document.querySelector("#dropdown1 .header-dropdown-trigger");
    const dropdown = document.getElementById("dropdown1");

    // Open the dropdown
    trigger.click();
    expect(dropdown.classList.contains("open")).toBe(true);

    // Press Escape
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(dropdown.classList.contains("open")).toBe(false);
  });

  it("opening one dropdown closes others", async () => {
    setupDOM();
    await import("../../../public/js/ui/header-dropdowns.js");

    const trigger1 = document.querySelector("#dropdown1 .header-dropdown-trigger");
    const trigger2 = document.querySelector("#dropdown2 .header-dropdown-trigger");
    const dropdown1 = document.getElementById("dropdown1");
    const dropdown2 = document.getElementById("dropdown2");

    // Open dropdown1
    trigger1.click();
    expect(dropdown1.classList.contains("open")).toBe(true);

    // Open dropdown2 — should close dropdown1
    trigger2.click();
    expect(dropdown2.classList.contains("open")).toBe(true);
    expect(dropdown1.classList.contains("open")).toBe(false);
  });

  it("clicking a submenu item updates the hidden select value", async () => {
    setupDOM();
    await import("../../../public/js/ui/header-dropdowns.js");

    const select = document.getElementById("hidden-select");
    expect(select.value).toBe("val1");

    const submenuItem = document.querySelector('.header-submenu-item[data-value="val2"]');
    const changeHandler = vi.fn();
    select.addEventListener("change", changeHandler);

    submenuItem.click();

    expect(select.value).toBe("val2");
    expect(changeHandler).toHaveBeenCalled();
  });

  it("clicking a submenu item updates active class", async () => {
    setupDOM();
    await import("../../../public/js/ui/header-dropdowns.js");

    const item1 = document.querySelector('.header-submenu-item[data-value="val1"]');
    const item2 = document.querySelector('.header-submenu-item[data-value="val2"]');

    expect(item1.classList.contains("active")).toBe(true);
    expect(item2.classList.contains("active")).toBe(false);

    item2.click();

    expect(item1.classList.contains("active")).toBe(false);
    expect(item2.classList.contains("active")).toBe(true);
  });

  it("clicking a submenu item updates the display value", async () => {
    setupDOM();
    await import("../../../public/js/ui/header-dropdowns.js");

    const display = document.querySelector(".header-dropdown-item-value");
    expect(display.textContent).toBe("Option 1");

    const item2 = document.querySelector('.header-submenu-item[data-value="val2"]');
    item2.click();

    expect(display.textContent).toBe("Value 2");
  });

  it("clicking a submenu item closes the dropdown", async () => {
    setupDOM();
    await import("../../../public/js/ui/header-dropdowns.js");

    const trigger = document.querySelector("#dropdown1 .header-dropdown-trigger");
    const dropdown = document.getElementById("dropdown1");

    // Open
    trigger.click();
    expect(dropdown.classList.contains("open")).toBe(true);

    // Click submenu item
    const item2 = document.querySelector('.header-submenu-item[data-value="val2"]');
    item2.click();

    expect(dropdown.classList.contains("open")).toBe(false);
  });
});

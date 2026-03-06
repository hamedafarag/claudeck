// Header dropdown menus with multi-level submenus

// Toggle dropdown open/close
document.querySelectorAll(".header-dropdown-trigger").forEach((trigger) => {
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const dropdown = trigger.closest(".header-dropdown");
    const wasOpen = dropdown.classList.contains("open");

    // Close all dropdowns
    document.querySelectorAll(".header-dropdown.open").forEach((d) => d.classList.remove("open"));

    if (!wasOpen) dropdown.classList.add("open");
  });
});

// Close dropdowns on outside click
document.addEventListener("click", () => {
  document.querySelectorAll(".header-dropdown.open").forEach((d) => d.classList.remove("open"));
});

// Prevent menu clicks from closing the dropdown (except submenu item clicks)
document.querySelectorAll(".header-dropdown-menu").forEach((menu) => {
  menu.addEventListener("click", (e) => {
    if (!e.target.closest(".header-submenu-item") && !e.target.closest(".header-dropdown-item:not(.has-submenu)")) {
      e.stopPropagation();
    }
  });
});

// Submenu item selection — sync with hidden <select> elements
document.querySelectorAll(".header-submenu-item").forEach((item) => {
  item.addEventListener("click", () => {
    const targetId = item.dataset.target;
    const value = item.dataset.value;
    const select = document.getElementById(targetId);
    if (!select) return;

    // Update hidden select and fire change event
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));

    // Update active state in submenu
    const submenu = item.closest(".header-submenu");
    submenu.querySelectorAll(".header-submenu-item").forEach((s) => s.classList.remove("active"));
    item.classList.add("active");

    // Update display value
    const parent = item.closest(".header-dropdown-item");
    const display = parent.querySelector(".header-dropdown-item-value");
    if (display) display.textContent = item.textContent.trim();

    // Close dropdown
    document.querySelectorAll(".header-dropdown.open").forEach((d) => d.classList.remove("open"));
  });
});

// Tools dropdown items — close menu after click
document.querySelectorAll(".header-dropdown-item:not(.has-submenu)").forEach((item) => {
  if (item.id) {
    item.addEventListener("click", () => {
      document.querySelectorAll(".header-dropdown.open").forEach((d) => d.classList.remove("open"));
    });
  }
});

// Close on Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.querySelectorAll(".header-dropdown.open").forEach((d) => d.classList.remove("open"));
  }
});

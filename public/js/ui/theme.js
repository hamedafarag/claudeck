// Dark/Light theme toggle
import { $ } from '../core/dom.js';

export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("claudeck-theme", theme);

  // Update icon visibility
  if (theme === "light") {
    $.themeIconSun.style.display = "none";
    $.themeIconMoon.style.display = "block";
  } else {
    $.themeIconSun.style.display = "block";
    $.themeIconMoon.style.display = "none";
  }

  // Update Mermaid theme
  if (typeof mermaid !== "undefined") {
    mermaid.initialize({ startOnLoad: false, theme: theme === "light" ? "default" : "dark" });
  }

  // Update highlight.js theme stylesheet
  const hljsLink = document.getElementById("hljs-theme");
  if (hljsLink) {
    hljsLink.href = theme === "light"
      ? "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css"
      : "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css";
  }
}

// Initialize theme from localStorage
const savedTheme = localStorage.getItem("claudeck-theme") || "dark";
applyTheme(savedTheme);

$.themeToggleBtn.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
});

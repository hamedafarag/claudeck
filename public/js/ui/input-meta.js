// Input meta labels — show model, permissions, max turns below chat input
import { $ } from '../core/dom.js';

const elModel = document.getElementById("input-meta-model");
const elPerm  = document.getElementById("input-meta-perm");
const elTurns = document.getElementById("input-meta-turns");

const permLabels = {
  bypass: "bypass",
  confirmDangerous: "confirm dangerous",
  confirmAll: "confirm all",
  plan: "plan only",
};

function updateModel() {
  if (!elModel) return;
  const val = $.modelSelect?.value || "";
  elModel.textContent = val || "default model";
}

function updatePerm() {
  if (!elPerm) return;
  const val = $.permModeSelect?.value || "confirmDangerous";
  elPerm.textContent = permLabels[val] || val;
}

function updateTurns() {
  if (!elTurns) return;
  const val = $.maxTurnsSelect?.value || "30";
  elTurns.textContent = val === "0" ? "unlimited turns" : `${val} turns`;
}

// Also watch header dropdown display elements (used when dropdowns replace <select>)
function observeDisplay(id, fn) {
  const el = document.getElementById(id);
  if (el) {
    new MutationObserver(fn).observe(el, { childList: true, characterData: true, subtree: true });
  }
}

$.modelSelect?.addEventListener("change", updateModel);
$.permModeSelect?.addEventListener("change", updatePerm);
$.maxTurnsSelect?.addEventListener("change", updateTurns);

observeDisplay("model-display", updateModel);
observeDisplay("perm-mode-display", updatePerm);
observeDisplay("max-turns-display", updateTurns);

updateModel();
updatePerm();
updateTurns();

// Make shortcut kbd hints clickable — dispatch the matching keyboard shortcut
document.querySelectorAll(".input-meta-kbd").forEach((kbd) => {
  kbd.style.cursor = "pointer";
  kbd.addEventListener("click", () => {
    const text = kbd.textContent.trim();
    let key = "";
    if (text === "\u2318B") key = "b";
    else if (text === "\u2318N") key = "n";
    else if (text === "\u2318K") key = "k";
    else if (text === "\u2318/") key = "/";
    if (key) {
      document.dispatchEvent(new KeyboardEvent("keydown", {
        key,
        metaKey: true,
        bubbles: true,
      }));
    }
  });
});

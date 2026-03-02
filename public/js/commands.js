// Slash command system
import { escapeHtml } from './utils.js';
import { AUTOCOMPLETE_LIMIT } from './constants.js';

export const commandRegistry = {};

export function registerCommand(name, def) {
  commandRegistry[name] = def;
}

export function handleSlashAutocomplete(pane) {
  const text = pane.messageInput.value;
  const el = pane.autocompleteEl;
  if (!el) return;

  if (!text.startsWith("/") || text.includes(" ")) {
    dismissAutocomplete(pane);
    return;
  }

  const partial = text.slice(1).toLowerCase();
  const matches = Object.entries(commandRegistry)
    .filter(([name]) => name.startsWith(partial))
    .sort((a, b) => {
      const catOrder = { project: 0, skill: 1, app: 2, cli: 3, workflow: 4, prompt: 5 };
      const ca = catOrder[a[1].category] ?? 3;
      const cb = catOrder[b[1].category] ?? 3;
      return ca - cb || a[0].localeCompare(b[0]);
    })
    .slice(0, AUTOCOMPLETE_LIMIT);

  if (matches.length === 0) {
    dismissAutocomplete(pane);
    return;
  }

  el.innerHTML = "";
  matches.forEach(([name, cmd], i) => {
    const item = document.createElement("div");
    item.className = "slash-autocomplete-item" + (i === 0 ? " active" : "");
    item.dataset.index = i;
    item.dataset.cmd = name;
    item.innerHTML = `
      <span class="cmd-name">/${escapeHtml(name)}</span>
      <span class="cmd-category" data-cat="${cmd.category}">${cmd.category}</span>
      <span class="cmd-desc">${escapeHtml(cmd.description)}</span>
    `;
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const needsArgs = name === "run" || cmd.needsArgs;
      pane.messageInput.value = `/${name}${needsArgs ? " " : ""}`;
      dismissAutocomplete(pane);
      pane.messageInput.focus();
    });
    el.appendChild(item);
  });

  pane._autocompleteIndex = 0;
  el.classList.remove("hidden");
}

export function dismissAutocomplete(pane) {
  if (pane.autocompleteEl) {
    pane.autocompleteEl.classList.add("hidden");
    pane.autocompleteEl.innerHTML = "";
    pane._autocompleteIndex = -1;
  }
}

export function handleAutocompleteKeydown(e, pane) {
  const el = pane.autocompleteEl;
  if (!el || el.classList.contains("hidden")) return false;

  const items = el.querySelectorAll(".slash-autocomplete-item");
  if (items.length === 0) return false;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    pane._autocompleteIndex = Math.min(pane._autocompleteIndex + 1, items.length - 1);
    items.forEach((it, i) => it.classList.toggle("active", i === pane._autocompleteIndex));
    items[pane._autocompleteIndex].scrollIntoView({ block: "nearest" });
    return true;
  }

  if (e.key === "ArrowUp") {
    e.preventDefault();
    pane._autocompleteIndex = Math.max(pane._autocompleteIndex - 1, 0);
    items.forEach((it, i) => it.classList.toggle("active", i === pane._autocompleteIndex));
    items[pane._autocompleteIndex].scrollIntoView({ block: "nearest" });
    return true;
  }

  if (e.key === "Tab" || (e.key === "Enter" && pane._autocompleteIndex >= 0)) {
    e.preventDefault();
    const active = items[pane._autocompleteIndex];
    if (active) {
      const cmdName = active.dataset.cmd;
      const cmdDef = commandRegistry[cmdName];
      const needsArgs = cmdName === "run" || (cmdDef && cmdDef.needsArgs);
      pane.messageInput.value = `/${cmdName}${needsArgs ? " " : ""}`;
      dismissAutocomplete(pane);
      pane.messageInput.focus();
    }
    return true;
  }

  if (e.key === "Escape") {
    e.preventDefault();
    dismissAutocomplete(pane);
    return true;
  }

  return false;
}

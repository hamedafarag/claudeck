// ── Message Recall — InputHistory class + keydown handler ──

export class InputHistory {
  constructor(storageKey, maxSize = 100) {
    this.storageKey = storageKey;
    this.maxSize = maxSize;
    this.entries = [];
    this.index = -1;
    this.draft = "";
    this._load();
  }

  /** Add a sent message to history. Skips empty and consecutive duplicates. */
  add(text) {
    if (!text || !text.trim()) return;
    if (this.entries.length > 0 && this.entries[this.entries.length - 1] === text) return;
    this.entries.push(text);
    if (this.entries.length > this.maxSize) this.entries.shift();
    this.index = -1;
    this._save();
  }

  /** Navigate backward (older). Returns entry text, or null if empty. */
  previous(currentInput) {
    if (this.entries.length === 0) return null;
    if (this.index === -1) this.draft = currentInput || "";
    if (this.index < this.entries.length - 1) this.index++;
    return this.entries[this.entries.length - 1 - this.index];
  }

  /** Navigate forward (newer). Returns entry text, or draft when past the end. */
  next() {
    if (this.index <= 0) {
      this.index = -1;
      return this.draft;
    }
    this.index--;
    return this.entries[this.entries.length - 1 - this.index];
  }

  /** Cancel navigation and return to draft. */
  cancel() {
    const draft = this.draft;
    this.index = -1;
    this.draft = "";
    return draft;
  }

  /** Reset navigation state (call after sending or typing). */
  reset() {
    this.index = -1;
    this.draft = "";
  }

  /** Whether the user is currently navigating history. */
  get isNavigating() {
    return this.index !== -1;
  }

  /** Return all entries newest-first (for popover display). */
  getAll() {
    return [...this.entries].reverse();
  }

  /** @private Load from localStorage. */
  _load() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) this.entries = JSON.parse(raw);
    } catch {
      this.entries = [];
    }
  }

  /** @private Save to localStorage. */
  _save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.entries));
    } catch {
      /* localStorage full — silently degrade */
    }
  }
}

/**
 * Handle ArrowUp / ArrowDown / Escape for input history navigation.
 * Returns true if the event was consumed (same contract as handleAutocompleteKeydown).
 */
export function handleHistoryKeydown(e, pane, history) {
  const input = pane.messageInput;

  if (e.key === "ArrowUp" && (input.value === "" || history.isNavigating)) {
    const prev = history.previous(input.value);
    if (prev !== null) {
      e.preventDefault();
      input.value = prev;
      triggerResize(input);
    }
    return true;
  }

  if (e.key === "ArrowDown" && history.isNavigating) {
    e.preventDefault();
    input.value = history.next();
    triggerResize(input);
    return true;
  }

  if (e.key === "Escape" && history.isNavigating) {
    e.preventDefault();
    input.value = history.cancel();
    triggerResize(input);
    return true;
  }

  return false;
}

function triggerResize(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
}

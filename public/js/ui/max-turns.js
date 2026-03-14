// Max turns selector — localStorage persistence + getter
import { $ } from '../core/dom.js';

const STORAGE_KEY = 'claudeck-max-turns';

export function getMaxTurns() {
  const val = parseInt($.maxTurnsSelect?.value, 10);
  return val || 0; // 0 = unlimited
}

function init() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && $.maxTurnsSelect) {
    $.maxTurnsSelect.value = saved;
  }
  $.maxTurnsSelect?.addEventListener('change', () => {
    localStorage.setItem(STORAGE_KEY, $.maxTurnsSelect.value);
  });
}

init();

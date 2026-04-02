// Model selector — localStorage persistence + getter
import { $ } from '../core/dom.js';

const STORAGE_KEY = 'claudeck-model';

export function getSelectedModel() {
  return $.modelSelect?.value || '';
}

function init() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && $.modelSelect) {
    $.modelSelect.value = saved;
    $.modelSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  $.modelSelect?.addEventListener('change', () => {
    localStorage.setItem(STORAGE_KEY, $.modelSelect.value);
  });
}

init();

// Model selector — localStorage persistence + getter
import { $ } from './dom.js';

const STORAGE_KEY = 'shawkat-model';

export function getSelectedModel() {
  return $.modelSelect?.value || '';
}

function init() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && $.modelSelect) {
    $.modelSelect.value = saved;
  }
  $.modelSelect?.addEventListener('change', () => {
    localStorage.setItem(STORAGE_KEY, $.modelSelect.value);
  });
}

init();

// Disabled tools selector — localStorage persistence + getter
const STORAGE_KEY = 'claudeck-disabled-tools';
const display = document.getElementById('disabled-tools-display');

export function getDisabledTools() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function updateDisplay() {
  if (!display) return;
  const tools = getDisabledTools();
  display.textContent = tools.length === 0 ? 'none' : `${tools.length} off`;
}

function init() {
  const saved = getDisabledTools();
  const checkboxes = document.querySelectorAll('.header-submenu--tools input[type="checkbox"]');

  checkboxes.forEach(cb => {
    cb.checked = saved.includes(cb.value);
    cb.addEventListener('change', () => {
      const current = [];
      checkboxes.forEach(c => { if (c.checked) current.push(c.value); });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      updateDisplay();
    });
  });

  updateDisplay();
}

init();

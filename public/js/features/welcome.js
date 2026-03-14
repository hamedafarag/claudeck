// Welcome overlay — shown once on first visit
import { startTour } from './tour.js';

const STORAGE_KEY = 'codedeck-welcome-seen';

function init() {
  if (localStorage.getItem(STORAGE_KEY)) return;

  const overlay = document.getElementById('welcome-overlay');
  if (!overlay) return;

  overlay.classList.remove('hidden');

  const getStartedBtn = document.getElementById('welcome-get-started');
  const tourBtn = document.getElementById('welcome-take-tour');

  getStartedBtn.addEventListener('click', () => dismiss(overlay));

  tourBtn.addEventListener('click', () => {
    dismiss(overlay, () => startTour());
  });

  // Also dismiss with Escape or Enter
  function onKey(e) {
    if (e.key === 'Escape' || e.key === 'Enter') {
      dismiss(overlay);
      document.removeEventListener('keydown', onKey);
    }
  }
  document.addEventListener('keydown', onKey);
}

function dismiss(overlay, onDone) {
  localStorage.setItem(STORAGE_KEY, '1');
  overlay.classList.add('hiding');
  overlay.addEventListener('transitionend', () => {
    overlay.classList.add('hidden');
    overlay.remove();
    if (onDone) onDone();
  }, { once: true });
}

init();

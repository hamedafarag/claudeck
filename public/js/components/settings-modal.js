// Web Component: Settings Modal
const SETTINGS_KEY = 'claudeck-settings';

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; }
}

function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function getSetting(key, fallback = true) {
  const s = loadSettings();
  return s[key] !== undefined ? s[key] : fallback;
}

class ClaudeckSettingsModal extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div id="settings-modal" class="modal-overlay hidden">
        <div class="modal settings-modal">
          <div class="modal-header">
            <h3>Settings</h3>
            <button id="settings-modal-close" class="modal-close">&times;</button>
          </div>
          <div class="settings-list">
            <label class="settings-row">
              <span class="settings-label">
                <strong>Assistant Bot</strong>
                <small>Show the floating assistant bot bubble</small>
              </span>
              <input type="checkbox" id="setting-assistant-bot" class="settings-toggle">
            </label>
          </div>
        </div>
      </div>
    `;

    const overlay = this.querySelector('#settings-modal');
    const closeBtn = this.querySelector('#settings-modal-close');
    const botToggle = this.querySelector('#setting-assistant-bot');

    // Init toggle state
    botToggle.checked = getSetting('assistantBot', true);

    closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });

    botToggle.addEventListener('change', () => {
      const s = loadSettings();
      s.assistantBot = botToggle.checked;
      saveSettings(s);
      // Dispatch event so the bot module can react
      window.dispatchEvent(new CustomEvent('setting:assistantBot', { detail: botToggle.checked }));
    });

    // Open from settings button
    document.getElementById('settings-btn')?.addEventListener('click', () => {
      botToggle.checked = getSetting('assistantBot', true);
      overlay.classList.remove('hidden');
    });
  }
}

customElements.define('claudeck-settings-modal', ClaudeckSettingsModal);

class FilePickerModal extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
  <div id="file-picker-modal" class="modal-overlay hidden">
    <div class="modal file-picker-modal">
      <div class="modal-header">
        <h3>Attach Files</h3>
        <button id="fp-modal-close" class="modal-close">&times;</button>
      </div>
      <div class="fp-info-banner">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        <span>Text files up to <strong>50 KB</strong> &middot; Binary files are not supported</span>
      </div>
      <div class="fp-search-wrap">
        <svg class="fp-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input id="fp-search" type="text" class="file-picker-search" placeholder="Search files..." autocomplete="off">
      </div>
      <div id="fp-selected" class="fp-selected-strip hidden"></div>
      <div id="fp-list" class="file-picker-list"></div>
      <div id="fp-empty" class="fp-empty-state hidden">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
        </svg>
        <span>No files match your search</span>
      </div>
      <div class="file-picker-footer">
        <span id="fp-count">0 files selected</span>
        <button id="fp-done-btn" class="modal-btn-save">Done</button>
      </div>
    </div>
  </div>`;

    const overlay = this.querySelector('#file-picker-modal');
    const closeBtn = this.querySelector('#fp-modal-close');
    const doneBtn = this.querySelector('#fp-done-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
    if (doneBtn) doneBtn.addEventListener('click', () => overlay.classList.add('hidden'));
    if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
  }
}
customElements.define('claudeck-file-picker', FilePickerModal);

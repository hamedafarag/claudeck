class PromptModal extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
  <div id="prompt-modal" class="modal-overlay hidden">
    <div class="modal">
      <div class="modal-header">
        <h3>New Prompt</h3>
        <button id="modal-close" class="modal-close">&times;</button>
      </div>
      <form id="prompt-form">
        <label for="prompt-title">Title</label>
        <input id="prompt-title" type="text" placeholder="e.g. Optimize Imports" required>
        <label for="prompt-desc">Description</label>
        <input id="prompt-desc" type="text" placeholder="Short description of what it does" required>
        <label for="prompt-text">Prompt</label>
        <textarea id="prompt-text" rows="4" placeholder="The full prompt to send to Claude..." required></textarea>
        <div class="modal-actions">
          <button type="button" id="modal-cancel" class="modal-btn-cancel">Cancel</button>
          <button type="submit" class="modal-btn-save">Save Prompt</button>
        </div>
      </form>
    </div>
  </div>`;

    const overlay = this.querySelector('#prompt-modal');
    const closeBtn = this.querySelector('#modal-close');
    if (closeBtn) closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
    if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
  }
}
customElements.define('claudeck-prompt-modal', PromptModal);

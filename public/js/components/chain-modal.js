class ChainModal extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
  <div id="chain-modal" class="modal-overlay hidden">
    <div class="modal agent-form-modal">
      <div class="modal-header">
        <h3 id="chain-modal-title">New Chain</h3>
        <button id="chain-modal-close" class="modal-close">&times;</button>
      </div>
      <form id="chain-form">
        <div class="af-section">
          <div class="af-section-label">Details</div>
          <div class="af-field">
            <label for="chain-form-title">Title</label>
            <input id="chain-form-title" type="text" placeholder="e.g. Full Code Review Pipeline" required>
          </div>
          <div class="af-field">
            <label for="chain-form-desc">Description</label>
            <input id="chain-form-desc" type="text" placeholder="Short description of the chain">
          </div>
        </div>
        <div class="af-section">
          <div class="af-section-label">Pipeline</div>
          <div id="chain-agent-list" class="chain-agent-list"></div>
          <button type="button" id="chain-add-agent-btn" class="chain-add-agent-btn">+ Add Agent Step</button>
        </div>
        <div class="af-section">
          <div class="af-section-label">Settings</div>
          <div class="af-field">
            <label for="chain-form-context">Context Passing</label>
            <select id="chain-form-context">
              <option value="summary">Summary (recommended)</option>
              <option value="full">Full output</option>
              <option value="none">None</option>
            </select>
          </div>
        </div>
        <input id="chain-form-edit-id" type="hidden">
        <div class="modal-actions">
          <button type="button" id="chain-modal-cancel" class="modal-btn-cancel">Cancel</button>
          <button type="submit" class="modal-btn-save">Save Chain</button>
        </div>
      </form>
    </div>
  </div>`;

    const overlay = this.querySelector('#chain-modal');
    this.querySelector('#chain-modal-close').addEventListener('click', () => overlay.classList.add('hidden'));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
  }
}
customElements.define('claudeck-chain-modal', ChainModal);

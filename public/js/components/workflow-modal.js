class WorkflowModal extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
  <div id="wf-modal" class="modal-overlay hidden">
    <div class="modal agent-form-modal">
      <div class="modal-header">
        <h3 id="wf-modal-title">New Workflow</h3>
        <button id="wf-modal-close" class="modal-close">&times;</button>
      </div>
      <form id="wf-form">
        <div class="af-section">
          <div class="af-section-label">Identity</div>
          <div class="af-field">
            <label for="wf-form-title">Title</label>
            <input id="wf-form-title" type="text" placeholder="e.g. Review PR" required>
          </div>
          <div class="af-field">
            <label for="wf-form-desc">Description</label>
            <input id="wf-form-desc" type="text" placeholder="Short description of this workflow">
          </div>
        </div>
        <div class="af-section">
          <div class="af-section-label">Steps</div>
          <div id="wf-steps-list" class="wf-steps-list"></div>
          <button type="button" id="wf-add-step-btn" class="wf-step-add">+ Add Step</button>
        </div>
        <input id="wf-form-edit-id" type="hidden">
        <div class="modal-actions">
          <button type="button" id="wf-modal-cancel" class="modal-btn-cancel">Cancel</button>
          <button type="submit" class="modal-btn-save">Save Workflow</button>
        </div>
      </form>
    </div>
  </div>`;

    const overlay = this.querySelector('#wf-modal');
    this.querySelector('#wf-modal-close').addEventListener('click', () => overlay.classList.add('hidden'));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
  }
}
customElements.define('claudeck-workflow-modal', WorkflowModal);

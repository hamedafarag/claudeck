class DagEditorModal extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
  <div id="dag-modal" class="modal-overlay hidden">
    <div class="modal dag-modal-wide">
      <div class="modal-header">
        <h3 id="dag-modal-title">New DAG</h3>
        <button id="dag-modal-close" class="modal-close">&times;</button>
      </div>
      <div class="dag-explainer af-section">
        <div class="af-section-label">What is a DAG?</div>
        <div class="orch-explainer">
          <p class="dag-explainer-text">A <strong>DAG</strong> (Directed Acyclic Graph) lets you run agents in parallel when they have no dependencies, and sequentially when one depends on another's output.</p>
          <div class="orch-explainer-steps">
            <div class="orch-step"><span class="orch-step-num">1</span><span><strong>Drag agents</strong> from the palette onto the canvas</span></div>
            <div class="orch-step"><span class="orch-step-num">2</span><span><strong>Connect outputs → inputs</strong> by dragging between ports to define dependencies</span></div>
            <div class="orch-step"><span class="orch-step-num">3</span><span><strong>Click an edge</strong> to remove a connection</span></div>
            <div class="orch-step"><span class="orch-step-num">4</span><span>Agents on the same level <strong>run in parallel</strong>, dependent agents wait</span></div>
          </div>
        </div>
      </div>
      <div class="dag-editor-toolbar af-section">
        <div class="af-section-label">Details</div>
        <div class="af-grid-2">
          <div class="af-field">
            <label for="dag-form-title">Title</label>
            <input id="dag-form-title" type="text" placeholder="e.g. Full Review Pipeline" required>
          </div>
          <div class="af-field">
            <label for="dag-form-desc">Description</label>
            <input id="dag-form-desc" type="text" placeholder="Short description">
          </div>
        </div>
      </div>
      <div class="dag-editor-body">
        <div class="dag-node-palette" id="dag-node-palette"></div>
        <div class="dag-canvas-wrap">
          <svg id="dag-canvas" class="dag-canvas"></svg>
        </div>
      </div>
      <input id="dag-form-edit-id" type="hidden">
      <div class="modal-actions">
        <button type="button" id="dag-modal-cancel" class="modal-btn-cancel">Cancel</button>
        <button type="button" id="dag-auto-layout" class="modal-btn-cancel">Auto Layout</button>
        <button type="button" id="dag-modal-save" class="modal-btn-save">Save DAG</button>
      </div>
    </div>
  </div>`;

    const overlay = this.querySelector('#dag-modal');
    this.querySelector('#dag-modal-close').addEventListener('click', () => overlay.classList.add('hidden'));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
  }
}
customElements.define('claudeck-dag-editor', DagEditorModal);

class OrchestrateModal extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
  <div id="orch-modal" class="modal-overlay hidden">
    <div class="modal agent-form-modal">
      <div class="modal-header">
        <h3>Orchestrate</h3>
        <button id="orch-modal-close" class="modal-close">&times;</button>
      </div>
      <div class="af-section">
        <div class="af-section-label">How it works</div>
        <div class="orch-explainer">
          <div class="orch-explainer-steps">
            <div class="orch-step"><span class="orch-step-num">1</span><span>Describe your task in plain language</span></div>
            <div class="orch-step"><span class="orch-step-num">2</span><span>The orchestrator analyzes and decomposes it into sub-tasks</span></div>
            <div class="orch-step"><span class="orch-step-num">3</span><span>Each sub-task is delegated to the best-fit agent automatically</span></div>
            <div class="orch-step"><span class="orch-step-num">4</span><span>Results are synthesized into a unified response</span></div>
          </div>
        </div>
      </div>
      <div class="af-section">
        <div class="af-section-label">Task</div>
        <div class="af-field">
          <label for="orch-task-input">What do you need done?</label>
          <textarea id="orch-task-input" rows="5" placeholder="e.g. Review the current changes for bugs and security issues, then write tests for any uncovered code paths, and finally refactor any code smells you find."></textarea>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" id="orch-modal-cancel" class="modal-btn-cancel">Cancel</button>
        <button type="button" id="orch-modal-run" class="modal-btn-save">Run Orchestrator</button>
      </div>
    </div>
  </div>`;

    const overlay = this.querySelector('#orch-modal');
    this.querySelector('#orch-modal-close').addEventListener('click', () => overlay.classList.add('hidden'));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
  }
}
customElements.define('claudeck-orchestrate-modal', OrchestrateModal);

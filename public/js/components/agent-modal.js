class AgentModal extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
  <div id="agent-modal" class="modal-overlay hidden">
    <div class="modal agent-form-modal">
      <div class="modal-header">
        <h3 id="agent-modal-title">New Agent</h3>
        <button id="agent-modal-close" class="modal-close">&times;</button>
      </div>
      <form id="agent-form">
        <div class="af-section">
          <div class="af-section-label">Identity</div>
          <div class="af-grid-2">
            <div class="af-field">
              <label for="agent-form-title">Title</label>
              <input id="agent-form-title" type="text" placeholder="e.g. Code Documenter" required>
            </div>
            <div class="af-field">
              <label for="agent-form-icon">Icon</label>
              <select id="agent-form-icon">
                <option value="search">Search</option>
                <option value="bug">Bug</option>
                <option value="check">Check</option>
                <option value="tool" selected>Tool</option>
              </select>
            </div>
          </div>
          <div class="af-field">
            <label for="agent-form-desc">Description</label>
            <input id="agent-form-desc" type="text" placeholder="Short description of what this agent does" required>
          </div>
        </div>
        <div class="af-section">
          <div class="af-section-label">Behavior</div>
          <div class="af-field">
            <label for="agent-form-goal">Goal</label>
            <textarea id="agent-form-goal" rows="4" placeholder="Describe the agent's goal in detail. Be specific about what files to look at, what to check, and what output to produce..." required></textarea>
          </div>
        </div>
        <div class="af-section">
          <div class="af-section-label">Constraints</div>
          <div class="af-grid-2">
            <div class="af-field">
              <label for="agent-form-max-turns">Max Turns</label>
              <div class="af-input-with-hint">
                <input id="agent-form-max-turns" type="number" min="1" max="200" value="50">
                <span class="af-hint">1 - 200</span>
              </div>
            </div>
            <div class="af-field">
              <label for="agent-form-timeout">Timeout (seconds)</label>
              <div class="af-input-with-hint">
                <input id="agent-form-timeout" type="number" min="30" max="3600" value="300">
                <span class="af-hint">30 - 3600</span>
              </div>
            </div>
          </div>
        </div>
        <input id="agent-form-edit-id" type="hidden">
        <div class="modal-actions">
          <button type="button" id="agent-modal-cancel" class="modal-btn-cancel">Cancel</button>
          <button type="submit" class="modal-btn-save">Save Agent</button>
        </div>
      </form>
    </div>
  </div>`;

    const overlay = this.querySelector('#agent-modal');
    this.querySelector('#agent-modal-close').addEventListener('click', () => overlay.classList.add('hidden'));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
  }
}
customElements.define('claudeck-agent-modal', AgentModal);

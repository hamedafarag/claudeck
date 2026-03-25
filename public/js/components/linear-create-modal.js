// Web Component: Linear Create Issue Modal
class ClaudeckLinearCreate extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div id="linear-create-modal" class="modal-overlay hidden">
        <div class="modal">
          <div class="modal-header">
            <h3>Create Issue</h3>
            <button id="linear-create-close" class="modal-close">&times;</button>
          </div>
          <form id="linear-create-form">
            <label for="linear-create-title">Title</label>
            <input id="linear-create-title" type="text" placeholder="Issue title" required>
            <label for="linear-create-desc">Description</label>
            <textarea id="linear-create-desc" rows="3" placeholder="Optional description..."></textarea>
            <label for="linear-create-team">Project (Team)</label>
            <select id="linear-create-team" required>
              <option value="">Select a team...</option>
            </select>
            <label for="linear-create-state">State</label>
            <select id="linear-create-state" disabled>
              <option value="">Select a team first...</option>
            </select>
            <div class="modal-actions">
              <button type="button" id="linear-create-cancel" class="modal-btn-cancel">Cancel</button>
              <button type="submit" id="linear-create-submit" class="modal-btn-save">Create</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const overlay = this.querySelector('#linear-create-modal');
    const closeBtn = this.querySelector('#linear-create-close');

    closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  }
}

customElements.define('claudeck-linear-create', ClaudeckLinearCreate);

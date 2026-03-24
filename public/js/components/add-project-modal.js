class AddProjectModal extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
  <div id="add-project-modal" class="modal-overlay hidden">
    <div class="modal add-project-modal">
      <div class="modal-header">
        <h3>Add Project</h3>
        <button id="add-project-close" class="modal-close">&times;</button>
      </div>
      <div class="add-project-body">
        <div id="folder-breadcrumb" class="folder-breadcrumb"></div>
        <div id="folder-list" class="folder-list"></div>
        <div class="folder-select-row">
          <input id="add-project-name" type="text" placeholder="Project name" autocomplete="off">
          <button id="add-project-confirm" class="modal-btn-save">Add</button>
        </div>
      </div>
    </div>
  </div>`;

    const overlay = this.querySelector('#add-project-modal');
    const closeBtn = this.querySelector('#add-project-close');
    if (closeBtn) closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
    if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
  }
}
customElements.define('claudeck-add-project', AddProjectModal);

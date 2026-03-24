class SystemPromptModal extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
  <div id="system-prompt-modal" class="modal-overlay hidden">
    <div class="modal">
      <div class="modal-header">
        <h3>System Prompt</h3>
        <button id="sp-modal-close" class="modal-close">&times;</button>
      </div>
      <form id="system-prompt-form">
        <label for="sp-textarea">Custom instructions for Claude in this project</label>
        <p class="sp-hint">If a <code>CLAUDE.md</code> file exists in the project root, it is automatically included by the SDK — no need to duplicate it here.</p>
        <textarea id="sp-textarea" rows="8" placeholder="e.g., You are an expert in React + TypeScript. This is a monorepo..."></textarea>
        <div class="modal-actions">
          <button type="button" id="sp-clear-btn" class="modal-btn-cancel">Clear</button>
          <button type="button" id="sp-cancel-btn" class="modal-btn-cancel">Cancel</button>
          <button type="submit" class="modal-btn-save">Save</button>
        </div>
      </form>
    </div>
  </div>`;

    const overlay = this.querySelector('#system-prompt-modal');
    const closeBtn = this.querySelector('#sp-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
    if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
  }
}
customElements.define('claudeck-system-prompt-modal', SystemPromptModal);

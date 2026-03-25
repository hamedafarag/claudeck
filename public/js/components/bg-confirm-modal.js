// Web Component: Background Session Confirmation Dialog
class ClaudeckBgConfirm extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div id="bg-confirm-modal" class="modal-overlay hidden" data-persistent>
        <div class="modal bg-confirm-modal">
          <div class="modal-header">
            <h3>Session In Progress</h3>
          </div>
          <p class="bg-confirm-text">Claude is still responding in this session. What would you like to do?</p>
          <div class="modal-actions bg-confirm-actions">
            <button id="bg-confirm-cancel" class="modal-btn-cancel">Cancel</button>
            <button id="bg-confirm-abort" class="modal-btn-cancel bg-confirm-abort-btn">Abort Session</button>
            <button id="bg-confirm-background" class="modal-btn-save">Continue in Background</button>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('claudeck-bg-confirm', ClaudeckBgConfirm);

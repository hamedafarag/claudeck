// Web Component: Permission Approval Modal
class ClaudeckPermissionModal extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div id="perm-modal" class="modal-overlay hidden" data-persistent>
        <div class="modal perm-modal">
          <div class="modal-header perm-modal-header">
            <h3><span class="perm-tool-icon">&#9888;</span> <span id="perm-modal-tool-name">Tool Approval</span></h3>
          </div>
          <span id="perm-bg-badge" class="perm-bg-badge hidden"></span>
          <div id="perm-modal-summary" class="perm-modal-summary"></div>
          <details class="perm-modal-details">
            <summary>Full input</summary>
            <pre id="perm-modal-input" class="perm-modal-input"></pre>
          </details>
          <label class="perm-always-allow">
            <input type="checkbox" id="perm-always-allow-cb">
            Always allow <strong id="perm-always-allow-tool"></strong> this session
          </label>
          <div class="modal-actions">
            <button id="perm-deny-btn" class="perm-deny-btn">Deny</button>
            <button id="perm-allow-btn" class="perm-allow-btn">Allow</button>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('claudeck-permission-modal', ClaudeckPermissionModal);

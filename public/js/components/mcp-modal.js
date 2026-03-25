// Web Component: MCP Server Management Modal
class ClaudeckMcpModal extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div id="mcp-modal" class="modal-overlay hidden">
        <div class="modal mcp-modal">
          <div class="modal-header">
            <h3>MCP Servers</h3>
            <button id="mcp-modal-close" class="modal-close">&times;</button>
          </div>
          <div id="mcp-server-list" class="mcp-server-list"></div>
          <div id="mcp-form-container" class="mcp-form-container hidden">
            <h4 id="mcp-form-title" class="mcp-form-title">Add Server</h4>
            <form id="mcp-form">
              <label for="mcp-name">Name</label>
              <input id="mcp-name" type="text" placeholder="my-server" required>
              <label for="mcp-type">Type</label>
              <select id="mcp-type">
                <option value="stdio">stdio</option>
                <option value="sse">sse</option>
                <option value="http">http</option>
              </select>
              <div id="mcp-stdio-fields">
                <label for="mcp-command">Command</label>
                <input id="mcp-command" type="text" placeholder="npx -y @modelcontextprotocol/server-name">
                <label for="mcp-args">Args (one per line)</label>
                <textarea id="mcp-args" rows="2" placeholder="--flag&#10;value"></textarea>
                <label for="mcp-env">Environment (KEY=VALUE, one per line)</label>
                <textarea id="mcp-env" rows="2" placeholder="API_KEY=xxx"></textarea>
              </div>
              <div id="mcp-url-fields" class="hidden">
                <label for="mcp-url">URL</label>
                <input id="mcp-url" type="text" placeholder="https://...">
              </div>
              <div class="modal-actions">
                <button type="button" id="mcp-form-cancel" class="modal-btn-cancel">Cancel</button>
                <button type="submit" id="mcp-form-save" class="modal-btn-save">Save</button>
              </div>
            </form>
          </div>
          <div class="mcp-modal-footer">
            <button id="mcp-add-btn" class="modal-btn-save">+ Add Server</button>
          </div>
        </div>
      </div>
    `;

    const overlay = this.querySelector('#mcp-modal');
    const closeBtn = this.querySelector('#mcp-modal-close');

    closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  }
}

customElements.define('claudeck-mcp-modal', ClaudeckMcpModal);

// Web Component: Shortcuts Modal
class ClaudeckShortcutsModal extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div id="shortcuts-modal" class="modal-overlay hidden">
        <div class="modal">
          <div class="modal-header">
            <h3>Keyboard Shortcuts</h3>
            <button id="shortcuts-modal-close" class="modal-close">&times;</button>
          </div>
          <table class="shortcuts-table">
            <tr><td><span class="kbd">&#8984;K</span></td><td>Focus session search</td></tr>
            <tr><td><span class="kbd">&#8984;N</span></td><td>New session</td></tr>
            <tr><td><span class="kbd">&#8984;/</span></td><td>Show keyboard shortcuts</td></tr>
            <tr><td><span class="kbd">&#8984;B</span></td><td>Toggle right panel</td></tr>
            <tr><td><span class="kbd">&#8984;&#8679;E</span></td><td>Open file explorer</td></tr>
            <tr><td><span class="kbd">&#8984;&#8679;G</span></td><td>Open git panel</td></tr>
            <tr><td><span class="kbd">&#8984;&#8679;R</span></td><td>Open repos panel</td></tr>
            <tr><td><span class="kbd">&#8984;&#8679;V</span></td><td>Open events panel</td></tr>
            <tr><td><span class="kbd">&#8984;&#8679;A</span></td><td>Go to home page</td></tr>
            <tr><td><span class="kbd">&#8984;&#8679;T</span></td><td>Toggle tips feed</td></tr>
            <tr><td><span class="kbd">&#8984;1</span>&ndash;<span class="kbd">&#8984;4</span></td><td>Focus parallel pane 1&ndash;4</td></tr>
            <tr><td><span class="kbd">Esc</span></td><td>Close any open modal</td></tr>
            <tr><td><span class="kbd">Enter</span></td><td>Send message</td></tr>
            <tr><td><span class="kbd">Shift+Enter</span></td><td>New line in input</td></tr>
            <tr><td><span class="kbd">/</span></td><td>Slash commands autocomplete</td></tr>
            <tr><td><span class="kbd">&uarr;</span></td><td>Recall previous message (empty input)</td></tr>
            <tr><td><span class="kbd">&darr;</span></td><td>Recall next message (in history)</td></tr>
            <tr><td><span class="kbd">Esc</span></td><td>Cancel history navigation</td></tr>
          </table>
        </div>
      </div>
    `;

    const overlay = this.querySelector('#shortcuts-modal');
    const closeBtn = this.querySelector('#shortcuts-modal-close');

    closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  }
}

customElements.define('claudeck-shortcuts-modal', ClaudeckShortcutsModal);

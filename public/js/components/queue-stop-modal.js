// Web Component: Queue Stop Confirmation Dialog
class ClaudeckQueueStop extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div id="queue-stop-modal" class="modal-overlay hidden" data-persistent>
        <div class="modal queue-stop-modal">
          <div class="modal-header">
            <h3>Queue Active</h3>
          </div>
          <p class="queue-stop-text">You have queued messages. What would you like to do?</p>
          <div class="mq-queue-preview" id="queue-stop-preview"></div>
          <div class="modal-actions queue-stop-actions">
            <button id="queue-stop-all" class="modal-btn-cancel queue-stop-terminate">Terminate All</button>
            <button id="queue-stop-skip" class="modal-btn-cancel">Skip to Next</button>
            <button id="queue-stop-pause" class="modal-btn-save">Just Stop Current</button>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('claudeck-queue-stop', ClaudeckQueueStop);

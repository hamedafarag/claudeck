class CostDashboardModal extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
  <div id="cost-dashboard-modal" class="modal-overlay hidden">
    <div class="modal cost-dashboard-modal">
      <div class="modal-header">
        <h3>Cost Dashboard</h3>
        <button id="cost-modal-close" class="modal-close">&times;</button>
      </div>
      <div id="cost-dashboard-content">
        <div class="cost-summary-cards" id="cost-summary-cards"></div>
        <div class="cost-table-container">
          <table class="cost-table">
            <thead>
              <tr>
                <th data-sort="title">Session</th>
                <th data-sort="turns">Turns</th>
                <th data-sort="tokens">Tokens</th>
                <th data-sort="cost">Cost</th>
              </tr>
            </thead>
            <tbody id="cost-table-body"></tbody>
          </table>
        </div>
        <div class="cost-chart-section">
          <h4>Daily Costs (Last 30 Days)</h4>
          <div class="cost-chart" id="cost-chart"></div>
        </div>
      </div>
    </div>
  </div>`;

    const overlay = this.querySelector('#cost-dashboard-modal');
    const closeBtn = this.querySelector('#cost-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
    if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
  }
}
customElements.define('claudeck-cost-dashboard', CostDashboardModal);

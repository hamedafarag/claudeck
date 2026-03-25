class WelcomeOverlay extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
  <div id="welcome-overlay" class="welcome-overlay hidden">
    <div class="welcome-container">
      <div class="welcome-mascot">
        <img src="/icons/whaly.png" alt="Whaly" class="welcome-whaly" draggable="false">
      </div>
      <h1 class="welcome-title">Welcome to <span>Claudeck</span></h1>
      <div class="welcome-version">v1.0 &middot; browser-based AI development environment</div>
      <p class="welcome-description">
        Your local command center for Claude Code. Chat with AI, run workflows,
        manage projects, explore files, and orchestrate autonomous agents &mdash;
        all from a single interface.
      </p>
      <div class="welcome-features">
        <div class="welcome-feature">
          <div class="welcome-feature-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div>
            <div class="welcome-feature-title">AI Chat</div>
            <div class="welcome-feature-desc">Stream conversations with Claude, run slash commands, attach files</div>
          </div>
        </div>
        <div class="welcome-feature">
          <div class="welcome-feature-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
            </svg>
          </div>
          <div>
            <div class="welcome-feature-title">Agents & Workflows</div>
            <div class="welcome-feature-desc">Automate tasks with pre-built or custom agent pipelines</div>
          </div>
        </div>
        <div class="welcome-feature">
          <div class="welcome-feature-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div>
            <div class="welcome-feature-title">Dev Tools</div>
            <div class="welcome-feature-desc">File explorer, Git panel, MCP servers, cost analytics</div>
          </div>
        </div>
      </div>
      <div class="welcome-actions">
        <button id="welcome-get-started" class="welcome-btn-primary">Get Started</button>
        <button id="welcome-take-tour" class="welcome-btn-secondary">Take a Tour</button>
      </div>
      <div class="welcome-hint">Press <kbd>Enter</kbd> or <kbd>Esc</kbd> to skip</div>
    </div>
  </div>`;
  }
}
customElements.define('claudeck-welcome-overlay', WelcomeOverlay);

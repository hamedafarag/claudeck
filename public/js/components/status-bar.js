class StatusBar extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
  <footer class="status-bar" id="status-bar">
    <div class="status-bar-left">
      <span class="sb-item sb-version" id="sb-version" title="Claudeck version"></span>
      <span class="sb-sep"></span>
      <span class="sb-item sb-connection" id="sb-connection" title="Connection status">
        <span class="sb-dot" id="sb-dot"></span>
        <span id="sb-connection-text">connecting</span>
      </span>
      <span class="sb-sep"></span>
      <span class="sb-item sb-branch" id="sb-branch" title="Current git branch">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
        <span id="sb-branch-name">--</span>
      </span>
      <span class="sb-sep"></span>
      <span class="sb-item sb-project" id="sb-project" title="Current project">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <span id="sb-project-name">no project</span>
      </span>
    </div>
    <div class="status-bar-center">
      <span class="sb-item sb-activity" id="sb-activity"></span>
    </div>
    <div class="status-bar-right">
      <span class="sb-item sb-bg-sessions hidden" id="sb-bg-sessions" title="Background sessions">
        <span class="sb-bg-dot"></span>
        <span id="sb-bg-count">0</span> bg
      </span>
      <span class="sb-sep sb-bg-sep hidden" id="sb-bg-sep"></span>
      <span class="sb-item sb-tokens hidden" id="sb-streaming-tokens" title="Streaming tokens">
        <span id="sb-tokens-value">~0 tokens</span>
      </span>
      <span class="sb-sep sb-tokens-sep hidden" id="sb-tokens-sep"></span>
      <span class="sb-item sb-context-gauge" id="sb-context-gauge-item">
        <span id="context-gauge" class="context-gauge hidden" title="Session context usage">
          <span class="context-gauge-bar"><span id="context-gauge-fill" class="context-gauge-fill"></span></span>
          <span id="context-gauge-label" class="context-gauge-label">0/200k</span>
        </span>
      </span>
      <span class="sb-sep hidden" id="sb-gauge-sep"></span>
      <span class="sb-item sb-credits" id="sb-credits" title="Credits">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        <div class="sb-credits-popup" id="sb-credits-popup">
          <div class="sb-credits-header">Credits</div>
          <div class="sb-credits-body">
            <div class="sb-credits-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <div class="sb-credits-info">
                <span class="sb-credits-role">Creator & Architect</span>
                <span class="sb-credits-name">Hamed Farag</span>
              </div>
            </div>
            <div class="sb-credits-divider"></div>
            <div class="sb-credits-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 0-4 4c0 2 2 3 2 5h4c0-2 2-3 2-5a4 4 0 0 0-4-4z"/><line x1="10" y1="17" x2="14" y2="17"/><line x1="10" y1="20" x2="14" y2="20"/><line x1="11" y1="23" x2="13" y2="23"/></svg>
              <div class="sb-credits-info">
                <span class="sb-credits-role">AI Assistant</span>
                <span class="sb-credits-name">Claude Code AI</span>
              </div>
            </div>
          </div>
          <div class="sb-credits-sponsor">
            <div class="sb-credits-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
              <div class="sb-credits-info">
                <span class="sb-credits-role">Sponsor</span>
                <span class="sb-credits-name">WakeCap</span>
              </div>
            </div>
          </div>
          <a class="sb-credits-kofi" href="https://ko-fi.com/hamedfarag" target="_blank" rel="noopener noreferrer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ff5e5b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
            <span>Support on Ko-fi</span>
          </a>
        </div>
      </span>
      <span class="sb-sep sb-credits-sep"></span>
      <span class="sb-item sb-cost sb-cost-hint" id="sb-cost">
        <span id="sb-session-cost">$0.00</span>
        <span class="sb-cost-pipe">/</span>
        <span id="sb-total-cost">$0.00</span>
        <div class="sb-hint-popup">
          <div class="sb-hint-header">Session / Total Cost</div>
          <div class="sb-hint-body">
            <p>Every message carries a fixed <strong>~20k token</strong> overhead from the Claude Code SDK — this includes the system prompt (~12-15k), core tool schemas (~4-5k), and environment context (~1k).</p>
            <p>This cost is unavoidable and cannot be reduced. Disabling optional tools in Session settings saves only ~2-3k tokens.</p>
            <p class="sb-hint-dim">Subsequent turns benefit from Anthropic's prompt caching, which significantly reduces the effective cost.</p>
          </div>
        </div>
      </span>
    </div>
  </footer>`;
  }
}
customElements.define('claudeck-status-bar', StatusBar);

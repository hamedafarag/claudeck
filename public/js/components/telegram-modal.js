// Web Component: Telegram Settings Modal
class ClaudeckTelegramModal extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div id="telegram-modal" class="modal-overlay hidden">
        <div class="modal telegram-modal">
          <div class="modal-header">
            <h2>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.2 4.6L2.4 11.2c-.8.3-.8 1.5 0 1.8l4.6 1.7 1.7 5.5c.2.6 1 .8 1.4.3l2.5-2.8 4.8 3.5c.6.4 1.4.1 1.5-.6L21.2 4.6z"/>
              </svg>
              Telegram Notifications
            </h2>
            <button class="modal-close" id="telegram-close">&times;</button>
          </div>
          <div class="modal-body" style="padding:16px;">
            <div class="telegram-form">
              <label class="telegram-toggle-row">
                <input type="checkbox" id="telegram-enabled">
                <span>Enable Telegram notifications</span>
              </label>
              <div class="telegram-field">
                <label for="telegram-bot-token">Bot Token</label>
                <input type="password" id="telegram-bot-token" placeholder="123456:ABC-DEF..." autocomplete="off">
              </div>
              <div class="telegram-field">
                <label for="telegram-chat-id">Chat ID</label>
                <input type="text" id="telegram-chat-id" placeholder="-100123456789" autocomplete="off">
              </div>
              <div class="telegram-field">
                <label for="telegram-afk-timeout">AFK Approval Timeout (minutes)</label>
                <input type="number" id="telegram-afk-timeout" min="1" max="120" value="15" style="width:80px;">
              </div>

              <div class="telegram-notify-section">
                <label class="telegram-field-label">Notification Events</label>
                <div class="telegram-notify-grid">
                  <label class="telegram-toggle-row"><input type="checkbox" id="tg-notify-session" checked> Session complete</label>
                  <label class="telegram-toggle-row"><input type="checkbox" id="tg-notify-workflow" checked> Workflow complete</label>
                  <label class="telegram-toggle-row"><input type="checkbox" id="tg-notify-chain" checked> Chain complete</label>
                  <label class="telegram-toggle-row"><input type="checkbox" id="tg-notify-agent" checked> Agent complete</label>
                  <label class="telegram-toggle-row"><input type="checkbox" id="tg-notify-orchestrator" checked> Orchestrator complete</label>
                  <label class="telegram-toggle-row"><input type="checkbox" id="tg-notify-dag" checked> DAG complete</label>
                  <label class="telegram-toggle-row"><input type="checkbox" id="tg-notify-errors" checked> Errors &amp; failures</label>
                  <label class="telegram-toggle-row"><input type="checkbox" id="tg-notify-permissions" checked> Permission requests (AFK approve/deny)</label>
                  <label class="telegram-toggle-row"><input type="checkbox" id="tg-notify-start" checked> Task start</label>
                </div>
              </div>

              <div class="telegram-actions">
                <button class="btn btn-secondary" id="telegram-test-btn">Send Test</button>
                <button class="btn btn-primary" id="telegram-save-btn">Save</button>
              </div>
              <div id="telegram-status" class="telegram-status hidden"></div>
              <details class="telegram-help">
                <summary>Setup instructions</summary>
                <ol>
                  <li>Open Telegram and search for <strong>@BotFather</strong></li>
                  <li>Send <code>/newbot</code> and follow the prompts to create a bot</li>
                  <li>Copy the <strong>Bot Token</strong> and paste it above</li>
                  <li>Start a chat with your new bot (send <code>/start</code>)</li>
                  <li>To find your <strong>Chat ID</strong>, send a message to the bot, then visit:<br>
                    <code>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code><br>
                    Look for <code>"chat":{"id":...</code> in the response</li>
                  <li>For group chats, add the bot to the group and use the group's chat ID (starts with <code>-</code>)</li>
                </ol>
              </details>
            </div>
          </div>
        </div>
      </div>
    `;

    const overlay = this.querySelector('#telegram-modal');
    const closeBtn = this.querySelector('#telegram-close');

    closeBtn.addEventListener('click', () => overlay.classList.add('hidden'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  }
}

customElements.define('claudeck-telegram-modal', ClaudeckTelegramModal);

// Centralized DOM references
export const $ = {
  // Main controls
  projectSelect: document.getElementById("project-select"),
  newSessionBtn: document.getElementById("new-session-btn"),
  sessionList: document.getElementById("session-list"),
  messagesDiv: document.getElementById("messages"),
  messageInput: document.getElementById("message-input"),
  sendBtn: document.getElementById("send-btn"),
  stopBtn: document.getElementById("stop-btn"),
  toggleParallelBtn: document.getElementById("toggle-parallel-btn"),

  // Header
  connectionDot: document.getElementById("connection-dot"),
  connectionText: document.getElementById("connection-text"),
  accountEmail: document.getElementById("account-email"),
  accountPlan: document.getElementById("account-plan"),
  totalCostEl: document.getElementById("total-cost"),
  projectCostEl: document.getElementById("project-cost"),
  headerProjectName: document.getElementById("header-project-name"),

  // Toolbox
  toolboxBtn: document.getElementById("toolbox-btn"),
  toolboxPanel: document.getElementById("toolbox-panel"),

  // Workflows
  workflowBtn: document.getElementById("workflow-btn"),
  workflowPanel: document.getElementById("workflow-panel"),

  // System prompt
  spBadge: document.getElementById("system-prompt-badge"),
  spEditBtn: document.getElementById("system-prompt-edit-btn"),
  spModal: document.getElementById("system-prompt-modal"),
  spTextarea: document.getElementById("sp-textarea"),
  spForm: document.getElementById("system-prompt-form"),

  // File picker
  attachBtn: document.getElementById("attach-btn"),
  attachBadge: document.getElementById("attach-badge"),
  fpModal: document.getElementById("file-picker-modal"),
  fpSearch: document.getElementById("fp-search"),
  fpList: document.getElementById("fp-list"),
  fpCount: document.getElementById("fp-count"),

  // Prompt modal
  promptModal: document.getElementById("prompt-modal"),
  promptForm: document.getElementById("prompt-form"),
  modalCloseBtn: document.getElementById("modal-close"),
  modalCancelBtn: document.getElementById("modal-cancel"),

  // Shortcuts
  shortcutsModal: document.getElementById("shortcuts-modal"),

  // Cost dashboard
  costDashboardModal: document.getElementById("cost-dashboard-modal"),
  costModalClose: document.getElementById("cost-modal-close"),

  // Theme
  themeToggleBtn: document.getElementById("theme-toggle-btn"),
  themeIconSun: document.getElementById("theme-icon-sun"),
  themeIconMoon: document.getElementById("theme-icon-moon"),

  // Session search
  sessionSearchInput: document.getElementById("session-search"),

  // Streaming tokens
  streamingTokens: document.getElementById("streaming-tokens"),

  // Model selector
  modelSelect: document.getElementById("model-select"),

  // Permissions
  permModeSelect: document.getElementById("perm-mode-select"),
  permModal: document.getElementById("perm-modal"),
  permModalToolName: document.getElementById("perm-modal-tool-name"),
  permModalSummary: document.getElementById("perm-modal-summary"),
  permModalInput: document.getElementById("perm-modal-input"),
  permAlwaysAllowCb: document.getElementById("perm-always-allow-cb"),
  permAlwaysAllowTool: document.getElementById("perm-always-allow-tool"),
  permAllowBtn: document.getElementById("perm-allow-btn"),
  permDenyBtn: document.getElementById("perm-deny-btn"),

  // Background sessions
  bgConfirmModal: document.getElementById("bg-confirm-modal"),
  bgConfirmCancel: document.getElementById("bg-confirm-cancel"),
  bgConfirmAbort: document.getElementById("bg-confirm-abort"),
  bgConfirmBackground: document.getElementById("bg-confirm-background"),
  bgSessionIndicator: document.getElementById("bg-session-indicator"),
  bgSessionBadge: document.getElementById("bg-session-badge"),

  // Linear panel
  linearPanel: document.getElementById("linear-panel"),
  linearToggleBtn: document.getElementById("linear-toggle-btn"),
  linearRefreshBtn: document.getElementById("linear-refresh-btn"),
  linearCloseBtn: document.getElementById("linear-close-btn"),
  linearIssuesList: document.getElementById("linear-issues-list"),
  linearFooter: document.getElementById("linear-footer"),

  // Linear create issue
  linearCreateBtn: document.getElementById("linear-create-btn"),
  linearCreateModal: document.getElementById("linear-create-modal"),
  linearCreateForm: document.getElementById("linear-create-form"),
  linearCreateTitle: document.getElementById("linear-create-title"),
  linearCreateDesc: document.getElementById("linear-create-desc"),
  linearCreateTeam: document.getElementById("linear-create-team"),
  linearCreateState: document.getElementById("linear-create-state"),
  linearCreateClose: document.getElementById("linear-create-close"),
  linearCreateCancel: document.getElementById("linear-create-cancel"),
  linearCreateSubmit: document.getElementById("linear-create-submit"),
};

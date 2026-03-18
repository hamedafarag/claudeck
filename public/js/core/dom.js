// Centralized DOM references
export const $ = {
  // Home
  homeBtn: document.getElementById("home-btn"),
  homePage: document.getElementById("home-page"),

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

  // Workflows (panel kept for legacy, button merged into agent-btn)
  workflowBtn: document.getElementById("workflow-btn"),   // removed from DOM — will be null
  workflowPanel: document.getElementById("workflow-panel"),

  // Workflow CRUD Modal
  wfModal: document.getElementById("wf-modal"),
  wfModalTitle: document.getElementById("wf-modal-title"),
  wfModalClose: document.getElementById("wf-modal-close"),
  wfModalCancel: document.getElementById("wf-modal-cancel"),
  wfForm: document.getElementById("wf-form"),
  wfFormTitle: document.getElementById("wf-form-title"),
  wfFormDesc: document.getElementById("wf-form-desc"),
  wfStepsList: document.getElementById("wf-steps-list"),
  wfAddStepBtn: document.getElementById("wf-add-step-btn"),
  wfFormEditId: document.getElementById("wf-form-edit-id"),

  // Agents
  agentBtn: document.getElementById("agent-btn"),
  agentPanel: document.getElementById("agent-panel"),
  agentModal: document.getElementById("agent-modal"),
  agentModalTitle: document.getElementById("agent-modal-title"),
  agentModalClose: document.getElementById("agent-modal-close"),
  agentModalCancel: document.getElementById("agent-modal-cancel"),
  agentForm: document.getElementById("agent-form"),
  agentFormTitle: document.getElementById("agent-form-title"),
  agentFormDesc: document.getElementById("agent-form-desc"),
  agentFormIcon: document.getElementById("agent-form-icon"),
  agentFormGoal: document.getElementById("agent-form-goal"),
  agentFormMaxTurns: document.getElementById("agent-form-max-turns"),
  agentFormTimeout: document.getElementById("agent-form-timeout"),
  agentFormEditId: document.getElementById("agent-form-edit-id"),

  // Agent Chains
  chainModal: document.getElementById("chain-modal"),
  chainModalTitle: document.getElementById("chain-modal-title"),
  chainModalClose: document.getElementById("chain-modal-close"),
  chainModalCancel: document.getElementById("chain-modal-cancel"),
  chainForm: document.getElementById("chain-form"),
  chainFormTitle: document.getElementById("chain-form-title"),
  chainFormDesc: document.getElementById("chain-form-desc"),
  chainAgentList: document.getElementById("chain-agent-list"),
  chainAddAgentBtn: document.getElementById("chain-add-agent-btn"),
  chainFormContext: document.getElementById("chain-form-context"),
  chainFormEditId: document.getElementById("chain-form-edit-id"),

  // DAG Editor
  dagModal: document.getElementById("dag-modal"),
  dagModalTitle: document.getElementById("dag-modal-title"),
  dagModalClose: document.getElementById("dag-modal-close"),
  dagModalCancel: document.getElementById("dag-modal-cancel"),
  dagModalSave: document.getElementById("dag-modal-save"),
  dagAutoLayout: document.getElementById("dag-auto-layout"),
  dagFormTitle: document.getElementById("dag-form-title"),
  dagFormDesc: document.getElementById("dag-form-desc"),
  dagFormEditId: document.getElementById("dag-form-edit-id"),
  dagNodePalette: document.getElementById("dag-node-palette"),
  dagCanvas: document.getElementById("dag-canvas"),

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

  // Image attachments
  imageBtn: document.getElementById("image-btn"),
  imageFileInput: document.getElementById("image-file-input"),
  imagePreviewStrip: document.getElementById("image-preview-strip"),

  // Voice input
  micBtn: document.getElementById("mic-btn"),

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

  // Context gauge
  contextGauge: document.getElementById("context-gauge"),
  contextGaugeFill: document.getElementById("context-gauge-fill"),
  contextGaugeLabel: document.getElementById("context-gauge-label"),

  // Streaming tokens (status bar)
  streamingTokens: document.getElementById("sb-streaming-tokens"),
  streamingTokensValue: document.getElementById("sb-tokens-value"),
  streamingTokensSep: document.getElementById("sb-tokens-sep"),

  // Model selector
  modelSelect: document.getElementById("model-select"),

  // Max turns selector
  maxTurnsSelect: document.getElementById("max-turns-select"),

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

  // Telegram
  telegramBtn: document.getElementById("telegram-settings-btn"),
  telegramModal: document.getElementById("telegram-modal"),
  telegramEnabled: document.getElementById("telegram-enabled"),
  telegramBotToken: document.getElementById("telegram-bot-token"),
  telegramChatId: document.getElementById("telegram-chat-id"),
  telegramAfkTimeout: document.getElementById("telegram-afk-timeout"),
  telegramTestBtn: document.getElementById("telegram-test-btn"),
  telegramSaveBtn: document.getElementById("telegram-save-btn"),
  telegramClose: document.getElementById("telegram-close"),
  telegramLabel: document.getElementById("telegram-label"),
  telegramStatus: document.getElementById("telegram-status"),
  tgNotifySession: document.getElementById("tg-notify-session"),
  tgNotifyWorkflow: document.getElementById("tg-notify-workflow"),
  tgNotifyChain: document.getElementById("tg-notify-chain"),
  tgNotifyAgent: document.getElementById("tg-notify-agent"),
  tgNotifyOrchestrator: document.getElementById("tg-notify-orchestrator"),
  tgNotifyDag: document.getElementById("tg-notify-dag"),
  tgNotifyErrors: document.getElementById("tg-notify-errors"),
  tgNotifyPermissions: document.getElementById("tg-notify-permissions"),
  tgNotifyStart: document.getElementById("tg-notify-start"),

  // Tips feed panel
  tipsFeedPanel: document.getElementById("tips-feed-panel"),
  tipsFeedToggleBtn: document.getElementById("tips-feed-toggle-btn"),
  tipsFeedClose: document.getElementById("tips-feed-close"),
  tipsFeedContent: document.getElementById("tips-feed-content"),
  tipsFeedResize: document.getElementById("tips-feed-resize"),

  // Right panel
  rightPanel: document.getElementById("right-panel"),
  rightPanelToggleBtn: document.getElementById("right-panel-toggle-btn"),
  rightPanelClose: document.getElementById("right-panel-close"),

  // File explorer (inside right panel files tab)
  fileExplorerSearch: document.getElementById("file-explorer-search"),
  fileRefreshBtn: document.getElementById("file-refresh-btn"),
  fileTree: document.getElementById("file-tree"),
  filePreview: document.getElementById("file-preview"),
  filePreviewName: document.getElementById("file-preview-name"),
  filePreviewContent: document.getElementById("file-preview-content"),
  filePreviewImage: document.getElementById("file-preview-image"),
  filePreviewClose: document.getElementById("file-preview-close"),


  // Memory panel (inside right panel memory tab)
  memoryTitle: document.getElementById("memory-title"),
  memoryOptimizeBtn: document.getElementById("memory-optimize-btn"),
  memoryAddBtn: document.getElementById("memory-add-btn"),
  memorySearchInput: document.getElementById("memory-search-input"),
  memoryFilters: document.getElementById("memory-filters"),
  memoryList: document.getElementById("memory-list"),
  memoryInputBar: document.getElementById("memory-input-bar"),
  memoryStatsBar: document.getElementById("memory-stats-bar"),

  // Git panel (inside right panel git tab)
  gitBranchSelect: document.getElementById("git-branch-select"),
  gitRefreshBtn: document.getElementById("git-refresh-btn"),
  gitStatusList: document.getElementById("git-status-list"),
  gitCommitMsg: document.getElementById("git-commit-msg"),
  gitCommitBtn: document.getElementById("git-commit-btn"),
  gitLogList: document.getElementById("git-log-list"),

  // MCP manager
  mcpToggleBtn: document.getElementById("mcp-toggle-btn"),
  mcpModal: document.getElementById("mcp-modal"),
  mcpModalClose: document.getElementById("mcp-modal-close"),
  mcpServerList: document.getElementById("mcp-server-list"),
  mcpFormContainer: document.getElementById("mcp-form-container"),
  mcpFormTitle: document.getElementById("mcp-form-title"),
  mcpForm: document.getElementById("mcp-form"),
  mcpName: document.getElementById("mcp-name"),
  mcpType: document.getElementById("mcp-type"),
  mcpStdioFields: document.getElementById("mcp-stdio-fields"),
  mcpUrlFields: document.getElementById("mcp-url-fields"),
  mcpCommand: document.getElementById("mcp-command"),
  mcpArgs: document.getElementById("mcp-args"),
  mcpEnv: document.getElementById("mcp-env"),
  mcpUrl: document.getElementById("mcp-url"),
  mcpFormCancel: document.getElementById("mcp-form-cancel"),
  mcpFormSave: document.getElementById("mcp-form-save"),
  mcpAddBtn: document.getElementById("mcp-add-btn"),

  // Sidebar toggle (mobile)
  sidebarToggleBtn: document.getElementById("sidebar-toggle-btn"),
  sidebarBackdrop: document.getElementById("sidebar-backdrop"),

  // Agent sidebar
  agentSidebar: document.getElementById("agent-sidebar"),
  agentSidebarClose: document.getElementById("agent-sidebar-close"),

  // Orchestrate modal
  orchModal: document.getElementById("orch-modal"),
  orchModalClose: document.getElementById("orch-modal-close"),
  orchModalCancel: document.getElementById("orch-modal-cancel"),
  orchModalRun: document.getElementById("orch-modal-run"),
  orchTaskInput: document.getElementById("orch-task-input"),

  // Agent monitor
  agentMonitorModal: document.getElementById("agent-monitor-modal"),
  agentMonitorClose: document.getElementById("agent-monitor-close"),
  agentMonitorContent: document.getElementById("agent-monitor-content"),

  // Add project modal
  openVscodeBtn: document.getElementById("open-vscode-btn"),
  removeProjectBtn: document.getElementById("remove-project-btn"),
  addProjectBtn: document.getElementById("add-project-btn"),
  addProjectModal: document.getElementById("add-project-modal"),
  addProjectClose: document.getElementById("add-project-close"),
  addProjectName: document.getElementById("add-project-name"),
  addProjectConfirm: document.getElementById("add-project-confirm"),
  folderBreadcrumb: document.getElementById("folder-breadcrumb"),
  folderList: document.getElementById("folder-list"),

};

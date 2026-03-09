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

  // Agents
  agentBtn: document.getElementById("agent-btn"),
  agentPanel: document.getElementById("agent-panel"),

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

  // Analytics
  analyticsModal: document.getElementById("analytics-modal"),
  analyticsClose: document.getElementById("analytics-close"),
  analyticsContent: document.getElementById("analytics-content"),
  analyticsBtn: document.getElementById("analytics-btn"),

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

  // Streaming tokens
  streamingTokens: document.getElementById("streaming-tokens"),

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

  // Event stream (inside right panel events tab)
  eventStreamSearch: document.getElementById("event-stream-search"),
  eventStreamList: document.getElementById("event-stream-list"),
  eventStreamCount: document.getElementById("event-stream-count"),
  eventStreamClear: document.getElementById("event-stream-clear"),
  eventAutoscroll: document.getElementById("event-autoscroll"),

  // Linear panel (inside right panel tasks tab)
  linearRefreshBtn: document.getElementById("linear-refresh-btn"),
  linearIssuesList: document.getElementById("linear-issues-list"),
  linearFooter: document.getElementById("linear-footer"),

  // Tasks split
  tasksLinearSection: document.getElementById("tasks-linear-section"),
  tasksSplitHandle: document.getElementById("tasks-split-handle"),
  tasksTodoSection: document.getElementById("tasks-todo-section"),

  // Todo panel
  todoAddBtn: document.getElementById("todo-add-btn"),
  todoList: document.getElementById("todo-list"),
  todoInput: document.getElementById("todo-input"),
  todoInputBar: document.getElementById("todo-input-bar"),

  // File explorer (inside right panel files tab)
  fileExplorerSearch: document.getElementById("file-explorer-search"),
  fileRefreshBtn: document.getElementById("file-refresh-btn"),
  fileTree: document.getElementById("file-tree"),
  filePreview: document.getElementById("file-preview"),
  filePreviewName: document.getElementById("file-preview-name"),
  filePreviewContent: document.getElementById("file-preview-content"),
  filePreviewImage: document.getElementById("file-preview-image"),
  filePreviewClose: document.getElementById("file-preview-close"),

  // Repos panel (inside right panel repos tab)
  reposSearch: document.getElementById("repos-search"),
  reposRefreshBtn: document.getElementById("repos-refresh-btn"),
  reposAddGroupBtn: document.getElementById("repos-add-group-btn"),
  reposAddRepoBtn: document.getElementById("repos-add-repo-btn"),
  reposTree: document.getElementById("repos-tree"),

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

  // Add project modal
  openVscodeBtn: document.getElementById("open-vscode-btn"),
  addProjectBtn: document.getElementById("add-project-btn"),
  addProjectModal: document.getElementById("add-project-modal"),
  addProjectClose: document.getElementById("add-project-close"),
  addProjectName: document.getElementById("add-project-name"),
  addProjectConfirm: document.getElementById("add-project-confirm"),
  folderBreadcrumb: document.getElementById("folder-breadcrumb"),
  folderList: document.getElementById("folder-list"),

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

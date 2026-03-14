// Guided tour — uses Driver.js to walk users through Claudeck features
const TOUR_KEY = 'claudeck-tour-completed';

function buildSteps() {
  const hasSpeechApi = !document.body.classList.contains('no-speech-api');
  const steps = [
  // ── Sidebar & Navigation ──────────────────────────
  {
    element: '#home-btn',
    popover: {
      title: 'Home Dashboard',
      description: 'Your activity hub — see AI usage heatmaps, session stats, streaks, and analytics at a glance.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '#project-select',
    popover: {
      title: 'Project Selector',
      description: 'Switch between projects. Each project has its own sessions, system prompt, and MCP config.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#session-search',
    popover: {
      title: 'Session Search',
      description: 'Quickly find any session by name. Pro tip: use <kbd>Cmd+K</kbd> from anywhere.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#new-session-btn',
    popover: {
      title: 'New Chat',
      description: 'Start a fresh conversation with Claude. Shortcut: <kbd>Cmd+N</kbd>',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '.mode-toggle .toggle-switch',
    popover: {
      title: 'Parallel Mode',
      description: 'Split into a 2×2 grid and run 4 conversations simultaneously.',
      side: 'right',
      align: 'center',
    },
  },
  {
    element: '#session-list',
    popover: {
      title: 'Session History',
      description: 'All your chat sessions in one place. Click to switch, right-click to rename or delete.',
      side: 'right',
      align: 'start',
    },
  },
  {
    element: '#theme-toggle-btn',
    popover: {
      title: 'Theme Toggle',
      description: 'Switch between dark terminal mode and a warm light theme.',
      side: 'right',
      align: 'center',
    },
  },

  // ── Header Controls ───────────────────────────────
  {
    element: '.header-dropdown:first-of-type .header-dropdown-trigger',
    popover: {
      title: 'Session Settings',
      description: 'Configure approval mode (Bypass, Confirm Writes, Plan), choose your AI model, and set max conversation turns.',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '.header-dropdown:nth-of-type(2) .header-dropdown-trigger',
    popover: {
      title: 'Tools & Integrations',
      description: 'Access MCP servers, browser notifications, Telegram alerts, and developer docs.',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '#tips-feed-toggle-btn',
    popover: {
      title: 'Tips Feed',
      description: 'Contextual tips and learning resources to help you get more out of Claudeck. <kbd>Cmd+Shift+T</kbd>',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '#right-panel-toggle-btn',
    popover: {
      title: 'Right Panel',
      description: 'Toggle the file explorer, git panel, and plugin tabs. <kbd>Cmd+B</kbd>',
      side: 'bottom',
      align: 'center',
    },
  },

  // ── Chat Area ─────────────────────────────────────
  {
    element: '#agent-btn',
    popover: {
      title: 'Agents & Workflows',
      description: 'Open the agent sidebar to run autonomous agents, sequential chains, DAG pipelines, or multi-step workflows.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#attach-btn',
    popover: {
      title: 'Attach Files',
      description: 'Browse your project files and attach them as context for Claude.',
      side: 'top',
      align: 'center',
    },
  },
  ...(hasSpeechApi ? [{
    element: '#mic-btn',
    popover: {
      title: 'Voice Input',
      description: 'Speak your message — uses Web Speech API for real-time speech-to-text.',
      side: 'top',
      align: 'center',
    },
  }] : []),
  {
    element: '#toolbox-btn',
    popover: {
      title: 'Prompt Templates',
      description: 'Access your saved prompts. Create reusable templates with {{variable}} placeholders.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#message-input',
    popover: {
      title: 'Chat Input',
      description: 'Type your message here. Start with <kbd>/</kbd> for slash commands like /clear, /export, /costs, and more. <kbd>Shift+Enter</kbd> for a new line.',
      side: 'top',
      align: 'center',
    },
  },
  {
    element: '#send-btn',
    popover: {
      title: 'Send Message',
      description: 'Send your message to Claude, or press <kbd>Enter</kbd>. While streaming, this becomes a stop button.',
      side: 'top',
      align: 'center',
    },
  },

  // ── Status Bar ────────────────────────────────────
  {
    element: '.status-bar',
    popover: {
      title: 'Status Bar',
      description: 'Real-time info at a glance — connection status, git branch, active project, streaming tokens, context usage, and costs.',
      side: 'top',
      align: 'center',
    },
  },
  ];

  return steps;
}

/**
 * Start the guided tour.
 */
export function startTour() {
  if (typeof window.driver === 'undefined') {
    console.warn('Driver.js not loaded');
    return;
  }

  const driverObj = window.driver.js.driver({
    showProgress: true,
    animate: true,
    overlayColor: 'rgba(0, 0, 0, 0.35)',
    stagePadding: 6,
    stageRadius: 8,
    smoothScroll: true,
    popoverClass: 'claudeck-tour',
    allowClose: true,
    doneBtnText: 'Finish',
    nextBtnText: 'Next →',
    prevBtnText: '← Back',
    showButtons: ['next', 'previous', 'close'],
    steps: buildSteps(),
    onDestroyed: () => {
      localStorage.setItem(TOUR_KEY, '1');
    },
  });

  driverObj.drive();
}

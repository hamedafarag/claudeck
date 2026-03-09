// Centralized reactive state store
const state = {
  ws: null,
  sessionId: null,
  parallelMode: false,
  streamingCharCount: 0,
  prompts: [],
  workflows: [],
  agents: [],
  projectsData: [],
  attachedFiles: [],
  imageAttachments: [],
  allProjectFiles: [],
  mermaidCounter: 0,
  savedChatArea: null,
  backgroundSessions: new Map(),
  notificationsEnabled: false,
  sessionTokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
};

const listeners = {};

export function getState(key) {
  return state[key];
}

export function setState(key, val) {
  state[key] = val;
  emit(key, val);
}

export function on(key, fn) {
  (listeners[key] ||= []).push(fn);
}

function emit(key, val) {
  (listeners[key] || []).forEach((fn) => fn(val));
}

// Centralized reactive state store
const state = {
  view: "home",
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

/** Subscribe to state changes for a key. Returns an unsubscribe function. */
export function on(key, fn) {
  (listeners[key] ||= []).push(fn);
  return () => {
    const arr = listeners[key];
    if (arr) listeners[key] = arr.filter(f => f !== fn);
  };
}

/** Remove a specific listener for a key. */
export function off(key, fn) {
  const arr = listeners[key];
  if (arr) listeners[key] = arr.filter(f => f !== fn);
}

function emit(key, val) {
  (listeners[key] || []).forEach((fn) => fn(val));
}

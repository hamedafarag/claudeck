// Simple pub/sub event bus for cross-module communication
const bus = {};

export function emit(event, data) {
  (bus[event] || []).forEach((fn) => fn(data));
}

export function on(event, fn) {
  (bus[event] ||= []).push(fn);
}

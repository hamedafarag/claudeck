// Simple pub/sub event bus for cross-module communication
const bus = {};

export function emit(event, data) {
  (bus[event] || []).forEach((fn) => fn(data));
}

/** Subscribe to an event. Returns an unsubscribe function. */
export function on(event, fn) {
  (bus[event] ||= []).push(fn);
  return () => {
    const arr = bus[event];
    if (arr) bus[event] = arr.filter(f => f !== fn);
  };
}

/** Remove a specific listener for an event. */
export function off(event, fn) {
  const arr = bus[event];
  if (arr) bus[event] = arr.filter(f => f !== fn);
}

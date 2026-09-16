
const listeners = new Map();

function on(eventName, handler) {
  if (!listeners.has(eventName)) listeners.set(eventName, new Set());
  listeners.get(eventName).add(handler);
  return () => off(eventName, handler);
}

function off(eventName, handler) {
  const eventListeners = listeners.get(eventName);
  if (!eventListeners) return;
  eventListeners.delete(handler);
  if (eventListeners.size === 0) listeners.delete(eventName);
}

function emit(eventName, payload) {
  const eventListeners = listeners.get(eventName);
  if (!eventListeners) return;
  [...eventListeners].forEach(handler => handler(payload));
}

export { on, off, emit };

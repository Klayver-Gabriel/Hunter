const keys = ['data-calculation-target', 'data-field', 'data-attr', 'data-res-current', 'data-res-max', 'data-res-name', 'data-save', 'data-skill-prof', 'data-skill-expertise', 'data-config-path', 'data-mastery', 'data-armor-slot'];
export function preserveFocus(render) {
  const current = document.activeElement;
  const key = keys.find(k => current?.hasAttribute(k));
  const selector = key ? `[${key}="${CSS.escape(current.getAttribute(key))}"]` : current?.id ? `#${CSS.escape(current.id)}` : null;
  const start = current?.selectionStart, end = current?.selectionEnd;
  render();
  if ((!current?.isConnected || document.activeElement !== current) && selector) {
    const next = document.querySelector(selector);
    next?.focus({ preventScroll: true });
    if (typeof start === 'number' && next?.setSelectionRange && ['text', 'search', 'url', 'tel', 'password'].includes(next.type)) next.setSelectionRange(start, end);
  }
}

/** Debounce independente do repositório e da interface. */
export function createAutosave(save) {
  let timer = null;
  const cancel = () => { clearTimeout(timer); timer = null; };
  function schedule(value, onStatus = () => {}, delay = 500) {
    onStatus('saving'); cancel();
    const snapshot = structuredClone(value);
    timer = setTimeout(() => { timer = null; onStatus(save(snapshot) ? 'saved' : 'error'); }, delay);
  }
  return { schedule, cancel };
}

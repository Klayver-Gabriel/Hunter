const descriptions = {
  'guild-card': 'Identidade, atributos e recursos do seu caçador.',
  'dnd-rules': 'Defesas, resistências e perícias em um só lugar.',
  armory: 'Sua arma, seus ataques e sua evolução em maestria.',
  equipment: 'Monte seu equipamento e acompanhe os bônus ativos.',
  library: 'Suas armas e armaduras, prontas para equipar.',
  records: 'Poderes, magias e anotações da sua jornada.',
  calculations: 'Fórmulas, progressões, conjuração e ajustes de combate.',
  temporal: 'Gerencie os efeitos de cada turno, rodada e descanso.'
};
const equipmentPages = ['equipment', 'armory', 'library'];
const keyOf = control => control.dataset.pageKey || control.hash.slice(1);

/** Page selection is local UI state; switching pages never changes the sheet. */
export function createPageNavigation() {
  const nav = document.querySelector('.guild-nav');
  const controls = [...document.querySelectorAll('[data-page-link]')];
  const pages = [...document.querySelectorAll('[data-sheet-page]')];
  const title = document.getElementById('page-title');
  let active = pageFromHash();

  function pageFromHash() {
    const key = location.hash.slice(1);
    return pages.find(page => page.dataset.sheetPage === key || page.contains(document.getElementById(key)))?.dataset.sheetPage || 'guild-card';
  }
  function available(key) {
    const section = document.getElementById(key);
    return section && !section.matches('[data-component-hidden], [data-component-empty]');
  }
  function render() {
    if (!available(active)) {
      active = equipmentPages.includes(active) ? equipmentPages.find(available) || 'guild-card' : 'guild-card';
      history.replaceState(null, '', `#${active}`);
    }
    for (const page of pages) page.hidden = page.dataset.sheetPage !== active;
    for (const control of controls) {
      const key = keyOf(control);
      const selected = key === active || (control.matches('.guild-nav__link') && key === 'equipment' && equipmentPages.includes(active));
      if (selected) control.setAttribute('aria-current', 'page'); else control.removeAttribute('aria-current');
      const label = control.querySelector('[data-nav-label]').textContent.trim();
      control.setAttribute('aria-label', label);
      if (key === active) title.textContent = label;
    }
    document.querySelector('.equipment-navigation').hidden = !equipmentPages.includes(active);
    document.getElementById(`page-${active}`).setAttribute('aria-label', title.textContent);
    document.getElementById('page-description').textContent = descriptions[active];
    document.documentElement.dataset.activePage = active;
  }
  function select(key, { focus = false, push = false } = {}) {
    if (push && key !== active) history.pushState(null, '', `#${key}`);
    active = key; render();
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (focus) title.focus({ preventScroll: true });
  }
  function onClick(event) {
    const control = event.target.closest('[data-page-link], .guild-nav__brand');
    if (!control || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault(); select(keyOf(control), { focus: true, push: true });
  }
  nav.addEventListener('click', onClick);
  document.querySelector('.equipment-navigation').addEventListener('click', onClick);
  document.querySelector('.skip-link').addEventListener('click', event => {
    event.preventDefault();
    title.focus();
  });
  nav.addEventListener('keydown', event => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !event.target.matches('[data-page-link]')) return;
    event.preventDefault();
    const visible = controls.filter(control => nav.contains(control) && !control.hasAttribute('data-component-hidden'));
    const index = visible.indexOf(event.target);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length;
    visible[next]?.focus();
  });
  window.addEventListener('hashchange', () => select(pageFromHash(), { focus: true }));
  window.addEventListener('load', () => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }), { once: true });
  return { render, select };
}

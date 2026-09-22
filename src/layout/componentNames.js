import { applyComponentVisibility } from './componentVisibility.js';
import { CATEGORIES, componentCatalog, displayName } from '../domain/componentCatalog.js';
import { escapeHTML as h } from './html.js';

const defaults = new WeakMap();
function defaultText(element) {
  if (!defaults.has(element)) defaults.set(element, element.textContent.trim());
  return defaults.get(element);
}
function applyLabel(element, label) {
  element.textContent = label;
  const id = element.dataset.componentLabel;
  if (id.startsWith('section:')) element.closest('section')?.setAttribute('aria-label', label);
  else if (id.startsWith('resource:')) {
    element.closest('.resource')?.querySelectorAll('.resource-value__label').forEach((el, index) => { el.textContent = `${label} ${index ? 'máximo' : 'atual'}`; });
  } else if (id.startsWith('skill:')) {
    const row = element.closest('.skill-row');
    row.querySelector('[data-skill-prof]').setAttribute('aria-label', `${label}: proficiência`);
    row.querySelector('[data-skill-expertise]').setAttribute('aria-label', `${label}: expertise`);
  } else element.parentElement.querySelector('[data-field], [data-attr], [data-armor-slot], [data-save], [data-config-path]')?.setAttribute('aria-label', label);
}
export function createNameEditor(store, root) {
  const dialog = document.getElementById('name-editor'), form = document.getElementById('name-editor-form');
  const error = document.getElementById('name-editor-error'), trigger = document.getElementById('btn-edit-names');
  const removalToggle = document.getElementById('btn-remove-components'), rows = document.getElementById('name-rows');
  const search = document.getElementById('name-search'), filter = document.getElementById('name-filter');
  let entries = new Map(), removing = false, category = 'identity', catalog = [], draft = new Map();
  function render() {
    const { character, sheetAppearance } = store.getDocument(); entries = new Map();
    root.querySelectorAll('[data-component-label]').forEach(element => {
      const id = element.dataset.componentLabel;
      entries.set(id, { element });
      applyLabel(element, displayName(character, sheetAppearance, id, defaultText(element)));
    });
    document.querySelectorAll('[data-page-link]:not([data-page-key="calculations"])').forEach(link => {
      const text = link.querySelector('[data-nav-label]');
      text.textContent = `${displayName(character, sheetAppearance, `section:${link.hash.slice(1)}`, defaultText(text))}`;
      link.title = text.textContent.trim();
    });
    applyComponentVisibility(root, entries, sheetAppearance, removing);
  }
  function drawRows() {
    const query = search.value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    const visible = catalog.filter(entry => {
      const item = draft.get(entry.id);
      const text = `${entry.original} ${item.label} ${entry.id}`.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
      return (!category || entry.category === category) && text.includes(query) && (filter.value === 'all' || (filter.value === 'hidden' ? item.hidden : item.label !== entry.original));
    });
    document.getElementById('name-editor-count').textContent = `${visible.length} componentes. Alterações pendentes só serão salvas ao aplicar.`;
    rows.innerHTML = visible.map((entry, index) => {
      const item = draft.get(entry.id);
      return `<div class="name-row" data-name-row="${h(entry.id)}">
        <div><strong>${h(entry.original)}</strong><small>${entry.kind === 'record' ? 'Nome de registro' : 'Rótulo estrutural'}${item.hidden ? ' · Oculto' : ''}</small></div>
        <label for="rename-${index}">Nome personalizado<input id="rename-${index}" data-name-input="${h(entry.id)}" aria-label="Nome de ${h(entry.original)}" value="${h(item.label)}" maxlength="120" required></label>
        <label class="visibility-check"><input type="checkbox" data-name-hidden="${h(entry.id)}" ${item.hidden ? 'checked' : ''}> Oculto</label>
        <button type="button" class="btn btn--ghost btn--sm" data-name-restore="${h(entry.id)}" aria-label="Restaurar ${h(entry.original)}">Restaurar</button>
      </div>`;
    }).join('') || '<p>Nenhum componente neste filtro.</p>';
  }
  function resetEntry(id) {
    const entry = catalog.find(e => e.id === id);
    draft.set(id, { label: entry.original, hidden: false, restored: true, labelDirty: true, hiddenDirty: true, dirty: true });
  }
  trigger.addEventListener('click', () => {
    const { character, sheetAppearance } = store.getDocument();
    catalog = componentCatalog(character, sheetAppearance);
    draft = new Map(catalog.map(e => [e.id, { label: displayName(character, sheetAppearance, e.id, e.original), hidden: !!sheetAppearance.components[e.id]?.hidden, dirty: false }]));
    category = ''; search.value = ''; filter.value = 'all'; error.hidden = true;
    const nav = document.getElementById('name-categories');
    nav.innerHTML = [['', 'Todas'], ...CATEGORIES].map(([key, label]) => `<button type="button" class="btn btn--ghost btn--sm" data-name-category="${key}" aria-pressed="${key === category}">${label}</button>`).join('');
    nav.onclick = event => {
      const button = event.target.closest('[data-name-category]'); if (!button) return;
      category = button.dataset.nameCategory;
      nav.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button))); drawRows();
    };
    drawRows(); dialog.showModal(); search.focus();
  });
  rows.addEventListener('input', event => {
    const id = event.target.dataset.nameInput || event.target.dataset.nameHidden; if (!id) return;
    const item = draft.get(id); item.dirty = true;
    if (event.target.dataset.nameInput) { item.label = event.target.value; item.restored = false; item.labelDirty = true; }
    else { item.hidden = event.target.checked; item.hiddenDirty = true; }
  });
  rows.addEventListener('click', event => {
    const button = event.target.closest('[data-name-restore]'); if (!button) return;
    const id = button.dataset.nameRestore; resetEntry(id); drawRows();
    rows.querySelector(`[data-name-input="${id}"]`)?.focus();
  });
  search.addEventListener('input', drawRows); filter.addEventListener('change', drawRows);
  document.getElementById('name-category-restore').addEventListener('click', () => {
    catalog.filter(e => !category || e.category === category).forEach(e => resetEntry(e.id)); drawRows();
  });
  document.getElementById('name-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { draft.clear(); trigger.focus(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      store.customizeComponents([...draft].filter(([, item]) => item.dirty).map(([id, item]) => ({ id, ...(item.labelDirty ? { label: item.restored ? null : item.label.trim() } : {}), ...(item.hiddenDirty ? { hidden: item.hidden } : {}) })));
      dialog.close();
    } catch (cause) { error.textContent = cause.message; error.hidden = false; }
  });
  removalToggle.addEventListener('click', () => {
    removing = !removing; removalToggle.setAttribute('aria-pressed', String(removing));
    removalToggle.textContent = removing ? 'Concluir remoção' : 'Remover componentes';
    root.classList.toggle('is-removing-components', removing);
    document.getElementById('component-removal-hint').hidden = !removing; render();
  });
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-component]'); if (!button) return;
    event.preventDefault(); event.stopPropagation();
    const id = button.dataset.removeComponent, entry = entries.get(id);
    if (entry && confirm(`Remover “${entry.element.textContent}” da tela? Você poderá restaurar na central de componentes.`)) {
      store.setComponentHidden(id, true); removalToggle.focus();
    }
  });
  return { render };
}

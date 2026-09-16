import { renderEntityFields } from './entityFields.js';
import * as C from '../domain/character.js';
import * as F from '../auto_calc_engine/formulaEvaluator.js';
import * as systemsUI from './systemsUI.js';
import * as modal from './modal.js';
import { preserveFocus } from './focus.js';

let character = null;
let store = null;
let actions = null; 

const RANK_COLOR_VAR = {
  'Low Rank': '--rank-low',
  'High Rank': '--rank-high',
  'Master Rank': '--rank-master',
  'Monster Hunter': '--rank-mhunter'
};

const ENTRY_CONFIG = {
  powers: {
    eyebrow: 'Poder',
    fields: [
      { key: 'source', label: 'Origem / Tipo', type: 'text' },
      { key: 'description', label: 'Descrição', type: 'textarea', rows: 6 }
    ],
    subtitle: (e) => e.source || '',
  },
  spells: {
    eyebrow: 'Magia',
    fields: [
      { key: 'level', label: 'Círculo / Nível', type: 'text' },
      { key: 'school', label: 'Escola', type: 'text' },
      { key: 'description', label: 'Descrição', type: 'textarea', rows: 6 }
    ],
    subtitle: (e) => [e.level, e.school].filter(Boolean).join(' · '),
  },
  journal: {
    eyebrow: 'Anotação do Diário',
    fields: [
      { key: 'date', label: 'Data / Sessão', type: 'text' },
      { key: 'description', label: 'Anotação', type: 'textarea', rows: 8 }
    ],
    subtitle: (e) => e.date || '',
  }
};

const TAB_LIST = ['powers', 'spells', 'journal'];

function init(applicationStore, topActions) {
  store = applicationStore; actions = topActions; character = store.getState();
  systemsUI.init(store);
  bindFieldInputs(); bindResourceAdd(); bindTabs(); bindTopActions();
  store.subscribe(next => { character = next; preserveFocus(renderAll); });
  renderAll();
}

function renderAll() {
  actions.beforeRender?.();
  renderInfoFields();
  renderSeal();
  renderAttributes();
  renderResources();
  TAB_LIST.forEach(renderEntryList);
  systemsUI.renderAll();
  renderEntityFields(document.getElementById('app'), store);
  actions.afterRender?.();
}

function renderInfoFields() {
  document.querySelectorAll('[data-field^="info."]').forEach(el => {
    const path = el.dataset.field;
    const value = C.get(character, path);
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT') {
      el.value = value ?? '';
    } else {
      el.textContent = (value === '' || value == null) ? el.dataset.placeholder || '' : value;
    }
  });
}

function bindFieldInputs() {
  document.querySelectorAll('[data-field^="info."]').forEach(el => {
    const path = el.dataset.field;
    const isNumber = el.type === 'number';
    const eventName = (el.tagName === 'SELECT' || el.type === 'number') ? 'change' : 'blur';

    el.addEventListener(eventName, () => {
      let value = (el.tagName === 'INPUT' || el.tagName === 'SELECT') ? el.value : el.textContent.trim();
      if (isNumber) value = Number(value) || 0;
      store.dispatch('setField', { path, value });
    });

    // contenteditable: Enter confirma e tira o foco, em vez de quebrar linha
    if (el.isContentEditable) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      });
    }
  });
}

function renderSeal() {
  const seal = document.getElementById('guild-seal');
  const levelEl = document.getElementById('seal-level');
  const rankEl = document.getElementById('seal-rank');
  const rank = character.info.guildRank || 'Low Rank';
  const varName = RANK_COLOR_VAR[rank] || '--rank-low';

  levelEl.textContent = character.info.level || 1;
  rankEl.textContent = rank;
  seal.style.setProperty('--rank-color', `var(${varName})`);
}

function renderAttributes() {
  const grid = document.getElementById('attr-grid');
  grid.innerHTML = C.ATTRS.map(key => {
    const score = character.attributes[key];
    const modVal = F.mod(score);
    return `
      <div class="attr-tile">
        <div class="attr-tile__label">${C.ATTR_LABELS[key]}</div>
        <input class="attr-tile__score field-input mono" type="number"
               data-attr="${key}" value="${score}" min="1" max="30">
        <span class="attr-tile__mod" data-neg="${modVal < 0}">${F.modStr(score)}</span>
      </div>`;
  }).join('');

  grid.querySelectorAll('[data-attr]').forEach(input => {
    input.addEventListener('change', () => {
      const key = input.dataset.attr;
      store.dispatch('setAttribute', { key, value: input.value });
    });
  });
}

function renderResources() {
  const stack = document.getElementById('resource-stack');
  stack.innerHTML = character.resources.map(r => {
    const pct = F.percent(r.current, r.max);
    const typeClass = ['hp', 'atp', 'sanidade', 'evo'].includes(r.type)
      ? `resource--${r.type}` : 'resource--custom';
    return `
      <div class="resource ${typeClass}" data-id="${r.id}">
        <div class="resource__head">
          <span class="resource__name field-input" contenteditable="${r.removable}" data-res-name="${r.id}">${escapeHTML(r.name)}</span>
          <span class="resource__values">
            <input type="number" class="field-input mono" data-res-current="${r.id}" value="${r.current}">
            <span>/</span>
            <input type="number" class="field-input mono" data-res-max="${r.id}" value="${r.max}" ${r.type === 'hp' ? 'readonly title="Calculado automaticamente pelo D&D Rule Engine"' : ''}>
            ${r.removable ? `<button class="resource__remove" data-res-remove="${r.id}" title="Remover">&times;</button>` : ''}
          </span>
        </div>
        <div class="resource__track">
          <div class="resource__fill" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join('');

  stack.querySelectorAll('[data-res-current]').forEach(input => {
    input.addEventListener('change', () => updateResource(input.dataset.resCurrent, 'current', input.value));
  });
  stack.querySelectorAll('[data-res-max]').forEach(input => {
    input.addEventListener('change', () => updateResource(input.dataset.resMax, 'max', input.value));
  });
  stack.querySelectorAll('[data-res-name]').forEach(el => {
    el.addEventListener('blur', () => {
      const r = character.resources.find(x => x.id === el.dataset.resName);
      if (r) store.dispatch('setResource', { id: r.id, key: 'name', value: el.textContent });
    });
  });
  stack.querySelectorAll('[data-res-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      store.dispatch('removeResource', { id: btn.dataset.resRemove });
    });
  });
}

function updateResource(id, key, rawValue) {
  store.dispatch('setResource', { id, key, value: rawValue });
}

function bindResourceAdd() {
  document.getElementById('btn-add-resource').addEventListener('click', () => store.dispatch('addResource'));
}

function bindTabs() {
  TAB_LIST.forEach(name => {
    document.getElementById(`tab-btn-${name}`).addEventListener('click', () => switchTab(name));
  });
}

function switchTab(activeName) {
  TAB_LIST.forEach(name => {
    const btn = document.getElementById(`tab-btn-${name}`);
    const panel = document.getElementById(`tab-${name}`);
    const isActive = name === activeName;
    btn.setAttribute('aria-selected', String(isActive));
    panel.hidden = !isActive;
  });
}

function renderEntryList(listName) {
  const panel = document.getElementById(`tab-${listName}`);
  const config = ENTRY_CONFIG[listName];
  const entries = character[listName];

  const cardsHTML = entries.map(entry => `
    <div class="entry-card" data-entry-id="${entry.id}" data-list="${listName}" tabindex="0" role="button">
      <div class="entry-card__title">${escapeHTML(entry.title)}</div>
      <div class="entry-card__subtitle">${escapeHTML(config.subtitle(entry))}</div>
      <div class="entry-card__excerpt">${escapeHTML(entry.description || '')}</div>
    </div>`).join('');

  const emptyHTML = entries.length === 0
    ? `<div class="empty-hint">Nenhum registro ainda. Clique em "+ Novo" para começar.</div>` : '';

  panel.innerHTML = emptyHTML + cardsHTML + `
    <div class="entry-card entry-card--new" data-add="${listName}" tabindex="0" role="button">+ ${config.eyebrow}</div>`;

  panel.querySelectorAll('[data-entry-id]').forEach(card => {
    card.addEventListener('click', () => openEntryModal(listName, card.dataset.entryId));
  });
  panel.querySelector('[data-add]').addEventListener('click', () => openEntryModal(listName, null));
}

function openEntryModal(listName, entryId) {
  const config = ENTRY_CONFIG[listName];
  const entry = entryId ? character[listName].find(e => e.id === entryId) : null;

  modal.open({
    eyebrow: config.eyebrow,
    entry: entry,
    fields: config.fields,
    onSave: data => store.dispatch('saveEntry', { list: listName, id: entry?.id, data }),
    onDelete: entry ? () => store.dispatch('deleteEntry', { list: listName, id: entry.id }) : null
  });
}

function bindTopActions() {
  document.getElementById('btn-export').addEventListener('click', () => actions.exportSheet());
  const fileInput = document.getElementById('file-import');
  document.getElementById('btn-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    if (fileInput.files[0]) await actions.importSheet(fileInput.files[0]);
    fileInput.value = '';
  });
  document.getElementById('btn-new').addEventListener('click', () => actions.newSheet());

}

function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[s]));
}

export { init, renderAll };

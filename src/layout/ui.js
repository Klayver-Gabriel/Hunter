import * as calculationsUI from './calculationsUI.js';
import { calculateCharacter } from '../auto_calc_engine/characterCalculator.js';
import { displayName } from '../domain/componentCatalog.js';
import * as C from '../domain/character.js';
import * as F from '../auto_calc_engine/formulaEvaluator.js';
import * as systemsUI from './systemsUI.js';
import * as modal from './modal.js';
import { preserveFocus } from './focus.js';
import { createNameEditor } from './componentNames.js';

let character = null;
let store = null;
let actions = null;
let nameEditor = null;

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
  systemsUI.init(store); calculationsUI.init(store);
  nameEditor = createNameEditor(store, document.getElementById('app'));
  bindFieldInputs(); bindResourceAdd(); bindTabs(); bindTopActions();
  store.subscribe(next => { character = next; preserveFocus(renderAll); });
  renderAll();
}

function renderAll() {
  renderInfoFields();
  renderSeal();
  renderAttributes();
  renderResources();
  TAB_LIST.forEach(renderEntryList);
  systemsUI.renderAll();
  calculationsUI.render();
  nameEditor.render();
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
    el.setAttribute('aria-label', el.closest('.field')?.querySelector('label')?.textContent || 'Nome do Caçador');
    const isNumber = el.type === 'number';
    const eventName = (el.tagName === 'SELECT' || el.type === 'number') ? 'change' : 'blur';

    el.addEventListener(eventName, () => {
      let value = (el.tagName === 'INPUT' || el.tagName === 'SELECT') ? el.value : el.textContent.trim();
      if (isNumber) value = Number(value) || 0;
      if (C.get(character, path) === value) return;
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
    const computed = calculateCharacter(character);
    const score = computed.values[`attribute:${key}`];
    const rule = character.calculations.rules[`attribute:${key}`];
    const label = displayName(character, store.getDocument().sheetAppearance, `attribute:${key}`, C.ATTR_LABELS[key]);
    const modVal = F.mod(score);
    return `
      <div class="attr-tile">
        <div class="attr-tile__label" data-component-label="attribute:${key}">${C.ATTR_LABELS[key]}</div>
        <input class="attr-tile__score field-input mono" type="number"
               data-attr="${key}" aria-label="${escapeHTML(label)}" value="${score ?? ''}" min="1" max="30" ${rule && rule.mode !== 'manual' ? 'readonly' : ''}>
        <span class="attr-tile__mod" data-neg="${modVal < 0}">${score == null ? 'Erro' : F.modStr(score)}</span>${computed.errors[`attribute:${key}`] ? `<small class="rule-errors">${escapeHTML(computed.errors[`attribute:${key}`])}</small>` : ''}
      </div>`;
  }).join('');

  grid.querySelectorAll('[data-attr]').forEach(input => {
    input.addEventListener('change', () => {
      const key = input.dataset.attr;
      const computed = calculateCharacter(character);
      const bonus = (computed.values[`attribute:${key}`] ?? 0) - (computed.baseValues[`attribute:${key}`] ?? 0);
      store.dispatch('setAttribute', { key, value: Number(input.value) - bonus });
    });
  });
}

function renderResources() {
  const stack = document.getElementById('resource-stack');
  stack.innerHTML = character.resources.map(r => {
    const computed = calculateCharacter(character);
    const maximum = computed.values[`resource:${r.id}`];
    const rule = character.calculations.rules[`resource:${r.id}`];
    const automatic = rule ? rule.mode !== 'manual' : r.type === 'hp';
    const pct = F.percent(r.current, maximum);
    const typeClass = ['hp', 'atp', 'sanidade', 'evo'].includes(r.type)
      ? `resource--${r.type}` : 'resource--custom';
    return `
      <div class="resource ${typeClass}" data-id="${r.id}">
        <div class="resource__head">
          <span class="resource__name field-input" contenteditable="${r.removable}" data-res-name="${r.id}" data-component-label="resource:${r.id}">${escapeHTML(r.name)}</span>
          <span class="resource__values">
            <label class="resource-value"><span class="resource-value__label">${escapeHTML(r.name)} atual</span><input type="number" class="field-input mono" data-res-current="${r.id}" value="${r.current}"></label>
            <span>/</span>
            <label class="resource-value"><span class="resource-value__label">${escapeHTML(r.name)} máximo</span><input type="number" class="field-input mono" data-res-max="${r.id}" value="${maximum ?? ''}" ${automatic ? 'readonly title="Calculado automaticamente"' : ''}></label>
            ${r.removable ? `<button class="resource__remove" data-res-remove="${r.id}" title="Remover">&times;</button>` : ''}
          </span>
        </div>
        ${computed.errors[`resource:${r.id}`] ? `<p class="rule-errors">${escapeHTML(computed.errors[`resource:${r.id}`])}</p>` : ''}
        <div class="resource__track">
          <div class="resource__fill" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join('');

  stack.querySelectorAll('[data-res-current], [data-res-max]').forEach(input => {
    const resize = () => {
      input.style.setProperty('--resource-value-width', `${Math.max(1, input.value.length)}ch`);
      input.title = input.readOnly ? `Calculado automaticamente: ${input.value}` : input.value;
    };
    resize();
    input.addEventListener('input', resize);
  });

  stack.querySelectorAll('[data-res-current]').forEach(input => {
    input.addEventListener('change', () => updateResource(input.dataset.resCurrent, 'current', input.value));
  });
  stack.querySelectorAll('[data-res-max]').forEach(input => {
    input.addEventListener('change', () => updateResource(input.dataset.resMax, 'max', input.value));
  });
  stack.querySelectorAll('[data-res-name]').forEach(el => {
    el.addEventListener('blur', () => {
      const r = character.resources.find(x => x.id === el.dataset.resName);
      if (!r || el.textContent.trim() === displayName(character, store.getDocument().sheetAppearance, `resource:${r.id}`, r.name)) return;
      if (store.getDocument().sheetAppearance.components[`resource:${r.id}`]?.label) {
        const label = el.textContent.trim().slice(0, 120);
        if (label) store.renameComponent(`resource:${r.id}`, label);
        else nameEditor.render();
      } else store.dispatch('setResource', { id: r.id, key: 'name', value: el.textContent });
    });
  });
  stack.querySelectorAll('[data-res-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      try { store.dispatch('removeResource', { id: btn.dataset.resRemove }); }
      catch (error) { document.getElementById('calculation-error').textContent = error.message; document.getElementById('calculation-error').scrollIntoView({ block: 'center' }); }
    });
  });
}

function updateResource(id, key, rawValue) {
  if (key === 'max') {
    const computed = calculateCharacter(character);
    rawValue = Number(rawValue) - ((computed.values[`resource:${id}`] ?? 0) - (computed.baseValues[`resource:${id}`] ?? 0));
  }
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
  const calculated = calculateCharacter(character);
  const entries = character[listName];

  const cardsHTML = entries.map(entry => `
    <div class="entry-card" data-entry-id="${entry.id}" data-list="${listName}" tabindex="0" role="button">
      <div class="entry-card__title" data-component-label="record:${listName}:${entry.id}">${escapeHTML(entry.title)}</div>
      <div class="entry-card__subtitle">${escapeHTML(config.subtitle(entry))}</div>
      ${listName === 'spells' ? spellSummary(calculated.spells[entry.id]) : ''}
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
  panel.querySelectorAll('[role="button"]').forEach(card => card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); card.click(); }
  }));
}

function openEntryModal(listName, entryId) {
  const config = ENTRY_CONFIG[listName];
  const entry = entryId ? character[listName].find(e => e.id === entryId) : null;

  if (listName === 'spells') { calculationsUI.openSpell(entry); return; }
  modal.open({
    eyebrow: displayName(character, store.getDocument().sheetAppearance, `tab:${listName}`, config.eyebrow),
    entry: entry,
    fields: config.fields,
    onSave: data => store.dispatch('saveEntry', { list: listName, id: entry?.id, data }),
    onDelete: entry ? () => store.dispatch('deleteEntry', { list: listName, id: entry.id }) : null
  });
}

function spellSummary(result) {
  if (result.error) return `<p class="rule-errors" role="alert">DT: ${escapeHTML(result.error)}</p>`;
  if (result.value == null) return '<p class="spell-dt">Sem DT</p>';
  const resistance = result.resistance ? displayName(character, store.getDocument().sheetAppearance, `save:${result.resistance}`) : 'Sem resistência definida';
  return `<p class="spell-dt" title="${escapeHTML(Object.entries(result.variables || {}).map(([k, v]) => `${k} = ${v}`).join(' · '))}">DT ${result.value} · ${escapeHTML(resistance)}${result.bonus ? ` · bônus específico ${result.bonus}` : ''}</p>`;
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

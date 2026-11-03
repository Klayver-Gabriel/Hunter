import * as calculationsUI from './calculationsUI.js';
import { createComponentEditor } from './componentEditor.js';
import { getCalculableComponents } from '../domain/calculableComponents.js';
import { calculateCharacter } from '../auto_calc_engine/characterCalculator.js';
import { displayName } from '../domain/componentCatalog.js';
import * as C from '../domain/character.js';
import * as F from '../auto_calc_engine/formulaEvaluator.js';
import * as systemsUI from './systemsUI.js';
import * as modal from './modal.js';
import { preserveFocus } from './focus.js';
import { createPageNavigation } from './pageNavigation.js';
import { createNameEditor } from './componentNames.js';
import { createPhotoDataUrl } from './photo.js';

let character = null;
let componentEditor;
let store = null;
let nameEditor = null;
let navigation = null;

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

function init(applicationStore) {
  store = applicationStore; character = store.getState();
  systemsUI.init(store); calculationsUI.init(store);
  nameEditor = createNameEditor(store, document.getElementById('app'));
  componentEditor = createComponentEditor(store, document.getElementById('app'));
  calculationsUI.setComponentEditor(componentEditor);
  navigation = createPageNavigation();
  bindFieldInputs(); bindCharacterPhoto(); bindResourceAdd(); bindTabs();
  store.subscribe(next => { character = next; preserveFocus(renderAll); });
  renderAll();
}

function renderAll() {
  renderInfoFields();
  renderCharacterPhoto();
  renderSeal();
  renderAttributes();
  renderResources();
  renderCharacteristics();
  TAB_LIST.forEach(renderEntryList);
  systemsUI.renderAll();
  calculationsUI.render();
  nameEditor.render();
  componentEditor.render();
  navigation.render();
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

function renderCharacterPhoto() {
  const trigger = document.getElementById('btn-character-photo');
  const image = document.getElementById('character-photo');
  const photo = character.info.photo || '';
  trigger.style.setProperty('--portrait-width', `${character.info.photoWidth}px`);
  trigger.style.setProperty('--portrait-height', `${character.info.photoHeight}px`);
  trigger.style.setProperty('--portrait-x', `${character.info.photoX}%`);
  trigger.style.setProperty('--portrait-y', `${character.info.photoY}%`);
  trigger.style.setProperty('--portrait-zoom', `${character.info.photoZoom / 100}`);
  trigger.setAttribute('aria-label', photo ? 'Editar foto do personagem' : 'Adicionar foto do personagem');
  image.hidden = !photo;
  if (photo) {
    image.src = photo;
    image.alt = `Retrato de ${character.info.name || 'personagem'}`;
  } else {
    image.removeAttribute('src');
    image.alt = '';
  }
  document.getElementById('character-photo-placeholder').hidden = Boolean(photo);
}

function bindCharacterPhoto() {
  const dialog = document.getElementById('character-photo-editor');
  const form = document.getElementById('character-photo-editor-form');
  const image = document.getElementById('character-photo-editor-image');
  const placeholder = document.getElementById('character-photo-editor-placeholder');
  const input = document.getElementById('character-photo-editor-input');
  const replace = document.getElementById('btn-character-photo-replace');
  const remove = document.getElementById('btn-character-photo-delete');
  const apply = document.getElementById('btn-character-photo-apply');
  const status = document.getElementById('character-photo-editor-status');
  let request = 0;
  let draft = null, pending = false;

  function readSettings() {
    for (const key of ['width', 'height', 'x', 'y', 'zoom']) {
      const raw = form.elements[key].value;
      const value = Number(raw);
      if (raw !== '' && Number.isFinite(value)) draft[key] = value;
    }
  }

  function renderDraft() {
    if (!draft) return;
    const preview = document.getElementById('character-photo-editor-preview');
    preview.style.setProperty('--portrait-width', `${draft.width}px`);
    preview.style.setProperty('--portrait-height', `${draft.height}px`);
    preview.style.setProperty('--portrait-x', `${draft.x}%`);
    preview.style.setProperty('--portrait-y', `${draft.y}%`);
    preview.style.setProperty('--portrait-zoom', `${draft.zoom / 100}`);
    image.hidden = !draft.photo;
    if (draft.photo) image.src = draft.photo;
    else image.removeAttribute('src');
    placeholder.hidden = Boolean(draft.photo);
    replace.textContent = draft.photo ? 'Trocar foto' : 'Adicionar foto';
    remove.hidden = !draft.photo;
    document.getElementById('character-photo-zoom-value').value = `${draft.zoom}%`;
    document.getElementById('character-photo-x-value').value = `${draft.x}%`;
    document.getElementById('character-photo-y-value').value = `${draft.y}%`;
    apply.disabled = pending;
  }

  function openEditor() {
    if (dialog.open) return;
    request++;
    draft = {
      photo: character.info.photo || '',
      width: character.info.photoWidth,
      height: character.info.photoHeight,
      x: character.info.photoX,
      y: character.info.photoY,
      zoom: character.info.photoZoom
    };
    for (const key of ['width', 'height', 'x', 'y', 'zoom']) form.elements[key].value = draft[key];
    status.textContent = '';
    pending = false;
    renderDraft();
    dialog.showModal();
  }

  document.getElementById('btn-character-photo').addEventListener('click', openEditor);
  replace.addEventListener('click', () => { input.value = ''; input.click(); });
  remove.addEventListener('click', () => {
    request++;
    pending = false;
    input.value = '';
    draft.photo = '';
    status.textContent = 'A foto será removida ao aplicar.';
    renderDraft();
  });
  form.querySelectorAll('[name]').forEach(control => control.addEventListener('input', () => {
    readSettings();
    renderDraft();
  }));
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file || !draft) return;
    const currentRequest = ++request;
    pending = true;
    status.textContent = 'Preparando foto…';
    renderDraft();
    try {
      const photo = await createPhotoDataUrl(file);
      if (currentRequest !== request || !dialog.open) return;
      draft.photo = photo;
      status.textContent = '';
      renderDraft();
    } catch (error) {
      if (currentRequest === request && dialog.open) status.textContent = error.message;
    } finally {
      if (currentRequest === request) {
        pending = false;
        input.value = '';
        if (dialog.open) renderDraft();
      }
    }
  });
  document.getElementById('btn-character-photo-cancel').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!draft || pending || !form.reportValidity()) return;
    readSettings();
    try {
      store.dispatch('setCharacterPortrait', {
        photo: draft.photo, width: draft.width, height: draft.height,
        x: draft.x, y: draft.y, zoom: draft.zoom
      });
      dialog.close();
    } catch (error) { status.textContent = error.message; }
  });
  dialog.addEventListener('close', () => {
    request++;
    pending = false;
    input.value = '';
    draft = null;
  });
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
               data-attr="${key}" aria-label="${escapeHTML(label)}" value="${score ?? ''}" ${rule?.min != null ? `min="${rule.min}"` : ''} ${rule?.max != null ? `max="${rule.max}"` : ''} ${rule && !['manual', 'default'].includes(rule.mode) ? 'readonly' : ''}>
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
  const components = getCalculableComponents(store.getDocument());
  stack.innerHTML = character.resources.map(r => {
    const computed = calculateCharacter(character);
    const maximum = computed.values[`resource:${r.id}`];
    const automatic = !components.find(c => c.id === `resource:${r.id}`).inlineManual;
    const pct = F.percent(r.current, maximum);
    const typeClass = ['hp', 'atp', 'sanidade', 'evo'].includes(r.type)
      ? `resource--${r.type}` : 'resource--custom';
    return `
      <div class="resource ${typeClass}" data-id="${r.id}">
        <div class="resource__head">
          <span class="resource__name field-input" data-res-name="${r.id}" data-component-label="resource:${r.id}">${escapeHTML(r.name)}</span>
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
  stack.querySelectorAll('[data-res-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      try { store.dispatch('removeResource', { id: btn.dataset.resRemove }); }
      catch (error) { document.getElementById('calculation-error').textContent = error.message; navigation.select('calculations', { focus: true, push: true }); }
    });
  });
}

function renderCharacteristics() {
  const result = calculateCharacter(character), appearance = store.getDocument().sheetAppearance;
  document.getElementById('characteristic-values').innerHTML = character.calculations.characteristics.map(item => {
    const id = `characteristic:${item.id}`, labelId = `record:characteristics:${item.id}`;
    return `<article class="calculation-card"><h3 data-component-label="${labelId}">${escapeHTML(displayName(character, appearance, labelId, item.name))}</h3><strong>${result.values[id] ?? 'Erro de cálculo'}</strong>${result.errors[id] ? `<p class="rule-errors">${escapeHTML(result.errors[id])}</p>` : ''}</article>`;
  }).join('');
  document.getElementById('characteristics-panel').hidden = !character.calculations.characteristics.length;
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
      ${listName === 'spells' ? spellSummary(calculated.spells[entry.id], entry.id) : ''}
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

function spellSummary(result, id) {
  const trigger = `<span data-component-label="spell:${id}">DT</span>`;
  if (result.error) return `<p class="spell-dt rule-errors" role="alert">${trigger}: ${escapeHTML(result.error)}</p>`;
  if (result.value == null) return `<p class="spell-dt">Sem ${trigger}</p>`;
  const resistance = result.resistance ? displayName(character, store.getDocument().sheetAppearance, `save:${result.resistance}`) : 'Sem resistência definida';
  return `<p class="spell-dt" title="${escapeHTML(Object.entries(result.variables || {}).map(([k, v]) => `${k} = ${v}`).join(' · '))}">${trigger} ${result.value} · ${escapeHTML(resistance)}${result.bonus ? ` · bônus específico ${result.bonus}` : ''}</p>`;
}

function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[s]));
}

function selectPage(key) { navigation.select(key, { focus: true, push: true }); }

export { init, renderAll, selectPage };

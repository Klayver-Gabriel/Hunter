import { ABILITIES } from '../domain/catalog.js';
import { SKILL_TEMPLATES } from '../domain/skillTemplates.js';
import { displayName } from '../domain/componentCatalog.js';
import { uid } from '../domain/character.js';
import { escapeHTML as h } from './html.js';

/** The editor owns a disposable draft; only submitting publishes a store command. */
export function createSkillTemplateEditor(store, _systemProfiles = [], { remote = false } = {}) {
  const selector = document.getElementById('skill-template-select');
  const selectorField = document.getElementById('skill-template-select-field');
  const trigger = document.getElementById('btn-edit-skill-template');
  const dialog = document.getElementById('skill-template-editor');
  const rows = document.getElementById('skill-template-rows');
  const add = document.getElementById('skill-template-add');
  const error = document.getElementById('skill-template-error');
  let editingId;

  const profileTitle = id => store.getSystemProfiles?.().find(system => system.id === id)?.title;
  const options = SKILL_TEMPLATES;
  selector.innerHTML = options.map(t => `<option value="${h(t.id)}">${h(t.name)}</option>`).join('');
  if (remote) {
    selectorField.hidden = true;
    document.getElementById('skill-template-help').textContent = 'O sistema define perícias e cálculos. Os ajustes desta tabela ficam apenas nesta ficha.';
    trigger.textContent = 'Ajustar perícias';
  } else {
    selectorField.hidden = false;
  }
  if (!remote) selector.addEventListener('change', () => store.dispatch('switchSkillTemplate', { id: selector.value }));

  function appendRow(skill) {
    rows.insertAdjacentHTML('beforeend', `<div class="skill-template-row" data-template-skill="${h(skill.key)}">
      <label>Nome da perícia<input data-skill-name value="${h(skill.name)}" maxlength="120" required></label>
      <label>Atributo<select data-skill-ability>${ABILITIES.map(a => `<option value="${a.key}" ${a.key === skill.ability ? 'selected' : ''}>${h(a.label)}</option>`).join('')}</select></label>
      <label>Bônus manual<input data-skill-bonus type="number" step="any" value="${skill.bonus}" required></label>
      <button type="button" class="btn btn--ghost btn--sm" data-remove-skill aria-label="Remover perícia ${h(skill.name)}">Remover</button>
    </div>`);
  }

  trigger.addEventListener('click', () => {
    const { character, sheetAppearance } = store.getDocument();
    editingId = character.skillTables.activeId;
    const systemTitle = profileTitle(editingId) || character.systemTitle || options.find(t => t.id === editingId)?.name || editingId;
    document.getElementById('skill-template-title').textContent = `Ajustar perícias — ${systemTitle}`;
    document.getElementById('skill-template-current').textContent = `Perícias de ${systemTitle}`;
    rows.replaceChildren(); error.hidden = true;
    for (const skill of character.skillTables.templates[editingId] || []) {
      appendRow({ ...skill, name: displayName(character, sheetAppearance, `skill:${skill.key}`, skill.name) });
    }
    dialog.showModal(); (rows.querySelector('input') || add).focus();
  });
  add.addEventListener('click', () => {
    appendRow({ key: uid(`custom_${editingId}`), name: 'Nova perícia', ability: 'int', bonus: 0 });
    const input = rows.lastElementChild.querySelector('input'); input.focus(); input.select();
  });
  rows.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-skill]');
    if (!button) return;
    const row = button.closest('[data-template-skill]');
    const next = row.nextElementSibling || row.previousElementSibling;
    row.remove(); (next?.querySelector('input') || add).focus();
  });
  document.getElementById('skill-template-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { rows.replaceChildren(); trigger.focus(); });
  document.getElementById('skill-template-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const skills = [...rows.children].map(row => ({
        key: row.dataset.templateSkill,
        name: row.querySelector('[data-skill-name]').value.trim(),
        ability: row.querySelector('[data-skill-ability]').value,
        bonus: Number(row.querySelector('[data-skill-bonus]').value)
      }));
      store.dispatch('saveSkillTemplate', { id: editingId, skills }); dialog.close();
    } catch (cause) { error.textContent = cause.message; error.hidden = false; }
  });

  return { render() {
    const state = store.getState();
    const currentId = remote ? state.systemId : state.skillTables.activeId;
    if (!remote) selector.value = currentId;
    const title = profileTitle(currentId) || state.systemTitle || options.find(t => t.id === currentId)?.name || currentId;
    document.getElementById('skill-template-current').textContent = `Perícias de ${title}`;
  } };
}

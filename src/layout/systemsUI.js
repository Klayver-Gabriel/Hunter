import * as R from '../auto_calc_engine/index.js';
import * as M from '../auto_calc_engine/masteryCalculator.js';
import * as D from '../domain/catalog.js';
import * as modal from './modal.js';

let character = null;
let store = null;
let staticBound = false;

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function init(applicationStore) {
  store = applicationStore; character = store.getState();
  store.subscribe(next => { character = next; });
  bindStaticActions();
}

function renderAll() {
  if (!character) return;
  renderMetrics();
  renderSaves();
  renderSkills();
  renderCombatConfig();
  renderAttackPanel();
  renderMasteryPanel();
  renderEquipment();
  renderLibrary();
}

function metricCard(label, value, formula, accent) {
  return `<article class="metric-card ${accent ? `metric-card--${accent}` : ''}">
    <span class="metric-card__label" data-component-label="metric:${accent}">${label}</span>
    <strong class="metric-card__value">${value}</strong>
    <span class="metric-card__formula">${formula}</span>
  </article>`;
}

function renderMetrics() {
  document.getElementById('proficiency-value').textContent = R.signed(R.proficiency(character));
  const ac = R.armorClassBreakdown(character);
  const initiative = R.initiativeBreakdown(character);
  const hp = R.maxHpBreakdown(character);
  const perception = R.skillBreakdown(character, D.SKILLS.find(skill => skill.key === 'perception'));
  const vitality = character.dnd.vitality;

  document.getElementById('rule-metrics').innerHTML = [
    metricCard('Classe de Armadura', ac.total, `${ac.base} base ${R.signed(ac.dex)} DES ${R.signed(ac.armor)} armadura ${R.signed(ac.shield)} escudo ${R.signed(ac.buffs)} buffs`, 'armor'),
    metricCard('Iniciativa', R.signed(initiative.total), `DES ${R.signed(initiative.dex)} · buffs ${R.signed(initiative.buffs)} · talentos ${R.signed(initiative.feats)}`, 'initiative'),
    metricCard('Vida Máxima', hp.total, `1º nível ${hp.firstLevel} · ${Math.max(0, R.level(character) - 1)} × ${hp.laterPerLevel} ${R.signed(hp.feats)} talentos ${R.signed(hp.buffs)} buffs`, 'hp'),
    metricCard('Dados de Vida', vitality.hitDie, `${vitality.hitDiceRemaining} restantes de ${R.level(character)}`, 'hitdie'),
    metricCard('Percepção Passiva', 10 + perception.total, `10 ${R.signed(perception.total)} Percepção`, 'passive')
  ].join('');
}

function renderSaves() {
  const container = document.getElementById('saving-throws');
  container.innerHTML = D.ABILITIES.map(ability => {
    const result = R.saveBreakdown(character, ability.key);
    return `<label class="save-row" title="${ability.label}: modificador ${R.signed(result.ability)} + proficiência ${R.signed(result.proficiency)}">
      <input type="checkbox" data-save="${ability.key}" ${character.dnd.saves[ability.key] ? 'checked' : ''}>
      <span class="save-row__ability" data-component-label="save:${ability.key}">${ability.short}</span>
      <span class="save-row__parts">${R.signed(result.ability)} atributo ${R.signed(result.proficiency)} prof.</span>
      <strong>${R.signed(result.total)}</strong>
    </label>`;
  }).join('');

  container.querySelectorAll('[data-save]').forEach(input => {
    input.addEventListener('change', () => {
      store.dispatch('setSave', { key: input.dataset.save, value: input.checked });
    });
  });
}

function renderSkills() {
  const container = document.getElementById('skill-groups');
  container.innerHTML = D.ABILITIES.map(ability => {
    const skills = D.SKILLS.filter(skill => skill.ability === ability.key);
    if (skills.length === 0) return '';
    const rows = skills.map(skill => {
      const state = character.dnd.skills[skill.key];
      const result = R.skillBreakdown(character, skill);
      const totalBonus = result.external + result.mastery;
      return `<div class="skill-row" title="${skill.name}: ${ability.short} ${R.signed(result.ability)} + proficiência ${R.signed(result.proficiency)} + bônus externo ${R.signed(result.external)} + maestria ${R.signed(result.mastery)}">
        <label class="check-dot" title="Proficiência"><input type="checkbox" data-skill-prof="${skill.key}" aria-label="${skill.name}: proficiência" ${state.proficient ? 'checked' : ''}><span>○</span></label>
        <label class="check-dot check-dot--expertise" title="Expertise"><input type="checkbox" data-skill-expertise="${skill.key}" aria-label="${skill.name}: expertise" ${state.expertise ? 'checked' : ''}><span>◇</span></label>
        <span class="skill-row__name" data-component-label="skill:${skill.key}">${skill.name}</span>
        <span class="skill-row__ability">${ability.short}</span>
        ${totalBonus ? `<span class="skill-row__external">${R.signed(totalBonus)} bônus</span>` : '<span></span>'}
        <strong>${R.signed(result.total)}</strong>
      </div>`;
    }).join('');
    return `<section class="skill-group"><h4>${ability.label}</h4>${rows}</section>`;
  }).join('');

  container.querySelectorAll('[data-skill-prof]').forEach(input => {
    input.addEventListener('change', () => {
      store.dispatch('setSkill', { key: input.dataset.skillProf, field: 'proficient', value: input.checked });
    });
  });
  container.querySelectorAll('[data-skill-expertise]').forEach(input => {
    input.addEventListener('change', () => {
      store.dispatch('setSkill', { key: input.dataset.skillExpertise, field: 'expertise', value: input.checked });
    });
  });
}

function configField(label, path, value, type, options, hint) {
  const field = type === 'select'
    ? `<select data-config-path="${path}" data-config-type="select">${options.map(option => `<option value="${escapeHTML(option.value)}" ${String(option.value) === String(value) ? 'selected' : ''}>${escapeHTML(option.label)}</option>`).join('')}</select>`
    : type === 'text'
      ? `<input data-config-path="${path}" data-config-type="text" type="text" value="${escapeHTML(value)}">`
      : `<input data-config-path="${path}" data-config-type="number" type="number" value="${Number(value) || 0}">`;
  return `<label class="config-field"><span data-component-label="config:${path}">${label}</span>${field}${hint ? `<small>${hint}</small>` : ''}</label>`;
}

function renderCombatConfig() {
  const armor = character.dnd.armor;
  const initiative = character.dnd.initiative;
  const vitality = character.dnd.vitality;
  const hp = R.maxHpBreakdown(character);
  const hitDice = [6, 8, 10, 12].map(value => ({ value: `d${value}`, label: `d${value}` }));
  const container = document.getElementById('combat-config');
  container.innerHTML = [
    configField('Tipo de armadura', 'dnd.armor.type', armor.type, 'select', D.ARMOR_TYPES, 'Pesada ignora DES; média limita em +2.'),
    configField('Base da CA', 'dnd.armor.base', armor.base),
    configField('Bônus de armadura', 'dnd.armor.armorBonus', armor.armorBonus),
    configField('Escudo', 'dnd.armor.shield', armor.shield),
    configField('Buff manual de CA', 'dnd.armor.buffs', armor.buffs),
    configField('Buff de iniciativa', 'dnd.initiative.buffs', initiative.buffs),
    configField('Talentos de iniciativa', 'dnd.initiative.feats', initiative.feats),
    configField('Dado de Vida', 'dnd.vitality.hitDie', vitality.hitDie, 'select', hitDice),
    configField('Dados restantes', 'dnd.vitality.hitDiceRemaining', vitality.hitDiceRemaining),
    configField('Fórmula do 1º nível', 'dnd.vitality.firstLevelFormula', vitality.firstLevelFormula, 'text', null, 'Use CON para o modificador. Ex.: 8 + CON.'),
    configField('Fórmula por nível seguinte', 'dnd.vitality.laterLevelFormula', vitality.laterLevelFormula, 'text', null, 'Aplicada uma vez por nível após o primeiro. Ex.: 4 + CON.'),
    configField('PV por talentos', 'dnd.vitality.featBonus', vitality.featBonus),
    configField('PV por buffs', 'dnd.vitality.buffs', vitality.buffs)
  ].join('') + `<div class="formula-status ${hp.errors.length ? 'is-error' : ''}">
    <strong>Prévia de Vida Máxima: ${hp.total}</strong>
    <span>1º nível: ${hp.firstLevel} · ${Math.max(0, R.level(character) - 1)} níveis seguintes × ${hp.laterPerLevel} = ${hp.laterLevels}</span>
    ${hp.errors.length ? `<small>${escapeHTML(hp.errors.join(' · '))} Usando o cálculo padrão como fallback.</small>` : '<small>Fórmulas válidas.</small>'}
  </div>`;

  container.querySelectorAll('[data-config-path]').forEach(input => {
    input.addEventListener('change', () => {
      const value = input.dataset.configType === 'number' ? Number(input.value) || 0 : input.value.trim();
      store.dispatch('setField', { path: input.dataset.configPath, value });
    });
  });
}

function renderAttackPanel() {
  const container = document.getElementById('attack-panel');
  const weapon = R.equippedWeapon(character);
  const choices = (character.library.weapons || []).map(item => `<option value="${item.id}" ${weapon && item.id === weapon.id ? 'selected' : ''}>${escapeHTML(item.name)}</option>`).join('');
  if (!weapon) {
    container.innerHTML = `<div class="toolbar-row"><label><span data-component-label="weapon:equipped">Arma equipada</span> <select id="equipped-weapon-select"><option value="">Nenhuma</option>${choices}</select></label></div><div class="empty-hint">Crie ou equipe uma arma na Biblioteca da Guilda.</div>`;
  } else {
    const attack = R.attackBreakdown(character, weapon);
    const damage = R.damageBreakdown(character, weapon);
    container.innerHTML = `
      <div class="toolbar-row"><label><span data-component-label="weapon:equipped">Arma equipada</span> <select id="equipped-weapon-select"><option value="">Nenhuma</option>${choices}</select></label></div>
      <article class="weapon-summary">
        <div class="weapon-summary__icon">${escapeHTML(weapon.icon || '⚔')}</div>
        <div class="weapon-summary__identity"><span>Arma equipada</span><h3>${escapeHTML(weapon.name)}</h3><small>${escapeHTML(weapon.dndElement || 'Sem elemento')} · Crítico ${Number(weapon.critMin) || 20}–20</small></div>
        <div class="attack-result"><span data-component-label="attack:bonus">Ataque</span><strong>${R.signed(attack.total)}</strong><small>${R.signed(attack.ability)} atributo · ${R.signed(attack.proficiency)} prof. · ${R.signed(attack.buffs)} buffs · ${R.signed(attack.mastery)} maestria</small></div>
        <div class="attack-result"><span data-component-label="attack:damage">Dano</span><strong>${escapeHTML(damage.expression)}</strong><small>${escapeHTML(damage.dice)} ${R.signed(damage.ability)} atributo ${R.signed(damage.buffs)} buffs ${R.signed(damage.mastery)} maestria</small></div>
      </article>`;
  }
  document.getElementById('equipped-weapon-select').addEventListener('change', event => {
    store.dispatch('equipWeapon', { id: event.target.value });
  });
}

function renderMasteryPanel() {
  const weapon = R.equippedWeapon(character);
  const masteryContainer = document.getElementById('mastery-panel');
  if (!weapon) {
    masteryContainer.innerHTML = '<div class="empty-hint">Equipe uma arma para acompanhar sua maestria.</div>';
    return;
  }

  const state = M.masteryState(character, weapon);
  const progress = Math.max(0, Math.min(100, (Number(state.xp) || 0) / Math.max(1, Number(state.xpToNext) || 100) * 100));
  const unlocks = M.parseUnlocks(weapon);
  masteryContainer.innerHTML = `<div class="mastery-card">
    <div class="mastery-card__head"><div><span>Maestria da Arma</span><h3>${escapeHTML(weapon.name)}</h3></div><strong>Lv ${Number(state.level) || 1}</strong></div>
    <div class="mastery-track"><span style="width:${progress}%"></span></div>
    <div class="mastery-controls">
      <label><span data-component-label="mastery:level">Nível</span> <input type="number" min="1" max="20" data-mastery="level" value="${Number(state.level) || 1}"></label>
      <label><span data-component-label="mastery:xp">XP</span> <input type="number" min="0" data-mastery="xp" value="${Number(state.xp) || 0}"></label>
      <label><span data-component-label="mastery:xpToNext">Próximo</span> <input type="number" min="1" data-mastery="xpToNext" value="${Number(state.xpToNext) || 100}"></label>
    </div>
    <div class="unlock-list">${unlocks.map(unlock => `<div class="unlock ${unlock.level <= state.level ? 'is-unlocked' : ''}"><span>Lv ${unlock.level}</span><strong>${escapeHTML(unlock.name)}</strong><small>${escapeHTML(unlock.description)}</small></div>`).join('') || '<div class="empty-hint">Sem técnicas cadastradas.</div>'}</div>
  </div>`;
  masteryContainer.querySelectorAll('[data-mastery]').forEach(input => {
    input.addEventListener('change', () => {
      store.dispatch('setMastery', { id: weapon.id, key: input.dataset.mastery, value: input.value });
    });
  });
}

function renderEquipment() {
  const slots = document.getElementById('armor-slots');
  slots.innerHTML = D.ARMOR_SLOTS.map(slot => {
    const compatible = (character.library.armors || []).filter(item => item.slot === slot.key);
    const equippedId = character.equipment.armor[slot.key];
    const item = compatible.find(candidate => candidate.id === equippedId);
    return `<article class="armor-slot ${item ? 'is-equipped' : ''}">
      <div class="armor-slot__icon">${item ? '⬢' : '◇'}</div>
      <div class="armor-slot__body"><span data-component-label="armor:${slot.key}">${slot.label}</span>
        <select data-armor-slot="${slot.key}" aria-label="${slot.label}"><option value="">Vazio</option>${compatible.map(candidate => `<option value="${candidate.id}" ${candidate.id === equippedId ? 'selected' : ''}>${escapeHTML(candidate.name)}</option>`).join('')}</select>
        ${item ? `<small>CA ${R.signed(item.acBonus)} · Slots ${escapeHTML(item.slots || '—')} · ${escapeHTML(item.resistances || 'Sem resistências')}</small>` : '<small>Nenhuma peça equipada</small>'}
      </div>
    </article>`;
  }).join('') + `<div class="armor-total"><span data-component-label="armor:total">Bônus de CA das peças</span><strong>${R.signed(R.equippedArmor(character).reduce((total, item) => total + (Number(item.acBonus) || 0), 0))}</strong></div>`;
  slots.querySelectorAll('[data-armor-slot]').forEach(select => {
    select.addEventListener('change', () => {
      store.dispatch('equipArmor', { slot: select.dataset.armorSlot, id: select.value });
    });
  });

  const buffs = document.getElementById('buff-list');
  buffs.innerHTML = (character.buffs || []).map(buff => `<article class="buff-card" data-buff-edit="${buff.id}" tabindex="0">
    <div><span>${escapeHTML(buff.source || 'Buff')}</span><strong>${escapeHTML(buff.name)}</strong></div>
    <div class="effect-tags">${buffTags(buff)}</div>
  </article>`).join('') || '<div class="empty-hint">Nenhum buff ativo. Adicione skills, talentos ou efeitos de itens.</div>';
  buffs.querySelectorAll('[data-buff-edit]').forEach(card => card.addEventListener('click', () => openBuffEditor(character.buffs.find(buff => buff.id === card.dataset.buffEdit))));
}

function buffTags(buff) {
  const labels = { attack: 'Ataque', damage: 'Dano', armorClass: 'CA', initiative: 'Iniciativa', hp: 'PV' };
  const tags = Object.keys(labels)
    .filter(key => Number(buff[key]))
    .map(key => `<span>${labels[key]} ${R.signed(buff[key])}</span>`);
  const skill = D.SKILLS.find(item => item.key === buff.skill);
  if (skill && Number(buff.skillBonus)) tags.push(`<span>${skill.name} ${R.signed(buff.skillBonus)}</span>`);
  if (String(buff.damageDice || '').trim()) tags.push(`<span>+ ${escapeHTML(String(buff.damageDice).trim())}</span>`);
  return tags.join('') || '<span>Sem modificadores</span>';
}

function renderLibrary() {
  const weaponContainer = document.getElementById('weapon-library');
  weaponContainer.innerHTML = (character.library.weapons || []).map(weapon => `<article class="library-card ${character.equipment.weaponId === weapon.id ? 'is-equipped' : ''}">
    <div class="library-card__icon">${escapeHTML(weapon.icon || '⚔')}</div>
    <div class="library-card__body"><span>${character.equipment.weaponId === weapon.id ? 'Equipada' : 'Arma'}</span><strong>${escapeHTML(weapon.name)}</strong><small>${escapeHTML(weapon.damageDice || '—')} · ${escapeHTML(String(weapon.ability || 'for').toUpperCase())} · Crítico ${Number(weapon.critMin) || 20}–20</small></div>
    <div class="library-card__actions"><button class="btn btn--ghost btn--sm" data-equip-weapon="${weapon.id}">${character.equipment.weaponId === weapon.id ? 'Remover' : 'Equipar'}</button><button class="btn btn--ghost btn--sm" data-edit-weapon="${weapon.id}">Editar</button></div>
  </article>`).join('') || '<div class="empty-hint">Nenhuma arma cadastrada.</div>';

  weaponContainer.querySelectorAll('[data-equip-weapon]').forEach(button => button.addEventListener('click', () => {
    store.dispatch('equipWeapon', { id: button.dataset.equipWeapon, toggle: true });
  }));
  weaponContainer.querySelectorAll('[data-edit-weapon]').forEach(button => button.addEventListener('click', () => openWeaponEditor(character.library.weapons.find(weapon => weapon.id === button.dataset.editWeapon))));

  const armorContainer = document.getElementById('armor-library');
  armorContainer.innerHTML = (character.library.armors || []).map(item => {
    const equipped = character.equipment.armor[item.slot] === item.id;
    const slot = D.ARMOR_SLOTS.find(candidate => candidate.key === item.slot);
    return `<article class="library-card ${equipped ? 'is-equipped' : ''}">
      <div class="library-card__icon">⬢</div>
      <div class="library-card__body"><span>${slot ? slot.label : 'Armadura'}</span><strong>${escapeHTML(item.name)}</strong><small>CA ${R.signed(item.acBonus)} · Slots ${escapeHTML(item.slots || '—')} · ${escapeHTML(item.resistances || 'Sem resistências')}</small></div>
      <div class="library-card__actions"><button class="btn btn--ghost btn--sm" data-equip-armor="${item.id}">${equipped ? 'Remover' : 'Equipar'}</button><button class="btn btn--ghost btn--sm" data-edit-armor="${item.id}">Editar</button></div>
    </article>`;
  }).join('') || '<div class="empty-hint">Nenhuma peça cadastrada.</div>';
  armorContainer.querySelectorAll('[data-equip-armor]').forEach(button => button.addEventListener('click', () => {
    store.dispatch('equipArmor', { id: button.dataset.equipArmor, toggle: true });
  }));
  armorContainer.querySelectorAll('[data-edit-armor]').forEach(button => button.addEventListener('click', () => openArmorEditor(character.library.armors.find(item => item.id === button.dataset.editArmor))));
}

function bindStaticActions() {
  if (staticBound) return;
  staticBound = true;
  document.getElementById('btn-add-weapon').addEventListener('click', () => openWeaponEditor(null));
  document.getElementById('btn-add-armor').addEventListener('click', () => openArmorEditor(null));
  document.getElementById('btn-add-buff').addEventListener('click', () => openBuffEditor(null));
}

function openWeaponEditor(weapon) {
  modal.open({
    eyebrow: weapon ? 'Editar arma da biblioteca' : 'Nova arma da biblioteca',
    entry: weapon ? { title: weapon.name, ...weapon } : null,
    fields: [
      { key: 'icon', label: 'Ícone', type: 'select', options: D.WEAPON_ICONS },
      { key: 'damageDice', label: 'Dano D&D (ex.: 2d6)', type: 'text' },
      { key: 'ability', label: 'Atributo do ataque', type: 'select', options: D.ABILITIES.map(item => ({ value: item.key, label: `${item.short} — ${item.label}` })) },
      { key: 'proficient', label: 'Usa proficiência?', type: 'select', options: [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }] },
      { key: 'critMin', label: 'Crítico mínimo (19 = 19–20)', type: 'number' },
      { key: 'dndElement', label: 'Elemento D&D', type: 'text' },
      { key: 'masteryUnlocks', label: 'Desbloqueios — ex.: 3|Técnica|pericia.atletismo:2', type: 'textarea', rows: 5 }
    ],
    onSave: data => store.dispatch('saveWeapon', { id: weapon?.id, data }),
    onDelete: weapon ? () => store.dispatch('deleteWeapon', { id: weapon.id }) : null
  });
}

function openArmorEditor(item) {
  modal.open({
    eyebrow: item ? 'Editar armadura da biblioteca' : 'Nova armadura da biblioteca',
    entry: item ? { title: item.name, ...item } : null,
    fields: [
      { key: 'slot', label: 'Peça', type: 'select', options: D.ARMOR_SLOTS.map(slot => ({ value: slot.key, label: slot.label })) },
      { key: 'acBonus', label: 'Bônus de CA D&D', type: 'number' },
      { key: 'resistances', label: 'Resistências', type: 'text' },
      { key: 'skills', label: 'Skills', type: 'textarea', rows: 3 },
      { key: 'slots', label: 'Slots (ex.: 2-1-1)', type: 'text' }
    ],
    onSave: data => store.dispatch('saveArmor', { id: item?.id, data }),
    onDelete: item ? () => store.dispatch('deleteArmor', { id: item.id }) : null
  });
}

function openBuffEditor(buff) {
  const fields = [
    { key: 'source', label: 'Origem (item, skill, talento)', type: 'text' },
    { key: 'skill', label: 'Perícia afetada', type: 'select', options: [{ value: '', label: 'Nenhuma perícia' }, ...D.SKILLS.map(skill => ({ value: skill.key, label: skill.name }))] },
    { key: 'skillBonus', label: 'Bônus na perícia', type: 'number' },
    { key: 'attack', label: 'Bônus de ataque D&D', type: 'number' },
    { key: 'damage', label: 'Bônus flat de dano D&D', type: 'number' },
    { key: 'damageDice', label: 'Dano adicional em dados (ex.: 3d6 Fogo)', type: 'text' },
    { key: 'armorClass', label: 'Classe de Armadura', type: 'number' },
    { key: 'initiative', label: 'Iniciativa', type: 'number' },
    { key: 'hp', label: 'Vida Máxima', type: 'number' }
  ];
  modal.open({
    eyebrow: buff ? 'Editar Buff' : 'Novo Buff', entry: buff ? { title: buff.name, ...buff } : null, fields,
    onSave: data => store.dispatch('saveBuff', { id: buff?.id, data }),
    onDelete: buff ? () => store.dispatch('deleteBuff', { id: buff.id }) : null
  });
}

export { init, renderAll };

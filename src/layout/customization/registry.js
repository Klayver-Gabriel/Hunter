const sectionSpecs = [
  ['guild-card', 'Identidade'], ['attributes', 'Atributos'], ['resources', 'Recursos'],
  ['dnd-rules', 'Regras e perícias'], ['armory', 'Ataques'], ['equipment', 'Equipamentos e buffs'],
  ['library', 'Biblioteca'], ['records', 'Registros']
];

export function createRegistry(root) {
  let components = new Map();
  function restore() {
    for (const entry of [...components.values()].reverse()) {
      if (entry.anchor.parentNode) entry.anchor.after(entry.element);
      entry.anchor.remove();
      if (entry.style === null) entry.element.removeAttribute('style'); else entry.element.setAttribute('style', entry.style);
      if (entry.labelElement) entry.labelElement.textContent = entry.label;
      entry.element.removeAttribute('data-component-id');
      entry.element.classList.remove('appearance-component');
    }
    components.clear();
  }
  function collect() {
    function add(id, element, labelElement, fallback, minWidth = 160, section = false) {
      if (!element || components.has(id)) return;
      const parentSection = section ? null : element.closest('[data-section-id]');
      const anchor = document.createComment(id); element.before(anchor);
      const label = labelElement?.textContent.trim() || fallback;
      components.set(id, { id, element, anchor, labelElement, label, minWidth, section,
        parent: parentSection?.dataset.sectionId || 'root', style: element.getAttribute('style') });
      element.dataset.componentId = id; element.classList.add('appearance-component');
    }
    for (const [id, title] of sectionSpecs) {
      const section = document.getElementById(id);
      section.dataset.sectionId = `section:${id}`;
      add(`section:${id}`, section, section.querySelector(':scope > .panel__header .panel__title'), title, 280, true);
    }
    root.querySelectorAll('[data-field]').forEach(input => {
      const wrapper = input.closest('.field') || input.closest('.guild-card__name-row');
      add(`field:${input.dataset.field}`, wrapper, wrapper.querySelector('label'), 'Nome do Caçador', 140);
      input.setAttribute('aria-label', wrapper.querySelector('label')?.textContent || 'Nome do Caçador');
    });
    add('indicator:seal', document.getElementById('guild-seal'), null, 'Selo da Guilda', 130);
    root.querySelectorAll('[data-attr]').forEach(input => {
      const element = input.closest('.attr-tile');
      add(`attribute:${input.dataset.attr}`, element, element.querySelector('.attr-tile__label'), '', 90);
      input.setAttribute('aria-label', element.querySelector('.attr-tile__label').textContent);
    });
    root.querySelectorAll('.resource[data-id]').forEach(element => {
      add(`resource:${element.dataset.id}`, element, element.querySelector('.resource__name'), '', 230);
      element.querySelector('[data-res-current]')?.setAttribute('aria-label', `${element.querySelector('.resource__name').textContent} atual`);
      element.querySelector('[data-res-max]')?.setAttribute('aria-label', `${element.querySelector('.resource__name').textContent} máximo`);
    });
    const metrics = ['armor', 'initiative', 'hp', 'hitdie', 'passive'];
    root.querySelectorAll('.metric-card').forEach((element, index) => add(`metric:${metrics[index]}`, element, element.querySelector('.metric-card__label'), '', 160));
    root.querySelectorAll('[data-save]').forEach(input => {
      const element = input.closest('label'); add(`save:${input.dataset.save}`, element, element.querySelector('.save-row__ability'), '', 240);
    });
    root.querySelectorAll('[data-skill-prof]').forEach(input => {
      const element = input.closest('.skill-row'); add(`skill:${input.dataset.skillProf}`, element, element.querySelector('.skill-row__name'), '', 280);
      input.setAttribute('aria-label', `${element.querySelector('.skill-row__name').textContent}: proficiência`);
      element.querySelector('[data-skill-expertise]').setAttribute('aria-label', `${element.querySelector('.skill-row__name').textContent}: expertise`);
    });
    root.querySelectorAll('[data-config-path]').forEach(input => {
      const element = input.closest('label'); add(`config:${input.dataset.configPath}`, element, element.querySelector('span'), '', 170);
    });
    add('indicator:formula', root.querySelector('.formula-status'), null, 'Prévia de vida', 250);
    add('indicator:proficiency', root.querySelector('.proficiency-badge'), null, 'Proficiência', 130);
    add('weapon:equipped', document.getElementById('equipped-weapon-select')?.closest('label'), null, 'Arma equipada', 230);
    add('weapon:summary', root.querySelector('.weapon-summary__identity'), null, 'Resumo da arma', 200);
    root.querySelectorAll('.attack-result').forEach((element, index) => add(`attack:${index ? 'damage' : 'bonus'}`, element, element.querySelector('span'), '', 200));
    root.querySelectorAll('[data-mastery]').forEach(input => add(`mastery:${input.dataset.mastery}`, input.closest('label'), null, `Maestria: ${input.dataset.mastery}`, 150));
    add('mastery:unlocks', root.querySelector('.unlock-list'), null, 'Técnicas desbloqueadas', 230);
    root.querySelectorAll('[data-armor-slot]').forEach(input => {
      const element = input.closest('.armor-slot'); add(`armor:${input.dataset.armorSlot}`, element, element.querySelector('.armor-slot__body > span'), '', 250);
      input.setAttribute('aria-label', element.querySelector('.armor-slot__body > span').textContent);
    });
    add('armor:total', root.querySelector('.armor-total'), root.querySelector('.armor-total > span'), '', 200);
    root.querySelectorAll('[data-buff-edit]').forEach(element => add(`buff:${element.dataset.buffEdit}`, element, null, element.querySelector('strong').textContent, 230));
    for (const kind of ['weapon', 'armor']) root.querySelectorAll(`[data-edit-${kind}]`).forEach(button => {
      const element = button.closest('.library-card');
      add(`library:${kind}:${button.getAttribute(`data-edit-${kind}`)}`, element, null, element.querySelector('strong').textContent, 270);
    });
    root.querySelectorAll('[data-entry-id]').forEach(element => add(`entry:${element.dataset.list}:${element.dataset.entryId}`, element, null, element.querySelector('.entry-card__title').textContent, 220));
    root.querySelectorAll('[data-entity-field]').forEach(element => add(element.dataset.entityField, element, element.querySelector('span'), '', 180));
    for (const id of ['btn-add-resource', 'btn-add-weapon', 'btn-add-armor', 'btn-add-buff']) add(`action:${id}`, document.getElementById(id), null, document.getElementById(id).textContent, 120);
    root.querySelectorAll('[data-add]').forEach(element => add(`action:add:${element.dataset.add}`, element, null, `Novo: ${element.dataset.add}`, 140));
    return components;
  }
  function applyAppearance(appearance) {
    for (const entry of components.values()) {
      const props = appearance.components[entry.id] || {};
      const label = props.label || entry.label;
      if (entry.labelElement) entry.labelElement.textContent = label;
      if (entry.section) entry.element.setAttribute('aria-label', label);
      for (const theme of ['light', 'dark']) for (const key of ['text', 'background', 'accent']) {
        const color = props.colors?.[theme]?.[key];
        const variable = `--appearance-${key}-${theme}`;
        if (color) entry.element.style.setProperty(variable, color); else entry.element.style.removeProperty(variable);
      }
      if (props.label) entry.element.querySelectorAll('input,select,textarea').forEach((input, index) => {
        input.setAttribute('aria-label', entry.id.startsWith('resource:') ? `${label} ${index ? 'máximo' : 'atual'}` : label);
      });
    }
    const nav = document.querySelector('.guild-nav');
    nav.querySelectorAll('a').forEach(link => link.remove());
    const order = [...components.values()].filter(c => c.section);
    for (const entry of order) {
      const a = document.createElement('a'); a.href = `#${entry.element.id}`;
      a.textContent = appearance.components[entry.id]?.label || entry.label; nav.append(a);
    }
  }
  return { collect, restore, applyAppearance, get entries() { return components; } };
}

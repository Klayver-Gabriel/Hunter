const targets = {
  section: 'section', field: '.field', attribute: '.attr-tile', resource: '.resource',
  metric: '.metric-card', save: '.save-row', skill: '.skill-row', config: '.config-field',
  weapon: 'label', attack: '.attack-result', mastery: 'label', armor: '.armor-slot, .armor-total',
  indicator: '.proficiency-badge', tab: '.component-tab'
};
const subsections = {
  saves: '.rules-layout > div', skills: '.skills-column', mastery: '.mastery-section',
  'equipped-armor': '.equipment-layout > div', buffs: '.equipment-layout > div',
  weapons: '.library-block', armors: '.library-block'
};
const excluded = '[data-component-hidden], [data-component-empty]';

export function componentTarget(label) {
  const [kind, key] = label.dataset.componentLabel.split(':');
  if (kind === 'tab' && !label.closest('.component-tab')) {
    const wrapper = document.createElement('span'); wrapper.className = 'component-tab';
    label.before(wrapper); wrapper.append(label);
  }
  return label.closest(kind === 'subsection' ? subsections[key] : targets[kind]);
}

function collapse(container, children) {
  const visible = [...children].filter(child => !child.matches(excluded));
  container.toggleAttribute('data-component-empty', visible.length === 0);
  container.dataset.componentCount = visible.length;
}

export function applyComponentVisibility(root, entries, appearance, removing) {
  root.querySelectorAll('[data-component-hidden], [data-component-empty]').forEach(element => {
    element.removeAttribute('data-component-hidden'); element.removeAttribute('data-component-empty');
  });
  root.querySelectorAll('.component-delete').forEach(button => button.remove());
  for (const [id, entry] of entries) {
    const target = componentTarget(entry.element);
    if (!target) continue;
    target.classList.add('removable-component');
    target.classList.toggle('component-removal-leaf', !id.startsWith('section:') && !id.startsWith('subsection:'));
    target.toggleAttribute('data-component-hidden', !!appearance.components[id]?.hidden);
    if (removing) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'component-delete'; button.dataset.removeComponent = id;
      button.textContent = '×'; button.setAttribute('aria-label', `Remover ${entry.element.textContent}`);
      button.title = `Remover ${entry.element.textContent} da tela`; target.append(button);
    }
  }

  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const available = tabs.filter(tab => !tab.closest(excluded));
  const active = available.find(tab => tab.getAttribute('aria-selected') === 'true') || available[0];
  for (const tab of tabs) {
    tab.setAttribute('aria-selected', String(tab === active));
    document.getElementById(tab.getAttribute('aria-controls')).hidden = tab !== active;
  }
  root.querySelector('#records').toggleAttribute('data-component-empty', available.length === 0);

  // Collapse from leaves to parents so headings and grid tracks cannot leave empty columns.
  const groups = [
    ['.guild-card__byline, .guild-card__meta-row', '.field'],
    ['#attr-grid', '.attr-tile'], ['#attributes', '#attr-grid'],
    ['#resource-stack', '.resource'], ['.sheet-grid', ':scope > section'],
    ['#rule-metrics', '.metric-card'], ['#saving-throws', '.save-row'],
    ['.rules-layout > div:first-child', '#saving-throws'],
    ['.skill-group', '.skill-row'], ['#skill-groups', '.skill-group'],
    ['.skills-column', '#skill-groups'], ['.rules-layout', ':scope > div'],
    ['.mastery-controls', ':scope > label'], ['.toolbar-row', ':scope > label'],
    ['#armor-slots', '.armor-slot, .armor-total'], ['.equipment-layout > div:first-child', '#armor-slots'],
    ['.equipment-layout', ':scope > div'],
    ['#library', '.library-block']
  ];
  for (const [selector, children] of groups) {
    root.querySelectorAll(selector).forEach(container => collapse(container, container.querySelectorAll(children)));
  }
  const summary = root.querySelector('.weapon-summary');
  if (summary) summary.dataset.attackCount = [...summary.querySelectorAll('.attack-result')].filter(el => !el.matches(excluded)).length;
  document.querySelectorAll('.guild-nav a').forEach(link => {
    const section = document.getElementById(link.hash.slice(1));
    link.toggleAttribute('data-component-hidden', !!section?.matches(excluded));
  });
}

import { applyComponentVisibility } from './componentVisibility.js';

const defaults = new WeakMap();

function defaultText(element) {
  if (!defaults.has(element)) defaults.set(element, element.textContent.trim());
  return defaults.get(element);
}

function applyLabel(element, label) {
  element.textContent = label;
  const id = element.dataset.componentLabel;
  if (id.startsWith('section:')) {
    element.closest('section').setAttribute('aria-label', label);
  } else if (id.startsWith('resource:')) {
    const resource = element.closest('.resource');
    resource.querySelectorAll('.resource-value__label').forEach((valueLabel, index) => {
      valueLabel.textContent = `${label} ${index ? 'máximo' : 'atual'}`;
    });
  } else if (id.startsWith('skill:')) {
    const row = element.closest('.skill-row');
    row.querySelector('[data-skill-prof]').setAttribute('aria-label', `${label}: proficiência`);
    row.querySelector('[data-skill-expertise]').setAttribute('aria-label', `${label}: expertise`);
  } else {
    const control = element.parentElement.querySelector('[data-field], [data-attr], [data-armor-slot], [data-save]');
    control?.setAttribute('aria-label', label);
  }
}

export function createNameEditor(store, root) {
  const dialog = document.getElementById('name-editor');
  const form = document.getElementById('name-editor-form');
  const select = document.getElementById('name-component');
  const input = document.getElementById('component-name');
  const error = document.getElementById('name-editor-error');
  const trigger = document.getElementById('btn-edit-names');
  const removalToggle = document.getElementById('btn-remove-components');
  const removeButton = document.getElementById('component-remove');
  const restoreButton = document.getElementById('component-restore');
  let entries = new Map();
  let restoreDefault = false;
  let removing = false;

  function selectComponent() {
    const entry = entries.get(select.value);
    input.value = entry?.element.textContent || '';
    input.placeholder = entry?.defaultLabel || '';
    input.setCustomValidity('');
    error.hidden = true;
    restoreDefault = false;
    const hidden = !!store.getDocument().sheetAppearance.components[select.value]?.hidden;
    removeButton.hidden = hidden;
    restoreButton.hidden = !hidden;
  }

  function render() {
    const appearance = store.getDocument().sheetAppearance;
    entries = new Map();
    root.querySelectorAll('[data-component-label]').forEach(element => {
      const id = element.dataset.componentLabel;
      const defaultLabel = defaultText(element);
      const section = element.closest('section[id], header[id]');
      const sectionLabel = section?.querySelector('[data-component-label^="section:"]');
      const group = sectionLabel ? defaultText(sectionLabel) : section?.id === 'guild-card' ? 'Identidade' : 'Registros';
      entries.set(id, { element, defaultLabel, group });
      applyLabel(element, appearance.components[id]?.label || defaultLabel);
    });
    document.querySelectorAll('.guild-nav a').forEach(link => {
      const text = link.lastChild;
      if (text?.nodeType !== Node.TEXT_NODE) return;
      const original = defaultText(text);
      text.textContent = ` ${appearance.components[`section:${link.hash.slice(1)}`]?.label || original}`;
    });
    applyComponentVisibility(root, entries, appearance, removing);
  }

  function removeComponent(id) {
    const entry = entries.get(id);
    if (!entry || !confirm(`Remover “${entry.element.textContent}” da tela? Você poderá restaurar no editor de componentes.`)) return false;
    store.setComponentHidden(id, true);
    return true;
  }

  removalToggle.addEventListener('click', () => {
    removing = !removing;
    removalToggle.setAttribute('aria-pressed', String(removing));
    removalToggle.textContent = removing ? 'Concluir remoção' : 'Remover componentes';
    root.classList.toggle('is-removing-components', removing);
    document.getElementById('component-removal-hint').hidden = !removing;
    render();
  });
  root.addEventListener('click', event => {
    const button = event.target.closest('[data-remove-component]');
    if (!button) return;
    event.preventDefault(); event.stopPropagation();
    if (removeComponent(button.dataset.removeComponent)) removalToggle.focus();
  });
  removeButton.addEventListener('click', () => {
    if (removeComponent(select.value)) dialog.close();
  });
  restoreButton.addEventListener('click', () => {
    store.setComponentHidden(select.value, false); dialog.close();
  });

  trigger.addEventListener('click', () => {
    render();
    select.replaceChildren();
    const groups = new Map();
    for (const [id, entry] of entries) {
      if (!groups.has(entry.group)) {
        const group = document.createElement('optgroup'); group.label = entry.group;
        groups.set(entry.group, group); select.append(group);
      }
      const option = document.createElement('option');
      option.value = id; option.textContent = entry.defaultLabel;
      if (store.getDocument().sheetAppearance.components[id]?.hidden) option.textContent += ' (removido)';
      groups.get(entry.group).append(option);
    }
    selectComponent();
    dialog.showModal();
    select.focus();
  });
  select.addEventListener('change', selectComponent);
  input.addEventListener('input', () => {
    input.setCustomValidity(''); error.hidden = true; restoreDefault = false;
  });
  document.getElementById('name-default').addEventListener('click', () => {
    input.value = entries.get(select.value)?.defaultLabel || '';
    input.setCustomValidity(''); error.hidden = true; restoreDefault = true;
  });
  document.getElementById('name-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => trigger.focus());
  form.addEventListener('submit', event => {
    event.preventDefault();
    const entry = entries.get(select.value);
    if (!entry?.element.isConnected) return;
    const label = input.value.trim();
    if (!label) {
      input.setCustomValidity('Informe um nome de 1 a 120 caracteres.'); input.reportValidity(); return;
    }
    try {
      store.renameComponent(select.value, restoreDefault || label === entry.defaultLabel ? null : label);
      dialog.close();
    } catch (cause) {
      error.textContent = cause.message; error.hidden = false;
    }
  });
  return { render };
}

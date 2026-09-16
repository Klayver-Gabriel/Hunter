import { ENTITY_FIELDS, entityList } from '../domain/entityFields.js';
export function renderEntityFields(root, store) {
  for (const [kind, fields] of Object.entries(ENTITY_FIELDS)) for (const item of entityList(store.getState(), kind)) {
    let container;
    if (kind === 'weapon' || kind === 'armor') container = root.querySelector(`[data-edit-${kind}="${CSS.escape(item.id)}"]`)?.closest('.library-card');
    else if (kind === 'buff') container = root.querySelector(`[data-buff-edit="${CSS.escape(item.id)}"]`);
    else container = root.querySelector(`[data-list="${kind}"][data-entry-id="${CSS.escape(item.id)}"]`);
    if (!container) continue;
    const details = document.createElement('details'); details.className = 'entity-fields';
    const summary = document.createElement('summary'); summary.textContent = 'Editar campos'; details.append(summary);
    details.addEventListener('click', event => event.stopPropagation());
    for (const field of fields) {
      const label = document.createElement('label'); label.className = 'entity-field';
      label.dataset.entityField = `entity:${kind}:${item.id}:${field.key}`;
      const title = document.createElement('span'); title.textContent = field.label;
      const input = document.createElement(field.type === 'textarea' ? 'textarea' : field.type === 'select' ? 'select' : 'input');
      if (input.tagName === 'INPUT') input.type = field.type;
      if (input.tagName === 'TEXTAREA') input.rows = 3;
      for (const option of field.options || []) {
        const element = document.createElement('option'); element.value = option.value; element.textContent = option.label; input.append(element);
      }
      input.value = item[field.key] ?? '';
      input.dataset.entityInput = label.dataset.entityField;
      input.addEventListener('change', () => store.dispatch('setEntityField', { kind, id: item.id, key: field.key, value: input.value }));
      label.append(title, input); details.append(label);
    }
    container.append(details);
  }
}

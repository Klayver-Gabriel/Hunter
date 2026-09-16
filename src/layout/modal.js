

let els = null;
let currentConfig = null; // { listName, entry, eyebrow, fields, onSave, onDelete }

function cacheEls() {
  if (els) return els;
  els = {
    backdrop: document.getElementById('modal-backdrop'),
    modal: document.getElementById('modal'),
    eyebrow: document.getElementById('modal-eyebrow'),
    titleInput: document.getElementById('modal-title-input'),
    body: document.getElementById('modal-body'),
    closeBtn: document.getElementById('modal-close'),
    cancelBtn: document.getElementById('modal-cancel'),
    saveBtn: document.getElementById('modal-save'),
    deleteBtn: document.getElementById('modal-delete')
  };
  return els;
}

/**
 * fields: array de { key, label, type: 'text'|'textarea'|'select', options?, row? }
 */
function buildFieldHTML(field, value) {
  const val = value == null ? '' : value;
  if (field.type === 'textarea') {
    return `
      <div class="modal__field">
        <label for="mf-${field.key}">${field.label}</label>
        <textarea id="mf-${field.key}" data-key="${field.key}" rows="${field.rows || 4}">${escapeHTML(val)}</textarea>
      </div>`;
  }
  if (field.type === 'select') {
    const opts = (field.options || []).map(option => {
      const optionValue = typeof option === 'object' ? option.value : option;
      const optionLabel = typeof option === 'object' ? option.label : option;
      return `<option value="${escapeAttr(optionValue)}" ${String(optionValue) === String(val) ? 'selected' : ''}>${escapeHTML(optionLabel)}</option>`;
    }).join('');
    return `
      <div class="modal__field">
        <label for="mf-${field.key}">${field.label}</label>
        <select id="mf-${field.key}" data-key="${field.key}">${opts}</select>
      </div>`;
  }
  return `
    <div class="modal__field">
      <label for="mf-${field.key}">${field.label}</label>
      <input id="mf-${field.key}" data-key="${field.key}" type="${field.type || 'text'}" value="${escapeAttr(val)}">
    </div>`;
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[s]));
}
function escapeAttr(str) { return escapeHTML(str); }

/**
 * Abre o modal.
 * config = {
 *   eyebrow: 'Poder',
 *   entry: { title, ... } | null (null = criando novo),
 *   fields: [{key,label,type,options,rows}],
 *   onSave: (data) => void,
 *   onDelete: (() => void) | null
 * }
 */
function open(config) {
  cacheEls();
  currentConfig = config;

  els.eyebrow.textContent = config.eyebrow || '';
  els.titleInput.value = (config.entry && config.entry.title) || '';

  els.body.innerHTML = (config.fields || []).map(f =>
    buildFieldHTML(f, config.entry ? config.entry[f.key] : '')
  ).join('');

  els.deleteBtn.style.display = config.onDelete ? '' : 'none';

  els.backdrop.hidden = false;
  els.titleInput.focus();
}

function close() {
  if (!els) return;
  els.backdrop.hidden = true;
  currentConfig = null;
}

function collect() {
  cacheEls();
  const data = { title: els.titleInput.value.trim() || 'Sem título' };
  els.body.querySelectorAll('[data-key]').forEach(input => {
    data[input.dataset.key] = input.value;
  });
  return data;
}

function init() {
  cacheEls();
  els.closeBtn.addEventListener('click', close);
  els.cancelBtn.addEventListener('click', close);
  els.backdrop.addEventListener('click', (e) => {
    if (e.target === els.backdrop) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.backdrop.hidden) close();
  });
  els.saveBtn.addEventListener('click', () => {
    if (!currentConfig) return;
    const data = collect();
    currentConfig.onSave(data);
    close();
  });
  els.deleteBtn.addEventListener('click', () => {
    if (!currentConfig || !currentConfig.onDelete) return;
    currentConfig.onDelete();
    close();
  });
}

export { init, open, close };

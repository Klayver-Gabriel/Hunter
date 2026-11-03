
import { createPhotoDataUrl } from './photo.js';

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
  if (field.type === 'photo') {
    return `
      <div class="modal__field modal__photo-field" data-photo-field="${escapeAttr(field.key)}">
        <label for="mf-${escapeAttr(field.key)}-file">${escapeHTML(field.label)}</label>
        <div class="modal__photo-preview" data-photo-preview hidden><img alt="Prévia da foto do equipamento"></div>
        <div class="modal__photo-actions">
          <input id="mf-${escapeAttr(field.key)}-file" type="file" accept="image/jpeg,image/png,image/webp,image/avif" data-photo-input aria-describedby="mf-${escapeAttr(field.key)}-help" hidden>
          <button type="button" class="btn btn--ghost btn--sm" data-photo-choose aria-label="Selecionar ${escapeAttr(field.label)}">Selecionar foto</button>
          <button type="button" class="btn btn--ghost btn--sm" data-photo-remove hidden>Remover foto</button>
        </div>
        <small id="mf-${escapeAttr(field.key)}-help">Imagens são redimensionadas e compactadas para até 400 KB.</small>
        <p class="modal__photo-error" data-photo-error role="alert" hidden></p>
      </div>`;
  }
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
  els.saveBtn.disabled = false;

  els.body.querySelectorAll('[data-photo-field]').forEach(field => {
    field.photoValue = config.entry?.[field.dataset.photoField] || '';
    const input = field.querySelector('[data-photo-input]');
    const preview = field.querySelector('[data-photo-preview]');
    const previewImage = preview.querySelector('img');
    const removeButton = field.querySelector('[data-photo-remove]');
    const error = field.querySelector('[data-photo-error]');
    let request = 0;
    const renderPhoto = () => {
      preview.hidden = !field.photoValue;
      removeButton.hidden = !field.photoValue;
      if (field.photoValue) previewImage.src = field.photoValue;
      else previewImage.removeAttribute('src');
    };
    field.querySelector('[data-photo-choose]').addEventListener('click', () => { input.value = ''; input.click(); });
    removeButton.addEventListener('click', () => {
      request++;
      field.photoValue = '';
      input.value = '';
      error.hidden = true;
      error.textContent = '';
      renderPhoto();
      if (currentConfig === config) els.saveBtn.disabled = false;
    });
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const currentRequest = ++request;
      error.hidden = true;
      error.textContent = '';
      els.saveBtn.disabled = true;
      try {
        const photo = await createPhotoDataUrl(file);
        if (currentRequest !== request || currentConfig !== config) return;
        field.photoValue = photo;
        renderPhoto();
      } catch (cause) {
        if (currentRequest !== request || currentConfig !== config) return;
        error.textContent = cause.message;
        error.hidden = false;
      } finally {
        if (currentRequest === request && currentConfig === config) els.saveBtn.disabled = false;
      }
    });
    renderPhoto();
  });

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
  els.body.querySelectorAll('[data-photo-field]').forEach(field => {
    data[field.dataset.photoField] = field.photoValue || '';
  });
  return data;
}

function showError(error) {
  let output = document.getElementById('modal-error');
  if (!output) { output = document.createElement('p'); output.id = 'modal-error'; output.setAttribute('role', 'alert'); els.body.append(output); }
  output.textContent = error.message;
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
    try { currentConfig.onSave(data); close(); } catch (error) { showError(error); }
  });
  els.deleteBtn.addEventListener('click', () => {
    if (!currentConfig || !currentConfig.onDelete) return;
    try { currentConfig.onDelete(); close(); } catch (error) { showError(error); }
  });
}

export { init, open, close };

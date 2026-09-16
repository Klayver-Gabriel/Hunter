import { createAppearance, validateAppearance } from '../../customization/appearance.js';
import { fits, appendPosition } from '../../customization/geometry.js';

export function createEditor({ root, registry, surface, session, refresh }) {
  let draft = null, editing = false, profile = 'desktop', selected = null, drag = null;
  const panel = document.createElement('section'); panel.id = 'customization-editor'; panel.className = 'customization-editor'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Editor da ficha');
  panel.innerHTML = `
    <div class="customization-editor__top"><h2>Personalizar ficha</h2><div class="customization-editor__actions">
      <button type="button" class="btn btn--primary" id="customization-save">Salvar</button>
      <button type="button" class="btn" id="customization-cancel">Cancelar</button>
      <button type="button" class="btn btn--ghost" id="customization-reset">Restaurar padrão</button>
    </div></div>
    <div class="customization-editor__fields">
      <label>Layout<select id="editor-profile"><option value="desktop">Computador</option><option value="mobile">Celular</option></select></label>
      <label>Componente<select id="editor-component"></select></label>
      <label>Rótulo<input id="editor-label" type="text" maxlength="120" placeholder="Herdar padrão"></label>
      <label>Seção<select id="editor-parent"></select></label>
    </div>
    <details id="editor-position"><summary>Posição e tamanho</summary><div class="customization-editor__fields">
      <label>Horizontal (%)<input id="editor-x" type="number" min="0" max="100" step="0.1"></label>
      <label>Vertical (px)<input id="editor-y" type="number" min="0" step="1"></label>
      <label>Largura (%)<input id="editor-w" type="number" min="1" max="100" step="0.1"></label>
      <label>Altura (px)<input id="editor-h" type="number" min="24" step="1"></label>
    </div><div class="customization-editor__actions"><button type="button" class="btn" id="editor-position-apply">Aplicar posição</button>
      <button type="button" class="btn" data-move="left" aria-label="Mover para esquerda">←</button>
      <button type="button" class="btn" data-move="up" aria-label="Mover para cima">↑</button>
      <button type="button" class="btn" data-move="down" aria-label="Mover para baixo">↓</button>
      <button type="button" class="btn" data-move="right" aria-label="Mover para direita">→</button>
    </div></details>
    <details><summary>Cores por tema</summary><div class="customization-editor__fields">
      <label>Tema das cores<select id="editor-color-theme"><option value="light">Claro</option><option value="dark">Escuro</option></select></label>
      ${[['text', 'Texto'], ['background', 'Fundo'], ['accent', 'Destaque']].map(([key, label]) => `<div class="editor-color"><label>${label}<input type="color" id="editor-color-${key}" data-color="${key}"></label><button type="button" class="btn btn--sm" data-inherit="${key}" aria-label="Herdar ${label.toLowerCase()}">Herdar</button></div>`).join('')}
    </div></details>
    <p class="customization-editor__hint">Selecione um campo. Use as alças para mover ou redimensionar. Nas alças: setas movem; Shift aumenta o passo; Alt redimensiona. Cada layout é salvo separadamente.</p>
    <p id="customization-status" role="status" aria-live="polite"></p>`;
  root.querySelector('.top-actions').after(panel);
  const get = id => panel.querySelector(`#${id}`);
  const status = (message, error = false) => { get('customization-status').textContent = message; get('customization-status').dataset.error = String(error); };
  function disabled(value) {
    for (const id of ['btn-import', 'btn-export', 'btn-new']) document.getElementById(id).disabled = value;
    document.getElementById('btn-customize').disabled = value;
  }
  function populate() {
    const select = get('editor-component'); select.replaceChildren();
    for (const entry of registry.entries.values()) {
      const option = document.createElement('option'); option.value = entry.id;
      option.textContent = `${entry.section ? 'Seção: ' : ''}${draft.components[entry.id]?.label || entry.label}`;
      select.append(option);
    }
    if (!registry.entries.has(selected)) selected = registry.entries.keys().next().value;
    select.value = selected;
  }
  function inspector() {
    if (!editing || !selected) return;
    const entry = registry.entries.get(selected), rect = surface.effective[selected];
    for (const component of registry.entries.values()) component.element.classList.toggle('is-selected', component.id === selected);
    get('editor-component').value = selected;
    get('editor-label').value = draft.components[selected]?.label || '';
    get('editor-label').placeholder = entry.label;
    const parent = get('editor-parent'); parent.replaceChildren(new Option('Ficha', 'root'));
    if (!entry.section) for (const component of registry.entries.values()) {
      if (component.section) parent.append(new Option(draft.components[component.id]?.label || component.label, component.id));
    }
    parent.value = rect?.parent || 'root';
    for (const key of ['x', 'y', 'w', 'h']) get(`editor-${key}`).value = String(Math.round((rect?.[key] || 0) * 10) / 10);
    const theme = get('editor-color-theme').value;
    for (const key of ['text', 'background', 'accent']) {
      const color = draft.components[selected]?.colors?.[theme]?.[key];
      get(`editor-color-${key}`).value = color || (key === 'background' ? '#ffffff' : '#444444');
      get(`editor-color-${key}`).title = color ? 'Cor personalizada' : 'Herdando padrão';
    }
  }
  function choose(id) { if (!registry.entries.has(id)) return; selected = id; inspector(); }
  function redraw() { refresh(); populate(); inspector(); }
  function open() {
    if (editing) return;
    draft = structuredClone(session.store.getAppearance());
    profile = root.clientWidth <= 900 ? 'mobile' : 'desktop';
    for (const target of ['desktop', 'mobile']) {
      if (!Object.keys(draft.layouts[target]).length) draft.layouts[target] = surface.defaults(target, target === 'mobile' ? 390 : Math.max(1000, root.clientWidth));
    }
    editing = true; session.store.setLocked(true); disabled(true); panel.hidden = false; root.classList.add('customizing');
    get('editor-profile').value = profile; get('editor-color-theme').value = document.documentElement.dataset.theme;
    redraw(); status('Prévia ativa. Alterações serão gravadas ao salvar.'); get('editor-component').focus();
  }
  function close() {
    editing = false; draft = null; drag = null; session.store.setLocked(false); disabled(false); panel.hidden = true;
    root.classList.remove('customizing'); refresh(); document.getElementById('btn-customize').focus();
  }
  function tryPosition(id, rect) {
    const entry = registry.entries.get(id);
    const peers = Object.entries(surface.effective).filter(([key, other]) => key !== id && other.parent === rect.parent).map(([, value]) => value);
    const width = rect.parent === 'root' ? surface.canvas.clientWidth : registry.entries.get(rect.parent).element.querySelector(':scope > .free-body').clientWidth;
    if (!fits(rect, peers, Math.min(100, entry.minWidth / width * 100), entry.minHeight || 32)) {
      status('Posição inválida: respeite os limites, o tamanho do conteúdo e o espaço dos outros componentes.', true); return false;
    }
    draft.layouts[profile][id] = { parent: rect.parent, x: rect.x, y: rect.y, w: rect.w, h: rect.h };
    redraw(); status('Posição atualizada na prévia.'); return true;
  }
  function nudge(dx, dy, resize = false) {
    const rect = { ...surface.effective[selected] };
    const horizontal = dx / surface.parentWidth(selected) * 100;
    if (resize) { rect.w += horizontal; rect.h += dy; } else { rect.x += horizontal; rect.y += dy; }
    tryPosition(selected, rect);
  }
  document.getElementById('btn-customize').addEventListener('click', open);
  get('customization-cancel').addEventListener('click', close);
  get('customization-save').addEventListener('click', () => {
    try {
      const appearance = validateAppearance(draft);
      const saved = session.saveAppearance(appearance);
      if (!saved.ok) { status('Não foi possível salvar. Seu rascunho continua aberto para tentar novamente.', true); return; }
      close();
    } catch (error) { status(error.message, true); }
  });
  get('customization-reset').addEventListener('click', () => {
    draft = createAppearance(); redraw(); status('Padrões restaurados na prévia dos dois layouts. Salve para confirmar ou cancele para desfazer.');
  });
  get('editor-profile').addEventListener('change', event => { profile = event.target.value; redraw(); status(`Editando layout ${profile === 'mobile' ? 'do celular' : 'do computador'}.`); });
  get('editor-component').addEventListener('change', event => choose(event.target.value));
  get('editor-label').addEventListener('change', event => {
    const props = draft.components[selected] ||= {};
    if (event.target.value.trim()) props.label = event.target.value.trim(); else delete props.label;
    redraw(); status('Rótulo atualizado na prévia.');
  });
  get('editor-parent').addEventListener('change', event => {
    const parent = event.target.value;
    const siblings = Object.values(surface.effective).filter(rect => rect.parent === parent && rect.id !== selected);
    const rect = { ...appendPosition(siblings, parent), h: surface.effective[selected].h };
    tryPosition(selected, rect);
  });
  get('editor-position-apply').addEventListener('click', () => {
    const rect = { ...surface.effective[selected] };
    for (const key of ['x', 'y', 'w', 'h']) rect[key] = get(`editor-${key}`).value === '' ? NaN : Number(get(`editor-${key}`).value);
    tryPosition(selected, rect);
  });
  panel.querySelectorAll('[data-move]').forEach(button => button.addEventListener('click', () => {
    const offsets = { left: [-10, 0], right: [10, 0], up: [0, -10], down: [0, 10] }; nudge(...offsets[button.dataset.move]);
  }));
  get('editor-color-theme').addEventListener('change', inspector);
  function setColor(key, value) {
    const props = draft.components[selected] ||= {};
    const colors = props.colors ||= {}; const theme = colors[get('editor-color-theme').value] ||= {};
    if (value) theme[key] = value; else delete theme[key];
    redraw(); status(value ? 'Cor atualizada na prévia.' : 'Cor padrão restaurada.');
  }
  panel.querySelectorAll('[data-color]').forEach(input => input.addEventListener('change', () => setColor(input.dataset.color, input.value)));
  panel.querySelectorAll('[data-inherit]').forEach(button => button.addEventListener('click', () => setColor(button.dataset.inherit)));
  root.addEventListener('click', event => {
    if (!editing || panel.contains(event.target)) return;
    const element = event.target.closest('[data-component-id]');
    if (!element) return;
    event.preventDefault(); event.stopImmediatePropagation(); choose(element.dataset.componentId);
  }, true);
  root.addEventListener('pointerdown', event => {
    if (!editing || event.button !== 0) return;
    const handle = event.target.closest('.component-handle,.component-resize'); if (!handle) return;
    event.preventDefault(); event.stopPropagation(); choose(handle.dataset.owner); handle.focus({ preventScroll: true });
    drag = { id: selected, handle, startX: event.clientX, startY: event.clientY,
      rect: { ...surface.effective[selected] }, resize: handle.classList.contains('component-resize'), width: surface.parentWidth(selected) };
    handle.setPointerCapture(event.pointerId);
  });
  root.addEventListener('pointermove', event => {
    if (!drag) return;
    const rect = { ...drag.rect }, dx = (event.clientX - drag.startX) / drag.width * 100, dy = event.clientY - drag.startY;
    if (drag.resize) { rect.w += dx; rect.h += dy; } else { rect.x += dx; rect.y += dy; }
    drag.candidate = rect;
    const element = registry.entries.get(drag.id).element;
    const peers = Object.entries(surface.effective).filter(([id, r]) => id !== drag.id && r.parent === rect.parent).map(([, r]) => r);
    element.classList.toggle('is-invalid', !fits(rect, peers));
    if (drag.resize) { element.style.width = `${Math.max(1, rect.w)}%`; element.style.minHeight = `${Math.max(24, rect.h)}px`; }
    else element.style.transform = `translate(${event.clientX - drag.startX}px, ${dy}px)`;
  });
  function endDrag(cancel = false) {
    if (!drag) return;
    const current = drag; drag = null;
    if (cancel || !current.candidate || !tryPosition(current.id, current.candidate)) redraw();
    registry.entries.get(current.id)?.element.querySelector('.component-handle')?.focus({ preventScroll: true });
  }
  root.addEventListener('pointerup', () => endDrag());
  root.addEventListener('pointercancel', () => endDrag(true));
  root.addEventListener('keydown', event => {
    if (!editing || !event.target.closest('.component-handle,.component-resize')) return;
    if (event.key === 'Escape' && drag) { event.preventDefault(); endDrag(true); return; }
    const offsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!offsets[event.key]) return;
    event.preventDefault(); const step = event.shiftKey ? 10 : 1;
    nudge(...offsets[event.key].map(value => value * step), event.altKey || event.target.classList.contains('component-resize'));
    registry.entries.get(selected)?.element.querySelector('.component-handle')?.focus({ preventScroll: true });
  });
  window.addEventListener('beforeunload', event => { if (editing) { event.preventDefault(); event.returnValue = ''; } });
  return {
    get editing() { return editing; },
    beforeRender: () => surface.restore(),
    afterRender() {
      registry.collect();
      const appearance = editing ? draft : session.store.getAppearance();
      registry.applyAppearance(appearance);
      const activeProfile = editing ? profile : root.clientWidth <= 900 ? 'mobile' : 'desktop';
      if (editing || Object.keys(appearance.layouts[activeProfile]).length) surface.render(appearance, activeProfile, { editing });
      if (editing) {
        // Only editor handles receive focus; data controls stay inert during the draft transaction.
        surface.canvas.querySelectorAll('input,select,textarea,[contenteditable],.entry-card,button:not(.component-handle):not(.component-resize)').forEach(element => {
          element.dataset.editorTabindex = element.getAttribute('tabindex') ?? '';
          element.setAttribute('tabindex', '-1');
          if (element.matches('[contenteditable]')) element.contentEditable = 'false';
          if (element.matches('input,select,textarea,button')) element.disabled = true;
        });
        populate(); inspector();
      }
    }
  };
}

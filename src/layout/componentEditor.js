import { getCalculableComponents, findCalculableComponent } from '../domain/calculableComponents.js';
import { referenceFor } from '../domain/calculations.js';
import { currentResourceId } from '../domain/calculationTargets.js';
import { displayName } from '../domain/componentCatalog.js';
import { calculateCharacter } from '../auto_calc_engine/characterCalculator.js';
import { previewComponentConfiguration } from '../application/componentConfiguration.js';
import { ABILITIES } from '../domain/catalog.js';
import { uid } from '../domain/character.js';
import { escapeHTML as h } from './html.js';

const modes = [['default', 'Padrão'], ['manual', 'Manual'], ['formula', 'Fórmula'], ['progression', 'Progressão por nível']];
const options = (values, selected) => values.map(([value, label]) => `<option value="${h(value)}" ${value === selected ? 'selected' : ''}>${h(label)}</option>`).join('');
const input = (name, label, value, extra = '') => `<label>${h(label)}<input name="${h(name)}" value="${h(value ?? '')}" ${extra}></label>`;
function parameterField(field, value) {
  const name = `parameter:${field.key}`, when = field.when ? `data-parameter-when="${h(field.when[0])}" data-parameter-value="${h(field.when[1])}"` : '';
  if (field.type === 'checkbox') return `<label class="component-checkbox" ${when}><input name="${h(name)}" type="checkbox" ${value ? 'checked' : ''}>${h(field.label)}</label>`;
  if (field.type === 'select') return `<label ${when}>${h(field.label)}<select name="${h(name)}">${options(field.options.map(o => [String(o.value), o.label]), String(value))}</select></label>`;
  return `<div ${when}>${input(name, field.label, value, `type="${field.type}" ${field.type === 'number' ? `step="${field.step || 'any'}" ${field.min != null ? `min="${field.min}"` : ''}` : 'maxlength="2000"'} ${field.formula ? 'data-formula' : ''}`)}</div>`;
}
export function componentVariables(document, target) {
  const result = [['VALOR_PADRAO', 'Cálculo padrão deste componente'], ['NIVEL', 'Nível do personagem'], ['NIVEL_FINAL', 'Nível final'], ['NIVEL_AVALIADO', 'Nível avaliado na progressão'], ['PROFICIENCIA', 'Proficiência'], ['MOD_CONJURACAO', 'Modificador de conjuração'], ['BONUS_DT', 'Bônus global da DT']];
  for (const a of ABILITIES) {
    const name = displayName(document.character, document.sheetAppearance, `attribute:${a.key}`, a.label);
    result.push([a.short, `${name}: valor`], [`MOD_${a.short}`, `${name}: modificador`]);
  }
  for (const c of getCalculableComponents(document)) {
    if (c.id !== target) result.push([referenceFor(c.id), `${c.name}${c.kind === 'resource' ? ': máximo' : ''}`]);
    if (c.kind === 'resource' && c.id !== target) result.push([referenceFor(currentResourceId(c.id)), `${c.name}: atual`]);
  }
  if (target.startsWith('spell:')) result.push(['CIRCULO', 'Círculo da magia'], ['BONUS_MAGIA', 'Bônus da magia']);
  return result;
}

export function createComponentEditor(store, root) {
  const dialog = document.createElement('dialog');
  dialog.id = 'component-editor'; dialog.className = 'modal rules-dialog component-editor';
  dialog.setAttribute('aria-labelledby', 'component-editor-title'); document.body.append(dialog);
  let previousId, previousFocus;
  dialog.addEventListener('close', () => {
    const origin = root.querySelector(`[data-calculation-target="${CSS.escape(previousId || '')}"]`);
    const target = origin && !origin.closest('[hidden]') ? origin : previousFocus?.isConnected ? previousFocus : document.getElementById('page-title');
    target?.focus({ preventScroll: true });
  });
  function open(componentId, createCharacteristic) {
    if (dialog.open || root.classList.contains('is-removing-components')) return;
    previousFocus = globalThis.document.activeElement;
    const document = createCharacteristic ? structuredClone(store.getDocument()) : store.getDocument();
    if (createCharacteristic) document.character.calculations.characteristics.push({ id: createCharacteristic.id, name: 'Nova característica', base: 0 });
    const component = findCalculableComponent(document, componentId);
    previousId = componentId;
    const rule = component.calculation, calculated = calculateCharacter(document.character);
    const name = displayName(document.character, document.sheetAppearance, componentId, component.name);
    const fields = component.fields.map(f => parameterField(f, component.parameters[f.key])).join('');
    dialog.innerHTML = `<form novalidate><h2 id="component-editor-title">Configurar ${h(name)}</h2>
      ${input('name', 'Nome', name, 'maxlength="120" required')}
      <label>Cálculo<select name="mode">${options(modes, rule.mode)}</select></label>
      <p data-modes="default" class="component-help">Usa o cálculo padrão e os parâmetros deste componente.</p>
      <div data-modes="manual">${input('value', 'Valor manual', calculated.baseValues[component.id] ?? 0, 'type="number" step="any"')}</div>
      <div data-modes="formula">${input('formula', 'Expressão', rule.formula || 'VALOR_PADRAO', 'data-formula maxlength="2000"')}</div>
      <label class="component-checkbox"><input type="checkbox" name="nonNegative" ${component.nonNegative ? 'checked' : ''}>Não negativo</label>
      ${component.kind === 'resource' ? '<small>Desativar permite saldo atual negativo. O máximo permanece maior ou igual a zero.</small>' : ''}
      ${component.kind === 'skill' || component.kind === 'save' ? `<div class="component-parameters">${fields}</div>` : ''}
      <details id="component-advanced" ${rule.mode === 'progression' ? 'open' : ''}><summary>Opções avançadas</summary>
        <div data-modes="progression">
          ${input('initial', 'Fórmula do 1º nível', rule.initial || '10 + MOD_CON', 'data-formula maxlength="2000"')}
          ${input('gain', 'Ganho por nível seguinte', rule.gain || '5 + MOD_CON', 'data-formula maxlength="2000"')}
          <label>Atualização dos ganhos<select name="policy">${options([['current', 'Recalcular com os valores atuais'], ['recorded', 'Registrar ganhos futuros']], rule.policy || 'current')}</select></label>
          <label>Bônus por nível (nível | fórmula)<textarea name="bonuses" rows="2">${h((rule.bonuses || []).map(b => `${b.level} | ${b.formula}`).join('\n'))}</textarea></label>
          <small>Ganhos registrados mantêm o histórico. Alterar a progressão estabelece um novo ponto inicial no nível atual.</small>
        </div>
        ${input('min', 'Limite mínimo', rule.min ?? '', 'type="number" step="any"')}${input('max', 'Limite máximo', rule.max ?? '', 'type="number" step="any"')}
        ${component.kind !== 'skill' && component.kind !== 'save' ? `<div class="component-parameters">${fields}</div>` : ''}
        <pre id="component-details" class="rule-preview"></pre>
      </details>
      <div class="formula-tools" data-modes="formula progression"><label>Usar outro valor<select id="component-variable">${options(componentVariables(document, component.id))}</select></label><button type="button" class="btn btn--ghost btn--sm" id="component-insert">Inserir</button></div>
      <small data-modes="formula progression">Use +, −, *, /, floor, ceil, round, abs, min e max. VALOR_PADRAO permite ajustar a regra original.</small>
      <p id="component-error" class="rule-errors" role="alert"></p><output id="component-preview" class="rule-preview" aria-live="polite"></output>
      <div class="modal__footer"><button type="button" class="btn btn--ghost" id="component-cancel">Cancelar</button><button type="submit" class="btn btn--primary" id="component-save">Salvar</button></div></form>`;
    const form = dialog.querySelector('form'), save = form.querySelector('#component-save');
    let focusedFormula = form.elements.formula, patch;
    function collect() {
      const data = Object.fromEntries(new FormData(form)), rule = { mode: data.mode };
      if (rule.mode === 'formula') rule.formula = data.formula;
      if (rule.mode === 'progression') Object.assign(rule, { initial: data.initial, gain: data.gain, policy: data.policy,
        bonuses: data.bonuses.trim() ? data.bonuses.trim().split('\n').map(line => { const [level, ...expression] = line.split('|'); return { level: Number(level), formula: expression.join('|').trim() }; }) : [] });
      for (const key of ['min', 'max']) if (data[key] !== '') rule[key] = Number(data[key]);
      if (rule.mode === 'manual' && (data.value === '' || !Number.isFinite(Number(data.value)))) throw Error('Informe um valor manual válido.');
      return { componentId, ...(createCharacteristic ? { createCharacteristic } : {}), name: data.name, rule, value: Number(data.value), nonNegative: form.elements.nonNegative.checked,
        parameters: Object.fromEntries(component.fields.map(f => [f.key, f.type === 'checkbox' ? form.elements[`parameter:${f.key}`].checked : data[`parameter:${f.key}`]])) };
    }
    function update() {
      const mode = form.elements.mode.value;
      form.querySelectorAll('[data-modes]').forEach(el => { el.hidden = !el.dataset.modes.split(' ').includes(mode); });
      form.querySelectorAll('[data-parameter-when]').forEach(el => { el.hidden = form.elements[`parameter:${el.dataset.parameterWhen}`].value !== el.dataset.parameterValue; });
      try {
        patch = collect(); const { result } = previewComponentConfiguration(store.getDocument(), patch);
        form.querySelector('#component-preview').textContent = `Resultado: ${result.values[component.id] ?? 'sem DT'}`;
        form.querySelector('#component-details').textContent = `Base: ${result.baseValues[component.id] ?? '—'}\n${(result.details[component.id] || []).map(p => `${p.label}: ${p.value}\n${Object.entries(p.variables || {}).map(([k, v]) => `${k} = ${v}`).join('\n')}`).join('\n')}`;
        form.querySelector('#component-error').textContent = ''; save.disabled = false;
      } catch (error) { patch = null; form.querySelector('#component-error').textContent = error.message; form.querySelector('#component-preview').textContent = 'Corrija os campos para calcular.'; save.disabled = true; }
    }
    form.addEventListener('input', update);
    form.addEventListener('change', event => {
      if (event.target.name === 'mode' && event.target.value === 'progression') form.querySelector('#component-advanced').open = true;
      if (event.target.name === 'parameter:proficient' && !event.target.checked) form.elements['parameter:expertise'].checked = false;
      if (event.target.name === 'parameter:expertise' && event.target.checked) form.elements['parameter:proficient'].checked = true;
      update();
    });
    form.addEventListener('focusin', event => { if (event.target.matches('[data-formula]')) focusedFormula = event.target; });
    form.querySelector('#component-insert').onclick = () => {
      if (!focusedFormula || focusedFormula.closest('[hidden]')) return;
      focusedFormula.setRangeText(form.querySelector('#component-variable').value, focusedFormula.selectionStart, focusedFormula.selectionEnd, 'end'); focusedFormula.focus(); update();
    };
    form.querySelector('#component-cancel').onclick = () => dialog.close();
    form.onsubmit = event => { event.preventDefault(); update(); if (!patch) return;
      try { store.configureComponent(patch); dialog.close(); } catch (error) { form.querySelector('#component-error').textContent = error.message; }
    };
    update(); dialog.showModal(); form.elements.name.focus();
  }
  root.addEventListener('click', event => {
    const trigger = event.target.closest('[data-edit-calculation]');
    if (trigger) { event.preventDefault(); event.stopPropagation(); open(trigger.dataset.editCalculation); }
    else if (event.target.closest('[data-calculation-target]')) event.stopPropagation();
  }, true);
  root.addEventListener('dblclick', event => {
    const label = event.target.closest('[data-calculation-target]');
    if (label) { event.preventDefault(); event.stopPropagation(); open(label.dataset.calculationTarget); }
  });
  root.addEventListener('keydown', event => {
    const trigger = event.target.closest('[data-calculation-target], [data-edit-calculation]');
    if (['Enter', ' '].includes(event.key) && trigger) {
      event.preventDefault(); event.stopPropagation(); open(trigger.dataset.calculationTarget || trigger.dataset.editCalculation);
    }
  }, true);
  function render() {
    const components = getCalculableComponents(store.getDocument());
    const labels = new Set(components.flatMap(c => [c.id, c.labelId, ...c.aliases]));
    root.querySelectorAll('.component-edit').forEach(b => b.remove());
    root.querySelectorAll('[data-component-label]').forEach(label => {
      const id = label.dataset.componentLabel;
      if (!labels.has(id)) return;
      label.dataset.calculationTarget = id; label.tabIndex = 0; label.setAttribute('role', 'button'); label.setAttribute('aria-haspopup', 'dialog'); label.title = 'Duplo clique ou Enter para configurar';
      const button = document.createElement('button'); button.type = 'button'; button.className = 'component-edit'; button.dataset.editCalculation = id;
      button.setAttribute('aria-label', `Configurar ${label.textContent}`); button.title = `Configurar ${label.textContent}`;
      if (!label.parentElement.classList.contains('calculation-caption')) {
        const caption = document.createElement('span'); caption.className = 'calculation-caption'; label.before(caption); caption.append(label);
      }
      label.after(button);
    });
  }
  return { open, render, createCharacteristic() { const id = uid('stat'); open(`characteristic:${id}`, { id }); } };
}

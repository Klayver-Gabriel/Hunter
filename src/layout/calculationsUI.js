import { ABILITIES } from '../domain/catalog.js';
import { targetIds, referenceFor, DEFAULT_DT } from '../domain/calculations.js';
import { displayName } from '../domain/componentCatalog.js';
import { calculateCharacter, baseValue } from '../auto_calc_engine/characterCalculator.js';
import { applyCommand } from '../application/commands.js';
import { escapeHTML as h } from './html.js';

let store, dialog, current;
const name = (id, fallback) => displayName(store.getState(), store.getDocument().sheetAppearance, id, fallback);
export function targetName(id) {
  if (id === 'spellcasting') return name('metric:dt', 'DT de magias');
  if (id.startsWith('characteristic:')) return name(`record:characteristics:${id.slice(15)}`);
  return name(id);
}
function options(list, selected) { return list.map(([value, label]) => `<option value="${h(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${h(label)}</option>`).join(''); }
const input = (key, label, value, type = 'text', extra = '') => `<label>${h(label)}<input name="${key}" type="${type}" value="${h(value)}" ${extra}></label>`;
const select = (key, label, values, value) => `<label>${h(label)}<select name="${key}">${options(values, value)}</select></label>`;
const formulaInput = (key, label, value) => input(key, label, value, 'text', 'data-formula maxlength="2000"');
const area = (key, label, value) => `<label>${h(label)}<textarea name="${key}" rows="3">${h(value)}</textarea></label>`;
const modes = [['manual', 'Manual'], ['formula', 'Fórmula direta'], ['progression', 'Progressão por nível']];
const abilities = () => ABILITIES.map(a => [a.key, name(`attribute:${a.key}`, a.label)]);
export function variables(spell = false) {
  const result = [['NIVEL', 'Nível final do personagem'], ['NIVEL_FINAL', 'Nível final (alias)'], ['NIVEL_AVALIADO', 'Nível sendo avaliado na progressão'], ['PROFICIENCIA', name('indicator:proficiency')], ['MOD_CONJURACAO', 'Modificador de conjuração'], ['BONUS_DT', 'Bônus global da DT']];
  for (const a of ABILITIES) result.push([a.short, `${name(`attribute:${a.key}`, a.label)}: valor`], [`MOD_${a.short}`, `${name(`attribute:${a.key}`, a.label)}: modificador`]);
  for (const id of targetIds(store.getState()).filter(id => !id.startsWith('attribute:'))) result.push([referenceFor(id), `${targetName(id)}${id.startsWith('resource:') ? ': máximo' : ''}`]);
  if (spell) result.push(['CIRCULO', 'Círculo numérico da magia'], ['BONUS_MAGIA', 'Bônus específico da magia']);
  return result;
}
function explain(result) {
  if (!result) return '';
  if (result.error) return result.error;
  const labels = new Map(variables(true));
  return `Resultado: ${result.value ?? 'sem DT'}\n${Object.entries(result.variables || {}).map(([key, value]) => `${labels.get(key) || key} (${key}) = ${value}`).join('\n')}`;
}
function editor(title, body, build, preview, spell = false) {
  const previousFocus = document.activeElement;
  dialog.innerHTML = `<form novalidate><h2 id="rules-title">${h(title)}</h2>${body}
    <div class="formula-tools"><label>Variável para inserir<select id="formula-variable">${options(variables(spell).map(([key, label]) => [key, `${label} — ${key}`]))}</select></label><button class="btn btn--ghost" type="button" id="insert-variable">Inserir variável</button></div>
    <small>Selecione um campo de fórmula antes de inserir. Use +, −, *, /, floor, ceil, round, abs, min e max.</small>
    <p class="rule-errors" role="alert" id="rule-error"></p><output class="rule-preview" id="rule-preview" aria-live="polite"></output>
    <div class="modal__footer"><button class="btn btn--ghost" type="button" id="rule-cancel">Cancelar</button><button class="btn btn--primary" id="rule-save" type="submit">Salvar configuração</button></div></form>`;
  const form = dialog.querySelector('form'); let focusedFormula = form.querySelector('[data-formula]');
  const collect = () => Object.fromEntries(new FormData(form));
  function update() {
    const data = collect();
    form.querySelectorAll('[data-modes]').forEach(el => { el.hidden = !el.dataset.modes.split(' ').includes(data.mode); });
    try {
      current = build(data);
      const draft = structuredClone(store.getState()); applyCommand(draft, current.type, current.payload);
      document.getElementById('rule-preview').textContent = preview(calculateCharacter(draft), draft, data);
      document.getElementById('rule-error').textContent = ''; document.getElementById('rule-save').disabled = false;
    } catch (error) {
      current = null; document.getElementById('rule-error').textContent = error.message;
      document.getElementById('rule-preview').textContent = 'Corrija os campos para calcular.'; document.getElementById('rule-save').disabled = true;
    }
  }
  form.addEventListener('focusin', event => { if (event.target.matches('[data-formula]')) focusedFormula = event.target; });
  form.addEventListener('input', update); form.addEventListener('change', update);
  document.getElementById('insert-variable').onclick = () => {
    if (!focusedFormula || focusedFormula.closest('[hidden]')) return;
    const value = document.getElementById('formula-variable').value;
    focusedFormula.setRangeText(value, focusedFormula.selectionStart, focusedFormula.selectionEnd, 'end'); focusedFormula.focus(); update();
  };
  document.getElementById('rule-cancel').onclick = () => dialog.close();
  dialog.onclose = () => previousFocus?.isConnected ? previousFocus.focus() : document.getElementById('btn-calculation-add').focus();
  form.onsubmit = event => {
    event.preventDefault(); update(); if (!current) return;
    try { store.dispatch(current.type, current.payload); dialog.close(); }
    catch (error) { document.getElementById('rule-error').textContent = error.message; }
  };
  update(); dialog.showModal(); form.querySelector('input, select, textarea')?.focus();
}
export function openRule(target) {
  const c = store.getState(), casting = target === 'spellcasting';
  const rule = c.calculations.rules[target] || (casting ? { mode: 'formula', formula: c.calculations.spellcasting.formula } : {});
  const legacy = target.startsWith('resource:') && c.resources.some(r => `resource:${r.id}` === target && (r.type === 'hp' || r.id === 'hp'));
  const mode = rule.mode || (legacy ? 'legacy' : 'manual');
  editor(`Calcular ${targetName(target)}`, `${casting ? select('ability', 'Atributo de conjuração', abilities(), c.calculations.spellcasting.ability) + input('bonus', 'Bônus adicional da DT', c.calculations.spellcasting.bonus, 'number', 'step="any"') : ''}${select('mode', 'Modo de cálculo', legacy ? [['legacy', 'Vida legada (compatibilidade)'], ...modes] : modes, mode)}
    <p data-modes="legacy">As fórmulas antigas continuam em Ajustar componentes de combate. CON é o modificador; o ganho usa o nível final e é multiplicado pelos níveis seguintes. Escolher outro modo converte explicitamente este recurso.</p>
    <div data-modes="manual">${input('value', 'Valor manual base', calculateCharacter(c).baseValues[target] ?? baseValue(c, target), 'number', 'step="any"')}</div>
    <div data-modes="formula">${formulaInput('formula', 'Fórmula direta', rule.formula || '10 + MOD_INT')}</div>
    <div data-modes="progression">${formulaInput('initial', 'Valor ou fórmula inicial', rule.initial || '10 + MOD_INT')}${formulaInput('gain', 'Ganho por nível seguinte', rule.gain || '3 + MOD_INT')}
    ${area('bonuses', 'Bônus específicos: um nível|fórmula por linha', (rule.bonuses || []).map(b => `${b.level}|${b.formula}`).join('\n'))}
    ${select('policy', 'Retroatividade', [['current', 'Recalcular usando atributos atuais'], ['recorded', 'Preservar ganhos registrados']], rule.policy || 'current')}
    <p>Ativar ou alterar a regra de registro estabelece um novo ponto inicial com o valor atual. Salvar a mesma regra mantém o histórico. Não reconstrói níveis anteriores. Abaixo desse ponto, mantém o valor inicial; ganhos futuros já registrados são reutilizados ao recuperar níveis.</p></div>
    <div data-modes="formula progression">${input('min', 'Limite mínimo (opcional)', rule.min ?? '', 'number', 'step="any"')}${input('max', 'Limite máximo (opcional)', rule.max ?? '', 'number', 'step="any"')}</div>`, data => {
    if (data.mode === 'legacy') return { type: 'useLegacyHp', payload: { target } };
    const rule = { mode: data.mode };
    if (data.mode === 'formula') rule.formula = data.formula;
    if (data.mode === 'progression') Object.assign(rule, { initial: data.initial, gain: data.gain, policy: data.policy, bonuses: data.bonuses.trim() ? data.bonuses.trim().split('\n').map(line => { const [level, ...formula] = line.split('|'); return { level: Number(level), formula: formula.join('|').trim() }; }) : [] });
    if (data.mode !== 'manual') for (const key of ['min', 'max']) if (data[key] !== '') rule[key] = Number(data[key]);
    if (data.mode === 'manual' && (data.value === '' || !Number.isFinite(Number(data.value)))) throw Error('Informe um valor manual válido.');
    return { type: 'setCalculationRule', payload: { target, rule, value: Number(data.value), ...(casting ? { spellcasting: { ability: data.ability, bonus: Number(data.bonus) } } : {}) } };
  }, result => `Resultado efetivo: ${result.values[target]}\nBase: ${result.baseValues[target]}\n${(result.details[target] || []).map(part => `${part.label}: ${part.value}\n${explain(part)}`).join('\n')}`);
}
function openCasting() { openRule('spellcasting'); }
export function openSpell(entry) {
  const dt = entry?.dt || { mode: entry ? 'none' : 'global', bonus: 0, resistance: '' };
  editor(entry ? 'Editar magia' : 'Nova magia', `${input('title', 'Nome da magia', entry?.title || '', 'text', 'maxlength="120"')}${input('level', 'Círculo / Nível (texto original)', entry?.level || '')}${input('circle', 'Círculo numérico para fórmulas (opcional)', entry?.circle ?? '', 'number', 'min="0" step="1"')}${input('school', 'Escola', entry?.school || '')}${area('description', 'Descrição', entry?.description || '')}
    ${select('mode', 'DT desta magia', [['global', 'Herdar DT global'], ['formula', 'Usar fórmula própria'], ['fixed', 'Usar DT fixa'], ['none', 'Não utilizar DT']], dt.mode)}
    <div data-modes="formula">${formulaInput('formula', 'Fórmula própria da DT', dt.formula || `${DEFAULT_DT} + CIRCULO + BONUS_MAGIA`)}<small>Inclua BONUS_MAGIA para somar o bônus específico na fórmula própria.</small></div>
    <div data-modes="fixed">${input('fixed', 'DT fixa', dt.fixed ?? 10, 'number', 'step="any"')}</div>
    <div data-modes="global formula fixed">${input('bonus', 'Bônus específico da magia', dt.bonus, 'number', 'step="any"')}${select('resistance', 'Resistência exigida', [['', 'Nenhuma resistência definida'], ...abilities()], dt.resistance)}</div>`, data => {
    if (!data.title.trim()) throw Error('Informe o nome da magia.');
    const spell = { title: data.title.trim(), level: data.level, school: data.school, description: data.description, circle: data.circle === '' ? null : Number(data.circle), dt: { mode: data.mode, formula: data.formula, fixed: Number(data.fixed), bonus: Number(data.bonus), resistance: data.mode === 'none' ? '' : data.resistance } };
    return { type: 'saveEntry', payload: { list: 'spells', id: entry?.id, data: spell } };
  }, (result, draft) => explain(result.spells[entry?.id || draft.spells.at(-1).id]), true);
  if (entry) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn--ghost'; button.textContent = 'Excluir magia';
    button.onclick = () => { store.dispatch('deleteEntry', { list: 'spells', id: entry.id }); dialog.close(); }; dialog.querySelector('.modal__footer').prepend(button);
  }
}
function openEffect(effect) {
  const e = effect || { name: '', kind: 'resource', target: 'resource:atp', amount: 2, event: 'round', durationUnit: 'round', duration: 3, active: true };
  editor(effect ? 'Editar efeito temporal' : 'Novo efeito temporal', `${input('name', 'Nome do efeito', e.name, 'text', 'maxlength="120"')}${select('kind', 'Tipo de efeito', [['resource', 'Recuperação / consumo de recurso'], ['bonus', 'Bônus temporário de característica']], e.kind)}${select('target', 'Característica afetada', targetIds(store.getState()).map(id => [id, targetName(id)]), e.target)}${input('amount', 'Quantidade (negativa para consumo)', e.amount, 'number', 'step="any"')}${select('event', 'Aplicar recurso no evento', [['turn', 'Avançar turno'], ['round', 'Avançar rodada'], ['rest', 'Aplicar descanso']], e.event)}${select('durationUnit', 'Unidade da duração', [['turn', 'Turnos'], ['round', 'Rodadas'], ['unlimited', 'Sem prazo']], e.durationUnit)}${input('duration', 'Duração (quantidade de eventos)', e.duration, 'number', 'min="1" step="1"')}${select('active', 'Ativação', [['true', 'Ativo'], ['false', 'Inativo']], String(e.active))}<p>O bônus compõe o valor efetivo imediatamente enquanto ativo. Cada ação aplica os recursos primeiro e depois reduz a duração correspondente. Um turno não avança a rodada. Descanso não reduz durações. Editar reinicia a duração escolhida.</p>`, data => ({ type: 'saveEffect', payload: { id: effect?.id, data: { ...data, amount: Number(data.amount), duration: Number(data.duration), remaining: Number(data.duration), active: data.active === 'true' } } }), () => 'Efeito válido. Recursos só serão alterados por ações explícitas de turno, rodada ou descanso.');
  dialog.querySelector('.formula-tools').hidden = true; dialog.querySelector('.formula-tools + small').hidden = true;
}
export function init(applicationStore) {
  store = applicationStore;
  dialog = document.createElement('dialog'); dialog.id = 'rules-dialog'; dialog.className = 'modal rules-dialog'; dialog.setAttribute('aria-labelledby', 'rules-title'); document.body.append(dialog);
  document.getElementById('btn-calculation-add').onclick = () => store.dispatch('addCharacteristic');
  document.getElementById('btn-spellcasting').onclick = openCasting;
  document.getElementById('btn-effect-add').onclick = () => openEffect();
  document.querySelectorAll('[data-event]').forEach(button => { button.onclick = () => {
    try { store.dispatch('advanceEvent', { event: button.dataset.event }); document.getElementById('temporal-error').textContent = ''; }
    catch (error) { document.getElementById('temporal-error').textContent = error.message; }
  }; });
}
export function render() {
  const c = store.getState(), result = calculateCharacter(c);
  document.getElementById('spellcasting-summary').textContent = `DT global · ${explain(result.casting)}`;
  const list = document.getElementById('calculation-list');
  list.innerHTML = targetIds(c).map(id => {
    const rule = c.calculations.rules[id];
    const component = id === 'spellcasting' ? 'metric:dt' : id.startsWith('characteristic:') ? `record:characteristics:${id.slice(15)}` : null;
    return `<article class="calculation-card"><h3 ${component ? `data-component-label="${h(component)}"` : ''}>${h(targetName(id))}</h3><strong>${result.values[id] ?? 'Erro de cálculo'}</strong><small>Base: ${result.baseValues[id] ?? '—'} · ${h(modes.find(([mode]) => mode === rule?.mode)?.[1] || (id === 'spellcasting' ? 'Fórmula direta' : id === 'resource:hp' ? 'Vida legada' : 'Manual'))}</small>${result.errors[id] ? `<p class="rule-errors" role="alert">${h(result.errors[id])}</p>` : ''}<button class="btn btn--ghost btn--sm" data-rule-edit="${h(id)}">Configurar ${h(targetName(id))}</button>${id.startsWith('characteristic:') ? `<button class="btn btn--ghost btn--sm" data-stat-delete="${h(id.slice(15))}">Excluir característica</button>` : ''}</article>`;
  }).join('');
  list.querySelectorAll('[data-rule-edit]').forEach(b => { b.onclick = () => openRule(b.dataset.ruleEdit); });
  list.querySelectorAll('[data-stat-delete]').forEach(b => { b.onclick = () => {
    try { store.dispatch('removeCharacteristic', { id: b.dataset.statDelete }); } catch (error) { document.getElementById('calculation-error').textContent = error.message; }
  }; });
  document.getElementById('event-counts').textContent = `Turnos: ${c.temporal.turn} · Rodadas: ${c.temporal.round} · Descansos: ${c.temporal.rest}`;
  const effects = document.getElementById('temporal-list');
  effects.innerHTML = c.temporal.effects.map(e => `<article class="temporal-card"><h3>${h(e.name)}</h3><p>${h(targetName(e.target))}: ${e.amount > 0 ? '+' : ''}${e.amount} · ${e.kind === 'bonus' ? 'bônus' : ({ turn: 'por turno', round: 'por rodada', rest: 'por descanso' })[e.event]}</p><small>${e.active ? 'Ativo' : e.remaining === 0 ? 'Expirado' : 'Inativo'} · ${e.durationUnit === 'unlimited' ? 'Sem prazo' : `${e.remaining} ${e.durationUnit === 'turn' ? 'turnos' : 'rodadas'} restantes`}</small><div class="calculation-actions"><button class="btn btn--ghost btn--sm" data-effect-edit="${e.id}">Editar efeito</button><button class="btn btn--ghost btn--sm" data-effect-toggle="${e.id}">${e.active ? 'Desativar' : 'Ativar'}</button><button class="btn btn--ghost btn--sm" data-effect-remove="${e.id}">Remover efeito</button></div></article>`).join('') || '<p>Nenhum efeito temporal cadastrado.</p>';
  effects.querySelectorAll('[data-effect-edit]').forEach(b => { b.onclick = () => openEffect(c.temporal.effects.find(e => e.id === b.dataset.effectEdit)); });
  effects.querySelectorAll('[data-effect-toggle]').forEach(b => { b.onclick = () => {
    try { store.dispatch(c.temporal.effects.find(e => e.id === b.dataset.effectToggle).active ? 'deactivateEffect' : 'activateEffect', { id: b.dataset.effectToggle }); } catch (error) { document.getElementById('temporal-error').textContent = error.message; }
  }; });
  effects.querySelectorAll('[data-effect-remove]').forEach(b => { b.onclick = () => store.dispatch('removeEffect', { id: b.dataset.effectRemove }); });
}

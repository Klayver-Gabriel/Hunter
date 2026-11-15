import { ABILITIES } from '../domain/catalog.js';
import { validateSystemProfile } from '../domain/gameSystems.js';
import { uid } from '../domain/character.js';
import { escapeHTML as h } from './html.js';

const abilityOptions = selected => ABILITIES.map(ability => `<option value="${ability.key}" ${ability.key === selected ? 'selected' : ''}>${h(ability.label)}</option>`).join('');
const PIX_KEY = '09590124356';

export function createSheetPickerUI(user) {
  const root = document.getElementById('sheet-picker');
  root.innerHTML = `<div class="picker-shell">
    <aside class="picker-rail" aria-label="CHEETS">
      <a class="picker-brand" href="#picker-title" aria-label="CHEETS — suas fichas">
        <img src="assets/icons/cheets-mark.svg" alt="">
        <span class="picker-brand__text"><strong>CHEETS</strong><small>Universal RPG Character Sheet System</small></span>
      </a>
      <span class="picker-rail__ornament" aria-hidden="true"></span>
    </aside>
    <div class="picker-main">
      <header class="picker-heading"><div><span class="sheet-eyebrow">Sua conta</span><p id="picker-account"></p></div>
        <div class="picker-actions"><label class="picker-system-select">Sistema da nova ficha<select id="picker-system-select"></select></label><button class="btn" id="picker-new">Nova ficha</button><label class="btn btn--ghost" for="picker-file">Importar JSON</label><input id="picker-file" type="file" accept=".json,application/json" hidden>
          <button class="btn btn--ghost" id="picker-systems" aria-expanded="false" aria-controls="system-library">Gerenciar sistemas</button><button class="btn btn--ghost" id="picker-refresh">Atualizar</button><button class="btn btn--ghost" id="picker-logout">Sair</button></div></header>
      <p class="picker-feedback" id="picker-feedback" role="status" aria-live="polite"></p>
      <section class="picker-sheets" aria-labelledby="picker-title"><div class="picker-section-title"><h1 id="picker-title">Suas fichas</h1><span aria-hidden="true"></span></div>
        <p class="picker-status" id="picker-status" role="status"></p><div class="picker-grid" id="picker-grid"></div>
      </section>
      <section class="system-library" id="system-library" hidden aria-labelledby="system-library-title">
        <header><div><span class="sheet-eyebrow">Biblioteca da conta</span><h2 id="system-library-title">Sistemas de jogo</h2></div><button class="btn" id="system-create">Criar sistema</button></header>
        <p>Perícias, cálculos, atributos, recursos e aparência compartilhados pelas fichas vinculadas.</p><div id="system-list"></div>
      </section>
      <section class="developer-support" aria-labelledby="developer-support-title">
        <div class="developer-support__mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/><circle cx="12" cy="12" r="7"/></svg></div>
        <div class="developer-support__copy"><h2 id="developer-support-title">Apoie o desenvolvimento do CHEETS</h2><p>Este projeto é desenvolvido com dedicação para a comunidade de RPG. Sua contribuição ajuda a manter e melhorar a plataforma.</p></div>
        <div class="developer-support__pix"><span>Chave PIX</span><code id="picker-pix-key">${PIX_KEY}</code><button class="btn btn--ghost btn--sm" id="picker-copy-pix" type="button"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>Copiar chave</button><p id="picker-pix-feedback" role="status" aria-live="polite"></p></div>
      </section>
      <footer class="picker-footer">CHEETS · Fichas de RPG</footer>
    </div>
  </div>
  <dialog class="sheet-system-dialog" id="sheet-system-dialog" aria-labelledby="sheet-system-title">
    <form><header><div><span class="sheet-eyebrow">Sistema desta ficha</span><h2 id="sheet-system-title">Alterar sistema</h2></div><button type="button" class="sheet-dialog-close" data-sheet-system-close aria-label="Fechar">×</button></header>
      <p id="sheet-system-description">Os padrões do sistema serão aplicados; os ajustes desta ficha permanecem individuais.</p><div id="sheet-system-options" class="sheet-system-options" role="radiogroup" aria-labelledby="sheet-system-title"></div>
      <p id="sheet-system-feedback" role="status" aria-live="polite"></p><footer><button type="button" class="btn btn--ghost" data-sheet-system-close>Cancelar</button><button type="button" class="btn" id="sheet-system-confirm">Confirmar sistema</button></footer>
    </form>
  </dialog>
  <dialog class="system-editor" id="system-editor" aria-labelledby="system-editor-title">
    <form id="system-editor-form"><header><div><span class="sheet-eyebrow">Sistema da conta</span><h2 id="system-editor-title">Editar sistema</h2></div><button type="button" class="sheet-dialog-close" data-system-close aria-label="Fechar">×</button></header>
      <label class="system-title-field">Título<input name="title" maxlength="120" required></label>
      <div class="system-skills-heading"><h3>Perícias</h3><button type="button" class="btn btn--ghost btn--sm" id="system-skill-add">+ Perícia</button></div>
      <div class="system-skill-rows" id="system-skill-rows"></div>
      <details class="system-advanced"><summary>Outras regras, atributos, recursos e aparência</summary><p>Edite estes dados em JSON. Os valores atuais do personagem permanecem na ficha.</p><label for="system-config-json">Configuração adicional</label><textarea id="system-config-json" rows="16" spellcheck="false"></textarea></details>
      <p class="system-editor-error" id="system-editor-error" role="alert" hidden></p>
      <footer><button type="button" class="btn btn--ghost" data-system-close>Cancelar</button><button type="submit" class="btn">Salvar sistema</button></footer>
    </form>
  </dialog>`;
  const cards = root.querySelector('#picker-grid'), status = root.querySelector('#picker-status'), feedbackEl = root.querySelector('#picker-feedback');
  const systemList = root.querySelector('#system-list'), systemSection = root.querySelector('#system-library');
  const dialog = root.querySelector('#system-editor'), form = root.querySelector('#system-editor-form'), rows = root.querySelector('#system-skill-rows');
  const sheetSystemDialog = root.querySelector('#sheet-system-dialog');
  const sheetSystemOptions = root.querySelector('#sheet-system-options');
  const sheetSystemFeedback = root.querySelector('#sheet-system-feedback');
  const sheetSystemConfirm = root.querySelector('#sheet-system-confirm');
  const pixFeedback = root.querySelector('#picker-pix-feedback');
  let entries = [], systems = [], handlers = new Map(), editing = null, busy = false;
  let changingEntry = null;
  root.querySelector('#picker-account').textContent = user?.name || '';

  function renderCards() {
    cards.replaceChildren();
    const byId = new Map(systems.map(system => [system.id, system]));
    if (!entries.length) {
      status.textContent = 'Você ainda não tem fichas. Crie uma ou importe um arquivo JSON.';
      return;
    }
    status.textContent = `${entries.length} ficha${entries.length === 1 ? '' : 's'} na sua conta.`;
    for (const entry of entries) {
      const card = document.createElement('article'); card.className = 'picker-card'; card.dataset.sheetId = entry.id;
      const portrait = document.createElement('span'); portrait.className = 'picker-card__portrait';
      const fallback = document.createElement('span'); fallback.className = 'picker-card__icon'; fallback.setAttribute('aria-hidden', 'true'); fallback.textContent = (entry.title || 'F').trim().slice(0, 1).toUpperCase();
      portrait.append(fallback);
      if (entry.hasPortrait) {
        const image = document.createElement('img'); image.loading = 'lazy'; image.alt = '';
        image.src = `/api/sheets/${encodeURIComponent(entry.id)}/portrait`;
        image.addEventListener('load', () => fallback.remove(), { once: true });
        image.addEventListener('error', () => image.remove(), { once: true }); portrait.append(image);
      }
      const details = document.createElement('span'); details.className = 'picker-card__details';
      const title = document.createElement('strong'); title.textContent = entry.title || 'Sem título';
      const open = document.createElement('button'); open.type = 'button'; open.className = 'picker-card__open';
      open.setAttribute('aria-label', `Abrir ficha ${title.textContent}`);
      open.append(title, Object.assign(document.createElement('span'), { className: 'picker-card__open-hint', textContent: 'Abrir ficha' }));
      open.addEventListener('click', () => run('open', entry.id));
      details.append(open);
      const visual = document.createElement('div'); visual.className = 'picker-card__visual'; visual.append(portrait);
      const currentSystem = byId.get(entry.systemId);
      const systemButton = document.createElement('button'); systemButton.type = 'button'; systemButton.className = 'picker-card__system';
      systemButton.dataset.sheetSystem = entry.id;
      systemButton.setAttribute('aria-haspopup', 'dialog'); systemButton.setAttribute('aria-controls', 'sheet-system-dialog');
      systemButton.setAttribute('aria-label', `Alterar sistema da ficha ${title.textContent}. Sistema atual: ${currentSystem?.title || 'não encontrado'}`);
      systemButton.disabled = systems.length === 0;
      const systemIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      systemIcon.setAttribute('viewBox', '0 0 24 24'); systemIcon.setAttribute('aria-hidden', 'true');
      systemIcon.innerHTML = '<path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19"/><circle cx="12" cy="12" r="5"/>';
      const systemName = document.createElement('span'); systemName.textContent = currentSystem?.title || 'Sistema não encontrado';
      systemButton.append(systemIcon, systemName);
      systemButton.addEventListener('click', () => openSystemDialog(entry));
      visual.append(systemButton); card.append(visual, details); cards.append(card);
    }
  }

  function openSystemDialog(entry) {
    changingEntry = entry;
    sheetSystemOptions.replaceChildren();
    sheetSystemFeedback.textContent = '';
    for (const system of systems) {
      const label = document.createElement('label'); label.className = 'sheet-system-option';
      const input = document.createElement('input'); input.type = 'radio'; input.name = 'sheet-system'; input.value = system.id;
      input.checked = system.id === entry.systemId;
      const text = document.createElement('span'); text.className = 'sheet-system-option__text';
      const title = document.createElement('strong'); title.textContent = system.title;
      const hint = document.createElement('small'); hint.textContent = input.checked ? 'Sistema atual' : 'Padrões aplicados com ajustes locais preservados';
      input.addEventListener('change', () => { hint.textContent = input.checked ? 'Sistema selecionado' : 'Padrões aplicados com ajustes locais preservados'; });
      text.append(title, hint); label.append(input, text); sheetSystemOptions.append(label);
    }
    sheetSystemConfirm.disabled = systems.length === 0;
    sheetSystemDialog.showModal();
    (sheetSystemOptions.querySelector('input:checked') || sheetSystemOptions.querySelector('input'))?.focus();
  }

  function renderSystems() {
    systemList.replaceChildren();
    for (const system of systems) {
      const row = document.createElement('article'); row.className = 'system-list-row';
      const description = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = system.title;
      const count = entries.filter(entry => entry.systemId === system.id).length;
      const meta = document.createElement('span'); meta.textContent = `${count} ficha${count === 1 ? '' : 's'} vinculada${count === 1 ? '' : 's'}`;
      description.append(title, meta);
      const actions = document.createElement('div'); actions.className = 'cloud-actions';
      const edit = document.createElement('button'); edit.className = 'btn btn--ghost btn--sm'; edit.textContent = 'Editar'; edit.addEventListener('click', () => openEditor(system));
      const duplicate = document.createElement('button'); duplicate.className = 'btn btn--ghost btn--sm'; duplicate.textContent = 'Duplicar'; duplicate.addEventListener('click', () => run('duplicate-system', system));
      const remove = document.createElement('button'); remove.className = 'btn btn--ghost btn--sm'; remove.textContent = 'Excluir'; remove.disabled = count > 0;
      remove.title = count ? 'Desvincule as fichas antes de excluir este sistema.' : 'Excluir sistema';
      if (['dnd5e', 'tormenta20'].includes(system.id)) { remove.disabled = true; remove.title = 'Os sistemas padrão não podem ser excluídos.'; }
      remove.addEventListener('click', () => run('delete-system', system));
      actions.append(edit, duplicate, remove); row.append(description, actions); systemList.append(row);
    }
  }

  function setSkillRows(skills) {
    rows.innerHTML = skills.map(skill => `<div class="system-skill-row" data-skill-key="${h(skill.key)}">
      <label>Perícia<input data-skill-name value="${h(skill.name)}" maxlength="120" required></label>
      <label>Atributo<select data-skill-ability>${abilityOptions(skill.ability)}</select></label>
      <label>Bônus<input data-skill-bonus type="number" step="any" value="${h(skill.bonus)}" required></label>
      <button type="button" class="btn btn--ghost btn--sm" data-skill-remove>Remover</button></div>`).join('');
  }

  function openEditor(system) {
    editing = structuredClone(system);
    form.elements.title.value = system.title;
    setSkillRows(system.config.skills);
    const advanced = { calculations: system.config.calculations, appearance: system.config.appearance,
      attributes: system.config.attributes, resources: system.config.resources };
    root.querySelector('#system-config-json').value = JSON.stringify(advanced, null, 2);
    root.querySelector('#system-editor-error').hidden = true;
    dialog.showModal(); form.elements.title.focus();
  }

  async function run(action, argument) {
    if (busy || !handlers.has(action)) return;
    busy = true; feedbackEl.textContent = ''; root.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try { const result = await handlers.get(action)(argument); if (result?.message) feedbackEl.textContent = result.message; return result !== false; }
    catch (error) { feedbackEl.textContent = error.message; return false; }
    finally { busy = false; root.querySelectorAll('button').forEach(button => { button.disabled = false; }); renderSystems(); }
  }

  root.querySelector('#picker-new').addEventListener('click', () => run('new', root.querySelector('#picker-system-select')?.value || systems[0]?.id || 'dnd5e'));
  root.querySelector('#picker-refresh').addEventListener('click', () => run('refresh'));
  root.querySelector('#picker-logout').addEventListener('click', () => run('logout'));
  root.querySelector('#picker-systems').addEventListener('click', () => {
    systemSection.hidden = !systemSection.hidden;
    root.querySelector('#picker-systems').setAttribute('aria-expanded', String(!systemSection.hidden));
  });
  root.querySelector('#system-create').addEventListener('click', () => {
    const source = systems.find(item => item.id === 'dnd5e') || systems[0];
    if (source) run('create-system', { ...structuredClone(source), title: 'Novo sistema' });
  });
  root.querySelector('#picker-file').addEventListener('change', event => {
    const file = event.target.files?.[0]; if (file) run('import', file); event.target.value = '';
  });
  sheetSystemConfirm.addEventListener('click', async () => {
    const systemId = sheetSystemOptions.querySelector('input:checked')?.value;
    if (!changingEntry || !systemId) return;
    if (systemId === changingEntry.systemId) { sheetSystemDialog.close(); return; }
    const ok = await run('change-system', { sheetId: changingEntry.id, systemId });
    if (ok) { sheetSystemFeedback.textContent = 'Sistema da ficha atualizado.'; sheetSystemDialog.close(); }
  });
  root.querySelectorAll('[data-sheet-system-close]').forEach(button => button.addEventListener('click', () => sheetSystemDialog.close()));
  sheetSystemDialog.addEventListener('click', event => { if (event.target === sheetSystemDialog) sheetSystemDialog.close(); });
  root.querySelector('#picker-copy-pix').addEventListener('click', async event => {
    const button = event.currentTarget; button.disabled = true; pixFeedback.textContent = '';
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(PIX_KEY); copied = true; }
    } catch { /* Try the browser's selection-based fallback below. */ }
    if (!copied) {
      const input = document.createElement('textarea'); input.value = PIX_KEY; input.setAttribute('readonly', '');
      input.style.position = 'fixed'; input.style.opacity = '0'; document.body.append(input); input.select();
      try { copied = document.execCommand('copy'); } catch { copied = false; }
      input.remove();
    }
    pixFeedback.textContent = copied ? 'Chave PIX copiada.' : 'Não foi possível copiar. Selecione e copie a chave PIX acima.';
    button.disabled = false;
  });
  rows.addEventListener('click', event => { if (event.target.closest('[data-skill-remove]')) event.target.closest('.system-skill-row').remove(); });
  root.querySelector('#system-skill-add').addEventListener('click', () => {
    rows.insertAdjacentHTML('beforeend', `<div class="system-skill-row" data-skill-key="${h(uid('skill'))}">
      <label>Perícia<input data-skill-name value="Nova perícia" maxlength="120" required></label><label>Atributo<select data-skill-ability>${abilityOptions('int')}</select></label>
      <label>Bônus<input data-skill-bonus type="number" step="any" value="0" required></label><button type="button" class="btn btn--ghost btn--sm" data-skill-remove>Remover</button></div>`);
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const skills = [...rows.children].map(row => ({ key: row.dataset.skillKey, name: row.querySelector('[data-skill-name]').value.trim(),
        ability: row.querySelector('[data-skill-ability]').value, bonus: Number(row.querySelector('[data-skill-bonus]').value) }));
      const advanced = JSON.parse(root.querySelector('#system-config-json').value);
      const next = validateSystemProfile({ ...editing, title: form.elements.title.value, config: { ...advanced, skills } });
      run('save-system', next).then(() => { if (feedbackEl.textContent === '') dialog.close(); });
    } catch (error) { const message = root.querySelector('#system-editor-error'); message.textContent = error.message; message.hidden = false; }
  });
  root.querySelectorAll('[data-system-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

  return {
    on(action, handler) { handlers.set(action, handler); },
    setData(nextEntries, nextSystems) {
      entries = nextEntries || []; systems = nextSystems || [];
      renderCards(); renderSystems();
      const select = root.querySelector('#picker-system-select');
      if (select) select.replaceChildren(...systems.map(item => new Option(item.title, item.id)));
    },
    systems: () => systems,
    feedback(message) { feedbackEl.textContent = message || ''; },
    clear() { entries = []; systems = []; cards.replaceChildren(); systemList.replaceChildren(); status.textContent = ''; sheetSystemDialog.close(); dialog.close(); },
    show() {
      document.getElementById('login-screen').hidden = true; root.hidden = false;
      for (const element of document.querySelectorAll('#app, .guild-nav, .skip-link, #save-indicator')) element.hidden = true;
      document.documentElement.dataset.appState = 'picker';
    },
    hide() { root.hidden = true; }
  };
}

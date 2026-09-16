/* ============================================================
   HUNTER'S CODEX — UI
   Liga o objeto `character` ao DOM. Qualquer edição na tela
   passa por aqui, atualiza o modelo (character.js) e dispara
   autosave (storage.js). app.js só faz o "boot".
   ============================================================ */

window.HC = window.HC || {};

HC.ui = (function () {

  const C = HC.character;
  const F = HC.formula;

  let character = null;
  let onChange = null; // callback(character) chamado a cada edição -> autosave

  const RANK_COLOR_VAR = {
    'Low Rank': '--rank-low',
    'High Rank': '--rank-high',
    'Master Rank': '--rank-master',
    'Monster Hunter': '--rank-mhunter'
  };

  const ENTRY_CONFIG = {
    powers: {
      eyebrow: 'Poder',
      fields: [
        { key: 'source', label: 'Origem / Tipo', type: 'text' },
        { key: 'description', label: 'Descrição', type: 'textarea', rows: 6 }
      ],
      subtitle: (e) => e.source || '',
    },
    spells: {
      eyebrow: 'Magia',
      fields: [
        { key: 'level', label: 'Círculo / Nível', type: 'text' },
        { key: 'school', label: 'Escola', type: 'text' },
        { key: 'description', label: 'Descrição', type: 'textarea', rows: 6 }
      ],
      subtitle: (e) => [e.level, e.school].filter(Boolean).join(' · '),
    },
    journal: {
      eyebrow: 'Anotação do Diário',
      fields: [
        { key: 'date', label: 'Data / Sessão', type: 'text' },
        { key: 'description', label: 'Anotação', type: 'textarea', rows: 8 }
      ],
      subtitle: (e) => e.date || '',
    }
  };

  const TAB_LIST = ['powers', 'spells', 'journal'];

  /* ---------------- boot / bind ---------------- */

  function init(initialCharacter, changeCallback) {
    character = initialCharacter;
    onChange = changeCallback;
    HC.systemsUI.init(character, handleSystemChange);

    bindFieldInputs();
    bindResourceAdd();
    bindTabs();
    bindEntryAdders();
    bindTopActions();

    renderAll();
  }

  function setCharacter(newCharacter) {
    character = newCharacter;
    HC.systemsUI.setCharacter(character);
    renderAll();
  }

  function notifyChange(scope) {
    HC.events.emit('character:changed', { character, scope: scope || 'general' });
    if (typeof onChange === 'function') onChange(character);
  }

  function handleSystemChange(scope) {
    HC.systemsUI.syncDerived();
    renderResources();
    HC.systemsUI.renderAll();
    notifyChange(scope);
  }

  function renderAll() {
    HC.systemsUI.syncDerived();
    renderInfoFields();
    renderSeal();
    renderAttributes();
    renderResources();
    TAB_LIST.forEach(renderEntryList);
    HC.systemsUI.renderAll();
  }

  /* ---------------- Guild Card info fields ---------------- */

  function renderInfoFields() {
    document.querySelectorAll('[data-field^="info."]').forEach(el => {
      const path = el.dataset.field;
      const value = C.get(character, path);
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT') {
        el.value = value ?? '';
      } else {
        el.textContent = (value === '' || value == null) ? el.dataset.placeholder || '' : value;
      }
    });
  }

  function bindFieldInputs() {
    document.querySelectorAll('[data-field^="info."]').forEach(el => {
      const path = el.dataset.field;
      const isNumber = el.type === 'number';
      const eventName = (el.tagName === 'SELECT' || el.type === 'number') ? 'change' : 'blur';

      el.addEventListener(eventName, () => {
        let value = (el.tagName === 'INPUT' || el.tagName === 'SELECT') ? el.value : el.textContent.trim();
        if (isNumber) value = Number(value) || 0;
        C.set(character, path, value);
        if (path === 'info.level' || path === 'info.guildRank') renderSeal();
        if (path === 'info.level') {
          HC.systemsUI.syncDerived();
          renderResources();
          HC.systemsUI.renderAll();
        }
        notifyChange(path);
      });

      // contenteditable: Enter confirma e tira o foco, em vez de quebrar linha
      if (el.isContentEditable) {
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
        });
      }
    });
  }

  /* ---------------- Guild Seal ---------------- */

  function renderSeal() {
    const seal = document.getElementById('guild-seal');
    const levelEl = document.getElementById('seal-level');
    const rankEl = document.getElementById('seal-rank');
    const rank = character.info.guildRank || 'Low Rank';
    const varName = RANK_COLOR_VAR[rank] || '--rank-low';

    levelEl.textContent = character.info.level || 1;
    rankEl.textContent = rank;
    seal.style.setProperty('--rank-color', `var(${varName})`);
  }

  /* ---------------- Attributes ---------------- */

  function renderAttributes() {
    const grid = document.getElementById('attr-grid');
    grid.innerHTML = C.ATTRS.map(key => {
      const score = character.attributes[key];
      const modVal = F.mod(score);
      return `
        <div class="attr-tile">
          <div class="attr-tile__label">${C.ATTR_LABELS[key]}</div>
          <input class="attr-tile__score field-input mono" type="number"
                 data-attr="${key}" value="${score}" min="1" max="30">
          <span class="attr-tile__mod" data-neg="${modVal < 0}">${F.modStr(score)}</span>
        </div>`;
    }).join('');

    grid.querySelectorAll('[data-attr]').forEach(input => {
      input.addEventListener('change', () => {
        const key = input.dataset.attr;
        character.attributes[key] = Number(input.value) || 10;
        character.meta.updatedAt = new Date().toISOString();
        renderAttributes();
        HC.systemsUI.syncDerived();
        renderResources();
        HC.systemsUI.renderAll();
        notifyChange(`attributes.${key}`);
      });
    });
  }

  /* ---------------- Resources ---------------- */

  function renderResources() {
    const stack = document.getElementById('resource-stack');
    stack.innerHTML = character.resources.map(r => {
      const pct = F.percent(r.current, r.max);
      const typeClass = ['hp', 'atp', 'sanidade', 'evo'].includes(r.type)
        ? `resource--${r.type}` : 'resource--custom';
      return `
        <div class="resource ${typeClass}" data-id="${r.id}">
          <div class="resource__head">
            <span class="resource__name field-input" contenteditable="${r.removable}" data-res-name="${r.id}">${escapeHTML(r.name)}</span>
            <span class="resource__values">
              <input type="number" class="field-input mono" data-res-current="${r.id}" value="${r.current}">
              <span>/</span>
              <input type="number" class="field-input mono" data-res-max="${r.id}" value="${r.max}" ${r.type === 'hp' ? 'readonly title="Calculado automaticamente pelo D&D Rule Engine"' : ''}>
              ${r.removable ? `<button class="resource__remove" data-res-remove="${r.id}" title="Remover">&times;</button>` : ''}
            </span>
          </div>
          <div class="resource__track">
            <div class="resource__fill" style="width:${pct}%"></div>
          </div>
        </div>`;
    }).join('');

    stack.querySelectorAll('[data-res-current]').forEach(input => {
      input.addEventListener('change', () => updateResource(input.dataset.resCurrent, 'current', input.value));
    });
    stack.querySelectorAll('[data-res-max]').forEach(input => {
      input.addEventListener('change', () => updateResource(input.dataset.resMax, 'max', input.value));
    });
    stack.querySelectorAll('[data-res-name]').forEach(el => {
      el.addEventListener('blur', () => {
        const r = character.resources.find(x => x.id === el.dataset.resName);
        if (r) { r.name = el.textContent.trim() || r.name; notifyChange(); }
      });
    });
    stack.querySelectorAll('[data-res-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        C.removeResource(character, btn.dataset.resRemove);
        renderResources();
        notifyChange();
      });
    });
  }

  function updateResource(id, key, rawValue) {
    const r = character.resources.find(x => x.id === id);
    if (!r) return;
    r[key] = Math.max(0, Number(rawValue) || 0);
    if (key === 'max') r.current = F.clamp(r.current, r.max);
    character.meta.updatedAt = new Date().toISOString();
    renderResources();
    notifyChange();
  }

  function bindResourceAdd() {
    document.getElementById('btn-add-resource').addEventListener('click', () => {
      C.addResource(character, { name: 'Novo Recurso', current: 10, max: 10 });
      renderResources();
      notifyChange();
    });
  }

  /* ---------------- Tabs ---------------- */

  function bindTabs() {
    TAB_LIST.forEach(name => {
      document.getElementById(`tab-btn-${name}`).addEventListener('click', () => switchTab(name));
    });
  }

  function switchTab(activeName) {
    TAB_LIST.forEach(name => {
      const btn = document.getElementById(`tab-btn-${name}`);
      const panel = document.getElementById(`tab-${name}`);
      const isActive = name === activeName;
      btn.setAttribute('aria-selected', String(isActive));
      panel.hidden = !isActive;
    });
  }

  /* ---------------- Entry lists (poderes / magias / diário) ---------------- */

  function renderEntryList(listName) {
    const panel = document.getElementById(`tab-${listName}`);
    const config = ENTRY_CONFIG[listName];
    const entries = character[listName];

    const cardsHTML = entries.map(entry => `
      <div class="entry-card" data-entry-id="${entry.id}" data-list="${listName}" tabindex="0" role="button">
        <div class="entry-card__title">${escapeHTML(entry.title)}</div>
        <div class="entry-card__subtitle">${escapeHTML(config.subtitle(entry))}</div>
        <div class="entry-card__excerpt">${escapeHTML(entry.description || '')}</div>
      </div>`).join('');

    const emptyHTML = entries.length === 0
      ? `<div class="empty-hint">Nenhum registro ainda. Clique em "+ Novo" para começar.</div>` : '';

    panel.innerHTML = emptyHTML + cardsHTML + `
      <div class="entry-card entry-card--new" data-add="${listName}" tabindex="0" role="button">+ Novo</div>`;

    panel.querySelectorAll('[data-entry-id]').forEach(card => {
      card.addEventListener('click', () => openEntryModal(listName, card.dataset.entryId));
    });
    panel.querySelector('[data-add]').addEventListener('click', () => openEntryModal(listName, null));
  }

  function bindEntryAdders() {
    // os botões "+ Novo" são recriados a cada render, então a ligação
    // acontece dentro de renderEntryList — este hook fica reservado
    // para futuras ações globais (ex: atalhos de teclado).
  }

  function openEntryModal(listName, entryId) {
    const config = ENTRY_CONFIG[listName];
    const entry = entryId ? character[listName].find(e => e.id === entryId) : null;

    HC.modal.open({
      eyebrow: config.eyebrow,
      entry: entry,
      fields: config.fields,
      onSave: (data) => {
        if (entry) {
          C.updateEntry(character, listName, entry.id, data);
        } else {
          C.addEntry(character, listName, data);
        }
        renderEntryList(listName);
        notifyChange();
      },
      onDelete: entry ? () => {
        C.removeEntry(character, listName, entry.id);
        renderEntryList(listName);
        notifyChange();
      } : null
    });
  }

  /* ---------------- Top actions (export / import / theme / new) ---------------- */

  function bindTopActions() {
    document.getElementById('btn-export').addEventListener('click', () => {
      HC.storage.exportJSON(character);
    });

    const fileInput = document.getElementById('file-import');
    document.getElementById('btn-import').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      try {
        const data = await HC.storage.importJSON(file);
        const next = C.migrate(data);
        if (!HC.storage.backup(JSON.stringify(character))) throw new Error('Falha no backup.');
        HC.storage.cancelAutosave();
        setCharacter(next);
        notifyChange();
      } catch (err) {
        alert('Não foi possível ler esse arquivo. Verifique se é um JSON exportado pelo Hunter\'s Codex.');
      }
      fileInput.value = '';
    });

    document.getElementById('btn-new').addEventListener('click', () => {
      if (!confirm('Criar um novo Caçador? A ficha atual continuará salva até você exportá-la, mas será substituída no autosave.')) return;
      if (!HC.storage.backup(JSON.stringify(character))) { alert('Não foi possível preservar a ficha atual.'); return; }
      HC.storage.cancelAutosave();
      setCharacter(C.createDefault());
      notifyChange();
    });

    const themeBtn = document.getElementById('btn-theme');
    themeBtn.addEventListener('click', () => {
      const isParchment = document.documentElement.dataset.theme === 'pergaminho';
      document.documentElement.dataset.theme = isParchment ? '' : 'pergaminho';
      themeBtn.textContent = isParchment ? 'Pergaminho' : 'Guilda';
    });
  }

  function escapeHTML(str) {
    return String(str ?? '').replace(/[&<>"']/g, s => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[s]));
  }

  return { init, setCharacter, renderAll };
})();

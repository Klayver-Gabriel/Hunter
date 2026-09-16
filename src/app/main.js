import storage from '../infrastructure/storage.js';
import * as characterModel from '../domain/character.js';
import * as ui from '../layout/ui.js';
import * as modal from '../layout/modal.js';
/* Inicialização com recuperação explícita: nunca substitui dados ilegíveis. */
(function () {
  function setIndicator(status) {
    const el = document.getElementById('save-indicator');
    el.classList.toggle('saving', status === 'saving');
    el.classList.toggle('save-error', status === 'error');
    el.setAttribute('role', 'status');
    document.getElementById('save-indicator-text').textContent = {
      saving: 'Salvando…', saved: 'Salvo', error: 'Erro ao salvar'
    }[status];
  }

  function recovery(result, error) {
    const panel = document.createElement('section');
    panel.className = 'panel';
    const title = document.createElement('h1'); title.textContent = 'Não foi possível abrir sua ficha';
    const message = document.createElement('p'); message.textContent = error.message + ' Seus dados não foram substituídos.';
    panel.append(title, message);
    if (result.raw !== null) {
      const download = document.createElement('button'); download.className = 'btn'; download.textContent = 'Baixar original';
      download.onclick = () => {
        const url = URL.createObjectURL(new Blob([result.raw], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = 'hunter-original.json'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      panel.append(download);
    }
    const retry = document.createElement('button'); retry.className = 'btn'; retry.textContent = 'Tentar novamente';
    retry.onclick = () => location.reload(); panel.append(retry);
    document.getElementById('app').replaceChildren(panel);
    document.querySelector('.guild-nav').hidden = true;
    setIndicator('error');
  }

  function boot() {
    const saved = storage.load();
    try {
      if (!saved.ok) throw saved.error;
      const character = saved.empty ? characterModel.createDefault() : characterModel.migrate(saved.value);
      if (!saved.empty && !storage.backup(saved.raw)) throw new Error('Não foi possível preservar o original.');
      modal.init();
      ui.init(character, updated => storage.autosave(updated, setIndicator, 500));
      setIndicator(storage.save(character) ? 'saved' : 'error');
    } catch (error) { recovery(saved, error); }
  }
  document.addEventListener('DOMContentLoaded', boot);
})();

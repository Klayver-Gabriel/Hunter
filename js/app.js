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
    const saved = HC.storage.load();
    try {
      if (!saved.ok) throw saved.error;
      const character = saved.empty ? HC.character.createDefault() : HC.character.migrate(saved.value);
      if (!saved.empty && !HC.storage.backup(saved.raw)) throw new Error('Não foi possível preservar o original.');
      HC.modal.init();
      HC.ui.init(character, updated => HC.storage.autosave(updated, setIndicator, 500));
      setIndicator(HC.storage.save(character) ? 'saved' : 'error');
    } catch (error) { recovery(saved, error); }
  }
  document.addEventListener('DOMContentLoaded', boot);
})();

/* ============================================================
   HUNTER'S CODEX — APP
   Ponto de entrada. Carrega a ficha salva (ou cria uma nova),
   inicializa a UI e liga o autosave ao indicador visual.
   ============================================================ */

(function () {

  function setIndicator(status) {
    const el = document.getElementById('save-indicator');
    const text = document.getElementById('save-indicator-text');
    if (status === 'saving') {
      el.classList.add('saving');
      text.textContent = 'Salvando…';
    } else {
      el.classList.remove('saving');
      text.textContent = 'Salvo';
    }
  }

  function boot() {
    HC.modal.init();

    const saved = HC.storage.load();
    const character = saved || HC.character.createDefault();

    HC.ui.init(character, (updatedCharacter) => {
      HC.storage.autosave(updatedCharacter, setIndicator, 500);
    });

    // Garante que exista uma versão salva mesmo antes da primeira edição.
    if (!saved) HC.storage.save(character);
  }

  document.addEventListener('DOMContentLoaded', boot);
})();

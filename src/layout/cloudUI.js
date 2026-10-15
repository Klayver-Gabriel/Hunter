/** Account and sheet labels are rendered as text. */
export function createCloudUI({ enabled, user, unavailable = false }) {
  const root = document.getElementById('sheets');
  root.className = 'cloud-panel';
  root.innerHTML = `<div class="sheet-account"><div><span class="sheet-eyebrow">Seu espaço</span><p id="cloud-account"></p></div><div class="cloud-actions">
    <button class="btn btn--ghost btn--sm" data-cloud="login">Entrar com Google</button>
    <button class="btn btn--ghost btn--sm" data-cloud="home">Voltar ao início</button>
    <button class="btn btn--ghost btn--sm" data-cloud="logout">Sair</button>
  </div></div>
  <div class="sheet-current"><span class="sheet-eyebrow">Ficha atual</span><h3 id="sheet-current-title">Sem título</h3><p id="sheet-storage"></p>
    <div class="sheet-primary-actions">
      <button class="btn" id="btn-save-sheet" aria-haspopup="dialog" aria-controls="save-sheet-dialog">Salvar ficha</button>
      <button class="btn btn--ghost" id="btn-open-sheet" aria-haspopup="dialog" aria-controls="open-sheet-dialog">Abrir ficha</button>
      <button class="btn btn--ghost" id="btn-new" data-cloud="new">Nova ficha</button>
    </div>
  </div>
  <p class="sheet-feedback" id="cloud-feedback" role="status"></p>
  <div class="sheet-danger"><button class="btn btn--ghost btn--sm" data-cloud="delete">Excluir ficha da conta</button></div>`;
  const saveDialog = document.createElement('dialog'); saveDialog.id = 'save-sheet-dialog'; saveDialog.className = 'sheet-dialog';
  saveDialog.setAttribute('aria-labelledby', 'save-sheet-title');
  saveDialog.innerHTML = `<header><h2 id="save-sheet-title">Salvar ficha</h2><button class="sheet-dialog-close" aria-label="Fechar" data-close>×</button></header>
    <p>Escolha onde guardar sua ficha.</p><div class="sheet-choices">
      <button class="sheet-choice" data-cloud="save"><strong>Salvar na conta</strong><span>Confirmar o salvamento da ficha na sua conta.</span></button>
      <button class="sheet-choice" data-cloud="export"><strong>Salvar como JSON</strong><span>Baixar uma cópia completa para o seu dispositivo.</span></button>
    </div><p class="sheet-account-hint"></p>
    <button class="btn btn--ghost" data-cloud="copy" hidden>Salvar como cópia na conta</button>
    <p class="sheet-feedback" role="status"></p>`;
  const openDialog = document.createElement('dialog'); openDialog.id = 'open-sheet-dialog'; openDialog.className = 'sheet-dialog';
  openDialog.setAttribute('aria-labelledby', 'open-sheet-title');
  openDialog.innerHTML = `<header><h2 id="open-sheet-title">Abrir ficha</h2><button class="sheet-dialog-close" aria-label="Fechar" data-close>×</button></header>
    <div class="sheet-open-account"><h3>Da sua conta</h3><label for="cloud-sheets">Minhas fichas</label>
      <select id="cloud-sheets"><option value="">Selecione uma ficha</option></select>
      <p id="sheet-list-status" role="status"></p><div class="cloud-actions">
        <button class="btn" data-cloud="open">Abrir da conta</button><button class="btn btn--ghost" data-cloud="refresh">Atualizar lista</button>
      </div></div><p class="sheet-account-hint"></p>
    <div class="sheet-open-json"><h3>Do seu dispositivo</h3><p>${user ? 'O arquivo será aberto como uma nova ficha na sua conta, após sua confirmação.' : 'O arquivo será aberto e salvo neste navegador.'}</p>
      <button class="btn btn--ghost" id="btn-open-json">Escolher arquivo JSON</button>
      <input type="file" id="file-import" accept=".json,application/json" hidden>
    </div><button class="btn btn--ghost btn--sm" data-cloud="migrate">Importar fichas deste navegador para minha conta</button>
    <p class="sheet-feedback" role="status"></p>`;
  document.body.append(saveDialog, openDialog);
  const surfaces = [root, saveDialog, openDialog], handlers = new Map();
  const find = selector => surfaces.flatMap(surface => [...surface.querySelectorAll(selector)]);
  const selection = openDialog.querySelector('#cloud-sheets');
  const account = root.querySelector('#cloud-account');
  account.textContent = user ? `${user.name} · Fichas da sua conta` : unavailable ? 'Conexão com a conta indisponível.' : 'Modo local deste navegador';
  let busy = false, privateLocked = false, currentStatus = user ? 'empty' : 'saved', hasEntry = false;
  const feedback = message => { find('.sheet-feedback').forEach(element => { element.textContent = message; }); };
  function update() {
    find('button').forEach(button => {
      const action = button.dataset.cloud;
      const requiresAccount = ['save', 'copy', 'open', 'refresh', 'migrate', 'delete'].includes(action);
      button.disabled = busy || (requiresAccount && (!user || currentStatus === 'expired' || privateLocked))
        || (action === 'open' && !selection.value) || (action === 'delete' && !hasEntry)
        || (privateLocked && !['login', 'logout'].includes(action));
    });
    find('[data-cloud="login"]').forEach(button => { button.hidden = privateLocked ? false : user ? currentStatus !== 'expired' : !enabled || unavailable; });
    find('[data-cloud="home"]').forEach(button => { button.hidden = Boolean(user); });
    find('[data-cloud="logout"], [data-cloud="delete"], [data-cloud="migrate"]').forEach(button => { button.hidden = !user || privateLocked; });
    find('[data-cloud="copy"]').forEach(button => { button.hidden = !user || !['conflict', 'error'].includes(currentStatus) || privateLocked; });
    selection.disabled = busy || !user || currentStatus === 'expired' || privateLocked;
    find('.sheet-account-hint').forEach(element => {
      element.textContent = !user ? 'Entre com Google para abrir e salvar fichas na sua conta.' : currentStatus === 'expired' ? 'Entre novamente na mesma conta para continuar o salvamento.' : '';
    });
    root.querySelector('#sheet-storage').textContent = privateLocked ? 'Entre na mesma conta para recuperar sua edição.' : !user ? 'As alterações são salvas automaticamente neste navegador.' : {
      empty: 'Salve esta ficha na conta ou comece a editar para ativar o salvamento automático.',
      pending: 'Alterações aguardando o salvamento automático na conta.', saving: 'Salvando na sua conta…',
      saved: 'Ficha salva na conta. O salvamento automático está ativo.', error: 'Falha ao salvar na conta. Abra Salvar ficha para tentar novamente ou baixar o JSON.',
      conflict: 'A ficha foi alterada em outra sessão. Abra Salvar ficha para guardar uma cópia ou baixar o JSON.',
      expired: 'Sessão encerrada. Sua edição permanece nesta página.'
    }[currentStatus];
  }
  async function run(action, argument) {
    if (busy || !handlers.has(action)) return;
    let closing;
    busy = true; feedback(''); update();
    try {
      const result = await handlers.get(action)(argument);
      if (result !== false && ['save', 'copy', 'export'].includes(action)) closing = saveDialog;
      if (result !== false && ['open', 'import'].includes(action)) closing = openDialog;
    } catch (error) { feedback(error.message); }
    finally {
      busy = false; update(); closing?.close();
      if (closing === openDialog) document.getElementById('page-title').focus();
    }
  }
  find('[data-cloud]').forEach(button => { button.addEventListener('click', () => run(button.dataset.cloud)); });
  for (const dialog of [saveDialog, openDialog]) {
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    dialog.addEventListener('click', event => { if (event.target === dialog && !busy) {
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    } });
  }
  root.querySelector('#btn-save-sheet').onclick = () => { update(); saveDialog.showModal(); };
  root.querySelector('#btn-open-sheet').onclick = () => { update(); openDialog.showModal(); if (user && currentStatus !== 'expired') run('refresh'); };
  const fileInput = openDialog.querySelector('#file-import');
  openDialog.querySelector('#btn-open-json').onclick = () => fileInput.click();
  fileInput.onchange = async () => { if (fileInput.files[0]) await run('import', fileInput.files[0]); fileInput.value = ''; };
  selection.onchange = update;
  update();
  return {
    feedback, selected: () => selection.value,
    current(document, entry = null) {
      hasEntry = Boolean(entry);
      if (!privateLocked) root.querySelector('#sheet-current-title').textContent = document.character.info.name || 'Sem título';
      update();
    },
    list(entries, active) {
      if (privateLocked) return;
      selection.replaceChildren(new Option('Selecione uma ficha', ''));
      for (const entry of entries) selection.add(new Option(entry.title, entry.id));
      selection.value = active || '';
      openDialog.querySelector('#sheet-list-status').textContent = entries.length ? `${entries.length} ficha${entries.length === 1 ? '' : 's'} na conta.` : 'Você ainda não possui fichas na conta.';
      update();
    },
    status(status) {
      currentStatus = status; update();
      if (status === 'expired') feedback('Sessão encerrada ou conta alterada. Entre na mesma conta para recuperar a edição. Use Salvar ficha para baixar o JSON antes de fechar esta página.');
      else if (status === 'conflict') feedback('A versão da conta mudou. Sua edição está preservada. Use Salvar ficha para baixar o JSON ou salvar como cópia.');
    },
    lock() {
      privateLocked = true; selection.replaceChildren();
      root.querySelector('#sheet-current-title').textContent = 'Sessão encerrada';
      account.textContent = 'Acesso à conta encerrado'; update();
    },
    on(action, handler) { handlers.set(action, handler); }
  };
}

export function previewLocalImport(candidates, importSelected) {
  const dialog = document.createElement('dialog'); dialog.className = 'cloud-import';
  const title = document.createElement('h2'); title.textContent = 'Importar fichas deste navegador para minha conta';
  const description = document.createElement('p'); description.textContent = 'Este navegador pode ser compartilhado. Selecione somente as fichas que deseja enviar. Os originais locais serão preservados.';
  dialog.append(title, description);
  candidates.forEach((candidate, index) => {
    const label = document.createElement('label'), checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = index;
    const text = document.createElement('span'); text.textContent = `${candidate.title} · ${candidate.source} · ${candidate.bytes} bytes`;
    label.append(checkbox, text); dialog.append(label);
  });
  const error = document.createElement('p'); error.setAttribute('role', 'status');
  const submit = document.createElement('button'); submit.textContent = 'Confirmar importação das selecionadas'; submit.className = 'btn';
  const cancel = document.createElement('button'); cancel.textContent = 'Cancelar'; cancel.className = 'btn btn--ghost';
  dialog.append(error, submit, cancel); document.body.append(dialog); dialog.showModal();
  cancel.onclick = () => dialog.close(); dialog.addEventListener('close', () => dialog.remove());
  submit.onclick = async () => {
    const selected = [...dialog.querySelectorAll('input:checked')].map(input => candidates[Number(input.value)]);
    if (!selected.length) { error.textContent = 'Selecione pelo menos uma ficha.'; return; }
    submit.disabled = true; cancel.disabled = true;
    try { await importSelected(selected); dialog.close(); }
    catch (failure) { error.textContent = failure.message; }
    finally { submit.disabled = false; cancel.disabled = false; }
  };
}

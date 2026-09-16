export function showRecovery({ loaded, error, recover, readFile, onStatus }) {
  const panel = document.createElement('section'); panel.className = 'panel';
  const title = document.createElement('h1'); title.textContent = 'Não foi possível abrir sua ficha';
  const message = document.createElement('p'); message.textContent = `${error.message} Seus dados não foram substituídos.`;
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  panel.append(title, message);
  if (loaded.raw !== null) {
    const download = document.createElement('button'); download.className = 'btn'; download.textContent = 'Baixar original';
    download.onclick = () => {
      const url = URL.createObjectURL(new Blob([loaded.raw], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'hunter-original.json'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }; panel.append(download);
  }
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json'; input.hidden = true; input.id = 'recovery-file';
  const restore = document.createElement('button'); restore.className = 'btn'; restore.textContent = 'Importar ficha recuperada'; restore.onclick = () => input.click();
  input.addEventListener('change', async () => {
    if (!input.files[0]) return;
    try {
      recover(await readFile(input.files[0]));
      location.reload();
    } catch (failure) { status.textContent = `Recuperação não concluída: ${failure.message}`; input.value = ''; }
  });
  const retry = document.createElement('button'); retry.className = 'btn'; retry.textContent = 'Tentar novamente';
  retry.onclick = () => location.reload(); panel.append(restore, input, retry, status);
  document.getElementById('app').replaceChildren(panel);
  document.querySelector('.guild-nav').hidden = true; onStatus('error');
}

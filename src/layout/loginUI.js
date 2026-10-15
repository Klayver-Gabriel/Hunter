export function showWorkspace(mode) {
  document.getElementById('login-screen').hidden = true;
  for (const element of document.querySelectorAll('#app, .guild-nav, .skip-link, #save-indicator')) element.hidden = false;
  document.querySelector('.app-footer').textContent = mode === 'local' ? 'Cheets · Armazenamento neste navegador' : 'Cheets · Fichas da sua conta';
}

export function chooseLogin({ enabled, unavailable, error = false }) {
  const google = document.getElementById('login-google'), local = document.getElementById('login-local');
  const status = document.getElementById('login-status'), retry = document.getElementById('login-retry');
  google.disabled = !enabled || unavailable; local.disabled = false; retry.hidden = !unavailable;
  status.textContent = unavailable ? 'Conexão indisponível. Tente novamente ou use o armazenamento local.'
    : error ? 'Não foi possível concluir o login. Tente novamente.'
      : enabled ? '' : 'Login Google disponível na versão conectada do Cheets.';
  retry.onclick = () => location.reload();
  return new Promise(resolve => {
    function choose(mode) {
      google.disabled = true; local.disabled = true;
      status.textContent = mode === 'google' ? 'Redirecionando para o Google…' : 'Abrindo suas fichas…';
      resolve(mode);
    }
    google.onclick = () => choose('google'); local.onclick = () => choose('local');
  });
}

export function initTheme(preferences) {
  const button = document.getElementById('btn-theme');
  const status = document.getElementById('theme-status');
  const media = matchMedia('(prefers-color-scheme: dark)');
  let explicit = preferences.load().value.theme;
  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    const action = theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro';
    button.setAttribute('aria-label', action); button.title = action;
    const icon = document.createElement('img');
    icon.src = `assets/icons/${theme === 'dark' ? 'sun' : 'moon'}.svg`;
    icon.alt = ''; icon.width = 20; icon.height = 20;
    button.replaceChildren(icon);
  }
  apply(explicit || (media.matches ? 'dark' : 'light'));
  button.addEventListener('click', () => {
    explicit = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    apply(explicit);
    status.textContent = preferences.save(explicit).ok ? '' : 'Tema alterado, mas não foi possível guardar a preferência.';
  });
  media.addEventListener('change', event => { if (!explicit) apply(event.matches ? 'dark' : 'light'); });
}

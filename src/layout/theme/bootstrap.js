// Blocking head script applies the theme before stylesheets can paint.
(() => {
  let theme;
  try { theme = JSON.parse(localStorage.getItem('hunterscodex:preferences:v1') || '{}')?.theme; } catch { /* Storage may be disabled; system preference remains available. */ }
  document.documentElement.dataset.theme = ['light', 'dark'].includes(theme)
    ? theme : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
})();

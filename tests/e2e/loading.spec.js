import { test, expect } from '@playwright/test';

const session = { enabled: true, user: { id: 'account-a', name: 'Conta A' }, csrf: 'csrf' };

function gate() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, release: resolve };
}

test('mantém a ficha oculta até concluir o carregamento remoto durante o refresh', async ({ page }) => {
  const response = gate(), requested = gate();
  let hold = false;
  await page.route('**/api/session', route => route.fulfill({ json: session }));
  await page.route('**/api/sheets', async route => {
    if (hold) { requested.release(); await response.promise; }
    await route.fulfill({ json: { sheets: [] } });
  });
  await page.goto('/#records'); await expect(page.locator('#page-records')).toBeVisible();
  hold = true;
  try {
    await page.reload({ waitUntil: 'domcontentloaded' }); await requested.promise;
    await expect(page.locator('#app')).toBeHidden();
    await expect(page.locator('#login-status')).toContainText('Abrindo suas fichas');
    await expect(page.locator('.guild-nav')).toBeHidden();
    await expect(page.locator('#save-indicator')).toBeHidden();
    await expect(page.locator('.login-options')).toBeHidden();
  } finally { response.release(); }
  await expect(page.locator('#page-records')).toBeVisible();
  await expect(page.locator('#page-guild-card')).toBeHidden();
  await expect(page.locator('#login-screen')).toBeHidden();
});

test('refresh mantém a tela de carregamento até verificar a sessão e apresentar o login', async ({ page }) => {
  const response = gate(), requested = gate();
  let hold = false;
  await page.route('**/api/session', async route => {
    if (hold) { requested.release(); await response.promise; }
    await route.fulfill({ json: { enabled: true, user: null } });
  });
  await page.goto('/'); await expect(page.locator('#login-google')).toBeEnabled();
  hold = true;
  try {
    await page.reload({ waitUntil: 'domcontentloaded' }); await requested.promise;
    await expect(page.locator('#login-status')).toHaveText('Verificando sua sessão…');
    await expect(page.locator('.login-options')).toBeHidden();
    await expect(page.locator('#app')).toBeHidden();
    await expect(page.locator('.guild-nav')).toBeHidden();
  } finally { response.release(); }
  await expect(page.locator('#login-google')).toBeEnabled();
  await expect(page.locator('.login-options')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
});

test('HTML mantém a interface oculta com CSS indisponível e JavaScript ainda carregando', async ({ page }) => {
  const module = gate(), requested = gate();
  await page.route('**/css/components.css', route => route.abort());
  await page.route('**/src/app/main.js', async route => {
    requested.release(); await module.promise; await route.continue();
  });
  await page.route('**/api/session', route => route.fulfill({ json: { enabled: true, user: null } }));
  try {
    await page.goto('/', { waitUntil: 'commit' }); await requested.promise;
    await expect.poll(() => page.evaluate(() => Boolean(document.querySelector('link[href="css/layout.css"]')?.sheet))).toBe(true);
    await expect(page.locator('#app')).toBeHidden();
    await expect(page.locator('.guild-nav')).toBeHidden();
    await expect(page.locator('#save-indicator')).toBeHidden();
  } finally { module.release(); }
  await expect(page.locator('#login-google')).toBeEnabled();
  await expect(page.locator('#app')).toBeHidden();
});

import { test, expect } from '@playwright/test';
import { openPage } from './helpers/navigation.js';

async function mockSession(page, initial = null) {
  const state = { user: initial };
  await page.route('**/api/session', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ enabled: true, user: state.user, csrf: 'csrf' }) }));
  await page.route('**/api/sheets', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ sheets: [] }) }));
  return state;
}
test('Cheets starts at login with an untouched local sheet and two explicit choices', async ({ page }) => {
  await mockSession(page);
  await page.addInitScript(() => localStorage.setItem('hunterscodex:sheet:v1', JSON.stringify({ info: { name: 'Ficha do navegador' }, attributes: { for: 12 } })));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Cheets', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar com Google', exact: true })).toBeEnabled();
  await expect.poll(() => page.locator('#login-google img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.locator('#app')).not.toBeVisible(); await expect(page.locator('.guild-nav')).not.toBeVisible();
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('hunterscodex:sheet:v1'))).info.name).toBe('Ficha do navegador');
  await page.locator('#login-local').click();
  await expect(page.locator('[data-field="info.name"]')).toHaveText('Ficha do navegador');
  await expect(page.locator('#login-screen')).not.toBeVisible();
  await page.reload(); await expect(page.locator('#app')).toBeVisible();
  await openPage(page, 'sheets'); await page.locator('[data-cloud="home"]').click(); await expect(page.locator('#login-screen')).toBeVisible();
});
test('Google login redirects in the same tab and returns to the authenticated workspace', async ({ page, context }) => {
  const state = await mockSession(page);
  await page.route('**/auth/google', async route => {
    state.user = { id: 'account-a', name: 'Conta A' };
    await route.fulfill({ status: 303, headers: { location: '/?auth=complete' }, body: '' });
  });
  await page.goto('/'); await page.locator('#login-google').click();
  await expect(page.locator('#cloud-account')).toContainText('Conta A');
  await expect(page.locator('#app')).toBeVisible(); await expect(page.locator('#login-screen')).not.toBeVisible();
  await expect(page.locator('[data-cloud="login"]')).not.toBeVisible();
  await expect(page).toHaveURL('/'); expect(context.pages()).toHaveLength(1);
});
test('failed login returns to the welcome screen with a retry option', async ({ page }) => {
  await mockSession(page); await page.goto('/?auth=error');
  await expect(page.locator('#login-status')).toContainText('Não foi possível concluir o login');
  await expect(page.locator('#login-google')).toBeEnabled(); await expect(page.locator('#app')).not.toBeVisible();
});
test('login is accessible by keyboard and fits a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 }); await mockSession(page); await page.goto('/');
  await expect(page.locator('#login-google')).toBeEnabled();
  await page.keyboard.press('Tab'); await expect(page.locator('#login-google')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.locator('#login-local')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Enter'); await expect(page.locator('#app')).toBeVisible();
});

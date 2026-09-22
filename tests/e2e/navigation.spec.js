import { test, expect } from '@playwright/test';
import { openPage } from './helpers/navigation.js';

const snapshot = page => page.evaluate(() => localStorage.getItem('hunterscodex:sheet:v1'));

test('menu separa páginas, agrupa equipamentos e abre fórmulas pela engrenagem', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const original = await snapshot(page);
  await expect(page.locator('#page-guild-card')).toBeVisible();
  await expect(page.locator('#calculations')).toBeHidden();
  await expect(page.locator('.equipment-navigation')).toBeHidden();
  for (const key of ['equipment', 'armory', 'library']) {
    await openPage(page, key);
    await expect(page.locator('[data-sheet-page]:visible')).toHaveCount(1);
    await expect(page.locator('.guild-nav__link[href="#equipment"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator(`.equipment-navigation [href="#${key}"]`)).toHaveAttribute('aria-current', 'page');
  }
  await openPage(page, 'records');
  await page.getByRole('tab', { name: 'Magias', exact: true }).click();
  await expect(page.locator('#tab-spells')).toBeVisible();
  await openPage(page, 'calculations');
  await expect(page.locator('#page-title')).toHaveText('Configurações');
  await expect(page.locator('.equipment-navigation')).toBeHidden();
  await expect(page.locator('#btn-spellcasting')).toBeVisible();
  await page.getByText('Ajustar componentes de combate', { exact: true }).click();
  await expect(page.locator('[data-config-path="dnd.vitality.firstLevelFormula"]')).toBeVisible();
  expect(await snapshot(page)).toBe(original);
  await page.locator('[data-config-path="dnd.armor.base"]').fill('15');
  await page.locator('[data-config-path="dnd.armor.base"]').press('Tab');
  await openPage(page, 'dnd-rules');
  await expect(page.locator('.metric-card--armor .metric-card__value')).toHaveText('15');
  expect(errors).toEqual([]);
});

test('links diretos, histórico e teclado mantêm a página e o foco corretos', async ({ page }) => {
  await page.goto('/#library');
  await expect(page.locator('#page-library')).toBeVisible();
  await page.reload();
  await expect(page.locator('#page-library')).toBeVisible();
  await page.locator('.guild-nav__link[href="#guild-card"]').focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('button', { name: 'Configurações', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#page-calculations')).toBeVisible();
  await expect(page.locator('#page-title')).toBeFocused();
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#page-title')).toBeFocused();
  await expect(page).toHaveURL(/#calculations$/);
  await page.goBack();
  await expect(page.locator('#page-library')).toBeVisible();
  await page.goForward();
  await expect(page.locator('#page-calculations')).toBeVisible();
  await page.goto('/#resource-stack');
  await expect(page.locator('#page-guild-card')).toBeVisible();
});

test('nomes personalizados e remoções atualizam a navegação sem apagar dados', async ({ page }) => {
  await page.goto('/#equipment');
  const original = JSON.parse(await snapshot(page));
  await page.locator('#btn-edit-names').click();
  await page.locator('[data-name-input="section:armory"]').fill('Minhas armas');
  await page.locator('[data-name-hidden="section:equipment"]').check();
  await page.getByRole('button', { name: 'Aplicar alterações', exact: true }).click();
  await expect(page.locator('#page-armory')).toBeVisible();
  await expect(page.locator('#page-title')).toHaveText('Minhas armas');
  await expect(page.locator('.equipment-navigation [href="#equipment"]')).toBeHidden();
  await openPage(page, 'guild-card');
  await page.locator('.guild-nav__link[href="#equipment"]').click();
  await expect(page.locator('#page-armory')).toBeVisible();
  await page.locator('#btn-edit-names').click();
  for (const key of ['armory', 'library']) await page.locator(`[data-name-hidden="section:${key}"]`).check();
  await page.getByRole('button', { name: 'Aplicar alterações', exact: true }).click();
  await expect(page.locator('#page-guild-card')).toBeVisible();
  await expect(page.locator('.guild-nav__link[href="#equipment"]')).toBeHidden();
  await expect(page.locator('#save-indicator-text')).toHaveText('Salvo');
  expect(JSON.parse(await snapshot(page)).character).toEqual(original.character);
});

for (const width of [320, 390, 768]) {
  test(`páginas e recursos respeitam o espaço do menu em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    const current = page.locator('[data-res-current="hp"]');
    const before = await current.boundingBox();
    await current.fill('123456789');
    expect((await current.boundingBox()).width).toBeGreaterThan(before.width);
    await current.fill('9'.repeat(80));
    const bounds = await current.evaluate(input => {
      const values = input.closest('.resource__values');
      const fields = [...values.querySelectorAll('input')].map(el => el.getBoundingClientRect());
      return { limit: values.getBoundingClientRect().right, current: fields[0].right, maximum: fields[1].left, end: fields[1].right };
    });
    expect(bounds.current).toBeLessThanOrEqual(bounds.maximum);
    expect(bounds.end).toBeLessThanOrEqual(bounds.limit + 1);
    await current.fill('10');
    for (const key of ['guild-card', 'dnd-rules', 'equipment', 'armory', 'library', 'records', 'calculations', 'temporal']) {
      await openPage(page, key);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), key).toBe(true);
      const nav = await page.locator('.guild-nav').boundingBox();
      const content = await page.locator(`#page-${key}`).boundingBox();
      expect(nav.x + nav.width).toBeLessThan(content.x);
      await expect(page.getByRole('button', { name: 'Configurações', exact: true })).toBeInViewport();
    }
  });
}

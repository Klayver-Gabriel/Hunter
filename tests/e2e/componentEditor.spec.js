import { test, expect } from '@playwright/test';
import { openPage } from './helpers/navigation.js';

const editor = page => page.locator('#component-editor');
const field = (page, name) => editor(page).locator(`[name="${name}"]`);
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('hunterscodex:sheet:v1')));

test('double click opens the relevant popup for every numeric component family', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const cases = [
    ['guild-card', 'attribute:int'], ['guild-card', 'resource:atp'], ['guild-card', 'resource:hp'],
    ['dnd-rules', 'indicator:proficiency'], ['dnd-rules', 'skill:acrobatics'], ['dnd-rules', 'save:des'],
    ['dnd-rules', 'metric:armor'], ['dnd-rules', 'metric:initiative'], ['dnd-rules', 'metric:passive'],
    ['dnd-rules', 'metric:hp'], ['dnd-rules', 'metric:dt'], ['armory', 'attack:bonus'], ['armory', 'attack:damage'], ['equipment', 'armor:total']
  ];
  for (const [section, id] of cases) {
    await openPage(page, section);
    await page.locator(`[data-calculation-target="${id}"]`).dblclick();
    await expect(editor(page)).toBeVisible(); await expect(page.locator('#component-save')).toBeEnabled();
    await expect(field(page, 'mode')).toHaveValue('default');
    if (id === 'skill:acrobatics') await expect(field(page, 'parameter:ability')).toBeVisible();
    if (id === 'metric:armor') await expect(field(page, 'parameter:dnd.initiative.buffs')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator(`[data-calculation-target="${id}"]`)).toBeFocused();
  }
  await openPage(page, 'dnd-rules'); await page.locator('#skill-template-select').selectOption('tormenta20');
  await page.locator('[data-calculation-target="skill:t20_luta"]').dblclick();
  await expect(field(page, 'parameter:ability')).toHaveValue('for'); await page.locator('#component-cancel').click();
  expect(errors).toEqual([]);
});

test('cancel leaves names and rules intact; keyboard saves and restores focus after render', async ({ page }) => {
  await page.goto('/'); const original = await saved(page);
  const label = page.locator('[data-calculation-target="attribute:int"]');
  await label.click(); await expect(editor(page)).not.toBeVisible();
  await label.focus(); await page.keyboard.press('Enter');
  await field(page, 'name').fill('Intelecto'); await field(page, 'mode').selectOption('formula'); await field(page, 'formula').fill('18');
  await expect(page.locator('#component-preview')).toHaveText('Resultado: 18');
  await page.locator('#component-cancel').click(); expect(await saved(page)).toEqual(original);
  await label.focus(); await page.keyboard.press('Space');
  await field(page, 'name').fill('Intelecto'); await field(page, 'mode').selectOption('formula'); await field(page, 'formula').fill('18');
  await page.locator('#component-save').click();
  await expect(label).toHaveText('Intelecto'); await expect(label).toBeFocused();
  await expect(page.locator('[data-attr="int"]')).toHaveValue('18'); await expect(page.locator('[data-attr="int"]')).toHaveAttribute('readonly', '');
  await expect(page.locator('#save-indicator-text')).toHaveText('Salvo'); await page.reload();
  await expect(page.locator('[data-attr="int"]')).toHaveValue('18'); await expect(label).toHaveText('Intelecto');
});

test('clicking resistance names and opening their editor never toggles proficiency', async ({ page }) => {
  await page.goto('/'); await openPage(page, 'dnd-rules');
  const name = page.locator('[data-calculation-target="save:con"]'), check = page.locator('[data-save="con"]');
  await name.click(); await expect(check).not.toBeChecked();
  await name.dblclick(); await expect(field(page, 'parameter:dnd.saves.con')).not.toBeChecked();
  await page.locator('#component-cancel').click(); await expect(check).not.toBeChecked();
});

test('proficiency changes propagate and resource references distinguish current from maximum', async ({ page }) => {
  await page.goto('/'); await openPage(page, 'dnd-rules');
  await page.locator('[data-skill-prof="acrobatics"]').check();
  await page.locator('[data-calculation-target="indicator:proficiency"]').dblclick();
  await field(page, 'mode').selectOption('formula'); await field(page, 'formula').fill('VALOR_PADRAO + 3'); await page.locator('#component-save').click();
  await expect(page.locator('#proficiency-value')).toHaveText('+5');
  await expect(page.locator('[data-skill-prof="acrobatics"]').locator('xpath=../..').locator('strong')).toHaveText('+5');
  await page.locator('[data-calculation-target="metric:armor"]').dblclick(); await field(page, 'mode').selectOption('formula');
  const current = await page.locator('#component-variable option').filter({ hasText: 'ATP: atual' }).getAttribute('value');
  const maximum = await page.locator('#component-variable option').filter({ hasText: 'ATP: máximo' }).getAttribute('value');
  expect(current).not.toBe(maximum);
  await field(page, 'formula').fill(`10 + ${current}`); await page.locator('#component-save').click();
  await openPage(page, 'guild-card'); await page.locator('[data-res-current="atp"]').fill('3'); await page.locator('[data-res-current="atp"]').press('Tab');
  await expect(page.locator('.metric-card--armor .metric-card__value')).toHaveText('13');
});

test('custom characteristics appear on the sheet and spells have a contextual DT popup', async ({ page }) => {
  await page.goto('/'); await openPage(page, 'calculations');
  const original = await saved(page);
  await page.locator('#btn-calculation-add').click(); await field(page, 'name').fill('Rascunho'); await page.locator('#component-cancel').click();
  expect(await saved(page)).toEqual(original);
  await page.locator('#btn-calculation-add').click();
  await field(page, 'name').fill('Reserva arcana'); await field(page, 'mode').selectOption('formula'); await field(page, 'formula').fill('INT * 2'); await page.locator('#component-save').click();
  await openPage(page, 'guild-card'); await expect(page.locator('#characteristic-values h3')).toHaveText('Reserva arcana'); await expect(page.locator('#characteristic-values strong')).toHaveText('20');
  await page.locator('#characteristic-values [data-calculation-target]').dblclick(); await expect(field(page, 'name')).toHaveValue('Reserva arcana'); await page.locator('#component-cancel').click();
  await openPage(page, 'records'); await page.locator('#tab-btn-spells').click(); await page.locator('[data-add="spells"]').click();
  await page.locator('#rules-dialog [name="title"]').fill('Luz'); await page.locator('#rule-save').click();
  await page.locator('.spell-dt [data-calculation-target]').dblclick();
  await expect(editor(page)).toBeVisible(); await expect(page.locator('#rules-dialog')).not.toBeVisible();
  await field(page, 'mode').selectOption('formula'); await field(page, 'formula').fill('16'); await page.locator('#component-save').click();
  await expect(page.locator('.spell-dt')).toContainText('16');
  await page.locator('.spell-dt [data-calculation-target]').focus(); await page.keyboard.press('Enter');
  await expect(editor(page)).toBeVisible(); await expect(page.locator('#rules-dialog')).not.toBeVisible(); await page.locator('#component-cancel').click();
  await page.locator('.spell-dt [data-edit-calculation]').focus(); await page.keyboard.press('Enter');
  await expect(editor(page)).toBeVisible(); await expect(page.locator('#rules-dialog')).not.toBeVisible(); await page.locator('#component-cancel').click();
});

test.describe('touch editor', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('edit button opens a compact popup and permits persistent negative balance', async ({ page }) => {
    await page.goto('/'); await page.locator('[data-edit-calculation="resource:atp"]').tap();
    await expect(editor(page)).toBeVisible(); await field(page, 'nonNegative').uncheck();
    await page.locator('#component-save').tap();
    await page.locator('[data-res-current="atp"]').fill('-4'); await page.locator('[data-res-current="atp"]').press('Tab');
    await expect(page.locator('[data-res-current="atp"]')).toHaveValue('-4');
    await page.locator('[data-edit-calculation="resource:atp"]').tap();
    expect(await editor(page).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.locator('#component-cancel').tap();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('#save-indicator-text')).toHaveText('Salvo'); await page.reload();
    await expect(page.locator('[data-res-current="atp"]')).toHaveValue('-4');
  });
});

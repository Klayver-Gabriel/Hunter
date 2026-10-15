import { test, expect } from './helpers/localFixture.js';
import { openPage } from './helpers/navigation.js';
import { openSheetDialog } from './helpers/sheets.js';

test('Fichas é a primeira aba e reúne os popups de salvar e abrir', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.guild-nav__links > a').first()).toHaveText('Fichas');
  await expect(page.locator('#btn-export, #btn-import')).toHaveCount(0);
  await page.locator('[data-field="info.name"]').fill('Minha ficha');
  await page.locator('[data-field="info.name"]').press('Enter');
  await openPage(page, 'sheets');
  await expect(page.locator('[data-sheet-page]:visible')).toHaveCount(1);
  await expect(page.locator('#sheet-current-title')).toHaveText('Minha ficha');
  await expect(page.locator('#sheet-storage')).toContainText('neste navegador');
  await page.locator('#btn-save-sheet').click();
  await expect(page.getByRole('dialog', { name: 'Salvar ficha', exact: true })).toBeVisible();
  await expect(page.locator('[data-cloud="save"]')).toBeDisabled();
  await expect(page.locator('[data-cloud="export"]')).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('#btn-save-sheet')).toBeFocused();
  await page.locator('#btn-save-sheet').click();
  const downloadEvent = page.waitForEvent('download'); await page.locator('[data-cloud="export"]').click();
  const download = await downloadEvent, stream = await download.createReadStream(), chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString()).character.info.name).toBe('Minha ficha');
  await expect(page.locator('#save-sheet-dialog')).not.toBeVisible();
  await expect(page.locator('#btn-save-sheet')).toBeFocused();
});

test('Abrir ficha aceita JSON pelo seletor e preserva a ficha em arquivo inválido no celular', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 }); await page.goto('/');
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('hunterscodex:sheet:v1')));
  await openSheetDialog(page, 'open');
  await expect(page.locator('[data-cloud="open"]')).toBeDisabled();
  const invalidChoice = page.waitForEvent('filechooser'); await page.locator('#btn-open-json').click();
  await (await invalidChoice).setFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(page.locator('#open-sheet-dialog .sheet-feedback')).not.toBeEmpty();
  await expect(page.locator('#open-sheet-dialog')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hunterscodex:sheet:v1')))).toEqual(original);
  const changed = structuredClone(original); changed.character.info.name = 'Arquivo no celular';
  const validChoice = page.waitForEvent('filechooser'); await page.locator('#btn-open-json').click();
  await (await validChoice).setFiles({ name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(changed)) });
  await expect(page.locator('#open-sheet-dialog')).not.toBeVisible();
  await expect(page.locator('[data-field="info.name"]')).toHaveText('Arquivo no celular');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hunterscodex:sheet:backup')))).toEqual(original);
  await openSheetDialog(page, 'save');
  expect(await page.locator('#save-sheet-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

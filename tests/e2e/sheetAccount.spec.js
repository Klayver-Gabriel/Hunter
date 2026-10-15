import { test, expect } from '@playwright/test';
import { mockCloud } from './helpers/mockCloud.js';
import { openPage } from './helpers/navigation.js';
import { openSheetDialog } from './helpers/sheets.js';

test('salvar na conta cria a ficha vazia uma vez e autosave atualiza a mesma ficha', async ({ page }) => {
  const cloud = await mockCloud(page); await page.goto('/');
  await openSheetDialog(page, 'save');
  expect(cloud.records.size).toBe(0);
  await page.locator('[data-cloud="save"]').click();
  await expect(page.locator('#save-sheet-dialog')).not.toBeVisible();
  await expect(page.locator('#save-indicator-text')).toHaveText('Salvo');
  expect(cloud.records.size).toBe(1); expect(cloud.writes).toBe(1);
  await page.locator('#btn-save-sheet').click(); await page.locator('[data-cloud="save"]').click();
  await expect(page.locator('#save-sheet-dialog')).not.toBeVisible();
  expect(cloud.writes).toBe(1);
  await openPage(page, 'guild-card');
  await page.locator('[data-field="info.name"]').fill('Salva na conta'); await page.locator('[data-field="info.name"]').press('Enter');
  await expect(page.locator('#save-indicator-text')).toHaveText('Salvo');
  expect(cloud.records.size).toBe(1); expect(cloud.records.get('1').document.character.info.name).toBe('Salva na conta');
  await openSheetDialog(page, 'open');
  await expect(page.locator('#cloud-sheets option').last()).toHaveText('Salva na conta');
  await page.locator('[data-cloud="open"]').click();
  await expect(page.locator('#open-sheet-dialog')).not.toBeVisible();
  await expect(page.locator('[data-field="info.name"]')).toHaveText('Salva na conta');
});

test('falha mantém o popup aberto e JSON pode ser baixado sem salvar na conta', async ({ page }) => {
  const cloud = await mockCloud(page); await page.goto('/'); cloud.fail = 503;
  await openSheetDialog(page, 'save'); await page.locator('[data-cloud="save"]').click();
  await expect(page.locator('#save-sheet-dialog .sheet-feedback')).toContainText('Falha');
  await expect(page.locator('#save-sheet-dialog')).toBeVisible();
  expect(cloud.records.size).toBe(0);
  const downloadEvent = page.waitForEvent('download'); await page.locator('[data-cloud="export"]').click();
  expect((await downloadEvent).suggestedFilename()).toContain('hunterscodex');
  expect(cloud.writes).toBe(0);
  cloud.fail = null;
  await page.locator('#btn-save-sheet').click(); await page.locator('[data-cloud="save"]').click();
  await expect(page.locator('#save-sheet-dialog')).not.toBeVisible();
  expect(cloud.records.size).toBe(1); expect(cloud.writes).toBe(1);
});

test('Abrir ficha valida JSON e solicita confirmação antes de criar a ficha na conta', async ({ page }) => {
  const cloud = await mockCloud(page); await page.goto('/'); await openSheetDialog(page, 'open');
  const legacy = { info: { name: 'Arquivo da conta' }, attributes: { for: 14 } };
  const file = { name: 'account.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)) };
  page.once('dialog', dialog => dialog.dismiss()); await page.locator('#file-import').setInputFiles(file);
  await expect(page.locator('#file-import')).toHaveValue('');
  expect(cloud.records.size).toBe(0); await expect(page.locator('#open-sheet-dialog')).toBeVisible();
  page.once('dialog', dialog => dialog.accept()); await page.locator('#file-import').setInputFiles(file);
  await expect(page.locator('#open-sheet-dialog')).not.toBeVisible();
  await expect(page.locator('[data-field="info.name"]')).toHaveText('Arquivo da conta');
  expect(cloud.records.size).toBe(1); expect(cloud.records.get('1').document.character.attributes.for).toBe(14);
  expect(await page.evaluate(() => localStorage.getItem('hunterscodex:sheet:v1'))).toBeNull();
  await openSheetDialog(page, 'open');
  await page.locator('#file-import').setInputFiles({ name: 'future.json', mimeType: 'application/json', buffer: Buffer.from('{"formatVersion":99}') });
  await expect(page.locator('#open-sheet-dialog .sheet-feedback')).not.toBeEmpty();
  await expect(page.locator('#open-sheet-dialog')).toBeVisible();
  expect(cloud.records.size).toBe(1);
});

import { test, expect } from '@playwright/test';
import { openPage } from './helpers/navigation.js';
import { exportFile, newSheet, openSheetDialog, saveInAccount } from './helpers/sheets.js';

import { mockCloud } from './helpers/mockCloud.js';

test('remote CRUD, failed save, retry, copy conflict and export preserve browser data', async ({ page }) => {
  const cloud = await mockCloud(page);
  await page.addInitScript(() => localStorage.setItem('hunterscodex:sheet:v1', 'private-local-original'));
  await page.goto('/'); await expect(page.locator('#cloud-account')).toContainText('Conta A');
  await newSheet(page); await expect(page.locator('#save-indicator-text')).toHaveText('Salvo');
  await page.locator('[data-field="info.name"]').fill('Remota');
  await page.locator('[data-field="info.name"]').press('Enter');
  await expect(page.locator('#save-indicator-text')).toHaveText('Salvo');
  expect(await page.evaluate(() => localStorage.getItem('hunterscodex:sheet:v1'))).toBe('private-local-original');
  cloud.fail = 503;
  await page.locator('[data-field="info.name"]').fill('Recuperável');
  await page.locator('[data-field="info.name"]').press('Enter');
  await expect(page.locator('#save-indicator-text')).toHaveText('Erro ao salvar');
  cloud.fail = null; await saveInAccount(page);
  await expect(page.locator('#save-indicator-text')).toHaveText('Salvo');
  expect(cloud.records.get('1').document.character.info.name).toBe('Recuperável');
  cloud.fail = 409; await page.locator('[data-field="info.name"]').fill('<img src=x onerror=alert(1)>');
  await page.locator('[data-field="info.name"]').press('Enter');
  await expect(page.locator('#save-indicator-text')).toHaveText('Conflito de versão');
  cloud.fail = null; await saveInAccount(page, 'copy');
  await expect(page.locator('#save-indicator-text')).toHaveText('Salvo');
  expect(cloud.records.size).toBe(2); expect(cloud.records.get('1').document.character.info.name).toBe('Recuperável');
  await expect(page.locator('#cloud-sheets option').last()).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.cloud-panel img')).toHaveCount(0);
  const download = await exportFile(page);
  expect(download.suggestedFilename()).toContain('hunterscodex');
  await openPage(page, 'sheets'); page.once('dialog', dialog => dialog.accept()); await page.locator('[data-cloud="delete"]').click();
  await expect(page.locator('#save-indicator-text')).toHaveText('Nenhuma ficha remota aberta'); expect(cloud.records.size).toBe(1);
  await openSheetDialog(page, 'open'); await page.locator('#cloud-sheets').selectOption('1'); await page.locator('[data-cloud="open"]').click();
  await expect(page.locator('[data-field="info.name"]')).toHaveText('Recuperável');
});

test('account change blocks pending saves and hides sheets', async ({ page }) => {
  const cloud = await mockCloud(page);
  await page.goto('/'); await newSheet(page); await expect(page.locator('#save-indicator-text')).toHaveText('Salvo');
  cloud.user = { id: 'account-b', name: 'Conta B' };
  await page.locator('[data-field="info.name"]').fill('Conta A privada');
  await page.locator('[data-field="info.name"]').press('Enter');
  await expect(page.locator('#save-indicator-text')).toHaveText('Entre novamente para salvar');
  expect(cloud.records.get('1').document.character.info.name).not.toBe('Conta A privada');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('html')).toHaveClass(/remote-locked/); await expect(page.locator('[data-field="info.name"]')).not.toBeVisible();
});

test('logout clears the displayed private document without copying it into local storage', async ({ page }) => {
  await mockCloud(page); await page.goto('/');
  await newSheet(page); await expect(page.locator('#save-indicator-text')).toHaveText('Salvo');
  await page.locator('[data-field="info.name"]').fill('Privada remota'); await page.locator('[data-field="info.name"]').press('Enter');
  await expect(page.locator('#save-indicator-text')).toHaveText('Salvo');
  await openPage(page, 'sheets'); await page.locator('[data-cloud="logout"]').click();
  await expect(page.locator('#login-screen')).toBeVisible();
  await expect(page.locator('#app')).not.toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('hunterscodex:sheet:v1'))).toBeNull();
});

test('local migration requires selection/confirmation and retains original on remote failure', async ({ page }) => {
  const cloud = await mockCloud(page);
  await page.addInitScript(() => localStorage.setItem('hunterscodex:sheet:v1', JSON.stringify({ info: { name: 'Ficha legada' }, attributes: { for: 12 } })));
  await page.goto('/'); await expect(page.locator('#cloud-account')).toContainText('Conta A'); expect(cloud.records.size).toBe(0);
  await openSheetDialog(page, 'open'); await page.locator('[data-cloud="migrate"]').click();
  await expect(page.locator('.cloud-import')).toContainText('Ficha legada'); expect(cloud.records.size).toBe(0);
  await page.locator('.cloud-import input').check(); cloud.fail = 503;
  await page.getByRole('button', { name: 'Confirmar importação das selecionadas' }).click();
  await expect(page.locator('.cloud-import [role="status"]')).toContainText('Falha');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('hunterscodex:sheet:v1'))).info.name).toBe('Ficha legada');
  cloud.fail = null; await page.getByRole('button', { name: 'Confirmar importação das selecionadas' }).click();
  await expect(page.locator('.cloud-import')).toHaveCount(0); expect(cloud.records.size).toBe(1);
});

test('unavailable session API requires explicit choice before using or modifying local data', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hunterscodex:sheet:v1', JSON.stringify({ info: { name: 'Local antiga' }, attributes: { for: 12 } })));
  await page.route('**/api/session', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
  await page.goto('/'); await expect(page.locator('#login-status')).toContainText('Conexão indisponível');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('hunterscodex:sheet:v1'))).info.name).toBe('Local antiga');
  await page.locator('#login-local').click(); await expect(page.locator('[data-field="info.name"]')).toHaveText('Local antiga');
  await expect(page.locator('#cloud-account')).toContainText('Modo local');
});

test('expired login redirects in the same tab and restores the pending edit only to its original account', async ({ page, context }) => {
  const cloud = await mockCloud(page);
  await page.route('**/auth/google', async route => {
    cloud.user = { id: 'account-a', name: 'Conta A' };
    await route.fulfill({ status: 303, headers: { location: '/?auth=complete' }, body: '' });
  });
  await page.goto('/'); await newSheet(page); await expect(page.locator('#save-indicator-text')).toHaveText('Salvo');
  cloud.user = null;
  await page.locator('[data-field="info.name"]').fill('Edição preservada'); await page.locator('[data-field="info.name"]').press('Enter');
  await expect(page.locator('#save-indicator-text')).toHaveText('Entre novamente para salvar');
  await openPage(page, 'sheets'); await page.locator('[data-cloud="login"]').click();
  await expect(page.locator('[data-field="info.name"]')).toHaveText('Edição preservada');
  await expect(page.locator('#save-indicator-text')).toHaveText('Salvo');
  expect(cloud.records.get('1').document.character.info.name).toBe('Edição preservada');
  expect(await page.evaluate(() => sessionStorage.getItem('cheets:login-recovery:v1'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('hunterscodex:sheet:v1'))).toBeNull();
  expect(context.pages()).toHaveLength(1); await expect(page.locator('[data-cloud="login"]')).not.toBeVisible();
});

test('signing into another account does not replay a previous account draft', async ({ page }) => {
  const cloud = await mockCloud(page);
  await page.route('**/auth/google', async route => {
    cloud.user = { id: 'account-b', name: 'Conta B' };
    await route.fulfill({ status: 303, headers: { location: '/?auth=complete' }, body: '' });
  });
  await page.goto('/'); await newSheet(page); await expect(page.locator('#save-indicator-text')).toHaveText('Salvo');
  cloud.user = null;
  await page.locator('[data-field="info.name"]').fill('Rascunho privado de A'); await page.locator('[data-field="info.name"]').press('Enter');
  await expect(page.locator('#save-indicator-text')).toHaveText('Entre novamente para salvar');
  const writes = cloud.writes; await openPage(page, 'sheets'); await page.locator('[data-cloud="login"]').click();
  await expect(page.locator('#cloud-account')).toContainText('Conta B');
  await expect(page.locator('[data-field="info.name"]')).not.toHaveText('Rascunho privado de A');
  expect(cloud.writes).toBe(writes);
});

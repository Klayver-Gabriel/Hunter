import { expect } from '@playwright/test';
import { openPage } from './navigation.js';

export async function openSheetDialog(page, kind) {
  await openPage(page, 'sheets');
  await page.locator(`#btn-${kind}-sheet`).click();
  await expect(page.locator(`#${kind}-sheet-dialog`)).toBeVisible();
}
export async function newSheet(page) {
  await openPage(page, 'sheets'); await page.locator('#btn-new').click();
  await expect(page.locator('#page-guild-card')).toBeVisible();
}
export async function saveInAccount(page, action = 'save') {
  const previous = await page.locator('html').getAttribute('data-active-page');
  await openSheetDialog(page, 'save'); await page.locator(`[data-cloud="${action}"]`).click();
  await expect(page.locator('#save-sheet-dialog')).not.toBeVisible();
  await openPage(page, previous);
}
export async function exportFile(page) {
  const previous = await page.locator('html').getAttribute('data-active-page');
  await openSheetDialog(page, 'save');
  const downloadEvent = page.waitForEvent('download'); await page.locator('[data-cloud="export"]').click();
  const download = await downloadEvent;
  await expect(page.locator('#save-sheet-dialog')).not.toBeVisible();
  await openPage(page, previous); return download;
}
export async function importFile(page, file) {
  const previous = await page.locator('html').getAttribute('data-active-page');
  await openSheetDialog(page, 'open'); await page.locator('#file-import').setInputFiles(file);
  await expect(page.locator('#file-import')).toHaveValue('');
  if (await page.locator('#open-sheet-dialog').isVisible()) await page.locator('#open-sheet-dialog [data-close]').click();
  await openPage(page, previous);
}

import { expect } from '@playwright/test';

export async function openPage(page, key) {
  if (await page.locator('html').getAttribute('data-active-page') === key) return;
  if (key === 'calculations') await page.locator('[data-page-key="calculations"]').click();
  else if (['armory', 'library'].includes(key)) {
    if (!await page.locator('.equipment-navigation').isVisible()) await page.locator('.guild-nav__link[href="#equipment"]').click();
    await page.locator(`.equipment-navigation [href="#${key}"]`).click();
  } else await page.locator(`.guild-nav__link[href="#${key}"]`).click();
  await expect(page.locator(`#page-${key}`)).toBeVisible();
}

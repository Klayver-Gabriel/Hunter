import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => sessionStorage.setItem('cheets:entry-mode', 'local'));
    await use(page);
  }
});
export { expect };

import { test, expect } from '@playwright/test';

async function saved(page) {
  await expect(page.locator('#save-indicator-text')).toHaveText('Salvo');
  return page.evaluate(() => JSON.parse(localStorage.getItem('hunterscodex:sheet:v1')));
}
async function importDocument(page, document) {
  await page.locator('#file-import').setInputFiles({ name: 'components.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) });
}
async function remove(page, id, accept = true) {
  page.once('dialog', dialog => accept ? dialog.accept() : dialog.dismiss());
  await page.locator(`[data-remove-component="${id}"]`).click();
}
async function restore(page, id) {
  await page.locator('#btn-edit-names').click();
  await page.locator(`[data-name-hidden="${id}"]`).uncheck();
  await page.getByRole('button', { name: 'Aplicar alterações', exact: true }).click();
}

test('remove recursos padrão com confirmação, persiste e restaura sem perder valores', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-res-current="hp"]').fill('7');
  await page.locator('[data-res-current="hp"]').press('Tab');
  const original = await saved(page);
  await page.locator('#btn-remove-components').click();
  await remove(page, 'resource:hp', false);
  await expect(page.locator('.resource--hp')).toBeVisible();
  expect(await saved(page)).toEqual(original);
  await remove(page, 'resource:hp');
  await expect(page.locator('.resource--hp')).toBeHidden();
  await expect(page.locator('#btn-remove-components')).toBeFocused();
  const removed = await saved(page);
  expect(removed.character).toEqual(original.character);
  expect(removed.sheetAppearance.components['resource:hp'].hidden).toBe(true);
  await page.reload();
  await expect(page.locator('.resource--hp')).toBeHidden();
  await restore(page, 'resource:hp');
  await expect(page.locator('[data-res-current="hp"]')).toHaveValue('7');
  expect((await saved(page)).character).toEqual(original.character);
});

test('remoção de seções expande a coluna restante e restaura exclusões independentes', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-remove-components').click();
  await remove(page, 'attribute:con');
  await remove(page, 'section:attributes');
  await page.locator('#btn-remove-components').click();
  const grid = await page.locator('.sheet-grid').boundingBox();
  const resource = await page.locator('#resources').boundingBox();
  expect(Math.abs(resource.width - grid.width)).toBeLessThan(2);
  await restore(page, 'section:attributes');
  await expect(page.locator('#attributes')).toBeVisible();
  await expect(page.locator('[data-attr="con"]')).toBeHidden();
  await restore(page, 'attribute:con');
  await expect(page.locator('[data-attr="con"]')).toHaveValue('10');
});

test('importação e exportação mantêm remoções e eliminam grupos vazios', async ({ page }) => {
  await page.goto('/'); const original = await saved(page);
  const document = structuredClone(original);
  const ids = await page.locator('[data-component-label]').evaluateAll(elements => elements.map(el => el.dataset.componentLabel));
  ids.filter(id => id.startsWith('attribute:') || id.startsWith('save:') || id.startsWith('skill:')).forEach(id => {
    document.sheetAppearance.components[id] = { hidden: true };
  });
  document.sheetAppearance.components['section:armory'] = { hidden: true };
  await importDocument(page, document);
  await expect(page.locator('#attributes')).toBeHidden();
  await expect(page.locator('.rules-layout')).toBeHidden();
  await expect(page.locator('.guild-nav a[href="#armory"]')).toHaveAttribute('data-component-hidden', '');
  expect((await page.locator('#resources').boundingBox()).width).toBeCloseTo((await page.locator('.sheet-grid').boundingBox()).width, 0);
  const downloadEvent = page.waitForEvent('download'); await page.locator('#btn-export').click();
  const stream = await (await downloadEvent).createReadStream(); const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString());
  expect(exported).toEqual(document);
  await importDocument(page, original);
  await expect(page.locator('#attributes')).toBeVisible();

  await expect(page.locator('.rules-layout')).toBeVisible();
  await expect(page.locator('.guild-nav a[href="#armory"]')).not.toHaveAttribute('data-component-hidden', '');
});

test('excluir abas seleciona a próxima e remover resistência não marca proficiência', async ({ page }) => {
  await page.goto('/'); const original = await saved(page);
  await page.locator('#btn-remove-components').click();

  await remove(page, 'save:con');
  expect((await saved(page)).character.dnd.saves).toEqual(original.character.dnd.saves);

  await remove(page, 'tab:powers');
  await expect(page.locator('#tab-btn-spells')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#tab-spells')).toBeVisible();
  await remove(page, 'tab:spells');
  await remove(page, 'tab:journal');
  await expect(page.locator('#records')).toBeHidden();
  await restore(page, 'tab:powers');

  await expect(page.locator('#tab-btn-powers')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#tab-powers')).toBeVisible();
});

test.describe('remoção no celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('botões por toque removem componentes e o layout não transborda', async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-remove-components').tap();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const skillName = await page.locator('[data-component-label="skill:acrobatics"]').boundingBox();
    expect(skillName.width).toBeGreaterThan(55);

    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-remove-component="resource:hp"]').tap();
    await expect(page.locator('.resource--hp')).toBeHidden();
    await page.locator('#btn-remove-components').tap();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('#btn-edit-names').tap();
    await page.locator('[data-name-hidden="resource:hp"]').uncheck();
    await page.getByRole('button', { name: 'Aplicar alterações', exact: true }).tap();
    await expect(page.locator('.resource--hp')).toBeVisible();
  });
});

import { test, expect } from '@playwright/test';
import { openPage } from './helpers/navigation.js';

async function importSheet(page, document, name = 'sheet.json') {
  await page.locator('#file-import').setInputFiles({
    name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document))
  });
}
async function savedDocument(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('hunterscodex:sheet:v1')));
}
async function exportSheet(page) {
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#btn-export').click();
  const stream = await (await downloadEvent).createReadStream();
  const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}

test('ficha permite editar nomes e mantém layout fixo', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#btn-theme')).toBeVisible();
  await expect(page.locator('#guild-card')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar componentes', exact: true })).toBeVisible();
  await expect(page.locator('#btn-customize, #customization-editor, #sheet-surface, .component-handle, .component-resize, .entity-fields')).toHaveCount(0);
  await expect(page.locator('#weapon-library [data-edit-weapon]')).toBeHidden();
  await openPage(page, 'library');
  await expect(page.locator('#weapon-library [data-edit-weapon]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('tema, edição de dados e recálculo sobrevivem a recarga', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' }); await page.goto('/');
  await expect(page.locator('#btn-theme')).toHaveAttribute('aria-label', 'Ativar modo claro');
  await page.locator('#btn-theme').click();
  await page.getByRole('spinbutton', { name: 'CON', exact: true }).fill('14');
  await page.getByRole('spinbutton', { name: 'CON', exact: true }).press('Tab');
  await expect(page.getByRole('spinbutton', { name: 'HP máximo', exact: true })).toHaveValue('12');
  await expect(page.locator('#save-indicator-text')).toHaveText('Salvo');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('[data-attr="con"]')).toHaveValue('14');
});

test('rótulos legados são aplicados sem restaurar cores ou posições', async ({ page }) => {
  await page.goto('/'); const document = await savedDocument(page);
  const originalStyle = await page.locator('.resource--hp').evaluate(el => ({ position: getComputedStyle(el).position, color: getComputedStyle(el).color, css: el.getAttribute('style') }));
  document.sheetAppearance.components['resource:hp'] = { label: 'Vitalidade', colors: { light: { accent: '#123456' } } };
  document.sheetAppearance.layouts.desktop['resource:hp'] = { parent: 'section:attributes', x: 0, y: 100, w: 50, h: 80 };
  document.sheetAppearance.layouts.mobile['resource:hp'] = { parent: 'root', x: 0, y: 200, w: 100, h: 80 };
  await importSheet(page, document);
  await expect(page.locator('#resource-stack [data-res-name="hp"]')).toHaveText('Vitalidade');
  expect(await page.locator('.resource--hp').evaluate(el => ({ position: getComputedStyle(el).position, color: getComputedStyle(el).color, css: el.getAttribute('style') }))).toEqual(originalStyle);
  await expect(page.locator('#sheet-surface, [data-component-id]')).toHaveCount(0);
  await page.locator('[data-res-current="hp"]').fill('7'); await page.locator('[data-res-current="hp"]').press('Tab');
  await expect(page.locator('#save-indicator-text')).toHaveText('Salvo');
  const exported = await exportSheet(page);
  expect(exported.sheetAppearance).toEqual(document.sheetAppearance);
  expect(exported.character.resources.find(resource => resource.id === 'hp').current).toBe(7);
  expect(exported.userPreferences).toBeUndefined();
  await page.reload();
  await expect(page.locator('[data-res-current="hp"]')).toHaveValue('7');
  expect((await savedDocument(page)).sheetAppearance).toEqual(document.sheetAppearance);
});

async function renameComponent(page, id, label) {
  await page.getByRole('button', { name: 'Editar componentes', exact: true }).click();
  await page.locator(`[data-name-input="${id}"]`).fill(label);
  await page.getByRole('button', { name: 'Aplicar alterações', exact: true }).click();
}

test('nomes de seções e campos persistem sem alterar personagem ou cálculos', async ({ page }) => {
  await page.goto('/');
  const original = await savedDocument(page);
  await renameComponent(page, 'section:attributes', 'Características');
  await renameComponent(page, 'attribute:con', 'Vigor');
  await renameComponent(page, 'resource:hp', 'Vitalidade');
  await renameComponent(page, 'skill:acrobatics', 'Equilíbrio');
  await expect(page.getByRole('heading', { name: 'Características', exact: true })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Vigor', exact: true })).toHaveValue('10');
  await openPage(page, 'dnd-rules');
  await expect(page.getByRole('checkbox', { name: 'Equilíbrio: expertise', exact: true })).toBeVisible();
  await openPage(page, 'guild-card');
  await expect(page.locator('#save-indicator-text')).toHaveText('Salvo');
  const exported = await exportSheet(page);
  expect(exported.character).toEqual(original.character);
  expect(exported.sheetAppearance.layouts).toEqual(original.sheetAppearance.layouts);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Características', exact: true })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Vitalidade máximo', exact: true })).toHaveValue('10');
  await page.getByRole('spinbutton', { name: 'Vigor', exact: true }).fill('14');
  await page.getByRole('spinbutton', { name: 'Vigor', exact: true }).press('Tab');
  await expect(page.getByRole('spinbutton', { name: 'Vitalidade máximo', exact: true })).toHaveValue('12');
  await importSheet(page, original);
  await expect(page.locator('#attributes h2')).toHaveText('Atributos');
  await importSheet(page, exported);
  await expect(page.locator('#attributes h2')).toHaveText('Características');
});

test('editor limita alterações a nomes existentes, valida entrada e permite cancelar ou restaurar', async ({ page }) => {
  await page.goto('/');
  const original = await savedDocument(page);
  await page.locator('#btn-edit-names').click();
  await expect(page.locator('#name-editor [type="color"], #name-editor [type="number"]')).toHaveCount(0);
  await expect(page.locator('[data-name-category="skills"]')).toHaveText('Perícias');
  await expect(page.locator('[data-name-input="skill:acrobatics"]')).toHaveValue('Acrobacia');
  await page.locator('[data-name-input="section:attributes"]').fill('   ');
  await page.getByRole('button', { name: 'Aplicar alterações', exact: true }).click();
  await expect(page.locator('#name-editor')).toBeVisible();
  expect(await savedDocument(page)).toEqual(original);
  await page.locator('[data-name-input="section:attributes"]').fill('Não salvar');
  await page.locator('#name-cancel').click();
  await expect(page.locator('#attributes h2')).toHaveText('Atributos');
  await expect(page.locator('#btn-edit-names')).toBeFocused();
  await renameComponent(page, 'section:attributes', '<img src=x onerror=alert(1)>');
  await expect(page.locator('#attributes h2')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#attributes h2 img')).toHaveCount(0);
  await page.locator('#btn-edit-names').click();
  await page.locator('[data-name-restore="section:attributes"]').click();
  await page.locator('[data-name-input="section:attributes"]').press('Escape');
  await expect(page.locator('#attributes h2')).toHaveText('<img src=x onerror=alert(1)>');
  await page.locator('#btn-edit-names').click();
  await page.locator('[data-name-restore="section:attributes"]').click();
  await page.getByRole('button', { name: 'Aplicar alterações', exact: true }).click();
  await expect(page.locator('#attributes h2')).toHaveText('Atributos');
  await expect(page.locator('#save-indicator-text')).toHaveText('Salvo');
  expect((await savedDocument(page)).sheetAppearance.components['section:attributes']).toBeUndefined();
});

test('edição normal de arma pelo modal atualiza ataque e dano', async ({ page }) => {
  await page.goto('/'); await openPage(page, 'library'); await page.locator('[data-edit-weapon="weapon_longsword_starter"]').click();
  await expect(page.locator('#modal')).toBeVisible();
  await page.locator('#mf-damageDice').fill('3d8'); await page.locator('#modal-save').click();
  await expect(page.locator('#attack-panel .attack-result').nth(1).locator('strong')).toHaveText('3d8');
  await openPage(page, 'guild-card');
  await page.locator('[data-attr="for"]').fill('18'); await page.locator('[data-attr="for"]').press('Tab');
  await expect(page.locator('#attack-panel .attack-result').first().locator('strong')).toHaveText('+6');
});

test('recursos e registros continuam editáveis e persistidos', async ({ page }) => {
  await page.goto('/'); await page.locator('#btn-add-resource').click();
  await expect(page.locator('.resource')).toHaveCount(5);
  const resource = page.locator('.resource--custom');
  await resource.locator('[data-res-name]').fill('Foco'); await resource.locator('[data-res-name]').press('Tab');
  await resource.locator('[data-res-current]').fill('6'); await resource.locator('[data-res-current]').press('Tab');
  await openPage(page, 'records');
  await page.locator('[data-add="powers"]').click();
  await page.locator('#modal-title-input').fill('Postura defensiva');
  await page.locator('#mf-description').fill('Reduz o dano recebido.');
  await page.locator('#modal-save').click();
  await expect(page.locator('#tab-powers .entry-card__title')).toHaveText('Postura defensiva');
  await expect(page.locator('#save-indicator-text')).toHaveText('Salvo');
  await page.reload();
  await expect(page.locator('.resource--custom [data-res-name]')).toHaveText('Foco');
  await expect(page.locator('.resource--custom [data-res-current]')).toHaveValue('6');
  await expect(page.locator('#tab-powers .entry-card__title')).toHaveText('Postura defensiva');
});

test('corrupção preserva o original sem iniciar uma ficha padrão', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hunterscodex:sheet:v1', '{broken'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Não foi possível abrir sua ficha' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('hunterscodex:sheet:v1'))).toBe('{broken');
});

test('falha no autosave mantém dados editados para exportação e informa erro', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('Quota', 'QuotaExceededError'); }; });
  await page.locator('[data-attr="con"]').fill('14'); await page.locator('[data-attr="con"]').press('Tab');
  await expect(page.locator('#save-indicator-text')).toHaveText('Erro ao salvar');
  expect((await savedDocument(page)).character.attributes.con).toBe(10);
  const exported = await exportSheet(page);
  expect(exported.character.attributes.con).toBe(14);
  expect(exported.character.resources.find(resource => resource.id === 'hp').max).toBe(12);
});

test('importa legado e rejeita arquivo incompatível sem substituir a ficha', async ({ page }) => {
  await page.goto('/'); const original = (await savedDocument(page)).character;
  original.schemaVersion = 1; original.info.name = 'Caçador legado';
  await importSheet(page, original, 'legacy.json');
  await expect(page.locator('[data-field="info.name"]')).toHaveText('Caçador legado');
  const before = await savedDocument(page);
  page.once('dialog', dialog => dialog.accept());
  await importSheet(page, { formatVersion: 99 }, 'future.json');
  await expect(page.locator('[data-field="info.name"]')).toHaveText('Caçador legado');
  expect(await savedDocument(page)).toEqual(before);
});

test('recuperação aceita cópia válida e mantém backup do original', async ({ page }) => {
  await page.goto('/'); const valid = await savedDocument(page);
  await page.evaluate(() => localStorage.setItem('hunterscodex:sheet:v1', '{broken'));
  await page.reload(); await expect(page.getByRole('button', { name: 'Importar ficha recuperada' })).toBeVisible();
  await page.locator('#recovery-file').setInputFiles({ name: 'recovered.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(valid)) });
  await expect(page.locator('#btn-export')).toBeVisible();
  await expect(page.locator('[data-res-max="hp"]')).toHaveValue('10');
  expect(await page.evaluate(() => localStorage.getItem('hunterscodex:sheet:backup'))).toBe('{broken');
});

test.describe('celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('tema e edição de nomes funcionam por toque com layout fixo', async ({ page }) => {
    await page.goto('/');
    const button = await page.locator('#btn-theme').boundingBox(); expect(button.x).toBeGreaterThanOrEqual(0);
    const previousTheme = await page.locator('html').getAttribute('data-theme'); await page.locator('#btn-theme').tap();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', previousTheme);
    await page.locator('#btn-add-resource').tap(); await expect(page.locator('.resource')).toHaveCount(5);
    await expect(page.locator('#btn-customize, #customization-editor')).toHaveCount(0);
    await page.locator('#btn-edit-names').tap();
    await page.locator('[data-name-input="resource:hp"]').fill('Vitalidade');
    await page.getByRole('button', { name: 'Aplicar alterações', exact: true }).tap();
    await expect(page.getByRole('spinbutton', { name: 'Vitalidade máximo', exact: true })).toHaveValue('10');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

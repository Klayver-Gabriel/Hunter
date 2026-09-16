import { test, expect } from '@playwright/test';
const component = (page, id) => page.locator(`[data-component-id="${id}"]`);
async function select(page, id) { await page.locator('#editor-component').selectOption(id); }
async function rename(page, id, name) {
  await select(page, id); await page.locator('#editor-label').fill(name); await page.locator('#editor-label').press('Tab');
}
test('tema, edição de dados e recálculo sobrevivem a recarga', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ colorScheme: 'dark' }); await page.goto('/');
  await expect(page.locator('#btn-theme')).toHaveAttribute('aria-label', 'Ativar modo claro');
  await page.locator('#btn-theme').click();
  await page.locator('[data-attr="con"]').fill('14'); await page.locator('[data-attr="con"]').press('Tab');
  await expect(page.locator('[data-res-max="hp"]')).toHaveValue('12');
  await expect(page.locator('#save-indicator-text')).toHaveText('Salvo');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('[data-attr="con"]')).toHaveValue('14');
  expect(errors).toEqual([]);
});
test('rótulos, cores, cancelar, salvar e recalcular', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await page.locator('#btn-customize').click();
  await rename(page, 'resource:hp', 'Vitalidade');
  await expect(component(page, 'resource:hp').locator('.resource__name')).toHaveText('Vitalidade');
  await page.locator('#customization-cancel').click();
  await expect(page.locator('[data-res-name="hp"]')).toHaveText('HP');
  await page.locator('#btn-customize').click();
  await rename(page, 'resource:hp', 'Vitalidade');
  await page.locator('#customization-save').click();
  await expect(page.locator('#customization-editor')).toBeHidden();
  await page.locator('[data-attr="con"]').fill('16'); await page.locator('[data-attr="con"]').press('Tab');
  await expect(page.locator('[data-res-max="hp"]')).toHaveValue('13');
  await expect(page.locator('[data-res-name="hp"]')).toHaveText('Vitalidade');
  await page.reload();
  await expect(page.locator('[data-res-name="hp"]')).toHaveText('Vitalidade');
  expect(errors).toEqual([]);
});
test('campos individuais mudam de seção e os dois layouts são independentes', async ({ page }) => {
  await page.goto('/'); await page.locator('#btn-customize').click();
  await select(page, 'field:info.class');
  await page.locator('#editor-parent').selectOption('section:resources');
  await expect(component(page, 'section:resources').locator('[data-field="info.class"]')).toHaveCount(1);
  await page.locator('#editor-profile').selectOption('mobile');
  await expect(component(page, 'section:guild-card').locator('[data-field="info.class"]')).toHaveCount(1);
  await page.locator('#customization-save').click();
  await expect(component(page, 'section:resources').locator('[data-field="info.class"]')).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(component(page, 'section:guild-card').locator('[data-field="info.class"]')).toHaveCount(1);
});
test('corrupção preserva o original sem iniciar uma ficha padrão', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hunterscodex:sheet:v1', '{broken'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Não foi possível abrir sua ficha' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('hunterscodex:sheet:v1'))).toBe('{broken');
});
test('cores por tema, exportação/importação e restauração cancelável', async ({ page }) => {
  await page.goto('/'); await page.locator('#btn-customize').click();
  await rename(page, 'resource:hp', '<img src=x> Vitalidade');
  await page.getByText('Cores por tema', { exact: true }).click();
  await page.locator('#editor-color-theme').selectOption('light');
  await page.locator('#editor-color-accent').fill('#123456');
  await page.locator('#editor-color-accent').dispatchEvent('change');
  await page.locator('#customization-save').click();
  await expect(component(page, 'resource:hp')).toHaveCSS('border-color', 'rgb(18, 52, 86)');
  await expect(component(page, 'resource:hp').locator('img')).toHaveCount(0);
  const downloadEvent = page.waitForEvent('download'); await page.locator('#btn-export').click();
  const download = await downloadEvent; const stream = await download.createReadStream();
  const chunks = []; for await (const chunk of stream) chunks.push(chunk);
  const buffer = Buffer.concat(chunks), document = JSON.parse(buffer.toString());
  expect(document.formatVersion).toBe(1); expect(document.userPreferences).toBeUndefined();
  await page.locator('#btn-customize').click(); await page.locator('#customization-reset').click();
  await page.locator('#customization-cancel').click();
  await expect(page.locator('[data-res-name="hp"]')).toHaveText('<img src=x> Vitalidade');
  await page.locator('#file-import').setInputFiles({ name: 'sheet.json', mimeType: 'application/json', buffer });
  await expect(page.locator('[data-res-name="hp"]')).toHaveText('<img src=x> Vitalidade');
});
test('quota mantém rascunho aberto e nunca exibe salvo', async ({ page }) => {
  await page.goto('/'); await page.locator('#btn-customize').click(); await rename(page, 'resource:hp', 'Vida pendente');
  await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('Quota', 'QuotaExceededError'); }; });
  await page.locator('#customization-save').click();
  await expect(page.locator('#customization-editor')).toBeVisible();
  await expect(page.locator('#customization-status')).toContainText('Não foi possível salvar');
  await expect(page.locator('#save-indicator-text')).toHaveText('Erro ao salvar');
  await page.locator('#customization-cancel').click();
  await expect(page.locator('[data-res-name="hp"]')).toHaveText('HP');
});
test('geometria real não sobrepõe irmãos e teclado conserva eventos', async ({ page }) => {
  await page.goto('/'); await page.locator('#btn-customize').click();
  await select(page, 'attribute:for');
  await page.locator('#editor-position').locator('summary').click();
  await page.locator('#editor-x').fill('99'); await page.locator('#editor-position-apply').click();
  await expect(page.locator('#customization-status')).toContainText('Posição inválida');
  await page.locator('#editor-parent').selectOption('section:resources');
  const handle = component(page, 'attribute:for').locator('.component-handle');
  await handle.focus(); await handle.press('ArrowDown');
  await expect(page.locator('#customization-status')).toContainText('Posição atualizada');
  const overlaps = await page.locator('#sheet-surface').evaluate(surface => {
    const nodes = [...surface.querySelectorAll('[data-component-id]')]; const failures = [];
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[i].parentElement !== nodes[j].parentElement) continue;
      const a = nodes[i].getBoundingClientRect(), b = nodes[j].getBoundingClientRect();
      if (a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1) failures.push([nodes[i].dataset.componentId, nodes[j].dataset.componentId]);
    }
    return failures;
  });
  expect(overlaps).toEqual([]);
  await page.locator('#customization-save').click();
  await page.locator('[data-attr="for"]').fill('18'); await page.locator('[data-attr="for"]').press('Tab');
  await expect(component(page, 'attack:bonus').locator('strong')).toHaveText('+6');
});
test('arraste e redimensionamento aceitam uma posição livre válida', async ({ page }) => {
  await page.goto('/'); await page.locator('#btn-customize').click(); await select(page, 'attribute:for');
  await page.locator('#editor-parent').selectOption('root');
  const element = component(page, 'attribute:for');
  await element.scrollIntoViewIfNeeded();
  const handle = element.locator('.component-handle'); const start = await handle.boundingBox();
  await page.mouse.move(start.x + 10, start.y + 10); await page.mouse.down(); await page.mouse.move(start.x + 10, start.y + 35, { steps: 4 }); await page.mouse.up();
  await expect(page.locator('#customization-status')).toContainText('Posição atualizada');
  const resize = await element.locator('.component-resize').boundingBox();
  await page.mouse.move(resize.x + 10, resize.y + 10); await page.mouse.down(); await page.mouse.move(resize.x + 10, resize.y + 35, { steps: 4 }); await page.mouse.up();
  await expect(page.locator('#customization-status')).toContainText('Posição atualizada');
  await page.screenshot({ path: 'test-results/editor-desktop.png' });
});
test('campos da biblioteca têm identidade estável e atualizam os motores', async ({ page }) => {
  await page.goto('/'); await page.locator('#btn-customize').click();
  const id = 'entity:weapon:weapon_longsword_starter:damageDice'; await select(page, id);
  await page.locator('#editor-parent').selectOption('section:armory');
  await page.locator('#customization-save').click();
  const input = page.locator(`[data-entity-input="${id}"]`);
  await input.fill('3d8'); await input.press('Tab');
  await expect(component(page, 'attack:damage').locator('strong')).toHaveText('3d8');
});
test('importa legado, preserva original e rejeita arquivo incompatível', async ({ page }) => {
  await page.goto('/');
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('hunterscodex:sheet:v1')).character);
  original.schemaVersion = 1; original.info.name = 'Caçador legado';
  const buffer = Buffer.from(JSON.stringify(original));
  await page.locator('#file-import').setInputFiles({ name: 'legacy.json', mimeType: 'application/json', buffer });
  await expect(page.locator('[data-field="info.name"]')).toHaveText('Caçador legado');
  const before = await page.evaluate(() => localStorage.getItem('hunterscodex:sheet:v1'));
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#file-import').setInputFiles({ name: 'future.json', mimeType: 'application/json', buffer: Buffer.from('{"formatVersion":99}') });
  await expect(page.locator('[data-field="info.name"]')).toHaveText('Caçador legado');
  expect(await page.evaluate(() => localStorage.getItem('hunterscodex:sheet:v1'))).toBe(before);
});
test('componentes novos aparecem e restaurar padrão salvo remove os dois layouts', async ({ page }) => {
  await page.goto('/'); await page.locator('#btn-customize').click(); await rename(page, 'resource:hp', 'Vida');
  await page.locator('#customization-save').click(); await page.locator('#btn-add-resource').click();
  await expect(page.locator('.resource')).toHaveCount(5);
  await page.locator('#btn-customize').click();
  expect(await page.locator('#editor-component option').evaluateAll(options => options.filter(o => o.value.startsWith('resource:') && o.value.split(':').length === 2).length)).toBe(5);
  await page.locator('#customization-reset').click(); await page.locator('#customization-save').click();
  await expect(page.locator('#sheet-surface')).toHaveCount(0);
  await expect(page.locator('[data-res-name="hp"]')).toHaveText('HP');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hunterscodex:sheet:v1')).sheetAppearance.layouts)).toEqual({ desktop: {}, mobile: {} });
  await page.locator('[data-field="info.class"]').fill('Guerreiro'); await page.locator('[data-field="info.class"]').press('Tab');
  await expect(page.locator('#save-indicator-text')).toHaveText('Salvo');
  await page.reload(); await expect(page.locator('[data-field="info.class"]')).toHaveText('Guerreiro');
});
test.describe('celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('toque move campo e a ficha salva cabe na largura disponível', async ({ page }) => {
    await page.goto('/');
    const themeButton = await page.locator('#btn-theme').boundingBox();
    expect(themeButton.x).toBeGreaterThanOrEqual(0);
    await page.locator('#btn-theme').tap();
    await page.locator('#btn-customize').tap();
    await expect(page.locator('#editor-profile')).toHaveValue('mobile');
    await select(page, 'attribute:for'); await page.locator('#editor-parent').selectOption('root');
    const handle = component(page, 'attribute:for').locator('.component-handle'); await handle.scrollIntoViewIfNeeded();
    const rect = await handle.boundingBox(), x = rect.x + 10, y = rect.y + 10;
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 30, id: 1 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('#customization-status')).toContainText('Posição atualizada');
    await page.locator('#customization-save').tap();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: 'test-results/sheet-mobile.png' });
    await page.reload(); await expect(page.locator('#sheet-surface')).toBeVisible();
  });
});
test('tela de recuperação aceita cópia válida sem sobrescrever por padrão', async ({ page }) => {
  await page.goto('/');
  const valid = await page.evaluate(() => localStorage.getItem('hunterscodex:sheet:v1'));
  await page.evaluate(() => localStorage.setItem('hunterscodex:sheet:v1', '{broken'));
  await page.reload(); await expect(page.getByRole('button', { name: 'Importar ficha recuperada' })).toBeVisible();
  await page.locator('#recovery-file').setInputFiles({ name: 'recovered.json', mimeType: 'application/json', buffer: Buffer.from(valid) });
  await expect(page.locator('#btn-customize')).toBeVisible();
  await expect(page.locator('[data-res-max="hp"]')).toHaveValue('10');
  expect(await page.evaluate(() => localStorage.getItem('hunterscodex:sheet:backup'))).toBe('{broken');
});
test('valor atual de recurso move sozinho e continua ligado ao mesmo recurso', async ({ page }) => {
  await page.goto('/'); await page.locator('#btn-customize').click();
  await rename(page, 'resource:hp', 'Vitalidade');
  await rename(page, 'section:attributes', 'Estatísticas');
  await select(page, 'resource:hp:current'); await page.locator('#editor-parent').selectOption('section:attributes');
  await page.locator('#customization-save').click();
  await expect(component(page, 'section:attributes').locator('[data-res-current="hp"]')).toHaveCount(1);
  await expect(component(page, 'resource:hp:current').locator('.resource-value__label')).toHaveText('Vitalidade atual');
  await expect(page.locator('[data-res-current="hp"]')).toHaveAttribute('aria-label', 'Vitalidade atual');
  await expect(page.locator('[data-attr="for"]')).toHaveAttribute('aria-label', 'FOR');
  await page.locator('[data-res-current="hp"]').fill('7'); await page.locator('[data-res-current="hp"]').press('Tab');
  await expect(page.locator('[data-res-max="hp"]')).toHaveValue('10');
  await expect(page.locator('#save-indicator-text')).toHaveText('Salvo');
  await page.reload(); await expect(page.locator('[data-res-current="hp"]')).toHaveValue('7');
});

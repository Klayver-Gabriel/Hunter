import { test, expect } from '@playwright/test';
import { createDefaultSystems } from '../../src/domain/gameSystems.js';
import { mockCloud } from './helpers/mockCloud.js';
import { openPage } from './helpers/navigation.js';
import { openSheetDialog } from './helpers/sheets.js';

test('a seleção mostra nome e sistema e a ficha herda atualizações do sistema, preservando o ajuste pessoal', async ({ page }) => {
  await mockCloud(page);
  await page.goto('/');
  await expect(page.locator('#sheet-picker')).toBeVisible();
  await expect(page.locator('#picker-grid')).toBeEmpty();
  await page.locator('#picker-systems').click();
  await page.getByRole('button', { name: 'Criar sistema' }).click();
  await page.locator('.system-list-row').filter({ hasText: 'Novo sistema' }).getByRole('button', { name: 'Editar' }).click();
  await page.locator('#system-editor-form [name="title"]').fill('Mesa da Serra');
  const acrobatics = () => page.locator('#system-skill-rows [data-skill-key="acrobatics"]');
  await acrobatics().locator('[data-skill-name]').fill('Acrobacia da Mesa');
  await acrobatics().locator('[data-skill-bonus]').fill('2');
  await page.getByRole('button', { name: 'Salvar sistema' }).click();
  await expect(page.locator('#system-editor')).not.toBeVisible();

  await page.locator('#picker-system-select').selectOption({ label: 'Mesa da Serra' });
  await page.locator('#picker-new').click();
  await expect(page.locator('#page-guild-card')).toBeVisible();
  await expect(page.locator('#character-system-label')).toHaveText('Sistema · Mesa da Serra');
  await page.locator('[data-field="info.name"]').fill('Lyra');
  await page.locator('[data-field="info.name"]').press('Enter');
  await openPage(page, 'dnd-rules');
  const skillSelector = page.locator('#skill-template-select');
  await expect(skillSelector).toBeHidden();
  await expect(page.locator('#skill-template-current')).toHaveText('Perícias de Mesa da Serra');
  await expect(page.locator('[data-component-label="skill:acrobatics"]')).toHaveText('Acrobacia da Mesa');

  await page.getByRole('button', { name: 'Ajustar perícias', exact: true }).click();
  await page.locator('[data-template-skill="acrobatics"] [data-skill-name]').fill('Acrobacia da Lyra');
  await page.getByRole('button', { name: 'Aplicar tabela', exact: true }).click();
  await page.locator('#btn-my-sheets').click();
  await expect(page.locator('.picker-card')).toContainText('Lyra');
  await expect(page.locator('.picker-card')).toContainText('Mesa da Serra');

  await expect(page.locator('.system-list-row').filter({ hasText: 'Mesa da Serra' })).toBeVisible();
  await page.locator('.system-list-row').filter({ hasText: 'Mesa da Serra' }).getByRole('button', { name: 'Editar' }).click();
  await page.locator('#system-editor-form [name="title"]').fill('Mesa da Serra atualizada');
  await acrobatics().locator('[data-skill-name]').fill('Acrobacia atualizada');
  await acrobatics().locator('[data-skill-bonus]').fill('5');
  await page.getByRole('button', { name: 'Salvar sistema' }).click();
  await expect(page.locator('#system-editor')).not.toBeVisible();
  await page.locator('.picker-card__open').click();
  await expect(page.locator('#character-system-label')).toHaveText('Sistema · Mesa da Serra atualizada');
  await openPage(page, 'dnd-rules');
  await expect(page.locator('[data-component-label="skill:acrobatics"]')).toHaveText('Acrobacia da Lyra');
  const row = page.locator('.skill-row').filter({ has: page.locator('[data-component-label="skill:acrobatics"]') });
  await expect(row.locator('strong')).toHaveText('+5');
});

test('a troca no card persiste só na ficha escolhida e o cancelamento não altera nada', async ({ page }) => {
  const cloud = await mockCloud(page);
  await page.goto('/');
  await page.locator('#picker-new').click();
  await page.locator('[data-field="info.name"]').fill('Ficha A');
  await page.locator('[data-field="info.name"]').press('Enter');
  await page.locator('#btn-my-sheets').click();

  await page.locator('#picker-new').click();
  await page.locator('[data-field="info.name"]').fill('Ficha B');
  await page.locator('[data-field="info.name"]').press('Enter');
  await page.locator('#btn-my-sheets').click();

  const cardA = page.locator('.picker-card').filter({ hasText: 'Ficha A' });
  const cardB = page.locator('.picker-card').filter({ hasText: 'Ficha B' });
  await cardA.locator('.picker-card__system').click();
  await expect(page.locator('#sheet-system-dialog')).toBeVisible();
  await page.getByRole('radio', { name: /Tormenta20/ }).check();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('#sheet-system-dialog')).not.toBeVisible();
  expect(cloud.records.get('1').document.character.systemId).toBe('dnd5e');

  await cardA.locator('.picker-card__system').click();
  await page.getByRole('radio', { name: /Tormenta20/ }).check();
  cloud.fail = 503;
  await page.locator('#sheet-system-confirm').click();
  await expect(page.locator('#sheet-system-dialog')).toBeVisible();
  await expect(page.locator('#picker-feedback')).toContainText('Falha simulada.');
  expect(cloud.records.get('1').document.character.systemId).toBe('dnd5e');
  cloud.fail = null;
  await page.locator('#sheet-system-confirm').click();
  await expect(page.locator('#sheet-system-dialog')).not.toBeVisible();
  await expect(cardA.locator('.picker-card__system')).toContainText('Tormenta20');
  await expect(cardB.locator('.picker-card__system')).toContainText('D&D 5e');
  expect(cloud.records.get('1').document.character.systemId).toBe('tormenta20');
  expect(cloud.records.get('2').document.character.systemId).toBe('dnd5e');

  await cardA.locator('.picker-card__open').click();
  await expect(page.locator('#character-system-label')).toHaveText('Sistema · Tormenta20');
  await page.reload();
  await expect(page.locator('#sheet-picker')).toBeVisible();
  await expect(page.locator('.picker-card').filter({ hasText: 'Ficha A' }).locator('.picker-card__system')).toContainText('Tormenta20');
});

test('a tela de seleção mostra a chave PIX exata e dá retorno ao copiar', async ({ page }) => {
  await mockCloud(page);
  await page.goto('/');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true,
    value: { writeText: async value => { window.copiedPix = value; } } }));
  await expect(page.locator('#picker-pix-key')).toHaveText('09590124356');
  await page.locator('#picker-copy-pix').click();
  await expect(page.locator('#picker-pix-feedback')).toHaveText('Chave PIX copiada.');
  expect(await page.evaluate(() => window.copiedPix)).toBe('09590124356');
});

test('falha ao copiar a chave PIX exibe uma instrução manual', async ({ page }) => {
  await mockCloud(page);
  await page.goto('/');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw Error('blocked'); } } });
    document.execCommand = () => false;
  });
  await page.locator('#picker-copy-pix').click();
  await expect(page.locator('#picker-pix-feedback')).toHaveText('Não foi possível copiar. Selecione e copie a chave PIX acima.');
});

test('seletor de fichas, painel de apoio e modal cabem em um celular', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await mockCloud(page);
  await page.goto('/');
  await page.locator('#picker-new').click();
  await page.locator('[data-field="info.name"]').fill('Ficha móvel');
  await page.locator('[data-field="info.name"]').press('Enter');
  await page.locator('#btn-my-sheets').click();

  const viewport = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width);
  const card = page.locator('.picker-card').first();
  await card.locator('.picker-card__system').click();
  await expect(page.locator('#sheet-system-dialog')).toBeVisible();
  const dialog = await page.locator('#sheet-system-dialog').boundingBox();
  expect(dialog.x).toBeGreaterThanOrEqual(0);
  expect(dialog.x + dialog.width).toBeLessThanOrEqual(320);
  await page.keyboard.press('Escape');
  await expect(page.locator('#sheet-system-dialog')).not.toBeVisible();
});

test('a navegação aceita URL sem fragmento e fragmento vazio', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mockCloud(page);
  await page.goto('/');
  await page.locator('#picker-new').click();
  await expect(page.locator('#page-guild-card')).toBeVisible();
  await page.evaluate(() => {
    history.pushState(null, '', `${location.pathname}#`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await expect(page.locator('#page-guild-card')).toBeVisible();
  expect(errors).toEqual([]);
});

test('JSON portátil copia o sistema da ficha para a biblioteca de outra conta', async ({ page }) => {
  const cloud = await mockCloud(page);
  await page.goto('/');
  await page.locator('#picker-systems').click();
  await page.locator('.system-list-row').filter({ hasText: 'D&D 5e' }).getByRole('button', { name: 'Duplicar' }).click();
  await expect(page.locator('.system-list-row').filter({ hasText: 'D&D 5e (cópia)' })).toBeVisible();
  await page.locator('#picker-system-select').selectOption({ label: 'D&D 5e (cópia)' });
  await page.locator('#picker-new').click();
  await expect(page.locator('#page-guild-card')).toBeVisible();
  await page.locator('[data-field="info.name"]').fill('Ficha portátil');
  await page.locator('[data-field="info.name"]').press('Enter');
  await openPage(page, 'dnd-rules');
  await page.getByRole('button', { name: 'Ajustar perícias', exact: true }).click();
  await page.locator('[data-template-skill="acrobatics"] [data-skill-name]').fill('Acrobacia portátil');
  await page.getByRole('button', { name: 'Aplicar tabela', exact: true }).click();
  await openSheetDialog(page, 'save');
  const downloadEvent = page.waitForEvent('download');
  await page.locator('[data-cloud="export"]').click();
  const stream = await (await downloadEvent).createReadStream(), chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const portable = Buffer.concat(chunks);
  const exported = JSON.parse(portable.toString());
  expect(exported.systemBundle.title).toBe('D&D 5e (cópia)');

  cloud.user = { id: 'account-b', name: 'Conta B' };
  cloud.systems = new Map(createDefaultSystems().map(system => [system.id, system]));
  cloud.records.clear();
  await page.goto('/');
  await expect(page.locator('#sheet-picker')).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#picker-file').setInputFiles({ name: 'ficha-portatil.json', mimeType: 'application/json', buffer: portable });
  await expect(page.locator('#page-guild-card')).toBeVisible();
  expect(cloud.systems.size).toBe(3);
  const imported = [...cloud.records.values()][0];
  expect(imported.document.character.systemId).not.toBe('dnd5e');
  expect(cloud.systems.get(imported.document.character.systemId).title).toBe('D&D 5e (cópia)');
  await openPage(page, 'dnd-rules');
  await expect(page.locator('[data-component-label="skill:acrobatics"]')).toHaveText('Acrobacia portátil');
});

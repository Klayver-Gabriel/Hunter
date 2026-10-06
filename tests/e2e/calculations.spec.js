import { test, expect } from '@playwright/test';
import { openPage } from './helpers/navigation.js';
const rule = async (page, id) => {
  const target = id === 'spellcasting' ? 'metric:dt' : id;
  await openPage(page, id.startsWith('resource:') || id.startsWith('attribute:') ? 'guild-card' : 'dnd-rules');
  await page.locator(`[data-calculation-target="${target}"]`).dblclick();
  await expect(page.locator('#component-editor')).toBeInViewport();
};
const dialog = page => page.locator('dialog:visible').filter({ has: page.locator('#component-save, #rule-save') });
const save = async page => {
  await expect(dialog(page).locator('[type="submit"]')).toBeEnabled();
  await dialog(page).locator('[type="submit"]').click();
  await expect(page.locator('#rules-dialog[open], #component-editor[open]')).toHaveCount(0);
};
const field = (page, name) => dialog(page).locator(`[name="${name}"]`);
const snapshot = page => page.evaluate(() => JSON.parse(localStorage.getItem('hunterscodex:sheet:v1')));

test('central agrupa, busca, aplica lote e propaga nomes em seletores, grupos e tooltips', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await page.locator('#btn-edit-names').click();
  await page.locator('[data-name-input="attribute:des"]').fill('Agilidade');
  await page.locator('[data-name-input="record:weapons:weapon_longsword_starter"]').fill('Espada Solar');
  await page.locator('[data-name-input="skill:acrobatics"]').fill('Equilíbrio');
  await page.locator('#name-search').fill('Agilidade');
  await expect(page.locator('.name-row')).toHaveCount(1);
  await page.locator('#name-search').fill('Destreza'); await expect(page.locator('.name-row')).toHaveCount(2);
  await page.locator('#name-search').fill(''); await page.getByRole('button', { name: 'Aplicar alterações', exact: true }).click();
  await openPage(page, 'dnd-rules');
  await expect(page.locator('#skill-groups h4').filter({ hasText: 'Agilidade' })).toBeVisible();
  await expect(page.locator('[data-skill-prof="acrobatics"]')).toHaveAttribute('aria-label', 'Equilíbrio: proficiência');
  await expect(page.locator('[data-skill-prof="acrobatics"]').locator('xpath=../..')).toHaveAttribute('title', /Agilidade/);
  await expect(page.locator('#equipped-weapon-select')).toHaveValue('weapon_longsword_starter');
  await expect(page.locator('#equipped-weapon-select option:checked')).toHaveText('Espada Solar');
  await expect(page.locator('#mastery-panel h3')).toHaveText('Espada Solar');
  await expect(page.locator('#mastery-panel .unlock small').first()).toHaveText('Equilíbrio +2');
  await openPage(page, 'library');
  await page.locator('[data-edit-weapon="weapon_longsword_starter"]').click();
  await expect(page.locator('#mf-ability option[value="des"]')).toHaveText('Agilidade'); await page.locator('#modal-cancel').click();
  await page.locator('#btn-edit-names').click(); await page.locator('[data-name-category="attributes"]').click();
  await page.locator('#name-filter').selectOption('changed'); await expect(page.locator('.name-row')).toHaveCount(1);
  await page.locator('#name-category-restore').click(); await page.locator('#name-cancel').click();
  await expect(page.locator('[data-attr="des"]')).toHaveAttribute('aria-label', 'Agilidade');
  expect(errors).toEqual([]);
});

test('progressão, prévia, variável e validação funcionam sem curar o recurso', async ({ page }) => {
  await page.goto('/'); await page.locator('[data-res-current="atp"]').fill('4'); await page.locator('[data-res-current="atp"]').press('Tab');
  await rule(page, 'resource:atp'); await field(page, 'mode').selectOption('progression');
  await field(page, 'initial').fill('10 + MOD_INT'); await field(page, 'gain').fill('NIVEL_AVALIADO');
  await field(page, 'bonuses').fill('5|5'); await expect(page.locator('#component-preview')).toContainText('Resultado: 10'); await save(page);
  await openPage(page, 'guild-card');
  await page.locator('[data-field="info.level"]').fill('5'); await page.locator('[data-field="info.level"]').press('Tab');
  await expect(page.locator('[data-res-max="atp"]')).toHaveValue('29'); await expect(page.locator('[data-res-current="atp"]')).toHaveValue('4');
  await rule(page, 'resource:atp'); await field(page, 'mode').selectOption('formula');
  await field(page, 'formula').fill('1/0'); await expect(dialog(page).locator('#rule-error, #component-error')).toContainText('Divisão por zero'); await expect(dialog(page).locator('[type="submit"]')).toBeDisabled();
  await field(page, 'formula').fill('10 + '); await field(page, 'formula').focus();
  await page.locator('#component-variable').selectOption('MOD_INT'); await page.locator('#component-insert').click();
  await expect(field(page, 'formula')).toHaveValue('10 + MOD_INT'); await save(page);
  await expect(page.locator('[data-res-max="atp"]')).toHaveValue('10');
});

test('magias exibem DT e resistência sem converter círculo textual', async ({ page }) => {
  await page.goto('/'); await rule(page, 'spellcasting'); await field(page, 'mode').selectOption('formula'); await page.locator('#component-advanced').click();
  await field(page, 'formula').fill('10 + floor(NIVEL / 2) + MOD_CONJURACAO + BONUS_DT'); await field(page, 'parameter:casting.bonus').fill('2'); await save(page);
  await openPage(page, 'records'); await page.locator('#tab-btn-spells').click(); await page.locator('[data-add="spells"]').click();
  await field(page, 'title').fill('Luz'); await field(page, 'level').fill('Especial');
  await field(page, 'resistance').selectOption('des'); await save(page);
  await expect(page.locator('#tab-spells .spell-dt')).toContainText('DT 12 · Destreza');
  await openPage(page, 'guild-card');
  await page.locator('[data-attr="int"]').fill('16'); await page.locator('[data-attr="int"]').press('Tab');
  await expect(page.locator('#tab-spells .spell-dt')).toContainText('DT 15');
  await openPage(page, 'records');
  await page.locator('#tab-spells [data-entry-id]').click(); await field(page, 'mode').selectOption('formula');
  await field(page, 'formula').fill('10 + CIRCULO + MOD_INT + BONUS_MAGIA');
  await expect(dialog(page).locator('#rule-error, #component-error')).toContainText('CIRCULO'); await expect(dialog(page).locator('[type="submit"]')).toBeDisabled();
  await field(page, 'circle').fill('3'); await field(page, 'bonus').fill('1'); await save(page);
  await expect(page.locator('#tab-spells .spell-dt')).toContainText('DT 17');
  await expect(page.locator('#tab-spells .entry-card__subtitle')).toContainText('Especial');
  await openPage(page, 'records');
  await page.locator('#tab-spells [data-entry-id]').click(); await field(page, 'mode').selectOption('fixed'); await field(page, 'fixed').fill('20'); await save(page);
  await expect(page.locator('#tab-spells .spell-dt')).toContainText('DT 21');
  await openPage(page, 'records');
  await page.locator('#tab-spells [data-entry-id]').click(); await field(page, 'mode').selectOption('none'); await save(page);
  await expect(page.locator('#tab-spells .spell-dt')).toHaveText('Sem DT');
});

test('efeitos persistem, expiram por unidade e não repetem ao reabrir', async ({ page }) => {
  await page.goto('/'); await page.locator('[data-res-current="atp"]').fill('1'); await page.locator('[data-res-current="atp"]').press('Tab');
  await openPage(page, 'temporal'); await page.locator('#btn-effect-add').click(); await field(page, 'name').fill('Regeneração'); await field(page, 'duration').fill('2'); await save(page);
  await page.locator('[data-event="turn"]').click(); await expect(page.locator('[data-res-current="atp"]')).toHaveValue('1');
  await page.locator('[data-event="round"]').click(); await expect(page.locator('[data-res-current="atp"]')).toHaveValue('3');
  await expect(page.locator('#save-indicator-text')).toHaveText('Salvo'); await page.reload();
  await expect(page.locator('[data-res-current="atp"]')).toHaveValue('3'); await expect(page.locator('#event-counts')).toContainText('Rodadas: 1');
  await page.locator('[data-event="round"]').click(); await expect(page.locator('[data-res-current="atp"]')).toHaveValue('5'); await expect(page.locator('#temporal-list')).toContainText('Expirado');
  await page.locator('[data-event="round"]').click(); await expect(page.locator('[data-res-current="atp"]')).toHaveValue('5');
  await openPage(page, 'temporal'); await page.locator('#btn-effect-add').click(); await field(page, 'name').fill('Força temporária'); await field(page, 'kind').selectOption('bonus'); await field(page, 'target').selectOption('attribute:for'); await field(page, 'durationUnit').selectOption('turn'); await field(page, 'duration').fill('1'); await save(page);
  await expect(page.locator('[data-attr="for"]')).toHaveValue('12'); await expect(page.locator('#attack-panel .attack-result strong').first()).toHaveText('+3');
  await page.locator('[data-event="turn"]').click(); await expect(page.locator('[data-attr="for"]')).toHaveValue('10');
  await expect(page.locator('#save-indicator-text')).toHaveText('Salvo'); expect((await snapshot(page)).character.attributes.for).toBe(10);
});

test.describe('novos editores em tela estreita', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('central, fórmulas e eventos cabem e permitem concluir por toque', async ({ page }) => {
    await page.goto('/'); await page.locator('#btn-edit-names').tap(); await page.locator('[data-name-category="resources"]').tap();
    await page.locator('[data-name-input="resource:atp"]').fill('Mana'); await page.getByRole('button', { name: 'Aplicar alterações', exact: true }).tap();
    await rule(page, 'resource:atp'); await field(page, 'mode').selectOption('formula'); await field(page, 'formula').fill('10 + MOD_INT');
    expect(await page.locator('#component-editor').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true); await save(page);
    await openPage(page, 'temporal'); await page.locator('#btn-effect-add').tap(); await field(page, 'name').fill('Descanso'); await field(page, 'event').selectOption('rest'); await field(page, 'durationUnit').selectOption('unlimited'); await save(page);
    await page.locator('[data-event="rest"]').tap(); await expect(page.locator('#event-counts')).toContainText('Descansos: 1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test('central e cadastro de magia são operáveis por teclado e restauram foco', async ({ page }) => {
  await page.goto('/'); await page.locator('#btn-edit-names').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#name-search')).toBeFocused();
  await page.locator('[data-name-category="attributes"]').focus(); await page.keyboard.press('Enter');
  await page.locator('[data-name-input="attribute:con"]').fill('Vigor');
  await page.locator('#name-editor [type="submit"]').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#btn-edit-names')).toBeFocused(); await expect(page.locator('[data-attr="con"]')).toHaveAttribute('aria-label', 'Vigor');
  await openPage(page, 'records'); await page.locator('#tab-btn-spells').click(); await page.locator('[data-add="spells"]').focus(); await page.keyboard.press('Enter');
  await expect(field(page, 'title')).toBeFocused(); await field(page, 'title').fill('Rascunho'); await page.keyboard.press('Escape');
  await expect(page.locator('[data-add="spells"]')).toBeFocused(); await expect(page.locator('#tab-spells [data-entry-id]')).toHaveCount(0);
});

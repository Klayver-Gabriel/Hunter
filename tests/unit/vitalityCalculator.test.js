import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDefault } from '../../src/domain/character.js';
import { hitDieSides, maxHpBreakdown } from '../../src/auto_calc_engine/vitalityCalculator.js';

test('default hit point breakdown includes legacy details and default configuration state', () => {
  const character = createDefault();

  const result = maxHpBreakdown(character);

  assert.equal(result.total, 10);
  assert.equal(result.firstLevel, 10);
  assert.equal(result.laterPerLevel, 6);
  assert.deepEqual(result.errors, []);
  assert.equal(result.configured, false);
});

test('custom hit point calculation replaces total without discarding legacy details', () => {
  const character = createDefault();
  character.calculations.rules['resource:hp'] = { mode: 'formula', formula: '25' };

  const result = maxHpBreakdown(character);

  assert.equal(result.total, 25);
  assert.equal(result.firstLevel, 10);
  assert.equal(result.laterPerLevel, 6);
  assert.deepEqual(result.errors, []);
  assert.equal(result.configured, true);
});

test('invalid configured hit point calculation reports its error', () => {
  const character = createDefault();
  character.calculations.rules['resource:hp'] = { mode: 'formula', formula: '1 / 0' };

  const result = maxHpBreakdown(character);

  assert.equal(result.total, null);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /zero/i);
  assert.equal(result.configured, true);
});

test('legacy breakdown is retained when the character has no hit point resource', () => {
  const character = createDefault();
  character.resources = character.resources.filter(resource => resource.id !== 'hp');
  character.info.level = 2;
  character.attributes.con = 14;

  const result = maxHpBreakdown(character);

  assert.equal(result.total, 20);
  assert.equal(Object.hasOwn(result, 'configured'), false);
});

test('hit die sides are extracted from configured dice and use the legacy fallback', () => {
  const character = createDefault();

  character.dnd.vitality.hitDie = 'd12';
  assert.equal(hitDieSides(character), 12);

  character.dnd.vitality.hitDie = 'invalid';
  assert.equal(hitDieSides(character), 8);
});

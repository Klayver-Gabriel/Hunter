import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overlaps, fits, pack } from '../../src/customization/geometry.js';
const box = (id, x, y, w, h) => ({ id, x, y, w, h, parent: 'root' });
test('coordenadas livres respeitam bordas, tamanho mínimo e colisões', () => {
  const a = box('a', 0, 0, 45, 100), b = box('b', 50, 0, 50, 100);
  assert.equal(overlaps(a, b), false);
  assert.equal(fits(b, [a]), true);
  assert.equal(fits({ ...b, x: 40 }, [a]), false);
  assert.equal(fits({ ...b, x: 80 }, []), false);
  assert.equal(fits({ ...b, h: 10 }, [], 1, 32), false);
});
test('crescimento reposiciona irmãos sem alterar coordenadas persistidas', () => {
  const original = [box('a', 0, 0, 100, 200), box('b', 0, 100, 100, 100), box('c', 0, 200, 100, 100)];
  const copy = structuredClone(original), result = pack(original);
  assert.deepEqual(original, copy);
  assert.equal(result[1].y, 212); assert.equal(result[2].y, 324);
  assert.equal(overlaps(result[0], result[1]), false);
});

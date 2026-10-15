import { createHash } from 'node:crypto';
import { migrateDocument } from '../../src/infrastructure/migrations/document.js';
import { createStore } from '../../src/application/store.js';

export const hash = value => createHash('sha256').update(value).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export const fingerprint = value => hash(JSON.stringify(canonical(value)));
export function normalizeDocument(raw) {
  let count = 0;
  function visit(value, depth = 0) {
    if (depth > 30 || ++count > 50000) throw Error('Documento complexo demais.');
    if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw Error('Chave inválida.');
      visit(item, depth + 1);
    }
  }
  visit(raw);
  const document = migrateDocument(raw, { allowRuntimeErrors: true });
  for (const value of Object.values(document.character.info)) {
    if (!['string', 'number', 'boolean'].includes(typeof value) && value !== null) throw Error('Identidade inválida.');
  }
  return createStore(document).getDocument();
}

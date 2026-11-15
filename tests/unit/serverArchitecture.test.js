import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { test } from 'node:test';

const serverRoot = new URL('../../server/', import.meta.url);
const layers = ['domain', 'application', 'infrastructure', 'http'];
const forbiddenDependencies = {
  domain: ['application', 'infrastructure', 'http'],
  application: ['infrastructure', 'http'],
  infrastructure: ['http'],
  http: ['infrastructure']
};

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return javascriptFiles(path);
    return entry.isFile() && entry.name.endsWith('.js') ? [path] : [];
  }));
  return nested.flat();
}

test('server layers do not depend on outward layers', async () => {
  const violations = [];

  for (const layer of layers) {
    const directory = new URL(`${layer}/`, serverRoot);
    for (const file of await javascriptFiles(directory.pathname)) {
      const source = await readFile(file, 'utf8');
      const imports = source.matchAll(/(?:import|export)\s+.*?\s+from\s+['"]([^'"]+)['"]/gs);

      for (const [, specifier] of imports) {
        const target = new URL(specifier, `file://${file}`).pathname;
        const targetLayer = layers.find(candidate => target.includes(`/server/${candidate}/`));
        if (!targetLayer) continue;

        if (forbiddenDependencies[layer].includes(targetLayer)) {
          violations.push(`${relative(serverRoot.pathname, file)} -> ${specifier}`);
        }
      }
    }
  }

  assert.deepEqual(violations, [], `Invalid server layer dependencies:\n${violations.join('\n')}`);
});

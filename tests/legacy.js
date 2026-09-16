import fs from 'node:fs';
import vm from 'node:vm';
export function legacy(extra = {}) {
  const context = { console: { error() {} }, setTimeout, clearTimeout, structuredClone, ...extra };
  context.window = context;
  vm.createContext(context);
  for (const file of ['formulaEngine', 'gameData', 'character', 'masteryEngine', 'ruleEngine', 'storage']) {
    vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url), 'utf8'), context);
  }
  return context.HC;
}

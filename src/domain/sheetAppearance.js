// Labels are editable; colors and layouts are retained only for document compatibility.
export const PROFILES = ['desktop', 'mobile'];
export const THEMES = ['light', 'dark'];
export function createAppearance() {
  return { version: 1, components: {}, layouts: { desktop: {}, mobile: {} } };
}
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const idPattern = /^[a-zA-Z0-9_.:-]{1,200}$/;
export function validId(id) { return typeof id === 'string' && idPattern.test(id) && !['__proto__', 'prototype', 'constructor'].includes(id); }
export function validateAppearance(input) {
  if (input == null) return createAppearance();
  if (!object(input) || input.version !== 1 || !object(input.components) || !object(input.layouts)) throw Error('Aparência incompatível.');
  const result = createAppearance();
  for (const [id, value] of Object.entries(input.components)) {
    if (!validId(id) || !object(value)) throw Error('Componente inválido.');
    const target = {};
    if (value.label != null) {
      if (typeof value.label !== 'string' || value.label.length > 120 || !value.label.trim()) throw Error('Rótulo deve conter de 1 a 120 caracteres.');
      target.label = value.label.trim();
    }
    if (value.colors != null) {
      if (!object(value.colors)) throw Error('Cores inválidas.');
      target.colors = {};
      for (const theme of THEMES) {
        const colors = value.colors[theme];
        if (colors == null) continue;
        if (!object(colors)) throw Error('Cores inválidas.');
        target.colors[theme] = {};
        for (const key of ['text', 'background', 'accent']) {
          const color = colors[key];
          if (color == null || color === '') continue;
          if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw Error('Cor deve usar #RRGGBB.');
          target.colors[theme][key] = color;
        }
      }
    }
    result.components[id] = target;
  }
  for (const profile of PROFILES) {
    const layout = input.layouts[profile];
    if (!object(layout)) throw Error('Layout inválido.');
    for (const [id, rect] of Object.entries(layout)) {
      if (!validId(id) || !object(rect) || (rect.parent !== 'root' && !validId(rect.parent))) throw Error('Posição inválida.');
      for (const key of ['x', 'y', 'w', 'h']) if (!Number.isFinite(rect[key])) throw Error('Posição deve conter números finitos.');
      if (rect.x < 0 || rect.y < 0 || rect.w <= 0 || rect.x + rect.w > 100.001 || rect.h < 24 || rect.y > 100000 || rect.h > 100000) throw Error('Posição fora dos limites.');
      result.layouts[profile][id] = { parent: rect.parent, x: rect.x, y: rect.y, w: rect.w, h: rect.h };
    }
    for (const id of Object.keys(layout)) {
      const seen = new Set([id]); let parent = layout[id].parent;
      while (layout[parent]) {
        if (seen.has(parent)) throw Error('Layout contém ciclo.');
        seen.add(parent); parent = layout[parent].parent;
      }
    }
  }
  return result;
}

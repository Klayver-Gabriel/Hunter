export const GAP = 12;
export function overlaps(a, b) {
  return a.x < b.x + b.w - 0.01 && a.x + a.w > b.x + 0.01 && a.y < b.y + b.h - 0.01 && a.y + a.h > b.y + 0.01;
}
export function visualOrder(a, b) { return a.y - b.y || a.x - b.x || a.id.localeCompare(b.id); }
export function fits(rect, siblings, minWidthPercent = 1, minHeight = 24) {
  return ['x', 'y', 'w', 'h'].every(key => Number.isFinite(rect[key])) && rect.x >= 0 && rect.y >= 0
    && rect.w >= minWidthPercent - 0.01 && rect.x + rect.w <= 100.001 && rect.h >= minHeight
    && rect.y + rect.h <= 100000 && !siblings.some(other => overlaps(rect, other));
}
/** Resolves content growth without modifying the persisted coordinates. */
export function pack(rectangles) {
  const result = [];
  for (const rect of rectangles.toSorted(visualOrder)) {
    const next = { ...rect };
    let colliding;
    while ((colliding = result.find(other => overlaps(next, other)))) next.y = colliding.y + colliding.h + GAP;
    result.push(next);
  }
  return result;
}
export function appendPosition(rectangles, parent = 'root') {
  return { parent, x: 0, y: Math.max(0, ...rectangles.map(rect => rect.y + rect.h + GAP)), w: 100, h: 60 };
}

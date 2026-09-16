import { pack, visualOrder, GAP } from '../../customization/geometry.js';

export function createSurface(root, registry) {
  let viewport = null, canvas = null;
  let effective = {}, saved = {}, profile = 'desktop';
  const decorations = [];
  function restore() {
    for (const { element, className } of decorations) element.classList.remove(className);
    decorations.length = 0;
    root.querySelectorAll('.free-heading,.component-handle,.component-resize').forEach(el => el.remove());
    // Anchors belong to the original hierarchy; restore nodes before deleting temporary containers.
    registry.restore();
    root.querySelectorAll('.free-body').forEach(el => el.remove());
    viewport?.remove(); viewport = null; canvas = null; effective = {};
  }
  function defaults(targetProfile, width) {
    const layout = {}, entries = [...registry.entries.values()];
    const sections = entries.filter(entry => entry.section);
    let sectionY = 0;
    for (const section of sections) {
      const children = entries.filter(entry => !entry.section && entry.parent === section.id);
      const innerWidth = Math.max(240, width - 32);
      let y = 0, x = 0, rowHeight = 0;
      for (const entry of children) {
        const columns = targetProfile === 'mobile' ? 1 : section.id === 'section:attributes' ? 3 : 2;
        const w = columns === 1 ? 100 : (100 - 2) / columns;
        const h = Math.max(64, Math.min(400, entry.element.getBoundingClientRect().height || 80));
        if (x + w > 100.01 || innerWidth * w / 100 < entry.minWidth) { y += rowHeight ? rowHeight + GAP : 0; x = 0; rowHeight = 0; }
        const actualWidth = innerWidth * w / 100 < entry.minWidth ? 100 : w;
        layout[entry.id] = { parent: section.id, x, y, w: actualWidth, h };
        rowHeight = Math.max(rowHeight, h); x += actualWidth + 2;
      }
      const h = y + rowHeight + 88;
      layout[section.id] = { parent: 'root', x: 0, y: sectionY, w: 100, h: Math.max(120, h) };
      sectionY += h + 24;
    }
    return layout;
  }
  function render(appearance, selectedProfile, { editing = false } = {}) {
    profile = selectedProfile;
    saved = appearance.layouts[profile];
    viewport = document.createElement('div'); viewport.className = 'surface-viewport';
    canvas = document.createElement('div'); canvas.id = 'sheet-surface'; canvas.className = 'sheet-surface';

    viewport.append(canvas);
    const first = registry.entries.values().next().value;
    first.anchor.before(viewport);
    if (editing) canvas.style.width = profile === 'mobile' ? `${Math.min(390, viewport.clientWidth - 8)}px` : `${Math.max(1000, viewport.clientWidth - 8)}px`;
    const entries = [...registry.entries.values()];
    const sections = entries.filter(entry => entry.section);
    const fallback = defaults(profile, canvas.clientWidth);
    const desired = {};
    for (const entry of entries) {
      const rect = saved[entry.id];
      const validParent = rect && (rect.parent === 'root' || registry.entries.get(rect.parent)?.section);
      desired[entry.id] = { ...(rect && validParent ? rect : fallback[entry.id]), id: entry.id };
      if (entry.section) desired[entry.id].parent = 'root';
      if (!rect && Object.keys(saved).length) {
        const peers = Object.values(saved).filter(r => r.parent === desired[entry.id].parent);
        desired[entry.id].y = Math.max(desired[entry.id].y, ...peers.map(r => r.y + r.h + GAP), 0);
      }
    }
    for (const entry of sections) {
      entry.element.classList.add('free-section'); decorations.push({ element: entry.element, className: 'free-section' });
      const heading = document.createElement('h2'); heading.className = 'free-heading';
      heading.textContent = appearance.components[entry.id]?.label || entry.label;
      const body = document.createElement('div'); body.className = 'free-body';
      entry.element.append(heading, body); canvas.append(entry.element);
    }
    for (const entry of entries.filter(entry => !entry.section)) {
      const parent = desired[entry.id].parent;
      const container = parent === 'root' ? canvas : registry.entries.get(parent).element.querySelector(':scope > .free-body');
      container.append(entry.element);
      entry.element.classList.add('free-component'); decorations.push({ element: entry.element, className: 'free-component' });
    }
    if (editing) for (const entry of entries) {
      for (const [className, label, text] of [['component-handle', 'Mover', '⠿'], ['component-resize', 'Redimensionar', '↘']]) {
        const handle = document.createElement('button'); handle.className = className; handle.type = 'button';
        handle.setAttribute('aria-label', `${label} ${appearance.components[entry.id]?.label || entry.label}`);
        handle.textContent = text; handle.dataset.owner = entry.id; entry.element.append(handle);
      }
    }
    function style(entry, rect) {
      entry.element.style.left = `${rect.x}%`; entry.element.style.top = `${rect.y}px`;
      entry.element.style.width = `${rect.w}%`; entry.element.style.height = 'auto';
      entry.element.style.minHeight = `${rect.h}px`;
    }
    // Children are measured at their final width before calculating section bounds.
    for (const section of sections) {
      const box = desired[section.id];
      box.w = Math.min(100, Math.max(box.w, section.minWidth / canvas.clientWidth * 100));
      box.x = Math.min(box.x, 100 - box.w); style(section, box);
    }
    for (const parent of [...sections.map(entry => entry.id), 'root']) {
      const container = parent === 'root' ? canvas : registry.entries.get(parent).element.querySelector(':scope > .free-body');
      const children = entries.filter(entry => !entry.section && desired[entry.id].parent === parent);
      const rectangles = children.map(entry => {
        const rect = { ...desired[entry.id] };
        rect.w = Math.min(100, Math.max(rect.w, entry.minWidth / Math.max(1, container.clientWidth) * 100));
        rect.x = Math.max(0, Math.min(rect.x, 100 - rect.w));
        style(entry, { ...rect, h: 0 });
        entry.minHeight = Math.max(32, entry.element.scrollHeight, entry.element.getBoundingClientRect().height);
        rect.h = Math.max(rect.h, entry.element.scrollHeight, entry.element.getBoundingClientRect().height);
        return rect;
      });
      for (const rect of pack(rectangles)) { effective[rect.id] = rect; style(registry.entries.get(rect.id), rect); container.append(registry.entries.get(rect.id).element); }
      const height = Math.max(0, ...rectangles.map(rect => effective[rect.id].y + effective[rect.id].h));
      if (parent !== 'root') {
        container.style.height = `${height}px`;
        registry.entries.get(parent).minHeight = height + 88;
        desired[parent].h = Math.max(desired[parent].h, height + 88);
      }
    }
    for (const section of sections) desired[section.id].h = Math.max(desired[section.id].h, section.element.scrollHeight, section.element.getBoundingClientRect().height);
    const rootBoxes = [...sections.map(entry => desired[entry.id]), ...Object.values(effective).filter(rect => rect.parent === 'root')];
    const packed = pack(rootBoxes);
    for (const rect of packed) {
      effective[rect.id] = rect; style(registry.entries.get(rect.id), rect); canvas.append(registry.entries.get(rect.id).element);
    }
    canvas.style.height = `${Math.max(100, ...packed.map(rect => rect.y + rect.h)) + 24}px`;
    const nav = document.querySelector('.guild-nav');
    const orderedSections = packed.filter(rect => registry.entries.get(rect.id).section).sort(visualOrder);
    for (const rect of orderedSections) {
      const link = [...nav.querySelectorAll('a')].find(a => a.hash === `#${registry.entries.get(rect.id).element.id}`);
      if (link) nav.append(link);
    }
    return effective;
  }
  return { restore, defaults, render,
    get effective() { return effective; },
    get canvas() { return canvas; },
    parentWidth(id) {
      const rect = effective[id]; if (!rect) return 1;
      return rect.parent === 'root' ? canvas.clientWidth : registry.entries.get(rect.parent).element.querySelector(':scope > .free-body').clientWidth;
    }
  };
}

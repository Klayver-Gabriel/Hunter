import { createDefaultSystems } from '../../../src/domain/gameSystems.js';

export async function mockCloud(page) {
  const state = { user: { id: 'account-a', name: 'Conta A' }, records: new Map(), systems: new Map(createDefaultSystems().map(system => [system.id, system])), fail: null, writes: 0, sequence: 0 };
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    const send = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/api/session') return send(200, { enabled: true, user: state.user, csrf: 'csrf' });
    if (!state.user) return send(401, { error: { code: 'session_expired', message: 'Entre novamente.' } });
    if (request.headers()['x-account-id'] && request.headers()['x-account-id'] !== state.user.id) return send(409, { error: { code: 'account_changed', message: 'A conta mudou.' } });
    if (url.pathname === '/api/logout') { state.user = null; return send(200, { ok: true }); }
    if (url.pathname === '/api/systems' && method === 'GET') return send(200, { systems: [...state.systems.values()] });
    const input = method === 'GET' ? null : request.postDataJSON();
    if (state.fail && ['PUT', 'POST'].includes(method)) return send(state.fail, { error: { code: state.fail === 409 ? 'conflict' : 'unavailable', message: 'Falha simulada.' } });
    if (url.pathname === '/api/systems' && method === 'POST') {
      const id = `sys_${++state.sequence}`, system = { id, title: input.title, revision: 1, config: input.config };
      state.systems.set(id, system); state.writes++; return send(201, system);
    }
    const systemMatch = url.pathname.match(/^\/api\/systems\/([^/]+)$/);
    if (systemMatch) {
      const id = systemMatch[1], current = state.systems.get(id);
      if (!current) return send(404, { error: { code: 'not_found', message: 'Sistema não encontrado.' } });
      if (method === 'PUT') {
        if (current.revision !== input.revision) return send(409, { error: { code: 'conflict', message: 'Conflito.' } });
        const updated = { ...current, title: input.title, config: input.config, revision: current.revision + 1 };
        state.systems.set(id, updated); state.writes++; return send(200, updated);
      }
      if (method === 'DELETE') { state.systems.delete(id); return send(200, { ok: true }); }
    }
    if (/^\/api\/sheets\/[^/]+\/portrait$/.test(url.pathname)) return route.fulfill({ status: 204, body: '' });
    if (url.pathname === '/api/sheets' && method === 'GET') return send(200, { sheets: [...state.records.values()].map(({ document, ...metadata }) => ({ ...metadata,
      systemId: document.character.systemId || document.character.skillTables?.activeId || 'dnd5e', hasPortrait: Boolean(document.character.info.photo) })) });
    if (method === 'POST') {
      state.writes++;
      const entry = { id: String(++state.sequence), revision: 1, title: input.document.character.info.name || 'Sem título', document: input.document };
      state.records.set(entry.id, entry); return send(201, entry);
    }
    const id = url.pathname.split('/').at(-1), current = state.records.get(id);
    if (!current) return send(404, { error: { code: 'not_found', message: 'Não encontrada.' } });
    if (method === 'GET') return send(200, current);
    if (method === 'PUT') {
      if (current.lastMutation === input.mutation && current.lastBaseRevision === input.revision
        && JSON.stringify(current.document) === JSON.stringify(input.document)) return send(200, current);
      if (current.revision !== input.revision) return send(409, { error: { code: 'conflict', message: 'Conflito.' } });
      state.writes++;
      const entry = { ...current, document: input.document, title: input.document.character.info.name,
        revision: current.revision + 1, lastMutation: input.mutation, lastBaseRevision: input.revision };
      state.records.set(id, entry); return send(200, entry);
    }
    state.records.delete(id); return send(200, { ok: true });
  });
  return state;
}

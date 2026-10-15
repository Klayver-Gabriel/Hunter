export class ApiError extends Error {
  constructor(status, code, message, retryAfter) { super(message); Object.assign(this, { status, code, retryAfter }); }
}
/** Requests include the account identity bound to this adapter. */
export function createRemoteApi({ user, csrf, fetcher = fetch }) {
  let token = csrf, disposed = false;
  const controllers = new Set();
  async function request(path, method = 'GET', body) {
    if (disposed) throw new ApiError(401, 'session_expired', 'Sessão encerrada.');
    const controller = new AbortController(); controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetcher(path, { method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { 'X-Account-ID': user.id, ...(method !== 'GET' ? { 'Content-Type': 'application/json', 'X-CSRF-Token': token } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      const data = await response.json();
      if (!response.ok) throw new ApiError(response.status, data.error?.code, data.error?.message || 'Falha na conexão.', Number(response.headers.get('Retry-After')) || 0);
      if (disposed) throw new ApiError(401, 'session_expired', 'Sessão encerrada.');
      return data;
    } finally { clearTimeout(timeout); controllers.delete(controller); }
  }
  return {
    list: async () => (await request('/api/sheets')).sheets,
    get: id => request(`/api/sheets/${encodeURIComponent(id)}`),
    create: input => request('/api/sheets', 'POST', input),
    update: (id, input) => request(`/api/sheets/${encodeURIComponent(id)}`, 'PUT', input),
    remove: (id, input) => request(`/api/sheets/${encodeURIComponent(id)}`, 'DELETE', input),
    logout: () => request('/api/logout', 'POST', {}),
    cancelPending() { for (const controller of controllers) controller.abort(); controllers.clear(); },
    renew(next) {
      if (next.user?.id !== user.id) throw new ApiError(409, 'account_changed', 'Entre na conta que iniciou esta edição.');
      token = next.csrf;
    },
    dispose() { disposed = true; for (const controller of controllers) controller.abort(); controllers.clear(); }
  };
}
export async function readRemoteSession(fetcher = fetch) {
  const response = await fetcher('/api/session', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (response.status === 404) return { enabled: false, user: null };
  if (!response.ok) throw Error('Conexão remota indisponível.');
  return response.json();
}

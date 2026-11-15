import { randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { AppError } from '../domain/errors.js';
import { serveStatic } from './static.js';

const random = () => randomBytes(32).toString('base64url');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const validToken = value => typeof value === 'string' && /^[\w-]{43}$/.test(value);
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(item => { const i = item.indexOf('='); return [item.slice(0, i).trim(), item.slice(i + 1)]; }));
}
async function readBody(req, limit) {
  if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw new AppError(415, 'content_type', 'Envie JSON.');
  if (Number(req.headers['content-length']) > limit) throw new AppError(413, 'too_large', 'Ficha excede o limite de tamanho.');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new AppError(413, 'too_large', 'Ficha excede o limite de tamanho.'); chunks.push(chunk); }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('Invalid body');
    return body;
  } catch { throw new AppError(400, 'invalid_json', 'JSON inválido.'); }
}
export function clientIp(req, trusted) {
  const peer = req.socket.remoteAddress || 'unknown';
  if (!trusted.includes(peer)) return peer;
  // The trusted ingress supplies the client IP as the final X-Forwarded-For entry.
  const forwarded = req.headers['x-forwarded-for']?.split(',').at(-1)?.trim();
  return forwarded && isIP(forwarded) ? forwarded : peer;
}
export function createHandler({ config, sheets, systems, auth, identity, limiter, hash, health, root = process.cwd(), logger = console }) {
  const sessionName = config.secure ? '__Host-hunter_session' : 'hunter_session';
  const flowName = config.secure ? '__Host-hunter_flow' : 'hunter_flow';
  const cookie = (name, value, seconds) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${config.secure ? '; Secure' : ''}`;
  function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
  function redirect(res, url) { res.writeHead(303, { Location: url }); res.end(); }
  async function consume(res, group, principal, limit) {
    const result = await limiter.consume(hash(`${group}:${principal}`), limit, 60);
    if (!result.allowed) { res.setHeader('Retry-After', result.retryAfter); throw new AppError(429, 'rate_limited', 'Muitas requisições. Aguarde e tente novamente.'); }
  }
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if (config.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    try {
      if (!req.url.startsWith('/') || req.url.startsWith('//')) throw new AppError(400, 'invalid_url', 'URL inválida.');
      const url = new URL(req.url, config.publicUrl), route = url.pathname, ip = clientIp(req, config.trustedProxies);
      const jar = cookies(req), token = jar[sessionName];
      if (route === '/healthz' && req.method === 'GET') { await health(); return json(res, 200, { ok: true }); }
      if (route === '/auth/google' && req.method === 'GET') {
        await consume(res, 'auth-start', ip, config.limits.authStart);
        const flow = await identity.start(), flowToken = random();
        await auth.putFlow(hash(flowToken), { state: flow.state, nonce: flow.nonce, verifier: flow.verifier });
        res.setHeader('Set-Cookie', cookie(flowName, flowToken, 600)); return redirect(res, flow.url);
      }
      if (route === '/auth/google/callback' && req.method === 'GET') {
        await consume(res, 'auth-callback', ip, config.limits.authCallback);
        const flow = validToken(jar[flowName]) ? await auth.takeFlow(hash(jar[flowName])) : null;
        res.setHeader('Set-Cookie', cookie(flowName, '', 0));
        if (!flow) throw new AppError(401, 'invalid_login', 'Login inválido ou expirado. Tente novamente.');
        const person = await identity.finish(new URL(config.callbackUrl + url.search), flow);
        const nextToken = random(), csrf = random();
        if (validToken(token)) await auth.revokeSession(hash(token));
        await auth.createSession(hash(nextToken), csrf, person, config.sessionSeconds);
        res.setHeader('Set-Cookie', [cookie(flowName, '', 0), cookie(sessionName, nextToken, config.sessionSeconds)]);
        return redirect(res, '/?auth=complete');
      }
      if (route.startsWith('/api/')) {
        if (req.headers.origin && req.headers.origin !== config.publicUrl) throw new AppError(403, 'origin', 'Origem não permitida.');
        const group = req.method === 'GET' ? 'read' : req.method === 'PUT' ? 'save' : 'mutation';
        await consume(res, `${group}-ip`, ip, config.limits[group] * 5);
        const session = validToken(token) ? await auth.getSession(hash(token)) : null;
        if (route === '/api/session' && req.method === 'GET') return json(res, 200, { enabled: true, user: session ? { id: session.id, name: session.name } : null, csrf: session?.csrf });
        if (!session) throw new AppError(401, 'session_expired', 'Entre com Google para continuar. Sua edição permanece na memória.');
        await consume(res, group, session.id, config.limits[group]);
        if ((req.headers['x-account-id'] && req.headers['x-account-id'] !== session.id)
          || (req.method !== 'GET' && req.headers['x-account-id'] !== session.id)) throw new AppError(409, 'account_changed', 'A conta mudou. A edição anterior não será enviada para outra conta.');
        if (req.method !== 'GET' && (req.headers.origin !== config.publicUrl || !equal(req.headers['x-csrf-token'], session.csrf))) throw new AppError(403, 'csrf', 'Sessão de edição inválida. Entre novamente.');
        if (route === '/api/logout' && req.method === 'POST') {
          await auth.revokeSession(hash(token)); res.setHeader('Set-Cookie', cookie(sessionName, '', 0)); return json(res, 200, { ok: true });
        }
        if (route === '/api/systems' && req.method === 'GET') return json(res, 200, { systems: await systems.list(session.id) });
        if (route === '/api/systems' && req.method === 'POST') return json(res, 201, await systems.create(session.id, await readBody(req, config.bodyLimit)));
        const systemMatch = route.match(/^\/api\/systems\/([a-zA-Z0-9_-]{1,100})$/);
        if (systemMatch) {
          if (req.method === 'PUT') return json(res, 200, await systems.update(session.id, systemMatch[1], await readBody(req, config.bodyLimit)));
          if (req.method === 'DELETE') { await systems.remove(session.id, systemMatch[1], await readBody(req, config.bodyLimit)); return json(res, 200, { ok: true }); }
        }
        if (route === '/api/sheets' && req.method === 'GET') return json(res, 200, { sheets: await sheets.list(session.id) });
        if (route === '/api/sheets' && req.method === 'POST') return json(res, 201, await sheets.create(session.id, await readBody(req, config.bodyLimit)));
        const portraitMatch = route.match(/^\/api\/sheets\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/portrait$/i);
        if (portraitMatch && req.method === 'GET') {
          const photo = await sheets.portrait(session.id, portraitMatch[1]);
          if (!photo) { res.writeHead(204); return res.end(); }
          const image = photo.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/);
          if (!image) throw new AppError(404, 'not_found', 'Retrato não encontrado.');
          res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=60', 'Content-Length': Buffer.from(image[1], 'base64').length });
          return res.end(Buffer.from(image[1], 'base64'));
        }
        const match = route.match(/^\/api\/sheets\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
        if (match) {
          if (req.method === 'GET') return json(res, 200, await sheets.get(session.id, match[1]));
          if (req.method === 'PUT') return json(res, 200, await sheets.update(session.id, match[1], await readBody(req, config.bodyLimit)));
          if (req.method === 'DELETE') { await sheets.remove(session.id, match[1], await readBody(req, config.bodyLimit)); return json(res, 200, { ok: true }); }
        }
      } else if (await serveStatic(req, res, root, route)) return;
      throw new AppError(404, 'not_found', 'Recurso não encontrado.');
    } catch (error) {
      if (res.destroyed || res.writableEnded) return;
      const known = error instanceof AppError;
      if (known && error.code === 'invalid_login' && req.url.startsWith('/auth/google/callback')) return redirect(res, '/?auth=error');
      if (!known) logger.error('request_failed', { code: 'unavailable' });
      json(res, known ? error.status : 503, { error: { code: known ? error.code : 'unavailable', message: known ? error.message : 'Serviço indisponível. Suas alterações não foram confirmadas.' } });
    }
  };
}

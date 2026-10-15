import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createGoogleIdentity } from '../../server/infrastructure/google.js';
import { readConfig } from '../../server/config.js';
import { clientIp } from '../../server/http/handler.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test', alg: 'RS256', use: 'sig' };
const config = { googleClientId: 'test-client', googleClientSecret: 'test-secret', callbackUrl: 'https://hunter.example/auth/google/callback' };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function jwt(claims, valid = true) {
  const data = `${encode({ alg: 'RS256', kid: 'test' })}.${encode(claims)}`;
  return `${data}.${valid ? sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url') : Buffer.alloc(256).toString('base64url')}`;
}
async function identityFixture(change = {}, validSignature = true) {
  let claims, posted;
  const identity = await createGoogleIdentity(config, { fetcher: async (url, options) => {
    if (String(url).includes('well-known')) return Response.json({ issuer: 'https://accounts.google.com', authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      token_endpoint: 'https://oauth2.googleapis.com/token', jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs', response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'] });
    if (String(url).includes('certs')) return Response.json({ keys: [jwk] });
    posted = new URLSearchParams(options.body);
    return Response.json({ access_token: 'not-exposed', token_type: 'Bearer', id_token: jwt({ ...claims, ...change }, validSignature) });
  } });
  const flow = await identity.start();
  const now = Math.floor(Date.now() / 1000);
  claims = { iss: 'https://accounts.google.com', sub: 'stable-subject', aud: 'test-client', iat: now, exp: now + 300, nonce: flow.nonce, name: 'Caçador' };
  return { identity, flow, posted: () => posted, url: new URL(`${config.callbackUrl}?code=test-code&state=${flow.state}`) };
}
test('Google OIDC validates a signed ID token and sends state, nonce and PKCE', async () => {
  const { identity, flow, url, posted } = await identityFixture();
  const start = new URL(flow.url); assert.equal(start.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(start.searchParams.get('state'), flow.state); assert.equal(start.searchParams.get('nonce'), flow.nonce);
  const person = await identity.finish(url, flow);
  assert.equal(person.subject, 'stable-subject'); assert.equal(person.issuer, 'https://accounts.google.com');
  assert.equal(posted().get('code_verifier'), flow.verifier); assert.equal(person.access_token, undefined);
});
test('Google OIDC rejects signature, issuer, audience, nonce, state and expiry violations', async () => {
  for (const [change, signature] of [[{}, false], [{ iss: 'https://evil.example' }, true], [{ aud: 'other' }, true], [{ nonce: 'wrong' }, true], [{ exp: 1 }, true]]) {
    const fixture = await identityFixture(change, signature); await assert.rejects(fixture.identity.finish(fixture.url, fixture.flow), /inválido/);
  }
  const fixture = await identityFixture(); fixture.url.searchParams.set('state', 'wrong');
  await assert.rejects(fixture.identity.finish(fixture.url, fixture.flow), /inválido/);
});
test('configuration requires HTTPS and restricts callbacks; IP headers require an explicit trusted hop', () => {
  const env = { DATABASE_URL: 'fake', GOOGLE_CLIENT_ID: 'fake', GOOGLE_CLIENT_SECRET: 'fake' };
  assert.throws(() => readConfig({ ...env, PUBLIC_URL: 'http://public.example' }), /HTTPS/);
  assert.throws(() => readConfig({ ...env, GOOGLE_CALLBACK_URL: 'https://evil.example/auth/google/callback' }), /Callback/);
  const req = { socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } };
  assert.equal(clientIp(req, []), '127.0.0.1'); assert.equal(clientIp(req, ['127.0.0.1']), '5.6.7.8');
});

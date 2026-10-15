import * as oidc from 'openid-client';
import { AppError } from '../domain/errors.js';

export async function createGoogleIdentity(config, { fetcher } = {}) {
  const client = await oidc.discovery(new URL('https://accounts.google.com'), config.googleClientId, config.googleClientSecret, undefined,
    { timeout: 10, ...(fetcher ? { [oidc.customFetch]: fetcher } : {}) });
  // Validate ID-token signatures against the provider's published keys.
  oidc.enableNonRepudiationChecks(client);
  return {
    async start() {
      const verifier = oidc.randomPKCECodeVerifier(), state = oidc.randomState(), nonce = oidc.randomNonce();
      const url = oidc.buildAuthorizationUrl(client, { redirect_uri: config.callbackUrl, scope: 'openid profile', response_type: 'code',
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256', state, nonce, prompt: 'select_account' });
      return { url: url.href, state, nonce, verifier };
    },
    async finish(url, flow) {
      try {
        const tokens = await oidc.authorizationCodeGrant(client, url, { pkceCodeVerifier: flow.verifier, expectedState: flow.state, expectedNonce: flow.nonce, idTokenExpected: true });
        const claims = tokens.claims();
        if (claims.iss !== 'https://accounts.google.com' || typeof claims.sub !== 'string' || !claims.sub) throw Error('Identidade inválida.');
        // The application session uses the validated identity claims.
        return { issuer: claims.iss, subject: claims.sub, name: String(claims.name || 'Caçador').slice(0, 200) };
      } catch { throw new AppError(401, 'invalid_login', 'Login inválido ou expirado. Tente novamente.'); }
    }
  };
}

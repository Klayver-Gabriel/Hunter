export function readConfig(env = process.env) {
  const publicUrl = new URL(env.PUBLIC_URL || 'http://127.0.0.1:4173');
  if (publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash || publicUrl.username || publicUrl.password) throw Error('PUBLIC_URL deve conter apenas a origem.');
  if (publicUrl.protocol !== 'https:' && !(publicUrl.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(publicUrl.hostname))) throw Error('PUBLIC_URL exige HTTPS, exceto em loopback.');
  const callbackUrl = new URL(env.GOOGLE_CALLBACK_URL || '/auth/google/callback', publicUrl);
  if (callbackUrl.origin !== publicUrl.origin || callbackUrl.pathname !== '/auth/google/callback' || callbackUrl.search || callbackUrl.hash || callbackUrl.username || callbackUrl.password) throw Error('Callback deve usar a mesma origem e /auth/google/callback.');
  for (const key of ['DATABASE_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) if (!env[key]) throw Error(`Configure ${key} no ambiente privado.`);
  const positive = (key, fallback) => {
    const value = Number(env[key] || fallback);
    if (!Number.isSafeInteger(value) || value < 1) throw Error(`Configuração inválida: ${key}`);
    return value;
  };
  return {
    publicUrl: publicUrl.origin, callbackUrl: callbackUrl.href, secure: publicUrl.protocol === 'https:',
    databaseUrl: env.DATABASE_URL, googleClientId: env.GOOGLE_CLIENT_ID, googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    port: positive('PORT', 4173), host: env.HOST || '127.0.0.1', sessionSeconds: positive('SESSION_SECONDS', 28800),
    bodyLimit: positive('MAX_BODY_BYTES', 1048576), trustedProxies: (env.TRUSTED_PROXY_IPS || '').split(',').map(v => v.trim()).filter(Boolean),
    limits: { authStart: positive('RATE_AUTH_START', 20), authCallback: positive('RATE_AUTH_CALLBACK', 40),
      read: positive('RATE_READ', 300), save: positive('RATE_SAVE', 120), mutation: positive('RATE_MUTATION', 30) }
  };
}

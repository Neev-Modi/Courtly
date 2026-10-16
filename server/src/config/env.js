import { readDatabaseConfig } from './database.js';

import { parseTtl } from '../modules/auth/token.service.js';

export function readConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const appOrigin = env.APP_ORIGIN || 'http://localhost:5173';
  const origin = new URL(appOrigin);
  if (origin.origin !== appOrigin || (production && origin.protocol !== 'https:'))
    throw new Error(
      'APP_ORIGIN must be an origin without a trailing slash; production requires HTTPS.',
    );
  const port = Number(env.PORT || 8080);
  const apiOrigin = env.API_ORIGIN || `http://localhost:${port}`;
  if (new URL(apiOrigin).origin !== apiOrigin || (production && !apiOrigin.startsWith('https://')))
    throw new Error('API_ORIGIN must be an origin; production requires HTTPS.');
  const accessTtl = parseTtl(env.JWT_ACCESS_TTL || '900s', 'JWT_ACCESS_TTL');
  const refreshTtl = parseTtl(env.JWT_REFRESH_TTL || '30d', 'JWT_REFRESH_TTL');
  if (accessTtl >= refreshTtl) throw new Error('JWT_REFRESH_TTL must exceed JWT_ACCESS_TTL.');
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    if (env[key] && (env[key].length < 32 || ['done', 'change_me'].includes(env[key])))
      throw new Error(`${key} must contain at least 32 characters of random secret material.`);
  }
  if (env.JWT_ACCESS_SECRET && env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET)
    throw new Error('Use different access and refresh secrets.');
  const trustProxy = Number(env.TRUST_PROXY_HOPS || 0);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  if (!Number.isInteger(trustProxy) || trustProxy < 0) throw new Error('Invalid TRUST_PROXY_HOPS.');
  const domain = (env.ALLOWED_EMAIL_DOMAIN || 'nitw.ac.in').toLowerCase().trim();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new Error('Invalid ALLOWED_EMAIL_DOMAIN.');
  const config = {
    production,
    port,
    appOrigin,
    trustProxy,
    domain,
    apiOrigin,
    accessTtl,
    refreshTtl,
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    ...readDatabaseConfig(env),
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    callbackUrl: env.GOOGLE_CALLBACK_URL || `${apiOrigin}/auth/google/callback`,
    adminEmails: (env.ADMIN_EMAILS || '')
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  };
  const callback = new URL(config.callbackUrl);
  if (
    ![appOrigin, apiOrigin].includes(callback.origin) ||
    !['/auth/google/callback', '/api/auth/google/callback'].includes(callback.pathname) ||
    callback.search ||
    callback.hash
  )
    throw new Error(
      'GOOGLE_CALLBACK_URL must use APP_ORIGIN or API_ORIGIN and a supported auth callback path.',
    );
  if (new URL(apiOrigin).hostname !== origin.hostname)
    throw new Error(
      'APP_ORIGIN and API_ORIGIN must use the same hostname for cookie authentication.',
    );
  config.ready = Boolean(
    config.databaseReady &&
    config.accessSecret &&
    config.refreshSecret &&
    config.clientId &&
    config.clientSecret &&
    !config.clientId.startsWith('your_'),
  );
  if (production && !config.ready)
    throw new Error(
      'Production requires PostgreSQL settings, JWT secrets and Google OAuth credentials.',
    );
  return config;
}

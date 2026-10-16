import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../shared/errors.js';

export function parseTtl(value, name) {
  const match = /^(\d+)(s|m|h|d)$/.exec(String(value));
  const seconds = match ? Number(match[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[match[2]] : 0;
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 90 * 86400)
    throw new Error(`${name} must be a positive duration with s, m, h or d, up to 90d.`);
  return seconds;
}

export function createTokenService(config) {
  const options = { issuer: 'courtly', audience: 'courtly-web', algorithm: 'HS256' };
  function sign(type, sid, userId) {
    return jwt.sign({ sid, type }, type === 'access' ? config.accessSecret : config.refreshSecret, {
      ...options,
      subject: userId,
      jwtid: randomUUID(),
      expiresIn: type === 'access' ? config.accessTtl : config.refreshTtl,
    });
  }
  return {
    issue(sid, userId) {
      return { token: sign('access', sid, userId), refreshToken: sign('refresh', sid, userId) };
    },
    verify(token, type, ignoreExpiration = false) {
      try {
        const payload = jwt.verify(
          token,
          type === 'access' ? config.accessSecret : config.refreshSecret,
          {
            algorithms: ['HS256'],
            issuer: options.issuer,
            audience: options.audience,
            ignoreExpiration,
          },
        );
        if (
          payload.type !== type ||
          typeof payload.sub !== 'string' ||
          !/^[A-Za-z0-9_-]{43}$/.test(payload.sid)
        )
          throw new Error('Invalid token');
        return payload;
      } catch {
        throw new AppError(
          401,
          'UNAUTHENTICATED',
          'Your session has expired. Please sign in again.',
        );
      }
    },
  };
}

import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { AppError } from '../../shared/errors.js';
import { permissionsFor } from '../authorization/permissions.js';
import { createTokenService } from './token.service.js';
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const randomToken = () => randomBytes(32).toString('base64url');
export const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  permissions: permissionsFor(user.role),
  createdAt: user.created_at,
});
export function createAuthService({ repository, provider, config }) {
  const tokens = createTokenService(config);
  async function sessionUser(payload) {
    const user = await repository.sessionUser(hashToken(payload.sid));
    if (!user || user.id !== payload.sub)
      throw new AppError(401, 'UNAUTHENTICATED', 'Please sign in again.');
    if (user.is_banned || !allowed(user))
      throw new AppError(403, 'ACCOUNT_DISABLED', 'Your account does not have access.');
    return user;
  }
  function allowed(user) {
    return user.role === 'admin' || user.email.split('@')[1]?.endsWith(config.domain);
  }
  return {
    async begin() {
      const state = randomToken(),
        verifier = randomToken(),
        nonce = randomToken();
      await repository.storeAttempt(hashToken(state), verifier, nonce);
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      return { state, url: provider.authorizationUrl({ state, challenge, nonce }) };
    },
    async complete({ state, cookieState, code }) {
      if (
        typeof state !== 'string' ||
        typeof cookieState !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(state) ||
        !/^[A-Za-z0-9_-]{43}$/.test(cookieState) ||
        !timingSafeEqual(Buffer.from(state), Buffer.from(cookieState))
      )
        throw new AppError(400, 'INVALID_STATE', 'Your sign-in expired. Please try again.');
      const attempt = await repository.consumeAttempt(hashToken(state));
      if (!attempt || typeof code !== 'string' || !code || code.length > 4096)
        throw new AppError(400, 'INVALID_STATE', 'Your sign-in expired. Please try again.');
      const profile = await provider.exchange(code, attempt.verifier, attempt.nonce);
      if (profile.email_verified !== true || !profile.sub || typeof profile.email !== 'string')
        throw new AppError(403, 'UNVERIFIED_EMAIL', 'Use a verified Google account.');
      const email = profile.email.trim().toLowerCase();
      const existing = await repository.findUser(profile.sub);
      if (existing?.is_banned)
        throw new AppError(
          403,
          'ACCOUNT_DISABLED',
          'Your account is disabled. Contact your campus administrator.',
        );
      const role = existing?.role || (config.adminEmails.includes(email) ? 'admin' : 'user');
      if (!allowed({ email, role }))
        throw new AppError(403, 'DOMAIN_RESTRICTED', `Use your *${config.domain} Google account.`);
      const user = await repository.saveUser({
        id: randomUUID(),
        subject: profile.sub,
        email,
        name: String(profile.name || email.split('@')[0]).slice(0, 160),
        role,
      });
      if (user.is_banned) throw new AppError(403, 'ACCOUNT_DISABLED', 'Your account is disabled.');
      const sid = randomToken();
      const pair = tokens.issue(sid, user.id);
      await repository.createSession(
        hashToken(sid),
        user.id,
        new Date(Date.now() + config.refreshTtl * 1000),
        hashToken(pair.refreshToken),
      );
      return { ...pair, user: publicUser(user) };
    },
    async currentUser(token) {
      const user = await sessionUser(tokens.verify(token, 'access'));
      return publicUser(user);
    },
    async refresh(refreshToken) {
      const payload = tokens.verify(refreshToken, 'refresh');
      const user = await sessionUser(payload);
      const pair = tokens.issue(payload.sid, user.id);
      if (
        !(await repository.rotateRefresh(
          hashToken(payload.sid),
          hashToken(refreshToken),
          hashToken(pair.refreshToken),
        ))
      )
        throw new AppError(
          401,
          'UNAUTHENTICATED',
          'Refresh token has already been used. Please sign in again.',
        );
      return { ...pair, user: publicUser(user) };
    },
    async logout(token, refreshToken) {
      for (const [value, type] of [
        [token, 'access'],
        [refreshToken, 'refresh'],
      ]) {
        if (!value) continue;
        let payload;
        try {
          payload = tokens.verify(value, type, true);
        } catch {
          continue;
        }
        await repository.deleteSession(hashToken(payload.sid));
      }
    },
  };
}

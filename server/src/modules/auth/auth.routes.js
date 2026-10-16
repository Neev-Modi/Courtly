import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { asyncHandler, AppError } from '../../shared/errors.js';
import { requireAuth, requireSameOrigin } from './auth.middleware.js';
import { requirePermission } from '../authorization/authorization.middleware.js';
export function createAuthRouter({ service, config }) {
  const router = Router();
  const sessionName = config.production ? '__Host-courtly_access' : 'courtly_access';
  const refreshName = config.production ? '__Host-courtly_refresh' : 'courtly_refresh';
  const stateName = config.production ? '__Host-courtly_oauth' : 'courtly_oauth';
  const cookie = { httpOnly: true, secure: config.production, sameSite: 'lax', path: '/' };
  function setTokens(res, pair) {
    res.cookie(sessionName, pair.token, { ...cookie, maxAge: config.accessTtl * 1000 });
    res.cookie(refreshName, pair.refreshToken, { ...cookie, maxAge: config.refreshTtl * 1000 });
  }
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/config', (req, res) => res.json({ enabled: config.ready, domain: config.domain }));
  router.use((req, res, next) =>
    config.ready
      ? next()
      : next(
          new AppError(
            503,
            'AUTH_NOT_CONFIGURED',
            'Sign-in is not configured yet. Please contact the administrator.',
          ),
        ),
  );
  const limiter = rateLimit({
    windowMs: 15 * 60000,
    limit: 1000,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many sign-in attempts. Try again in 15 minutes.',
      },
    },
  });
  router.get(
    '/google',
    limiter,
    asyncHandler(async (req, res) => {
      try {
        const { state, url } = await service.begin();
        res.cookie(stateName, state, { ...cookie, maxAge: 600000 });
        res.redirect(url);
      } catch (error) {
        console.error('Sign-in initialization failed:', error.code || error.name);
        res.redirect(303, `${config.appOrigin}/login?error=SIGN_IN_FAILED`);
      }
    }),
  );
  router.get(
    '/google/callback',
    limiter,
    asyncHandler(async (req, res) => {
      res.clearCookie(stateName, cookie);
      try {
        if (req.query.error) throw new AppError(400, 'SIGN_IN_CANCELLED', 'Sign-in was cancelled.');
        const pair = await service.complete({
          state: req.query.state,
          cookieState: req.cookies[stateName],
          code: req.query.code,
        });
        await service.logout(req.cookies[sessionName], req.cookies[refreshName]);
        setTokens(res, pair);
        res.redirect(
          303,
          `${config.appOrigin}/${pair.user.role === 'admin' ? 'admin' : 'dashboard'}`,
        );
      } catch (error) {
        if (!error.status) console.error('OAuth failed:', error.code || error.name);
        const known = [
          'INVALID_STATE',
          'UNVERIFIED_EMAIL',
          'ACCOUNT_DISABLED',
          'DOMAIN_RESTRICTED',
          'SIGN_IN_CANCELLED',
        ];
        res.redirect(
          303,
          `${config.appOrigin}/login?error=${known.includes(error.code) ? error.code : 'SIGN_IN_FAILED'}`,
        );
      }
    }),
  );
  router.get(
    '/me',
    requireAuth(service, sessionName),
    requirePermission('account:read'),
    (req, res) => res.json({ user: req.user }),
  );
  router.get(
    '/admin',
    requireAuth(service, sessionName),
    requirePermission('admin:access'),
    (req, res) => res.json({ message: 'Administrator access verified.' }),
  );
  router.post(
    '/refresh',
    requireSameOrigin(config),
    asyncHandler(async (req, res) => {
      const pair = await service.refresh(req.cookies[refreshName]);
      setTokens(res, pair);
      res.json({ user: pair.user });
    }),
  );
  router.post(
    '/logout',
    requireSameOrigin(config),
    asyncHandler(async (req, res) => {
      await service.logout(req.cookies[sessionName], req.cookies[refreshName]);
      res.clearCookie(sessionName, cookie);
      res.clearCookie(refreshName, cookie);
      res.status(204).end();
    }),
  );
  return router;
}

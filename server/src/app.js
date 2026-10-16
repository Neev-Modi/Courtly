import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { errorHandler } from './shared/errors.js';
import { requireAuth, requireSameOrigin } from './modules/auth/auth.middleware.js';
import { createCourtsRouter } from './modules/courts/courts.routes.js';
import { createBookingsRouter } from './modules/bookings/bookings.routes.js';
export function createApp(dependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', dependencies.config.trustProxy);
  app.use(helmet(), express.json({ limit: '10kb' }), cookieParser());
  app.use((req, res, next) => {
    if (
      ['POST', 'PUT', 'PATCH'].includes(req.method) &&
      (req.body === null || Array.isArray(req.body) || typeof req.body !== 'object')
    )
      return res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: 'Provide a JSON object.' } });
    next();
  });
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  const authRouter = createAuthRouter(dependencies);
  app.use('/api/auth', authRouter);
  app.use('/auth', authRouter);
  if (dependencies.courts && dependencies.bookings) {
    const authenticate = requireAuth(
      dependencies.service,
      dependencies.config.production ? '__Host-courtly_access' : 'courtly_access',
    );
    const protectWrite = (req, res, next) =>
      ['GET', 'HEAD', 'OPTIONS'].includes(req.method)
        ? next()
        : requireSameOrigin(dependencies.config)(req, res, next);
    const noCache = (req, res, next) => {
      res.set('Cache-Control', 'no-store');
      next();
    };
    app.use(
      '/api/courts',
      noCache,
      authenticate,
      protectWrite,
      createCourtsRouter(dependencies.courts),
    );
    app.use(
      '/api/bookings',
      noCache,
      authenticate,
      protectWrite,
      createBookingsRouter(dependencies.bookings),
    );
  }
  app.use('/api', (req, res) =>
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } }),
  );
  const dist = fileURLToPath(new URL('../../app/dist/', import.meta.url));
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (req, res) => res.sendFile(`${dist}/index.html`));
  }
  app.use(errorHandler);
  return app;
}

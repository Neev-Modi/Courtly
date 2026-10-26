import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requirePermission } from '../authorization/authorization.middleware.js';
import { asyncHandler } from '../../shared/errors.js';
export function createAnalysisRouter(service) {
  const router = Router();
  router.use(requirePermission('analysis:read'));
  router.post(
    '/reports',
    rateLimit({
      windowMs: 60000,
      limit: 20,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: {
        error: {
          code: 'REPORT_RATE_LIMIT',
          message: 'Too many report requests. Try again in a minute.',
        },
      },
    }),
    asyncHandler(async (req, res) => res.json({ report: await service.report(req.body) })),
  );
  return router;
}

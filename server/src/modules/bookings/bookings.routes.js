import { Router } from 'express';
import { asyncHandler } from '../../shared/errors.js';
import { requirePermission } from '../authorization/authorization.middleware.js';
export function createBookingsRouter(service) {
  const router = Router();
  router.get(
    '/availability',
    requirePermission('bookings:create'),
    asyncHandler(async (req, res) => res.json(await service.availability(req.query))),
  );
  router.get(
    '/mine',
    requirePermission('bookings:read'),
    asyncHandler(async (req, res) => res.json(await service.list(req.query, req.user))),
  );
  router.get(
    '/',
    requirePermission('bookings:manage'),
    asyncHandler(async (req, res) => res.json(await service.list(req.query, req.user, true))),
  );
  router.post(
    '/',
    requirePermission('bookings:create'),
    asyncHandler(async (req, res) =>
      res.status(201).json({ booking: await service.create(req.body, req.user) }),
    ),
  );
  router.post(
    '/:id/respond',
    requirePermission('bookings:read'),
    asyncHandler(async (req, res) =>
      res.json({ booking: await service.respond(req.params.id, req.body, req.user) }),
    ),
  );
  router.post(
    '/:id/cancel',
    requirePermission('bookings:read'),
    asyncHandler(async (req, res) =>
      res.json({ booking: await service.cancel(req.params.id, req.body, req.user) }),
    ),
  );

  // --- Future Module Endpoints (Cron & Email) ---
  // Endpoints for future cron triggers or external worker webhooks (protect with worker secret / IP allowlist):
  // POST /cron/expire-holds -> triggers service sweep for pending reservations past confirmation_deadline
  // POST /cron/reminders    -> triggers pre-game reminder emails (e.g. 1 hour before booking start)
  // POST /events/dispatch   -> triggers email worker to consume and send pending rows in courtly_events outbox

  return router;
}

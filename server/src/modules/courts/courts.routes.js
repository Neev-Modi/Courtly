import { Router } from 'express';
import { asyncHandler } from '../../shared/errors.js';
import { requirePermission } from '../authorization/authorization.middleware.js';
export function createCourtsRouter(service) {
  const router = Router();
  router.get(
    '/',
    requirePermission('courts:read'),
    asyncHandler(async (req, res) => res.json({ items: await service.list(req.user) })),
  );
  router.post(
    '/',
    requirePermission('courts:manage'),
    asyncHandler(async (req, res) =>
      res.status(201).json({ court: await service.create(req.body, req.user) }),
    ),
  );
  router.put(
    '/:id',
    requirePermission('courts:manage'),
    asyncHandler(async (req, res) =>
      res.json({ court: await service.update(req.params.id, req.body, req.user) }),
    ),
  );
  router.get(
    '/:id/blocks',
    requirePermission('courts:read'),
    asyncHandler(async (req, res) => res.json({ items: await service.blocks(req.params.id) })),
  );
  router.post(
    '/:id/blocks',
    requirePermission('courts:manage'),
    asyncHandler(async (req, res) =>
      res.status(201).json({ block: await service.addBlock(req.params.id, req.body, req.user) }),
    ),
  );
  router.delete(
    '/:id/blocks/:blockId',
    requirePermission('courts:manage'),
    asyncHandler(async (req, res) => {
      await service.removeBlock(req.params.id, req.params.blockId, req.user);
      res.status(204).end();
    }),
  );
  return router;
}

import { AppError, asyncHandler } from '../../shared/errors.js';
export const requireAuth = (service, cookieName) =>
  asyncHandler(async (req, res, next) => {
    req.user = await service.currentUser(req.cookies[cookieName]);
    next();
  });
export const requireSameOrigin = (config) => (req, res, next) => {
  if (req.get('origin') !== config.appOrigin)
    return next(new AppError(403, 'INVALID_ORIGIN', 'Request origin is not allowed.'));
  next();
};

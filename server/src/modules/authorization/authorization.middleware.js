import { AppError } from '../../shared/errors.js';
import { hasPermission } from './permissions.js';
export const requirePermission = (permission) => (req, res, next) => {
  if (!req.user) return next(new AppError(401, 'UNAUTHENTICATED', 'Please sign in to continue.'));
  if (!hasPermission(req.user.role, permission))
    return next(
      new AppError(403, 'FORBIDDEN', 'Your account does not have permission for this action.'),
    );
  next();
};

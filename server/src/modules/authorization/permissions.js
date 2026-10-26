// Central policy: future modules add permissions here and enforce them on the API.
const rolePermissions = Object.freeze({
  user: Object.freeze(['account:read', 'courts:read', 'bookings:create', 'bookings:read']),
  admin: Object.freeze([
    'account:read',
    'admin:access',
    'courts:read',
    'courts:manage',
    'bookings:create',
    'bookings:read',
    'bookings:manage',
    'analysis:read',
  ]),
});
export const permissionsFor = (role) =>
  Object.hasOwn(rolePermissions, role) ? [...rolePermissions[role]] : [];
export const hasPermission = (role, permission) => permissionsFor(role).includes(permission);

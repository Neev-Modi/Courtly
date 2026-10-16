# Authentication and authorization

Authentication answers who the caller is: Google proves identity, then Courtly verifies its access JWT and resolves its session against PostgreSQL. Refresh JWTs are separately signed and rotated. Authorization checks what that identity can do. Every authenticated request loads the current database user, so bans and role changes take effect without waiting for a token to expire.

| Role    | `account:read` | `admin:access` |
| ------- | -------------- | -------------- |
| user    | Yes            | No             |
| admin   | Yes            | Yes            |
| unknown | No             | No             |

`server/src/modules/authorization/permissions.js` is the central policy. `requirePermission(permission)` enforces it after `requireAuth`. Unknown permissions and roles are denied. Frontend route guards improve navigation, while backend middleware is the enforcement boundary. Caller-supplied roles or permission lists are never trusted.

Example for a future module:

```js
router.get(
  '/resource',
  requireAuth(service, cookieName),
  requirePermission('resource:read'),
  handler,
);
```

Add the permission to the appropriate roles first. For user-owned records, also enforce ownership in that module's service/repository using `req.user.id`; a role check alone does not authorize another user's records. Booking services enforce participant response ownership and organizer/admin cancellation ownership. Courts and all-bookings administration require their own management permissions. See the court and booking module guide.

Administrator bootstrap is restricted to verified emails in `ADMIN_EMAILS` at first sign-in. Existing database roles are preserved. There is no self-service role elevation endpoint. `/api/auth/me` returns public identity and derived permissions; `/api/auth/admin` independently enforces administrator permission.

# Courtly · Campus badminton

Court and booking management is now implemented: court administration, maintenance blocks, slot availability, in-app invitations, confirmation, cancellation and history. See [module guide and working demo](docs/courts-bookings.md). Run `npm.cmd run demo` for an isolated interactive demonstration with sample users. Email and cron services are intentionally not implemented.

Modular authentication and authorization for the Badminton Court Management System. The secondary OOPS-Project-final directory is a read-only prototype; all implementation lives in this primary workspace.

## Local setup using your existing environment keys

Requires Node.js 22.13+ and a running PostgreSQL 14+ server.

1. Run `npm.cmd install` at the project root.
2. Create your own root `.env` from `.env.example`. No `.env` is generated or modified by this project.
3. Fill `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD`. Alternatively supply `DATABASE_URL`, which takes precedence over the separate fields.
4. Fill two different `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values (at least 32 characters of random secret material each). Existing strong secrets can be reused. `done` is not a valid secret. Keep `JWT_ACCESS_TTL=900s` and `JWT_REFRESH_TTL=30d`, or use positive durations ending in s, m, h or d.
5. Fill `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Register **http://localhost:8080/auth/google/callback** as the authorized redirect URI for your Google OAuth Web application client. Configure consent/test-user access as appropriate.
6. Keep `PORT=8080`, `APP_ORIGIN=http://localhost:5173`, `API_ORIGIN=http://localhost:8080`, and `GOOGLE_CALLBACK_URL=http://localhost:8080/auth/google/callback`.
7. Create the database if it does not already exist, run the schema command, then start the app as shown below.

`MAIL_*` and `APP_SIGNING_SECRET` may remain in your `.env`; this module ignores them. No mail credentials or additional API keys are required. Optional `ADMIN_EMAILS` grants administrator access to matching verified Google identities **only at their first signup**. Campus access defaults to `nitw.ac.in`.

## Commands (from the project root)

```powershell
npm.cmd install

# Only if badminton_db does not already exist:
psql -U postgres -h localhost -p 5432 -c "CREATE DATABASE badminton_db;"

# Creates/updates only this module's auth_* tables:
npm.cmd run db:migrate

# Run both backend and frontend:
npm.cmd run dev
```

Or start each server in a separate terminal at the project root:

```powershell
# Terminal 1: backend on 8080
npm.cmd run dev -w server
```

```powershell
# Terminal 2: frontend on 5173
npm.cmd run dev -w app
```

Open **http://localhost:5173**. Restart both servers after changing `.env`. If npm's Windows shim fails, replace `npm.cmd` with `& 'C:\Program Files\nodejs\npm.cmd'`.

If you already ran the previous schema, run `npm.cmd run db:migrate` again: it applies tracked auth, court, booking and event migrations without removing tables or records. Existing opaque-cookie logins require a fresh Google sign-in after this JWT upgrade. Legacy prototype `users`, courts, and booking tables are neither modified nor imported. Migration affects only the database you explicitly configure; no migration runs automatically on startup.

## Authentication and authorization

- Google OAuth / OpenID Connect verifies identity, email, audience, nonce, browser-bound one-time state and PKCE.
- The API issues HS256 **access and refresh JWTs**, using separate secrets and explicit token types, issuer, audience and expiry checks.
- Tokens stay in HttpOnly, SameSite=Lax cookies, with Secure cookies in production. They are never stored in localStorage or exposed to frontend JavaScript.
- PostgreSQL stores the hashed session identifier and refresh token hash. Refresh rotates the refresh token with an atomic compare-and-update query; an already-used refresh token is rejected.
- On a 401, the frontend attempts one refresh and retries the original request once. Concurrent requests within the same tab share a refresh attempt. Separate tabs can race; a losing refresh may require retrying the request after the other tab updates cookies.
- A session has an absolute lifetime matching the initial refresh TTL (30 days by default); refreshing does not extend this database deadline.
- Every protected request loads the current database role and ban status. Logout revokes the session immediately, including unexpired access tokens. Roles in browser input are never trusted.
- Authorization policies live in a separate module. `account:read` allows users and administrators; `admin:access` allows only administrators. Unknown roles and permissions are denied.
- Same-origin checks protect refresh/logout. Sign-in is rate limited.

Sign-up happens on the first successful Google sign-in. Court booking, invitations, court administration and maintenance are available. Password login/reset, email delivery, and scheduled jobs remain outside this increment. The frontend is responsive and light-only.

## Structure

```text
app/src/
  app/                     Routes and composition
  features/auth/           Auth context, API, guards, pages, components, CSS Module
  features/account/        Protected account page and CSS Module
  shared/                  API client (refresh/retry), reusable UI
  styles/                  Light theme tokens and global foundations
server/src/
  config/                  Environment validation
  db/                      Local/remote PostgreSQL pool and schema migration
  modules/auth/            Routes, service, JWT service, repository, Google provider
  modules/authorization/   Permission policy and middleware
  modules/courts/          Court and maintenance routes, services, repositories
  modules/bookings/        Booking policy, routes, service and repository
  modules/events/          Transactional event outbox for future workers
  shared/                  Error contracts and async handling
  app.js                   Injectable Express application
  index.js                 Composition, cleanup and shutdown
server/test/               Policy, JWT, configuration and HTTP tests
```

See [database switching](docs/database.md) and [authorization policy](docs/authorization.md).

## HTTP routes and local proxy

Frontend requests use `/api/auth/*` through Vite's proxy to `API_ORIGIN`. The backend mounts the same router at `/api/auth` and `/auth` so your existing Google callback URL works unchanged. Localhost cookies are shared between ports; use `localhost` consistently, not a mix of `localhost` and `127.0.0.1`. Frontend and backend must share a hostname. A remote database does not change this arrangement.

| Method | Path (both /api/auth and /auth prefixes work) | Purpose                                 |
| ------ | --------------------------------------------- | --------------------------------------- |
| GET    | `/api/auth/config`                            | Public configuration availability       |
| GET    | `/api/auth/google`                            | Start sign-in                           |
| GET    | `/auth/google/callback`                       | Google callback                         |
| GET    | `/api/auth/me`                                | Current identity and permissions        |
| GET    | `/api/auth/admin`                             | Server-enforced administrator check     |
| POST   | `/api/auth/refresh`                           | Rotate refresh JWT and issue access JWT |
| POST   | `/api/auth/logout`                            | Revoke session and clear both cookies   |

`GET /api/health` reports process liveness, not database readiness. No configuration means preview/setup mode with sign-in disabled. Invalid supplied secrets/settings fail startup with a configuration message.

## Checks and deployment

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run format:check
```

Tests use a mocked Google provider and in-memory repository and exercise actual HTTP routes. Live Google consent and real PostgreSQL connectivity require your environment values and are not covered by those mocks.

For deployment, build the frontend, set `NODE_ENV=production`, configure HTTPS origins and the registered callback, then run `npm.cmd start`. The backend also serves the frontend build. Prefer a single HTTPS origin. Configure the exact trusted reverse proxy count using `TRUST_PROXY_HOPS` and verified database TLS when appropriate. The rate limiter is process-local; multiple API instances need a shared limiter store. Sessions and OAuth state already use PostgreSQL.

# Local and remote PostgreSQL

The adapter in `server/src/db/pool.js` accepts either separate PG fields or a connection URL. Repositories contain SQL; authentication and authorization do not depend on database location. PostgreSQL 14+ is required.

## Local development (your existing format)

```dotenv
PGHOST=localhost
PGPORT=5432
PGDATABASE=badminton_db
PGUSER=postgres
PGPASSWORD=your_actual_password
DATABASE_SSL=false
```

Create the database only if it does not exist. Run `npm.cmd run db:migrate` after configuration. The command creates isolated `auth_users`, `auth_sessions`, and `auth_oauth_attempts` tables and adds the JWT refresh-hash column if missing. It does not import or modify prototype users/bookings. No database command is run automatically at server startup.

## Remote database, local application

Change the existing fields; no source-code changes are required:

```dotenv
PGHOST=your-db-host
PGPORT=5432
PGDATABASE=your_remote_database
PGUSER=your_remote_user
PGPASSWORD=your_remote_password
DATABASE_SSL=true
DATABASE_POOL_MAX=5
DATABASE_CONNECT_TIMEOUT_MS=10000
```

Or set `DATABASE_URL=postgresql://user:password@host:5432/database`. A nonempty `DATABASE_URL` takes precedence over all separate PG fields. Remove it or leave it empty to switch back to PG fields. URL-encode credentials only when embedding them in a URL; separate PGPASSWORD accepts literal special characters.

Keep `APP_ORIGIN=http://localhost:5173`, `API_ORIGIN=http://localhost:8080` and your localhost Google callback when only the database is remote. Restart the servers and run the migration against the chosen database.

Provider network rules must permit your machine to connect. Use a direct PostgreSQL endpoint or session pooler. SSL verifies server certificates; a custom provider CA can be supplied via `DATABASE_CA_CERT_PATH` (absolute or relative to the project root). Do not add sslmode/sslcert/sslkey/sslrootcert URL parameters; configure TLS through the explicit environment settings. Certificate verification stays enabled.

Switching configuration selects a different database; it does not transfer users or sessions. Database migration between hosts requires a separate backup/restore procedure. The initial schema is idempotent; future schema changes should use separate versioned migrations.

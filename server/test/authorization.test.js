import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasPermission, permissionsFor } from '../src/modules/authorization/permissions.js';
import { requirePermission } from '../src/modules/authorization/authorization.middleware.js';
import { readConfig } from '../src/config/env.js';
import { databaseOptions } from '../src/db/pool.js';
test('authorization denies unknown roles and permissions by default', () => {
  assert.equal(hasPermission('user', 'account:read'), true);
  assert.equal(hasPermission('user', 'admin:access'), false);
  assert.equal(hasPermission('admin', 'admin:access'), true);
  assert.equal(hasPermission('superadmin', 'account:read'), false);
  assert.equal(hasPermission('__proto__', 'account:read'), false);
  assert.equal(hasPermission('admin', 'unknown:permission'), false);
  const permissions = permissionsFor('user');
  permissions.push('admin:access');
  assert.equal(hasPermission('user', 'admin:access'), false);
});
test('permission middleware distinguishes unauthenticated and forbidden requests', () => {
  const gate = requirePermission('admin:access');
  gate({}, {}, (err) => assert.equal(err.status, 401));
  gate({ user: { role: 'user', permissions: ['admin:access'] } }, {}, (err) =>
    assert.equal(err.status, 403),
  );
  gate({ user: { role: 'admin' } }, {}, (err) => assert.equal(err, undefined));
});
test('local and remote PostgreSQL use identical repository connection configuration', () => {
  const local = databaseOptions(
    readConfig({ DATABASE_URL: 'postgresql://postgres:password@localhost:5432/courtly' }),
  );
  assert.equal(local.ssl, false);
  assert.equal(local.max, 10);
  const remote = databaseOptions(
    readConfig({
      DATABASE_URL: 'postgresql://user:password@db.example.com:5432/courtly',
      DATABASE_SSL: 'true',
      DATABASE_POOL_MAX: '5',
    }),
  );
  assert.deepEqual(remote.ssl, { rejectUnauthorized: true });
  assert.equal(remote.max, 5);
  assert.throws(() =>
    readConfig({ DATABASE_URL: 'postgresql://localhost/courtly?sslmode=no-verify' }),
  );
  assert.throws(() => readConfig({ DATABASE_SSL: 'maybe' }));
  assert.throws(() => readConfig({ DATABASE_POOL_MAX: '0' }));
});

test('legacy PG fields, port, origins and JWT durations are supported', () => {
  const env = {
    PORT: '8080',
    PGHOST: 'localhost',
    PGPORT: '5432',
    PGDATABASE: 'badminton_db',
    PGUSER: 'postgres',
    PGPASSWORD: 'test-password',
    JWT_ACCESS_SECRET: 'a'.repeat(40),
    JWT_REFRESH_SECRET: 'b'.repeat(40),
    JWT_ACCESS_TTL: '900s',
    JWT_REFRESH_TTL: '30d',
    GOOGLE_CLIENT_ID: 'test-client',
    GOOGLE_CLIENT_SECRET: 'test-secret',
    GOOGLE_CALLBACK_URL: 'http://localhost:8080/auth/google/callback',
    APP_ORIGIN: 'http://localhost:5173',
    API_ORIGIN: 'http://localhost:8080',
  };
  const config = readConfig(env);
  const db = databaseOptions(config);
  assert.equal(config.ready, true);
  assert.equal(config.accessTtl, 900);
  assert.equal(config.refreshTtl, 2592000);
  assert.equal(db.host, 'localhost');
  assert.equal(db.port, 5432);
  assert.equal(db.database, 'badminton_db');
  assert.equal(db.password, 'test-password');
  const remote = databaseOptions(
    readConfig({
      ...env,
      DATABASE_URL: 'postgresql://remote:pass@db.example.com:5432/remote',
      DATABASE_SSL: 'true',
    }),
  );
  assert.equal(remote.connectionString, 'postgresql://remote:pass@db.example.com:5432/remote');
  assert.equal(remote.host, undefined);
  assert.throws(() => readConfig({ ...env, JWT_ACCESS_SECRET: 'done' }));
  assert.throws(() => readConfig({ ...env, JWT_REFRESH_SECRET: env.JWT_ACCESS_SECRET }));
  assert.throws(() => readConfig({ ...env, JWT_ACCESS_TTL: 'garbage' }));
  assert.throws(() => readConfig({ ...env, PGPORT: 'invalid' }));
});

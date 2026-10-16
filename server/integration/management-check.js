import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readDatabaseConfig } from '../src/config/database.js';
import { createPool } from '../src/db/pool.js';
import { migrateDatabase } from '../src/db/migrations.js';
import { createApp } from '../src/app.js';
import { createAuthService, hashToken } from '../src/modules/auth/auth.service.js';
import { createAuthRepository } from '../src/modules/auth/auth.repository.js';
import { createTokenService } from '../src/modules/auth/token.service.js';
import { createCourtsService } from '../src/modules/courts/courts.service.js';
import { createBookingsService } from '../src/modules/bookings/bookings.service.js';

const settings = readDatabaseConfig();
const pool = createPool(settings),
  schema = `courtly_test_${randomBytes(8).toString('hex')}`;
let server;
const isolated = {
  async connect() {
    const client = await pool.connect();
    await client.query(`SET search_path TO "${schema}"`);
    return client;
  },
  async query(...args) {
    const client = await this.connect();
    try {
      return await client.query(...args);
    } finally {
      client.release();
    }
  },
};
const config = {
  ...settings,
  production: false,
  ready: true,
  appOrigin: 'http://localhost:5173',
  domain: 'nitw.ac.in',
  accessSecret: randomBytes(32).toString('hex'),
  refreshSecret: randomBytes(32).toString('hex'),
  accessTtl: 900,
  refreshTtl: 2592000,
};
let now = new Date('2030-06-10T00:00:00Z');
const clock = () => now;
const users = {};
let assertions = 0;
function check(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions++;
  console.log(`PASS ${message}`);
}
try {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  await migrateDatabase(isolated);
  await migrateDatabase(isolated);
  const authRepo = createAuthRepository(isolated),
    tokens = createTokenService(config);
  for (const name of [
    'admin',
    'alice',
    'bob',
    'cara',
    'dan',
    'eve',
    'finn',
    'gina',
    'hari',
    'outsider',
  ]) {
    const id = randomUUID(),
      sid = randomBytes(32).toString('base64url'),
      email = `${name}@nitw.ac.in`;
    await isolated.query(
      'INSERT INTO auth_users(id,google_subject,email,name,role) VALUES($1,$2,$3,$4,$5)',
      [id, id, email, name, name === 'admin' ? 'admin' : 'user'],
    );
    const pair = tokens.issue(sid, id);
    await authRepo.createSession(
      hashToken(sid),
      id,
      new Date(Date.now() + 3600000),
      hashToken(pair.refreshToken),
    );
    users[name] = { id, email, cookie: `courtly_access=${pair.token}` };
  }
  const service = createAuthService({ repository: authRepo, provider: {}, config });
  server = createApp({
    service,
    config,
    courts: createCourtsService(isolated, clock),
    bookings: createBookingsService(isolated, config, clock),
  }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(name, path, method = 'GET', body, origin = config.appOrigin) {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        ...(name ? { Cookie: users[name].cookie } : {}),
        Origin: origin,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: response.status,
      body: response.status === 204 ? null : await response.json(),
    };
  }
  const courtData = {
    name: 'Test Court 1',
    location: 'Test Sports Hall',
    description: 'Isolated integration fixture',
  };
  check((await call(null, '/courts')).status, 401, 'anonymous court access denied');
  check(
    (await call('alice', '/courts', 'POST', courtData)).status,
    403,
    'players cannot create courts',
  );
  check(
    (await call('admin', '/courts', 'POST', courtData, 'https://evil.example')).status,
    403,
    'cross-origin mutation denied',
  );
  const c1 = await call('admin', '/courts', 'POST', courtData);
  check(c1.status, 201, 'administrator creates court');
  const court1 = c1.body.court.id;
  const court2 = (await call('admin', '/courts', 'POST', { ...courtData, name: 'Test Court 2' }))
    .body.court.id;
  check(
    (await call('admin', '/courts', 'POST', courtData)).status,
    409,
    'duplicate names rejected',
  );
  check(
    (await call('alice', '/bookings/availability?date=2030-06-10&players=2&duration=30')).body
      .courts.length,
    2,
    'availability includes both active courts',
  );
  const input = (court, player, start = '16:00', date = '2030-06-10') => ({
    court_id: court,
    emails: [users[player].email],
    start_time: `${date}T${start}:00+05:30`,
    end_time: `${date}T${start.slice(0, 2)}:30:00+05:30`,
  });
  const booked = await call('alice', '/bookings', 'POST', input(court1, 'bob'));
  check(booked.status, 201, 'organizer reserves and invites registered player');
  const bookingId = booked.body.booking.id;
  check(
    (await call('bob', '/bookings/mine')).body.items[0].status,
    'pending',
    'invite is visible in teammate account',
  );
  check(
    (await call('outsider', '/bookings/mine')).body.items.length,
    0,
    'unrelated users cannot see reservation details',
  );
  check(
    (await call('outsider', `/bookings/${bookingId}/respond`, 'POST', { status: 'confirmed' }))
      .status,
    403,
    'outsider cannot confirm',
  );
  check(
    (await call('bob', `/bookings/${bookingId}/respond`, 'POST', { status: 'confirmed' })).body
      .booking.status,
    'confirmed',
    'last acceptance confirms booking',
  );
  check(
    (await call('cara', '/bookings', 'POST', input(court1, 'dan'))).status,
    409,
    'overlapping court booking rejected',
  );
  check(
    (await call('alice', '/bookings', 'POST', input(court2, 'bob'))).body.error.code,
    'PLAYER_CONFLICT',
    'player overlap across courts rejected',
  );
  check(
    (await call('alice', '/bookings', 'POST', input(court2, 'bob', '16:00', '2030-06-11'))).body
      .error.code,
    'PLAYER_COOLDOWN',
    'three-day player cooldown enforced',
  );
  check(
    (await call('admin', `/courts/${court1}`, 'PUT', { ...courtData, is_active: false })).status,
    409,
    'cannot archive court with upcoming reservation',
  );
  const block = {
    start_time: '2030-06-10T18:00:00+05:30',
    end_time: '2030-06-10T19:00:00+05:30',
    reason: 'Floor maintenance',
  };
  check(
    (
      await call('admin', `/courts/${court1}/blocks`, 'POST', {
        ...block,
        start_time: input(court1, 'bob').start_time,
      })
    ).status,
    409,
    'maintenance cannot overlap reservation',
  );
  const blocked = await call('admin', `/courts/${court1}/blocks`, 'POST', block);
  check(blocked.status, 201, 'administrator adds maintenance block');
  check(
    (await call('cara', '/bookings', 'POST', input(court1, 'dan', '18:00'))).status,
    409,
    'blocked interval cannot be booked',
  );
  check(
    (await call('admin', `/courts/${court1}/blocks/${blocked.body.block.id}`, 'DELETE')).status,
    204,
    'maintenance block can be removed',
  );
  const pending = await call('cara', '/bookings', 'POST', input(court1, 'dan', '18:00'));
  check(pending.status, 201, 'removed maintenance time becomes bookable');
  check(
    (
      await call('dan', `/bookings/${pending.body.booking.id}/respond`, 'POST', {
        status: 'declined',
      })
    ).body.booking.status,
    'cancelled',
    'decline releases entire reservation',
  );
  const pending2 = await call('cara', '/bookings', 'POST', input(court2, 'dan', '18:00'));
  now = new Date(+now + 61 * 60000);
  check(
    (await call('dan', '/bookings/mine')).body.items.find((b) => b.id === pending2.body.booking.id)
      .status,
    'expired',
    'unconfirmed hold expires without cron',
  );
  check(
    (
      await call('dan', `/bookings/${pending2.body.booking.id}/respond`, 'POST', {
        status: 'confirmed',
      })
    ).status,
    409,
    'expired invitation cannot confirm',
  );
  check(
    (await call('cara', '/bookings', 'POST', input(court2, 'dan', '18:00'))).status,
    201,
    'expired hold no longer blocks court or players',
  );
  const concurrent = await Promise.all([
    call('eve', '/bookings', 'POST', input(court2, 'finn', '20:00')),
    call('gina', '/bookings', 'POST', input(court2, 'hari', '20:00')),
  ]);
  check(
    concurrent.map((r) => r.status).sort(),
    [201, 409],
    'simultaneous same-slot requests produce exactly one reservation',
  );
  check(
    (await call('bob', `/bookings/${bookingId}/cancel`, 'POST', { reason: 'Not organizer' }))
      .status,
    403,
    'participant cannot cancel organizer reservation',
  );
  check(
    (await call('alice', `/bookings/${bookingId}/cancel`, 'POST', { reason: 'Plans changed' }))
      .status,
    200,
    'organizer can cancel before cutoff',
  );
  check(
    (await call('admin', `/courts/${court1}`, 'PUT', { ...courtData, is_active: false })).status,
    200,
    'unused court can be archived without losing history',
  );
  check((await call('alice', '/courts')).body.items.length, 1, 'players see only active courts');
  check(
    (await call('admin', '/courts')).body.items.length,
    2,
    'administrators also see archived courts',
  );
  check(
    (await call('alice', '/bookings')).status,
    403,
    'all-bookings endpoint is administrator-only',
  );
  const events = await isolated.query('SELECT DISTINCT type FROM courtly_events');
  check(
    events.rows.some((e) => e.type === 'booking.confirmed'),
    true,
    'booking events persisted transactionally for future email worker',
  );
  console.log(
    `\n${assertions} PostgreSQL + HTTP integration checks passed. No email or scheduler ran.`,
  );
} finally {
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await pool.end();
}

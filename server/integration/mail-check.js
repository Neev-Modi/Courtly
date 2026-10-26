import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { readDatabaseConfig } from '../src/config/database.js';
import { createPool } from '../src/db/pool.js';
import { migrateDatabase } from '../src/db/migrations.js';
import { recordEvent } from '../src/modules/events/events.repository.js';
import { createMailService } from '../src/modules/mail/mail.service.js';

const pool = createPool(readDatabaseConfig());
const schema = `courtly_mail_test_${randomBytes(8).toString('hex')}`;
const db = {
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
let now = new Date('2030-06-10T00:00:00Z');
const sent = [];
let fail = false;
const transport = {
  async send(message) {
    if (fail) throw Object.assign(new Error('private SMTP details'), { code: 'ETIMEDOUT' });
    sent.push(message);
  },
};
const service = createMailService(db, { appOrigin: 'http://localhost:5173' }, transport, () => now);
let checks = 0;
function check(actual, expected, label) {
  assert.deepEqual(actual, expected);
  checks++;
  console.log(`PASS ${label}`);
}
try {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  await migrateDatabase(db);
  await migrateDatabase(db);
  const owner = randomUUID(),
    player = randomUUID(),
    court = randomUUID(),
    booking = randomUUID();
  for (const [id, name] of [
    [owner, 'owner'],
    [player, 'player'],
  ]) {
    await db.query('INSERT INTO auth_users(id,google_subject,email,name) VALUES($1,$2,$3,$4)', [
      id,
      id,
      `${name}@nitw.ac.in`,
      name,
    ]);
  }
  await db.query("INSERT INTO courtly_courts(id,name,location) VALUES($1,'Test court','Hall')", [
    court,
  ]);
  await db.query(
    `INSERT INTO courtly_bookings(id,court_id,creator_id,start_time,end_time,confirmation_deadline)
    VALUES($1,$2,$3,'2030-06-10T02:00:00Z','2030-06-10T02:30:00Z','2030-06-10T01:00:00Z')`,
    [booking, court, owner],
  );
  await db.query(
    "INSERT INTO courtly_booking_players(booking_id,user_id,status) VALUES($1,$2,'confirmed'),($1,$3,'pending')",
    [booking, owner, player],
  );
  await recordEvent(db, 'booking.created', booking, {});
  await Promise.all([service.prepare(), service.prepare()]);
  check(
    (await db.query('SELECT count(*)::int AS n FROM courtly_mail_deliveries')).rows[0].n,
    1,
    'concurrent preparation deduplicates invite recipient',
  );
  await Promise.all([service.deliverOne(), service.deliverOne()]);
  check(sent.length, 1, 'concurrent workers send invitation once');
  check(sent[0].to, 'player@nitw.ac.in', 'organizer excluded from invitation');
  check(await service.deliverOne(), null, 'sent delivery is not retried');
  await recordEvent(db, 'booking.responded', booking, {});
  await service.prepare();
  check(
    (await db.query("SELECT processed_at FROM courtly_events WHERE type='booking.responded'"))
      .rows[0].processed_at,
    null,
    'unrelated events remain untouched',
  );

  await db.query("UPDATE courtly_bookings SET status='confirmed' WHERE id=$1", [booking]);
  await recordEvent(db, 'booking.confirmed', booking, {});
  await service.prepare();
  fail = true;
  check(await service.deliverOne(), 'retry', 'SMTP failure queues retry without losing booking');
  check(
    (
      await db.query(
        "SELECT last_error FROM courtly_mail_deliveries WHERE attempts=1 AND status='pending'",
      )
    ).rows[0].last_error,
    'ETIMEDOUT',
    'only sanitized error code persisted',
  );
  fail = false;
  await service.deliverOne();
  check(sent.length, 2, 'other recipient succeeds independently');
  now = new Date(+now + 61000);
  await service.deliverOne();
  check(sent.length, 3, 'failed recipient succeeds after retry delay');
  check(
    new Set(sent.slice(1).map((m) => m.to)).size,
    2,
    'confirmed notification reaches both participants separately',
  );

  await recordEvent(db, 'booking.created', booking, {});
  await service.prepare();
  check(await service.deliverOne(), 'skipped', 'late invitation suppressed after confirmation');
  await db.query(
    "UPDATE courtly_bookings SET status='cancelled',cancellation_reason='Maintenance' WHERE id=$1",
    [booking],
  );
  await recordEvent(db, 'booking.cancelled', booking, {});
  await service.prepare();
  fail = true;
  await db.query("UPDATE courtly_mail_deliveries SET attempts=4 WHERE status='pending'");
  check(await service.deliverOne(), 'failed', 'fifth failure enters terminal failed state');
  fail = false;
  await service.deliverOne();
  check(sent.at(-1).text.includes('Maintenance'), true, 'cancellation includes reason');
  check(
    (await db.query('SELECT status FROM courtly_bookings WHERE id=$1', [booking])).rows[0].status,
    'cancelled',
    'mail failure leaves booking mutation intact',
  );
  console.log(`\n${checks} mail integration checks passed using a fake transport. No email sent.`);
} finally {
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await pool.end();
}

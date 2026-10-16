import express from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { createPool } from '../src/db/pool.js';
import { readDatabaseConfig } from '../src/config/database.js';
import { migrateDatabase } from '../src/db/migrations.js';
import { createApp } from '../src/app.js';
import { createAuthRepository } from '../src/modules/auth/auth.repository.js';
import { createAuthService, hashToken } from '../src/modules/auth/auth.service.js';
import { createTokenService } from '../src/modules/auth/token.service.js';
import { createCourtsService } from '../src/modules/courts/courts.service.js';
import { createBookingsService } from '../src/modules/bookings/bookings.service.js';

const pool = createPool(readDatabaseConfig());
const schema = `courtly_demo_${randomBytes(8).toString('hex')}`;
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
const config = {
  production: false,
  ready: true,
  trustProxy: 0,
  domain: 'nitw.ac.in',
  adminEmails: [],
  appOrigin: 'http://127.0.0.1:4180',
  accessTtl: 3600,
  refreshTtl: 7200,
  accessSecret: randomBytes(32).toString('hex'),
  refreshSecret: randomBytes(32).toString('hex'),
};
let server,
  closing = false;
async function close() {
  if (closing) return;
  closing = true;
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await pool.end();
}
try {
  await pool.query(`CREATE SCHEMA "${schema}"`);
  await migrateDatabase(db);
  const repo = createAuthRepository(db),
    tokens = createTokenService(config),
    people = {};
  for (const [key, name, role] of [
    ['admin', 'Campus Admin', 'admin'],
    ['alice', 'Alice Player', 'user'],
    ['bob', 'Bob Player', 'user'],
  ]) {
    const id = randomUUID(),
      email = `${key}@nitw.ac.in`;
    await db.query(
      'INSERT INTO auth_users(id,google_subject,email,name,role) VALUES($1,$2,$3,$4,$5)',
      [id, id, email, name, role],
    );
    people[key] = { id, email, name, role };
  }
  const courts = createCourtsService(db);
  await courts.create(
    {
      name: 'Court 1',
      location: 'Indoor Sports Complex',
      description: 'An indoor court for your next singles or doubles session.',
    },
    people.admin,
  );
  await courts.create(
    {
      name: 'Court 2',
      location: 'Student Activity Centre',
      description: 'Bring your group and make time for a good game.',
    },
    people.admin,
  );
  const outer = express();
  outer.use(express.urlencoded({ extended: false }));
  outer.use((req, res, next) => {
    if (req.hostname !== '127.0.0.1') return res.status(403).send('Use the loopback demo URL.');
    next();
  });
  outer.get('/api/auth/config', (req, res) =>
    res.set('Cache-Control', 'no-store').json({ enabled: true, domain: config.domain, demo: true }),
  );
  outer.get('/demo', (req, res) =>
    res.type('html').send(
      `<!doctype html><html><head><title>Courtly isolated demo</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px system-ui;background:#f4f7ed;color:#284335;max-width:650px;margin:10vh auto;padding:25px}button{padding:16px 24px;margin:8px;background:#286246;color:white;border:0;border-radius:10px;font:inherit}p{line-height:1.7}</style></head><body><h1>Courtly · working module demo</h1><p>This loopback-only demo uses temporary sample users and a separate database schema. It does not access your real users or bookings. No email or scheduled job runs.</p><p>1. Choose Alice and book a slot with bob@nitw.ac.in.<br>2. Return here, choose Bob, and accept the invitation.<br>3. Choose Admin to manage courts, blocks and all bookings.</p>${Object.entries(
        people,
      )
        .map(
          ([key, person]) =>
            `<form method="post" action="/demo/switch"><input type="hidden" name="person" value="${key}"><button>Continue as ${person.name}</button></form>`,
        )
        .join('')}<p>Stop the demo with Ctrl+C to remove its temporary schema.</p></body></html>`,
    ),
  );
  outer.post('/demo/switch', async (req, res, next) => {
    try {
      if (req.get('origin') !== config.appOrigin) return res.status(403).send('Invalid origin.');
      const person = Object.hasOwn(people, req.body.person) ? people[req.body.person] : null;
      if (!person) return res.status(400).end();
      const sid = randomBytes(32).toString('base64url'),
        pair = tokens.issue(sid, person.id);
      await repo.createSession(
        hashToken(sid),
        person.id,
        new Date(Date.now() + 7200000),
        hashToken(pair.refreshToken),
      );
      const cookie = { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 3600000 };
      res.cookie('courtly_access', pair.token, cookie);
      res.cookie('courtly_refresh', pair.refreshToken, { ...cookie, maxAge: 7200000 });
      res.redirect(303, person.role === 'admin' ? '/admin' : '/dashboard');
    } catch (error) {
      next(error);
    }
  });
  outer.use(
    createApp({
      config,
      service: createAuthService({ repository: repo, provider: {}, config }),
      courts,
      bookings: createBookingsService(db, config),
    }),
  );
  server = outer.listen(4180, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  console.log(`Isolated court and booking demo: ${config.appOrigin}/demo`);
  console.log('Ctrl+C removes the temporary demo schema. Real app records are untouched.');
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => close().then(() => process.exit(0)));
} catch (error) {
  await close();
  throw error;
}

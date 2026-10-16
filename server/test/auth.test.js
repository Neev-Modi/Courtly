import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import assert from 'node:assert/strict';
import { createAuthService, hashToken } from '../src/modules/auth/auth.service.js';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config/env.js';

function fixture(overrides = {}) {
  const users = new Map(),
    sessions = new Map(),
    attempts = new Map();
  const profile = {
    sub: 'google-123',
    email: 'player@nitw.ac.in',
    email_verified: true,
    name: 'Campus Player',
    ...overrides.profile,
  };
  const config = {
    ready: true,
    production: false,
    trustProxy: 0,
    appOrigin: 'http://localhost:5173',
    domain: 'nitw.ac.in',
    adminEmails: [],
    accessTtl: 900,
    refreshTtl: 2592000,
    accessSecret: 'test-access-secret-at-least-32-characters',
    refreshSecret: 'test-refresh-secret-at-least-32-characters',
    ...overrides.config,
  };
  const repository = {
    findUser: async (subject) => users.get(subject),
    saveUser: async (input) => {
      const previous = users.get(input.subject);
      const user = {
        ...input,
        role: previous?.role || input.role,
        is_banned: previous?.is_banned || false,
      };
      users.set(input.subject, user);
      return user;
    },
    createSession: async (hash, id, expires, refreshHash) =>
      sessions.set(hash, { id, expires, refreshHash }),
    sessionUser: async (hash) => {
      const session = sessions.get(hash);
      return session && session.expires > new Date()
        ? [...users.values()].find((u) => u.id === session.id)
        : null;
    },
    deleteSession: async (hash) => sessions.delete(hash),
    rotateRefresh: async (hash, previous, next) => {
      const session = sessions.get(hash);
      if (!session || session.expires <= new Date() || session.refreshHash !== previous)
        return false;
      session.refreshHash = next;
      return true;
    },
    storeAttempt: async (hash, verifier, nonce) => attempts.set(hash, { verifier, nonce }),
    consumeAttempt: async (hash) => {
      const attempt = attempts.get(hash);
      attempts.delete(hash);
      return attempt;
    },
  };
  const provider = {
    authorizationUrl: ({ state, challenge, nonce }) =>
      `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ state, challenge, nonce })}`,
    exchange: async () => profile,
  };
  const service = createAuthService({ repository, provider, config });
  const login = async () => {
    const { state } = await service.begin();
    return service.complete({ state, cookieState: state, code: 'test-code' });
  };
  return { config, service, users, sessions, attempts, login, profile };
}
test('verified campus sign-in creates a user and stores only the hashed session', async () => {
  const f = fixture();
  const { token, user } = await f.login();
  assert.equal(user.role, 'user');
  assert.equal(user.email, 'player@nitw.ac.in');
  assert.equal(f.sessions.has(token), false);
  assert.equal(f.sessions.has(hashToken(jwt.decode(token).sid)), true);
  assert.deepEqual(await f.service.currentUser(token), user);
  assert.equal('subject' in user, false);
});
test('email is normalized', async () => {
  const f = fixture({ profile: { email: 'PLAYER@NITW.AC.IN' } });
  assert.equal((await f.login()).user.email, 'player@nitw.ac.in');
});
test('rejects similar-looking domains and unverified accounts', async () => {
  for (const email of ['player@nitw.ac.in.evil.com', 'player@gmail.com']) {
    await assert.rejects(fixture({ profile: { email } }).login(), { code: 'DOMAIN_RESTRICTED' });
  }
  await assert.rejects(fixture({ profile: { email_verified: false } }).login(), {
    code: 'UNVERIFIED_EMAIL',
  });
});
test('only configured verified administrators may join outside campus domain', async () => {
  const f = fixture({
    profile: { email: 'admin@example.com' },
    config: { adminEmails: ['admin@example.com'] },
  });
  assert.equal((await f.login()).user.role, 'admin');
});
test('persisted role takes precedence over bootstrap admin configuration', async () => {
  const f = fixture();
  await f.login();
  f.config.adminEmails.push(f.profile.email);
  assert.equal((await f.login()).user.role, 'user');
});
test('banned accounts cannot sign in and existing sessions immediately lose access', async () => {
  const f = fixture();
  const { token } = await f.login();
  f.users.get('google-123').is_banned = true;
  await assert.rejects(f.login(), { code: 'ACCOUNT_DISABLED' });
  await assert.rejects(f.service.currentUser(token), { code: 'ACCOUNT_DISABLED' });
});
test('state binds the browser, rejects malformed input, and can only be used once', async () => {
  const f = fixture();
  const { state } = await f.service.begin();
  for (const cookieState of [undefined, 'x'.repeat(43), 'é'.repeat(43)])
    await assert.rejects(f.service.complete({ state, cookieState, code: 'code' }), {
      code: 'INVALID_STATE',
    });
  await f.service.complete({ state, cookieState: state, code: 'code' });
  await assert.rejects(f.service.complete({ state, cookieState: state, code: 'code' }), {
    code: 'INVALID_STATE',
  });
});
test('unknown or expired OAuth attempt cannot complete', async () => {
  const f = fixture();
  const { state } = await f.service.begin();
  f.attempts.clear();
  await assert.rejects(f.service.complete({ state, cookieState: state, code: 'code' }), {
    code: 'INVALID_STATE',
  });
});
test('logout revokes sessions and expired sessions are rejected', async () => {
  const f = fixture();
  const { token } = await f.login();
  await f.service.logout(token);
  await assert.rejects(f.service.currentUser(token), { status: 401 });
  const second = await f.login();
  f.sessions.get(hashToken(jwt.decode(second.token).sid)).expires = new Date(0);
  await assert.rejects(f.service.currentUser(second.token), { status: 401 });
});
test('anonymous and malformed credentials cannot access account', async () => {
  const f = fixture();
  for (const token of [undefined, '', 'abc', 'x'.repeat(43)])
    await assert.rejects(f.service.currentUser(token), { status: 401 });
});
test('role and domain access are rechecked for each request', async () => {
  const f = fixture({
    profile: { email: 'admin@example.com' },
    config: { adminEmails: ['admin@example.com'] },
  });
  const { token } = await f.login();
  f.users.get('google-123').role = 'user';
  await assert.rejects(f.service.currentUser(token), { code: 'ACCOUNT_DISABLED' });
});
async function withServer(f, run) {
  const server = createApp(f).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
test('HTTP OAuth flow issues HttpOnly cookies, restores identity, enforces RBAC and revokes logout', async () => {
  const f = fixture();
  await withServer(f, async (base) => {
    assert.equal((await fetch(`${base}/api/auth/me`)).status, 401);
    const start = await fetch(`${base}/api/auth/google`, { redirect: 'manual' });
    assert.equal(start.status, 302);
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const callback = await fetch(`${base}/api/auth/google/callback?state=${state}&code=test`, {
      redirect: 'manual',
      headers: { Cookie: `courtly_oauth=${state}` },
    });
    assert.equal(callback.status, 303);
    assert.equal(callback.headers.get('location'), 'http://localhost:5173/dashboard');
    const sessionCookie = callback.headers
      .getSetCookie()
      .find((x) => x.startsWith('courtly_access='));
    assert.match(sessionCookie, /HttpOnly/);
    assert.match(sessionCookie, /SameSite=Lax/);
    const headers = { Cookie: sessionCookie.split(';')[0] };
    const me = await fetch(`${base}/api/auth/me`, { headers });
    assert.equal(me.status, 200);
    assert.equal(me.headers.get('cache-control'), 'no-store');
    assert.equal((await fetch(`${base}/api/auth/admin`, { headers })).status, 403);
    assert.equal(
      (
        await fetch(`${base}/api/auth/logout`, {
          method: 'POST',
          headers: { ...headers, Origin: 'https://evil.example' },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${base}/api/auth/logout`, {
          method: 'POST',
          headers: { ...headers, Origin: f.config.appOrigin },
        })
      ).status,
      204,
    );
    assert.equal((await fetch(`${base}/api/auth/me`, { headers })).status, 401);
  });
});
test('HTTP admin access and production cookies', async () => {
  const f = fixture({ config: { production: true, adminEmails: ['player@nitw.ac.in'] } });
  await withServer(f, async (base) => {
    const { state } = await f.service.begin();
    const response = await fetch(`${base}/api/auth/google/callback?state=${state}&code=test`, {
      redirect: 'manual',
      headers: { Cookie: `__Host-courtly_oauth=${state}` },
    });
    assert.equal(response.headers.get('location'), 'http://localhost:5173/admin');
    const cookie = response.headers
      .getSetCookie()
      .find((x) => x.startsWith('__Host-courtly_access='));
    assert.match(cookie, /Secure/);
    assert.match(cookie, /Path=\//);
    assert.equal(
      (await fetch(`${base}/api/auth/admin`, { headers: { Cookie: cookie.split(';')[0] } })).status,
      200,
    );
  });
});
test('unconfigured service serves config and blocks authentication', async () => {
  await withServer(fixture({ config: { ready: false } }), async (base) => {
    assert.equal((await (await fetch(`${base}/api/auth/config`)).json()).enabled, false);
    assert.equal((await fetch(`${base}/api/auth/google`, { redirect: 'manual' })).status, 503);
  });
});
test('invalid callbacks redirect to a safe fixed destination', async () => {
  await withServer(fixture(), async (base) => {
    const response = await fetch(
      `${base}/api/auth/google/callback?state=invalid&code=x&next=https://evil.example`,
      { redirect: 'manual' },
    );
    assert.equal(
      response.headers.get('location'),
      'http://localhost:5173/login?error=INVALID_STATE',
    );
  });
});
test('configuration validates production HTTPS, session TTL, and callback origin', () => {
  assert.equal(readConfig({}).ready, false);
  assert.throws(() => readConfig({ JWT_ACCESS_TTL: '-1' }));
  assert.throws(() => readConfig({ NODE_ENV: 'production', APP_ORIGIN: 'http://example.com' }));
  assert.throws(() => readConfig({ GOOGLE_CALLBACK_URL: 'https://evil.example/callback' }));
});

test('refresh JWT rotates once, cannot authenticate as access, and logout revokes both', async () => {
  const f = fixture();
  const initial = await f.login();
  assert.equal(jwt.verify(initial.token, f.config.accessSecret).type, 'access');
  await assert.rejects(f.service.currentUser(initial.refreshToken), { status: 401 });
  await assert.rejects(f.service.refresh(initial.token), { status: 401 });
  const next = await f.service.refresh(initial.refreshToken);
  assert.notEqual(next.refreshToken, initial.refreshToken);
  await assert.rejects(f.service.refresh(initial.refreshToken), { status: 401 });
  assert.equal((await f.service.currentUser(next.token)).id, initial.user.id);
  await f.service.logout(undefined, next.refreshToken);
  await assert.rejects(f.service.currentUser(initial.token), { status: 401 });
  await assert.rejects(f.service.refresh(next.refreshToken), { status: 401 });
});

test('expired and forged JWTs are rejected, while valid refresh restores access', async () => {
  const f = fixture();
  const pair = await f.login();
  const payload = jwt.decode(pair.token);
  const expired = jwt.sign({ ...payload, exp: 1 }, f.config.accessSecret);
  const forged = jwt.sign({ ...payload }, 'different-secret');
  await assert.rejects(f.service.currentUser(expired), { status: 401 });
  await assert.rejects(f.service.currentUser(forged), { status: 401 });
  const refreshed = await f.service.refresh(pair.refreshToken);
  assert.equal((await f.service.currentUser(refreshed.token)).id, pair.user.id);
  f.users.get('google-123').is_banned = true;
  await assert.rejects(f.service.refresh(refreshed.refreshToken), { status: 403 });
});

test('backend callback alias and refresh endpoint support the legacy environment flow', async () => {
  const f = fixture();
  await withServer(f, async (base) => {
    const start = await fetch(`${base}/api/auth/google`, { redirect: 'manual' });
    const state = new URL(start.headers.get('location')).searchParams.get('state');
    const response = await fetch(`${base}/auth/google/callback?state=${state}&code=test`, {
      redirect: 'manual',
      headers: { Cookie: `courtly_oauth=${state}` },
    });
    assert.equal(response.status, 303);
    const cookie = response.headers
      .getSetCookie()
      .find((x) => x.startsWith('courtly_refresh='))
      .split(';')[0];
    const forbidden = await fetch(`${base}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: 'https://evil.example' },
    });
    assert.equal(forbidden.status, 403);
    const refreshed = await fetch(`${base}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: f.config.appOrigin },
    });
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.headers.getSetCookie().length, 2);
    const replay = await fetch(`${base}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: cookie, Origin: f.config.appOrigin },
    });
    assert.equal(replay.status, 401);
  });
});

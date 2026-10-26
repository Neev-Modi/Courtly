import test from 'node:test';
import assert from 'node:assert/strict';
import { readMailConfig } from '../src/config/mail.js';
import { shouldDeliver, retrySeconds } from '../src/modules/mail/mail.policy.js';
import { renderMail } from '../src/modules/mail/mail.templates.js';

const now = new Date('2030-06-10T00:00:00Z');
const booking = {
  id: 'booking',
  creator_id: 'owner',
  status: 'pending',
  court_name: '<script>alert(1)</script>',
  location: 'Hall & court',
  start_time: '2030-06-10T02:00:00Z',
  end_time: '2030-06-10T02:30:00Z',
  confirmation_deadline: '2030-06-10T01:00:00Z',
};
const recipient = { id: 'player', name: '<b>Player</b>', status: 'pending' };
test('mail is opt-in and SMTP configuration requires credentials and safe origins', () => {
  assert.equal(readMailConfig({}).mode, 'disabled');
  assert.throws(() => readMailConfig({ MAIL_MODE: 'smtp' }));
  assert.throws(() => readMailConfig({ APP_ORIGIN: 'javascript:alert(1)' }));
  assert.throws(() => readMailConfig({ NODE_ENV: 'production', APP_ORIGIN: 'http://example.com' }));
  assert.throws(() => readMailConfig({ MAIL_FROM: 'sender\r\nBcc: another@example.com' }));
  assert.equal(
    readMailConfig({
      MAIL_MODE: 'smtp',
      MAIL_HOST: 'smtp.example.com',
      MAIL_USER: 'user',
      MAIL_PASS: 'secret',
      MAIL_FROM: 'a@example.com',
    }).port,
    587,
  );
});
test('mail policy suppresses expired, accepted, cancelled and banned invitations', () => {
  assert.equal(shouldDeliver('booking.created', booking, recipient, now), true);
  assert.equal(
    shouldDeliver('booking.created', booking, recipient, new Date(booking.confirmation_deadline)),
    false,
  );
  for (const changes of [{ status: 'confirmed' }, { is_banned: true }, { id: 'owner' }])
    assert.equal(
      shouldDeliver('booking.created', booking, { ...recipient, ...changes }, now),
      false,
    );
  assert.equal(
    shouldDeliver('booking.created', { ...booking, status: 'cancelled' }, recipient, now),
    false,
  );
  assert.equal(
    shouldDeliver('booking.confirmed', { ...booking, status: 'confirmed' }, recipient, now),
    true,
  );
  assert.equal(shouldDeliver('booking.reminder', booking, recipient, now), false);
  assert.equal(
    shouldDeliver('booking.expired', booking, recipient, new Date(booking.confirmation_deadline)),
    true,
  );
});
test('templates escape user content and use IST with authenticated application links', () => {
  const rendered = renderMail('booking.created', booking, recipient, 'http://localhost:5173');
  assert.ok(rendered.html.includes('&lt;script&gt;'));
  assert.ok(!rendered.html.includes('<script>'));
  assert.ok(rendered.text.includes('IST'));
  assert.ok(rendered.text.includes('http://localhost:5173/bookings'));
  assert.ok(!rendered.text.includes('token='));
  assert.throws(() => renderMail('unknown', booking, recipient, 'http://localhost:5173'));
  assert.equal(retrySeconds(1), 60);
  assert.equal(retrySeconds(4), 480);
});

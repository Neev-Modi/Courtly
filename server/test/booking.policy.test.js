import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  campusDate,
  validateDateWindow,
  validateSlot,
  generateSlots,
  effectiveStatus,
  instant,
} from '../src/modules/bookings/booking.policy.js';
const now = new Date('2030-06-10T00:00:00Z');
test('campus date boundaries and invalid dates are enforced', () => {
  assert.equal(campusDate('2030-06-09T20:00:00Z'), '2030-06-10');
  assert.throws(() => validateDateWindow('2030-02-31', now));
  assert.throws(() => validateDateWindow('2030-06-13', now));
  assert.doesNotThrow(() => validateDateWindow('2030-06-12', now));
});
test('slot validation enforces participant duration, opening hours, advance notice and grid', () => {
  assert.doesNotThrow(() =>
    validateSlot('2030-06-10T16:00:00+05:30', '2030-06-10T16:30:00+05:30', 2, now),
  );
  for (const [start, end, count] of [
    ['06:00', '06:30', 2],
    ['12:00', '12:30', 2],
    ['16:01', '16:31', 2],
    ['16:00', '17:00', 2],
    ['21:30', '22:30', 4],
  ])
    assert.throws(() =>
      validateSlot(`2030-06-10T${start}:00+05:30`, `2030-06-10T${end}:00+05:30`, count, now),
    );
});
test('availability uses half-open intervals and weekend morning extension', () => {
  const slots = generateSlots(
    '2030-06-10',
    30,
    [{ start_time: instant('2030-06-10', '16:00'), end_time: instant('2030-06-10', '16:30') }],
    now,
  );
  assert.equal(
    slots.some((s) => s.start_time === instant('2030-06-10', '16:15').toISOString()),
    false,
  );
  assert.equal(
    slots.some((s) => s.start_time === instant('2030-06-10', '16:30').toISOString()),
    true,
  );
  assert.equal(
    generateSlots('2030-06-15', 30, [], now).some(
      (s) => s.start_time === instant('2030-06-15', '10:30').toISOString(),
    ),
    true,
  );
});
test('pending expiration and completed status require no scheduler', () => {
  const booking = {
    status: 'pending',
    confirmation_deadline: new Date(+now - 1),
    end_time: new Date(+now - 1),
  };
  assert.equal(effectiveStatus(booking, now), 'expired');
  assert.equal(effectiveStatus({ ...booking, status: 'confirmed' }, now), 'completed');
  assert.equal(effectiveStatus({ ...booking, status: 'cancelled' }, now), 'cancelled');
});

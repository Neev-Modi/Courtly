import { randomUUID } from 'node:crypto';
import { transaction } from '../../db/transaction.js';
import { fail, uuid, text } from '../../shared/validation.js';
import { createCourtsRepository } from '../courts/courts.repository.js';
import { createBookingsRepository } from './bookings.repository.js';
import {
  bookingPolicy,
  campusDate,
  durations,
  effectiveStatus,
  generateSlots,
  instant,
  validateDateWindow,
  validateSlot,
  validDate,
} from './booking.policy.js';
import { recordEvent } from '../events/events.repository.js';

export function createBookingsService(pool, config, clock = () => new Date()) {
  const courts = createCourtsRepository(pool),
    bookings = createBookingsRepository(pool);
  return {
    async availability(query) {
      const now = clock();
      const date = query.date || campusDate(now);
      validateDateWindow(date, now);
      const count = Number(query.players || 2),
        duration = Number(query.duration || durations(count)[0]);
      if (
        !Number.isInteger(count) ||
        count < 2 ||
        count > 6 ||
        !durations(count).includes(duration)
      )
        fail('Choose 2–6 players and a matching duration.');
      const active = await courts.list();
      const selected = query.court_id
        ? active.filter((c) => c.id === uuid(query.court_id))
        : active;
      const result = await Promise.all(
        selected.map(async (court) => ({
          ...court,
          slots: generateSlots(
            date,
            duration,
            await courts.busy(
              court.id,
              instant(date, '00:00'),
              new Date(+instant(date, '00:00') + 86400000),
              now,
            ),
            now,
          ),
        })),
      );
      return { date, policy: bookingPolicy, courts: result };
    },
    async create(data, actor) {
      const courtId = uuid(data.court_id);
      let now = clock();
      if (!Array.isArray(data.emails) || data.emails.length < 1 || data.emails.length > 5)
        fail('Invite 1–5 registered players, in addition to yourself.');
      const emails = data.emails.map((value) =>
        text(value, 'Participant email', 254).toLowerCase(),
      );
      if (
        emails.some(
          (email) =>
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
            !email.split('@')[1].endsWith(config.domain),
        ) ||
        emails.includes(actor.email.toLowerCase()) ||
        new Set(emails).size !== emails.length
      )
        fail('Use unique campus emails and do not include your own email.');
      const { start, end } = validateSlot(data.start_time, data.end_time, emails.length + 1, now);
      return transaction(pool, async (client) => {
        const courtRepo = createCourtsRepository(client),
          repo = createBookingsRepository(client);
        const court = await courtRepo.get(courtId, true);
        if (!court || !court.is_active)
          fail('This court is not available.', 409, 'COURT_UNAVAILABLE');
        const players = await repo.users([...emails, actor.email.toLowerCase()]);
        if (players.length !== emails.length + 1)
          fail('Every invited player must sign in to Courtly once before you can invite them.');
        if (players.some((player) => player.is_banned))
          fail('One of the players cannot currently book.', 403, 'PLAYER_DISABLED');
        const ids = players.map((player) => player.id);
        await repo.lockPlayers(ids);
        now = clock();
        validateSlot(data.start_time, data.end_time, emails.length + 1, now);
        if (await courtRepo.conflicts(courtId, start, end, now))
          fail(
            'That slot was just taken or blocked. Please choose another.',
            409,
            'SLOT_UNAVAILABLE',
          );
        const clash = await repo.playerConflict(ids, start, end, now);
        if (clash)
          fail(`${clash.email} already has a booking at that time.`, 409, 'PLAYER_CONFLICT');
        const cooldown = await repo.cooldown(ids, start, now, bookingPolicy.cooldownDays);
        if (cooldown)
          fail(
            `${cooldown.email} needs ${bookingPolicy.cooldownDays} days between bookings.`,
            409,
            'PLAYER_COOLDOWN',
          );
        const id = randomUUID(),
          deadline = new Date(Math.min(+now + bookingPolicy.confirmationMinutes * 60000, +start));
        await repo.insert(id, courtId, actor.id, start, end, deadline, now);
        for (const player of players) await repo.addPlayer(id, player.id, actor.id, now);
        // Event outbox: Future email worker consumes 'booking.created' to dispatch invitation emails.
        await recordEvent(client, 'booking.created', id, {
          actorId: actor.id,
          playerIds: ids,
          confirmationDeadline: deadline.toISOString(),
        });
        return { ...(await repo.get(id)), court_name: court.name, players: await repo.players(id) };
      });
    },
    async list(query, actor, admin = false) {
      const date = query.date ? validDate(query.date) : null,
        page = Number(query.page || 1);
      if (!Number.isInteger(page) || page < 1 || page > 10000) fail('Invalid page.');
      const rows = await bookings.list(actor.id, admin, date, (page - 1) * 50);
      // Future lifecycle worker can persist expired/completed states; reads already derive them.
      return {
        items: rows.map(({ total_count, ...booking }) => ({
          ...booking,
          status: effectiveStatus(booking, clock()),
        })),
        page,
        total: rows[0]?.total_count || 0,
        pageSize: 50,
      };
    },
    async respond(id, data, actor) {
      uuid(id);
      if (!['confirmed', 'declined'].includes(data.status)) fail('Choose accept or decline.');
      return transaction(pool, async (client) => {
        const repo = createBookingsRepository(client);
        const reference = await repo.get(id);
        if (!reference) fail('Booking not found.', 404, 'NOT_FOUND');
        await createCourtsRepository(client).get(reference.court_id, true);
        const booking = await repo.get(id, true),
          now = clock();
        if (!booking) fail('Booking not found.', 404, 'NOT_FOUND');
        const players = await repo.players(id),
          player = players.find((p) => p.id === actor.id);
        if (!player || booking.creator_id === actor.id)
          fail('Only an invited player can respond.', 403, 'FORBIDDEN');
        if (effectiveStatus(booking, now) !== 'pending')
          fail('This invitation is no longer pending.', 409, 'BOOKING_CLOSED');
        if (player.status !== 'pending')
          fail('You have already responded.', 409, 'ALREADY_RESPONDED');
        if (players.some((p) => p.is_banned))
          fail('A player on this booking is disabled.', 403, 'PLAYER_DISABLED');
        await repo.respond(id, actor.id, data.status, now);
        if (data.status === 'declined') {
          await repo.cancel(id, actor.id, 'An invited player declined.', now);
          // Event outbox: Future email worker sends decline notification to organizer and players.
          await recordEvent(client, 'booking.cancelled', id, {
            actorId: actor.id,
            reason: 'participant_declined',
          });
        } else if (players.every((p) => p.id === actor.id || p.status === 'confirmed')) {
          await repo.confirm(id, now);
          // Event outbox: Future email worker sends match confirmation notice to all participants.
          await recordEvent(client, 'booking.confirmed', id, { actorId: actor.id });
        }
        await recordEvent(client, 'booking.responded', id, {
          actorId: actor.id,
          status: data.status,
        });
        return { ...(await repo.get(id)), players: await repo.players(id) };
      });
    },
    async cancel(id, data, actor) {
      uuid(id);
      const reason = text(data.reason, 'Cancellation reason', 240);
      return transaction(pool, async (client) => {
        const repo = createBookingsRepository(client),
          booking = await repo.get(id, true),
          now = clock();
        if (!booking) fail('Booking not found.', 404, 'NOT_FOUND');
        if (actor.role !== 'admin' && booking.creator_id !== actor.id)
          fail('Only the organizer or an administrator can cancel.', 403, 'FORBIDDEN');
        if (!['pending', 'confirmed'].includes(effectiveStatus(booking, now)))
          fail('This booking is no longer active.', 409, 'BOOKING_CLOSED');
        if (
          new Date(booking.end_time) <= now ||
          (actor.role !== 'admin' &&
            new Date(booking.start_time) - now < bookingPolicy.noticeMinutes * 60000)
        )
          fail('Players can cancel only at least one hour before the start.');
        await repo.cancel(id, actor.id, reason, now);
        // Event outbox: Future email worker sends cancellation notice with reason to participants.
        await recordEvent(client, 'booking.cancelled', id, { actorId: actor.id, reason });
        return { id, status: 'cancelled' };
      });
    },
  };
}

import { randomUUID } from 'node:crypto';
import { transaction } from '../../db/transaction.js';
import { createCourtsRepository } from './courts.repository.js';
import { fail, text, uuid } from '../../shared/validation.js';
import { validateRange } from '../bookings/booking.policy.js';
import { recordEvent } from '../events/events.repository.js';
export function createCourtsService(pool, clock = () => new Date()) {
  const repository = createCourtsRepository(pool);
  function fields(data) {
    return {
      name: text(data.name, 'Court name', 80),
      location: text(data.location, 'Location', 160),
      description: text(data.description, 'Description', 500, true),
    };
  }
  async function mutation(work) {
    try {
      return await transaction(pool, work);
    } catch (error) {
      if (error.code === '23505')
        fail('A court with this name already exists.', 409, 'DUPLICATE_COURT');
      throw error;
    }
  }
  return {
    list: (user) => repository.list(user.role === 'admin'),
    async create(data, actor) {
      const input = fields(data);
      return mutation(async (client) => {
        const court = await createCourtsRepository(client).insert(randomUUID(), input);
        await recordEvent(client, 'court.created', court.id, { actorId: actor.id });
        return court;
      });
    },
    async update(id, data, actor) {
      uuid(id);
      const input = fields(data);
      if (typeof data.is_active !== 'boolean') fail('Court active status must be true or false.');
      return mutation(async (client) => {
        const repo = createCourtsRepository(client);
        const court = await repo.get(id, true);
        if (!court) fail('Court not found.', 404, 'NOT_FOUND');
        if (!data.is_active && (await repo.upcoming(id, clock())))
          fail('Cancel upcoming bookings before archiving this court.', 409, 'UPCOMING_BOOKINGS');
        const updated = await repo.update(id, { ...input, is_active: data.is_active });
        await recordEvent(client, 'court.updated', id, {
          actorId: actor.id,
          isActive: updated.is_active,
        });
        return updated;
      });
    },
    async blocks(id) {
      uuid(id);
      if (!(await repository.get(id))) fail('Court not found.', 404, 'NOT_FOUND');
      return repository.blocks(id, clock());
    },
    async addBlock(id, data, actor) {
      uuid(id);
      const range = validateRange(data.start_time, data.end_time);
      const reason = text(data.reason, 'Reason', 240);
      if (range.start < clock() || range.end - range.start > 90 * 86400000)
        fail('Maintenance must start in the future and last at most 90 days.');
      return mutation(async (client) => {
        const repo = createCourtsRepository(client);
        const court = await repo.get(id, true);
        if (!court) fail('Court not found.', 404, 'NOT_FOUND');
        if (await repo.conflicts(id, range.start, range.end, clock()))
          fail('This interval overlaps a booking or maintenance block.', 409, 'SLOT_UNAVAILABLE');
        const block = await repo.addBlock(randomUUID(), id, { ...range, reason }, actor.id);
        await recordEvent(client, 'court.blocked', id, { actorId: actor.id, blockId: block.id });
        return block;
      });
    },
    async removeBlock(id, blockId, actor) {
      uuid(id);
      uuid(blockId);
      return mutation(async (client) => {
        const repo = createCourtsRepository(client);
        if (!(await repo.get(id, true))) fail('Court not found.', 404, 'NOT_FOUND');
        if (!(await repo.removeBlock(blockId, id))) fail('Block not found.', 404, 'NOT_FOUND');
        await recordEvent(client, 'court.unblocked', id, { actorId: actor.id, blockId });
      });
    },
  };
}

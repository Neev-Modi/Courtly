import { randomUUID } from 'node:crypto';
// Future email worker consumes this transactional outbox; no delivery happens in requests.
export async function recordEvent(client, type, aggregateId, payload) {
  await client.query(
    'INSERT INTO courtly_events(id,type,aggregate_id,payload) VALUES($1,$2,$3,$4)',
    [randomUUID(), type, aggregateId, JSON.stringify({ version: 1, ...payload })],
  );
}

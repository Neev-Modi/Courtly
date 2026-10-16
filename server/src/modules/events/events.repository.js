import { randomUUID } from 'node:crypto';
// Future email worker consumes this transactional outbox; no delivery happens in requests.
// Worker polling query:
//   SELECT id, type, aggregate_id, payload FROM courtly_events WHERE processed_at IS NULL ORDER BY created_at LIMIT 50 FOR UPDATE SKIP LOCKED;
// Worker ack query (after mail transport succeeds):
//   UPDATE courtly_events SET processed_at = NOW() WHERE id = $1;
export async function recordEvent(client, type, aggregateId, payload) {
  await client.query(
    'INSERT INTO courtly_events(id,type,aggregate_id,payload) VALUES($1,$2,$3,$4)',
    [randomUUID(), type, aggregateId, JSON.stringify({ version: 1, ...payload })],
  );
}

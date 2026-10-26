import { randomUUID } from 'node:crypto';
// Mail preparation creates durable recipient deliveries before marking an event processed.
// No SMTP calls happen inside booking requests.
export async function recordEvent(client, type, aggregateId, payload) {
  await client.query(
    'INSERT INTO courtly_events(id,type,aggregate_id,payload) VALUES($1,$2,$3,$4)',
    [randomUUID(), type, aggregateId, JSON.stringify({ version: 1, ...payload })],
  );
}

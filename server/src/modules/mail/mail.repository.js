import { randomUUID } from 'node:crypto';
import { transaction } from '../../db/transaction.js';
import { mailEventTypes } from './mail.policy.js';

export async function loadMailContext(db, event, recipientId) {
  const booking = (
    await db.query(
      `SELECT b.*, c.name AS court_name,c.location
    FROM courtly_bookings b JOIN courtly_courts c ON c.id=b.court_id WHERE b.id=$1`,
      [event.aggregate_id],
    )
  ).rows[0];
  const recipients = (
    await db.query(
      `SELECT u.id,u.email,u.name,u.is_banned,p.status
    FROM courtly_booking_players p JOIN auth_users u ON u.id=p.user_id
    WHERE p.booking_id=$1 AND ($2::uuid IS NULL OR u.id=$2)`,
      [event.aggregate_id, recipientId || null],
    )
  ).rows;
  return { booking, recipients };
}

export async function prepareMail(pool, limit = 50) {
  return transaction(pool, async (client) => {
    const events = (
      await client.query(
        `SELECT * FROM courtly_events
      WHERE processed_at IS NULL AND type=ANY($1::text[])
      ORDER BY created_at,id LIMIT $2 FOR UPDATE SKIP LOCKED`,
        [mailEventTypes, limit],
      )
    ).rows;
    for (const event of events) {
      const { booking, recipients } = await loadMailContext(client, event);
      for (const recipient of recipients) {
        if (event.type === 'booking.created' && recipient.id === booking.creator_id) continue;
        await client.query(
          `INSERT INTO courtly_mail_deliveries(id,event_id,recipient_id)
          VALUES($1,$2,$3) ON CONFLICT(event_id,recipient_id) DO NOTHING`,
          [randomUUID(), event.id, recipient.id],
        );
      }
      await client.query('UPDATE courtly_events SET processed_at=NOW() WHERE id=$1', [event.id]);
    }
    return events.length;
  });
}

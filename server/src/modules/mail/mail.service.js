import { transaction } from '../../db/transaction.js';
import { loadMailContext, prepareMail } from './mail.repository.js';
import { shouldDeliver, maxAttempts, retrySeconds } from './mail.policy.js';
import { renderMail } from './mail.templates.js';

export function createMailService(pool, config, transport, clock = () => new Date()) {
  return {
    prepare: () => prepareMail(pool),
    async deliverOne() {
      return transaction(pool, async (client) => {
        // Hold this delivery lock through SMTP; concurrent workers skip it.
        const delivery = (
          await client.query(
            `SELECT d.*,e.type,e.aggregate_id
          FROM courtly_mail_deliveries d JOIN courtly_events e ON e.id=d.event_id
          WHERE d.status='pending' AND d.next_attempt_at <= $1
          ORDER BY d.next_attempt_at,d.id LIMIT 1 FOR UPDATE OF d SKIP LOCKED`,
            [clock()],
          )
        ).rows[0];
        if (!delivery) return null;
        const { booking, recipients } = await loadMailContext(
          client,
          delivery,
          delivery.recipient_id,
        );
        const recipient = recipients[0];
        if (!shouldDeliver(delivery.type, booking, recipient, clock())) {
          await client.query(
            "UPDATE courtly_mail_deliveries SET status='skipped',last_error='NO_LONGER_APPLICABLE' WHERE id=$1",
            [delivery.id],
          );
          return 'skipped';
        }
        const attempt = delivery.attempts + 1;
        try {
          await transport.send({
            to: recipient.email,
            messageId: `<${delivery.id}@${new URL(config.appOrigin).hostname}>`,
            ...renderMail(delivery.type, booking, recipient, config.appOrigin),
          });
        } catch (error) {
          const status = attempt >= maxAttempts ? 'failed' : 'pending';
          // Store only a bounded error code, never SMTP responses or credentials.
          const code = /^[A-Z0-9_]{1,40}$/.test(error.code || '') ? error.code : 'DELIVERY_FAILED';
          await client.query(
            `UPDATE courtly_mail_deliveries SET status=$2,attempts=$3,last_error=$4,next_attempt_at=$5 WHERE id=$1`,
            [delivery.id, status, attempt, code, new Date(+clock() + retrySeconds(attempt) * 1000)],
          );
          return status === 'failed' ? 'failed' : 'retry';
        }
        await client.query(
          "UPDATE courtly_mail_deliveries SET status='sent',attempts=$2,sent_at=$3,last_error=NULL WHERE id=$1",
          [delivery.id, attempt, clock()],
        );
        return 'sent';
      });
    },
    async runBatch(limit = 50) {
      await prepareMail(pool, limit);
      const counts = { sent: 0, skipped: 0, retry: 0, failed: 0 };
      for (let i = 0; i < limit; i++) {
        const result = await this.deliverOne();
        if (!result) break;
        counts[result]++;
      }
      return counts;
    },
  };
}

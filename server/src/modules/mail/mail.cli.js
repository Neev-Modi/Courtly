import { readDatabaseConfig } from '../../config/database.js';
import { readMailConfig } from '../../config/mail.js';
import { createPool } from '../../db/pool.js';
import { createMailTransport } from './mail.transport.js';
import { createMailService } from './mail.service.js';
import { renderMail } from './mail.templates.js';

const command = process.argv[2];
if (command === 'preview') {
  const config = readMailConfig({ APP_ORIGIN: process.env.APP_ORIGIN });
  console.log(
    renderMail(
      'booking.created',
      {
        id: 'sample-booking',
        court_name: 'Court 1',
        location: 'Indoor sports hall',
        start_time: '2030-06-10T10:30:00Z',
        end_time: '2030-06-10T11:00:00Z',
        confirmation_deadline: '2030-06-10T09:30:00Z',
      },
      { name: 'Sample player' },
      config.appOrigin,
    ).text,
  );
} else {
  let pool, transport;
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      stopping = true;
    });
  try {
    if (!['once', 'worker', 'verify', 'status'].includes(command))
      throw new Error('Unknown mail command.');
    const config = readMailConfig();
    if (command !== 'status') transport = createMailTransport(config);
    if (command === 'verify') {
      await transport.verify();
      console.log('SMTP connection and authentication verified. No email sent.');
    } else {
      const database = readDatabaseConfig();
      if (!database.databaseReady) throw new Error('Configure PostgreSQL first.');
      pool = createPool(database);
      if (command === 'status') {
        console.table(
          (
            await pool.query(
              'SELECT status,count(*)::int AS count FROM courtly_mail_deliveries GROUP BY status',
            )
          ).rows,
        );
      } else {
        const service = createMailService(pool, config, transport);
        do {
          console.log('Mail batch:', await service.runBatch());
          if (command === 'worker' && !stopping)
            await new Promise((resolve) => setTimeout(resolve, 5000));
        } while (command === 'worker' && !stopping);
      }
    }
  } catch (error) {
    // Configuration messages are safe; provider responses may contain private details.
    console.error(
      error.code
        ? `Mail command failed (${error.code}).`
        : 'Mail command failed. Check configuration, migrations and SMTP settings.',
    );
    process.exitCode = 1;
  } finally {
    transport?.close();
    await pool?.end();
  }
}

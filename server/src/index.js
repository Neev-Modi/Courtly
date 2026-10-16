import { readConfig } from './config/env.js';
import { createPool } from './db/pool.js';
import { createAuthRepository } from './modules/auth/auth.repository.js';
import { createGoogleProvider } from './modules/auth/google.provider.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { createApp } from './app.js';
import { createCourtsService } from './modules/courts/courts.service.js';
import { createBookingsService } from './modules/bookings/bookings.service.js';
const config = readConfig();
const pool = createPool(config);
const repository = createAuthRepository(pool);
const service = createAuthService({ repository, provider: createGoogleProvider(config), config });
const server = createApp({
  service,
  config,
  courts: createCourtsService(pool),
  bookings: createBookingsService(pool, config),
}).listen(config.port, () => {
  console.log(`Courtly API running on http://localhost:${config.port}`);
  if (!config.ready)
    console.log('Preview mode: create the root .env and run npm run db:migrate to enable sign-in.');
});
const cleanup = setInterval(() => {
  if (config.ready) repository.cleanup().catch(() => console.error('Session cleanup failed.'));
}, 3600000);
cleanup.unref();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    clearInterval(cleanup);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  });

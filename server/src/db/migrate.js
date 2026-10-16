import { migrateDatabase } from './migrations.js';
import { readDatabaseConfig } from '../config/database.js';
import { createPool } from './pool.js';
const config = readDatabaseConfig();
if (!config.databaseReady)
  throw new Error(
    'Set PGHOST, PGDATABASE, PGUSER, PGPASSWORD (or DATABASE_URL) in your root .env before migrating.',
  );
const pool = createPool(config);
try {
  await migrateDatabase(pool);
  console.log('Authentication, court and booking schemas are ready.');
} finally {
  await pool.end();
}

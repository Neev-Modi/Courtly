import { readdir, readFile } from 'node:fs/promises';
export async function migrateDatabase(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('courtly:migrations'))");
    await client.query(
      'CREATE TABLE IF NOT EXISTS courtly_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
    );
    const folder = new URL('./migrations/', import.meta.url);
    for (const name of (await readdir(folder)).filter((name) => name.endsWith('.sql')).sort()) {
      if ((await client.query('SELECT 1 FROM courtly_migrations WHERE name=$1', [name])).rowCount)
        continue;
      await client.query(await readFile(new URL(name, folder), 'utf8'));
      await client.query('INSERT INTO courtly_migrations(name) VALUES($1)', [name]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

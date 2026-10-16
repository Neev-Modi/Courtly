import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
export function readDatabaseConfig(env = process.env) {
  const pgPort = Number(env.PGPORT || 5432),
    databasePoolMax = Number(env.DATABASE_POOL_MAX || 10),
    databaseConnectTimeoutMs = Number(env.DATABASE_CONNECT_TIMEOUT_MS || 5000);
  if (!Number.isInteger(pgPort) || pgPort < 1 || pgPort > 65535) throw new Error('Invalid PGPORT.');
  if (!Number.isInteger(databasePoolMax) || databasePoolMax < 1 || databasePoolMax > 100)
    throw new Error('DATABASE_POOL_MAX must be between 1 and 100.');
  if (
    !Number.isInteger(databaseConnectTimeoutMs) ||
    databaseConnectTimeoutMs < 1000 ||
    databaseConnectTimeoutMs > 60000
  )
    throw new Error('DATABASE_CONNECT_TIMEOUT_MS must be between 1000 and 60000.');
  if (env.DATABASE_SSL && !['true', 'false'].includes(env.DATABASE_SSL))
    throw new Error('DATABASE_SSL must be true or false.');
  if (env.DATABASE_URL) {
    const url = new URL(env.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(url.protocol))
      throw new Error('DATABASE_URL must use PostgreSQL.');
    if (['sslmode', 'sslcert', 'sslkey', 'sslrootcert'].some((key) => url.searchParams.has(key)))
      throw new Error(
        'Remove SSL parameters from DATABASE_URL; configure DATABASE_SSL and DATABASE_CA_CERT_PATH instead.',
      );
  }
  return {
    databaseReady: Boolean(
      env.DATABASE_URL || (env.PGHOST && env.PGDATABASE && env.PGUSER && env.PGPASSWORD),
    ),
    pgHost: env.PGHOST || 'localhost',
    pgPort,
    pgDatabase: env.PGDATABASE,
    pgUser: env.PGUSER,
    pgPassword: env.PGPASSWORD,
    databaseUrl: env.DATABASE_URL,
    databaseSsl: env.DATABASE_SSL === 'true',
    databaseCaCertPath: env.DATABASE_CA_CERT_PATH,
    databasePoolMax,
    databaseConnectTimeoutMs,
  };
}

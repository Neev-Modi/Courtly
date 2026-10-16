import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export function databaseOptions(config) {
  const ca = config.databaseCaCertPath
    ? readFileSync(
        resolve(fileURLToPath(new URL('../../../', import.meta.url)), config.databaseCaCertPath),
        'utf8',
      )
    : undefined;
  return {
    ...(config.databaseUrl
      ? { connectionString: config.databaseUrl }
      : {
          host: config.pgHost,
          port: config.pgPort,
          database: config.pgDatabase,
          user: config.pgUser,
          password: config.pgPassword,
        }),
    ssl: config.databaseSsl ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) } : false,
    max: config.databasePoolMax,
    connectionTimeoutMillis: config.databaseConnectTimeoutMs,
    idleTimeoutMillis: 30000,
  };
}
export function createPool(config) {
  return new pg.Pool(databaseOptions(config));
}

export function readMailConfig(env = process.env) {
  const mode = env.MAIL_MODE || 'disabled';
  if (!['disabled', 'smtp'].includes(mode)) throw new Error('MAIL_MODE must be disabled or smtp.');
  const port = Number(env.MAIL_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid MAIL_PORT.');
  const appOrigin = env.APP_ORIGIN || 'http://localhost:5173';
  const url = new URL(appOrigin);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.origin !== appOrigin ||
    (env.NODE_ENV === 'production' && url.protocol !== 'https:')
  )
    throw new Error('Mail APP_ORIGIN must be an HTTP(S) origin; production requires HTTPS.');
  if (
    mode === 'smtp' &&
    ['MAIL_HOST', 'MAIL_USER', 'MAIL_PASS', 'MAIL_FROM'].some((key) => !env[key]?.trim())
  )
    throw new Error('SMTP requires MAIL_HOST, MAIL_USER, MAIL_PASS and MAIL_FROM.');
  if (/[\r\n]/.test(env.MAIL_FROM || '')) throw new Error('Invalid MAIL_FROM.');
  return {
    mode,
    host: env.MAIL_HOST,
    port,
    user: env.MAIL_USER,
    pass: env.MAIL_PASS,
    from: env.MAIL_FROM,
    appOrigin,
  };
}

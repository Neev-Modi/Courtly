import nodemailer from 'nodemailer';
export function createMailTransport(config) {
  if (config.mode !== 'smtp') throw new Error('Set MAIL_MODE=smtp to enable delivery.');
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    auth: { user: config.user, pass: config.pass },
    tls: { rejectUnauthorized: true },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    async send(message) {
      const result = await transport.sendMail({ ...message, from: config.from });
      if (!result.accepted?.length || result.rejected?.length)
        throw new Error('SMTP_RECIPIENT_REJECTED');
    },
    verify: () => transport.verify(),
    close: () => transport.close(),
  };
}

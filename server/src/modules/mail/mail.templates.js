const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const format = (value) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
export function renderMail(type, booking, recipient, appOrigin) {
  const messages = {
    'booking.created': [
      'You are invited to play',
      `Please sign in with your invited account, open My bookings, and accept or decline before ${format(booking.confirmation_deadline)} IST.`,
    ],
    'booking.confirmed': [
      'Your booking is confirmed',
      'All players have accepted. Your court reservation is confirmed.',
    ],
    'booking.cancelled': [
      'Your booking was cancelled',
      `Reason: ${booking.cancellation_reason || 'An invited player declined.'}`,
    ],
    'booking.reminder': ['Your game is coming up', 'Please arrive at the venue 10 minutes early.'],
    'booking.expired': [
      'Your booking hold expired',
      'Not all players accepted before the confirmation deadline. The court has been released.',
    ],
  };
  if (!messages[type]) throw new Error('Unsupported mail event.');
  const [subject, message] = messages[type];
  const link = `${appOrigin}/bookings`;
  const lines = [
    `Hello ${recipient.name},`,
    message,
    `Court: ${booking.court_name}`,
    `Location: ${booking.location}`,
    `Start: ${format(booking.start_time)} IST`,
    `End: ${format(booking.end_time)} IST`,
    `Booking reference: ${booking.id}`,
    'After signing in, open My bookings to view this reservation.',
    link,
  ];
  return {
    subject: `Courtly — ${subject}`,
    text: lines.join('\n\n'),
    html: `<div style="background:#f8fafc;color:#172033;padding:24px;font-family:Arial,sans-serif"><h1>${escape(subject)}</h1>${lines
      .slice(0, -1)
      .map((line) => `<p>${escape(line)}</p>`)
      .join(
        '',
      )}<p><a href="${escape(link)}">Open My bookings</a></p><p>Courtly · Campus badminton</p></div>`,
  };
}

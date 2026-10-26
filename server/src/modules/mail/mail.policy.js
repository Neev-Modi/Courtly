export const mailEventTypes = [
  'booking.created',
  'booking.confirmed',
  'booking.cancelled',
  'booking.reminder',
  'booking.expired',
];
export const maxAttempts = 5;
export function retrySeconds(attempt) {
  return Math.min(3600, 60 * 2 ** (attempt - 1));
}

export function shouldDeliver(type, booking, recipient, now = new Date()) {
  if (!booking || !recipient || recipient.is_banned) return false;
  const pending = booking.status === 'pending' && new Date(booking.confirmation_deadline) > now;
  const upcoming = new Date(booking.start_time) > now;
  switch (type) {
    case 'booking.created':
      return (
        pending && upcoming && recipient.status === 'pending' && recipient.id !== booking.creator_id
      );
    case 'booking.confirmed':
    case 'booking.reminder':
      return booking.status === 'confirmed' && upcoming;
    case 'booking.cancelled':
      return booking.status === 'cancelled';
    case 'booking.expired':
      return booking.status === 'pending' && !pending;
    default:
      return false;
  }
}

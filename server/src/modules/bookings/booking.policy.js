import { fail } from '../../shared/validation.js';
export const bookingPolicy = Object.freeze({
  timeZone: 'Asia/Kolkata',
  daysAhead: 2,
  noticeMinutes: 60,
  confirmationMinutes: 60,
  cooldownDays: 3,
});
const DAY = 86400000,
  MINUTE = 60000;
export function campusDate(value = new Date()) {
  return new Date(new Date(value).getTime() + 330 * MINUTE).toISOString().slice(0, 10);
}
export function validDate(date) {
  if (
    typeof date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
  )
    fail('Choose a valid date.');
  return date;
}
export function validateDateWindow(date, now) {
  validDate(date);
  const days = (Date.parse(date) - Date.parse(campusDate(now))) / DAY;
  if (days < 0 || days > bookingPolicy.daysAhead)
    fail('Book for today, tomorrow or the day after tomorrow.');
}
export function durations(count) {
  return count === 2 ? [15, 30] : count === 3 ? [45] : [60];
}
export function windows(date) {
  const day = new Date(`${date}T12:00:00+05:30`).getUTCDay();
  return [
    ['06:00', day === 0 || day === 6 ? '11:00' : '09:00'],
    ['16:00', '22:00'],
  ];
}
export function instant(date, time) {
  return new Date(`${date}T${time}:00+05:30`);
}
export function validateRange(start, end) {
  const format = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (
    typeof start !== 'string' ||
    typeof end !== 'string' ||
    !format.test(start) ||
    !format.test(end) ||
    !Number.isFinite(Date.parse(start)) ||
    !Number.isFinite(Date.parse(end)) ||
    Date.parse(end) <= Date.parse(start)
  )
    fail('Provide a valid start and end time with a timezone.');
  validDate(start.slice(0, 10));
  validDate(end.slice(0, 10));
  return { start: new Date(start), end: new Date(end) };
}
export function validateSlot(startValue, endValue, count, now) {
  const { start, end } = validateRange(startValue, endValue);
  const date = campusDate(start);
  validateDateWindow(date, now);
  if (start.getTime() < now.getTime() + bookingPolicy.noticeMinutes * MINUTE)
    fail('Book at least one hour before the start.');
  if (start.getTime() % (15 * MINUTE) !== 0 || !durations(count).includes((end - start) / MINUTE))
    fail('Choose an available slot with the correct duration for your group.');
  if (!windows(date).some(([a, b]) => start >= instant(date, a) && end <= instant(date, b)))
    fail('The selected time is outside court opening hours.');
  return { start, end, date };
}
export function effectiveStatus(booking, now = new Date()) {
  if (booking.status === 'cancelled') return 'cancelled';
  if (booking.status === 'pending' && new Date(booking.confirmation_deadline) <= now)
    return 'expired';
  if (booking.status === 'confirmed' && new Date(booking.end_time) <= now) return 'completed';
  return booking.status;
}
export function generateSlots(date, duration, busy, now) {
  const slots = [];
  for (const [a, b] of windows(date))
    for (
      let start = +instant(date, a);
      start + duration * MINUTE <= +instant(date, b);
      start += 15 * MINUTE
    ) {
      const end = start + duration * MINUTE;
      if (
        start < +now + bookingPolicy.noticeMinutes * MINUTE ||
        busy.some((item) => start < +new Date(item.end_time) && end > +new Date(item.start_time))
      )
        continue;
      slots.push({
        start_time: new Date(start).toISOString(),
        end_time: new Date(end).toISOString(),
      });
    }
  return slots;
}

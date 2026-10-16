export const TIME_ZONE = 'Asia/Kolkata';
export function campusDate(value = new Date()) {
  return new Date(+new Date(value) + 330 * 60000).toISOString().slice(0, 10);
}
export function dateChoices() {
  const today = campusDate();
  return [0, 1, 2].map((day) => {
    const date = new Date(`${today}T12:00:00+05:30`);
    date.setUTCDate(date.getUTCDate() + day);
    return { value: campusDate(date), label: ['Today', 'Tomorrow', 'Day after tomorrow'][day] };
  });
}
export const displayTime = (value) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
export const displayDate = (value) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
export function localInputToIso(value) {
  return new Date(`${value}:00+05:30`).toISOString();
}

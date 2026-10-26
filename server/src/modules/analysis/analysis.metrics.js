import { campusDate, effectiveStatus } from '../bookings/booking.policy.js';

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const round = (value) => Math.round(value * 100) / 100;
const series = (labels) => labels.map((label) => ({ label, value: 0 }));
export function buildReport({ bookings, courts }, range, now = new Date(), source = 'live') {
  const status = series(['pending', 'confirmed', 'completed', 'cancelled', 'expired']);
  const hourly = series(Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`));
  const weekday = series(days);
  const groups = series(['2', '3', '4', '5', '6', 'Other']);
  const duration = series(['15 min', '30 min', '45 min', '60 min', 'Other']);
  const lead = series(['< 6 h', '6–12 h', '12–24 h', '24–48 h', '48+ h']);
  const responses = series(['confirmed', 'pending', 'declined']);
  const cancellations = series(['Organizer', 'Participant', 'Administrator / other', 'Unknown']);
  const heatmap = days.map((label) => ({ label, values: Array(24).fill(0) }));
  const courtMap = new Map(
    courts.map((c) => [c.id, { label: c.name, active: c.is_active, value: 0, hours: 0 }]),
  );
  const users = new Map();
  const dates = bookings.map((b) => campusDate(b.start_time)).sort();
  const from = range.from || dates[0] || null;
  const to = range.to || dates.at(-1) || null;
  const monthly = from && to && (Date.parse(to) - Date.parse(from)) / 86400000 > 90;
  const trend = new Map();
  let minutes = 0,
    totalLead = 0,
    totalPlayers = 0,
    invited = 0,
    accepted = 0;
  for (const b of bookings) {
    const state = effectiveStatus(b, now);
    status.find((s) => s.label === state).value++;
    const local = new Date(+new Date(b.start_time) + 330 * 60000);
    const hour = local.getUTCHours(),
      day = (local.getUTCDay() + 6) % 7;
    hourly[hour].value++;
    weekday[day].value++;
    heatmap[day].values[hour]++;
    const date = campusDate(b.start_time),
      key = monthly ? date.slice(0, 7) : date;
    trend.set(key, (trend.get(key) || 0) + 1);
    const court = courtMap.get(b.court_id);
    if (court) court.value++;
    const length = (+new Date(b.end_time) - +new Date(b.start_time)) / 60000;
    if (['confirmed', 'completed'].includes(state)) {
      minutes += length;
      if (court) court.hours += length / 60;
    }
    duration[[15, 30, 45, 60].includes(length) ? [15, 30, 45, 60].indexOf(length) : 4].value++;
    const hours = Math.max(0, (+new Date(b.start_time) - +new Date(b.created_at)) / 3600000);
    totalLead += hours;
    lead[hours < 6 ? 0 : hours < 12 ? 1 : hours < 24 ? 2 : hours < 48 ? 3 : 4].value++;
    const players = b.players || [];
    totalPlayers += players.length;
    groups[players.length >= 2 && players.length <= 6 ? players.length - 2 : 5].value++;
    for (const p of players) {
      users.set(p.id, (users.get(p.id) || 0) + 1);
      if (p.id !== b.creator_id) {
        invited++;
        if (p.status === 'confirmed') accepted++;
        const response = responses.find((s) => s.label === p.status);
        if (response) response.value++;
      }
    }
    if (state === 'cancelled') {
      const index = !b.cancelled_by
        ? 3
        : b.cancelled_by === b.creator_id
          ? 0
          : players.some((p) => p.id === b.cancelled_by)
            ? 1
            : 2;
      cancellations[index].value++;
    }
  }
  // Include zero-demand calendar buckets, so gaps remain visible in the trend.
  if (from && to) {
    let cursor = new Date(`${monthly ? from.slice(0, 7) + '-01' : from}T00:00:00Z`);
    while (cursor.toISOString().slice(0, 10) <= to) {
      const key = cursor.toISOString().slice(0, monthly ? 7 : 10);
      if (!trend.has(key)) trend.set(key, 0);
      if (monthly) cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      else cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  const total = bookings.length;
  const percent = (count) => (total ? round((count / total) * 100) : 0);
  const count = (label) => status.find((s) => s.label === label).value;
  const peak = hourly.reduce((a, b) => (b.value > a.value ? b : a));
  return {
    schemaVersion: 1,
    source,
    generatedAt: now.toISOString(),
    timeZone: 'Asia/Kolkata',
    range: { mode: range.mode, from, to, basis: 'Booking start date, inclusive IST' },
    summary: {
      totalBookings: total,
      reservedHours: round(minutes / 60),
      uniquePlayers: users.size,
      repeatPlayers: [...users.values()].filter((n) => n > 1).length,
      averageGroupSize: total ? round(totalPlayers / total) : 0,
      averageLeadHours: total ? round(totalLead / total) : 0,
      cancellationRate: percent(count('cancelled')),
      expiryRate: percent(count('expired')),
      confirmationRate: percent(count('confirmed') + count('completed')),
      invitationAcceptanceRate: invited ? round((accepted / invited) * 100) : 0,
      peakHour: total ? peak.label : null,
      totalCourts: courts.length,
      activeCourts: courts.filter((c) => c.is_active).length,
    },
    charts: {
      status,
      hourly,
      weekday,
      groups,
      duration,
      lead,
      responses,
      cancellations,
      heatmap,
      courtDemand: [...courtMap.values()].map(({ label, value, active }) => ({
        label,
        value,
        active,
      })),
      courtHours: [...courtMap.values()].map((c) => ({ label: c.label, value: round(c.hours) })),
      trend: [...trend]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, value]) => ({ label, value })),
      trendBucket: monthly ? 'month' : 'day',
      participation: [
        { label: 'One booking', value: [...users.values()].filter((n) => n === 1).length },
        { label: 'Repeat participants', value: [...users.values()].filter((n) => n > 1).length },
      ],
    },
    notes: [
      'Demand charts count all booking attempts, including cancelled and expired holds; hours use the booking start hour.',
      'Reserved hours include confirmed and completed reservations, not attendance or measured utilization.',
      'Statuses, invitation responses and court active flags reflect the generation time, not the historical state at the end of the range.',
      'Unique/repeat participants include invited players on every booking status. Invitation responses exclude organizers.',
      'Cancellation sources describe the actor’s relationship to the booking, not their historical role. Administrator / other means a nonparticipant actor.',
      'All includes future reservations. Custom dates filter scheduled start dates, not creation dates. Peak-hour ties select the earliest hour.',
    ],
  };
}

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { buildReport } from '../src/modules/analysis/analysis.metrics.js';
import { analysisDirectory } from '../src/modules/analysis/analysis.store.js';
const courts = ['North Court', 'South Court', 'Practice Court', 'Old Hall'].map((name, i) => ({
  id: `court-${i}`,
  name,
  is_active: i !== 3,
}));
const bookings = Array.from({ length: 180 }, (_, i) => {
  const day = 1 + Math.floor(i / 6),
    hour = [6, 7, 16, 18, 18, 20][i % 6];
  const start = new Date(
    `2026-09-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+05:30`,
  );
  const count = 2 + (i % 5),
    minutes = count === 2 ? (i % 2 ? 15 : 30) : count === 3 ? 45 : 60;
  const status = i % 9 === 0 ? 'cancelled' : i % 7 === 0 ? 'pending' : 'confirmed';
  const creator = `player-${i % 47}`;
  const created = new Date(+start - (2 + (i % 65)) * 3600000);
  return {
    id: `sample-${i}`,
    court_id: courts[i % 10 < 5 ? 0 : i % 10 < 8 ? 1 : 2].id,
    creator_id: creator,
    status,
    start_time: start.toISOString(),
    end_time: new Date(+start + minutes * 60000).toISOString(),
    created_at: created.toISOString(),
    confirmation_deadline: new Date(+created + 3600000).toISOString(),
    cancelled_by: status === 'cancelled' ? (i % 2 ? creator : 'sample-admin') : null,
    players: Array.from({ length: count }, (_, j) => ({
      id: j ? `player-${(i + j + 11) % 67}` : creator,
      status:
        j === 0 || status === 'confirmed'
          ? 'confirmed'
          : j === 1 && status === 'cancelled'
            ? 'declined'
            : 'pending',
    })),
  };
});
const report = buildReport(
  { bookings, courts },
  { mode: 'demo', from: '2026-09-01', to: '2026-09-30' },
  new Date('2026-10-01T00:00:00Z'),
  'demo',
);
report.notes.unshift(
  'FICTIONAL DEMO: generated sample records, not campus activity. No database data is used.',
);
await mkdir(analysisDirectory, { recursive: true });
await writeFile(join(analysisDirectory, 'demo.json'), JSON.stringify(report, null, 2) + '\n');
console.log('Created fictional demo.json. Last-generated report was not changed.');

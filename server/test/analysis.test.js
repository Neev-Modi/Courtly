import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, copyFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildReport } from '../src/modules/analysis/analysis.metrics.js';
import { createAnalysisService } from '../src/modules/analysis/analysis.service.js';
import { createAnalysisStore, analysisDirectory } from '../src/modules/analysis/analysis.store.js';
const now = new Date('2030-06-12T00:00:00Z');
const courts = [{ id: 'c', name: 'Court', is_active: true }];
const base = {
  id: 'b',
  court_id: 'c',
  creator_id: 'a',
  status: 'confirmed',
  start_time: '2030-06-10T18:30:00Z',
  end_time: '2030-06-10T19:00:00Z',
  created_at: '2030-06-10T00:00:00Z',
  confirmation_deadline: '2030-06-10T01:00:00Z',
  players: [
    { id: 'a', status: 'confirmed' },
    { id: 'b', status: 'confirmed' },
  ],
};
test('analytics uses IST start dates, derived statuses and invitation-only response counts', () => {
  const report = buildReport(
    {
      courts,
      bookings: [
        base,
        {
          ...base,
          id: 'expired',
          status: 'pending',
          players: [
            { id: 'a', status: 'confirmed' },
            { id: 'c', status: 'pending' },
          ],
        },
      ],
    },
    { mode: 'all' },
    now,
  );
  assert.equal(report.range.from, '2030-06-11');
  assert.equal(report.summary.totalBookings, 2);
  assert.equal(report.summary.reservedHours, 0.5);
  assert.equal(report.summary.expiryRate, 50);
  assert.equal(report.summary.invitationAcceptanceRate, 50);
  assert.equal(report.summary.uniquePlayers, 3);
  assert.equal(report.summary.repeatPlayers, 1);
  assert.equal(report.summary.peakHour, '00:00');
  assert.equal(report.charts.status.find((s) => s.label === 'completed').value, 1);
  assert.equal(
    report.charts.responses.reduce((n, s) => n + s.value, 0),
    2,
  );
  assert.ok(!JSON.stringify(report).includes('creator_id'));
});
test('empty analytics is finite and fills custom calendar gaps', () => {
  const report = buildReport(
    { courts, bookings: [] },
    { mode: 'custom', from: '2030-06-01', to: '2030-06-03' },
    now,
  );
  assert.equal(report.charts.trend.length, 3);
  assert.equal(report.summary.totalBookings, 0);
  assert.equal(report.summary.peakHour, null);
  assert.equal(report.summary.cancellationRate, 0);
  assert.ok(!JSON.stringify(report).includes('NaN'));
  const long = buildReport(
    { courts, bookings: [] },
    { mode: 'custom', from: '2030-01-01', to: '2030-12-31' },
    now,
  );
  assert.equal(long.charts.trendBucket, 'month');
  assert.equal(long.charts.trend.length, 12);
});
test('analysis validates ranges and modes before querying or saving', async () => {
  let reads = 0;
  const service = createAnalysisService(
    {
      load: async () => {
        reads++;
        return { courts, bookings: [] };
      },
    },
    { save: async () => {} },
  );
  for (const input of [
    { mode: '../demo' },
    { mode: 'custom', from: '2030-02-30', to: '2030-03-01' },
    { mode: 'custom', from: '2030-06-02', to: '2030-06-01' },
    { mode: 'custom', from: '1900-01-01', to: '2030-01-01' },
  ])
    await assert.rejects(service.report(input), (error) => error.status === 400);
  assert.equal(reads, 0);
});
test('demo is read-only, live snapshots roundtrip, corrupt snapshots fail clearly', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'courtly-analysis-'));
  try {
    const store = createAnalysisStore(directory);
    await copyFile(join(analysisDirectory, 'demo.json'), join(directory, 'demo.json'));
    let reads = 0;
    const service = createAnalysisService(
      {
        load: async () => {
          reads++;
          return { courts, bookings: [base] };
        },
      },
      store,
      () => now,
    );
    await assert.rejects(
      service.report({ mode: 'last_generated' }),
      (error) => error.code === 'NO_SAVED_REPORT',
    );
    assert.equal((await service.report({ mode: 'demo' })).source, 'demo');
    assert.equal(reads, 0);
    const live = await service.report({ mode: 'all' });
    assert.deepEqual(await service.report({ mode: 'last_generated' }), live);
    await service.report({ mode: 'demo' });
    assert.deepEqual(await store.read('last_generated'), live);
    assert.equal(reads, 1);
    await writeFile(join(directory, 'last_generated.json'), '{broken');
    await assert.rejects(
      store.read('last_generated'),
      (error) => error.code === 'REPORT_READ_FAILED',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

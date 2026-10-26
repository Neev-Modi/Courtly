import { validDate } from '../bookings/booking.policy.js';
import { AppError } from '../../shared/errors.js';
import { buildReport } from './analysis.metrics.js';
export function createAnalysisService(repository, store, clock = () => new Date()) {
  let running = false;
  return {
    async report(input) {
      const mode = input.mode;
      if (!['demo', 'last_generated', 'all', 'custom'].includes(mode))
        throw new AppError(400, 'INVALID_MODE', 'Choose Demo, Last Generated, All or Custom.');
      if (mode === 'demo' || mode === 'last_generated') return store.read(mode);
      const range = { mode, from: null, to: null };
      if (mode === 'custom') {
        range.from = validDate(input.from);
        range.to = validDate(input.to);
        if (range.from > range.to)
          throw new AppError(400, 'INVALID_RANGE', 'From date must be on or before To date.');
        if (Number(range.from.slice(0, 4)) < 2000 || Number(range.to.slice(0, 4)) > 2100)
          throw new AppError(400, 'INVALID_RANGE', 'Choose dates between 2000 and 2100.');
      }
      if (running)
        throw new AppError(
          409,
          'REPORT_BUSY',
          'Another report is being generated. Try again shortly.',
        );
      running = true;
      try {
        const data = await repository.load(range);
        const report = buildReport(data, range, clock());
        await store.save(report);
        return report;
      } finally {
        running = false;
      }
    },
  };
}

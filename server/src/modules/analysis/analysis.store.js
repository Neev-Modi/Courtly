import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../shared/errors.js';
export const analysisDirectory = fileURLToPath(new URL('../../../data/analysis/', import.meta.url));
export function createAnalysisStore(directory = analysisDirectory) {
  return {
    async read(mode) {
      const filename = mode === 'demo' ? 'demo.json' : 'last_generated.json';
      let report;
      try {
        report = JSON.parse(await readFile(join(directory, filename), 'utf8'));
      } catch (error) {
        if (error.code === 'ENOENT' && mode !== 'demo')
          throw new AppError(404, 'NO_SAVED_REPORT', 'Generate an All or Custom report first.');
        throw new AppError(
          500,
          'REPORT_READ_FAILED',
          'The saved report could not be read. Generate a new report or restore the demo file.',
        );
      }
      if (report.empty)
        throw new AppError(404, 'NO_SAVED_REPORT', 'Generate an All or Custom report first.');
      if (
        report.schemaVersion !== 1 ||
        !report.summary ||
        !report.charts ||
        !report.range ||
        !Array.isArray(report.notes)
      )
        throw new AppError(500, 'INVALID_REPORT', 'Unsupported saved report format.');
      return report;
    },
    async save(report) {
      await mkdir(directory, { recursive: true });
      const temporary = join(directory, `.report-${randomUUID()}.tmp`);
      try {
        await writeFile(temporary, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
        await rename(temporary, join(directory, 'last_generated.json'));
      } finally {
        await unlink(temporary).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
        });
      }
    },
  };
}

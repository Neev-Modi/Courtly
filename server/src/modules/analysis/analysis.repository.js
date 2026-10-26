import { AppError } from '../../shared/errors.js';
export function createAnalysisRepository(pool) {
  return {
    async load(range) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        await client.query("SET LOCAL statement_timeout = '15s'");
        const courts = (
          await client.query('SELECT id,name,is_active FROM courtly_courts ORDER BY name')
        ).rows;
        const bookings = (
          await client.query(
            `SELECT b.id,b.court_id,b.creator_id,b.status,b.start_time,b.end_time,
          b.created_at,b.confirmation_deadline,b.cancelled_by,
          COALESCE((SELECT json_agg(json_build_object('id',p.user_id,'status',p.status))
            FROM courtly_booking_players p WHERE p.booking_id=b.id),'[]'::json) AS players
          FROM courtly_bookings b
          WHERE ($1::timestamptz IS NULL OR b.start_time >= $1::timestamptz)
            AND ($2::timestamptz IS NULL OR b.start_time < $2::timestamptz)
          ORDER BY b.start_time,b.id LIMIT 100001`,
            [
              range.from ? `${range.from}T00:00:00+05:30` : null,
              range.to
                ? new Date(Date.parse(`${range.to}T00:00:00+05:30`) + 86400000).toISOString()
                : null,
            ],
          )
        ).rows;
        if (bookings.length > 100000)
          throw new AppError(
            422,
            'REPORT_TOO_LARGE',
            'More than 100,000 bookings. Select a smaller Custom date range.',
          );
        await client.query('COMMIT');
        return { courts, bookings };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

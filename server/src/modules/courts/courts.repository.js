export function createCourtsRepository(db) {
  return {
    async list(includeInactive = false) {
      return (
        await db.query('SELECT * FROM courtly_courts WHERE ($1 OR is_active) ORDER BY name', [
          includeInactive,
        ])
      ).rows;
    },
    async get(id, lock = false) {
      return (
        await db.query(`SELECT * FROM courtly_courts WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [id])
      ).rows[0];
    },
    async insert(id, data) {
      return (
        await db.query(
          'INSERT INTO courtly_courts(id,name,location,description) VALUES($1,$2,$3,$4) RETURNING *',
          [id, data.name, data.location, data.description],
        )
      ).rows[0];
    },
    async update(id, data) {
      return (
        await db.query(
          'UPDATE courtly_courts SET name=$2,location=$3,description=$4,is_active=$5 WHERE id=$1 RETURNING *',
          [id, data.name, data.location, data.description, data.is_active],
        )
      ).rows[0];
    },
    async upcoming(id, now) {
      return (
        (
          await db.query(
            "SELECT 1 FROM courtly_bookings WHERE court_id=$1 AND end_time>$2 AND (status='confirmed' OR (status='pending' AND confirmation_deadline>$2)) LIMIT 1",
            [id, now],
          )
        ).rowCount > 0
      );
    },
    async blocks(id, now) {
      return (
        await db.query(
          'SELECT * FROM courtly_blocks WHERE court_id=$1 AND end_time>$2 ORDER BY start_time',
          [id, now],
        )
      ).rows;
    },
    async addBlock(id, courtId, data, actor) {
      return (
        await db.query(
          'INSERT INTO courtly_blocks(id,court_id,start_time,end_time,reason,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
          [id, courtId, data.start, data.end, data.reason, actor],
        )
      ).rows[0];
    },
    async removeBlock(id, courtId) {
      return (
        (
          await db.query('DELETE FROM courtly_blocks WHERE id=$1 AND court_id=$2 RETURNING id', [
            id,
            courtId,
          ])
        ).rowCount > 0
      );
    },
    async conflicts(id, start, end, now) {
      return (
        (
          await db.query(
            "SELECT 1 FROM courtly_bookings WHERE court_id=$1 AND start_time<$3 AND end_time>$2 AND (status='confirmed' OR (status='pending' AND confirmation_deadline>$4)) UNION ALL SELECT 1 FROM courtly_blocks WHERE court_id=$1 AND start_time<$3 AND end_time>$2 LIMIT 1",
            [id, start, end, now],
          )
        ).rowCount > 0
      );
    },
    async busy(id, start, end, now) {
      return (
        await db.query(
          "SELECT start_time,end_time FROM courtly_bookings WHERE court_id=$1 AND start_time<$3 AND end_time>$2 AND (status='confirmed' OR (status='pending' AND confirmation_deadline>$4)) UNION ALL SELECT start_time,end_time FROM courtly_blocks WHERE court_id=$1 AND start_time<$3 AND end_time>$2",
          [id, start, end, now],
        )
      ).rows;
    },
  };
}

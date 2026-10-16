export function createBookingsRepository(db) {
  return {
    async users(emails) {
      return (
        await db.query(
          'SELECT id,email,name,is_banned,role FROM auth_users WHERE lower(email)=ANY($1::text[]) ORDER BY id',
          [emails],
        )
      ).rows;
    },
    async lockPlayers(ids) {
      for (const id of [...ids].sort())
        await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`courtly:player:${id}`]);
    },
    async playerConflict(ids, start, end, now) {
      return (
        await db.query(
          `SELECT u.email FROM courtly_bookings b JOIN courtly_booking_players p ON p.booking_id=b.id JOIN auth_users u ON u.id=p.user_id
        WHERE p.user_id=ANY($1::uuid[]) AND (b.status='confirmed' OR (b.status='pending' AND b.confirmation_deadline>$4))
        AND b.start_time<$3 AND b.end_time>$2 LIMIT 1`,
          [ids, start, end, now],
        )
      ).rows[0];
    },
    async cooldown(ids, start, now, days) {
      return (
        await db.query(
          `SELECT u.email FROM courtly_bookings b JOIN courtly_booking_players p ON p.booking_id=b.id JOIN auth_users u ON u.id=p.user_id
        WHERE p.user_id=ANY($1::uuid[]) AND (b.status='confirmed' OR (b.status='pending' AND b.confirmation_deadline>$3))
        AND ABS(EXTRACT(EPOCH FROM (b.start_time-$2::timestamptz))) < $4 LIMIT 1`,
          [ids, start, now, days * 86400],
        )
      ).rows[0];
    },
    async insert(id, courtId, creatorId, start, end, deadline, now) {
      await db.query(
        'INSERT INTO courtly_bookings(id,court_id,creator_id,start_time,end_time,confirmation_deadline,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$7)',
        [id, courtId, creatorId, start, end, deadline, now],
      );
    },
    async addPlayer(bookingId, userId, creatorId, now) {
      await db.query(
        'INSERT INTO courtly_booking_players(booking_id,user_id,status,responded_at) VALUES($1,$2,$3,$4)',
        [
          bookingId,
          userId,
          userId === creatorId ? 'confirmed' : 'pending',
          userId === creatorId ? now : null,
        ],
      );
    },
    async get(id, lock = false) {
      return (
        await db.query(`SELECT * FROM courtly_bookings WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [
          id,
        ])
      ).rows[0];
    },
    async players(id) {
      return (
        await db.query(
          'SELECT u.id,u.name,u.email,u.is_banned,p.status,p.responded_at FROM courtly_booking_players p JOIN auth_users u ON u.id=p.user_id WHERE booking_id=$1 ORDER BY u.name',
          [id],
        )
      ).rows;
    },
    async respond(id, userId, status, now) {
      await db.query(
        'UPDATE courtly_booking_players SET status=$3,responded_at=$4 WHERE booking_id=$1 AND user_id=$2',
        [id, userId, status, now],
      );
    },
    async confirm(id, now) {
      await db.query("UPDATE courtly_bookings SET status='confirmed',updated_at=$2 WHERE id=$1", [
        id,
        now,
      ]);
    },
    async cancel(id, actorId, reason, now) {
      await db.query(
        "UPDATE courtly_bookings SET status='cancelled',cancelled_by=$2,cancellation_reason=$3,updated_at=$4 WHERE id=$1",
        [id, actorId, reason, now],
      );
    },
    async list(userId, admin, date, offset = 0) {
      return (
        await db.query(
          `SELECT b.*,c.name AS court_name,c.location, u.name AS creator_name,
        (SELECT json_agg(json_build_object('id',p.user_id,'name',a.name,'email',a.email,'status',p.status) ORDER BY a.name)
         FROM courtly_booking_players p JOIN auth_users a ON a.id=p.user_id WHERE p.booking_id=b.id) AS players,
        count(*) OVER()::int AS total_count
        FROM courtly_bookings b JOIN courtly_courts c ON c.id=b.court_id JOIN auth_users u ON u.id=b.creator_id
        WHERE ($2 OR EXISTS(SELECT 1 FROM courtly_booking_players p WHERE p.booking_id=b.id AND p.user_id=$1))
        AND ($3::date IS NULL OR (b.start_time AT TIME ZONE 'Asia/Kolkata')::date=$3::date)
        ORDER BY b.start_time DESC,b.id LIMIT 50 OFFSET $4`,
          [userId, admin, date, offset],
        )
      ).rows;
    },
  };
}

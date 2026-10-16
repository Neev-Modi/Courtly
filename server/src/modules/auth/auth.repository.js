export function createAuthRepository(pool) {
  return {
    async findUser(subject) {
      return (await pool.query('SELECT * FROM auth_users WHERE google_subject=$1', [subject]))
        .rows[0];
    },
    async saveUser({ id, subject, email, name, role }) {
      return (
        await pool.query(
          `INSERT INTO auth_users(id,google_subject,email,name,role) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(google_subject) DO UPDATE SET email=EXCLUDED.email,name=EXCLUDED.name,last_login_at=NOW() RETURNING *`,
          [id, subject, email, name, role],
        )
      ).rows[0];
    },
    async createSession(hash, userId, expires, refreshHash) {
      await pool.query(
        'INSERT INTO auth_sessions(token_hash,user_id,expires_at,refresh_hash) VALUES($1,$2,$3,$4)',
        [hash, userId, expires, refreshHash],
      );
    },
    async sessionUser(hash) {
      return (
        await pool.query(
          'SELECT u.* FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()',
          [hash],
        )
      ).rows[0];
    },
    async deleteSession(hash) {
      await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1', [hash]);
    },
    async rotateRefresh(hash, previous, next) {
      return (
        (
          await pool.query(
            'UPDATE auth_sessions SET refresh_hash=$3 WHERE token_hash=$1 AND refresh_hash=$2 AND expires_at>NOW() RETURNING token_hash',
            [hash, previous, next],
          )
        ).rowCount === 1
      );
    },
    async storeAttempt(hash, verifier, nonce) {
      await pool.query(
        "INSERT INTO auth_oauth_attempts VALUES($1,$2,$3,NOW()+INTERVAL '10 minutes')",
        [hash, verifier, nonce],
      );
    },
    async consumeAttempt(hash) {
      return (
        await pool.query(
          'DELETE FROM auth_oauth_attempts WHERE state_hash=$1 AND expires_at>NOW() RETURNING verifier,nonce',
          [hash],
        )
      ).rows[0];
    },
    async cleanup() {
      await pool.query('DELETE FROM auth_sessions WHERE expires_at<=NOW()');
      await pool.query('DELETE FROM auth_oauth_attempts WHERE expires_at<=NOW()');
    },
  };
}

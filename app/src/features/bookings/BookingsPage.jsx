import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, CalendarDays } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { managementApi as api } from '../../shared/api/management.api';
import { displayDate, displayTime } from '../../shared/lib/campus-time';
import styles from '../../styles/management.module.css';
export function BookingsPage({ admin = false }) {
  const { user } = useAuth();
  const [data, setData] = useState({ items: [], total: 0 }),
    [date, setDate] = useState(''),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [cancel, setCancel] = useState(null),
    [reason, setReason] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    setLoading(true);
    setError('');
    api
      .bookings(admin, { ...(date ? { date } : {}), page })
      .then((result) => {
        if (current === generation.current) setData(result);
      })
      .catch((err) => {
        if (current === generation.current) setError(err.message);
      })
      .finally(() => {
        if (current === generation.current) setLoading(false);
      });
    return () => {
      generation.current++;
    };
  }, [admin, date, page, revision]);
  useEffect(() => {
    const update = () => setRevision((x) => x + 1);
    window.addEventListener('focus', update);
    return () => window.removeEventListener('focus', update);
  }, []);
  async function action(id, work, message) {
    setBusy(id);
    setError('');
    setNotice('');
    try {
      await work();
      setNotice(message);
      setCancel(null);
      setReason('');
      setRevision((x) => x + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <div className={styles.titleRow}>
        <div>
          <span className={styles.eyebrow}>{admin ? 'CAMPUS OVERVIEW' : 'YOUR TIME ON COURT'}</span>
          <h1>{admin ? 'All bookings.' : 'Games worth showing up for.'}</h1>
          <p>
            {admin
              ? 'Review campus reservations and handle cancellations.'
              : 'Track reservations, accept invitations, and keep your group together.'}
          </p>
        </div>
        <Link className="primary-button" to="/dashboard">
          Find a court
        </Link>
      </div>
      <section className={styles.filters}>
        <label>
          Filter by date (IST)
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <button
          className={styles.secondary}
          onClick={() => {
            setDate('');
            setPage(1);
          }}
        >
          All dates
        </button>
        <button
          className={styles.secondary}
          disabled={loading}
          onClick={() => setRevision((x) => x + 1)}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
        <span className={styles.muted}>View and respond to your invitations here.</span>
      </section>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className={styles.success} role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <p className={styles.empty} role="status">
          Loading bookings…
        </p>
      ) : data.items.length === 0 ? (
        <div className={styles.empty}>
          <CalendarDays size={32} />
          <h2>No bookings here yet</h2>
          <p>Reserve a court or ask a teammate to invite your registered email.</p>
        </div>
      ) : (
        <div className={styles.bookingList}>
          {data.items.map((booking) => {
            const me = booking.players.find((p) => p.id === user.id),
              active = ['pending', 'confirmed'].includes(booking.status),
              canRespond =
                booking.status === 'pending' &&
                me?.status === 'pending' &&
                +new Date(booking.confirmation_deadline) > Date.now(),
              canCancel =
                active &&
                (user.role === 'admin' || booking.creator_id === user.id) &&
                +new Date(booking.end_time) > Date.now() &&
                (user.role === 'admin' || +new Date(booking.start_time) - Date.now() >= 3600000);
            return (
              <article className={styles.bookingCard} key={booking.id}>
                <div className={styles.bookingTop}>
                  <div>
                    <span className={styles.eyebrow}>{displayDate(booking.start_time)}</span>
                    <h2>{booking.court_name}</h2>
                    <p>
                      {displayTime(booking.start_time)}–{displayTime(booking.end_time)} IST ·{' '}
                      {booking.location}
                    </p>
                  </div>
                  <span className={`${styles.badge} ${styles[booking.status]}`}>
                    {booking.status}
                  </span>
                </div>
                <p className={styles.muted}>
                  Organized by {booking.creator_name} · {booking.players.length} players · Ref{' '}
                  {booking.id.slice(0, 8)}
                </p>
                <div className={styles.playerList}>
                  {booking.players.map((player) => (
                    <div key={player.id}>
                      <span className={styles.avatar}>{player.name.slice(0, 1)}</span>
                      <span>
                        <strong>
                          {player.name}
                          {player.id === user.id ? ' (you)' : ''}
                        </strong>
                        <small>{player.email}</small>
                      </span>
                      <span className={styles.playerStatus}>{player.status}</span>
                    </div>
                  ))}
                </div>
                {booking.status === 'pending' && (
                  <p className={styles.pendingNote}>
                    Waiting for confirmations. Hold expires{' '}
                    {displayDate(booking.confirmation_deadline)} at{' '}
                    {displayTime(booking.confirmation_deadline)} IST. Refresh to see the latest
                    status.
                  </p>
                )}
                {booking.cancellation_reason && (
                  <p className={styles.muted}>Cancellation: {booking.cancellation_reason}</p>
                )}
                <div className={styles.actions}>
                  {canRespond && (
                    <>
                      <button
                        className="primary-button"
                        disabled={!!busy}
                        onClick={() =>
                          action(
                            booking.id,
                            () => api.respond(booking.id, 'confirmed'),
                            'Invitation accepted.',
                          )
                        }
                      >
                        Accept invitation
                      </button>
                      <button
                        className={styles.secondary}
                        disabled={!!busy}
                        onClick={() =>
                          action(
                            booking.id,
                            () => api.respond(booking.id, 'declined'),
                            'Invitation declined. The reservation has been cancelled.',
                          )
                        }
                      >
                        Decline & cancel booking
                      </button>
                    </>
                  )}
                  {canCancel && (
                    <button
                      className={styles.dangerButton}
                      disabled={!!busy}
                      onClick={() => {
                        setCancel(booking.id);
                        setReason('');
                      }}
                    >
                      Cancel booking
                    </button>
                  )}
                  {busy === booking.id && <span role="status">Saving…</span>}
                </div>
                {cancel === booking.id && (
                  <form
                    className={styles.cancelForm}
                    onSubmit={(e) => {
                      e.preventDefault();
                      action(
                        booking.id,
                        () => api.cancel(booking.id, reason),
                        'Booking cancelled; the slot is available again.',
                      );
                    }}
                  >
                    <label>
                      Reason for cancellation
                      <input
                        required
                        maxLength={240}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        autoFocus
                      />
                    </label>
                    <div className={styles.actions}>
                      <button className={styles.dangerButton} disabled={!!busy}>
                        Confirm cancellation
                      </button>
                      <button
                        type="button"
                        className={styles.secondary}
                        disabled={!!busy}
                        onClick={() => setCancel(null)}
                      >
                        Keep booking
                      </button>
                    </div>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      )}
      <div className={styles.pagination}>
        <button
          className={styles.secondary}
          disabled={page === 1 || loading}
          onClick={() => setPage((x) => x - 1)}
        >
          Previous
        </button>
        <span>
          Page {page} · {data.total} bookings
        </span>
        <button
          className={styles.secondary}
          disabled={page * 50 >= data.total || loading}
          onClick={() => setPage((x) => x + 1)}
        >
          Next
        </button>
      </div>
    </>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Clock3, ArrowRight, RefreshCw } from 'lucide-react';
import { managementApi as api } from '../../shared/api/management.api';
import { dateChoices, displayTime, displayDate } from '../../shared/lib/campus-time';
import { BookingForm } from '../bookings/BookingForm';
import styles from '../../styles/management.module.css';
export function CourtsPage() {
  const days = dateChoices();
  const [date, setDate] = useState(days[0].value),
    [players, setPlayers] = useState(2),
    [duration, setDuration] = useState(30);
  const [courts, setCourts] = useState([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [selected, setSelected] = useState(null),
    [notice, setNotice] = useState(''),
    [revision, setRevision] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    setBusy(true);
    setError('');
    setSelected(null);
    api
      .slots({ date, players, duration })
      .then((data) => {
        if (current === generation.current) setCourts(data.courts);
      })
      .catch((err) => {
        if (current === generation.current) setError(err.message);
      })
      .finally(() => {
        if (current === generation.current) setBusy(false);
      });
    return () => {
      generation.current++;
    };
  }, [date, players, duration, revision]);
  function changePlayers(value) {
    setPlayers(value);
    setDuration(value === 2 ? 30 : value === 3 ? 45 : 60);
  }
  return (
    <>
      <div className={styles.titleRow}>
        <div>
          <span className={styles.eyebrow}>MAKE TIME FOR A GOOD GAME</span>
          <h1>Find your next court.</h1>
          <p>Pick a time. Invite your people. Get playing.</p>
        </div>
        <Link className={styles.secondary} to="/bookings">
          My bookings <ArrowRight size={16} />
        </Link>
      </div>
      <div className={styles.ruleStrip}>
        <Clock3 size={17} />
        <span>
          Book 1 hour ahead · 2–6 players · 3 days between games · Confirm invites within 60 minutes
        </span>
      </div>
      <section className={styles.filters} aria-label="Availability filters">
        <label>
          Date
          <select value={date} onChange={(e) => setDate(e.target.value)}>
            {days.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label} · {displayDate(`${day.value}T12:00:00+05:30`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Players, including you
          <select value={players} onChange={(e) => changePlayers(Number(e.target.value))}>
            {[2, 3, 4, 5, 6].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Session length
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {(players === 2 ? [15, 30] : players === 3 ? [45] : [60]).map((value) => (
              <option key={value} value={value}>
                {value} minutes
              </option>
            ))}
          </select>
        </label>
        <button
          className={styles.secondary}
          onClick={() => setRevision((x) => x + 1)}
          disabled={busy}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </section>
      {notice && (
        <div className={styles.success} role="status">
          {notice} <Link to="/bookings">View booking →</Link>
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {busy ? (
        <p className={styles.empty} role="status">
          Finding available courts…
        </p>
      ) : !error && courts.length === 0 ? (
        <div className={styles.empty}>
          <h2>No courts available yet</h2>
          <p>Your administrator can add courts from Manage courts.</p>
        </div>
      ) : (
        !error && (
          <div className={styles.courtGrid}>
            {courts.map((court, index) => (
              <article className={styles.courtCard} key={court.id}>
                <div className={styles.courtArt}>
                  <span className={styles.courtNumber}>{String(index + 1).padStart(2, '0')}</span>
                  <div className={styles.courtDrawing} />
                  <span className={styles.artLabel}>CAMPUS BADMINTON</span>
                </div>
                <div className={styles.courtContent}>
                  <h2>{court.name}</h2>
                  <p className={styles.location}>
                    <MapPin size={14} />
                    {court.location}
                  </p>
                  {court.description && <p>{court.description}</p>}
                  <div className={styles.slotHeading}>
                    <strong>Available starts</strong>
                    <span>{duration} min · IST</span>
                  </div>
                  {court.slots.length === 0 ? (
                    <p className={styles.muted}>
                      No slots left for this date and duration. Try another day.
                    </p>
                  ) : (
                    <div className={styles.slots}>
                      {court.slots.map((slot) => (
                        <button
                          key={slot.start_time}
                          className={
                            selected?.court.id === court.id &&
                            selected?.slot.start_time === slot.start_time
                              ? styles.selectedSlot
                              : styles.slot
                          }
                          onClick={() => {
                            setSelected({ court, slot });
                            setNotice('');
                          }}
                        >
                          {displayTime(slot.start_time)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )
      )}
      {selected && (
        <BookingForm
          key={`${selected.court.id}-${selected.slot.start_time}`}
          selected={selected}
          players={players}
          onClose={() => setSelected(null)}
          onSuccess={() => {
            setSelected(null);
            setNotice(
              'Booking held. Your teammates can now accept the invitation from My bookings & invites.',
            );
            setRevision((x) => x + 1);
          }}
        />
      )}
    </>
  );
}

import { useEffect, useRef, useState } from 'react';
import { X, Users } from 'lucide-react';
import { managementApi as api } from '../../shared/api/management.api';
import { displayDate, displayTime } from '../../shared/lib/campus-time';
import { useAuth } from '../auth/AuthContext';
import styles from '../../styles/management.module.css';
export function BookingForm({ selected, players, onClose, onSuccess }) {
  const { user } = useAuth();
  const dialog = useRef(null),
    [emails, setEmails] = useState(Array(players - 1).fill('')),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.createBooking({ court_id: selected.court.id, ...selected.slot, emails });
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="booking-title"
    >
      <button
        className={styles.close}
        aria-label="Close booking form"
        onClick={onClose}
        disabled={busy}
      >
        <X size={20} />
      </button>
      <span className={styles.eyebrow}>YOUR NEXT GAME</span>
      <h2 id="booking-title">Bring your people.</h2>
      <p>
        <strong>{selected.court.name}</strong>
        <br />
        {displayDate(selected.slot.start_time)} · {displayTime(selected.slot.start_time)}–
        {displayTime(selected.slot.end_time)} IST
      </p>
      <form onSubmit={submit}>
        <div className={styles.ruleStrip}>
          <Users size={18} />
          <span>
            You + {players - 1} teammate{players > 2 ? 's' : ''}. Every player must already have a
            Courtly account.
          </span>
        </div>
        <p className={styles.muted}>Organizer: {user.email}</p>
        <div className={styles.formFields}>
          {emails.map((email, index) => (
            <label key={index}>
              Player {index + 2} email
              <input
                type="email"
                required
                maxLength={254}
                value={email}
                placeholder="player@student.nitw.ac.in"
                onChange={(e) =>
                  setEmails((values) =>
                    values.map((old, i) => (i === index ? e.target.value : old)),
                  )
                }
              />
            </label>
          ))}
        </div>
        <p className={styles.muted}>
          Invitations appear in each player’s account. Everyone must accept within 60 minutes;
          otherwise the hold expires. No email is sent.
        </p>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onClose} disabled={busy}>
            Back
          </button>
          <button className="primary-button" disabled={busy}>
            {busy ? 'Reserving…' : 'Reserve & invite'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

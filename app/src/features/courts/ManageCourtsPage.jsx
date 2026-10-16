import { useEffect, useState } from 'react';
import { Plus, MapPin, Pencil, Wrench } from 'lucide-react';
import { managementApi as api } from '../../shared/api/management.api';
import { displayDate, displayTime, localInputToIso } from '../../shared/lib/campus-time';
import styles from '../../styles/management.module.css';
const empty = { name: '', location: '', description: '', is_active: true };
export function ManageCourtsPage() {
  const [courts, setCourts] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(null),
    [form, setForm] = useState(empty),
    [showForm, setShowForm] = useState(false),
    [revision, setRevision] = useState(0),
    [blockCourt, setBlockCourt] = useState(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .courts()
      .then((data) => {
        if (active) setCourts(data.items);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  function edit(court) {
    setEditing(court?.id || null);
    setForm(
      court
        ? {
            name: court.name,
            location: court.location,
            description: court.description,
            is_active: court.is_active,
          }
        : empty,
    );
    setShowForm(true);
    setError('');
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.saveCourt(editing, form);
      setNotice(editing ? 'Court updated.' : 'Court created and ready for bookings.');
      setShowForm(false);
      setRevision((x) => x + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className={styles.titleRow}>
        <div>
          <span className={styles.eyebrow}>ADMINISTRATOR WORKSPACE</span>
          <h1>Keep the courts game-ready.</h1>
          <p>Add courts, update details, and reserve maintenance windows.</p>
        </div>
        <button className="primary-button" onClick={() => edit(null)}>
          <Plus size={18} />
          Add court
        </button>
      </div>
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
      {showForm && (
        <section className={styles.panel}>
          <h2>{editing ? 'Edit court' : 'Add a new court'}</h2>
          <form onSubmit={save}>
            <div className={styles.formGrid}>
              <label>
                Court name
                <input
                  required
                  maxLength={80}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Court 1"
                />
              </label>
              <label>
                Location
                <input
                  required
                  maxLength={160}
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Indoor sports complex"
                />
              </label>
              <label className={styles.fullWidth}>
                Description
                <textarea
                  maxLength={500}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Surface, facilities, or useful arrival information"
                />
              </label>
              {editing && (
                <label>
                  Status
                  <select
                    value={String(form.is_active)}
                    onChange={(e) => setForm({ ...form, is_active: e.target.value === 'true' })}
                  >
                    <option value="true">Active — bookable</option>
                    <option value="false">Archived — unavailable</option>
                  </select>
                </label>
              )}
            </div>
            {editing && (
              <p className={styles.muted}>
                Cancel upcoming reservations before archiving. Booking history is preserved.
              </p>
            )}
            <div className={styles.actions}>
              <button className="primary-button" disabled={busy}>
                {busy ? 'Saving…' : 'Save court'}
              </button>
              <button
                type="button"
                className={styles.secondary}
                disabled={busy}
                onClick={() => setShowForm(false)}
              >
                Close
              </button>
            </div>
          </form>
        </section>
      )}
      {loading ? (
        <p className={styles.empty} role="status">
          Loading courts…
        </p>
      ) : courts.length === 0 ? (
        <div className={styles.empty}>
          <h2>Your first court starts here</h2>
          <p>Add a court above. It will immediately appear in Find a court.</p>
        </div>
      ) : (
        <div className={styles.adminCourts}>
          {courts.map((court) => (
            <article key={court.id} className={styles.panel}>
              <div className={styles.bookingTop}>
                <h2>{court.name}</h2>
                <span
                  className={`${styles.badge} ${court.is_active ? styles.confirmed : styles.cancelled}`}
                >
                  {court.is_active ? 'Active' : 'Archived'}
                </span>
              </div>
              <p className={styles.location}>
                <MapPin size={15} />
                {court.location}
              </p>
              <p>{court.description || 'No description added.'}</p>
              <div className={styles.actions}>
                <button className={styles.secondary} onClick={() => edit(court)}>
                  <Pencil size={15} />
                  Edit court
                </button>
                <button
                  className={styles.secondary}
                  onClick={() => setBlockCourt(blockCourt?.id === court.id ? null : court)}
                >
                  <Wrench size={15} />
                  Maintenance
                </button>
              </div>
              {blockCourt?.id === court.id && <MaintenancePanel court={court} />}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
function MaintenancePanel({ court }) {
  const [blocks, setBlocks] = useState([]),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [reason, setReason] = useState('');
  useEffect(() => {
    let active = true;
    api
      .blocks(court.id)
      .then((data) => {
        if (active) setBlocks(data.items);
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [court.id, revision]);
  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.addBlock(court.id, {
        start_time: localInputToIso(start),
        end_time: localInputToIso(end),
        reason,
      });
      setStart('');
      setEnd('');
      setReason('');
      setNotice('Maintenance scheduled. These times are unavailable for booking.');
      setRevision((x) => x + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id) {
    setBusy(true);
    setError('');
    try {
      await api.removeBlock(court.id, id);
      setNotice('Maintenance block removed.');
      setRevision((x) => x + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.maintenance}>
      <h3>Maintenance windows</h3>
      <p className={styles.muted}>
        Enter campus time (IST). Existing reservations cannot be blocked.
      </p>
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
      <form onSubmit={create}>
        <div className={styles.formFields}>
          <label>
            Start (IST)
            <input
              type="datetime-local"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            End (IST)
            <input
              type="datetime-local"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <label>
            Reason
            <input
              required
              maxLength={240}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        </div>
        <button className="primary-button" disabled={busy}>
          {busy ? 'Saving…' : 'Block this interval'}
        </button>
      </form>
      {blocks.length === 0 ? (
        <p className={styles.muted}>No upcoming maintenance blocks.</p>
      ) : (
        <ul className={styles.blockList}>
          {blocks.map((block) => (
            <li key={block.id}>
              <strong>{block.reason}</strong>
              <small>
                {displayDate(block.start_time)} {displayTime(block.start_time)} →{' '}
                {displayDate(block.end_time)} {displayTime(block.end_time)} IST
              </small>
              <button
                className={styles.dangerButton}
                disabled={busy}
                onClick={() => remove(block.id)}
              >
                Remove block
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, LogOut, ShieldCheck, CalendarDays, ArrowUpRight } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { authApi } from '../auth/auth.api';
import { Brand } from '../../shared/components/Brand';
import styles from './account.module.css';
export function AccountPage({ admin = false }) {
  const { user, logout, refresh } = useAuth();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [verified, setVerified] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    if (admin)
      authApi
        .admin()
        .then(() => setVerified(true))
        .catch(() => {
          setError('Could not verify administrator access.');
          refresh();
        });
  }, [admin, refresh]);
  async function signOut() {
    setBusy(true);
    setError('');
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch {
      setError('Sign-out failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.page}>
      <header>
        <Brand />
        <button className={styles.logout} onClick={signOut} disabled={busy}>
          <LogOut size={16} />
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </header>
      <main>
        <div className={styles.badge}>
          <CheckCircle2 size={15} />
          YOU’RE PART OF THE COMMUNITY
        </div>
        <h1>Welcome{user.name ? `, ${user.name.split(' ')[0]}` : ''}.</h1>
        <p className={styles.subtitle}>A good game starts with good company. You’re in.</p>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.grid}>
          <section className={styles.profile}>
            <div className={styles.avatar}>{user.name.slice(0, 1).toUpperCase()}</div>
            <h2>Your campus account</h2>
            <p>Your identity is verified with Google.</p>
            <dl>
              <dt>Name</dt>
              <dd>{user.name}</dd>
              <dt>Email address</dt>
              <dd>{user.email}</dd>
              <dt>Access</dt>
              <dd className={styles.role}>
                <ShieldCheck size={15} />
                {user.role === 'admin' ? 'Administrator' : 'Campus player'}
              </dd>
            </dl>
            {user.role === 'admin' && (
              <Link className="primary-button" to={admin ? '/dashboard' : '/admin'}>
                {admin ? 'Player account' : 'Administrator area'}
                <ArrowUpRight size={15} />
              </Link>
            )}
          </section>
          <section className={styles.next}>
            <CalendarDays size={30} />
            <span>YOUR NEXT GAME</span>
            <h2>
              More court time.
              <br />
              Less back and forth.
            </h2>
            <p>
              Find an available court, invite your teammates, and manage your bookings in one place.
            </p>
            <Link className="primary-button" to="/dashboard">
              Find a court
            </Link>
            <Link className={styles.pill} to="/bookings">
              My bookings & invitations
            </Link>
            {admin && (
              <div className={styles.admin}>
                <ShieldCheck size={20} />
                <div>
                  <strong>
                    {verified ? 'Administrator access verified' : 'Checking administrator access…'}
                  </strong>
                  <p>Administration features will be added in the next module.</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
      <footer>Courtly · NIT Warangal badminton community</footer>
    </div>
  );
}

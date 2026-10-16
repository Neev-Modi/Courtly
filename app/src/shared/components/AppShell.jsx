import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { LogOut, CalendarDays, MapPin, Settings2 } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { Brand } from './Brand';
import styles from '../../styles/management.module.css';
export function AppShell() {
  const { user, logout, config } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function signOut() {
    setBusy(true);
    try {
      await logout();
      navigate('/login');
    } catch {
      setError('Could not sign out. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Brand />
        <span className={styles.campus}>NIT WARANGAL · BADMINTON</span>
        <div className={styles.identity}>
          <NavLink to="/account">{user.name.split(' ')[0]}</NavLink>
          <button
            className={styles.iconButton}
            onClick={signOut}
            disabled={busy}
            aria-label="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <nav className={styles.nav} aria-label="Court navigation">
        <NavLink to="/dashboard">
          <MapPin size={16} />
          Find a court
        </NavLink>
        <NavLink to="/bookings">
          <CalendarDays size={16} />
          My bookings & invites
        </NavLink>
        {user.role === 'admin' && (
          <>
            <NavLink to="/admin">
              <Settings2 size={16} />
              Manage courts
            </NavLink>
            <NavLink to="/admin/bookings">All bookings</NavLink>
          </>
        )}
      </nav>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {config?.demo && (
        <div className={styles.ruleStrip}>
          Isolated demo · sample accounts and temporary data only.{' '}
          <a href="/demo">
            <strong>Switch demo user →</strong>
          </a>
        </div>
      )}
      <main className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        Courtly · All court times are shown in India Standard Time (IST).
      </footer>
    </div>
  );
}

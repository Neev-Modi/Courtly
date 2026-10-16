import { Navigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  Check,
  ShieldCheck,
  CalendarDays,
  Users,
  MoveUpRight,
  LockKeyhole,
} from 'lucide-react';
import { useAuth } from '../AuthContext';
import { Brand } from '../../../shared/components/Brand';
import { LoadingScreen } from '../../../shared/components/LoadingScreen';
import { GoogleButton } from '../components/GoogleButton';
import { CourtIllustration } from '../components/CourtIllustration';
import styles from '../auth.module.css';
const messages = {
  INVALID_STATE: 'Your sign-in session expired. Please try again.',
  UNVERIFIED_EMAIL: 'Please use a verified Google account.',
  ACCOUNT_DISABLED: 'Your account is disabled. Contact your campus administrator.',
  DOMAIN_RESTRICTED:
    'This account does not have campus access. Please use your institute Google account.',
  SIGN_IN_CANCELLED: 'Sign-in was cancelled. You can try again whenever you’re ready.',
  SIGN_IN_FAILED: 'We couldn’t complete your sign-in. Please try again.',
};
export function LoginPage() {
  const { user, status, config, error, refresh } = useAuth();
  const [params] = useSearchParams();
  if (status === 'loading') return <LoadingScreen />;
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />;
  const authError = messages[params.get('error')];
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#how-it-works">
            How it works <MoveUpRight size={13} />
          </a>
          <span className={styles.campus}>
            <span />
            NIT WARANGAL
          </span>
        </nav>
      </header>
      <main>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.story}>
            <div className={styles.eyebrow}>
              <span /> YOUR CAMPUS. YOUR COURT.
            </div>
            <h1 id="hero-title">
              Good games
              <br />
              start <span>here.</span>
            </h1>
            <p className={styles.intro}>
              Less time coordinating.
              <br />
              More time on the court.
            </p>
            <CourtIllustration />
            <div className={styles.storyFooter}>
              <span className={styles.smallLabel}>MADE FOR THE CAMPUS COMMUNITY</span>
              <a href="#how-it-works" aria-label="Learn how Courtly works">
                <ArrowDown size={18} />
              </a>
            </div>
          </div>
          <div className={styles.loginArea}>
            <div className={styles.loginCard}>
              <div className={styles.cardIcon}>
                <LockKeyhole size={23} />
              </div>
              <span className={styles.smallLabel}>LET’S GET YOU PLAYING</span>
              <h2>Welcome to Courtly</h2>
              <p className={styles.cardIntro}>
                Your badminton community,
                <br />
                all in one place.
              </p>
              <div className={styles.signinSection}>
                <GoogleButton disabled={!config?.enabled} />
                <p className={styles.emailHint}>
                  Sign in with your <strong>*{config?.domain || 'nitw.ac.in'}</strong> account
                </p>
              </div>
              {(authError || error) && (
                <div className={styles.error} role="alert">
                  {error || authError}
                  {error && <button onClick={refresh}>Try again</button>}
                </div>
              )}
              {config && !config.enabled && (
                <div className={styles.notice} role="status">
                  Sign-in is coming online. Your campus administrator needs to finish setup.
                </div>
              )}
              <div className={styles.divider}>
                <span />A SPACE FOR OUR CAMPUS
                <span />
              </div>
              <ul className={styles.benefits}>
                <li>
                  <Check size={16} />
                  One account for all your court activity
                </li>
                <li>
                  <Check size={16} />A community of verified campus players
                </li>
                <li>
                  <Check size={16} />
                  Secure sign-in. No extra password.
                </li>
              </ul>
              <div className={styles.privacy}>
                <ShieldCheck size={17} />
                <p>
                  We only use your Google name and email to
                  <br className={styles.desktopBreak} /> identify your campus account.
                </p>
              </div>
            </div>
            <p className={styles.firstTime}>
              First time here? <strong>You’re in the right place.</strong>
              <br />
              Your account is created when you sign in.
            </p>
          </div>
        </section>
        <section id="how-it-works" className={styles.how}>
          <div className={styles.sectionTitle}>
            <span className={styles.smallLabel}>FROM CAMPUS TO COURT</span>
            <h2>A better way to get a game going.</h2>
            <p>Your campus badminton hub, one step at a time.</p>
          </div>
          <div className={styles.steps}>
            {[
              {
                icon: ShieldCheck,
                title: 'Make it official',
                text: 'Sign in with your institute Google account. You’re part of the community.',
                tag: '01 · AVAILABLE NOW',
              },
              {
                icon: CalendarDays,
                title: 'Find your court',
                text: 'A simpler way to discover courts and plan your next session.',
                tag: '02 · FIND A SLOT',
              },
              {
                icon: Users,
                title: 'Bring your people',
                text: 'Get your playing partners together and make time for a good game.',
                tag: '03 · INVITE & PLAY',
              },
            ].map(({ icon: Icon, title, text, tag }) => (
              <article key={title}>
                <div className={styles.stepTop}>
                  <Icon size={23} />
                  <span>{tag}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <Brand />
        <p>Built for the love of the game.</p>
        <span>NIT Warangal · Campus badminton</span>
      </footer>
    </div>
  );
}

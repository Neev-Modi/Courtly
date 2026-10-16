import { ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { authApi } from '../auth.api';
import styles from '../auth.module.css';
export function GoogleButton({ disabled }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={styles.googleButton}
      disabled={disabled || busy}
      onClick={() => {
        setBusy(true);
        window.location.assign(authApi.loginUrl);
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"
        />
        <path
          fill="#34A853"
          d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.97-3.38.97-2.6 0-4.8-1.76-5.6-4.12H3.05v2.6A10 10 0 0 0 12 22Z"
        />
        <path
          fill="#FBBC05"
          d="M6.4 13.93a6 6 0 0 1 0-3.86v-2.6H3.05a10 10 0 0 0 0 9.06l3.35-2.6Z"
        />
        <path
          fill="#EA4335"
          d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.47l3.35 2.6A5.99 5.99 0 0 1 12 5.95Z"
        />
      </svg>
      <span>{busy ? 'Opening Google…' : 'Continue with Google'}</span>
      <ArrowUpRight size={17} />
    </button>
  );
}

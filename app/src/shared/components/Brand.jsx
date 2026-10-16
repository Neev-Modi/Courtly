import { Link } from 'react-router-dom';
export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="Courtly home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32">
          <path d="M7 7h18v18H7zM7 16h18M16 7v18" />
        </svg>
      </span>
      <span>
        courtly<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}

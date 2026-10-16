import styles from '../auth.module.css';
export function CourtIllustration() {
  return (
    <div className={styles.illustration} aria-hidden="true">
      <div className={styles.orbit} />
      <div className={styles.court}>
        <div className={styles.courtInner}>
          <span className={styles.centerLine} />
          <span className={styles.serviceTop} />
          <span className={styles.serviceBottom} />
          <span className={styles.net} />
        </div>
      </div>
      <div className={styles.racket}>
        <span />
      </div>
      <div className={styles.shuttle}>✦</div>
      <div className={styles.courtTag}>
        <span /> A little less planning. A lot more playing.
      </div>
    </div>
  );
}

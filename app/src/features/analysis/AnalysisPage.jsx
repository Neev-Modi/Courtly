import { useState } from 'react';
import { BarChart3, Download, Printer, Sparkles } from 'lucide-react';
import { generateReport } from './analysis.api';
import { ChartCard, BarChart, DonutChart, LineChart, Heatmap } from './AnalysisCharts';
import styles from './analysis.module.css';

export function AnalysisPage() {
  const [mode, setMode] = useState('demo'),
    [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const [report, setReport] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function generate(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setReport(
        (await generateReport({ mode, ...(mode === 'custom' ? { from, to } : {}) })).report,
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `courtly-${report.source}-${report.generatedAt.slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const s = report?.summary,
    c = report?.charts;
  const cards = report
    ? [
        ['Booking attempts', s.totalBookings, 'All statuses'],
        ['Reserved hours', s.reservedHours, 'Confirmed + completed'],
        ['Unique participants', s.uniquePlayers, `${s.repeatPlayers} repeat participants`],
        ['Peak start hour', s.peakHour || '—', 'IST · all booking attempts'],
        ['Cancellation rate', `${s.cancellationRate}%`, `${s.expiryRate}% expired holds`],
        ['Invitation acceptance', `${s.invitationAcceptanceRate}%`, 'Organizer excluded'],
        ['Average group', s.averageGroupSize, 'Players per booking'],
        ['Average advance booking', `${s.averageLeadHours} h`, 'Creation to scheduled start'],
      ]
    : [];
  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>ADMINISTRATOR · ANALYSIS</span>
          <h1>Understand the game.</h1>
          <p>Explore court demand, booking outcomes, and participation.</p>
        </div>
        <BarChart3 size={38} />
      </header>
      <form className={styles.controls} onSubmit={generate}>
        <label>
          Report source
          <select value={mode} disabled={busy} onChange={(e) => setMode(e.target.value)}>
            <option value="demo">Demo</option>
            <option value="last_generated">Last Generated</option>
            <option value="all">All</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        {mode === 'custom' && (
          <>
            <label>
              From (IST)
              <input
                type="date"
                required
                min="2000-01-01"
                max={to || '2100-12-31'}
                value={from}
                disabled={busy}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              To (IST, inclusive)
              <input
                type="date"
                required
                min={from || '2000-01-01'}
                max="2100-12-31"
                value={to}
                disabled={busy}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </>
        )}
        <button className="primary-button" disabled={busy}>
          <Sparkles size={16} />
          {busy
            ? 'Preparing report…'
            : ['demo', 'last_generated'].includes(mode)
              ? 'Load report'
              : 'Generate report'}
        </button>
        <p>
          {mode === 'demo'
            ? 'Fictional data. Your saved report stays unchanged.'
            : mode === 'last_generated'
              ? 'Read the saved snapshot without querying current bookings.'
              : 'Generation replaces the shared last-generated JSON snapshot.'}
        </p>
      </form>
      {error && (
        <p className={styles.error} role="alert">
          {error}
          {report && ' The previous report remains displayed below.'}
        </p>
      )}
      {busy && <p role="status">Preparing your report…</p>}
      {!report ? (
        <section className={styles.welcome}>
          <BarChart3 size={48} />
          <h2>Your courts, in perspective.</h2>
          <p>Choose Demo to explore 13 charts, or generate a report from your booking records.</p>
        </section>
      ) : (
        <>
          <section className={styles.reportMeta}>
            <div>
              <span className={styles.badge}>
                {report.source === 'demo' ? 'FICTIONAL DEMO' : 'LIVE DATA SNAPSHOT'}
              </span>
              <h2>
                {report.range.mode === 'custom'
                  ? 'Custom'
                  : report.source === 'demo'
                    ? 'Demo'
                    : 'All bookings'}{' '}
                report
              </h2>
              <p>
                {report.range.from || 'No bookings'}
                {report.range.to ? ` → ${report.range.to}` : ''} · IST
              </p>
              <small>
                Generated{' '}
                {new Date(report.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}{' '}
                IST · {s.activeCourts} of {s.totalCourts} courts currently active
              </small>
            </div>
            <div className={styles.exports}>
              <button onClick={download}>
                <Download size={16} />
                Download JSON
              </button>
              <button onClick={() => window.print()}>
                <Printer size={16} />
                Print / Save PDF
              </button>
            </div>
          </section>
          {!s.totalBookings && (
            <p className={styles.empty}>
              No bookings match this range. All metrics are zero; this empty snapshot is saved for
              live reports.
            </p>
          )}
          <section className={styles.metrics} aria-label="Report summary">
            {cards.map(([label, value, hint]) => (
              <article key={label}>
                <p>{label}</p>
                <strong>{value}</strong>
                <small>{hint}</small>
              </article>
            ))}
          </section>
          <div className={styles.grid}>
            <ChartCard
              title="Booking outcomes"
              description="Current status of bookings in the selected range."
              data={c.status}
            >
              <DonutChart data={c.status} />
            </ChartCard>
            <ChartCard
              title="Demand over time"
              description={`Booking starts per ${c.trendBucket}. Zero-demand periods included.`}
              data={c.trend}
            >
              <LineChart data={c.trend} />
            </ChartCard>
            <ChartCard
              title="Court demand"
              description="All booking attempts, including unsuccessful holds."
              data={c.courtDemand}
            >
              <BarChart data={c.courtDemand} />
            </ChartCard>
            <ChartCard
              title="Reserved hours by court"
              description="Confirmed and completed reservation hours; not attendance."
              data={c.courtHours}
              unit="Hours"
            >
              <BarChart data={c.courtHours} unit="hours" />
            </ChartCard>
            <ChartCard
              title="Peak hours"
              description="Number of bookings starting in each IST hour."
              data={c.hourly}
            >
              <BarChart data={c.hourly} />
            </ChartCard>
            <ChartCard
              title="Weekday demand"
              description="Booking attempts by scheduled weekday."
              data={c.weekday}
            >
              <BarChart data={c.weekday} />
            </ChartCard>
            <section className={`${styles.card} ${styles.wide}`}>
              <h2>Weekly demand heatmap</h2>
              <Heatmap rows={c.heatmap} />
            </section>
            <ChartCard
              title="Group sizes"
              description="Participants invited per booking, including the organizer."
              data={c.groups}
            >
              <DonutChart data={c.groups} pie />
            </ChartCard>
            <ChartCard
              title="Booking durations"
              description="Scheduled minutes per booking attempt."
              data={c.duration}
            >
              <BarChart data={c.duration} />
            </ChartCard>
            <ChartCard
              title="Advance booking"
              description="Time between booking creation and scheduled start."
              data={c.lead}
            >
              <BarChart data={c.lead} />
            </ChartCard>
            <ChartCard
              title="Invitation responses"
              description="Stored responses across all statuses, excluding organizers."
              data={c.responses}
              unit="Invitations"
            >
              <DonutChart data={c.responses} />
            </ChartCard>
            <ChartCard
              title="Cancellation sources"
              description="Cancelling actor’s relationship to the booking."
              data={c.cancellations}
            >
              <BarChart data={c.cancellations} />
            </ChartCard>
            <ChartCard
              title="Returning participants"
              description="Unique players appearing on one versus multiple bookings in this range."
              data={c.participation}
              unit="Players"
            >
              <DonutChart data={c.participation} pie />
            </ChartCard>
          </div>
          <section className={styles.notes}>
            <h2>How to read this report</h2>
            <ul>
              {report.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

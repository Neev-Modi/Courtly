import { useId } from 'react';
import styles from './analysis.module.css';
export const chartColors = [
  'var(--chart-forest)',
  'var(--chart-blue)',
  'var(--chart-amber)',
  'var(--chart-rose)',
  'var(--chart-purple)',
  'var(--chart-teal)',
];
export const statusColors = {
  pending: 'var(--chart-amber)',
  confirmed: 'var(--chart-blue)',
  completed: 'var(--chart-forest)',
  cancelled: 'var(--chart-rose)',
  expired: 'var(--chart-purple)',
};
const color = (row, i) => statusColors[row.label] || chartColors[i % chartColors.length];

export function ChartCard({ title, description, data, children, unit = 'Bookings' }) {
  const id = useId();
  return (
    <section className={styles.card} aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <p className={styles.caption}>{description}</p>
      {children}
      <details className={styles.dataTable}>
        <summary>View chart data</summary>
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i}>
                <th scope="row">{row.label}</th>
                <td>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
export function BarChart({ data, unit = 'bookings' }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className={styles.bars}>
      {data.map((row, i) => (
        <div className={styles.barRow} key={i}>
          <span title={row.label}>{row.label}</span>
          <div className={styles.track}>
            <div
              style={{ width: `${(row.value / max) * 100}%`, background: color(row, i) }}
              title={`${row.label}: ${row.value} ${unit}`}
            />
          </div>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
  );
}
export function DonutChart({ data, pie = false }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  let offset = 0;
  return (
    <div className={styles.donutLayout}>
      <svg
        viewBox="0 0 200 200"
        role="img"
        aria-label={`${pie ? 'Pie' : 'Doughnut'} chart, total ${total}`}
      >
        <circle
          cx="100"
          cy="100"
          r={pie ? 50 : 70}
          fill="none"
          stroke="var(--chart-grid)"
          strokeWidth={pie ? 100 : 27}
        />
        {total > 0 &&
          data.map((row, i) => {
            const length = (row.value / total) * 100,
              start = offset;
            offset += length;
            return (
              <circle
                key={i}
                cx="100"
                cy="100"
                r={pie ? 50 : 70}
                pathLength="100"
                fill="none"
                stroke={color(row, i)}
                strokeWidth={pie ? 100 : 27}
                strokeDasharray={`${length} ${100 - length}`}
                strokeDashoffset={-start}
                transform="rotate(-90 100 100)"
              >
                <title>
                  {row.label}: {row.value} ({Math.round(length)}%)
                </title>
              </circle>
            );
          })}
        {!pie && (
          <>
            <text x="100" y="100" textAnchor="middle" className={styles.donutTotal}>
              {total}
            </text>
            <text x="100" y="119" textAnchor="middle" className={styles.svgLabel}>
              total
            </text>
          </>
        )}
      </svg>
      <ul className={styles.legend}>
        {data.map((row, i) => (
          <li key={i}>
            <i style={{ background: color(row, i) }} />
            <span>{row.label}</span>
            <strong>{row.value}</strong>
            <small>{total ? Math.round((row.value / total) * 100) : 0}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
export function LineChart({ data }) {
  if (!data.length) return <p className={styles.empty}>No dates in this report.</p>;
  const max = Math.max(1, ...data.map((d) => d.value));
  const x = (i) => 40 + (i / Math.max(1, data.length - 1)) * 590;
  const y = (value) => 195 - (value / max) * 160;
  const points = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
  return (
    <svg
      viewBox="0 0 660 240"
      className={styles.lineChart}
      role="img"
      aria-label="Booking demand over time"
    >
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1="40" x2="630" y1={y(max * t)} y2={y(max * t)} stroke="var(--chart-grid)" />
          <text x="30" y={y(max * t) + 4} textAnchor="end" className={styles.svgLabel}>
            {Math.round(max * t)}
          </text>
        </g>
      ))}
      <polygon points={`40,195 ${points} ${x(data.length - 1)},195`} fill="var(--chart-area)" />
      <polyline points={points} fill="none" stroke="var(--chart-forest)" strokeWidth="3" />
      {data.map((d, i) => (
        <circle key={i} cx={x(i)} cy={y(d.value)} r="3" fill="var(--chart-forest)">
          <title>
            {d.label}: {d.value} bookings
          </title>
        </circle>
      ))}
      <text x="40" y="225" className={styles.svgLabel}>
        {data[0].label}
      </text>
      <text x="630" y="225" textAnchor="end" className={styles.svgLabel}>
        {data.at(-1).label}
      </text>
    </svg>
  );
}
export function Heatmap({ rows }) {
  const max = Math.max(1, ...rows.flatMap((r) => r.values));
  return (
    <div className={styles.heatScroll}>
      <table className={styles.heatmap}>
        <caption>
          Booking starts by weekday and hour (IST). Darker cells indicate greater demand.
        </caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {row.values.map((v, h) => (
                <td
                  key={h}
                  title={`${row.label} ${h}:00 — ${v} bookings`}
                  style={{
                    background: `color-mix(in srgb, var(--chart-forest) ${(v / max) * 75}%, var(--chart-heat-base))`,
                    color: v / max > 0.55 ? 'var(--chart-on-dark)' : 'var(--color-ink)',
                  }}
                >
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

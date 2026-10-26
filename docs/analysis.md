# Admin analysis module

## Strategy

Analysis answers three questions: when courts are requested, what happens to reservations, and how players participate. It reports recorded activity, not inferred attendance, revenue or measured court utilization. Only administrators can access the page and API; the server enforces `analysis:read` independently of frontend navigation.

## Report modes and JSON files

| Selection | Behavior |
| --- | --- |
| Demo | Reads `server/data/analysis/demo.json`. Fictional September 2026 activity, clearly labelled. No database query or last-report overwrite. |
| Last Generated | Reads `server/data/analysis/last_generated.json` exactly as saved. No regeneration or database query. A missing/empty snapshot prompts the administrator to generate one. |
| All | Queries all booking start dates, including future reservations, builds a JSON report and replaces the last-generated file. |
| Custom | Filters booking start dates between From and To inclusive in IST, then replaces the last-generated file. Same-day ranges are valid. |

Every populated file has `schemaVersion`, `source`, `generatedAt`, `timeZone`, `range`, `summary`, `charts`, and `notes`. Download JSON exports the currently displayed snapshot, even if the report controls have since changed. Print / Save PDF uses the browser print dialog with print-specific CSS. Last Generated is one shared snapshot for all administrators on this server, not a history or a per-user preference.

The last-generated file initially contains an empty marker and is ignored by Git. A fresh checkout without it behaves identically; the first live report creates it. Files live outside public assets and can only be read through the protected API or by someone with local filesystem access. Snapshots contain aggregates and court names, no player names, email addresses, user IDs or tokens. Treat the aggregated operational data as private.

Writes use a temporary file and atomic rename to avoid partially-written JSON. An in-process generation guard returns 409 if another live report is being generated. Concurrent application instances must share durable storage; the last completed write wins across processes. For multi-server deployment, replace `analysis.store.js` with object storage or a database snapshot adapter. Do not place these JSON files in the frontend public directory.

## Metrics and 13 charts

| Chart | Type | Definition |
| --- | --- | --- |
| Booking outcomes | Doughnut | Pending, confirmed, completed, cancelled and expired at generation time |
| Demand over time | Line / area | Booking starts per IST calendar day; monthly buckets when range exceeds 90 days; zero-demand periods included |
| Court demand | Bar | All attempts per court, including cancelled/expired bookings; zero-booking courts retained |
| Reserved hours by court | Bar | Sum of confirmed and completed reservation durations in hours |
| Peak hours | Bar | All booking attempts by scheduled start hour, 00–23 IST |
| Weekday demand | Bar | All booking attempts by IST weekday |
| Weekly demand | Heatmap | Weekday × start-hour counts |
| Group sizes | Pie | Number of invited participants including organizer per booking |
| Booking durations | Bar | Scheduled 15/30/45/60-minute durations plus an Other bucket |
| Advance booking | Histogram | Creation-to-start lead time: <6, 6–12, 12–24, 24–48, 48+ hours |
| Invitation responses | Doughnut | Stored confirmed/pending/declined participant responses, excluding organizers |
| Cancellation sources | Bar | Actor relationship: organizer, participant, nonparticipant administrator/other, or unknown |
| Returning participants | Pie | Unique participants appearing in one versus multiple booking attempts in the range |

Summary cards show total attempts, reserved hours, unique/repeat participants, peak hour, cancellation/expiry rates, invitation acceptance, average group size and average booking lead time. The JSON additionally includes confirmation rate and current active/total courts. Rates use all selected bookings as denominator except invitation acceptance, which uses invited participant records. Empty denominators yield zero. Peak-hour ties use the earliest hour. Repeated bookings by a player are counted as repeat participation regardless of cancellation or response status.

Statuses are derived from current records and generation time using the booking module's shared policy. A historical date range is not an audit reconstruction: later cancellations/responses are reflected. Completed means a confirmed reservation has ended, not that attendance was verified. Court active status is current. Nonparticipant cancellation actors are not labelled by a historical role that the database does not retain. No maintenance-based utilization percentage is claimed because historical operating capacity is not stored.

## Modular implementation

- `server/src/modules/analysis/analysis.repository.js`: a read-only repeatable-read database snapshot, explicit IST boundaries and a 15-second query timeout.
- `analysis.metrics.js`: pure, independently tested calculations and JSON contract.
- `analysis.store.js`: private file reads and atomic writes.
- `analysis.service.js`: report mode, date validation and generation coordination.
- `analysis.routes.js`: admin permission, rate-limited report endpoint.
- `app/src/features/analysis/AnalysisPage.jsx`: controls, summaries, exports and chart arrangement.
- `AnalysisCharts.jsx`: reusable bar, doughnut/pie, line and heatmap components with exact-value tables/tooltips.
- `analysis.module.css`: responsive light theme, print layout, and named color variables (`--chart-forest`, `--chart-blue`, `--chart-amber`, `--chart-rose`, `--chart-purple`, `--chart-teal`, plus neutral tokens). `chartColors` and `statusColors` map chart categories to those variables.

No new chart library or external data source is needed. The same PostgreSQL connection configuration supports local and remote databases. Live reports are capped at 100,000 bookings rather than silently truncated; use a narrower Custom range for larger datasets. Custom dates are limited to 2000–2100. Large campus datasets should eventually move aggregation into SQL/materialized summaries. Browser charts and exported JSON use the exact same report object.

## API and local run

`POST /api/analysis/reports` accepts `{"mode":"demo"}`, `{"mode":"last_generated"}`, `{"mode":"all"}`, or `{"mode":"custom","from":"2026-09-01","to":"2026-09-30"}`. A valid administrator session and matching Origin header are required. Responses use `Cache-Control: no-store`. Twenty requests per minute per IP are allowed; invalid dates/modes return 400, nonadmins 403, missing snapshots 404, concurrent generation 409, oversized reports 422.

From the primary project directory:

```bash
npm run dev
```

Sign in as an administrator and open **Analysis** (`/admin/analysis`). No new environment keys or database migration are required for analysis (existing application migrations must already be installed).

For an isolated walkthrough with sample accounts:

```bash
npm run demo
```

Open `http://127.0.0.1:4180/demo`, choose Campus Admin, then Analysis → Demo → Load report. Try All and Last Generated to exercise snapshots using disposable demo records. The demo runner uses a temporary report directory, so it does not replace the real last-generated report. Ctrl+C cleans up its schema and report directory.

To recreate the committed fictional demo only: `node server/scripts/create-analysis-demo.js`.

Verification: `npm test`, `npm run test:integration`, `npm run build`. Tests cover derived statuses, participant counts, zero data, calendar buckets, invalid ranges, snapshot persistence, admin access, same-origin protection and exact IST date boundaries. Database integration checks use a disposable schema and temporary report files.

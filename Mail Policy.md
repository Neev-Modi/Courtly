# Mail Policy

## Scope and reference

Courtly sends transactional booking notifications. The read-only prototype uses Nodemailer for invitations, administrator cancellations, and scheduled reminders. This implementation keeps those responsibilities modular, adds confirmation notices and durable retries, and uses the current booking policy (a 60-minute confirmation hold). It does not copy the prototype's five-minute-before-start cancellation rule.

No cron jobs, marketing mail, arbitrary-recipient HTTP endpoint, account approval workflow, or one-click GET confirmation are introduced. Existing authentication and booking authorization remain authoritative.

## Notification rules

| Event               | Recipients                            | Delivery condition                                                                        |
| ------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `booking.created`   | Invited players, excluding organizer  | Booking and recipient still pending; hold and start are in the future                     |
| `booking.confirmed` | All participants, including organizer | Booking confirmed and not yet started                                                     |
| `booking.cancelled` | All participants, including organizer | Booking cancelled; include cancellation reason                                            |
| `booking.reminder`  | All participants                      | Booking confirmed and not yet started; future scheduler must produce event                |
| `booking.expired`   | All participants                      | Pending booking has passed its confirmation deadline; future scheduler must produce event |

Banned recipients and missing bookings/participants are skipped. Each recipient gets a separate message, without exposing other participants' addresses. `booking.responded` and court events do not trigger mail. Accepting an invitation does not send an extra notice unless it completes the group confirmation.

Mail contains the court, location, start/end in Asia/Kolkata (IST), full booking reference, and a link to `/bookings` on `APP_ORIGIN`. Recipients sign in using the invited account, then open My bookings and accept or decline there. The existing login flow may land on the dashboard after sign-in. Links do not grant access or change booking state; email scanners cannot confirm a booking. `APP_SIGNING_SECRET` is not required.

## Architecture and delivery guarantees

1. Booking services write `courtly_events` in the booking transaction. A rollback creates no notification.
2. Mail preparation locks supported unprocessed events with `FOR UPDATE SKIP LOCKED`, creates unique `(event_id, recipient_id)` rows in `courtly_mail_deliveries`, and marks those events processed in the same transaction. `processed_at` means expanded into durable deliveries, not delivered by SMTP. Other event types are left untouched.
3. A separate worker locks one due delivery, reloads current booking/recipient data, checks policy, renders text and escaped HTML, then calls the SMTP adapter. Booking requests never wait for SMTP.
4. A successful SMTP acceptance marks that recipient sent. Failure retries after 1, 2, 4 and 8 minutes. The fifth failure becomes `failed`; operators must investigate before manually requeuing. No infinite retries.
5. State and membership are evaluated immediately before sending, but can change while SMTP is in progress. The application always shows authoritative current state.

Normal concurrent workers do not send the same delivery simultaneously. SMTP cannot provide exactly-once delivery: if a process dies after SMTP accepts mail but before the database commit, a retry can duplicate it. A stable Message-ID helps correlation but does not guarantee provider deduplication. SMTP acceptance does not prove inbox delivery; bounce processing is a future integration.

The database row lock is held during bounded SMTP operations. Workers use the same PostgreSQL configuration as the API, so local/remote switching needs only environment changes. They require migrations and access to the configured database and SMTP host.

## Configuration

Edit your own root `.env`; `.env.example` contains placeholders. Nothing in this module modifies `.env`.

```dotenv
MAIL_MODE=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=your_email@gmail.com
MAIL_PASS=your_provider_smtp_password
MAIL_FROM="Courtly <your_email@gmail.com>"
APP_ORIGIN=http://localhost:5173
```

`MAIL_MODE` defaults to `disabled`, even if old credentials are present. All five SMTP fields above are required in SMTP mode (port defaults to 587). Gmail accounts typically require an app password or an organization-approved SMTP credential; ordinary account passwords may be rejected. Use a sender permitted by your provider. Existing PG fields or `DATABASE_URL` are also required for queue processing. JWT/Google keys remain API requirements, not worker requirements.

Port 465 uses implicit TLS; other ports require STARTTLS. Certificate verification is enabled. Production links require HTTPS. Attachments and externally loaded content are disabled. SMTP secrets and raw SMTP response bodies are not logged or stored in queue errors. Templates escape dynamic HTML.

For another device, `APP_ORIGIN` must resolve from that device. `localhost` points to the recipient's own device. Use the same reachable origin configured for the application/authentication.

## Run locally

From Git Bash:

```bash
cd "/c/Users/Neev/OneDrive/Desktop/NIT W TY/FSD/FSD ASSIGNMENTS/project"
npm install
npm run db:migrate
npm run mail:preview
npm run mail:verify
npm run dev
```

In a second terminal, from the same directory:

```bash
npm run mail:worker
```

The worker drains existing events every five seconds. This is delivery queue polling, not a booking scheduler: it creates no reminder or expiry events. Ctrl+C stops after the current batch. `npm run mail:send` processes one batch (up to 50 events and 50 deliveries) and exits. Run it again for a larger backlog. Enabling SMTP may deliver applicable older queued events, including cancellations; inspect the database before enabling against an existing populated installation.

`npm run mail:preview` prints a fictional invitation without accessing PostgreSQL or SMTP. `npm run mail:verify` checks SMTP connection/authentication without sending mail. `npm run mail:status` shows delivery counts by state without sending. The API does not automatically launch a worker.

For a manual end-to-end demonstration: sign in with two registered accounts, create a booking inviting the second, run the worker, open that invite email, sign in and accept in My bookings. Both participants should receive confirmation. Cancel within the permitted window and both should receive cancellation mail. Real delivery requires valid provider credentials and is not exercised by automated tests.

## Operations and future modules

Pending rows retain retry time, attempt count, and a sanitized error code; sent rows retain acceptance time. `skipped` means no longer applicable and is terminal. Failed rows require operator review. No automatic deletion/retention job is installed; administrators should establish retention before production because event and delivery metadata persist.

After fixing an SMTP issue, a database administrator may requeue a specific failed delivery by setting its status to `pending`, attempts to `0`, next_attempt_at to `NOW()`, and last_error to NULL. Never reset sent deliveries or event `processed_at` as a routine retry mechanism. Verify the booking is still relevant first; normal delivery policy will be rechecked.

Future cron code should call `recordEvent` in its own transaction with `booking.reminder` or `booking.expired` and the booking ID. That producer must persist a unique lifecycle marker to avoid generating duplicate reminder/expiry events across runs. The mail queue deduplicates recipients per event, not separately-created events. No public cron/mail webhook is necessary. If a later lifecycle migration persists a new `expired` booking status, update `mail.policy.js` alongside that migration.

Module map: `config/mail.js` validates settings; `mail.policy.js` owns eligibility/retries; `mail.templates.js` owns content; `mail.transport.js` owns SMTP; `mail.repository.js` expands events; `mail.service.js` delivers/retries; `mail.cli.js` supplies worker commands. Migration `003_mail.sql` adds the delivery table. Replace the transport adapter to adopt a remote provider without changing booking routes.

Verification: `npm test`, `npm run test:integration`, and `npm run test:mail`. Mail integration checks use a random isolated PostgreSQL schema and fake transport, then remove the schema. They never contact SMTP or send messages.

SMTP options follow [Nodemailer's transport documentation](https://nodemailer.com/smtp).

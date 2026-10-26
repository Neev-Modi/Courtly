# Court and booking management

## Run the real module

From the primary project root:

```powershell
npm.cmd run db:migrate
npm.cmd run dev
```

Use your existing authentication configuration and PostgreSQL. The module adds no secrets. For local Google sign-in, the existing `APP_ORIGIN=http://localhost:5173` and `API_ORIGIN=http://localhost:8080` need `GOOGLE_CALLBACK_URL=http://localhost:8080/auth/google/callback`, registered identically with Google. A callback on a Wi-Fi IP does not work for Google web OAuth. Your `.env` is never rewritten by migrations or demo commands.

## Demonstrate the working module without Google sign-in

```powershell
npm.cmd run demo
```

Open **http://127.0.0.1:4180/demo**. The demo creates its own random `courtly_demo_*` schema using your configured PostgreSQL connection, with sample Admin, Alice and Bob accounts and two courts. It binds only to loopback, uses fresh throwaway JWT secrets, and runs the same API, services, repositories and frontend build as the real app. The sample-user switch is only in the separate demo entry point, never in the real server. Your real users, roles and bookings are untouched. Stop with Ctrl+C for schema cleanup; a forcibly killed process may leave its isolated schema behind.

1. Select **Alice Player**. On **Find a court**, choose tomorrow, 2 players, and a 30-minute available start.
2. Enter **bob@nitw.ac.in**, then select **Reserve & invite**. The booking appears as pending.
3. Use **Switch demo user** to select **Bob Player**. Open **My bookings & invites** and accept. The reservation becomes confirmed when everyone accepts.
4. Switch back to Alice. Open the booking, choose **Cancel booking**, enter a reason and confirm. The time becomes bookable again.
5. Switch to **Campus Admin**. Add/edit courts, archive an unused court, add/remove maintenance, and inspect **All bookings**. A court with future active bookings cannot be archived, and maintenance cannot overlap a booking.

Declining an invitation cancels the entire group reservation. Wait past the confirmation deadline (or run the integration checks) to demonstrate automatic _effective_ expiration without any scheduled process.

## Business rules

- All dates and times use Asia/Kolkata, independent of the browser/server timezone.
- Book today, tomorrow or the day after tomorrow, at least one hour ahead.
- Weekday morning: 06:00–09:00. Weekend morning: 06:00–11:00. Evening: 16:00–22:00.
- Starts are on a 15-minute grid. Two players: 15 or 30 minutes; three: 45 minutes; four to six: 60 minutes. Count includes the organizer.
- All invitees must already have a Courtly account, use the configured campus email suffix, and be distinct and not banned. Organizer is automatically confirmed.
- Pending holds count toward court/player conflicts and the default three-day gap between a player's booking start times. Completed confirmed games also count toward that gap. Cancelled and expired holds do not.
- All invitees must accept within 60 minutes. The deadline never extends beyond the start time.
- The organizer can cancel at least one hour before start. An administrator can cancel any active booking before it ends, with a reason. Invitees accept/decline only their own invitation.
- Archive instead of deleting courts so history is preserved. Restore by editing status back to Active.
- Date-filtered booking history is paginated, 50 rows per page. Members see only their own group bookings; administrators can see all.

## Integrity and authorization

Court writes and reservations lock the court row inside a transaction. Sorted player advisory locks serialize cross-court reservations involving the same people. These locks cover conflict detection, inserts and the event write. All booking and maintenance writes must use the services; direct database writes bypass these application policies.

Invitation responses and cancellations lock the booking row, preventing a last-confirmation/cancellation race. Mutation endpoints require the configured application Origin, authentication, and permissions. Ownership is enforced inside services; a client cannot cancel or confirm someone else's reservation.

`courtly_*` tables reference `auth_users`; legacy prototype tables are not altered. Versioned migrations run under a transaction/advisory lock and track applied filenames. The initial auth migration can be adopted safely if it was run before the tracking table existed.

## API

| Method | Endpoint                                                           | Access                                                 |
| ------ | ------------------------------------------------------------------ | ------------------------------------------------------ |
| GET    | `/api/courts`                                                      | Signed-in users; admins also see archived courts       |
| POST   | `/api/courts`                                                      | Admin: name, location, description                     |
| PUT    | `/api/courts/:id`                                                  | Admin: name, location, description, is_active          |
| GET    | `/api/courts/:id/blocks`                                           | Signed-in users                                        |
| POST   | `/api/courts/:id/blocks`                                           | Admin: start_time, end_time, reason                    |
| DELETE | `/api/courts/:id/blocks/:blockId`                                  | Admin                                                  |
| GET    | `/api/bookings/availability?date=YYYY-MM-DD&players=2&duration=30` | Signed-in users                                        |
| POST   | `/api/bookings`                                                    | court_id, start_time, end_time, emails (invitees only) |
| GET    | `/api/bookings/mine?date=YYYY-MM-DD&page=1`                        | Own bookings/invitations; date optional                |
| GET    | `/api/bookings?date=YYYY-MM-DD&page=1`                             | Admin; date optional                                   |
| POST   | `/api/bookings/:id/respond`                                        | Invited user: status confirmed or declined             |
| POST   | `/api/bookings/:id/cancel`                                         | Organizer/admin: reason                                |

Use ISO timestamps with an explicit timezone; the UI converts IST input. Availability returns free court time, not a guarantee that all supplied participants meet cooldown rules; those checks run atomically when reserving.

## Mail and future cron integration

Mail delivery is implemented in a separate worker. See [Mail Policy.md](../Mail%20Policy.md) for configuration and commands. Booking events are expanded transactionally into per-recipient delivery records; event processed_at means expansion completed, while delivery status tracks SMTP acceptance and retries. No cron jobs or public scheduler endpoints are implemented. The authentication session cleanup is unchanged.

Pending expiration and completed status are derived by `effectiveStatus` in `booking.policy.js`; availability/conflict queries use the same deadline semantics. Therefore correctness does not depend on a cron worker. Raw pending records can remain pending in storage after expiry. A future lifecycle worker can query expired deadlines, deduplicate expiry/reminder events and record them through `recordEvent`, without changing reservation endpoints. If persisted expired/completed statuses are desired, add them in a separate schema migration and update the common policy/query predicates together. Workers should call service/repository functions, not anonymous HTTP endpoints. Only expose a future job endpoint if deployment requires one, with separate worker authentication.

## Verification

```powershell
npm.cmd test
npm.cmd run test:integration
npm.cmd run build
```

Integration checks require the configured PostgreSQL database and permission to create a temporary schema. They create/drop a random `courtly_test_*` schema; they do not seed real app data or change real roles. They exercise JWT-protected HTTP routes, SQL transactions, invitations, expiration, maintenance, ownership, and simultaneous reservation attempts. Unit tests check the time policy and existing authentication/authorization behavior.

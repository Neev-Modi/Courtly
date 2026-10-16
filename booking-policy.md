# BOOKING POLICY 
---

### 1. High-Level Booking Lifecycle

```
[Organizer selects Court & Slot]
               │
               ▼
   [Validation & Policy Engine]
   (Time window, notice, campus email,
    existence, bans, conflict, cooldown)
               │
               ▼
    [Create Pending Reservation]
    • Organizer: Confirmed
    • Invitees: Pending
    • Slot: Held exclusively
    • Timer: 60-min confirmation deadline
               │
       ┌───────┴────────────────────────┐
       ▼                                ▼
[All Invitees Accept]         [Any Invitee Declines OR Deadline Passes]
       │                                │
       ▼                                ▼
  [CONFIRMED]                [CANCELLED / EXPIRED]
• Slot locked for match      • Entire reservation released immediately
• Subject to 1-hr cancel     • Court & all players become available again
```

---

### 2. Time, Slot & Window Rules

| Rule | Specification | What happens if violated? |
| :--- | :--- | :--- |
| **Timezone** | All dates and times are strictly anchored to **Asia/Kolkata (IST)** (`+05:30`), regardless of server or client timezone. | Eliminates daylight saving / client clock skew. |
| **Booking Window** | You can book for **Today, Tomorrow, or Day after Tomorrow** (3-day rolling window). | Request rejected: *"Book for today, tomorrow or the day after tomorrow."* |
| **Advance Notice** | Bookings must be created at least **60 minutes (1 hour)** in advance of the start time. | Request rejected: *"Book at least one hour before the start."* |
| **Operating Hours** | **Weekdays**: 06:00–09:00 & 16:00–22:00.<br>**Weekends (Sat/Sun)**: 06:00–11:00 (extended morning) & 16:00–22:00. | Request rejected: *"The selected time is outside court opening hours."* |
| **Grid Increments** | Start times must fall on strict **15-minute grid boundaries** (`:00`, `:15`, `:30`, `:45`). | Request rejected: *"Choose an available slot with the correct duration."* |
| **Group Size & Duration** | • **2 players** (Organizer + 1 invitee): **15 min or 30 min**<br>• **3 players** (Organizer + 2 invitees): **45 min**<br>• **4 to 6 players** (Organizer + 3–5 invitees): **60 min** | Request rejected: *"Choose 2–6 players and a matching duration."* |

---

### 3. Participant Rules & Edge Cases

#### Edge Case A: What if an invited email is NOT registered / has never logged in?
* **Behavior**: Courtly uses Google OAuth SSO for authentication and requires every user account to exist in the database (`auth_users`) prior to being added to a reservation.
* **System Action**: When reserving, the system queries the database for all participant emails:
  ```javascript
  const players = await repo.users([...emails, actor.email.toLowerCase()]);
  if (players.length !== emails.length + 1)
    fail('Every invited player must sign in to Courtly once before you can invite them.');
  ```
* **Result**: **Hard rejection (400)**. An organizer cannot invite an email that has never signed into Courtly at least once.

#### Edge Case B: What if a non-college email is entered (e.g. `@gmail.com`)?
* **Behavior**: All participant emails must end with the configured campus domain (e.g., `nitw.ac.in`).
* **System Action**:
  ```javascript
  if (!email.split('@')[1].endsWith(config.domain))
    fail('Use unique campus emails and do not include your own email.');
  ```
* **Result**: **Hard rejection (400)**. Outside domain emails are blocked.

#### Edge Case C: What if the organizer enters their own email in the invitees list?
* **Behavior**: The organizer is automatically included as player #1 and marked `confirmed`.
* **System Action**: `emails.includes(actor.email.toLowerCase())` triggers an immediate error.
* **Result**: **Rejected**. The organizer cannot invite themselves.

#### Edge Case D: What if duplicate emails are entered in the invite list?
* **Behavior**: All invitees must be distinct individual users.
* **System Action**: `new Set(emails).size !== emails.length` is enforced.
* **Result**: **Rejected**: *"Use unique campus emails and do not include your own email."*

#### Edge Case E: What if any player (organizer or invitee) is banned?
* **Behavior**: Admins can ban accounts.
* **System Action**: If `players.some(p => p.is_banned)` is true.
* **Result**: **Forbidden (403)**: *"One of the players cannot currently book."*

---

### 4. Concurrency, Cross-Court Clashes & Advisory Locking

#### Edge Case F: What if two organizers click "Reserve" for the exact same court slot at the exact same millisecond?
* **System Action**: 
  1. The transaction acquires a PostgreSQL row-level lock on the court (`SELECT ... FOR UPDATE`).
  2. The first transaction commits its booking.
  3. The second transaction unblocks, re-evaluates `courtRepo.conflicts()`, detects the slot is now occupied, and rolls back.
* **Result**: **Conflict (409)**: *"That slot was just taken or blocked. Please choose another."* Exactly one booking succeeds; zero double-bookings.

#### Edge Case G: What if an invited player is simultaneously invited on TWO DIFFERENT COURTS for the same time?
* **Behavior**: A player cannot be on Court 1 and Court 2 at the same time.
* **System Action**:
  1. The server sorts all player UUIDs and acquires PostgreSQL transaction advisory locks: `pg_advisory_xact_lock(hashtext(userId))`.
  2. Because locks are acquired in sorted order, **no deadlocks can occur**.
  3. It executes a cross-court clash check:
     ```sql
     SELECT u.email FROM courtly_bookings b 
     JOIN courtly_booking_players p ON p.booking_id=b.id 
     JOIN auth_users u ON u.id=p.user_id
     WHERE p.user_id = ANY($1) 
       AND b.status IN ('pending', 'confirmed')
       AND b.start_time < $3 AND b.end_time > $2
     ```
* **Result**: **Conflict (409)**: `"<player>@nitw.ac.in already has a booking at that time."`

---

### 5. Player Cooldown Policy (Anti-Monopoly Rule)

#### Edge Case H: How often can a player play?
* **Rule**: To prevent a few students from monopolizing courts, every participant has a **3-day cooldown** between booking start times.
* **Calculation**:
  * For any player in the group, the system searches existing bookings where the player was involved:
  * An existing booking within `abs(requested_start - existing_start) < 3 days` blocks the new reservation.
  * **Which statuses count?** Confirmed matches and active pending holds count.
  * **Which statuses DO NOT count?** Cancelled bookings and expired holds do **not** penalize the player.
* **Result if violated**: **Conflict (409)**: `"<player>@nitw.ac.in needs 3 days between bookings."`

---

### 6. Invitation & Confirmation Deadline Flow

#### Edge Case I: How long do teammates have to accept?
* **Deadline**: **60 minutes** from the moment of reservation.
* **Capping Rule**: The deadline can **never exceed the match start time**.
  ```javascript
  deadline = Math.min(now + 60 minutes, match_start_time);
  ```
  *(e.g., if booked at 07:00 for an 07:30 slot, invitees have 30 minutes, not 60 minutes).*

#### Edge Case J: What if all invitees accept?
* When the last invitee accepts their invitation under **My Bookings & Invites**, the booking status atomically transitions from `pending` to `confirmed`.
* An event `booking.confirmed` is logged to the transactional outbox (`courtly_events`).

#### Edge Case K: What if one teammate declines the invitation?
* **Behavior**: Badminton requires the full group (singles/doubles) to play.
* **System Action**: If any invited player clicks **Decline**:
  1. The entire booking is immediately marked `cancelled` with the reason `"An invited player declined."`
  2. The court slot is instantly freed on the dashboard for other students.
  3. Cooldown restrictions for all other players on this reservation are lifted.

#### Edge Case L: What if the deadline passes without everyone accepting?
* **Zero-Cron Automatic Expiration**:
  * No background daemon or cron job is needed to expire it.
  * Queries and policy evaluate `effectiveStatus()`:
    ```javascript
    if (booking.status === 'pending' && booking.confirmation_deadline <= now)
      return 'expired';
    ```
  * Availability queries treat expired holds as non-existent: the slot automatically shows as available to everyone else the moment the deadline passes.
  * If a teammate attempts to click "Accept" after the deadline, the API returns **409 BOOKING_CLOSED**: *"This invitation is no longer pending."*

---

### 7. Cancellation Rules & Permissions

| Scenario | Organizer | Teammate (Invitee) | Administrator |
| :--- | :--- | :--- | :--- |
| **Can Cancel?** | Yes | No (can only Accept/Decline their own invite) | Yes (can cancel any booking on campus) |
| **Cutoff Window** | Must be at least **1 hour before match start time** | N/A | Anytime before match ends |
| **Reason Required?** | Yes (mandatory text, max 240 chars) | N/A | Yes (mandatory text, max 240 chars) |
| **After Match Starts?** | Blocked | N/A | Allowed until match end time |

---

### 8. Admin & Maintenance Edge Cases

#### Edge Case M: What if an Admin tries to put a court under maintenance when a booking already exists?
* **Behavior**: The system checks for any active booking (`pending` or `confirmed`) that overlaps the proposed maintenance window.
* **Result**: **Conflict (409)**: Maintenance cannot be scheduled over existing bookings. The admin must first cancel the conflicting booking (with an official reason) before blocking the court.

#### Edge Case N: What if an Admin tries to archive a court with upcoming bookings?
* **Behavior**: The system checks if there are active bookings in the future for that court.
* **Result**: **Conflict (409)**: An admin cannot archive a court with active future bookings. History is preserved; courts can be restored anytime by editing status back to Active.

---

### Summary Matrix

| Event / Edge Case | Condition | Outcome | HTTP Status / Response |
| :--- | :--- | :--- | :--- |
| **Unregistered Invitee** | Email not in `auth_users` | Hard block | `400` *"Every invited player must sign in to Courtly once before you can invite them."* |
| **External Email** | Domain != `@nitw.ac.in` | Hard block | `400` *"Use unique campus emails and do not include your own email."* |
| **Self-Invite** | Invitee == Organizer | Hard block | `400` *"Use unique campus emails and do not include your own email."* |
| **Player Active Clash** | Player has booking elsewhere | Hard block | `409` *"`<email>` already has a booking at that time."* |
| **3-Day Cooldown** | Player booked < 3 days ago | Hard block | `409` *"`<email>` needs 3 days between bookings."* |
| **Concurrent Same Slot** | Two users click together | First wins, second gets conflict | `409` *"That slot was just taken or blocked. Please choose another."* |
| **Teammate Declines** | Any invitee clicks decline | Booking auto-cancelled, slot freed | `200` Booking cancelled |
| **Deadline Expiry** | 60 min elapsed without accept | Hold auto-expires mathematically | Slot immediately free for others; accept button disabled |
| **Late Cancellation** | Organizer cancels < 1 hr before start | Blocked | `400` *"Players can cancel only at least one hour before the start."* |
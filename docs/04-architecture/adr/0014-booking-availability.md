# ADR-0014 — Session booking: mentor availability, session type and request with mentor approval

- **Status:** Accepted (implementation: Coach Office sprint 7)
- **Date:** 7 Aban 1405 (2026-10-29)
- **Source of requirements:** founder's request (7 Aban 1405); `docs/08-saas-evolution/booking-design.md` and the founder decisions table in the same document
- **Effect on earlier ADRs:** ADR-0012 put "automatic booking by mentor availability" outside the MVP; this ADR brings it into scope. A session remains the `mentoring_sessions` row from ADR-0012, and booking is only a new way to create it.

## Context
- Until now only a mentor or an admin created sessions, by hand (`POST /sessions`). Overlap was only a warning (`overlaps` in the response).
- A one-on-one package (`one_on_one`) has a quota and a validity period, and its usage is counted from `held` and `no_show` sessions (`packageUsage`).
- There is no payment in the system (decision of 27 Mehr 1405 (2026-10-19)); so the "right to book" comes only from a registered package.

## Decision
### 1. One calendar per mentor, with a type label on each range
- `availability_rules`: day of week, start and end in minutes from midnight (in the organization's time zone wall-clock time; `24:00` = end of day) and `template_ids` (empty = all types).
- `availability_exceptions`: one specific day, `off` (the whole day or one range) or `extra` (an additional range).
- `mentor_offerings`: key `(mentor_id, template_id)`; enabled flag, buffer between sessions (default 15 minutes), minimum notice before a session (12 hours), horizon (21 days), mentee cancellation deadline (24 hours) and location or link. The session length comes from the template itself (`session_minutes`, default 60).
- **Offerable type:** a published one-on-one template that either belongs to the organization or belongs to the mentor.
- **Why one calendar:** every session, of any type, fills that hour for all types. A separate calendar per type would either sell one hour twice or force the mentor to enter the same hours repeatedly.

### 2. Free slots are computed, not stored
`modules/scheduling/slots.ts` (a pure function, with unit tests):

```
windows = the rules of that weekday that accept this type + extra exceptions − off exceptions
            (a whole-day off empties everything)
slot    = every 30 minutes from the start of each window, as long as the whole session fits
free    = not sooner than the minimum notice, not later than the horizon, and with the buffer between sessions
            from every busy range (a scheduled or held session of any type + a live pending request)
```
Each slot's time is converted to UTC using the offset of that moment in the organization's time zone (`lib/org-day`), so daylight-saving change days are correct.

### 3. Every booking is first a request (founder decision: mentor approval required)
- A separate `booking_requests` table (not a new status on `mentoring_sessions`, as the initial draft said): `pending` → `approved` | `declined` | `cancelled`. An `expired` status is not stored; a `pending` request whose `hold_until` has passed is reported as "expired" in the DTO.
- A request holds the slot until `hold_until = min(now + 48 hours, session start)`. After that the slot is free again automatically; no background job is needed.
- Each mentee has at most 3 live requests.
- **Approval** (the mentor of that request, or an admin): the package is looked up again, capacity and overlap are re-checked, and a regular session is created with the mentoring module's `insertBookedSession`. `session_id` stays on the request.
- **Decline:** with an optional reason that the mentee sees; the slot becomes free.

### 4. Right to book comes from the package
- **Package** = the mentee's most recent active membership in an open run (`draft` or `active`) of a one-on-one template for that same template, where the mentor is on the run's staff or is the mentor of that membership, with a validity period that has not ended.
- **Bookable** = package remaining − `scheduled` sessions − live requests tied to the same package (`null` = unlimited).
- A mentee without a package can also submit a request (admins are notified too). The mentor can approve only if an admin has enrolled the mentee (payment happens outside the system). Otherwise the response is 409 with a clear message.

### 5. Cancellation
- A mentee can always cancel a pending request, and can cancel an approved session up to `cancel_notice_hours` before it starts. On cancellation the session becomes `cancelled` (`cancelBookedSession`) and the mentor is notified.
- After that deadline only the mentor can cancel, from the same "edit session" of ADR-0012, and the mentor decides whether it is deducted from the package (`countsTowardQuota`).

### 6. Concurrency
Creating and approving a request run in a transaction with `pg_advisory_xact_lock(hashtext('scheduling.mentor:'||mentor_id))`, and the slot is re-checked with `isFreeSlot` inside that same lock. Two mentees cannot take the same hour (the second gets 409 and the page refreshes the calendar).

### 7. Access
| Route | Role |
|---|---|
| `GET`, `PUT /mentors/:id/availability` and `PUT /mentors/:id/offerings/:templateId` | Admin for any staff member; mentor only for themselves (anyone else gets 404) |
| `GET /mentors/:id/slots?templateId=` | Mentee only for a mentor who has "accepts mentees"; mentor only their own calendar; admin all |
| `GET /booking/mentors` | Mentee only |
| `GET /booking-requests` | Mentee their own, mentor their own, admin all (`status=open` is the staff default) |
| `POST /booking-requests`, `POST /booking-requests/:id/cancel` | Mentee only (cancel only their own) |
| `POST /booking-requests/:id/approve` and `decline` | The mentor of that request, or an admin |

All of them are registered in the access matrix (`routes.manifest.ts`).

### 8. Notifications and account deletion
- Three new notification types on notification system 6b: `booking_requested` (the mentor, and admins when there is no package), `booking_decided` (the mentee; `outcome` = approved or declined), `booking_cancelled` (the mentor).
- Account deletion (ADR-0010): the hours, exceptions, offerings and requests of that person (as mentee or mentor) are deleted. Sessions already created remain, per ADR-0012.

## Consequences
- Migration `0013_scheduling`: four new tables and a rebuild of the notification-type CHECK. It does not touch existing data.
- The mentoring module has two new internal functions (`insertBookedSession`, `cancelBookedSession`); scheduling does not write the session table directly (module rule).
- Manual session entry is as before, and overlap there remains only a warning (a mentor may deliberately put a group session on their free hour). That session's hour is subtracted from the booking calendar.

## Out of scope for this decision
Google Calendar sync (OAuth and sanctions), `.ics` file, automatic creation of session links, SMS or email reminders, waiting list, rescheduling of a request by the mentee (for now: cancel and submit a new request), a separate time zone per mentor.

## Amendment — sprint 7b (2026-10-29): dates replace the weekly hours
**Request (founder, 2026-10-29):** a calendar that opens like Google Calendar, where the mentor says which dates they can meet; mentors set days and hours month by month, not the same every week.

**Decision**
- `availability_exceptions` becomes the **hours of one date**. `kind` is `off` (closed that date, no range) or `hours` (one bookable window, with its own `template_ids`; empty = every offering). `extra` and partial `off` are gone.
- A date with rows of its own **replaces** the weekly hours of that date; any other date uses `availability_rules`. Weekly rules are now optional: a mentor can plan only by dates.

```
windows(date) = date has rows ? (an off row ? none : its hours rows open to the offering)
                               : the weekly rules of that weekday open to the offering
```
- API: `PUT /mentors/:id/availability` takes `{ rules, dates: [{ day, windows: [{ start, end, templateIds? }] }] }` (empty `windows` = closed; each date at most once, otherwise 422). `GET` returns `dates` in the same shape, today and later. Template ids in date windows must be the mentor's offerings, like rules.
- Offering horizon: default 60 days (was 21), allowed 1–180, so a mentor can open next month and the one after.
- UI: a Saturday-first Jalali month grid (Gregorian in English) for the mentor (multi-select days, select a weekday of the month, set/close/back to weekly) and for the mentee's slot picker.

**Consequences**
- Migration `0014_date_hours`: adds `template_ids`, converts `extra` rows to `hours`, deletes partial `off` rows, rebuilds the CHECKs, new horizon default and range.
- `subtractRanges` was removed from `slots.ts` (no longer needed).
- Everything else in this ADR (offerings, requests, approval, packages, cancellation, locking, access) is unchanged.

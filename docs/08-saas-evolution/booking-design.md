# Session booking with the mentor's calendar (Sprint 7 proposal)

- **Date:** 7 Aban 1405 (2026-10-29)
- **Founder's request:** for each type of their program, a mentor sets free times; a mentee chooses a mentor, sees the mentor's types of mentoring and books a session from the calendar.
- **Status:** decisions made (7 Aban 1405, last section); to be built in Sprint 7.

## This is a scope change
The PRD (section 3-2) and ADR-0012 had explicitly put "automatic booking from the mentor's free hours" outside the MVP. Today only a mentor or admin records a session manually and **there is no overlap check at all**: one mentor can have two simultaneous sessions. Booking must fix this. With this design, booking becomes part of the pilot features and gets a new ADR (ADR-0014).

## The common pattern (Calendly, Cal.com, mentoring platforms)
All revolve around four concepts:
1. **Weekly hours:** for each day of the week, several ranges ("Saturday 17 to 21").
2. **Exceptions:** a specific day off, or an extra range on a specific day.
3. **Session type:** duration, buffer between sessions, minimum notice before booking ("at least 12 hours ahead"), booking horizon ("up to 3 weeks ahead"), and the meeting link.
4. **Free hours = weekly hours − exceptions − existing sessions (of any type) − buffers.** Free hours are not stored; each time they are computed from the rules.

Key point: **the mentor's calendar is one.** Any session, of any type, also fills that time for the other types. So "free times for each type of program" is better built this way: one weekly schedule, and on each range it is specified which types can be booked in it (default: all). If each type had its own calendar, two mentees of two different types could take the same hour, or the mentor would have to enter the same hour several times.

## Proposal
### Mentor ("My calendar" page)
- **Weekly hours:** a table from Saturday to Friday, several ranges per day, and for each range the allowed types.
- **Exceptions:** "I am not available this day" (leave, travel) or "I am also available this day at this hour".
- **My mentoring types:** from the one-on-one templates the mentor is on the staff of. For each: active or inactive, buffer after the session (default 15 minutes), minimum notice before booking (default 12 hours), horizon (default 21 days), and the default link or location (Google Meet, Skyroom or any other link). The session duration comes from the template itself.
- **Preview:** the same calendar the mentee sees.
- The admin can set the same for any mentor.

### Mentee
1. **"Mentors":** the list of the organization's mentors with photo, expertise and introduction (the same profile from Sprint 4). Only mentors who are "accepting mentees" and have at least one active mentoring type are shown.
2. **Mentor page:** their mentoring types with duration and the package's session count.
3. **Calendar:** the days of the current and next week (Jalali date, Tehran time) with free hours as buttons.
4. **Booking:** the mentee taps the hour and confirms. The session appears in "My programs", "Home" and the mentor's "Today", and the mentor gets a notification.
5. **Cancel or reschedule:** up to a deadline the organization sets (default 24 hours before the session). Later than that, only with the mentor.

### Who books directly (the most important decision)
Since payment is not in the system, booking must be tied to the "package". Proposal:
- **A mentee who has an active package of the same type with the same mentor** (remaining sessions and unexpired validity) books directly. The booking is today's "session" and package consumption is counted the same way.
- **A mentee without a package** sees the calendar, but their button is "Request": it holds the hour temporarily (default 24 hours) and notifies the admin and the mentor. After receiving the money (outside the system), the admin enrolls the mentee in the package and approves the request; if not, the hour is released.
- A group session is not bookable; as today the mentor records it and its hour is deducted from the mentor's calendar.

### Technical details (summary, for ADR-0014)
- **Tables:**
  - `availability_rules`: mentor, day of week, start and end in minutes, allowed types.
  - `availability_exceptions`: mentor, date, day off or extra, range.
  - `mentor_offerings`: mentor, template, active, buffer, minimum notice, horizon, default location.
  - On `mentoring_sessions`: `source` (manual or booking), `booked_by` and a new status `requested` with `hold_until`.
- **Rules are stored as wall-clock time in the organization's time zone** (17:00 means 17:00 Tehran) and free hours are computed on the fly.
- **Preventing simultaneous booking:** each booking, in a transaction with a lock on the mentor, checks overlap with all of the mentor's live sessions before insert. The same check is added for manual sessions; there it is a warning and the mentor can skip it deliberately.
- **Notifications:** two new kinds, "session booked" and "session cancelled", on the same Sprint 6b system.
- **Outside this stage:** Google Calendar sync (OAuth and sanctions), automatic link creation, SMS reminders, an `.ics` file (can be added small later), a waiting list.

### Size
About one sprint (8 to 10 working days): the migration and the `scheduling` module, free-hours computation with full tests (holidays, buffers, horizon boundary, existing sessions), the mentor calendar, the mentors and booking pages for the mentee, request and approval, cancellation, and e2e.

## Founder's decisions (7 Aban 1405)
| Question | Decision |
|---|---|
| Who books | Only a mentee with an active package of the same type and the same mentor directly submits a confirmable request; the rest "request" and the admin enrolls them after payment outside the system |
| Choosing a mentor | All the organization's mentors who are "accepting mentees" and have an active mentoring type; the admin can hide them |
| Approval | **Every booking needs mentor approval** (contrary to the initial proposal). Until approval, the hour is held temporarily for the mentee |
| Cancellation | The mentee cancels up to 24 hours before the session; later, only the mentor, who decides whether to deduct from the package |

### Consequence of the "mentor approval" decision
- Every booking is first a **request** (a separate `booking_requests` table), not a session. On approval, a regular session is created.
- A request holds the hour until the mentor answers, at most 48 hours and never past the start of the session itself. After that it expires automatically and the hour is free.
- A mentor can approve the request of a mentee without a package only if the admin has enrolled them in a package of the same type.

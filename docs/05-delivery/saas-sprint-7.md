# Coach Office sprint 7 — mentor calendar and session booking

- **Date:** 7 Aban 1405 (2026-10-29)
- **Basis:** the founder's request (7 Aban 1405), `docs/08-saas-evolution/booking-design.md`, ADR-0014
- **Status:** code and tests complete. **One new migration (`0013_scheduling`). Not on production and not committed.**

## The request
A mentor sets free times for each kind of program they offer; a mentee picks a mentor, sees their kinds of mentoring and books a session from the mentor's calendar.

## The founder's decisions
| Question | Decision |
|---|---|
| Who books | A mentee with an active package of the same kind with the same mentor. Others can submit a request too, but approval comes only after enrollment by the admin (payment is outside the system) |
| Choosing a mentor | All mentors of the organization who are "accepting mentees" and have at least one active session type |
| Approval | Every booking needs the mentor's approval |
| Cancellation | The mentee up to 24 hours before the session; later only the mentor, who decides whether it is deducted from the package |

## What was built
| Area | Summary |
|---|---|
| The mentor's "Calendar" (`/calendar`) | A new staff menu item with a counter of pending requests. Four sections: **Pending requests** (approve, or decline with a reason), **Session types** (for each one-on-one template: "Taking bookings", gap between sessions, minimum notice, horizon, cancellation deadline, place or link), **Weekly hours** (Saturday to Friday, several windows a day in half-hour steps, and limiting each window to some types) and **Exception days** (a full-day or partial-day leave, extra hours). At the bottom, a **preview** of the same calendar the mentee sees |
| Admin | The same page for any mentor with `?mentor=` and a mentor picker at the top; a "Calendar" button on each mentor's page |
| The mentee's "Book a session" (`/my/mentors`) | Each mentor's card with specialty, bio, session types and the mentee's own package status. At the bottom "My session requests" with status and a cancel button. The entry is the "Book a session with a mentor" button in "My programs" (the mentee menu was left alone) |
| The mentor's page for the mentee (`/my/mentors/:id`) | Choosing a session type, package status ("N sessions of your package can be booked" or a no-package warning), a day strip (Jalali, with the number of free times each day) and time buttons, a note for the mentor and "Send request". If the time was taken in the meantime a clear message appears and the calendar refreshes |
| Notification | "Session request from …" (the mentor, and admins when there is no package), "Your session is confirmed" or "Your request for … was declined" (the mentee), "… cancelled the session" (the mentor). The staff link goes to `/calendar` and the mentee's to "My programs" |
| After approval | An ordinary session is created and appears everywhere: "My programs", the mentee's "Home", the mentor's "Today", package use |

## API
`GET`/`PUT /mentors/:id/availability`, `PUT /mentors/:id/offerings/:templateId`, `GET /mentors/:id/slots?templateId=`, `GET /booking/mentors`, `GET`/`POST /booking-requests`, `POST /booking-requests/:id/approve|decline|cancel`. Access rules are in ADR-0014 section 7 and in the access matrix.

## Technical decisions
- **One calendar per mentor**; the session type is a label on a window, not a separate calendar. A session of any type fills that time for the others.
- **Free times are not stored**; the pure function `freeSlots` has 11 unit tests (closed day, exception, gap, minimum notice, horizon, time zone).
- **A request is separate from a session** (`booking_requests`); it holds the time for at most 48 hours (and not past the start), after which it frees itself. Each mentee has at most 3 live requests.
- **A lock on the mentor** when creating and approving a request, and the slot is re-checked inside the lock.
- **Bookable** = remaining package − upcoming sessions − live requests.
- The scheduling module does not write the session table directly; it uses two internal functions of the mentoring module.

## Tests
- **Unit:** `src/modules/scheduling/slots.test.ts` (11 tests).
- **Integration:** `tests/integration/booking.test.ts` (19 tests): calendar management only by the mentor themselves or an admin; unknown template and reversed range give 422; slots only when the type is active; minimum notice and horizon; a day off; only listed slots; holding a time and 409 for the second person; notification of the mentor and admins; order and visibility of requests; approval -> session in the package and mentee notification; no package gives 409 until the admin enrolls; decline and the time being freed; the cap of 3 requests; cancelling a request and a session with the deadline (the message has the deadline number); hiding a mentor who closed bookings.
- **Access matrix:** 10 new routes, every role.
- **e2e:** `tests/e2e/booking-flow.spec.ts` at both sizes: the mentor turns on a session type in "Calendar" and sees the preview; the mentee goes from "My programs" to "Book a session", picks the mentor, taps a time and requests with a note; the mentor approves in "Calendar"; the mentee sees the "Your session is confirmed" notification. Step 13 of the acceptance scenario now also checks `/calendar` and `/my/mentors` in English. Both are green at both sizes.
- **Whole unit and integration suite:** 91 files, 2082 tests, all green. typecheck, Biome and the i18n guard are green.
- **Two fixes the tests found:** (1) saving a session type with an empty place (`location: null`) gave 422; now null means clear. (2) The "Taking bookings" checkbox did not change until the server answered; now it changes immediately and reverts if saving fails.
- **Isolated e2e (`E2E_ISOLATED=1`):** the `.next` cache of the app copy from the previous run is now deleted; Tailwind read corrupt binary files of that cache and did not generate CSS.

## Before production
- Migrations 0006 to 0013 are not on production yet. The order and cautions are in `apps/web/drizzle/README.md`.
- After deploy, each mentor must open "Calendar" once, turn on a session type and set their hours; until then they do not appear in "Book a session".

## Outside this sprint
Google Calendar sync, an `.ics` file, automatic link creation, SMS or email reminders, a waiting list, rescheduling by the mentee (for now cancel and a new request), a separate time zone for each mentor.

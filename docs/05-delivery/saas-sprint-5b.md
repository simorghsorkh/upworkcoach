# Coach Office sprint 5b — package, mentoring session and goal

- **Date:** 8 Aban 1405 (2026-10-30)
- **Basis:** `docs/08-saas-evolution/architecture-review.md` (sprint 5b), ADR-0012 items 4, 6 and 7, `prd-coach-office.md` section 6 (step 7)
- **Status:** code and tests complete. Tried in the browser locally with an admin account. **Not run on production and not committed.**

## What was built
| Area | Summary |
|---|---|
| Package | The "one-on-one" template has a session quota, session length and validity days (from sprint 3). The enrollment copies the quota and the validity end date. Usage is now visible too: "1 of 8 sessions · 60 days until expiry". When the quota or validity has run out, an "Over quota" or "Validity ended" label is shown |
| Mentoring session | Table `mentoring_sessions`. A session is either for one member, or for a whole group run (a group session). Day and time are taken in the organization's time zone and stored in UTC. Duration is between 5 and 600 minutes. The place can be text or an https link |
| Session status | Scheduled -> held, no-show or cancelled (with a reason); it can also be set back to scheduled. Rescheduling is possible; if only the day or only the time changes, the other stays as it was |
| Counting against the package | Held sessions and no-shows are deducted from the package. Each session can be marked "Do not count it" (`counts_toward_quota`). A cancelled session is never counted |
| Overlap | If a session overlaps another scheduled session of the same mentor, **only a warning** is shown. The session is saved |
| Next action | After a held session, "Next action" creates a follow-up task for the mentee (`tasks.session_id`). This task shows in the mentee's "My tasks" and under the session itself. In a group session the mentee must be chosen. Each mentee sees only their own actions. The tasks module creates the task (`insertSessionAction`), not mentoring |
| Goal | Table `goals` for an enrollment. Staff create a goal and mark it "Achieved" or "Dropped"; it can be reopened. The mentee only reads |
| One-on-one progress | For a one-on-one run, progress = achieved goals ÷ goals not dropped (item 6). With no goals it is "unknown" |
| "Today" | An "Upcoming sessions" card for the next 7 days. Sessions in the next 24 hours carry a "Within 24 hours" label; this is the in-app reminder of item 7 and has no separate job. The admin's mentor filter applies to this card too |
| Run page | A "Sessions" card (upcoming and past; book, held, no-show, reschedule, cancel, next action). A "Goals" card for each member of a one-on-one run. Package use in each member's row |
| "My programs" (mentee) | Upcoming sessions, package use and goals of each one-on-one program |
| Student record | Package use in the "Programs and mentors" card |
| Student data erasure | `eraseMentoringOfStudent` deletes goals and empties the place and cancellation reason of sessions |
| API | `GET/POST /sessions`, `PATCH /sessions/:id`, `POST /sessions/:id/actions`, `GET/POST /enrollments/:id/goals`, `PATCH /goals/:id`. The enrollment, run and "My programs" DTOs have a `usage` field |

## Access
- **Admin:** all sessions and goals of the organization.
- **Mentor:** sessions where they are the mentor, sessions of runs on their staff, and sessions of mentees in their scope. Without a filter they see only their own sessions. Only an admin or the run manager books a group session.
- **Mentee:** their own sessions and the group sessions of runs they belong to. They only read their own goals.
- An unrelated mentor and another mentee get 404. All routes are in the access matrix.

## Acceptance criterion (step 7 of the PRD scenario)
> A mentee is enrolled in the "One-on-one: 8 sessions in 2 months" package; the mentor books and holds a session and sets a next action; package use is visible.

**Met.** Both by automated test (`tests/integration/mentoring.test.ts`) and in the local browser:
1. The "One-on-one: 8 sessions in 2 months" template and a single-person run were created and the mentee enrolled: "0 of 8 sessions · 60 days until expiry".
2. A session was booked from the "Book a session" dialog: "Tomorrow 18:00 · 60 minutes", with a link.
3. "Held" was pressed. The session moved to "Past" and usage became "1 of 8 sessions".
4. "Next action" appeared under the session and created a task for the mentee.
5. A goal was created and marked "Achieved". The enrollment's progress became "100% · 1 of 1".

## Tests
- **Unit:** `src/modules/programs/progress.test.ts` (4 new tests: goal-based progress and package use; 16 tests in the whole file).
- **Integration:** `tests/integration/mentoring.test.ts` (13 tests):
  - a new package;
  - booking in Tehran time and counting overlaps;
  - an http link and a member of another run (422);
  - an unrelated mentor (404);
  - the mentee's view;
  - held, excused no-show, counted no-show and cancellation in usage;
  - changing the day while keeping the time;
  - the next action in "My tasks";
  - group session rules;
  - goals and 50% progress;
  - "My programs".
- **Access matrix:** seven new routes.
- **Whole suite:** 85 files, 1948 tests, all green. typecheck, Biome and the i18n guard are clean.
- **Browser (local, admin account):**
  - Run page (see above).
  - "Today": tonight's session with the "Within 24 hours" label and the run name.
  - Student record: "1 of 8 sessions".
  - No console errors.
- **Not seen:** "My programs" with a mentee account, as in sprint 5 (signing in with a mentee account was blocked in this session). The page's data has an automated test, but the page itself was not seen in the browser.

## Running on production (founder's job)
1. First 0006 to 0010 in order, per the sprint 1 to 5 documents. **Do not run 0011 without them.**
2. A fresh `pg_dump`.
3. `pnpm db:migrate`. Migration `0011_sessions_goals` creates two new tables and the `tasks.session_id` column and does not touch existing data.
4. Deploy.

## Decisions
- A no-show is deducted from the package by default. The exception is set per session; there is no organization-wide setting for it.
- Overlap is only a warning (sprint risk).
- The 24-hour reminder is for now just the label on "Today". It has no notification or SMS.
- A group session is not possible for the legacy path (the "Freelancing mentoring" run). A single-person session is possible for its member.
- A package whose quota or validity has run out does not block booking a session; it only shows a warning label. Since payment is out of scope, renewal stays manual.

## Remaining
- **Sprint 6:** admin dashboard and Takanesh data import.
- Renewing a package from the UI (for now only by editing the enrollment).
- Editing a goal's title from the UI (the API has it).
- An external reminder (notification, SMS) for sessions.

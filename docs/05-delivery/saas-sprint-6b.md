# Coach Office sprint 6b — notifications, mentee dashboard, English and the acceptance-scenario e2e

- **Date:** 7 Aban 1405 (2026-10-29)
- **Basis:** `docs/08-saas-evolution/architecture-review.md` (sprint 6), `prd-coach-office.md` (section 6: the MVP acceptance scenario), `saas-sprint-6a.md` (remaining items)
- **Status:** code and tests complete. **One new migration (`0012_notifications`). Not on production and not committed.**

## What was built
| Area | Summary |
|---|---|
| In-app notifications | New `notifications` module. Six kinds: new task (mentee), review result (mentee), new submission (reviewer), new mentee message (question owner), answer to a question (mentee), new session (a one-on-one mentee, or all active and paused members of a group course). Each notification links to its own page |
| Notification bell | In the top bar for staff and mentee, next to the account, with the unread count. The staff menu also has "Notifications". Pages: `/notifications` (staff) and `/my/notifications` (mentee). Opening a notification marks it read; there is a "Mark all as read" button and "Older notifications" (pages of 20) |
| Mentee dashboard | A new "My programs" card on "Home", under the path card: for each course or mentoring (except the main path, which has its own card) the progress, current phase, next session and package use. The details stay in "My programs" |
| Admin mobile menu | "Overview" (6a) was missing from the mobile menu; added |
| English | The PRD criterion (step 13) is that the main pages do not break in English (LTR), not a full translation. The e2e checks exactly this on 8 staff pages and 5 mentee pages at both sizes. Old strings that are still Persian in the code (2213 lines in the i18n guard's baseline) stay Persian in English |
| Acceptance-scenario e2e | `tests/e2e/acceptance-scenario.spec.ts`; see below |
| API | `GET /notifications` (`cursor`, `limit` up to 50; response `items`, `unread`, `nextCursor`) and `POST /notifications/read` (`ids`, or without it = all). Both for all three roles and only on the user's own rows. `GET /me/programs` now also has `run.isLegacy` |

## Decisions
- **The notification is in the same transaction.** The tasks, questions and mentoring modules call `notify` inside their own transaction; if the work fails, no notification remains. This is the only place where one module writes another module's table, and it goes through that module's service, not directly.
- **The actor gets no notification**, and each recipient gets only one notification per event.
- **No email, SMS or push.** In-app only. An external channel comes after the pilot, with real data.
- **The notification text is not stored.** Only the kind and a small piece of data (task or question title, result, session time) are in jsonb, and the text is built at display time in the viewer's language.
- **Account deletion:** the recipient's notifications and the notifications about that mentee are erased (ADR-0010).
- **A second organization in e2e.** The e2e server now creates a second organization with its own owner, like `pnpm org:create`, so step 12 of the scenario really has two organizations.

## The acceptance scenario in e2e
One pass on desktop (1440); data is set up with the same APIs the pages call, and the result is checked on the real pages:
1. The e2e server creates the organization. The admin invites 2 mentors and they accept the invitation.
2. A mentor creates the template "Freelancing mentoring, 8 weeks" with two phases and one task, publishes it and submits it to the organization; the admin approves.
3. The admin creates a group run, puts the two mentors on its staff and imports 3 mentees directly into that course with CSV.
4. Another mentee takes the same template as a single-person run.
5. The "One-on-one: 8 sessions in 2 months" package: a session is held, a next action is recorded, package use is 1 of 8, and the next session is booked.
6. The task is assigned to the whole course; three mentees submit; one is accepted, one gets "Changes requested" and the third stays in the queue.
7. On "Home" the mentee sees the "My programs" card with the current phase and next session, and in notifications "was accepted" and "New task". The other mentee sees "Changes requested". Progress in `/me/programs` is up to date.
8. The mentor's "Today" shows the pending submission and the upcoming session, and the new-submission notification has arrived.
9. The mentor's private note is visible to the mentor themselves; the admin does not see it, neither in the API, nor in the record, nor in the "Overview". The "Overview" has the course and both mentors.
10. A mentee cannot see another mentee's record (403) and does not have the other's package in their programs. The owner of the second organization sees none of the mentees, the course, the template or the Takanesh dashboard (404 and empty lists).
11. **Step 13 (both sizes):** an admin and a new mentee switch their language to English. The 13 main pages have `dir=ltr` and `lang=en` and no horizontal scroll. The shared e2e user stays Persian so that other specs are not disturbed.

The numbers are small (3 mentees instead of 100, 2 mentors instead of 3); the behavior is the same, and performance with large data is measured separately.

## Tests
- **Integration:** `tests/integration/notifications.test.ts` (6 tests): task, submission and review; question and answer; a session only for its member; reading only one's own rows and "all"; pagination. The access matrix has the two new routes.
- **Whole suite:** 89 files, 1986 tests, all green. typecheck, Biome and the i18n guard are clean.
- **e2e:** the scenario (desktop) and step 13 (desktop and mobile) are green.
- **A fix in the e2e tooling:** the `E2E_ISOLATED=1` mode did not copy the `messages/` folder (from sprint 2) and the server did not come up. That means the whole e2e had not run in this mode since sprint 2; fixed.
- **Three old e2e tests that had fallen behind current behavior** (none is from 6b) were updated:
  - `shell.spec.ts`: since sprint 3 the mentee top bar on desktop has six destinations ("My programs"); mobile still has five.
  - `students-flow.spec.ts`: since SEC-S7 the CSV export is a download button, not a link.
  - `tasks-flow.spec.ts`: the task link on "Home" had the same name as the welcome card's link (now an exact match), and the feedback card's title includes the reviewer's name ("Feedback from coach Test").
- **Whole e2e suite** (42 tests at two sizes): in the last run 38 green, 1 skipped (the scenario is desktop only) and 3 timing failures under load (`next dev` was compiling pages while two workers ran). The same three tests passed separately at both sizes, and the whole suite was green in the previous run. Suggestion for CI: run e2e against a production build (`next start`) instead of `next dev`.
- **Browser (local, admin account):** the bell and the `/notifications` page (empty state) with no horizontal scroll. The full state and the mentee's "Home" card were seen by the e2e in a real browser.

## Running on production
`0012_notifications` only creates a new table. **Only after 0006 to 0011**, with a fresh `pg_dump`, and together with the code deploy (the new code errors without the table).

## Remaining
- **From the founder:** a sample file or the current export of Takanesh's mentees so a real import can be tried before the pilot.
- **From the founder:** the decision and timing of deploying sprints 1 to 6b to production (migrations 0006 to 0012 in order, with `pg_dump`).
- Measuring the performance of "Today", "Overview" and notifications with Takanesh-sized data (3000 mentees).
- Full English translation (for an investor demo): the old strings are still Persian in the code.
- An external notification channel (SMS or email) after the pilot.

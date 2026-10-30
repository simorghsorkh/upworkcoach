# Coach Office sprint 5 — program tasks and progress

- **Date:** 8 Aban 1405 (2026-10-30)
- **Basis:** `docs/08-saas-evolution/architecture-review.md` (sprint 5), ADR-0012 item 6 (progress), `prd-coach-office.md` section 6 (steps 9 to 12)
- **Status:** code and tests complete; tried in the browser locally (staff view); **not run on production**; not committed.

## What was built
| Area | Summary |
|---|---|
| Tasks from a task node | "Assign to group" on every task activity on the run page: for each active or paused member who does not have this task yet, one task (`path_assignment`) is created. Pressing it again only creates tasks for those who lack one. Reviewer: the mentee's primary mentor, otherwise the run's mentor, otherwise whoever pressed the button |
| Relative due date | Due date = run start + the usual days of the earlier phases (an open-ended phase counts as zero) + the activity's `dueOffsetDays` (or 7 days if empty). A due date already in the past becomes today. An explicit date can also be sent |
| Link between task and program | Columns `tasks.enrollment_id` and `tasks.node_id`; each enrollment has at most one live task per node (a cancelled task frees the slot). The programs module creates the task through the tasks module's `insertProgramTasks`, not directly |
| Activity completion | Table `node_completions` (enrollment × node): the mentee presses "I did it" on a lesson or resource and ticks checklist items; both can be undone. An activity in a locked phase cannot be marked. Staff can mark too, and only they mark an untyped milestone (API only for now) |
| Progress function | `programs/progress.ts`, a pure function with unit tests: progress = required activities done ÷ required activities (a phase is not counted). A task counts once it is "accepted", a lesson and a resource once marked, a checklist once all items are ticked, a milestone once an approved achievement of the same type exists. When there is no required activity, progress is "unknown", not 0% and not 100% |
| Milestone in the template | The "Required achievement" field in the template editor (`milestone_type_id` on template and run nodes); the template row says "Done with an approved … achievement" or "Mentor marks it manually" |
| Run page | Each member's progress (bar and "40% · 2 of 5"), the run's average progress, and for each task "Task: n people · Accepted: m" |
| "My programs" (mentee) | A progress bar for each program, "Done" on each activity, the mark button and checklist ticks, and for a task the task status and a "View task" link (the mentor's feedback is there) |
| Student record | The "Programs and mentors" card shows the progress of each enrollment (not of the main path) |
| Review queue | Program filter and review-deadline status (overdue, near, within deadline) on the "Awaiting review" tab of the Tasks page; the API also has a mentee filter. The program name next to each submission (Tasks page and "Today") |
| API | `POST /program-runs/:id/nodes/:nodeId/assign` (201: created, rejected, ids), `PUT /enrollments/:id/nodes/:nodeId/completion`; `GET /review-queue` now takes `runId`, `studentId` and `sla`; the run, enrollment and "My programs" DTOs have a `progress` field |

## Acceptance criteria (steps 9 to 12 of the PRD scenario)
| Step | Result |
|---|---|
| 9. The mentee sees feedback and current progress | Automated test of the mentee's progress after a task is accepted and after marks; the "My programs" page was built but **not seen in the browser with a mentee account** (see below) |
| 10. The mentor sees overdue work and reviews waiting | "Overdue" and "Awaiting review" tabs with program and deadline filters; automated test of the queue filters |
| 11. The admin sees overall progress and mentor load, not the private note | Run average progress (automated test: 33%), mentor directory (sprint 4), private note (sprint 4 test) |
| 12. Access separation | Access matrix for the two new routes; a mentee marks only their own enrollment (404 for others); unknown node or enrollment gives 404 |

## Tests
- Unit: `src/modules/programs/progress.test.ts` (12 tests: every activity type, required and optional, "unknown", average, relative due date).
- Integration: `tests/integration/program-progress.test.ts` (5 tests: one-time assignment and repeat, due dates, 422 and 404 errors, mentee marks and locked phase, queue filters, acceptance and milestone, average, staff marks) plus the access matrix.
- Whole suite: 84 files, 1884 tests, all green. typecheck, Biome and the i18n guard are clean.
- Browser (local, admin account):
  - Run page: each member's progress bar and the average; "Assign to group" created two tasks and the count became "2 people".
  - Tasks page: program and deadline filters.
  - Template editor: choosing and saving the "Required achievement".
  - Student record: the progress bar.
  - No console errors.
- **Not seen:**
  - "My programs" with a mentee account. I created a password for one of the local test mentees (in `.data/local-test-accounts.md`), but signing in with it was blocked in this session. The founder can sign in with that account.
  - The program name next to a submission in the queue, because there was no pending submission. An automated test covers it.

## Running on production (founder's job)
1. First 0006 to 0009 in order, per the sprint 1 to 4 documents. **Do not run 0010 without them.**
2. A fresh `pg_dump`.
3. `pnpm db:migrate`. Migration `0010_program_progress` only creates a new column and table and does not touch existing data. Old tasks have an empty `enrollment_id` and `node_id` and are not counted in progress.
4. Deploy.

## Decisions
- Progress comes only from required activities; optional ones can be marked but do not change the percentage.
- The percentage is rounded down, so 100% appears only when all the work is really done.
- The run average counts only active and paused members, and members whose progress is unknown are left out.
- A typed milestone is not completed by a manual mark; only an approved achievement does it.
- The main path (the legacy run) has neither assignment nor a progress bar; there, progress is simply the path stage.

## Remaining
- **Sprint 5b:** mentoring sessions (`mentoring_sessions`) and package use, goals (`goals`).
- Staff UI for marking an untyped milestone (the API has it).
- "Apply template changes to the run" (P2) and content links in the template editor.
- The contract step (dropping `current_stage_id`, `primary_mentor_id`, `stage_entered_at`, `cohort`, `mentor_assignments`).

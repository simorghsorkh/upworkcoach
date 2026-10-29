# Coach Office Sprint 3 — Program model (template, run, enrollment)

- **Date:** 6 Aban 1405 (2026-10-28)
- **Basis:** ADR-0012 (accepted; section "Reconciliation with the implementation")
- **Status:** Code and tests complete; tested locally in the browser; **not run on production**; not committed.

## What was built
| Area | Summary |
|---|---|
| Program template | Program or one-on-one type; details and package (duration, number and length of sessions, validity); phases with typical duration, continuous and gate; activities: lesson, task (deadline and submission type), checklist, resource and milestone; move up and down |
| Template lifecycle | Draft ← publish ← archive and restore; copy; delete only a draft with no runs; editing a published template bumps its version |
| Mentor template (Q5) | Stays private; "Submit to organization" ← admin approval (organization-wide) or rejection with a reason (private) |
| Run | From a published template with a full copy of phases and activities (the template version is recorded), or one-on-one without a template; group (admin) or individual; start, finish, reopen, archive; run staff (run manager, mentor) |
| Enrollment | Enroll several students or one; session quota and validity date copied from the template; pause until a date, resume, complete, withdraw, reactivate |
| Phase change | The same rules as stage changes: advance to the next phase, skip with assessment, advance by exception and move back (the last two with a note) |
| Legacy path | For each organization a "Freelance mentoring" template and run with all students; kept in sync by a trigger; a phase change in it is the same as a stage change |
| Pages | "Programs" in the staff menu (`/programs`), template editor, run page, "My programs" for students (`/my/programs`; on mobile from "My path"); all in Persian and English |
| API | 21 new routes under `/api/v1/program-templates`, `/program-runs`, `/enrollments`, `/students/:id/enrollments`, `/me/programs` |

## Acceptance criteria
| Criterion | Result |
|---|---|
| A current student sees the same stage and the same tasks | Holds: the legacy path remains the source of truth and each student's enrollment is in sync with their stage (on the local database: 0 mismatches) |
| An 8-week template is built and used in two runs (group and individual) | Automated test, and in the browser: the template "8-week Upwork entry program" with 3 phases and 5 activities, a group run, enrolling two students and a phase change |
| Editing a template does not change an active run | Automated test: after renaming a phase and adding a phase, both runs still have the same 2 previous phases; a third run gets version 3 |

## Tests
- Integration: `tests/integration/programs.test.ts` (14 tests); access matrix for the new routes.
- Full suite, typecheck, Biome and the i18n guard: results in `docs/STATUS.md`.
- Browser (local, Persian and English): creating a template, phase, publishing, group run, enrollment, phase change.

## Running on production (founder's task)
1. First Sprints 1 and 2 (migrations 0006 and 0007) per their own docs. **Do not run 0008 without them.**
2. A fresh `pg_dump`.
3. `pnpm db:migrate` with the production `DATABASE_URL` (direct connection). The migration creates the "Freelance mentoring" program and the enrollment of all students for each organization, and does not touch old data.
4. Deploy the new code to Vercel; in "Programs", the "Freelance mentoring" run should show all students in the same Kanban stage.

## Decisions and differences from the ADR
In ADR-0012, section "Reconciliation with the implementation". The most important:
- A mentor's scope is still the student's "primary mentor"; `enrollment_mentors` and access from run staff to the student's record are Sprint 4.
- Kanban, "Today", health and tasks are still on the legacy path; new runs have a phase and status for now but no tasks, activity completion or progress (Sprint 5).
- A mentor only creates individual runs (group runs by the admin).

## Remaining
- Sprint 4: `enrollment_mentors`, mentor scope from enrollment and run staff, mentor directory.
- Sprint 5: tasks from the task node and "Assign to the whole group", lesson and checklist completion, progress function; Kanban and health on enrollment.
- Sprint 5b: sessions, goals and quota consumption.
- Content links in the activity form (the API is ready); a "Programs" card in the student record (the API `GET /students/:id/enrollments` is ready).
- Left over from Sprint 2: extracting the text of the task forms and the remaining legacy pages.
- The `Count` badge (the number next to card titles) still shows Persian digits in English; the shared component is legacy and will be fixed in the next extraction.

# Coach Office Sprint 4 — Mentors and directory

- **Date:** 7 Aban 1405 (2026-10-29)
- **Basis:** `docs/08-saas-evolution/architecture-review.md` (Sprint 4), ADR-0011 and ADR-0012 (sections "Reconciliation with the implementation")
- **Status:** Code and tests complete; tested locally in the browser (Persian and English); **not run on production**; not committed.

## What was built
| Area | Summary |
|---|---|
| Mentor–enrollment relationship | Table `enrollment_mentors` with a primary or co-mentor role, start and end; each enrollment has at most one active primary mentor. The history of `mentor_assignments` was moved into it |
| Access source | A mentor's scope ("only their own students") now comes from two paths: primary or co-mentor of an enrollment (with any status), or an active member of a run's staff in which the student is enrolled and has not withdrawn. All lists and pages (students, questions, reminders, tasks, notes, files) use this one SQL condition |
| Legacy path | Changing the primary mentor in the student record is mirrored by a trigger into the `enrollment_mentors` of the "Freelance mentoring" path; the primary mentor of this path is changed via the old route (`changeMentor`) so that questions and reminders move too |
| Mentor card | Table `mentor_profiles`: specialties, short bio, capacity (max primary students; only warns), "Taking new students" |
| Directory | The "Mentors" page (`/mentors`): search by name or specialty, filter by specialty and "Only those taking new students"; for each person the number of students (primary and co-mentor), capacity, runs and overdue reviews |
| Mentor page | `/mentors/:id` (admin, or the mentor themselves): card, students with role and program, runs; "Edit card" (admin or themselves) and "Transfer all students" (admin only; only the primary role is transferred) |
| Student record | A "Programs and mentors" card: each enrollment with its phase and mentors; the admin adds a primary or co-mentor (with a capacity warning) or ends a mentorship |
| Private note | A third visibility, `private`: seen only by the author and the mentors working with the student; **the admin does not see it** unless they are a mentor of that student themselves. Only the author edits it or changes its visibility (404 for everyone else) |
| Organization setting | "Mentors can create group runs" in the access settings; if on, a mentor creates group runs and becomes the "Run manager" |
| Data deletion | Purging a user purges their mentor card and ends their staff and mentorship roles; reasons and phase notes of a purged student are purged too |
| API | `GET /mentors/directory`, `GET /mentors/:id`, `PUT /mentors/:id/profile`, `POST /mentors/:id/transfer`, `GET`/`POST /enrollments/:id/mentors`, `DELETE /enrollments/:id/mentors/:userId` |

## Acceptance criteria
| Criterion | Result |
|---|---|
| Two mentors on one group run both see all its students | Automated test (`mentors.test.ts`) |
| A third mentor does not see them | Automated test: list, record and notes are 404; a student's withdrawal and the end of a staff role also remove access |
| The admin does not see a `private` note | Automated test: it is not in the timeline and editing it is a 404 |

## Tests
- Integration: `tests/integration/mentors.test.ts` (9 tests); access matrix for the new routes; scope unit tests in `access.test.ts`.
- Browser (local): directory and specialty filter, mentor page and saving the card, the "Programs and mentors" card in the student record; Persian and English. "Transfer all" and "Add mentor" were not clicked in the browser; they have automated tests.

## Running on production (founder's task)
1. First 0006, 0007 and 0008 in order, per the Sprint 1 to 3 docs. **Do not run 0009 without them.**
2. A fresh `pg_dump`.
3. `pnpm db:migrate`. Migration `0009_mentors` moves the history of `mentor_assignments` and each student's current primary mentor into `enrollment_mentors` and does not touch old data.
4. Deploy. In "Mentors", each mentor's primary student count should match their student list.

## Decisions
- Capacity is only a warning and does not block assignment.
- Directory counts only count active and paused enrollments; completed and withdrawn enrollments are history.
- "Transfer all" only moves the primary role; co-mentor and run staff roles stay where they are.
- An admin who is a student's mentor sees that student's private note; because they are the mentor, not because they are an admin.
- All staff see the directory; each mentor's page is only for the admin and the mentor themselves.

## Remaining
- Sprint 5: tasks from the task node and "Assign to the whole group", activity completion, progress function, program filter in the review queue.
- The `Count` badge still shows Persian digits in English (legacy component).
- `students.primary_mentor_id` and `mentor_assignments` are still written (bridge); removing them is in the contract step.

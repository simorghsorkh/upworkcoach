# Coach Office sprint 6a — organization overview and bulk import into a course

- **Date:** 7 Aban 1405 (2026-10-29)
- **Basis:** `docs/08-saas-evolution/architecture-review.md` (sprint 6), `prd-coach-office.md` (scenario, step 3: "the admin imports or invites 100 mentees with CSV")
- **Status:** code and tests complete. Tried in the browser locally with an admin account. **No migration. Not on production and not committed.**

## Why two parts
In the roadmap, sprint 6 is about two weeks: three dashboards, in-app notifications, CSV import into a run, English translation of the pilot pages and an e2e of the 16-step scenario. This part (6a) is the two things the Takanesh pilot cannot start without: the admin must be able to bring mentees into a course in one go and see the state of the whole organization. The rest is in 6b.

## What was built
| Area | Summary |
|---|---|
| Organization overview (`/overview`) | A new admin page, first in the admin menu. Subtitle: active and paused mentees, open courses, mentors. Five tiles, each linking to its own list: red mentees, yellow mentees, submissions awaiting review (with the number overdue), unanswered questions (with the number overdue) and overdue tasks |
| Courses table | Every open course (draft or active): active and paused members, average progress, the number of red and yellow among active members, staff. The main path comes first and has no progress. The "Stages" link goes to that course's kanban (sprint 5c) |
| Mentors table | Mentees, primary / capacity (with a "Full" label), number of courses, overdue reviews, and the reds among mentees for whom the mentor is primary or companion. Most reds first |
| Bulk import into a course | The "Import from Excel" dialog now has an optional "Course" picker, with open group courses only. When a course is chosen, the file is re-checked. The new optional "Phase" column (phase number or name); without it the mentee starts in the first phase |
| Existing mentee | If the organization already has a mentee with the same mobile number, the row no longer gets a "duplicate" error: the mentee is just added to the course, and the rest of the row's columns (mentor, stage, task...) are ignored. The preview shows their count ("2 existing mentees"). A current member of that course gets an error |
| API | `GET /dashboard/organization` (admin only). `POST /imports/students` takes an optional `runId`; the response has `enrolled` and `course`, and `existing: true` for each existing row |

## Decisions
- **Import into a course is one transaction.** First the new mentees are created one by one (as before), then all valid rows are enrolled in the course with a single `enroll` call. If that step fails, the mentees have been created but none is in the course, and each row gets the message "add them from the course page".
- **The starting phase is not a phase change.** A mentee who enters at phase 3 gets their first transition recorded as type `initial` to phase 3; the pass rules and the mandatory note do not apply to them.
- **Open group courses only.** The main path and a single-person run get 422. The main path already has its own "Stage" column.
- **The dashboard only reads.** The new `dashboard` module counts from the students, student_health, enrollments, enrollment_mentors and tasks tables and takes its lists from the "Today" and mentor directory services. It has no new table or read-model.
- The numeric "Today" tile moved to the shared component `components/ui/kpi.tsx` so both pages use the same one.

## Tests
- **Integration:**
  - `tests/integration/course-import.test.ts` (3 tests): preview with a phase by number and by name, existing mentee, current member and a nonexistent phase; a phase column without a course and an unsuitable course (main path, invalid id); a real import: two new mentees with invitation links, one existing mentee without a link, each in the right phase.
  - `tests/integration/org-dashboard.test.ts` (2 tests, in a separate organization): admin only; counts of mentees and health, overdue tasks, main path and course, staff, and the mentor's reds.
  - Access matrix: the new route.
  - `csv.test.ts` stays green unchanged (import without a course behaves as before).
- **Whole suite:** 88 files, 1967 tests, all green. typecheck, Biome and the i18n guard are clean.
- **Browser (local, admin account):**
  - `/overview`: five tiles, three courses (main path, "Autumn 1405 group" at 0%, one-on-one at 100%), mentors table.
  - Mobile width (375): the page has no horizontal scroll; the tables scroll inside their own cards.
  - "Import from Excel": the course picker lists only "Autumn 1405 group" and choosing it shows the course guide.
- **Not seen:** an actual file import from the browser dialog (choosing a file from disk was not possible in this environment). The same API path has an automated test.

## Running on production
No new migration. It is deployed together with the other sprints (0006 to 0011 in order).

## Remaining for 6b
- In-app notifications.
- The mentee dashboard (several programs, next action) and the mentor dashboard additions on "Today".
- English translation of the pilot pages (if Q6 needs it).
- The e2e of the 16-step scenario in both languages (sprint 6 acceptance criterion).
- Measuring dashboard performance with Takanesh-sized data (3000 mentees).
- **From the founder:** a sample file or the current export of Takanesh's mentees (columns and date formats) so a real import can be tried before the pilot.

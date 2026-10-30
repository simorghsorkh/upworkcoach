# Coach Office sprint 5c — separate stages for each course

- **Date:** 7 Aban 1405 (2026-10-29)
- **Founder's request:** «مدرسین یا منتورها دارای چند دوره هستن که هر دوره مراحل خاص خودش را داره و می‌خوام این مراحل به صورت داینامیک بشه برای هر دوره‌ی آموزشی تعریف کرد.» (Teachers or mentors have several courses, each course has its own stages, and I want these stages to be definable dynamically for each course.)
- **Basis:** ADR-0012 (template with phases, run with a fixed copy of the template, sprint 3) and ADR-0005 (health rules).
- **Status:** code and tests complete. Tried in the browser locally with an admin account. **No migration. Not on production and not committed.**

## The problem
Since sprint 3, each course (program template) has its own phases, which the admin or mentor defines in the template editor. But the staff's daily pages still knew only the stages of the main path ("Freelancing mentoring"): the "Stages" kanban, the student list, "Today" and the health rules. A student of any other course had no place on these pages.

## What was built
| Area | Summary |
|---|---|
| Defining stages | Unchanged: the phases of each course are defined in its template (title, usual days, open-ended, gate). The run copies them from the template when it is created |
| "Stages" page | A "Course" picker next to "List/Stages". An empty value is the main-path kanban. When a course is chosen (`?run=`), the columns are that course's phases: number, title, count, "Usual: up to n days" or "Ongoing", and a gate label. Each card has the health status (or "Paused"), the days in this phase in a warning color, and a move button. The "Course page" link goes to the run page |
| Moving a phase | The shared `PhaseDialog` (the same stage-change rules: pass, skip with evaluation, pass with exception, go back; going back and an exception need a note). In the course kanban, the run page and the student record |
| Student list | A "Course" filter: "All courses", each course with "All phases", and each phase separately (`?course=runId` or `runId.phaseId`). Under the stage column, the student's place in each course: "Course · phase 2 of 3: title · 5 days", in a warning color when past the usual |
| "Today" | "Stuck student" rows carry the same course and phase label |
| Student record | A "Change phase" button in the "Programs and mentors" card for an active enrollment in a course with more than one phase. The main path keeps its "Change stage" |
| Health | R-STALL is now computed over the phase of every active enrollment (the main path is one of them) and the worst "days in phase ÷ usual days" ratio decides. A paused enrollment, an open-ended phase and a phase with no usual days are not counted. R-NOTASK is lifted only when all of the student's phases are open-ended |
| API | `GET /students` has `runId` and `phaseId` parameters and each row has a `courses` field. `GET /students/:id/enrollments` returns the list of phases of each run (`phases`) |

## Decisions
- **The main path was left alone.** Its kanban, stages and tables are as before; the main path is just one of the picker's options. This kept the pilot risk low.
- **No migration was needed.** Everything is read from the sprint 3 tables (`run_nodes`, `enrollments.current_phase_node_id`, `phase_entered_at`).
- The kanban and the filter show only open runs (draft or active) of the "program" type. The row labels show all open enrollments, one-on-one too.
- The course kanban has no drag and drop; moving is by button and dialog so that the kind of change and the note are recorded.

## Tests
- **Unit:** `src/modules/health/rules.test.ts`, 4 new tests: the worst phase among several courses, no phase means no stall, R-NOTASK is lifted only with all phases open-ended, and R-NOTASK with no phase.
- **Integration:** `tests/integration/course-phases.test.ts` (6 tests):
  - each list row has the student's place in the course (phase 1 of 3, 0 days);
  - course and phase filter, and moving a student by changing phase;
  - a mentor in their own scope sees the same;
  - the record has the list of the run's phases;
  - an 11-day phase with a usual 5 days gives a red R-STALL;
  - a paused enrollment is not counted.
- **Whole suite:** 86 files, 1956 tests, all green. typecheck, Biome and the i18n guard are clean.
- **Browser (local, admin account):**
  - "Stages" with the course "Autumn 1405 group": three phase columns, two students in phases 1 and 2, "Usual: up to 14 days" and "Ongoing", gate labels.
  - Student list filtered to that course: two rows labeled "Phase 2 of 3: Proposal writing" and "Phase 1 of 3: Profile and niche".
  - Student record: "Change phase" opened the dialog with the two target phases (the current phase is not listed).
- **Not seen:** the "Stuck student" row in "Today" with the course label. The local data had no stuck student. The row shows the same data as the student list and the stall rule has an automated test.

## Running on production
No new migration. It is deployed together with the other sprints (0006 to 0011 in order). After deploy, students' health is recomputed by the hourly `health.sweep` job or at each student's first change.

## Remaining
- Drag and drop in the course kanban.
- **Sprint 6:** admin dashboard and Takanesh data import.

# ADR-0012 — Program model: template, run, enrollment, package, session and goal

- **Status:** Accepted (expand implementation: Coach Office sprint 3; differences in the last section)
- **Date:** 6 Aban 1405 (2026-10-28)
- **Source of requirements:** `docs/08-saas-evolution/prd-coach-office.md` sections 3 and 4; founder document items 4-2 to 4-4, 7, 8, 9; founder's answers (Q5, "plan" = a sellable package, simple scheduling in the MVP)
- **Depends on:** ADR-0011 (all tables have `organization_id` and use composite foreign keys)
- **Effect on earlier ADRs:** the model "one global path + current stage on the student + primary coach" (data-model.md 2-2 and 2-3, ADR-0004 item 1) is replaced by this model. The stage gate logic, versioned submission, review and health are **kept**; only their keys change.

## Context
Today:
- `learning_paths` has one default row; `stages` are its stages; `task_templates` are the suggested tasks of each stage.
- Each student has one `current_stage_id` and one `primary_mentor_id`; `mentor_assignments` is only history (`secondary` and `backup` are unused).
- A task is attached directly to `student_id` and has one `reviewer_id`.
- "cohort" is only a free text field. A session is only a kind of note (`notes.kind = 'session'`), with no scheduling.

What is needed: multiple programs and reusable templates; group and individual runs on one core; a mentee in several programs with different mentors; template changes with no effect on active runs; sellable packages (one-on-one with a session quota, or periodic); a simple session; a private mentor template with admin approval.

## Options
| Topic | Options | Choice |
|---|---|---|
| Template change and active runs | (a) a template version table; (b) copy the template nodes when the run is created | **b**: the same result with one table fewer and no "which version" logic; the template may have a counting `revision` for display |
| cohort | (a) a separate cohort table inside the run; (b) every group run is a cohort | **b** for the MVP; sub-groups inside a run go to P2 |
| One-on-one | (a) a separate system; (b) a kind of run with `kind = 'one_on_one'` | **b** (document item 4-2: one core) |
| Mentor-mentee relationship | (a) a coach column on the student; (b) an assignment table at the enrollment level + run staff | **b** |
| Package and price | (a) a product and price table; (b) quota and validity on the template, sale outside the system | **b** (payment is out of scope, decision of 27 Mehr 1405 (2026-10-19)) |

## Decision

### 1. Tables
```
program_templates
  id, organization_id,
  kind text ('program' | 'one_on_one'),
  title, description, source_locale ('fa'),
  status text ('draft' | 'published' | 'archived'),
  visibility text ('private' | 'pending_approval' | 'organization'),
  owner_membership_id, approved_by, approved_at,
  -- package (all optional):
  session_quota int, session_minutes int, validity_days int, duration_weeks int,
  extensions jsonb ('{"freelancing": true}' ...),   -- extensions, as in section 8
  revision int, created_at, updated_at

curriculum_nodes                     -- template content
  id, organization_id, template_id,
  parent_id (null = phase), node_type ('phase' | 'lesson' | 'assignment' | 'checklist' | 'resource' | 'milestone'),
  title, body, content_links jsonb, sort_order,
  is_required bool, is_gate bool (phase only: passing needs mentor approval),
  expected_days int, is_open_ended bool (phase; the same behavior as the current stages),
  due_offset_days int (assignment: relative to run start or entry into the phase),
  submission_type (assignment; the same current enum), milestone_type_id (milestone),
  checklist_items jsonb

program_runs
  id, organization_id, template_id (null for a one-on-one without a template),
  kind ('program' | 'one_on_one'), mode ('group' | 'individual'),
  title, status ('draft' | 'active' | 'completed' | 'archived'),
  starts_on date, ends_on date, source_locale,
  template_revision int, created_by, created_at, updated_at

run_nodes                            -- a copy of curriculum_nodes at the moment the run is created (snapshot)
  the same columns as curriculum_nodes + run_id + source_node_id

run_staff
  run_id, membership_id, role ('manager' | 'mentor'), started_at, ended_at

enrollments                          -- a mentee's membership in a run
  id, organization_id, run_id, mentee_membership_id,
  status ('active' | 'paused' | 'completed' | 'dropped'), paused_until,
  current_phase_node_id (run_nodes), phase_entered_at,
  session_quota int, valid_until date,  -- copied from the template at enrollment time; an admin can change it
  enrolled_by, enrolled_at, completed_at
  UNIQUE (run_id, mentee_membership_id)

enrollment_mentors
  enrollment_id, membership_id, role ('primary' | 'secondary'), started_at, ended_at, assigned_by
  -- at most one active primary

node_completions                     -- lessons, resources and checklists marked "done"
  enrollment_id, run_node_id, completed_at, completed_by, checklist_state jsonb

mentoring_sessions
  id, organization_id, run_id, enrollment_id (null = a group session for the whole run),
  mentor_membership_id, scheduled_at timestamptz, duration_minutes,
  location_text (link or place; a link must be https), status ('scheduled' | 'held' | 'cancelled' | 'no_show'),
  counts_toward_quota bool, cancelled_reason, created_by, created_at, updated_at

goals
  id, organization_id, enrollment_id, title, description, target_date,
  status ('open' | 'achieved' | 'dropped'), achieved_at, approved_by
```

**Changes to existing tables:**
- `tasks`: `enrollment_id` and `run_node_id` (optional for free-form tasks) and `session_id` (optional: the "next action" of a session). `student_id` stays until the contract step. `reviewer_id` stays (default: the primary mentor of that enrollment).
- `stage_transitions`: `enrollment_id`, and the stages point to `run_nodes` (phase).
- `milestones`: optional `enrollment_id` (a milestone still belongs to the student; the link to the program is for progress).
- `notes`, `question_threads`, `checkins`, `reminders`: **optional** `enrollment_id` (the student's file in the organization is enough).
- `students`: becomes the "student's file in the organization". `primary_mentor_id`, `current_stage_id`, `stage_entered_at` and `cohort` are dropped in the contract step. The freelancing-specific fields (niche, English, hours per week, and so on) stay and show in the form only when the organization's freelancing extension is on.

### 2. Template and approval (answer to Q5)
- **admin/owner:** creates and publishes a template with `visibility = 'organization'`.
- **mentor:** creates a `private` template and creates runs only for their own mentees. "Submit for organization use" sets it to `pending_approval`; an admin approves (`organization`) or rejects (`private`, with a reason).
- Editing a published template raises `revision` by one and **has no effect on existing runs** (snapshot). An admin can explicitly press "Apply changes to run X" (P2; not in the MVP).
- "Duplicate template" and "archive" are allowed; deletion only for a draft that has no runs.

### 3. Run, group and individual
- **Group run (cohort):** several enrollments, a shared staff in `run_staff`, a group session with `enrollment_id = null`.
- **Individual run from a program template:** the same path for one mentee.
- **One-on-one (`kind = 'one_on_one'`):** the template is optional; its focus is goals, sessions and actions.
- Creating a run: admin/owner any kind; a mentor only an individual or one-on-one run from templates they can see, and they become `run_staff.mentor` themselves. (If the coach wants mentors to create groups too, an organization setting.)
- "Assign a task to the whole group" = create one task for each active enrollment from a `run_node` (the same existing `batch_id` pattern).

### 4. Packages (sellable plans)
- A package = a template with `session_quota`, `session_minutes`, `validity_days`.
- Enrolling a mentee in a package = creating an individual or one-on-one run + enrollment, which **copies** the quota and `valid_until` from the template.
- Usage = the number of this enrollment's sessions with `status IN ('held', 'no_show') AND counts_toward_quota`. Whether a "no-show" is deducted from the quota is an organization setting (default: yes).
- Expiry of validity or quota **does not lock session entry**; it only warns and is visible on the admin dashboard (renewal sale, outside the system).
- **There is no price, order or payment column.** When the revenue model is settled, the order table will point to `enrollments`; this structure leaves room for it.

### 5. Mentor access (replaces `primary_mentor_id` in ADR-0004)
Mentor m sees student s in organization o if one of these holds:
1. m is active in `enrollment_mentors` of one of s's enrollments;
2. m is active in `run_staff` of a run in which s has an enrollment;
3. the organization setting `access.mentorScope = 'all'` is on.

The scope is implemented as an `EXISTS` subquery in `scopeCondition` (an index on `enrollment_mentors(membership_id) WHERE ended_at IS NULL` and on `run_staff(membership_id) WHERE ended_at IS NULL`). A program manager (`run_staff.role = 'manager'`) sees the mentees of that run and can manage that run's tasks, sessions and assignments. File-level data (a note without an enrollment, questions) is accessible to any mentor who sees the student under the rules above, respecting the note visibility level (ADR-0011 item 6).

### 6. Progress (a pure function, one source of truth)
```
program-based:
  progress(enrollment) = completed(required) / total(required)  over this run's run_nodes (except phases)
    assignment → complete if task.status = 'accepted'  (submitted is not enough)
    lesson/resource → complete if a node_completions row exists
    checklist → complete if all items are ticked
    milestone → complete if an approved milestone of this type exists for the student
  if total(required) = 0 → progress is "unknown" (neither 0% nor 100%)

one-on-one:
  progress = goals.achieved / (goals - dropped); session usage is separate: used / session_quota
```
Dashboards, exports and reports call **only** this function. Health (ADR-0005) stays separate; the rules are computed over the student's active enrollments and the worst result is recorded for the student (R-STALL based on each enrollment's `phase_entered_at`).

### 7. Sessions (simple scheduling)
- Creating, editing and cancelling: the mentor in scope, or an admin. A mentee sees only their own sessions (and the group sessions of their own run).
- Time is stored in UTC and displayed in the organization's time zone (ADR-0013).
- After the session: the status (`held`/`no_show`), a note (with a visibility level), and a "next action" = a task with `session_id`.
- Shown in "Today", the mentor dashboard and the mentee dashboard; an internal reminder 24 hours before for the mentor.
- **Not included:** calendar sync, booking by available hours, advanced conflict detection (only a simple overlap warning for one mentor), ics file (P2).

### 8. Freelancing extension
`platforms`, `platform_profiles`, `profile_snapshots`, the submission types `proposal_review` and `profile_review`, and the North Star "first contract" are not removed. They are turned on with `program_templates.extensions.freelancing` and an organization setting. For the coach it is on.

### 9. Migration of existing data
1. The default `learning_paths` → one `program_template` ("Freelancing mentoring", `kind = 'program'`, `published`, `organization`, freelancing extension on).
2. Each `stage` → a `phase` node (same order, `expected_days`, `is_open_ended`, `content_links`, the mentee-facing description). Each `task_template` → an `assignment` node under its own phase.
3. One `program_run` ("Default run", group, `active`) with the copied `run_nodes`.
4. For each student one `enrollment`, with `current_phase_node_id` mapped from `current_stage_id` and the same `stage_entered_at`; the status from `lifecycle_status`.
5. `primary_mentor_id` → `enrollment_mentors (primary)`; the `mentor_assignments` history is kept.
6. `tasks.enrollment_id`, `stage_transitions.enrollment_id` and `run_node_id` (for tasks from a template) are filled in.
7. `students.cohort` (free text) is added to `tags` so that it is not lost; the column is dropped in the contract step.
8. After the migration, all current path, tasks, health and today tests must be green with no behavior change.

## Consequences
**Positive:** one core for group, individual and one-on-one; packages without entering payments; template changes are safe; mentor access comes from the real relationship, not a column.

**Negative:** the biggest migration of the project (sprint 3); the kanban, "Today", health and the North Star must be rewritten on top of enrollment; the mentor-scope query with `EXISTS` is heavier than comparing one column (with an index it is enough for a few thousand students; measure in sprint 6).

**Required tests:** a migration test with a copy of real data; the progress function (a state table); the access matrix with three mentor cases (direct, run staff, all); snapshot (edit a template, the earlier run must not change); session quota counting; a mentor's private template must not be visible to another mentor.

## Alignment with the implementation (Coach Office sprint 3, 6 Aban 1405 (2026-10-28))
This section is the "expand" of the model: the new tables were built next to the 0.1 model, and the old path is still the source of truth for existing students. Dropping the old columns (contract) and rewriting the kanban, "Today" and health on enrollment is the work of later sprints.

**Built (migration `0008_programs`, module `src/modules/programs`):**
- The tables `program_templates`, `curriculum_nodes`, `program_runs`, `run_nodes`, `run_staff`, `enrollments` and `enrollment_transitions`; child tables take `organization_id` from the parent with the same `set_organization_id` trigger (ADR-0011), and a separate trigger prevents enrolling a student from another organization.
- Template: create, edit details and package, phase and activity (lesson, assignment, checklist, resource, milestone), ordering, publish, archive and restore, duplicate, delete a draft without runs; mentor: private template, "send to the organization", admin approve or reject with a reason (Q5). Editing a published template raises `revision`.
- Run: from a published template with a full copy of the nodes (`run_nodes.source_node_id`, `template_revision`), or one-on-one without a template; group (admin only) and individual (one active seat); status draft → active → completed and archive; run staff (run manager, mentor). A run is `active` when created.
- Enrollment: group or single enrollment, copying `session_quota` and `valid_until` (today in the organization's zone + `validity_days`), pause (with "until date"), resume, complete, drop and reactivate; phase change with the same stage-change rules (`checkTransition`: pass one by one, skip with evaluation, exception and going back with a note).
- Pages (fully fa/en): "Programs" (`/programs`), the template editor, the run page, "My programs" for the mentee (`/my/programs`; a locked phase shows only its title).
- 21 new API routes in the manifest and the access matrix.

**Differences from the text above (deliberate):**
- **Person keys:** instead of `*_membership_id`, the user id is used (`owner_id`, `run_staff.user_id`, `enrollments.student_id` → `students.user_id`); each user has one membership per organization and all current code (scope, audit, services) works with the user id. The organization of each row is determined by `organization_id`.
- **Mentor scope is still `students.primary_mentor_id`** (item 5 was not implemented): a mentor sees a run if they are on its staff or their own mentee is enrolled in it; in a run where only their own mentee is enrolled, they see only those mentees. `enrollment_mentors` was not built.
- **`enrollment_transitions`** (a new table) is the phase-change history of the new runs; `stage_transitions` was not touched.
- **Legacy path bridge (a trigger, not a one-time copy):** the function `ensure_legacy_program(org)` (idempotent) creates, for each organization, the "Freelancing mentoring" template (published, organization-wide, freelancing extension), one active group run, and one enrollment per student; migration 0008 and the seed (after every `db:migrate` and `org:create`) call it. A trigger on `stages` keeps the phases of the template and the legacy run in sync, and a trigger on `students` (stage, entry time, lifecycle status) keeps the legacy enrollment in sync; `graduated` → `completed`. `task_templates` are converted to assignment nodes only once.
- **Legacy run rules:** its template is read-only (copy and run are free); in its run, enrollment, status changes and staff are closed (done from the student's file), and phase change is the path's `changeStage`, so `students.current_stage_id`, the kanban and health work as before. This is why the acceptance criterion "the current student sees the same stage and the same tasks" holds (test `programs.test.ts`).
- **Creating a group run for a mentor** is 403 for now (the organization setting of item 3 was not built).

**Left for later sprints:** `enrollment_mentors` and the item 5 scope; `node_completions` and the progress function (item 6); `mentoring_sessions` and `goals`; `tasks.enrollment_id` and `run_node_id` (task from a node, "assign to the whole group"); `milestone_type_id` on the milestone node; content links in the editor (the API has it, the form does not); "Apply template changes to run X" (P2); moving `cohort` to tags; the contract step (dropping `current_stage_id`, `primary_mentor_id`, `stage_entered_at`, `cohort`).

**Tests:** `tests/integration/programs.test.ts` (14 tests: the legacy path bridge, an 8-week template in two runs, group and individual, the run staying fixed after a template edit, phase rules, the individual seat, run status, deleting a draft, one-on-one, a mentor's private template and approve/reject, a mentor's run, staff, organization isolation), plus the access matrix for the 21 new routes.


## Alignment with the implementation (Coach Office sprint 4, 7 Aban 1405 (2026-10-29))
- **`enrollment_mentors`** (role `primary|secondary`, `started_at`/`ended_at`, `assigned_by`, `reason`) with at most one active primary mentor per enrollment (a partial unique index). Migration `0009` moved the `mentor_assignments` history (`backup` ← `secondary`).
- **Legacy path bridge:** two triggers (`enrollments_sync_legacy_mentor`, `students_sync_legacy_mentor`) keep the primary mentor of the "Freelancing mentoring" path in sync with `students.primary_mentor_id`. Setting the primary mentor on this path goes through `changeMentor`.
- **`mentor_profiles`** (mentors module): specialty, introduction, capacity (warning only), `accepting_students`.
- **Group run for a mentor:** possible with the setting `access.mentorsCanCreateGroupRuns` (default off), and the creating mentor becomes the run's `manager`. The "403 for now" item above is lifted by this setting.

## Alignment with the implementation (Coach Office sprint 5, 8 Aban 1405 (2026-10-30))
- **`node_completions`** (key enrollment + run node, `checklist_state`, `completed_at`) with an organization trigger from the enrollment. A mentee marks their own lessons, resources and checklists, but not in a locked phase. A milestone without a type is marked only by staff.
- **`milestone_type_id`** on `curriculum_nodes` and `run_nodes` (milestone only). A milestone with a type is done by an approved achievement of the same type, not by a mark.
- **Task-to-program link:** `tasks.enrollment_id` and `tasks.node_id` (the name `node_id` instead of the `run_node_id` of item 6). A partial uniqueness (enrollment, node) for non-cancelled tasks.
- **The progress function** is the same as item 6: `programs/progress.ts` with a unit test. The percentage is rounded down and is `null` ("unknown") when there is no required activity.
- **Relative deadline:** run start + `expected_days` of the earlier phases (an open-ended phase counts as zero) + `due_offset_days`. Without an offset, it is 7 days. A deadline already in the past becomes today.
- The legacy path has no assignment and no progress (409 `legacyRun`).

## Alignment with the implementation (Coach Office sprint 5b, 8 Aban 1405 (2026-10-30))
- **New `mentoring` module:** writes the tables `mentoring_sessions` and `goals`. It reads the run and enrollment from programs. The tasks module creates the next action (`insertSessionAction`).
- **`mentoring_sessions`** (item 7):
  - An empty `enrollment_id` means a group session for the whole run; only for a non-legacy group run.
  - The column `counts_toward_quota` (default true) replaced the organization setting "no-show is counted".
  - `organization_id` is taken from the run by a trigger.
- **`goals`** (item 6): enrollment, title, `target_date` and status (`open`, `achieved`, `dropped`); for a final status, `decided_at` and `decided_by` are recorded.
- **One-on-one progress** = achieved goals ÷ goals not dropped. **Package usage** (item 4) = held sessions and no-shows with `counts_toward_quota`. Both are in `programs/progress.ts` with a unit test.
- **`tasks.session_id`** with `ON DELETE SET NULL`.
- **24-hour reminder:** a label on the card of "Today" sessions, with no job.
- **Overlap** of one mentor's sessions is only a warning.
- **Data deletion:** goals are deleted and the location and cancellation reason of sessions are cleared.

## Alignment with the implementation (Coach Office sprint 5c, 7 Aban 1405 (2026-10-29))
- **Each run's phase is the source for the daily pages:** the "Stages" kanban (with `?run=`), the student list (`runId` and `phaseId`) and "Today" read the phase from `enrollments.current_phase_node_id` and `run_nodes`. The main path keeps the same `stages` and the legacy kanban.
- **Health (ADR-0005):** the rules' input is the list of phases of the active enrollments instead of a single stage (`enteredAt`, `expectedDays`, `isOpenEnded`). R-STALL takes the worst ratio. R-NOTASK is skipped only when all phases are open-ended.
- **No migration.** Phase change is the same `PUT /enrollments/:id/phase` of sprint 3.

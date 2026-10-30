# ADR-0004 — Access control: role + ownership scope, in the service layer, with a separate DTO for the student

- **Status:** Proposed (awaiting the founder gate). The security-reviewer review is done and change **C3** (`security.md` section 4) is applied in this version.
- **Date:** 27 Mehr 1405 (2026-10-19); security revision: 28 Mehr 1405; **aligned with the code of sprints 1 to 4: 30 Mehr 1405 (section 6)**
- **Author:** software-architect
- **Requirements source:** PRD section 5 (access table), F5 ("The student sees the internal note on no page and no API — an access test is mandatory"), assumption A8, `progress-tracking.md` section 8 (the student does not see health and flags)

## Context
Three hard rules:
1. **The student sees only their own data**, and of that only the non-internal parts.
2. **The mentor sees only the students assigned to them** (D2/A8). This must be switchable to "all" with one setting.
3. **The internal note, the health status, the reasons and the flags never reach the student.**

The admin sees everything.

## Options
| Option | Assessment |
|---|---|
| A. A check in every Route Handler | Scattered; server pages (RSC) that read data directly get missed; rejected |
| **B. A centralized policy in the service layer + a scope filter in the repository + a separate DTO for the student + an automated test matrix** | One path for the API and the pages; leaking an internal field is structurally impossible; testable |
| C. Row-Level Security in Postgres | Strong defense in depth; but with an ORM and a connection pool we would have to build a transaction and `SET LOCAL` for every request; its errors are hard for a developer to find; it also does not solve the "internal field" rule (a field, not a row) |

## Decision: option B (RLS will be revisited for 1.0)

### 1. Model
- `actor = { userId, role }` from the session. The first parameter of every service function is `actor`.
- **Student scope for staff** (`modules/access/scope.ts`):
  ```
  staffStudentScope(actor):
    admin  -> ALL
    mentor -> settings.access.mentorScope == 'all' ? ALL
              : students.primary_mentor_id = actor.userId
    student -> NONE (a student never passes through staff routes)
  ```
  The same function returns an SQL condition (Drizzle `SQL`) that is `AND`-ed into **all** staff list queries (`students`, `tasks`, `question_threads`, `reminders` about the student, `today`, `board`, `stuck`).
- **The student's scope over themselves:** all student routes are under `/api/v1/me/**` and the **server** sets `student_id = actor.userId`. The student id is never taken from the student's input.
- For a single resource (e.g. `GET /tasks/:id`): the service reads the resource → checks its `student_id` against the scope → if it is out of scope, **`404 NOT_FOUND`** (not 403) so the existence of the resource is not revealed. (Security C3, SEC-A1) This goes through one helper only: `loadInScope(tx, actor, kind, id)` in `modules/access/scope.ts`, which finds the `student_id` by walking from the parent to the root (e.g. `review` → `submission` → `task` → `student_id`; `attachment` → its attached parent → …). A service never reads a single resource without this function.

### 1-1. The rule for referenced ids (Security C3)
**General rule:** every id that appears in the **body or query** of a write request and points to another resource (not the path id `:id`) is checked **like the main resource**, and if that resource belongs to a student, it must belong to **the same student as the main resource**. Checking the scope of the main resource alone is not enough; otherwise a mentor could write onto another student's profile using a `profileId`, or a student could attach someone else's task to their question using a `taskId`.

Implementation: the function `assertRefs(tx, actor, refs)` in `modules/access/refs.ts`, which the service calls **inside the same write transaction** and **before any write** (so nothing can change between the check and the write). Every new referenced id in the API must have a row in the table below; without one, code review rejects it.

| Id (in which endpoint) | Condition |
|---|---|
| `profileId` (task) | `platform_profiles.student_id = task.student_id` and `deleted_at IS NULL` |
| `taskId` (question) | `tasks.student_id = thread.student_id` (for a student this means their own task) |
| `attachmentIds` (submission, message, milestone) | `status = 'pending'` and `uploaded_by = actor.userId`; attached atomically (C4, `data-model.md` 2-5) |
| `mentorId`, `reviewerId`, `assigneeId`, `ownerId` | A user with `status = 'active'` and the role `admin` or `mentor`. If the actor is a mentor: `ownerId` only themselves; `mentorId` in `POST /students` is ignored and set to themselves |
| `studentId` (reminder, write filters), `studentIds` (bulk task) | **All** inside `staffStudentScope(actor)`; if even one is outside, the whole request is rejected and no row is created |
| `stageId`, `toStageId`, `platformId`, `primaryPlatformId`, `trackId`, `templateId`, `typeId`, `cannedResponseId` | The row exists and `is_active = true` (for `stageIds` in `PUT /stages/order`: exactly the complete set of stages of that track) |
| `createTemplateIds` (`PUT /students/:id/stage`) (aligned with the code, sprint 4) | The same condition as `templateId` for **every** member: the template exists and is active, and if the template has a stage, that stage is active too. At most 30; duplicates are counted once. Ref kind in code: `catalog` with `template` |
| `cancelTaskIds` (`PUT /students/:id/stage`) (aligned with the code, sprint 4) | The same condition as `taskId`: every task belongs to **the same** student as the path (`tasks.student_id = :id`). At most 100. A permitted but finalized task (`accepted`/`cancelled`) → `409 INVALID_TRANSITION`, not `422`. Ref kind in code: `taskOfStudent` |
| `cannedResponseId` from a student (aligned with the code, sprint 4) | A student is not allowed at all → `422` (even if the id is valid) |
| `existingStudentId` in the `409 PHONE_TAKEN` response (aligned with the code, sprint 4) | It is not an **input** referenced id, but because it reveals an id: it is returned only to the **admin** (who sees everything); a mentor does not receive it |

**Error response:** every referenced id whose condition fails (nonexistent, out of scope, another student's, inactive) → **`422 VALIDATION_FAILED`** with `fields.<field name> = "Invalid value"`. The message is **the same** for all these cases, so the existence of the resource is not revealed. (`404` is only for the **path** id.)

**Read filters in the query** (such as `studentId`, `mentorId`, `stageId` in `GET`s) are `AND`-ed with the scope condition and **never replace it**; a filter outside the scope just returns an empty list.

**Input schema:** all zod schemas use `.strict()` (an unknown key → `422`). Fields forbidden for each role (`primaryMentorId`, `currentStageId`, `lifecycleStatus` in `PATCH /students/:id`; `status` in `POST /me/milestones`; any `studentId` in the `/me` routes) are simply not in that route's schema (SEC-A7).

### 2. Access matrix (implementation of PRD section 5)
`A` = admin, `M` = mentor (within scope), `S` = student (own data only), `—` = forbidden.

| Resource / action | A | M | S |
|---|---|---|---|
| Create a student and invite | ✓ | ✓ if `mentorsCanInviteStudents`; assigned to themselves by force | — |
| Recreate the invite link (`POST /users/:id/invite-link`) | ✓ (any `invited` user) | (Security C3) only if the target user has **`role = 'student'`** and `status = 'invited'` and is in scope; every other case (including an `invited` user with the role `admin` or `mentor`, who has no `students` row) → `404`. The role condition is checked **explicitly**, not via "if a `students` row exists" | — |
| Invite a mentor or admin, change a role, deactivate, password reset link | ✓ | — | — |
| Student list and file (staff view, including health) | all | in scope | — |
| Own file (student view, **without** health and flags) | — | — | ✓ |
| Edit file fields | ✓ | ✓ | allow-list only (`data-model.md` 2-3) |
| Change the primary mentor | ✓ | — | — |
| Change student status (pause, graduate, …) | ✓ | ✓ | — |
| Platform profiles: view, add, edit, delete | ✓ | ✓ | ✓ (own) |
| Approve a profile | ✓ | ✓ | — |
| Change stage; stage history | ✓ | ✓ | only "My path" (current, next, past stage) |
| Create, edit, extend, cancel a task; review a submission | ✓ | ✓ | — |
| See a task, its submissions and feedback | ✓ | ✓ | ✓ (own; **without** `reviewer_id` and the internal note) |
| Start a task, submit | — | — | ✓ |
| **Internal** note | ✓ | ✓ | **never** |
| **Shared** note | ✓ | ✓ | read |
| Edit and delete a note | ✓ | (Security C3) the author **and** the student in their current scope. A former mentor, after a mentor change, does not see even their earlier notes | — |
| Edit the review text (`PATCH /reviews/:id`, up to 24 hours) | ✓ | (Security C3) the reviewer of that review **and** in scope | — |
| File timeline | ✓ | ✓ | — (in 0.1) |
| Reminder | for themselves and anyone | only for themselves, about students in scope | — |
| "Today", "Stuck", kanban | all (with mentor filter) | in scope | — |
| Health, reasons, flags, snooze | ✓ | ✓ | **never** |
| Question: create | — | — | ✓ |
| Question: reply, close | ✓ | ✓ (in scope, or when they are the `assignee`) | next message, close (own) |
| Question: change the person responsible for the reply | ✓ | — | — |
| Check-in: submit | — | — | ✓ |
| Check-in: view | ✓ | ✓ | own |
| Milestone: propose | — | — | ✓ |
| Milestone: record directly, approve, reject | ✓ | ✓ | — |
| North Star dashboard | ✓ | — | — |
| Settings (stages, platforms, milestone types, task templates, thresholds, canned responses) | ✓ | read the lists | read stages and platforms |
| CSV export, bulk import | ✓ | — | — |
| Attachment | as much as access to the parent | same | same |

**Note on questions:** a mentor who is the person responsible for replying (`assignee`) to a question from a student outside their scope (the admin delegated it) sees **only that thread** and the file summary next to it (F8), not the whole file. (Security C3) The file summary (`GET /students/:id/summary`) is allowed for such a mentor only as long as the student has **at least one open thread** (`status IN ('open','answered')`) with `assignee_id = actor.userId`. When the last thread is closed, `404`.

**Write access also checks the scope at the moment of the request** (Security C3): "being the author" or "being the reviewer" alone does not grant access. The condition is always "role/authorship **and** the current scope", so that a mentor who has had the student taken away cannot act with ids they saw before.

**Sessions:** `GET /auth/sessions` and `DELETE /auth/sessions/:id` only with the condition `user_id = actor.userId`; another user's session → `404`.

**Mentor change:** when `primary_mentor_id` changes, the previous mentor's access is cut immediately. Their open reminders about that student are moved to the new mentor and open questions are reassigned to the new mentor (all in one transaction, with the event `mentor.changed`).

### 3. Structural separation of internal fields
1. **Separate DTOs:** the student view has its own types (`SelfStudentDTO`, `StudentTaskDTO`, `StudentQuestionDTO`, `SharedNoteDTO`) that **do not have at all** the fields `health`, `flags`, `reviewer_id`, `notes(internal)`. Conversion is done with an explicit function (`toStudentTaskDTO`), not by "removing a field" from the full object.
2. **One function for the student's notes:** `notes.repo.listSharedNotesForStudent(studentId)` is the only way to read `notes` in student routes and it contains the condition `visibility='shared' AND deleted_at IS NULL` inside itself.
3. **Separate routes:** the folder `app/(student)` and `api/v1/me/**` import only the `*.forStudent()` services. A lint rule (Biome `noRestrictedImports` or a simple import test) blocks importing the `health` and `notes.internal` modules in these routes.
4. **RSC pages** also read from the same services; so page access and API access are the same.

### 4. Mandatory tests (acceptance criterion of F5; owner: qa-engineer with backend-engineer)
1. **Automated matrix:** the list of all endpoints (from a file `routes.manifest.ts`) × roles × expected status code. If a new endpoint is not added to the manifest, the test fails. The roles (Security C3, T-MATRIX): **A**, **M-owner**, **M-non-owner**, **M-former** (the mentor before the mentor change), **M-assignee** (responsible for a question outside scope; with an open thread and after it is closed), **S-owner**, **S-other**, **no session**, **deactivated user with an old cookie**, **`invited` user**. For single resources, the id of another student's resource and the id of a nonexistent resource must give **one** response (`404` with an identical body).
1. **Referenced ids (Security C3, T-REF):** for each row of the table in section 1-1, one negative case (e.g. another student's `profileId`, another student's `taskId`, another user's or `linked` `attachmentIds`, `reviewerId` = a student's id, `studentIds` with one member outside the scope → `422` and **no** row is created).
1. **Privilege escalation (Security C3, T-ESC):** a mentor `POST /users/:id/invite-link` for an `invited` user with the role `admin` and `mentor` → `404`; a mentor `PATCH /users/:id/role` → `403`; a student `PATCH /me/student { primaryMentorId }` → `422`; a student `POST /me/milestones { status: 'approved' }` → `422`.
2. **Internal-note canary test:** an internal note, a flag and a health reason are created with a unique string (e.g. `CANARY-7f3a`). Then **all** student-side GET endpoints and student-side HTML pages are called and it is verified that this string is in no response.
3. **Mentor-change test:** after a mentor change, the former mentor gets `404` for all of that student's resources.
4. **`mentorScope='all'` test:** when the setting is changed, the mentor sees everyone, and after reverting, no longer does.

### 5. Audit logging
Sensitive actions are recorded in `audit_log`: role change, deactivation, reset link, mentor change, settings change, CSV export, bulk import. (Aligned with the code, sprints 1 to 4) In addition: `user.invite_link_created`, `auth.token_revoked_mismatch`, `auth.locked` (only the mobile layers of an existing account; the IP lock is only logged), `note.visibility_changed`, `question.assignee_changed`, `export.milestones`, running `admin/health/recompute`, `user.erased`.

### 6. Alignment with the implementation (aligned with the code, sprints 1 to 4)
| # | Topic | What was built | Architecture verdict |
|---|---|---|---|
| 6-1 | **`access` reads other tables** | `modules/access/repo.ts` reads the tables `students`, `platform_profiles`, `tasks`, `submissions`, `reviews` and (sprints 3 and 4) `notes`, `attachments`, `question_threads`, `question_messages`, `milestones`, `checkins` and `student_flags` **directly and read-only** (the resolvers `loadInScope` and `assertRefs`). Reason: `students → identity → access`; going through the services creates an import cycle (sprint 2, assumption 1) | **Accepted** as the third read-model after `today` and `health` (`overview.md` section 3 and `tech-stack.md` rule 3 were corrected). Condition: SELECT only, only the columns needed to find `student_id` and the status; never writing |
| 6-2 | **The `students` repo has JOINs for display** | A read-only JOIN with `users`, `stages`, `tracks`, `platforms` for name, mobile number, account status | **Accepted**; writing is always in the module that owns the table |
| 6-3 | **A mentor recreating the invite link** | Does not depend on `mentorsCanInviteStudents` | **Accepted.** The setting only controls "creating a new user"; recreating the link for an existing student in scope does not create a new user. The C3 condition (`role='student'`, `invited`, in scope) is enforced unchanged |
| 6-4 | **Review by any staff member in scope** | `POST /submissions/:id/review` for any A or M in scope, not only `tasks.reviewer_id`; editing the text (`PATCH /reviews/:id`) only by the reviewer of that review or the admin, with the 24-hour window applying to the admin too | **Accepted**; consistent with the matrix in section 2 ("review a submission: M ✓") |
| 6-5 | **Reviewer name for the student** | `StudentReviewDTO.reviewer = { displayName }` (sprint 4). `reviewerId` and any staff id are still not in the student DTO (strict T-DTO test) | **Accepted**, equivalent to `SharedNoteDTO.author.displayName`. Item 3-1 ("do not have `reviewer_id`") is still true. Reported to security-reviewer: F-07 |
| 6-6 | **`GET /tasks`** (sprint 4) | Cross-student task list with `staffStudentScope` in SQL; the filters `mentorId`, `reviewerId`, `studentId` are AND-ed with the scope | Consistent with sections 1 and 1-1 (read filter) |
| 6-7 | **M-assignee and attachments** (sprint 4) | An assignee outside the scope sees the thread, the `summary` and the attachments of that thread's messages only while the thread is open/answered; the rest of the file is `404` | Consistent with section 2 (note on questions) |
| 6-8 | **Import lint for student routes** (section 3 item 3) | The Biome `noRestrictedImports` rule has **not yet been added** (`biome.json` was outside the backend boundary). Today the separation is guaranteed by the separate DTOs and the canary test | **Required and a deployment blocker:** F-03 |
| 6-9 | **T-MATRIX matrix** | All 93 manifest routes × 6 states (A, M, S, no session, deactivated with an old cookie, `invited`) + separate tests for M-owner, M-non-owner, M-former, M-assignee, S-owner, S-other | Consistent with section 4. The T-ESC test for `PATCH /users/:id/role` does not run until that route is built (F-02) |

## Consequences
- **Positive:** one place for the rules; the page and the API are consistent; leaking an internal field to the student is structurally impossible and provable with the canary test.
- **Negative:** we have no defensive layer in the database. If someone forgets the scope condition in service code, only the matrix test catches it. So the matrix test is **part of CI and blocks merge**.
- **1.0:** with the addition of the worker and the AI tools, RLS (at least on `notes` and `student_health`) will be revisited. The mentor's access to the AI output of their own students (PRD section 5) uses this same `staffStudentScope`.

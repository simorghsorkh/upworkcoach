# Sprint 3 — Delivery notes

> Phase 4, version 0.1 "Coach Office". Each role writes its own section.

---

## Backend (backend-engineer) — 29 Mehr 1405 (2026-10-21)

**Scope:** tasks, submissions, reviews and extensions (F4); notes and timeline (F5); reminders and "Today" (F6); image attachments (C4); CSV import and export (F11, Should); account erasure for the new tables (ADR-0010). Reference: `data-model.md` 2-2 to 2-7 and 3-1, `api.md` sections 6, 7, 8, 13, 14.

### Endpoints (`/api/v1`) — 37 new entries in `routes.manifest.ts`
| Method and path | Role | Note |
|---|---|---|
| `GET/POST /students/:id/tasks` | A, M in scope | Create: `templateId` fills empty fields; `dueDate` → 23:59:59 Tehran; default reviewer = active primary mentor, otherwise the actor; past due date → `422` |
| `POST /tasks/bulk` | A, M | One student out of scope → `422` and no task is created; shared `batchId` |
| `GET /tasks/:id` | A, M in scope; S own only | `switch` on role (SEC-A5): staff get `StaffTaskDetailDTO`, student gets `StudentTaskDTO` |
| `PATCH /tasks/:id` | A, M | Due date cannot be changed through this route (`dueDate` → `422`); `ifUpdatedAt` |
| `POST /tasks/:id/extend`, `/cancel` | A, M | Reason required; extension only to a date after the current due date and in a non-final status |
| `POST /tasks/:id/start`, `/submissions` | S | New version; checkbox goes straight to `accepted`; atomic attachments (C4); profile snapshot taken from the task itself |
| `POST /submissions/:id/review` | A, M in scope | Latest version only and only `submitted`; `changes_requested` → `revisionCount + 1`; response = task detail |
| `PATCH /reviews/:id` | A; M who is the reviewer of that review and in scope | Text and score only, up to 24 hours (`409` after that) |
| `GET /review-queue` | A, M | Scope enforced in SQL; `mentorId` = reviewer; business-hours SLA |
| `GET/POST /task-templates`, `PATCH /task-templates/:id` | read A, M; write A | Deactivate with `isActive: false` |
| `GET /me/tasks` | S | Overdue first, then due date; cancelled only with `?status=cancelled` |
| `GET/POST /students/:id/notes` | A, M in scope | Default `internal`; future `occurredAt` → `422` |
| `PATCH/DELETE /notes/:id` | A; M who is the author and in current scope | internal → shared recorded in `audit_log(note.visibility_changed)`; soft delete |
| `GET /me/shared-notes` | S | The only note route for the student |
| `GET /students/:id/timeline` | A, M in scope | Events + notes, newest first; `types=` categories; `refs` for stage and user names |
| `GET/POST /reminders`, `PATCH/DELETE /reminders/:id`, `POST …/done`, `…/snooze` | A, M | M only their own reminders and students in scope; A for any active staff member |
| `GET /today` | A, M | Today's and past reminders, review queue with SLA, `unansweredQuestions: []`, `stuckStudents: []`, `waitingOnUs`, `counts` |
| `POST /attachments` | * | multipart; size cap before buffering; type from content; re-encoding without EXIF; quota 20/100 |
| `GET /attachments/:id` | parent's access; `pending` only the uploader | SEC-U6 headers |
| `POST /imports/students` | A | CSV UTF-8, 1 MB, 500 rows; `dryRun` by default |
| `GET /exports/students.csv`, `/exports/tasks.csv` | A | BOM, formula neutralization, mobile `0912…`, `audit_log` |

### Tables and migration
`apps/web/drizzle/0003_tasks_timeline_reminders.sql` (drizzle-kit, reviewed): `task_templates`, `tasks` (CHECK on cancel reason and `closed_at` consistency, data-model indexes), `task_extensions`, `submissions` (unique `(task_id, version)`, consent CHECK), `reviews` (unique `submission_id`, score 1..5), `attachments` (CHECK "`pending` ⇔ no parent, `linked` ⇔ exactly one parent"; the `question_message_id`/`milestone_id` columns have no FK until sprint 4), `notes`, `timeline_events`, `reminders` (unique `system_key`). Plus the manual FK `profile_snapshots.source_submission_id`. Seed: 16 default stage task templates with `suggestOnStageEntry`.

### Code structure
- `lib/tehran-day` (end/start of day, wall-clock hour, `addDays`, weekday, `jalaliDate`), `lib/business-hours` (`elapsedBusinessHours`, `slaState`), `lib/csv` (`toSafeCsvCell`, `toCsv`).
- `modules/tasks`: schema, contracts, policy (pure state machine), repo, `counts.ts` (counters for students, cycle-free), `erasure.ts`, service.
- `modules/files`: schema, `image.ts` (sharp, queue of 2), repo, service (`linkAttachmentsToSubmission`, `cleanupPendingAttachments`). Job `files.cleanup` (03:45 Tehran) registered.
- `modules/timeline`: schema, **the body of `recordTimelineEvent`** (all sprint 2 events are now stored), repo (`listSharedNotesForStudent` is the only student-facing function), service, `erasure.ts`.
- `modules/reminders`, `modules/today` (read model), `modules/admin/csv-export.ts` and `student-import.ts` (separate files so `admin/service` stays cycle-free).
- `access`: resolvers for `task`, `submission`, `review` (two-layer), `note`, `attachment`; `template` ref in `assertRefs`.
- `students`: real task counts in the list, file and summary; `initialNote`; reminder transfer on mentor change; system reminder one day before a pause ends (cancelled when the pause is exited). `path`: real `suggestedTemplates`.
- `server/http`: `route({ multipart: true })`, `readBodyBytes`, `parseMultipart`, binary `raw` response; `isoInstantInput`, `requiredLongText`, `englishText`; `sla`, `business_hours`, `tasks` settings in the catalog.
- `admin:erase-user`: tasks, submissions, reviews, extensions, notes (hard delete), `timeline_events.data = {}`, reminders, attachments (file after commit; failure → old `pending` row that `files.cleanup` retries). A staff member with an open reminder → rejected.

### Command results (real runs, after the last change)
| Command | Result |
|---|---|
| `pnpm lint` | clean (342 files) |
| `pnpm typecheck` | clean |
| `pnpm test` | 49 files, **979 tests green**: unit 295 (32 files, including the frontend component tests) and integration 684 (17 files) |
| `pnpm build` | success; 62 API routes, all dynamic |
| Real smoke run | Temporary Postgres 55433 + `next start` on 3100 (production): migrate + seed (16 templates), seed again (0), `admin:create`, invite acceptance with Persian digits, `POST /students` with `initialNote`, student acceptance, task, **JPEG upload with sharp in the real build** and download without EXIF, submission with attachment, `/today`, review, `/me/shared-notes` without internal notes, timeline, reminder, `403` without Origin, `students.csv`. Both processes were shut down |

**New tests:** unit — task state machine (full action × status table), overdue and overdue days, student ordering, submission validity, 24-hour window, business hours and SLA, Tehran day and Jalali, CSV injection, sharp (EXIF, rotation, 4096, HTML/SVG/GIF → 415, 40-megapixel bomb → 422), file name sanitization, timeline categories, snooze. Integration — `tasks.test.ts` (full cycle through the API, T-REF, atomic bulk, T-DTO with strict schema, other-S/other-M with an identical `404` body, counters, review queue, suggested template), `attachments.test.ts` (C4, headers, quota, cleanup), `notes-timeline.test.ts` (**internal-note canary on every student GET**, former M, visibility audit, timeline filter and cursor), `reminders-today.test.ts`, `erasure-sprint3.test.ts`, `csv.test.ts`; and T-MATRIX and T-CSRF for all 37 new endpoints.

### Assumptions (for software-architect and security-reviewer review)
1. **`kind` and `submissionType`** are optional when creating a task (default `custom` and `text`, or taken from the template); `title` is required without a template. `dueDate` is optional: the template's days, otherwise `settings.tasks.defaultDueDays` (3).
2. **A past due date** is not accepted on creation or extension; an extension only goes to a date after the current due date.
3. **`overdueDays`** = Tehran calendar days after the due date (minimum 1).
4. **Submission:** `text` requires text, `link` a link, `file` an attachment, and `profile_review` showcase text; proposal or showcase fields on another type → `422`. A checkbox also records a submission version (history).
5. **Any staff member in scope** can review (not just `reviewerId`); editing the review text is limited to the reviewer of that review or an admin. The 24-hour window applies to the admin too.
6. **`/me/tasks`** is a light list (`latestReview`) and `GET /tasks/:id` gives full detail with all versions and feedback; the student sees their own proposal text and consent. They do not see the cancel reason.
7. **`cancel_reason` on account erasure** gets `'[حذف شد]'` ("[deleted]") instead of `null` so the "cancel reason required" CHECK does not break (same rule as `task_extensions`).
8. **`GET /attachments/:id`** has `Cache-Control: private, no-store` (stricter than `no-cache` in api.md 14; same effect without an ETag).
9. **snooze** is computed from the later of "now" and "the reminder's current time". Marking a reminder "done" twice returns `200`.
10. **Admin "Today" without `mentorId`** shows everyone's reminders (F6); an admin's `GET /reminders` without `ownerId` shows only their own.
11. **The review queue** measures all reviews against `reviewHours` (48) (the gate 48 / non-gate 72 split in mentor-workflow is not yet in `settings.sla`).
12. **Changing a mentor to "no mentor":** the previous mentor's open reminders are transferred to the acting admin.
13. **CSV import:** columns in Persian or English; stage by `displayCode` (Persian or Latin digits) or name; mentor by mobile or name; **due date Gregorian only, `YYYY-MM-DD`** (ADR-0008 rule: the API does not accept Jalali dates). A real run saves only valid rows and each row has its own transaction.
14. `timeline_events.data` follows the same rule as `audit_log` (token/url/link/… key → error). The task title is stored in `task.created` (erased with the account).

### Open questions (for software-architect)
- **Jalali dates in the imported CSV file:** the founder probably writes due dates in Excel as Jalali. Proposal: convert `1405/08/01` only in the import path (documented exception to ADR-0008) or an Excel template with a Gregorian column.
- **Gate/non-gate review SLA** (48/72 hours in mentor-workflow): add `reviewHoursNonGate` to `settings.sla`?
- **The `question_message_id` and `milestone_id` columns** in `attachments` currently have no FK; sprint 4 adds the FK.

### Remaining work
- [ ] Sprint 4: `question_threads` (the "Today" questions section, `waitingOnUs` of type `question`, assignee mode in summary, question transfer on mentor change, precondition for staff deletion), health (`stuckStudents`, `red_no_action`, `health` in the DTOs and recalculation after every task transition), `milestones` (attachment and `milestones.csv`).
- [ ] `GET/PUT /settings` (so `sla`, `business_hours` and `tasks` can be changed from the UI).
- [ ] Biome `noRestrictedImports` rule for student routes and full T-LOG (upload and CSV) — carried over from sprint 1.
- [ ] A `413` test with a declared `Content-Length` for multipart (the test helper overrides it; the JSON route has a test with the same `readBodyBytes`).
- [ ] No migration was run on the 5432 database: before viewing the sprint 3 pages, `pnpm db:migrate` is needed (`0003` + 16 templates).

---

## Frontend guide (for frontend-engineer)

The general rules are the same as sprint 2: RSC calls the service function directly with `toActor(user)`; writes only via `fetch` to the API (Server Actions are forbidden); take DTOs with `import type` from `@/modules/*/contracts`; never import `service` into a client component. Errors are `ApiError` with `code` and a Persian message; `422` with `error.fields`. All times are ISO with `Z`; days are Gregorian `YYYY-MM-DD` (= Tehran day); Jalali conversion is done by the UI.

### Service functions for RSC pages
| Page | Function (module) | Output |
|---|---|---|
| M "Today" `/today` | `getToday(actor, { mentorId? })` (`@/modules/today/service`) | `TodayDTO` (`reminders`, `reviewQueue`, `waitingOnUs`, `counts` for the navigation counter; `unansweredQuestions` and `stuckStudents` are `[]` for now) |
| Review queue | `getReviewQueue(actor, { mentorId? })` (`@/modules/tasks/service`) | `ReviewQueueItemDTO[]` (`slaRemainingHours`, `breached`, `warning`) |
| File: tasks | `listStudentTasks(actor, studentId, { status?, stageId? })` | `StaffTaskDTO[]` |
| Task page (staff) | `getStaffTask(actor, taskId)` | `StaffTaskDetailDTO` (versions newest first, each with `review` and `attachments`; `extensions[]`) |
| Template list | `listTaskTemplates(actor, { stageId?, includeInactive? })` (`@/modules/catalog/service`) | `TaskTemplateDTO[]` |
| File: notes | `listStudentNotes(actor, studentId, { visibility?, kind?, limit?, cursor? })` (`@/modules/timeline/service`) | `NoteListDTO` (`canEdit` for the edit button) |
| File: timeline | `getTimeline(actor, studentId, { types?, limit?, cursor? })` | `TimelineDTO` (`items`, `nextCursor`, `refs.stages`/`refs.users` for names) |
| Reminders `/reminders` | `listReminders(actor, { scope: 'today' \| 'upcoming' \| 'done', ownerId?, studentId? })` (`@/modules/reminders/service`) | `ReminderDTO[]` |
| S "My tasks" `/my/tasks` | `listOwnTasks(actor, { status? })` (`@/modules/tasks/service`) | `StudentTaskListItemDTO[]` (overdue first) |
| S task page | `getOwnTask(actor, taskId)` | `StudentTaskDTO` |
| S home: mentor notes | `listOwnSharedNotes(actor, { limit?, cursor? })` (`@/modules/timeline/service`) | `SharedNoteListDTO` |

`StaffStudentDTO` and `StudentListItemDTO` now have real `openTaskCount`, `overdueTaskCount` and `nextTask`; `StudentSummaryDTO.openTasks` is filled. `health` is still `null`.
Timeline `types`: `note,student,stage,profile,task,question,checkin,milestone,flag,health` (comma-separated; absent = all). Each item has `kind: 'event' | 'note'`, `category`, and for events the raw `data` (for example `stage.changed`: `{ from, to, kind }` with stage ids → `refs.stages[id]`; `task.status_changed`: `{ from, to }`; `review.created`: `{ taskId, version, outcome, score }`).

### Endpoints that client forms call
| Form / action | Request | Body | Success response |
|---|---|---|---|
| New task | `POST /api/v1/students/{id}/tasks` | `{ title?, description?, kind?, submissionType?, stageId?, requiredForGate?, priority?, dueDate?, reviewerId?, templateId?, profileId? }` | `201 StaffTaskDTO` |
| Bulk task | `POST /api/v1/tasks/bulk` | `{ studentIds[], templateId? \| title…, dueDate? }` | `201 { batchId, created, taskIds }` |
| Edit task | `PATCH /api/v1/tasks/{id}` | `{ title?, description?, priority?, reviewerId?, stageId?, requiredForGate?, ifUpdatedAt? }` | `200 StaffTaskDTO` |
| Extend | `POST /api/v1/tasks/{id}/extend` | `{ newDueDate, reason }` | `200 StaffTaskDTO` |
| Cancel | `POST /api/v1/tasks/{id}/cancel` | `{ reason }` | `200 StaffTaskDTO`; final → `409 INVALID_TRANSITION` |
| Review | `POST /api/v1/submissions/{id}/review` | `{ outcome: 'accepted' \| 'changes_requested', feedbackText, score?: 1..5 }` | `201 StaffTaskDetailDTO` |
| Correct feedback (24 hours) | `PATCH /api/v1/reviews/{id}` | `{ feedbackText?, score? }` | `200 StaffReviewDTO`; late → `409` (only when `review.editable`) |
| Task template (admin) | `POST /api/v1/task-templates`, `PATCH /api/v1/task-templates/{id}` | `{ title, stageId?, description?, kind?, submissionType?, defaultDueDays?, requiredForGate?, suggestOnStageEntry?, sortOrder?, isActive? }` | `201/200 TaskTemplateDTO` |
| S start | `POST /api/v1/tasks/{id}/start` | — | `200 StudentTaskDTO` |
| S image upload | `POST /api/v1/attachments` | `multipart/form-data` with `file` (FormData; do not set `Content-Type` manually) | `201 { id, mimeType, sizeBytes, width, height, originalName, href, status: 'pending' }`; `413`, `415`, `422`, `429` |
| S submit | `POST /api/v1/tasks/{id}/submissions` | `{ bodyText?, links?: [{url, label?}], attachmentIds?, platformId?, jobPostText?, proposalText?, profileText?, aiUseConsent? }` | `201 SubmissionCreatedDTO = { id, version, createdAt, task: { id, status } }` |
| Note | `POST /api/v1/students/{id}/notes` | `{ body, kind?, visibility?: 'internal' \| 'shared', tags?, occurredAt? }` | `201 NoteDTO` |
| Edit/delete note | `PATCH` / `DELETE /api/v1/notes/{id}` | `{ body?, kind?, visibility?, tags?, occurredAt?, ifUpdatedAt? }` | `200 NoteDTO` / `204` |
| Reminder | `POST /api/v1/reminders` | `{ text, dueDate \| dueAt, studentId?, ownerId? (admin only) }` | `201 ReminderDTO` |
| Edit/done/snooze/delete | `PATCH /api/v1/reminders/{id}`, `POST …/done`, `POST …/snooze` (`{ days: 1 \| 3 \| 7 }`), `DELETE …` | — | `200 ReminderDTO` / `204` |
| CSV import (admin) | `POST /api/v1/imports/students` | multipart: `file`, `dryRun` (`'true'` default, `'false'` saves) | `200 { dryRun, total, valid, imported, rows: [{ line, ok, errors: [{column, message}], studentId?, inviteUrl? }] }` |
| CSV export (admin) | link `GET /api/v1/exports/students.csv` and `/exports/tasks.csv` | — | file download |

**UI notes:**
- Show the attached image with `<img src={a.href}>` (same origin, the session cookie is sent). Next to the evidence upload: "Cover the client's name and photo" (SEC-F7).
- Proposal submission form: separate platform, job post text and proposal fields with `dir="ltr" lang="en"`, and the consent checkbox **off by default**.
- `visibility: 'shared'`, feedback and the task description get the label "The student sees this"; converting internal → shared gets a confirmation dialog (SEC-F6).
- `overdue`/`overdueDays` get a red "Overdue" label; the student sees no health or reason.
- `suggestedTemplates` in the `PUT /students/{id}/stage` response is now filled (`TaskTemplateDTO[]`); the "Create these tasks" button uses `POST /students/{id}/tasks { templateId }` for each one.
- `counts` in `TodayDTO` is for the "Today" counter in the navigation.
- Before the CSV export, the SEC-V3 warning: "This file contains the mobile numbers and profile links of all students; delete it after use." Show the import result (`inviteUrl`s) only there.

---

## Frontend (frontend-engineer) — 29 Mehr 1405 (2026-10-21)

**Scope:** "Today" (M1), tasks and task detail (M5, M5a, M6), reminders (M9), and in the student file (M3): tasks tab, note composer, full timeline, reminder and "next task". Student side: "My tasks" (S2), task page and submission (S3), and shared tasks and notes on the home page (S1). Plus CSV import and export (M2b). Visual reference: `mockups/today.html`, `tasks.html`, `task-detail.html`, `student-profile.html`, `student-task.html` and `student-home.html`. All data is real: pages call the service (RSC) and forms write through `fetch` to the API. No Server Action was used.

### Pages
| Page | Route | Note |
|---|---|---|
| M1 Today | `(staff)/today` | A box "Past response time" (from `waitingOnUs` with `breached`, with the `question` and `red_no_action` branches ready). Four number cards, each jumping to its own section. Reminders with "Done" (and "Undo" for 10 seconds) and snooze 1 day, 3 days and 1 week. Submissions in the order late, urgent, then oldest. Questions and stuck students have an empty state; the stuck row is built with `StudentListItemDTO` and sprint 4 only supplies data. The mentor filter is admin-only ("Only my students" and each mentor). The "Today" counter in the navigation comes from `counts` |
| M5 Tasks | `(staff)/tasks` | Tabs: awaiting review, overdue, open and in progress, needs revision, all (each with a counter). Search, type, mentor (admin) and stage are in the URL. Table on desktop and cards on mobile; a late or overdue row has a red line. Row action: "Review", or "Extend deadline" and "Reminder" for overdue tasks |
| M5a New task | dialog over `/tasks` (`?new=1`); `/tasks/new` redirects to it | One or more students (several means `POST /tasks/bulk`), template (grouped by stage) that fills title, description, kind, gate and due date, and six submission types with a guide for each. The description carries the label "The student sees this". The due date uses a Jalali picker. Under "More": stage, gate, urgent and reviewer (admin only) |
| M6 Task detail | `(staff)/tasks/[id]` | Versions as a switch (`?v=`), job post and proposal text in an LTR block with a character count, consent, links and images. Feedback from the previous round is collapsed. Review form: outcome, feedback with a mentor template and a draft that is auto-saved on this device, optional score 1 to 5, and "Submit review and go to next". "Edit feedback" only while `editable`. "Extend deadline" with a reason (warns from the third extension), "Cancel task" with a reason, and "Edit description" (`PATCH` with `ifUpdatedAt`). On mobile these are in the "This task" menu. From the third revision round on, a "15-minute call" warning appears. Side column: task description (acceptance criteria shown separately), "X at a glance", and history |
| M9 Reminders | `(staff)/reminders` | Tabs: today and past, upcoming, done. An admin can see any mentor's reminders. Reminder form: student (optional), text, Jalali day and optional time (no time means 9 AM), and "For" for admins only |
| M3 Student file | `(staff)/students/[id]` | Header: "N open tasks · M overdue" and buttons note, task, reminder and more. Mobile bar: note, task, stage and more. The "Last requested task" tile is real. Tasks tab: open tasks in order (awaiting review, then overdue, then due date), and "Accepted and cancelled" collapsed. Timeline: always-open composer (desktop), seven filter chips, "Older items" with a cursor, and an internal note (dashed with a lock) or shared note (indigo with an eye). The author or an admin can edit and delete; converting internal to shared has a confirmation dialog (SEC-F6). This student's reminders are in the side column. `?add=note\|task\|reminder\|stage` opens the matching dialog |
| Stage change | `components/stages/change-stage-dialog.tsx` | "Default tasks for stage N" from `suggestOnStageEntry` templates, as checked checkboxes (both in the file and in the kanban). "X open tasks from the previous stage: keep open / cancel" |
| M2 Students | `(staff)/students` | "Next task" is real ("Overdue · N days" or "Due …", otherwise "No open task"). Admin: "Import from Excel" and "CSV export" with the SEC-V3 warning |
| M2a New student | existing form | "Free-form note" goes to `initialNote` and becomes the first internal note in the file |
| M2b File import | `components/students/csv-tools.tsx` | CSV only, up to 1 MB, with a sample file. First `dryRun` and a table of row, column and problem (no values, SEC-V5), then "Save N students". Invite links are shown only there, with a copy button |
| S1 Home | `(student)/home` | "My tasks" (5 open tasks, overdue first, with "New feedback" and "See feedback") and "From your mentor" (3 fresh shared notes, only from `listOwnSharedNotes`) |
| S2 My tasks | `(student)/my/tasks` | Open and done tabs; overdue in red; no health or reason |
| S3 Task | `(student)/my/tasks/[id]` | Feedback card (text written with the template is split into verdict, strength, fix, example and next step; an English sentence inside quotes goes in an LTR block). "What you need to do" with acceptance criteria. Submission form by type: text, link (https only) and image (JPG, PNG and WebP up to 5 MB; first `POST /attachments` with a preview and upload status, and the warning "Cover the client's name and photo"). For "Proposal for review": platform, job post text and proposal with `dir="ltr" lang="en"`, and consent that is **off by default**. "Checkbox only" means a "I did it" button. The next version is pre-filled from the previous version and the text stays on the device until it is sent. "I started" for an open task. Previous versions and feedback are collapsed. "Question about this task" and "I need more time" (= extension request, per UX a question) are **coming soon** until the questions module |

States: every new route has `loading.tsx` and `error.tsx`; task detail (staff and student) also has `not-found.tsx`, and nonexistent and out-of-scope get the same response. All sections have an empty state. Buttons have a spinner and label while saving, and image upload shows progress.

### New components
- `components/ui/jalali-date-field.tsx`: **a Jalali date picker with no new dependency**. Typing "۱۴۰۵/۰۸/۰۱" (1405/08/01, with Persian or Latin digits), a monthly calendar starting on Saturday (arrow keys in RTL, Esc, and a full `aria-label` on every day), shortcuts, `min`, and reading the date as "پنجشنبه ۳۰ مهر ۱۴۰۵ · ۳ روز دیگر" (Thursday 30 Mehr 1405 · 3 days from now). The output value is always the Gregorian day `YYYY-MM-DD` (ADR-0008). Calendar computation comes from `lib/jalali` (the same one the backend import uses) and `components/format/jalali.ts` only adds text, input parsing and the month grid.
- `components/ui/choice.tsx`: `RadioCards`, `ChipButton`, `Rating` and `MenuButton` (snooze menu).
- `components/tasks/*` (task form, review, submission, actions, table, queue, badges and labels), `notes/*` (composer, dialog and timeline), `reminders/*`, `students/student-picker.tsx` (student search combobox, two characters are enough), `students/csv-tools.tsx`, and `shell/quick-add.tsx`.
- The bottom bar "+" is now `QuickAddProvider`: in a file it is "Add for X" (student pre-selected) and the note opens right there; elsewhere the student is searched first. The desktop "Add" button in "Today" opens the same dialog.
- `api/client.ts`: `apiUpload` (multipart, without touching `Content-Type`).
- `format/fa.ts`: `faTime`, `faDayTime`, `faHours`, `faAgo` and `faDaysLeft`.

### Tests
- **Component (20 new tests):** `format/jalali.test.ts` (every day from 1395 to 1415 in both directions against `Intl` with the persian calendar; input parsing), `tasks/task-form.test.ts` (validation, default due date and shortcut, a date typed with Persian digits and rejection of a past date, template, bulk, 422), `tasks/review-form.test.ts` (template and SEC-F6, required outcome and feedback, revision request with score and going to next, acceptance without a score, draft and 409), `notes/note-form.test.ts` (internal by default, shared with label, remembering the kind, session template and follow-up reminder, 503 failure keeping the text with "Try again", **text typed while saving is not cleared**, and "+ Task from this note").
- **e2e with the real backend:** `tests/e2e/tasks-flow.spec.ts` at 1440 and 375:
  1. The coach creates a "Proposal for review" task from the file with a Jalali due date; the student sees it at home and submits it with the LTR fields and consent off; the coach reviews from "Today" and requests a revision; the student sees the feedback and submits version 2 (pre-filled from version 1); the coach accepts; the student sees "Accepted".
  2. An internal note (composer on desktop; action bar and "+" on mobile) and a shared note. The internal canary appears on no student page and not in `/api/v1/me/shared-notes`; the shared note is on the home page.
  
  `students-flow.spec.ts` was also updated: CSV import (row error in dryRun) and the export warning. The expectation "no health badge" on the staff file was replaced with a health badge, because the sprint 4 backend calculates health. The check "the student sees no health" stayed in place.

### Command results (real runs, after the last change)
| Command | Result |
|---|---|
| `pnpm lint` | 449 files; frontend and e2e files are clean. The only error is the backend's: formatting of `tests/integration/students-access.test.ts` |
| `pnpm typecheck` | clean |
| `pnpm test` | 62 files, **1405 tests green**. One sprint 2 component test (`new-student-form`, "optional details") took 5048 ms under full-suite load (limit 5000); with the "Free-form note" field added it types one more field, so that test's timeout was raised to 15 seconds |
| `pnpm build` | success; all routes dynamic. (It failed once earlier because of a type error in the backend file being built, `src/modules/health/sprint4-helpers.test.ts`; green after the backend fixed it) |
| `pnpm test:e2e` | **30 of 30 green** (15 tests × two sizes) |

**Browser check** (Chromium, 1440 and 375, with real data on the temporary e2e database and server 3100): today, tasks, task detail, new task dialog with the calendar open, reminders, file, students, and the student side (home, my tasks and task page). These problems were found and fixed:
- The "Today" header date was garbled by Chrome's Latin comma (`faFullDate`).
- The lines "-" and "1." in the feedback template were left-aligned (`dir="auto"` changed to `rtl`).
- A reminder in the narrow file column took three lines (`compact` mode).
- Task table cells broke at 1440.
- Version 1 feedback was hidden from the student after version 2 was submitted.
- **A real bug:** if the coach typed the next note while the previous note was saving, the new text was cleared. Now only the text that was sent is cleared, and this behavior has a test.

Postgres on 5432 and server 3000 were not touched and no process was left open.

### Deviations from the mockup and why
| Item | Decision | Reason |
|---|---|---|
| "Next version due date" in the review form | absent | `POST /submissions/:id/review` takes no due date (gap 3). The coach uses "Extend deadline" |
| "Reza's feedback" on the student page | "Mentor feedback" | `StudentReviewDTO` has no reviewer name (gap 2) |
| Student "Save draft" | auto-save on the device | The API has no drafts; the text stays in `localStorage` |
| "R-LOOP" badge and health in the task header | round 3 warning from `revisionCount` | Per-task health is not in the task DTO |
| "Task templates" in the M5 header | absent | Template editing (admin) moved to the backlog; its API is ready |
| Box "X is stuck; this note is a logged action" in the note dialog | absent | Belongs to flow 7 and sprint 4 health |
| Questions in "Today" and the file, student "extension request" | empty state or "coming soon" | Questions module (sprint 4) |
| "New feedback" | feedback less than 3 days old on a task where it is the student's turn | Read or unread is not recorded |

### Frontend gaps (for backend-engineer)
1. **There is no endpoint that lists tasks across students.** M5 is built with `listStudents` (following `openTaskCount > 0`) and then `listStudentTasks` for each student (6 at a time); the "All" tab reads all students (`app/(staff)/_data.ts`, `listScopeTasks`). Proposal: `GET /tasks?status=&mentorId=&stageId=&type=&q=&cursor=` with `counts`.
2. **`StudentReviewDTO` has no reviewer name**, so the feedback card says "Mentor feedback". Proposal: `reviewer: { displayName }`.
3. **`reviewInput` has no `nextDueDate` field** ("Next version due date" in the M6 mockup and user-flows 4).
4. **Suggested tasks are not atomic on stage change.** After `PUT /stage` the dialog sends one `POST /students/:id/tasks` per template and one `/cancel` per old task. If one fails it shows a message but does not roll back. Proposal: `PUT /students/:id/stage` with `{ createTemplateIds?, cancelOpenTaskIds? }`.
5. `ReviewQueueItemDTO` lacks the `submissionType` and `dueAt` fields (in M5 they are filled from the task list).
6. The data of `profile.updated` and `profile.approved` events has no platform name; for a deleted showcase the timeline only writes "Showcase".
7. `TodayDTO.unansweredQuestions` is still of type `never`; once its type is defined, the questions section rows in `today/page.tsx` (`QuestionRows`) will be built.

### Remaining work
- [ ] Sprint 4: questions (queue, thread, "Today" section, "Question about this task" and "extension request"), stuck rows with reason and "ball", the "logged action" box in the note, and milestones.
- [ ] Editing task templates in settings (admin).
- [ ] "Next version due date" in the review, after gap 3.
- [ ] Replace `listScopeTasks` with the endpoint from gap 1 (performance for more than a few hundred students).
- [ ] `N` shortcut for the composer and `/` for search (carried over from sprint 2).
- [ ] devops-engineer review of the `playwright.config.ts` change (carried over from sprint 2).

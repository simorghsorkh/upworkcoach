# Sprint 4 — Delivery notes

> Phase 4, version 0.1 "Coach Office". Each role writes its own section.

---

## Backend (backend-engineer) — 29 Mehr 1405 (2026-10-21)

**Scope:** health status and flags (F7, ADR-0005), questions and answers (F8), weekly check-in (Should, decision E5 = on), milestones and North Star (F9), full "Today", settings (F11), the sprint 2 frontend gaps, Jalali dates in CSV import, account erasure for the new tables, the internal jobs endpoint. Reference: `data-model.md` 2-2, 2-8 to 2-11, 4 and 6-2; `api.md` sections 8 to 13 and 15.

### Endpoints (`/api/v1`) — 38 new entries in `routes.manifest.ts`
| Method and path | Role | Note |
|---|---|---|
| `GET /students/:id/health` | A, M in scope | `HealthDetailDTO`; if not yet computed, it is computed on the spot |
| `PUT`, `DELETE /students/:id/health/snooze` | A, M in scope | `{ until: 'YYYY-MM-DD', reason }` → until the end of that Tehran day, at most one year; today or earlier → `422`; event `health.snoozed` |
| `GET`, `POST /students/:id/flags` | A, M in scope | `active=1`; `expiresAt` day or instant, past → `422`; recomputes health |
| `POST /flags/:id/clear` | A, M in scope | Repeat has no effect (`200`) |
| `GET /stuck` | A, M | `level`, `includeSnoozed`, `mentorId` (A only); `StudentListItemDTO[]`, red → yellow, then oldest status; `active` only |
| `POST /admin/health/recompute` | A | `{ studentId? }`; without it, a full sweep; `audit_log` |
| `GET /questions` | A, M | Scope **or** me as assignee (open/answered only); `status`, `awaiting`, `assigneeId` (A), `studentId`, cursor; "waiting on the team" first with the oldest SLA |
| `GET`, `POST /me/questions` | S | `{ subject, body, links?, attachmentIds?, taskId?, priority? }`; assignee = active primary mentor, otherwise the first active admin |
| `GET /questions/:id` | A, M (scope or assignee while open), S own only | `switch` on role (SEC-A5); staff also get `studentSummary` |
| `POST /questions/:id/messages` | same | `cannedResponseId` staff only (student → `422`); staff on a closed thread → `409`; a student message reopens a closed thread |
| `POST /questions/:id/close` | same | — |
| `PUT /questions/:id/assignee` | A | Active staff only (C3); `audit_log(question.assignee_changed)` |
| `GET /canned-responses`; `POST`, `PATCH /canned-responses/:id` | read A, M; write A | seed: "Red lines" |
| `GET /me/checkins/current`, `POST /me/checkins` | S | A second one in the same week → `409`; `needsHelp` → a question with `source=checkin` in the same transaction |
| `GET /students/:id/checkins` | A, M in scope | cursor; with check-in off, all check-in routes → `404` |
| `GET /milestone-types`; `POST`, `PATCH /milestone-types/:id` | read all; write A | — |
| `GET`, `POST /students/:id/milestones` | A, M in scope | Staff entries are directly `approved` |
| `GET`, `POST /me/milestones` | S | Proposal (`proposed`); `status` in the body → `422` (T-ESC); `requiresEvidence` type without text or image → `422`; rejected ones are not in the GET |
| `POST /milestones/:id/approve`, `/reject` | A, M in scope | Only from `proposed`; a second approval of a `uniquePerStudent` type → `409` (row lock on `students`) |
| `GET /dashboard/north-star` | A | `from`/`to`; default current Jalali month |
| `GET /exports/milestones.csv` | A | No evidence text; `audit_log(export.milestones)` |
| `GET`, `PUT /settings`; `PUT /settings/:key` | A | All keys with `value`, `version` (0 = default); PUT of any subset in one transaction; unknown key → `404`; `health.rules` and `checkin` → immediate sweep |
| `GET /settings/public` | * | `questions.expectedResponseText`, `checkin` |
| `GET /settings/staff` | A, M | Plus `access` and the SLA thresholds (gap 5) |
| `GET /students/tags` | A, M | Scope tags with counts (gap 1) |

Outside `/api/v1`: `POST /api/internal/jobs/:name` (ADR-0007, SEC-J1..J3): always `404` except with `JOBS_MODE=http-trigger`; `X-Job-Secret` constant-time on SHA-256, wrong → `404` and a warning log; only registered names (`health.sweep`, `auth.cleanup`, `files.cleanup`); body ignored; 60 per hour. A secret shorter than 32 prevents the app from starting (`env.ts` + `instrumentation.ts`).

### Changes to existing endpoints (field additions only)
- `StudentListItemDTO`: real `health`, `overExpected`, `stage.sortOrder` and `stage.isActive`. `StudentListDTO.counts` (`total`, `byLifecycle`, `byHealth`). `GET /students` now accepts `health=` (one or several, comma-separated) and `sort=health`.
- `StaffStudentDTO`: real `health`, `stage.sortOrder`, `stage.isActive`.
- `BoardStudentDTO`: `health` and `accountStatus`; `GET /board?health=`.
- `HealthSummaryDTO` = `{ status, reasons[{rule, level, ball, facts}], churnRisk, snoozedUntil, ball, statusSince, computedAt }` (the previous fields are the same).
- `TodayDTO`: `unansweredQuestions` (type `StaffQuestionListItemDTO`), `stuckStudents`, and `waitingOnUs` with `question` and `red_no_action` (+ `escalated?`). The previous shape was not touched.
- `409 PHONE_TAKEN` for the admin: `error.data.existingStudentId` (gap 6). `ApiErrorBody.error.data?` is optional.
- `GET /students/:id/summary`: an out-of-scope assignee, as long as they have an open/answered thread (SEC-A8).
- `GET /attachments/:id`: question message and milestone attachments; an out-of-scope assignee only while the thread is open.
- `PATCH /me/student` existed since sprint 2; it now has a new test.

### Tables and migration
`apps/web/drizzle/0004_health_questions_checkins_milestones.sql` (drizzle-kit, reviewed): `milestone_types`, `canned_responses`, `question_threads` (CHECK "closed ⇔ `closed_at`", partial index `awaiting='team'`), `question_messages`, `checkins` (unique `(student_id, week_start)`), `milestones` (reject reason CHECK), `student_flags`, `student_health` (CHECK "red ⇔ `red_since`"), and the FKs `attachments.question_message_id`/`milestone_id`. Seed: 5 milestone types, "Red lines", `settings.checkin = { enabled: true, weekday: 'thu' }`.

### Code structure
- `lib/jalali.ts`: Jalali ↔ Gregorian conversion (breaks table, tested against Intl for 730 days), `parseAnyCalendarDay`, `jalaliMonthRange`.
- `modules/health`: `rules.ts` (**pure function** `evaluateHealth` + `overallBall`, `missedCheckinWeeks`, `lowMoodStreak`), `input-repo.ts` (6 aggregate queries, no N+1), `recompute.ts` (`recomputeHealthSafe` after commit with `pg_advisory_xact_lock`, `sweepAllHealth`), `summary.ts`, `service.ts`.
- Recompute after commit in: student creation, status and stage change, task create/extend/cancel/start/submit/review, flag, check-in, student message, milestone proposal, and student login/activity (once an hour). A change to a stage's `expectedDays`/`isOpenEnded` and to `health.rules`/`checkin` → immediate sweep.
- Job `health.sweep` (`5 * * * *` Tehran) in `server/jobs`; automatic return from a finished pause in `students/lifecycle-auto.ts`.
- `modules/questions` (+ cycle-free `transfer.ts` and `erasure.ts`), `modules/checkins`, `modules/milestones` (+ `policy.ts`); catalog: settings, milestone types, canned responses; files: `linkAttachmentsToQuestionMessage/Milestone`, `attachmentsByParent`.
- `access`: resolvers for `question`, `milestone`, `checkin`, `flag`; `taskOfStudent` ref, and `milestoneType`/`cannedResponse` in the catalog ref.
- Mentor change: the previous mentor's open questions are transferred too. `admin:erase-user`: questions (subject and all messages → `[حذف شد]` ("[deleted]"), open → closed), check-in text, milestone evidence and amount, flags deleted, health `untracked`, attachments; a staff member who is the assignee of an open question → rejected.
- CSV import: due date Jalali (`1405/08/01`, Persian digits) or Gregorian.

### Command results (real runs, after the last change)
| Command | Result |
|---|---|
| `pnpm lint` | clean (449 files) |
| `pnpm typecheck` | clean |
| `pnpm test` | 62 files, **1405 tests green** (integration 990 in 23 files; the rest unit and component) |
| `pnpm build` | success; 93 API routes, all dynamic |

**New tests:** unit — `health/rules.test.ts` (66 table-driven tests: each rule at the yellow/red boundaries, `redCountMinDays`, open-ended stage, `submitted` in R-OVERDUE and R-NOTASK, check-in off/on, weeks before joining or return from a pause, churn risk, reason order, settings thresholds, ball), `sprint4-helpers.test.ts` (counters, median, secret, settings schemas, `toHealthSummary`), `lib/jalali.test.ts`. Integration — `health.test.ts`, `questions.test.ts` (**M-assignee** with an open thread and after closing: thread, summary and attachment only until closed; the rest of the file `404`; T-REF `taskId`/`attachmentIds`; strict student DTO), `checkins-milestones.test.ts`, `settings.test.ts` (separate database), `erasure-sprint4.test.ts`, `students-sprint4.test.ts`; **health, flag and snooze canary** on every student GET (and absence of the `health`/`flags`/`churnRisk` keys); internal-note canary in the student's question views; T-MATRIX and T-CSRF for all 38 new endpoints.

### Assumptions (for software-architect and security-reviewer review)
1. **R-OVERDUE** does not count a `submitted` task as overdue (the ball is with the reviewer); R-NOTASK counts it as open (same as ADR-0005).
2. **R-CHECKIN** counts only weeks whose form window opened after the start of the active period (joining or the last return to `active`); at most 12 weeks. **R-MOOD**: the latest check-in this week or last week ≤ `maxMood` → yellow; `redConsecutiveWeeks` consecutive weeks → red.
3. The first computation for each student does not record a `health.changed` event; after that only a change of status or of the (rule, level) set.
4. **Check-in** is accepted on any day of the week and attributed to the current week; `open` is only for the UI reminder.
5. **Question assignee without an active primary mentor** = the oldest active admin; if there is no admin → `409`.
6. "Red with no action": any non-deleted staff note after `red_since` counts as an action; after `redEscalateDays` the case is `escalated` and an admin with another mentor filter also sees it.
7. Editing a question message (15 minutes, data-model 2-8) has no endpoint (api.md does not either); the `edited_at` column is ready.
8. North Star: "median days to first" = Tehran day `occurred_on` minus Tehran day `joined_at`, on each student's first approved North Star milestone.
9. `dropped`/`graduated` are not recomputed in the hourly sweep; `untracked` is stored on status change.
10. The default text "معمولاً تا ۲۴ ساعت" ("Usually within 24 hours") is normalized when saved from settings (ADR-0008) and its tanwin is removed.

### Open questions (for software-architect)
- **`/healthz` and `lastHealthSweepAt`** (ADR-0007): the function `getLastHealthSweepAt()` in `modules/health/recompute.ts` is ready but `src/app/healthz/route.ts` was outside this work's boundary; devops-engineer or project-lead should wire it.
- The Biome `noRestrictedImports` rule (preventing import of the `health` module in `app/(student)` and `api/v1/me`) has not been added yet (`biome.json` is outside the boundary). Today separation is guaranteed by a separate DTO and the canary tests.
- The gate/non-gate review SLA (48/72) from sprint 3 is still open.

### Remaining work
- [ ] No migration was run on the 5432 database: before viewing the sprint 4 pages, `pnpm db:migrate` is needed (`0004` + seed). After that, one `POST /api/v1/admin/health/recompute` (or wait for the hourly sweep) so all current students get a health value.
- [ ] `/healthz` with `lastHealthSweepAt` and the warning "computation older than 3 hours" (above).
- [ ] `PATCH /users/:id` and `/role` (carried over from sprint 1).
- [ ] Editing a question message within 15 minutes (if needed).

### Resolved gaps (sprint 3 frontend gaps) — 29 Mehr 1405 (2026-10-21)
All are **additive**: no existing field, route or signature was removed or changed.

| # | What was added | How to use |
|---|---|---|
| 1 | `GET /api/v1/tasks` (A, M) and `listStaffTasks(actor, query)` in `@/modules/tasks/service` → `StaffTaskListDTO = { items: StaffTaskDTO[], nextCursor, counts: { total, overdue, byStatus } }` | query: `status` (comma-separated or `all`), `overdue=1`, `stageId`, `reviewerId`, `mentorId` (an id or `none` = no mentor; the student's primary mentor), `studentId`, `kind`, `submissionType`, `q` (task title or student name/mobile/tag), `sort=due\|recent` (default `due`: nearest due date first), `limit` (max 100, default 50), `cursor`. Scope is enforced in SQL; filters are ANDed with scope and an out-of-scope filter just returns an empty list. `counts` honors all filters except `status` and `overdue`, so each M5 tab counter comes from the same request (for example "awaiting review" = `byStatus.submitted`, "open and in progress" = `open + in_progress`). Replaces `listScopeTasks` in `app/(staff)/_data.ts` |
| 2 | `StudentReviewDTO.reviewer: { displayName }` | Student feedback card: "Feedback from {reviewer.displayName}". Name only; the reviewer's id is still absent |
| 3 | `nextDueDate?: 'YYYY-MM-DD'` in the body of `POST /submissions/{id}/review` (`ReviewInput`) | Only with `outcome: 'changes_requested'`; with `accepted` or a past day → `422 fields.nextDueDate`. The task's due date in the same transaction = end of that Tehran day. The response (`StaffTaskDetailDTO`) has the new `dueAt` |
| 4 | `PUT /students/{id}/stage` with `createTemplateIds?: string[]` (max 30), `cancelTaskIds?: string[]` (max 100), `cancelReason?` (default "با تغییر مرحله لغو شد." ("Cancelled on stage change.")); the response additionally has `createdTasks: StaffTaskDTO[]` and `cancelledTaskIds: string[]` | The stage change dialog sends everything in this one request instead of separate `POST /tasks` and `/cancel`. **Atomic:** a missing/inactive template → `422 fields.createTemplateIds`; a task of another student or a missing one → `422 fields.cancelTaskIds`; a finalized task in the cancel list → `409 INVALID_TRANSITION`; in all these cases (and on a stage rule error) the stage does not change and no task is created or cancelled. Duplicate ids count once. In the type these two response fields are optional so fallbacks do not break; the API always returns them (`[]` when not sent) |
| 5 | `ReviewQueueItemDTO.submissionType` and `.dueAt` | In `GET /review-queue`, `getReviewQueue` and `TodayDTO.reviewQueue`; they no longer need to be filled from the task list |
| 6 | `data` of the `profile.added`, `profile.updated`, `profile.approved` and `profile.removed` events: `{ platformId, platformName, kind }` (`updated` additionally has `fields`) | Timeline: "Showcase {data.platformName}" even after the showcase is removed. Old events lack these keys; keep the "Showcase" fallback |
| 7 | `TodayDTO.unansweredQuestions` | Already became `StaffQuestionListItemDTO[]` earlier in this sprint (no longer `never`); only an integration test was added. Build `QuestionRows` with this type |

**Decision on item 3 (next version due date) and why:** it is **not recorded as an extension** — neither a `task_extensions` row nor `extensionCount + 1`. Reason: the R-EXTEND rule (ADR-0005) counts consecutive extensions as a sign that the student is stuck; a new due date for a revision round is a normal part of the review cycle, and R-LOOP (`revisionCount`) already measures its repetition. If it counted as an extension, every student who gets two revisions would wrongly turn yellow and the "third extension" warning in M6 would be meaningless. The trace is not lost: the `review.created` event gets the keys `previousDueAt` and `nextDueAt`, and `originalDueAt` is untouched. A due date earlier than the current one is also accepted (a revision round can be shorter); only before today is forbidden.

**Tests:** `tests/integration/frontend-gaps-sprint4.test.ts` (17 tests): the `GET /tasks` matrix (A all, M only own students, M-other, **former M** after a mentor change, S → `403`, no session → `401`), out-of-scope filters → empty list, filters and `counts`, cursor and `422` for a broken cursor/unknown key; reviewer name without id; `nextDueDate` (no extension, event, an overdue task is no longer overdue, `422` with no write at all); **atomicity of item 4** (inactive template, missing template, another student's task, final task, and the "same stage" error: stage state, tasks and `stage.changed` events are exactly equal before and after); review queue; showcase events; "Today". Plus the manifest entry (automatic T-MATRIX for 6 roles). In `tasks.test.ts` the strict student schema now requires `reviewer: { displayName }` and still forbids `reviewerId` and the mentor id.

**Command results (real runs, after the last change):**
| Command | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm test` | 63 files, **1428 tests green** |
| `pnpm build` | success; `/api/v1/tasks` in the output (93 `/api/v1` routes + 1 internal) |
| `pnpm lint` | backend and test files are clean. The remaining errors are only formatting/import order in frontend files still being built: `app/(staff)/students/page.tsx`, `app/(staff)/today/page.tsx`, `components/files/image-uploads.tsx`, `components/health/reasons.ts`, `components/health/stuck-rows.tsx`, `components/questions/labels.ts`, `question-rows.tsx`, `thread.tsx`, `components/stages/board.tsx`, `components/students/health.tsx`, `student-filters.tsx`, `students-table.tsx`, `components/ui/jalali-date-field.tsx` (all fixable with `biome check --write`; I did not touch them) |

**For software-architect (open question / document update):**
- The ADR-0004 table in section 1-1 needs two new reference ids: `createTemplateIds` (same condition as `templateId`: active row, and the template's stage active) and `cancelTaskIds` (same condition as `taskId`: a task of the **same** student). The implementation uses `assertRefs` before any write.
- `api.md` sections 5 and 6: `GET /tasks`, `nextDueDate` in review, the new fields of `PUT /students/:id/stage`, and `reviewer.displayName` in the student DTO (the "student DTO" clause currently only says "no `reviewerId`"). For security-reviewer: the student now sees the reviewer's display name (like `SharedNoteDTO.author.displayName`), not the id.

---

## Frontend guide (for frontend-engineer)

The general rules are the same as sprints 2 and 3: RSC calls the service function with `toActor(user)`; writes only via `fetch` to the API; DTOs with `import type`. **No existing signature was changed; only fields were added.** `StudentListDTO.counts` is optional in the type so the current fallback `{ items: [], nextCursor: null }` does not break, but it is always in the response.

### Service functions for RSC pages
| Page | Function (module) | Output |
|---|---|---|
| "Today" | `getToday(actor, { mentorId? })` (`today`) | Now with real `unansweredQuestions`, `stuckStudents` and `waitingOnUs` |
| Stuck students | `listStuckStudents(actor, { level?, includeSnoozed?, mentorId? })` (`health/service`) | `StudentListItemDTO[]` |
| File: health | `getStudentHealth(actor, id)` | `HealthDetailDTO` (`snoozeReason`, `snoozedBy`, `redSince`) |
| File: flags | `listFlags(actor, id, { active? })` | `FlagDTO[]` |
| Question queue `/questions` | `listQuestions(actor, query)` (`questions/service`) | `StaffQuestionListDTO` (`sla`, `viaAssignment`) |
| Question page (staff) | `getStaffQuestion(actor, id)` | `StaffQuestionDetailDTO` (messages oldest first + `studentSummary`) |
| S my questions `/my/questions` | `listOwnQuestions(actor, { status? })`, `getOwnQuestion(actor, id)` | `StudentQuestionListDTO` (`expectedResponseText`), `StudentQuestionDetailDTO` |
| Canned responses | `listCannedResponses(actor)` (`catalog/service`) | `CannedResponseDTO[]` |
| S check-in | `getCurrentCheckin(actor)` (`checkins/service`) | `CurrentCheckinDTO`; with check-in off, `ApiError NOT_FOUND` → do not show the card |
| File: check-ins | `listStudentCheckins(actor, id)` | `CheckinListDTO` |
| File: milestones | `listStudentMilestones(actor, id)` (`milestones/service`) | `MilestoneDTO[]` |
| S my milestones | `listOwnMilestones(actor)` | `StudentMilestoneDTO[]` |
| Admin dashboard | `getNorthStar(actor, { from?, to? })` | `NorthStarDTO` |
| Admin settings | `getSettings(actor)`, `listMilestoneTypes(actor, { includeInactive })` | `SettingsDTO`, `MilestoneTypeDTO[]` |
| Read-only staff settings | `getStaffSettings(actor)` (`catalog/service`) | `StaffSettingsDTO` (`access.mentorsCanInviteStudents` to hide "New student") |
| Tags and counters | `listStudentTags(actor)`; `listStudents(...).counts` | Replaces paging through 10 pages in `_data.ts` |

### Endpoints that forms call
| Form / action | Request | Body | Response |
|---|---|---|---|
| Ignore until a date | `PUT /api/v1/students/{id}/health/snooze` | `{ until: 'YYYY-MM-DD', reason }` (Jalali picker → Gregorian) | `200 HealthDetailDTO` |
| Remove ignore | `DELETE …/health/snooze` | — | `200 HealthDetailDTO` |
| Flag | `POST /api/v1/students/{id}/flags`; `POST /api/v1/flags/{id}/clear` | `{ category, level, note?, expiresAt? }` | `201/200 FlagDTO` |
| S new question | `POST /api/v1/me/questions` | `{ subject, body, links?, attachmentIds?, taskId?, priority? }` | `201 StudentQuestionDetailDTO` |
| S extension request | same, with that task's `taskId` and the subject "درخواست تمدید مهلت" ("Deadline extension request") | — | — |
| Message / reply | `POST /api/v1/questions/{id}/messages` | `{ body, links?, attachmentIds?, cannedResponseId? (staff only) }` | `201` DTO of that role |
| Close | `POST /api/v1/questions/{id}/close` | — | `200` DTO of that role |
| Reassign (admin) | `PUT /api/v1/questions/{id}/assignee` | `{ assigneeId }` | `200 StaffQuestionDetailDTO` |
| S check-in | `POST /api/v1/me/checkins` | `{ activityText?, blocker?, mood: 1..5, nextWeekPlan?, needsHelp }` | `201 CheckinDTO` (`questionId` if help was requested); a second one → `409` |
| S milestone proposal | `POST /api/v1/me/milestones` | `{ typeId, occurredOn, platformId?, amount?, currency?, evidenceText?, attachmentIds? }` | `201 StudentMilestoneDTO`; no evidence for `requiresEvidence` → `422 fields.evidenceText` |
| Record milestone (staff) | `POST /api/v1/students/{id}/milestones` | same | `201 MilestoneDTO` (`approved`) |
| Approve / reject | `POST /api/v1/milestones/{id}/approve`, `/reject` (`{ reason }`) | — | `200 MilestoneDTO`; repeat → `409` |
| Settings | `PUT /api/v1/settings` (several keys) or `PUT /api/v1/settings/{key}` (body = value) | keys: `access`, `sla`, `business_hours`, `tasks`, `questions`, `checkin`, `health.rules` | `200`; `422` with `fields` at the key path (for example `inactivity`) |
| Milestone types, canned responses | `POST`/`PATCH /api/v1/milestone-types[/{id}]`, `/canned-responses[/{id}]` | — | — |
| Export | link `GET /api/v1/exports/milestones.csv` | — | download |

### UI notes
- **Health reasons:** build the Persian text from `reasons[].facts`: R-INACT `{days}` ("۹ روز بی‌فعالیت" = "9 days inactive"), R-STALL `{daysInStage, expectedDays}`, R-OVERDUE `{overdueCount, maxOverdueDays}` ("۲ کار عقب" = "2 tasks behind"), R-LOOP `{maxRevisions}`, R-NOTASK `{days}`, R-EXTEND `{maxExtensions}`, R-FLAG `{count, categories}`, R-CHECKIN `{weeks}`, R-MOOD `{mood, weeks}`. `churnRisk` → the label "Churn risk". `ball`: `student` / `team` / `both` = "Ball is in the student's court / ours / both".
- `health` is `null` only until the first computation; after `db:migrate`, one recompute or sweep fills everyone. The `untracked` status (graduated/dropped) has no indicator.
- **Question SLA:** `sla` only when the ball is with the team; `breached` red, `warning` orange; urgent = 4 hours. `viaAssignment: true` means the mentor sees only this thread: do not link to the full file; use `studentSummary`.
- Student: `hasNewReply` for the "New reply" badge (F10); `expectedResponseText` next to the question form; `author.isTeam` for message bubble direction.
- **`waitingOnUs`:** `question` → `/questions/{refId}`; `red_no_action` → the file with "Log an action" (any note closes it); `escalated` = report to the founder.
- `409 PHONE_TAKEN` has `error.data.existingStudentId` for the admin → a "Go to the existing file" button.
- `stage.sortOrder` in staff DTOs for the direction of a stage change (instead of an index from `listStages`); `stage.isActive=false` means an inactive stage.
- `GET /board` cards have `accountStatus` ("Not logged in yet" for `invited`).
- The milestone amount is a decimal string (`"250.00"`); default currency `USD`.
- North Star with no parameters = current Jalali month; for another month send the Gregorian range (`lib/jalali.jalaliMonthRange` also works in the browser).
- CSV import: the due date column now also accepts Jalali (`۱۴۰۵/۰۸/۰۱`); update the form's guide text.
- Nothing about health, flags, snooze or `studentSummary` is in the student DTOs; do not import the `health` module in `(student)` pages.

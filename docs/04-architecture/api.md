# API contract — UpworkCoach version 0.1

> Phase 3 — 27 Mehr 1405 (2026-10-19) — author: software-architect — status: draft for the founder gate
> **Update 30 Mehr 1405 (2026-10-22): aligned with the code of sprints 1 to 4.** Every new or changed item carries the label "(aligned with the code, sprint N)". The full list of built routes: `apps/web/src/server/http/routes.manifest.ts` (93 routes under `/api/v1` + 1 internal route). A route that is not in the manifest has not been built; such routes are marked "**Not built**" here, and their remaining work is in `docs/05-delivery/followups.md`.
> Data model: `data-model.md`. Access: [ADR-0004](adr/0004-access-control.md). Authentication: [ADR-0003](adr/0003-auth-0.1.md).
> The exact zod schemas in `apps/web/src/modules/*/contracts.ts` are the source of truth for the code. This document is their conceptual contract, and any change to one must also be applied to the other.

---

## 1. General contracts

| Topic | Rule |
|---|---|
| Base | `/api/v1`. JSON only (`Content-Type: application/json`), except `POST /attachments` and `POST /imports/students` (multipart) and CSV exports |
| Authentication | Cookie `__Host-uc_session`. All routes except the "public" ones need a session; without a session ← `401 UNAUTHENTICATED` |
| CSRF | Non-GET requests must have an `Origin` header exactly equal to the origin of `APP_BASE_URL`; otherwise `403 BAD_ORIGIN`. If `Sec-Fetch-Site` is present and is not `same-origin` ← `403`. (aligned with the code, sprint 1) A **POST without a body** (`logout`, `invite-link`, `reset-link`, `start`, `done`, `approve`, …) may have no `Content-Type`; any request that has a body must be `application/json` (or multipart on the two routes above), otherwise `415`. Reason: Origin is the main barrier, and a cross-site form always sends `Content-Type` (ADR-0003 section 9) |
| Body limit | JSON at most 256 KB **before** parsing ← `413` (aligned with the code, sprint 1) |
| Roles | `A` = admin, `M` = mentor (only within their own scope; ADR-0004), `S` = student (only themselves), `*` = any signed-in user, `public` = no session |
| Out of scope | A resource that exists but that the user cannot access ← **`404 NOT_FOUND`** with a body identical to that of a nonexistent id. A role that is not allowed for the whole endpoint ← `403 FORBIDDEN` |
| Field names | camelCase in JSON |
| Id | String UUID (UUIDv7) |
| Time | Instant: ISO 8601 with `Z` (`2026-10-19T08:30:00Z`). Day: Gregorian `YYYY-MM-DD`, which means the **Tehran calendar day**. **The JSON API neither accepts nor returns Jalali dates**; conversion is in the UI (ADR-0008). The only exception: the deadline column in the input CSV file (section 13) |
| Digits | Persian and Arabic digits are accepted in numeric and mobile input and converted to Latin. Amounts in responses are **decimal strings** (`"25.00"`) (aligned with the code, sprint 2) |
| Pagination | Opaque cursor: `?limit=50&cursor=<opaque>` ← `{ items: [...], nextCursor: string \| null }`. Maximum `limit` is 100. (aligned with the code, sprint 2) A corrupt or forged cursor ← `422` |
| Error | `{ "error": { "code": "VALIDATION_FAILED", "message": "<Persian text for display>", "fields": { "phone": "شماره‌ی موبایل معتبر نیست" }, "data": { … } } }` (the `phone` message means "The mobile number is not valid"). (aligned with the code, sprint 4) `data` is optional and appears only where stated (currently `409 PHONE_TAKEN` for the admin) |
| Common error codes | `VALIDATION_FAILED` (422), `UNAUTHENTICATED` (401), `INVALID_CREDENTIALS` (401), `FORBIDDEN` / `BAD_ORIGIN` (403), `NOT_FOUND` (404), `CONFLICT` / `PHONE_TAKEN` / `INVALID_TRANSITION` (409), `TOKEN_EXPIRED` (410), `PAYLOAD_TOO_LARGE` (413), `UNSUPPORTED_MEDIA_TYPE` (415), `TOO_MANY_ATTEMPTS` (429), `INTERNAL` (500), `BUSY` (503, with `Retry-After`; the argon2 queue is full) |
| `429` | (aligned with the code, sprint 1) Body: `{ error: { code: 'TOO_MANY_ATTEMPTS', message: '<fixed Persian message with the minutes remaining>', retryAfterSeconds } }` + `Retry-After` header. It says nothing about the lock layer or whether the account exists |
| Referenced ids (security C3) | **Every** id in the body or query of a write request that points to another resource (`profileId`, `taskId`, `attachmentIds`, `mentorId`, `reviewerId`, `assigneeId`, `ownerId`, `studentId`, `studentIds`, `stageId`, `toStageId`, `platformId`, `primaryPlatformId`, `trackId`, `templateId`, `typeId`, `cannedResponseId`, and (aligned with the code, sprint 4) `createTemplateIds` and `cancelTaskIds`) is checked like the main resource, and if it depends on a student it must belong to **that same student**. The condition for each id is in the ADR-0004 table, section 1-1; implemented with `assertRefs` inside the write transaction and **before any write**. Rejection ← **`422 VALIDATION_FAILED`** with `fields.<name> = "مقدار نامعتبر است"` (Persian for "Invalid value"), identical for nonexistent, out of scope, belonging to another student and inactive, and **no row is written** (test T-REF). `404` is only for the **path** id. Query filters in `GET`s are `AND`ed with the scope, and an out-of-scope filter yields only an empty list. (aligned with the code, sprint 4) The difference between `422` and `409`: an id that is "not allowed" ← `422`; an allowed id but a resource in the wrong **state** (for example a finalized task in `cancelTaskIds`) ← `409 INVALID_TRANSITION` |
| Input schema (security C3, SEC-A7) | All zod schemas use `.strict()`; an unknown key or a field forbidden for that role ← `422`. (aligned with the code, sprint 2) The same rule applies to unknown **query** keys |
| Concurrent editing | Editable resources return `updatedAt`. PATCH may send `ifUpdatedAt`; if it does not match ← `409 CONFLICT` |
| DTOs | Responses of `S` routes have separate types and **do not have** internal fields (ADR-0004 section 3). Shared routes (`/tasks/:id`, `/questions/:id`, `/profiles/:id`, `/attachments/:id`) choose the DTO with a `switch` on the role (SEC-A5) |
| Server Action | Forbidden (SEC-A10). RSC pages read the service function directly with `toActor(user)`; all writes go through this API (aligned with the code, sprint 2) |

---

## 2. Authentication and session (`identity`)

| Method and route | Role | Input | Output and notes |
|---|---|---|---|
| `POST /auth/login` | public | `{ phone, password }` | `200 { user: MeDTO }` + session cookie + device cookie `__Host-uc_dev`. `401 INVALID_CREDENTIALS`, `429 TOO_MANY_ATTEMPTS { retryAfterSeconds }`. (security C2) Three-layer lock (`pi` 5/15 minutes, `p` 20/1 hour with the device cookie bypass, `ip` 30/15 minutes), IP only from `getClientIp`, password after `normalizePassword`; ADR-0003 sections 3–4. A dummy hash for a nonexistent user, `invited` and `disabled`. (aligned with the code, sprint 1) Only an Iranian mobile number (`9` + 9 digits) is accepted |
| `POST /auth/logout` | * | — | `204`; the current session is revoked; the cookie gets `Max-Age=0`; `Clear-Site-Data: "cache"`. The device cookie **stays** (aligned with the code, sprint 1) |
| `GET /auth/me` | * | — | `MeDTO = { id, displayName, role, phone }` |
| `POST /auth/change-password` | * | `{ currentPassword, newPassword }` | `204`; all other sessions are revoked and the current session is rotated (a new cookie). (security C2) Minimum length: student 8, staff 12. (aligned with the code, sprint 1) A wrong current password ← **`422` with `fields.currentPassword`** (not `401`, so the UI can show it next to the field) and counting in the lock `pwchange:u:<userId>` 5 per 15 minutes ← `429` |
| `GET /auth/sessions` | * | — | `[{ id, createdAt, lastUsedAt, userAgent, ip, current }]` (only their own sessions) |
| `DELETE /auth/sessions/:id` | * | — | `204`. Condition `user_id = actor`; someone else's session ← `404` |
| `POST /auth/tokens/lookup` | public | `{ token }` | (security C1) `200 { purpose: 'invite' \| 'password_reset', displayName, expiresAt }`. **The mobile number (even masked) is not returned.** Nonexistent, consumed, revoked or expired ← `410 TOKEN_EXPIRED`. Limit `token:ip` (30 failures in 15 minutes). `Cache-Control: no-store` |
| `POST /auth/tokens/accept` | public | `{ token, phone, password }` | (security C1) `200 { user: MeDTO }` + cookie. Both invitation and reset. `phone` must equal `users.phone` after normalization; otherwise `422 VALIDATION_FAILED { fields: { phone } }`, and after 5 attempts the token is revoked + `audit_log(auth.token_revoked_mismatch)` ← `410`. Atomic consumption of the token, revocation of all earlier sessions and of the incoming cookie session (if any); ADR-0003 section 2 |

(security C1) **No route (page or API) has a `:token` parameter.** The token appears only in the link fragment (`/invite#t=…`, `/reset#t=…`) and in the body of these two POSTs.

**Session cookie (aligned with the code, sprint 1):** the cookie's `Max-Age` equals the session's **absolute limit** (student 90, staff 30 days), not the sliding expiry. The sliding expiry (30/7 days) is checked on the server in **every** request (API and RSC) from `sessions.expires_at` and renewed every 15 minutes; an expired session cookie has no effect on the server. The reason is in ADR-0003 section 9.

## 3. Users and invitations (`identity`)

| Method and route | Role | Input | Output and notes |
|---|---|---|---|
| `GET /users?role=mentor\|admin\|student&status=` | A | — | `{ items, nextCursor: null }` (aligned with the code, sprint 1: no pagination, at most 1000 rows). Each row has `inviteAcceptedAt` and `inviteAcceptedDevice` (security C1, SEC-T5) and `erasedAt` (security C5). (aligned with the code, sprint 1; architecture decision) The source of these two fields is the columns `users.invite_accepted_at` and `users.invite_accepted_user_agent`, not `auth_tokens`, because `auth.cleanup` deletes tokens 7 days after consumption (`data-model.md` 2-1; followup F-01). Until F-01 is carried out, these two fields become `null` after 7 days |
| `GET /mentors` | A, M | — | `[{ id, displayName, role }]` of the admin and mentor roles with `status=active`; for choosing a mentor and for filters |
| `POST /invitations` | A | `{ role: 'mentor' \| 'admin', displayName, phone }` | `201 { userId, inviteUrl, expiresAt }`. **`inviteUrl` is returned only this one time** (`Cache-Control: no-store`). Form: `${APP_BASE_URL}/invite#t=<token>`. A student is created through `POST /students`. (Before inviting a **second admin**, SEC-S7 `reauth` is required; followup F-06) |
| `POST /users/:id/invite-link` | A; M (security C3: only if the target user has **`role = 'student'`**, `status = 'invited'` and is in their own scope) | — | `201 { inviteUrl, expiresAt }` (`no-store`); the previous link is revoked. A: only for `status=invited` (otherwise `409`). **M for any other user, including an `invited` user with the role `admin` or `mentor`, ← `404`** (the same body as a nonexistent id). (aligned with the code, sprint 1) For a mentor it does **not** depend on `mentorsCanInviteStudents`: this is not creating a new user, just a link again for a student who is already in their scope. `audit_log(user.invite_link_created)` with the creator's role, without the link |
| `POST /users/:id/reset-link` | A | — | `201 { resetUrl, expiresAt }` (24 hours; `no-store`). Form: `${APP_BASE_URL}/reset#t=<token>`. In `audit_log` without the link. (aligned with the code, sprint 1) Only for an `active` user; `invited` and `disabled` ← `409` (for `invited`, use `invite-link`) |
| `PATCH /users/:id` | A | `{ displayName?, phone?, status?: 'active' \| 'disabled' }` | **Not built** (followup F-02). Deactivating and changing the mobile number revoke all sessions (`user.phone_changed` in `audit_log`). Changing a student's name or mobile number rebuilds `students.search_text` with `buildSearchText` in the **same transaction** (architecture decision, answer to the open question of sprint 2) |
| `PATCH /users/:id/role` | A | `{ role }` | **Not built** (followup F-02). Removing the last admin ← `409`. A student does not change role (`409`). All sessions revoked |

(security C5) **Account deletion has no endpoint in 0.1.** A deletion request arrives as a message to the coach, and the admin carries it out with the CLI `pnpm admin:erase-user` (`data-model.md` section 6-2, ADR-0010). For a user who has `erasedAt`, all write routes of this section ← `409 CONFLICT`.

**CLIs (aligned with the code, sprint 1):** `pnpm admin:create --phone … --name …` (other name: `admin:bootstrap`; only when there is no admin; a 1-hour link on stdout), `pnpm admin:reset-link --phone …` (for an `active` user a 1-hour reset link; for an `invited` user, for example the first admin whose setup link has expired, a 1-hour **invitation** link; it clears that mobile number's locks), `pnpm admin:erase-user --id … --confirm "…" --requested-on YYYY-MM-DD`.

## 4. Student and file (`students`)

| Method and route | Role | Input | Output and notes |
|---|---|---|---|
| `GET /students` | A, M | query: `q` (normalized name, mobile `+98…`/`09…` with Persian digits, messenger ID, tag), `stageId`, `mentorId` (A only; uuid or `none` = no mentor), `tag`, `platformId` (the primary platform **or** a non-deleted profile on it), `health` (one or more, comma-separated: `green\|yellow\|red\|paused`), `lifecycle` (one value, a comma-separated list, or `all`; default `active,paused`), `cohort`, `sort=name\|lastActivity\|stageDays\|joined\|health`, `limit`, `cursor` (aligned with the code, sprints 2 and 4) | `StudentListDTO = { items: StudentListItem[], nextCursor, counts: { total, byLifecycle, byHealth } }`. `counts` has all the filters except `lifecycle`/`health`, so the chip counters come from this same request (aligned with the code, sprint 4). `StudentListItem = { id, displayName, mentor:{id,displayName}, stage:{id,name,displayCode,sortOrder,isActive}, daysInStage, overExpected, health:{status, reasons, churnRisk, snoozedUntil, ball, statusSince, computedAt}, nextTask:{id,title,dueAt,overdue}, openTaskCount, overdueTaskCount, lastActivityAt, tags, primaryProfile:{platformName,url,headline} }`. `health` is `null` only until the first computation |
| `GET /students/tags` | A, M | — | (aligned with the code, sprint 4) `[{ tag, count }]` tags of the students in scope |
| `POST /students` | A; M if `mentorsCanInviteStudents` | `{ displayName, phone, mentorId?, stageId?, trackId?, primaryPlatformId?, tags?, initialNote? }`. M: `mentorId` is ignored and set to themselves. A without `mentorId` ← a student **without a mentor** (aligned with the code, sprint 2; the UI defaults to the admin themselves). Default `stageId` = the first active stage. `initialNote` ← the first `internal` note of the file (sprint 3) | `201 { student: StaffStudentDTO, inviteUrl, expiresAt }` (`no-store`). In one transaction: an `invited` user + `students` + `mentor_assignments` + `stage_transitions(initial)` + invitation token + `audit_log`. A duplicate mobile number ← `409 PHONE_TAKEN` with `fields.phone`; (aligned with the code, sprint 4) **for the admin only** it also has `error.data.existingStudentId` (for "go to the existing file"; a mentor does not get it) |
| `GET /students/:id` | A, M | — | `StaffStudentDTO`: all the fields of `students` + header (`health`, `nextTask`, `daysInStage`, `overExpected`, task counts, `primaryProfile`, `mentor`, `completeness: { percent, missing[] }`, `stage.sortOrder`, `stage.isActive`, `accountStatus`). (architecture decision, SEC-T5) `inviteAcceptedAt` and `inviteAcceptedDevice` must also come — **not yet in the code** (followup F-01) |
| `PATCH /students/:id` | A, M | Every editable field of `students` except `primaryMentorId`, `currentStageId` and `lifecycleStatus` (they have separate routes) + `ifUpdatedAt`. (aligned with the code, sprint 2) `joinedAt` is for the admin only | `StaffStudentDTO`; event `student.updated` with the list of fields |
| `PUT /students/:id/mentor` | A | `{ mentorId \| null, reason? }` | `StaffStudentDTO`. `null` = no mentor. `audit_log(student.mentor_changed)`; the previous mentor immediately gets `404`. The previous mentor's open reminders and open questions about this student are transferred to the new mentor; (aligned with the code, sprint 3) if the new mentor is `null`, to **the admin performing the action** |
| `PUT /students/:id/lifecycle` | A, M | `{ status: 'active' \| 'paused' \| 'graduated' \| 'dropped', pausedUntil?: 'YYYY-MM-DD', reason? }` | `paused` without `pausedUntil`, or with `pausedUntil` on or before today in Tehran ← `422`; for other statuses `pausedUntil` must not be present (aligned with the code, sprint 2). A system reminder one day before the return; it is cancelled if the pause ends early (sprint 3) |
| `GET /students/:id/timeline` | A, M | `types=note,student,stage,profile,task,question,checkin,milestone,flag,health` (comma-separated; absent = all), `limit`, `cursor` | (aligned with the code, sprint 3) `TimelineDTO = { items: [{ kind: 'event' \| 'note', category, type, occurredAt, actor, data \| note }], nextCursor, refs: { stages: {id→name}, users: {id→displayName} } }`, newest first |
| `GET /students/:id/summary` | A, M in scope, or M who is the `assignee` of an **open** question of this student | — | The summary next to a question (F8): `{ displayName, stage, profiles[], openTasks[] }`. (security C3) For an assignee outside the scope only while a thread with `status IN ('open','answered')` and `assigneeId = actor` exists; after that `404` (sprint 4) |
| `GET /me/student` | S | — | `SelfStudentDTO` (without health, flag, tag, cohort, `level`, `statusReason`, `lifecycleStatus`, `lastActivityAt` and the mentor's id; of the mentor only the name). They see `nicheStatement` but cannot edit it (aligned with the code, sprint 2) |
| `PATCH /me/student` | S | Only the allow-listed fields (`data-model.md` 2-3) + `ifUpdatedAt` | `SelfStudentDTO` |

### Platform profiles
| Method and route | Role | Input | Output and notes |
|---|---|---|---|
| `GET /students/:id/profiles` | A, M | — | `ProfileDTO[]` (primary first) |
| `GET /me/profiles` | S | — | `ProfileDTO[]` |
| `POST /students/:id/profiles` · `POST /me/profiles` | A, M · S | `{ platformId, kind, publicUrl?, headline?, rateAmount?, rateCurrency?, rateUnit?, status?, niche?, notes?, isPrimary? }` | `201 ProfileDTO`. `publicUrl` only `https://`. **There is no password field** (the key `password` ← `422`). (aligned with the code, sprint 2) An amount without a currency ← `USD` |
| `PATCH /profiles/:id` | A, M, S (their own) | The same fields + `ifUpdatedAt` | Editing an approved profile does not remove the approval |
| `DELETE /profiles/:id` | A, M, S (their own) | — | `204`; soft delete. (aligned with the code, sprint 2) After deletion, `404` for everyone (including approval and snapshot) |
| `POST /profiles/:id/approve` | A, M | — | `200 ProfileDTO` with `mentorApprovedAt` |
| `GET /profiles/:id/snapshots` · `POST /profiles/:id/snapshots` | A, M, S (their own) | `{ headline?, bodyText, rateText? }` | Newest first |

## 5. Path, stage and kanban (`path`)

| Method and route | Role | Input | Output and notes |
|---|---|---|---|
| `GET /stages` | * | — | `[{ id, displayCode, name, sortOrder, expectedDays, isOpenEnded, studentDescription, contentLinks, isActive }]` (active only; A with `?includeInactive=1`) |
| `POST /stages` | A | The fields of `stages` (`contentLinks` only `https://`) | `201 StageDTO` |
| `PATCH /stages/:id` | A | The fields of `stages` | Changing `expectedDays` or `isOpenEnded` ← immediate `health.sweep`. (aligned with the code, sprint 2) It **does not deactivate**: `isActive: false` ← `422` (only `deactivate`); `isActive: true` is reactivation |
| `PUT /stages/order` | A | `{ stageIds: [...] }` | Exactly the **complete** set of the path's stages (active and inactive), otherwise `422`. `sortOrder` is rewritten to 10, 20, … (aligned with the code, sprint 2) |
| `POST /stages/:id/deactivate` | A | — | If an `active` student is in this stage ← `409` (`paused`/`graduated`/`dropped` do not block; aligned with the code, sprint 2). Concurrency with a stage change: `data-model.md` 2-2 (`stages`) |
| `PUT /students/:id/stage` | A, M | `{ toStageId, kind: 'advance' \| 'skip_by_assessment' \| 'advance_with_exception' \| 'regress', note?, createTemplateIds?: uuid[] (max 30), cancelTaskIds?: uuid[] (max 100), cancelReason? }` | `{ student, suggestedTemplates: TaskTemplateDTO[], createdTasks: StaffTaskDTO[], cancelledTaskIds: uuid[] }`. `note` is required for exception and regress. "One click" in the UI = `advance` to the next stage. (aligned with the code, sprint 2) The direction must match the kind: `regress` only backward, the others only forward (skipping allowed); the same stage or the wrong direction ← `409 INVALID_TRANSITION`; an inactive destination ← `422`. (aligned with the code, sprint 4) **Atomic:** the stage change, creating tasks from the templates in `createTemplateIds` and cancelling `cancelTaskIds` (with `cancelReason`, default «با تغییر مرحله لغو شد.» ("Cancelled because of the stage change.")) happen in one transaction. A nonexistent/inactive template ← `422 fields.createTemplateIds`; another student's task or a nonexistent one ← `422 fields.cancelTaskIds`; a finalized task in the cancel list ← `409 INVALID_TRANSITION`; in all these cases nothing is written. A duplicate id is counted once. The two response lists are `[]` when they were not sent |
| `GET /students/:id/stage-history` | A, M | — | `[{ from, to, kind, note, actor, createdAt }]`, oldest first, with `initial` |
| `GET /board` | A, M | `mentorId?` (A), `tag?`, `health?` | `{ columns: [{ stage, students: [{ id, displayName, daysInStage, overExpected: 'none' \| 'warn' \| 'over', health, lifecycleStatus, accountStatus }] }] }`. `overExpected`: more than `expectedDays` ← `warn`, more than 2 times ← `over` (F3). (aligned with the code, sprints 2 and 4) `active` and `paused` students; within a column the highest days first; a column for each active stage + an inactive stage that still has students. `daysInStage` = full 24-hour days since `stage_entered_at` |
| `GET /me/path` | S | — | `{ stages: [{ id, name, displayCode, state: 'passed' \| 'current' \| 'locked', studentDescription, contentLinks }], current, next }`. (aligned with the code, sprint 2) Finer states (`passed_by_assessment`, …) only in the staff history; an inactive stage only if it is the student's current stage |

## 6. Tasks, submission and review (`tasks`)

| Method and route | Role | Input | Output and notes |
|---|---|---|---|
| `GET /tasks` | A, M | (aligned with the code, sprint 4) `status` (comma-separated or `all`), `overdue=1`, `stageId`, `reviewerId`, `mentorId` (an id or `none`; the student's primary mentor), `studentId`, `kind`, `submissionType`, `q` (task title or student name/mobile/tag), `sort=due\|recent` (default `due`), `limit` (default 50), `cursor` | `StaffTaskListDTO = { items: StaffTaskDTO[], nextCursor, counts: { total, overdue, byStatus } }`. Scope in SQL; filters AND the scope. `counts` has all the filters except `status` and `overdue` (the counter for the M5 tabs) |
| `GET /students/:id/tasks` | A, M | `status?`, `stageId?` | `StaffTaskDTO[]` with `overdue` and `overdueDays` (Tehran calendar days after the deadline, at least 1) |
| `GET /me/tasks` | S | `status?` | `StudentTaskListItemDTO[]` (a light list with `latestReview`); sorted: overdue first, then `dueAt` (F4). Cancelled only with `?status=cancelled` (aligned with the code, sprint 3) |
| `POST /students/:id/tasks` | A, M | `{ title?, description?, kind?, submissionType?, stageId?, requiredForGate?, priority?, dueDate?: 'YYYY-MM-DD', reviewerId?, templateId?, profileId? }` | `201 StaffTaskDTO`. (aligned with the code, sprint 3) `templateId` fills the empty fields; without a template `title` is required; default `kind=custom`, `submissionType=text`; `dueDate` ← the template's days, otherwise `settings.tasks.defaultDueDays` (3); `due_at` = the end of that Tehran day; a deadline in the past ← `422`. The default reviewer = the active primary mentor, otherwise the actor. (security C3) `profileId` belongs to **this** student and is not deleted; `reviewerId` an active admin or mentor user; `stageId` and `templateId` active; otherwise `422` |
| `POST /tasks/bulk` (Should) | A, M | `{ studentIds: [...], templateId? \| fields, dueDate? }` | `201 { batchId, created: n, taskIds }`. (security C3) **All** `studentIds` must be in scope; otherwise the whole request is `422` and **no** task is created |
| `GET /tasks/:id` | A, M, S (their own) | — | Staff: `StaffTaskDetailDTO` (versions newest first, each with `review` and `attachments`; `extensions[]`); student: `StudentTaskDTO` (below). A `switch` on the role (SEC-A5) |
| `PATCH /tasks/:id` | A, M | `{ title?, description?, priority?, reviewerId?, stageId?, requiredForGate?, ifUpdatedAt? }` | Changing the deadline through this route is **not possible** (`dueDate` ← `422`). (security C3) `reviewerId` and `stageId` are checked as when creating a task |
| `POST /tasks/:id/extend` | A, M | `{ newDueDate, reason }` | `200 StaffTaskDTO`. (aligned with the code, sprint 3) Only in a non-final state and only **after the current deadline**. `task_extensions` + `extensionCount += 1`; event `task.due_extended`; health is recomputed |
| `POST /tasks/:id/cancel` | A, M | `{ reason }` | `200 StaffTaskDTO`; final ← `409 INVALID_TRANSITION` |
| `POST /tasks/:id/start` | S | — | `200 StudentTaskDTO`; `open` ← `in_progress` |
| `POST /tasks/:id/submissions` | S | `{ bodyText?, links?: [{url,label}], attachmentIds?, platformId?, jobPostText?, proposalText?, profileText?, aiUseConsent?: boolean }` | `201 SubmissionCreatedDTO = { id, version, createdAt, task: { id, status } }`. Only from `open`, `in_progress` and `changes_requested`. (aligned with the code, sprint 3) Each type needs its own field: `text` the text, `link` a link, `file` an attachment, `profile_review` the profile text, `proposal_review` `platformId` + `jobPostText` + `proposalText`; a proposal or profile field on another type ← `422`. `checkbox` needs no body, one submission version is recorded (for the history) and the task becomes `accepted` directly. If the task has a `profileId`, the `profile_snapshot` is built from the task itself. (security C4) `attachmentIds` only the student's own `pending` attachments; attached atomically; otherwise `422` |
| `POST /submissions/:id/review` | A, M | `{ outcome: 'accepted' \| 'changes_requested', feedbackText, score?: 1..5, nextDueDate?: 'YYYY-MM-DD' }` | `201 StaffTaskDetailDTO`. Only the latest version and only when the task is `submitted`. `changes_requested` ← `revisionCount += 1`. (aligned with the code, sprint 3) **Any staff member in scope** can review, not only `reviewerId`. (aligned with the code, sprint 4) `nextDueDate` ("deadline for the next version") only with `changes_requested`; with `accepted` or a past day ← `422 fields.nextDueDate`. The task's deadline in the same transaction = the end of that Tehran day and may be earlier than the current deadline. **It does not count as an extension**: no `task_extensions` row, no `extensionCount + 1`, and `originalDueAt` is untouched; the event `review.created` receives the keys `previousDueAt` and `nextDueAt` (reason: ADR-0005, section "Alignment with the implementation") |
| `PATCH /reviews/:id` | A; M (security C3: the reviewer of that review **and** the student in their current scope) | `{ feedbackText?, score? }` | `200 StaffReviewDTO`. Only up to 24 hours, **for the admin too** (after that `409`; aligned with the code, sprint 3). `outcome` does not change. Out of scope ← `404` |
| `GET /review-queue` | A, M | `mentorId?` (A; = reviewer) | `ReviewQueueItemDTO[]`: `submitted` tasks in scope, sorted by `lastSubmittedAt`, with `slaRemainingHours`, `breached`, `warning`, and (aligned with the code, sprint 4) `submissionType` and `dueAt`. SLA in business hours. Threshold: `sla.reviewHours` for all tasks; **architecture decision:** a non-gate task should be measured with `sla.reviewHoursNonGate` (72) (followup F-09) |
| `GET /task-templates` | A, M | `stageId?`, `includeInactive?` | `TaskTemplateDTO[]` |
| `POST /task-templates` · `PATCH /task-templates/:id` | A | The fields of `task_templates` | Deactivation with `isActive: false` |

**Student DTO** (`StudentTaskDTO`): `{ id, title, description, kind, submissionType, stage, priority, status, dueAt, overdue, overdueDays, submissions: [{ version, createdAt, bodyText, links, attachments, platformId, jobPostText, proposalText, profileText, aiUseConsent, review: { outcome, feedbackText, score, createdAt, reviewer: { displayName } } }] }`. **Without** `reviewerId`, `createdBy`, `revisionCount`, `extensionCount` and the cancellation reason. (aligned with the code, sprint 4) The student sees the reviewer's **display name** (like `SharedNoteDTO.author.displayName`), not their id.

## 7. Notes and timeline (`timeline`)

| Method and route | Role | Input | Output and notes |
|---|---|---|---|
| `GET /students/:id/notes` | A, M | `visibility?`, `kind?`, `limit`, `cursor` | `NoteListDTO` (each item has `canEdit`) |
| `POST /students/:id/notes` | A, M | `{ kind?, visibility?: 'internal' \| 'shared', body, tags?, occurredAt? }` | `201 NoteDTO`. Default `internal`. (aligned with the code, sprint 3) A future `occurredAt` ← `422` |
| `PATCH /notes/:id` | A; M (security C3: the author **and** the student in their current scope) | `{ body?, tags?, visibility?, kind?, occurredAt?, ifUpdatedAt? }` | Out of scope (for example a former mentor) ← `404`. `internal` ← `shared` is recorded in `audit_log(note.visibility_changed)` |
| `DELETE /notes/:id` | A; M (the author **and** in scope) | — | `204`; soft delete |
| `GET /me/shared-notes` | S | `limit`, `cursor` | `SharedNoteListDTO`; item: `{ id, kind, body, occurredAt, author: { displayName } }`. **The only route through which a student sees notes** |

## 8. Reminders and "Today" (`reminders`, `today`)

| Method and route | Role | Input | Output and notes |
|---|---|---|---|
| `GET /reminders` | A, M | `scope=today\|upcoming\|done`, `ownerId?` (A; M only themselves), `studentId?` | `ReminderDTO[]`. (aligned with the code, sprint 3) An admin without `ownerId` gets only **their own** reminders |
| `POST /reminders` | A, M | `{ text, dueAt \| dueDate, studentId?, ownerId? }` | M: `ownerId` = themselves and `studentId` in scope. A: `ownerId` any **active admin or mentor** user; otherwise `422`. A `dueDate` without a time ← 9 AM Tehran |
| `PATCH /reminders/:id` | owner, A | `{ text?, dueAt? }` | — |
| `POST /reminders/:id/done` | owner, A | — | `200 ReminderDTO`; a repeat is also `200` (aligned with the code, sprint 3) |
| `POST /reminders/:id/snooze` | owner, A | `{ days: 1 \| 3 \| 7 }` | F6. (aligned with the code, sprint 3) Computed from the later of "now" and the current `dueAt` |
| `DELETE /reminders/:id` | owner, A | — | `204`; `cancelled` |
| `GET /today` | A, M | `mentorId?` (A; default: all) | `TodayDTO = { reminders, reviewQueue: ReviewQueueItemDTO[], unansweredQuestions: StaffQuestionListItemDTO[], stuckStudents: StudentListItem[], waitingOnUs: [{ kind: 'review' \| 'question' \| 'red_no_action', studentId, refId, since, slaHours, elapsedHours, breached, escalated? }], counts, generatedAt }`. (aligned with the code, sprint 3) An admin without `mentorId` sees **everyone's** reminders. (sprint 4) `escalated` = "red without action" for more than `redEscalateDays`; an admin who looks with another mentor's filter also sees it |
| `GET /stuck` | A, M | `mentorId?` (A only), `level=yellow\|red`, `includeSnoozed=0\|1` | `StudentListItem[]`, sorted: red ← yellow, then older `statusSince`. **Only `active`** (F7) |

## 9. Health and flags (`health`)

| Method and route | Role | Input | Output and notes |
|---|---|---|---|
| `GET /students/:id/health` | A, M | — | `HealthDetailDTO = { status, reasons[{rule, level, ball, facts}], churnRisk, ball, statusSince, redSince, computedAt, snoozedUntil, snoozeReason, snoozedBy }`. (aligned with the code, sprint 4) If it has not yet been computed, it is computed on the spot |
| `PUT /students/:id/health/snooze` | A, M | `{ until: 'YYYY-MM-DD', reason }` | `200 HealthDetailDTO`. Until the end of that Tehran day; today or earlier ← `422`; at most one year; event `health.snoozed` (aligned with the code, sprint 4) |
| `DELETE /students/:id/health/snooze` | A, M | — | `200 HealthDetailDTO` |
| `GET /students/:id/flags` | A, M | `active=1` | `FlagDTO[]` |
| `POST /students/:id/flags` | A, M | `{ category, level, note?, expiresAt? }` | `201 FlagDTO`; health is recomputed. (aligned with the code, sprint 4) `expiresAt` a day or an instant; in the past ← `422` |
| `POST /flags/:id/clear` | A, M | — | `200 FlagDTO`; a repeat has no effect |
| `POST /admin/health/recompute` | A | `{ studentId? }` | Without `studentId` = a full sweep; `audit_log` (aligned with the code, sprint 4). Run it once after the first `db:migrate` on a database that has students |

No health, flag, snooze or `studentSummary` field is in any student DTO (the sprint 4 canary test).

## 10. Questions and answers (`questions`)

| Method and route | Role | Input | Output and notes |
|---|---|---|---|
| `GET /questions` | A, M | `status?`, `awaiting=team\|student`, `assigneeId?` (A), `studentId?`, cursor | `StaffQuestionListDTO`. In scope **or** `assignee` = themselves (open/answered only; `viaAssignment: true`). "Waiting on the team" first, with the oldest SLA. Each row has `sla` (only when the ball is with the team) |
| `GET /me/questions` | S | `status?` | `StudentQuestionListDTO = { items, expectedResponseText }` (each item has `hasNewReply`) |
| `POST /me/questions` | S | `{ subject, body, links?, attachmentIds?, taskId?, priority? }` | `201 StudentQuestionDetailDTO`. `assignee` = the **active** primary mentor; otherwise (aligned with the code, sprint 4) **the oldest active admin**; if there is no admin ← `409`. (security C3) `taskId` the student's **own** task; `attachmentIds` only their own `pending`; otherwise `422`. "Request for a deadline extension" = this same route with the `taskId` of that task |
| `GET /questions/:id` | A, M (scope or assignee while the thread is open), S (their own) | — | The thread + messages (oldest first). Staff get `StaffQuestionDetailDTO` with `studentSummary`; the student gets `StudentQuestionDetailDTO` (`author.isTeam`). A `switch` on the role |
| `POST /questions/:id/messages` | A, M, S (their own) | `{ body, links?, attachmentIds?, cannedResponseId? }` | `201` the DTO of the same role. The transitions of `data-model.md` 2-8. (aligned with the code, sprint 4) `cannedResponseId` for staff only (a student ← `422`); staff on a closed thread ← `409`; a student's message reopens a closed thread. (security C3/C4) `attachmentIds` only the sender's own `pending` |
| `POST /questions/:id/close` | A, M, S (their own) | — | `200` the DTO of the same role |
| `PUT /questions/:id/assignee` | A | `{ assigneeId }` | `200 StaffQuestionDetailDTO`. (security C3) `assigneeId` an active admin or mentor user; otherwise `422`. `audit_log(question.assignee_changed)` |
| `GET /canned-responses` | A, M | — | `CannedResponseDTO[]` |
| `POST /canned-responses` · `PATCH /canned-responses/:id` | A | `{ title, body, category, isActive }` | — |

Editing a question message (15 minutes, `data-model.md` 2-8) **has no endpoint** in 0.1 (architecture decision, aligned with the code, sprint 4; backlog).

## 11. Weekly check-in (`checkins`)

| Method and route | Role | Input | Output and notes |
|---|---|---|---|
| `GET /me/checkins/current` | S | — | `{ weekStart, open: boolean, existing?: CheckinDTO, weekSummary: { tasksSubmitted, tasksAccepted } }`. (aligned with the code, sprint 4) `open` is only for the reminder in the UI (from the configured day onward) |
| `POST /me/checkins` | S | `{ activityText?, blocker?, mood: 1..5, nextWeekPlan?, needsHelp: boolean }` | `201 CheckinDTO` (`questionId` if help was requested). (aligned with the code, sprint 4) Accepted on **any day of the week** and attributed to the **current** week. If `needsHelp`, a question with `source=checkin` is created in the same transaction. A second submission in the same week ← `409` |
| `GET /students/:id/checkins` | A, M | cursor | `CheckinListDTO` |

If `settings.checkin.enabled = false`, all these routes return `404`. (aligned with the code, sprint 4) The seed default: **on** (decision E5).

## 12. Milestones (`milestones`)

| Method and route | Role | Input | Output and notes |
|---|---|---|---|
| `GET /milestone-types` | * | `includeInactive?` (A) | `MilestoneTypeDTO[]` |
| `POST /milestone-types` · `PATCH /milestone-types/:id` | A | The fields of `milestone_types` | — |
| `GET /students/:id/milestones` | A, M | — | `MilestoneDTO[]` |
| `GET /me/milestones` | S | — | `StudentMilestoneDTO[]`: only their own `approved` and `proposed` (rejected ones do not appear) |
| `POST /students/:id/milestones` | A, M | `{ typeId, occurredOn, platformId?, amount?, currency?, evidenceText?, attachmentIds? }` | `201 MilestoneDTO`; directly `approved` |
| `POST /me/milestones` | S | The same, **without** `status` (an extra key ← `422`) | `201`; `proposed`. A `requiresEvidence` type without text and without an attachment ← `422 fields.evidenceText`. (security C3/C4) `typeId` and `platformId` active; `attachmentIds` only their own `pending`. The amount is a decimal string, the default currency `USD` |
| `POST /milestones/:id/approve` | A, M | — | `200 MilestoneDTO`. Only from `proposed`; a second approval of a `uniquePerStudent` type ← `409` (row lock on `students`) |
| `POST /milestones/:id/reject` | A, M | `{ reason }` | `200 MilestoneDTO`; only from `proposed` |
| `GET /dashboard/north-star` | A | `from`, `to` (`YYYY-MM-DD` days; default: the current Jalali month) | `{ approvedInRange, approvedTotal, medianDaysToFirst, labeledProposalCount }`. (aligned with the code, sprint 4) `medianDaysToFirst` = the median of (Tehran day of `occurred_on` − Tehran day of `joined_at`) over each student's **first** approved North Star milestone. `labeledProposalCount` = the "proposal + critique" pairs with consent (G4) |

## 13. Catalogs, settings, import and export (`catalog`, `admin`)

| Method and route | Role | Input | Output and notes |
|---|---|---|---|
| `GET /platforms` · `GET /tracks` | * | — | Active only (A with `includeInactive`) |
| `POST /platforms` · `PATCH /platforms/:id` | A | `{ name, trackId?, sortOrder?, isActive? }` | Adding a platform without a code change (F2). The name is unique, case-insensitively (`422 fields.name`) |
| `GET /settings` | A | — | `SettingsDTO`: all the keys, each `{ value, version }` (`version = 0` means the default, not yet saved) |
| `PUT /settings` | A | `{ <key>: value, … }` | (aligned with the code, sprint 4) Any subset of the keys in **one transaction**; `422` with `fields` at the key path (for example `inactivity`) |
| `PUT /settings/:key` | A | Body = `value` according to that key's schema | `{ key, value, version }`. An unknown key ← `404`. Changing `health.rules` or `checkin` ← an immediate sweep. `audit_log`. Keys: `access`, `sla`, `business_hours`, `tasks`, `questions`, `checkin`, `health.rules` |
| `GET /settings/public` | * | — | `{ questions: { expectedResponseText }, checkin: { enabled, weekday } }` (aligned with the code, sprint 4) |
| `GET /settings/staff` | A, M | — | (aligned with the code, sprint 4) `StaffSettingsDTO`: the public items + `access` (`mentorScope`, `mentorsCanInviteStudents`) + the SLA thresholds |
| `GET /exports/students.csv` · `tasks.csv` · `milestones.csv` (Should) | A | — | CSV with a UTF-8 BOM; dates in two columns, **Jalali and Gregorian**; mobile `0912…`; formula neutralization (SEC-V2); `Content-Disposition: attachment`, `no-store`; `audit_log(export.*)`. `milestones.csv` without the evidence text |
| `POST /imports/students` (Should) | A | (security C6; aligned with the code, sprint 3) multipart: `file` **CSV UTF-8 only** (with or without BOM), at most 1 MB and 500 rows; `dryRun` (`'true'` default, `'false'` commits). XLSX ← `415` | `200 { dryRun, total, valid, imported, rows: [{ line, ok, errors: [{column, message}], studentId?, inviteUrl? }] }` (`no-store`; errors without the value, SEC-V5). Columns in Persian or English: name, mobile, mentor (mobile or name), stage (`displayCode` with Persian or Latin digits, or name), track, primary platform, profile link and headline, last task and deadline, note. (aligned with the code, sprint 4) The deadline **Jalali** (`1405/08/01`, Persian digits) or Gregorian (`YYYY-MM-DD`); the documented exception of ADR-0008. The real run commits only the valid rows and each row has its own transaction |

## 14. Attachments (`files`)

| Method and route | Role | Input | Output and notes |
|---|---|---|---|
| `POST /attachments` | * | multipart: `file` (jpeg/png/webp, at most 5 MB) | `201 { id, mimeType, sizeBytes, width, height, originalName, href, status: 'pending' }`. By sending `attachmentIds` in a submission, message or milestone, it is attached to it. (security C4) A larger size ← `413` **before** the body is buffered; a type (from the **content**) other than jpeg/png/webp ← `415`; more than 40 megapixels ← `422`; 20 `pending` attachments or 100 uploads in 24 hours ← `429`. `.rotate()`, no metadata, at most 4096 pixels; the original file is not stored |
| `GET /attachments/:id` | Anyone with access to the parent (from `loadInScope`); the uploader while it is `pending`; (aligned with the code, sprint 4) an assignee outside the scope, for a question-message attachment, only while the thread is open | — | Streams the file from the server. (security C4) `Content-Type` from the stored format; `X-Content-Type-Options: nosniff`; `Content-Disposition: inline; filename*=UTF-8''<sanitized name>`; `Content-Security-Policy: default-src 'none'; img-src 'self'; sandbox`; (aligned with the code, sprint 3) **`Cache-Control: private, no-store`** (stricter than `no-cache` in SEC-U6; without an ETag the effect is the same). Outside access ← `404` |

**Attaching attachments (security C4):** every endpoint that takes `attachmentIds` attaches the attachments **only** with `UPDATE … WHERE id = ANY($ids) AND status = 'pending' AND uploaded_by = $actor RETURNING id`, inside the transaction that creates the parent. If the number of rows does not equal the number of ids ← rollback and `422 VALIDATION_FAILED { fields: { attachmentIds } }`. At most 10 attachments per request.

## 15. Internal and operational

| Method and route | Access | Notes |
|---|---|---|
| `GET /healthz` (outside `/api/v1`) | public | Contract (SEC-J4): `{ ok, db: 'ok' \| 'fail', lastHealthSweepAt, version }`, `no-store`, no sensitive data. (aligned with the code, sprint 4) The current code returns `{ status: 'ok', db: 'ok', lastHealthSweepAt }` and on error `503 { status: 'error', db: 'unreachable' }`; aligning the field names, adding `version` and `sweepStale` (the last sweep older than 3 hours, ADR-0005) is in followup F-08 |
| `POST /api/internal/jobs/:name` | `X-Job-Secret` header | (aligned with the code, sprint 4) Only when `JOBS_MODE=http-trigger` (ADR-0007); otherwise always `404`. Constant-time comparison on SHA-256; a wrong secret ← `404` and a warning log; only `health.sweep`, `auth.cleanup`, `files.cleanup`; the body is ignored; 60 times per hour. A secret shorter than 32 bytes ← the app does not start. Not in the manifest (outside `/api/v1` and outside the session and `Origin` checks) |

---

## 16. Full example: submitting a proposal for review

```http
POST /api/v1/tasks/0192f1a0-…/submissions
Cookie: __Host-uc_session=…
Origin: https://app.example.ir
Content-Type: application/json

{
  "platformId": "0192e…",
  "jobPostText": "We are looking for a Shopify developer to …",
  "proposalText": "Hi, I noticed your store …",
  "bodyText": "این دومین نسخه است؛ hook را عوض کردم.",
  "aiUseConsent": true
}
```
(The `bodyText` value is a sample student note in Persian: "This is the second version; I changed the hook.")
```http
201 Created
{
  "id": "0192f1b7-…",
  "version": 2,
  "createdAt": "2026-10-19T09:12:44Z",
  "task": { "id": "0192f1a0-…", "status": "submitted" }
}
```
A common error: the task is in the `accepted` state ← `409 { "error": { "code": "INVALID_TRANSITION", "message": "این کار قبلاً تأیید شده است." } }` (the message means "This task has already been approved.").

---

## 17. What is added in 1.0 (to prevent name collisions)
`/api/v1/opportunities/**` (F12), `/api/v1/ai/runs/**` (F13 to F15; ADR-0006), `/api/v1/me/quota` (F17), `/api/v1/me/notification-preferences` (F18), `/api/v1/auth/otp/**` (F16), `/api/v1/auth/reauth` (SEC-S7; before inviting a second admin). The 0.1 routes do not change.

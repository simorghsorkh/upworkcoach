# Follow-up work after sprints 1 to 4 (version 0.1)

> Author: software-architect — 30 Mehr 1405 (2026-10-22). Source: reconciliation of `docs/04-architecture/**` with the code of sprints 1 to 4 (the notes in `sprint-1.md` to `sprint-4.md`, `routes.manifest.ts`, migrations `0001` to `0004`).
> This file is only a work list. The verdict and rationale for each item are in the referenced document. software-architect wrote no code.
> **Priority:** "High" = before deployment or before inviting the first real user, or the code differs from a requirement in `security.md`. "Medium" = before the beta. "Low" = backlog.

## Summary
| # | Title | Owner | Priority |
|---|---|---|---|
| F-01 | Persist "invite accepted" on `users` and show it in the student file (SEC-T5) — **backend done; UI remaining** | backend, frontend | **High** |
| F-02 | `PATCH /users/:id` and `PATCH /users/:id/role` — **backend done; UI remaining** | backend, frontend | **High** |
| F-03 | Biome `noRestrictedImports` rule for student routes (T-STATIC) — **done** | devops, backend | **High** |
| F-04 | Local list of about 100 thousand banned passwords (SEC-P3) — **done** | backend | **High** |
| F-05 | Full T-LOG (upload and CSV) — **done** | backend, qa | **High** |
| F-06 | `POST /auth/reauth` (SEC-S7) before inviting a second admin — **backend done; UI remaining** | backend, frontend | **High** (conditional) |
| F-07 | Confirm the accepted deviations from `security.md` — **closed** (29 Mehr 1405, 2026-10-21) | security-reviewer | ~~High~~ |
| F-08 | Align `/healthz` with SEC-J4 and a sweep staleness flag — **backend done; devops alert remaining** | backend, devops | **High** |
| F-09 | Separate review SLA for non-gate tasks (`reviewHoursNonGate` = 72) — **backend done; settings form field remaining** | backend | Medium |
| F-10 | `pg_trgm` on Azure Flexible Server before the first migration | devops | **High** |
| F-11 | "My devices" page (SEC-F3) | frontend | **High** |
| F-12 | Privacy page and its link on `/invite` and `/reset` (SEC-F4) | frontend, product | **High** |
| F-13 | Measure argon2 time on App Service B1 (SEC-P4) | devops, backend | **High** |
| F-14 | "Stale health" warning in the admin UI (ADR-0005) — **backend done; UI remaining** | frontend, backend | Medium |
| F-15 | `413` multipart test with a declared `Content-Length` — **done** | backend, qa | Low |
| F-16 | Editing a question message for up to 15 minutes | backend, frontend | Low |
| F-17 | Query parameters (mobile number, internal note, password hash) in the database error log — **done** | backend | **High** |
| F-18 | Make `TRUSTED_PROXY_HOPS` required in production (otherwise one IP for everyone and a global login lock) — **backend done; devops runbook remaining** | backend, devops | **High** |
| F-19 | CI security controls: `pnpm audit`, gitleaks, reject `"use server"`, Dependabot — **done** (30 Mehr 1405, 2026-10-22; real run on GitHub remaining) | devops | **High** |

> **Backend execution (backend-engineer, 3 Aban 1405, 2026-10-25):** lint is clean, typecheck is clean and the build succeeded. Test result: 1505 of 1507 passed. The two failures were in `src/components/auth/accept-token-form.test.ts` (frontend) and were jsdom timeouts under full load; that file alone passes 10 of 10. The new migration `0005_invite_accepted_session_reauth.sql` has **not been run** on the dev database (5432); project-lead will run it with `pnpm db:migrate`.

---

## F-01 — Persist "invite accepted" (SEC-T5) — High
- **Files:** `apps/web/src/modules/identity/schema.ts`, a new migration (`0005_…`), `identity/service.ts` (token acceptance), `identity/repo.ts` and `contracts.ts` (`GET /users`), `students/contracts.ts` and its repo (`StaffStudentDTO`), `identity/service.ts` (`eraseUser`), the staff student-file page.
- **Work:** Two columns, `users.invite_accepted_at timestamptz` and `users.invite_accepted_user_agent text` (max 512), filled in the same transaction that consumes the **`invite`** token. `GET /users` should read from these columns. `StaffStudentDTO` should also get `inviteAcceptedAt` and `inviteAcceptedDevice`, and the file should show them. `eraseUser` should set the User-Agent column to `null`. Data migration: fill the columns from the existing consumed `auth_tokens`.
- **Rationale:** `auth.cleanup` deletes tokens 7 days after use and the label disappears; SEC-T5 requires the display on the users page **and the file**, and the file does not have it. Decision: ADR-0003 item 9-9, `data-model.md` 2-1 and 6-1.
- **Status (backend-engineer, 1 Aban 1405, 2026-10-23): backend done; UI remaining.**
  - Migration `drizzle/0005_invite_accepted_session_reauth.sql`: columns `users.invite_accepted_at` and `users.invite_accepted_user_agent` (CHECK max 512 characters), plus a manual data step. This step copies each user's latest consumed invite token; for a deleted user the User-Agent is not copied. The `sessions.reauth_at` column (F-06) is in the same migration.
  - `acceptToken` writes these columns only for `purpose='invite'` and in the same transaction. A password reset does not change them. `GET /users` reads from these columns and the join with `auth_tokens` was removed. `eraseUser` sets the User-Agent to `null` and keeps the time.
  - Additive fields: `StaffStudentDTO.inviteAcceptedAt` and `StaffStudentDTO.inviteAcceptedDevice` (raw User-Agent). These two appear in `GET /students/:id` and in every response that carries this DTO. `UserListItemDTO.updatedAt` was also added for `ifUpdatedAt`. The student DTO does not have these fields.
  - **UI (frontend-engineer):** Show "Invite accepted: time, device type" in the staff student-file header (from `StaffStudentDTO.inviteAcceptedAt` and `inviteAcceptedDevice`) and on the users page (from `GET /users`). Converting the User-Agent to a readable name (for example "Chrome on Android") is UI work.

## F-02 — `PATCH /users/:id` and `/role` — High
- **Files:** `modules/identity/{service,contracts,repo}.ts`, `app/api/v1/users/[id]/route.ts` and `users/[id]/role/route.ts`, `routes.manifest.ts`, `students` (`buildSearchText`), the user management page.
- **Work:** Per `api.md` section 3: name, mobile number, `active`/`disabled`; role change with `409` for the last admin and for a student; revoke all sessions on disabling, role change and mobile change (`audit_log`: `user.phone_changed`, `user.role_changed`, `session.revoked_all`); `erasedAt` on the user gives `409`. If the target is a student, rebuild `students.search_text` in the same transaction. Test T-ESC "mentor `PATCH /users/:id/role` gives `403`" and T-SESSION for these three revocations.
- **Rationale:** Without these routes there is no way to immediately disable a mentor who has left (SEC-S4, ADR-0003 item 9-13). **Before inviting the first mentor.**
- **Status (backend-engineer, 1 Aban 1405, 2026-10-23): backend done; UI remaining.**
  - `PATCH /api/v1/users/:id` (admin only) with body `{ displayName?, phone?, status?: 'active'|'disabled', ifUpdatedAt? }` and response `UserListItemDTO`.
    - Errors: empty body gives `422`; stale `ifUpdatedAt` gives `409`; duplicate mobile number gives `409 PHONE_TAKEN`; deleted user gives `409`; disabling the last active admin gives `409`; `active` on an `invited` user gives `409` (a fresh invite link is needed).
    - Disabling revokes all sessions **and open links**. Changing the mobile number revokes all sessions. Changing only the name keeps the sessions.
    - `audit_log`: `user.updated`, `user.phone_changed` (without the number), `user.disabled` or `user.enabled`, and `session.revoked_all`.
    - For a student, `students.search_text` is rebuilt in the same transaction (`students/search-text.ts`).
  - `PATCH /api/v1/users/:id/role` (admin only) with body `{ role: 'admin'|'mentor' }` and response `UserListItemDTO`.
    - A student target gives `409`; `role: 'student'` gives `422`; removing the last active admin gives `409`; the same role gives `200` with no change.
    - A real change revokes all sessions and records `user.role_changed`, together with a warning log for SEC-L6. This route requires a fresh password (F-06).
  - Concurrency of the "last admin" condition is serialized with the advisory lock `identity.admin_set` and `SELECT … FOR UPDATE`.
  - Tests in `tests/integration/followups-hardening.test.ts`: T-ESC (mentor gives `403`), T-SESSION for disabling, role change and mobile change, and the last admin in a separate database.
  - **UI (frontend-engineer):** The user management page with name and mobile editing, a disable/enable button, role change (with the `REAUTH_REQUIRED` flow from F-06), and display of the `409` messages.

## F-03 — Biome `noRestrictedImports` (T-STATIC) — High
- **File:** `biome.json` (plus a simple import test in CI if needed).
- **Work:** Importing the `health` module and the internal-note functions (`timeline/repo` except `listSharedNotesForStudent`, the staff `timeline/service`) in `app/(student)/**` and `app/api/v1/me/**` should be an error.
- **Rationale:** ADR-0004 section 3 item 3 and T-STATIC in `security.md` section 6. Today only the separate DTO and the canary test prevent leakage.
- **Status (backend-engineer, 1 Aban 1405, 2026-10-23): done.**
  - An override for `apps/web/src/app/(student)/**` and `apps/web/src/app/api/v1/me/**` was added to `biome.json`. The `style/noRestrictedImports` rule at error level has three patterns:
    1. Any import from `modules/health`, by alias or relative path, value or type.
    2. From `modules/timeline/repo`, any name except `listSharedNotesForStudent`.
    3. From `modules/timeline/service`, any name except `listOwnSharedNotes`.
  - The test `tests/integration/t-static.test.ts` runs this configuration on sample files in a temporary folder; nothing is written in `src/`. The test checks both the error in student routes and the absence of an error in `(staff)`.
  - Biome 2.5 does not accept the `^…$` anchor in `importNamePattern`, because it assumes it implicitly.
  - **Run on the current frontend files:** `biome lint --only=style/noRestrictedImports` on `app/(student)` and `app/api/v1/me` gave no errors. There is no file for frontend-engineer to fix.

## F-04 — Banned password list (SEC-P3) — High
- **File:** `modules/identity/common-passwords.ts` (or a separate data file loaded at startup).
- **Work:** A local list of about 100 thousand common and leaked passwords (about 1 MB), with `Set` lookup, no external API; normalized with the same `normalizePassword`.
- **Rationale:** For now it has about 200 entries; ADR-0003 section 3 and item 9-11.
- **Status (backend-engineer, 1 Aban 1405, 2026-10-23): done.**
  - **Source:** SecLists (https://github.com/danielmiessler/SecLists), **MIT license** (Copyright (c) 2018 Daniel Miessler), commit `10a38f6cbe8ed6b89d55348756eff7486cd0f0ea` (HEAD of the master branch on 30 Mehr 1405, 2026-10-22).
  - Two files from `Passwords/Common-Credentials/` were used:
    - `100k-most-used-passwords-NCSC.txt` (sha256 `c2e5696882c603b76bb67a47ee970897e5a76fc4c3f5547abe3d0ca340c576e0`)
    - `Pwdb_top-1000000.txt` (sha256 `e9a88f67aafe65496682dc374559ee714e978bee50314767494c3e37a18c9fc8`)
  - The files were downloaded to a separate temporary folder outside the repository (scratchpad) and read only as text. No script from them was run.
  - `scripts/build-common-passwords.ts` is run manually and downloads nothing itself. Selection method:
    - Each entry is normalized with the same `normalizePassword` and lowercased.
    - Only printable ASCII of 8 to 128 characters is kept (shorter ones are rejected by the length rule).
    - First all of NCSC (46,453 entries), then Pwdb in order of frequency (53,547 entries), up to **100,000** unique entries.
  - Output: `src/modules/identity/common-passwords.data.ts`, about 1.08 MB. Its header has the source, commit, checksums and the full text of the MIT license. This file is excluded from Biome.
  - `common-passwords.ts` builds a Set on first use and also contains the earlier manual Iranian list. `normalizePassword` was moved to `password-normalize.ts` and is re-exported from `password.ts`; its signature did not change.

## F-05 — Full T-LOG — High
- **Files:** `tests/integration/` (new test), `server/logger.ts` if a leak is found.
- **Work:** Collect the log of one complete flow (invite, acceptance, failed login, login, search by mobile number, **upload**, **CSV export and import**) and search it for the full mobile number, token, cookie value, `$argon2id$` and `X-Job-Secret`.
- **Rationale:** T-LOG in `security.md` section 6; sprint 1 covered only part of it.
- **Status (backend-engineer, 1 Aban 1405, 2026-10-23): done.** Test `tests/integration/t-log.test.ts`.
  - **Flow:** invite a student, lookup and acceptance, failed login (existing and nonexistent mobile number), login, staff search with a mobile number in the query, upload, three CSV exports, a real CSV import (with `inviteUrl` in the response and one invalid row), the internal jobs endpoint and one API request, both with the `X-Job-Secret` header.
  - **Check:** The log of all logger levels is collected. These must not appear in it: the full mobile number pattern and any other form of the mobile number, token and invite link (both invites), the session and device cookie value, password, real hash, `$argon2id$` and the secret value.
  - **Result:** No leak was found. The only real leak was the one in F-17.

## F-06 — `POST /auth/reauth` (SEC-S7) — High (blocks inviting a second admin)
- **Files:** migration (`sessions.reauth_at`), `identity`, a new route, and the check in CSV export, `POST /invitations` (admin/mentor role), `PATCH /users/:id/role`, `PUT /settings` (key `access`).
- **Rationale:** ADR-0003 section 8 and item 9-12. Until it is built, **do not invite a second admin** (project-lead should record this in STATUS).
- **Status (backend-engineer, 1 Aban 1405, 2026-10-23): backend done; UI remaining.**
  - `POST /api/v1/auth/reauth` for any logged-in user, with body `{ password }`. A successful response is `200 { validUntil }` and `sessions.reauth_at = now()` is recorded, together with `audit_log(session.reauth)`.
  - A wrong password gives `422 fields.password`. Counting is done in the same lock `pwchange:u:<id>`, so change-password and reauth together are allowed at most 5 times in 15 minutes and then `429` is returned.
  - "Fresh password" means `max(sessions.created_at, sessions.reauth_at)` is less than **30 minutes** ago; so login and change-password count too.
  - New error code: **`403 REAUTH_REQUIRED`** with the message "Enter your password again to do this." (`apps/web/messages/en.json`).
  - This check applies only to admins; other roles get the same `403 FORBIDDEN` as before. Routes:
    - `GET /exports/students.csv`, `tasks.csv` and `milestones.csv`
    - `POST /invitations`
    - `PATCH /users/:id/role`
    - `PUT /settings` when the body has the `access` key, and `PUT /settings/access`
  - Server side: an additive field `lastPasswordAt` in `AuthenticatedSession` and `AuthenticatedRequest`, and the function `requireRecentPassword(auth)` in `server/auth/request.ts`.
  - **UI (frontend-engineer):** Wherever a `403` response with `error.code = 'REAUTH_REQUIRED'` arrives, open the "Enter your password again" dialog, send `POST /api/v1/auth/reauth` and repeat the same request. A CSV download with a plain link (`<a href>`) does not see this code; either do it with fetch or obtain reauth before downloading.
  - **Consequence:** The condition "before inviting a second admin" is met on the backend side. After the UI is built, project-lead should remove the STATUS note.

## F-07 — Confirm the accepted deviations from `security.md` — **closed** (security-reviewer, 29 Mehr 1405, 2026-10-21)
> **Result:** `docs/06-quality/security-review-2026-10-21.md` section 1. All five items below are **acceptable**, and the wording of SEC-S1, SEC-C3, SEC-R6 and SEC-U6 in `security.md` was corrected. Item 5 was accepted **with a condition**: T-DTO and T-CANARY must keep searching for `reviewerId` and staff mobile numbers. Other deviations were also examined: the uniform `422` for a referenced ID is **acceptable** (it has no oracle). Token deletion after 7 days was accepted **with a condition**: F-01 must be built before the first real student is invited. The remaining items of ADR-0003 item 9, ADR-0004 item 6 and ADR-0010 are **acceptable**. The code review had three new findings: F-17, F-18 and F-19.

security-reviewer should accept each item (and correct the requirement text) or reject it (in which case it becomes code work):
1. **SEC-S1:** cookie `Max-Age` = the absolute session limit, not the sliding expiry (ADR-0003 item 9-1). File: `identity/service.ts` (`cookieExpiresAt`).
2. **SEC-C3:** A bodyless POST without `Content-Type` is accepted (item 9-2). File: `server/http/csrf.ts` and `route()`.
3. **SEC-R6:** The `429` body has, in addition to `retryAfterSeconds`, a `code` and a fixed Persian message with the remaining minutes (item 9-3).
4. **SEC-U6:** `GET /attachments/:id` with `Cache-Control: private, no-store` (stricter than `no-cache`).
5. **Student DTO:** `StudentReviewDTO.reviewer.displayName` (the reviewer's name, not the ID; ADR-0004 item 6-5).

## F-08 — `/healthz` per SEC-J4 + sweep staleness — High
- **File:** `apps/web/src/app/healthz/route.ts` (plus devops alert configuration).
- **Work:** Response `{ ok: true, db: 'ok', lastHealthSweepAt, version, sweepStale }`; failure `503 { ok: false, db: 'fail' }`. `version` from a build variable (for example the commit SHA). `sweepStale = true` if the last sweep is older than 3 hours. If the container HEALTHCHECK or monitoring depends on `status`, fix it at the same time.
- **Rationale:** The code returns `{ status, db: 'unreachable' }` without `version` (SEC-J4, `api.md` section 15); ADR-0005 and ADR-0007 require a staleness alert.
- **Status (backend-engineer, 1 Aban 1405, 2026-10-23): backend done; devops alert remaining.**
  - `GET /healthz`: a successful response is `200 { ok: true, db: 'ok', lastHealthSweepAt, version, sweepStale }` and a database failure is `503 { ok: false, db: 'fail' }`, with `Cache-Control: no-store`. The error log has only the type, SQLSTATE and constraint (F-17).
  - `version` is read from a new optional environment variable **`APP_VERSION`** (only `[\w.+-]{1,64}`; `'dev'` if absent).
  - `sweepStale` (function `getHealthFreshness` in `health/recompute.ts`) means the **oldest** `computed_at` among `active` and `paused` students is more than 3 hours old. The "latest" result is not enough, because recomputation after each action keeps it fresh even when the job has stopped. If there is no result (fresh install) it is `false`.
  - The container HEALTHCHECK in the `Dockerfile` only looks at the HTTP code and did not depend on the `status` field, so no change was needed.
  - **devops:** Set `APP_VERSION=<commit SHA>` in the build or deployment (`Dockerfile` is outside the backend boundary). Set the monitoring alert on `sweepStale = true` and on `503`.

## F-09 — Review SLA for non-gate tasks — Medium
- **Files:** `modules/catalog` (schema and `sla` default), `modules/tasks/service.ts` (`getReviewQueue`, about line 1165), `modules/today/service.ts`, `GET /settings/staff`, the settings form.
- **Work:** Key `sla.reviewHoursNonGate` (default 72; a stored value without this key is filled with 72). Threshold = `required_for_gate ? reviewHours : reviewHoursNonGate`, in the review queue, `waitingOnUs` and the counters.
- **Rationale:** `mentor-workflow.md` section 4 (gate 48, non-gate 72); decision in `data-model.md` 2-2 and 4-3 (open question of sprints 3 and 4).
- **Status (backend-engineer, 1 Aban 1405, 2026-10-23): backend done; settings form field remaining.**
  - `slaSettingsSchema.reviewHoursNonGate` with `.default(72)`: an old stored value without this key reads as 72, with no migration. `SETTINGS_DEFAULTS.sla.reviewHoursNonGate = 72`.
  - The function `reviewSlaHours(requiredForGate, sla)` in `tasks/service.ts` gives the threshold for the review queue (`slaHours`, `breached`, `warning`). `waitingOnUs` and `counts.breachedReviews` in "Today" also come from this queue.
  - Additive field `StaffSettingsDTO.sla.reviewHoursNonGate` in `GET /settings/staff`.
  - **UI (frontend-engineer):** `SlaSettingsForm` in `components/settings/settings-forms.tsx` does not have this field. Because PUT sends the whole `sla` value, saving the current form resets any non-default value of this key to 72. Add a "Non-gate task review (hours)" field.

## F-10 — `pg_trgm` on Azure — High (before the first migration on the host)
- **Files:** deployment IaC/runbook (devops); `apps/web/drizzle/0002_students_path.sql` **unchanged**.
- **Work:** Server parameter `azure.extensions` including `PG_TRGM`; the migrate role is a member of `azure_pg_admin`. Alternative in the runbook: create the extension once with an admin role (the migration passes with `IF NOT EXISTS`).
- **Rationale:** Without it migration `0002` fails on Azure; decision in `data-model.md` section 0.

## F-11 — "My devices" page (SEC-F3) — High
- **Files:** `app/(account)/account/…`, a new component in `components/auth/`.
- **Work:** A list from `GET /auth/sessions` (device, IP, last use, "this device") + sign out one by one with `DELETE /auth/sessions/:id` + "Sign out of all other devices".
- **Rationale:** The API has been ready since sprint 1 but has no UI; SEC-F3 is a "must".

## F-12 — Privacy page (SEC-F4, ADR-0010 item 7) — High (before real data is entered)
- **Files:** a new public page (for example `app/privacy/page.tsx`), a link in `/invite`, `/reset` and `/account`.
- **Work:** Where the data is kept, what is stored, the 30-day deletion deadline, and retention for up to 8 weeks in the encrypted backup. The final text depends on the hosting location (E1) and founder approval (S1).

## F-13 — argon2 time on B1 (SEC-P4) — High (before deployment)
- **Work:** Measure on App Service B1 (locally it is about 25 milliseconds; the target is 50 to 250). If it is under 50, raise `timeCost` (automatic rehash on login already exists). File: `modules/identity/password.ts`.

## F-14 — "Stale health" warning in the admin UI — Medium
- **Files:** `modules/health/service.ts` or `today` (add `lastHealthSweepAt` to the admin DTO), the "Today" page.
- **Work:** If the last sweep or `computedAt` is older than 3 hours, a small warning for the admin (ADR-0005 "Consequences").
- **Status (backend-engineer, 1 Aban 1405, 2026-10-23): backend done; UI remaining.** The additive field **`TodayDTO.healthFreshness`** is returned only for admins, not mentors: `{ lastHealthSweepAt, oldestComputedAt, stale, staleAfterHours: 3 }`. Its rule is the same as `sweepStale` in `/healthz`.
  - **UI (frontend-engineer):** On the admin "Today" page, if `healthFreshness.stale` is true, show a small warning "Health statuses have not been updated since …".

## F-15 — `413` multipart test — Low
- **File:** `tests/integration/attachments.test.ts`.
- **Work:** A multipart request with a `Content-Length` above the cap that the test helper does not rewrite (the JSON path of this test has it with `readBodyBytes`). Left over from `sprint-3.md`.
- **Status (backend-engineer, 1 Aban 1405, 2026-10-23): done.** The test is in `tests/integration/followups-hardening.test.ts`, not `attachments.test.ts`, so the existing file is untouched. A manual Request is sent with a 6 MB `Content-Length` and a streaming body whose consumption is counted. The result is `413 PAYLOAD_TOO_LARGE` and less than 512 KB of the stream is read.

## F-16 — Editing a question message — Low (backlog)
- **Work:** `PATCH /questions/:id/messages/:messageId` for the author only and only for up to 15 minutes, with `edited_at`. Deliberately not built in 0.1 (`data-model.md` 2-8, `api.md` section 10).

## F-17 — Query parameters in the error log — High (before real data is entered)
- **Severity:** Medium. Source: security-review-2026-10-21, N1.
- **Files:** `apps/web/src/server/http/handler.ts:184-195` (`describeError`), `modules/health/recompute.ts:137-140`, `modules/files/service.ts:232-235`, a new helper in `server/` (for example `safeErrorSummary`), `tests/integration/` (T-LOG).
- **Problem:** `drizzle-orm` 0.45 wraps every database error in a `DrizzleQueryError`, and its message contains the SQL **and all parameters**. `describeError` logs it with `message` and `stack`. An Azure restart, a deadlock or a CHECK violation on an INSERT of a note, user or delivery writes the internal note text, mobile number, name or argon2 hash to the 30-day log (violating SEC-L3 and SEC-L4).
- **Work:** For an error that has `query` or `params`, log only `type`, `cause.code` (SQLSTATE), `constraint` and `table`; no `message`, `params`, `detail` or `stack`. The same function should also be used in the two other places. T-LOG test: a deliberate violation on a note INSERT with text `CANARY-…` must not appear in the log.
- **Status (backend-engineer, 1 Aban 1405, 2026-10-23): done.**
  - The function `safeError` in `server/logger.ts` returns only `{ type, database: true, code, constraint, table }` for a database error; no `message`, parameters, `detail` or `stack`. A database error means `DrizzleQueryError`, or an error that has `query`, `params` or an SQLSTATE in itself or in its `cause`.
  - Where it is used: `describeError` in the handler, `health.recompute_failed`, `health.sweep_failed`, `files.delete_failed` and `/healthz`. The same function is also the pino serializer for the `err` and `error` keys, so `pool error` and `pg-boss error` are covered too.
  - Test: a real violation of `users_phone_key` whose parameters are a mobile number, the text of an "internal note" and an argon2 hash. The first test confirms that the raw error really contains the mobile number. Then both the handler path and the real pino output with the serializers are checked.

## F-18 — `TRUSTED_PROXY_HOPS` in production — High (before deployment)
- **Severity:** Medium. Source: security-review-2026-10-21, N2.
- **Files:** `apps/web/src/server/env.ts:16, 44`, `server/http/client-ip.ts:27`, deployment runbook (devops).
- **Problem:** The default is `0` and production does not require it. On App Service without it, every user's IP becomes `unknown` and no warning is logged either. Then 30 wrong logins from anyone in 15 minutes **block login for everyone** (the device cookie does not bypass this), 30 wrong lookups block all invites, and 5 wrong passwords lock the admin account (R4 reopens).
- **Work:** In `NODE_ENV=production` an explicit value should be required (no default); `0` only with another explicit flag. If `X-Forwarded-For` arrives with `hops=0`, log a one-time warning. Record the value `1` for App Service in the runbook, and after deployment check that `sessions.ip` of the latest login is the real IP without a port (SEC-R4). If a CDN or another proxy is added later, update the number.
- **Status (backend-engineer, 1 Aban 1405, 2026-10-23): backend done; devops runbook remaining.**
  - The default was removed from `env.ts`. In `NODE_ENV=production`, if `TRUSTED_PROXY_HOPS` is absent or empty, the app does not start. `0` is a valid explicit value. Outside production the default is still `0`.
  - A separate flag for "explicit 0" was not built, because writing the explicit value is itself a deliberate decision.
  - If `X-Forwarded-For` arrives with `hops=0`, the warning `http.xff_ignored` is logged once per process.
  - Unit tests in `env.test.ts` and `client-ip.test.ts`. `docker-compose.yml` already has a default of `1`.
  - **devops:** Record `TRUSTED_PROXY_HOPS=1` in App Settings and the runbook, and check `sessions.ip` after deployment.

## F-19 — CI security controls and Dependabot — High (before deployment)
- **Severity:** Medium. Source: security-review-2026-10-21, N3.
- **Files:** `.github/workflows/ci.yml`, `.github/dependabot.yml` (new), audit exceptions file (new).
- **Problem:** CI has only lint, typecheck, test and build. SEC-D1, SEC-D2, SEC-K1 (gitleaks), SEC-A10 (`"use server"`) and part of T-STATIC are not enforced. If a new critical vulnerability is published in Next.js or React (like CVE-2025-55182), no alert arrives.
- **Work:** Add the steps `pnpm audit --prod --audit-level=high` (blocks merge, with a dated exceptions file), gitleaks and `! grep -rnE "['\"]use server['\"]" apps/web/src`. Weekly Dependabot for npm and GitHub Actions, with a separate group for `next`, `react`, `sharp` and `@node-rs/argon2`. Trivy after the Dockerfile is built (SEC-D4).
- **Status: done** (devops-engineer, 30 Mehr 1405, 2026-10-22). Not committed or pushed.
  - `ci.yml`: two new jobs. `security` includes `scripts/ci-no-server-actions.sh` (a search for `"use server"` in `apps/` and `packages/`, excluding test folders) and `scripts/ci-audit.mjs`. This script fails on runtime dependencies at high level and above and on all dependencies at critical level. `secrets` is gitleaks-action v3.0.0 with gitleaks 8.30.1 and `fetch-depth: 0`. On push and PR only the new commits are scanned, and on the scheduled run the whole history. A weekly run (Saturday 6 AM Tehran) repeats the audit and the full scan without any code change. All actions are pinned with a full SHA. The default `permissions` is only `contents: read` and the gitleaks job adds only `pull-requests: read`. `persist-credentials: false` is also set.
  - Exceptions file: `.github/audit-exceptions.txt`. Each line has a GHSA, a review date (at most 90 days ahead) and a reason. An expired exception breaks CI. If the registry returns an error, CI is closed (fail closed). `pnpm audit --ignore` was not used, because pnpm 12 writes it undated in `pnpm-workspace.yaml`.
  - `.github/gitleaks.toml`: the default rules plus a narrow allowlist for `env.NAME`. The reason was the false positive `secretKey: env.S3_SECRET_KEY` in `storage/index.ts`.
  - `.github/dependabot.yml`: npm and github-actions, both weekly. A separate `runtime-core` group (security and version updates) was defined for `next`, `react`, `react-dom`, `sharp` and `@node-rs/argon2`.
  - **Local run (30 Mehr 1405, 2026-10-22):** `pnpm audit --prod` showed no vulnerabilities. Across all dependencies there is only one moderate item: GHSA-67mh-4wv8-2f99 in esbuild 0.18.20, only in the development environment and through `drizzle-kit`. This item is below the threshold and needs no exception. Both the audit gate and the `"use server"` gate passed. The failure paths were also tested: a canary file, an expired exception and a registry error. gitleaks 8.30.1 with this configuration found no leak in the history (1 commit) and the tracked and untracked working files, and it caught the canaries.
  - **Testable only on GitHub:** the workflow run itself, the behavior of gitleaks-action (PR range, not needing a license on a personal account), and Dependabot. Dependabot support for the pnpm 12 lockfile is not confirmed (a search on 30 Mehr 1405, 2026-10-22 found no document). If its PRs fail with `--frozen-lockfile`, replace it with Renovate. **Manual work for the repository admin:** turn on Dependabot alerts and security updates in Settings, and make the `security` and `secrets` jobs required checks in branch protection (otherwise they do not "block merge").
  - **Remaining:** Trivy on the image after the Dockerfile is built (SEC-D4). F-03 (`noRestrictedImports`) is separate.

---

## Open questions closed without code work
| Question (sprint) | Verdict | Document |
|---|---|---|
| Not starting with an invalid env (1) | Solved in the sprint 4 code (`instrumentation.ts` → `getEnv()`) | ADR-0003 item 9-8 |
| Concurrency of stage deactivation and stage change (2) | No lock needed; the resulting state is displayable and fixable | `data-model.md` 2-2 (`stages`) |
| `search_text` after a rename (2) | Part of F-02, in the same transaction | `data-model.md` 2-3 |
| Jalali date in the import CSV (3) | Built in sprint 4; documented exception in ADR-0008 | ADR-0008 section 6 |
| FK for question attachment and milestone (3) | Added in `0004` | `data-model.md` 2-5 |
| `/healthz` and `lastHealthSweepAt` (4) | Connected; remainder is F-08 | ADR-0007 |
| Should `nextDueDate` extend the account? (4) | No; the backend decision was confirmed | ADR-0005, `data-model.md` 2-5 |
| Referenced IDs `createTemplateIds` and `cancelTaskIds` (4) | Added to the ADR-0004 section 1-1 table | ADR-0004 |

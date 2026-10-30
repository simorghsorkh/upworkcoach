# Code security review — version 0.1, after sprints 1 to 4

> 29 Mehr 1405 (2026-10-21) — author: security-reviewer — task: F-07 in `docs/05-delivery/followups.md`
> Inputs: `docs/04-architecture/security.md`, ADR-0003 item 9, ADR-0004 item 6, ADR-0007 and ADR-0010 (the "Conformance with the implementation" sections), `sprint-1.md` to `sprint-4.md` (assumptions and "differs from the doc"), and the `apps/web/src` code on the same day.
> Method: reading code and documents only. No server or database was started and no test was run against a real environment. Line numbers refer to this version of the code. backend-engineer and frontend-engineer are working at the same time, so lines may shift slightly.

---

## 0. Summary

- **All the accepted deviations in F-07 are acceptable.** None of them creates an abuse scenario that the original design would have prevented and the current code does not. Two have conditions: "invite accepted" until F-01 is built, and the reviewer name in the student DTO.
- The wording of requirements SEC-S1, SEC-C3, SEC-R6 and SEC-U6 in `security.md` was corrected to match these verdicts.
- **Three new findings that must be fixed** (none is critical or high):

| # | Finding | Severity | Followup |
|---|---|---|---|
| N1 | An unexpected database error writes **all query parameters** to the log: mobile number, internal note text, password hash and any other data | Medium | F-17 (high) |
| N2 | If `TRUSTED_PROXY_HOPS` is not set in production, all users get one IP (`unknown`), and anyone with 30 wrong passwords in 15 minutes can lock **every user out of login**. No warning is logged either | Medium | F-18 (high) |
| N3 | CI has no security controls: no `pnpm audit`, no gitleaks, no `"use server"` search, and no Dependabot or Renovate | Medium | F-19 (high) |

- **What was built correctly** (section 3): `loadInScope` and `assertRefs`, student DTOs built from scratch, CSRF, uploads, CSP and headers, CSV, the internal jobs endpoint and invite tokens.

---

## 1. Verdicts on the deviations (F-07)

The severity scale is the same as the one in `security.md` section 3. "Residual severity" means the risk that remains after the deviation is accepted.

### 1-1. SEC-S1: cookie `Max-Age` up to the absolute session limit, with sliding expiry on the server (ADR-0003 item 9-1)
- **Code:** `modules/identity/service.ts:177-194` (`cookieExpiresAt = absoluteExpiry`); `server/auth/request.ts:58-71`; `modules/identity/session-policy.ts:29-32` (`slidingExpiry` never goes past the absolute limit) and `:44-53` (`isSessionValid` checks `expires_at`, the absolute limit, `revoked_at`, `status`, `erased_at` and `password_changed_at` on every request); both the API path (`server/auth/request.ts:40-53`) and the RSC path (`server/auth/current-user.ts:28-36`) go through the same `authenticateSession` (`identity/service.ts:211-235`).
- **Scenario examined:** Someone takes the cookie of a mentor who has not used the system for 8 days, from a shared laptop. The cookie is still in the browser but `expires_at` has passed on the server, so the result is `null`, then `401` or a redirect to `/login`. Logout, password change, token acceptance and account deletion also invalidate the session on the server. So the cookie lifetime grants no extra access.
- **Only effect:** A dead token stays on disk until the absolute limit. It is stored hashed and has no value after expiry.
- **Verdict: acceptable.** Residual severity: none. The SEC-S1 wording was corrected.

### 1-2. SEC-C3: bodyless POST without `Content-Type` (ADR-0003 item 9-2)
- **Code:** `server/http/csrf.ts:30-32` (`Origin` is required and must match exactly), `:35-36` (`Sec-Fetch-Site`), `:39-43` (a missing `Content-Type` is allowed only when `Content-Length` and `Transfer-Encoding` are absent); second layer in `server/http/handler.ts:202` (non-empty body without `Content-Type` gives `415`) and `:211-219` (the bodyless path rejects any body other than empty or `{}`).
- **Scenarios examined:**
  1. An attacker site sends `fetch(url, {method:'POST', mode:'no-cors', credentials:'include'})` with no body. It has no `Content-Type` but it carries the attacker's `Origin`, so the result is `403`.
  2. A sibling subdomain (for example WordPress on `www.`). `Origin` does not match, so `403`.
  3. HTTP/2 without `Content-Length` and with a body. It passes `csrf.ts`, but `handler.ts:202` returns `415` or `:215` returns `422`.
  4. A request without `Origin` gives `403`. Modern browsers send `Origin` on every POST, even same-origin.
- **Verdict: acceptable.** Residual severity: low. The main defense is the exact `Origin` check, which is enforced without exception. The SEC-C3 wording was corrected.

### 1-3. SEC-R6: `429` body with `code` and a Persian message that includes the remaining minutes (ADR-0003 item 9-3)
- **Code:** `server/http/errors.ts:122-127`; identical counting for a nonexistent mobile number: `identity/service.ts:292-297`; lock calculation: `:278-283`.
- **Scenario examined:** An attacker tries to guess whether an account exists from differences in the `429` response. The message is built only from `retryAfterSeconds` and carries no new information. Because lock `p` is also counted for a nonexistent mobile number, even the 60-minute figure does not reveal whether the account exists. (That the lock tier can be inferred from 15 versus 60 minutes was already accepted in the design.)
- **Verdict: acceptable.** Residual severity: none. The SEC-R6 wording was corrected.

### 1-4. SEC-U6: `GET /attachments/:id` with `Cache-Control: private, no-store`
- **Code:** `server/http/handler.ts:150-155` (`finalizeHeaders` always sets `private, no-store`); `app/api/v1/attachments/[id]/route.ts:16-20`.
- **Verdict: acceptable.** It is stricter than required and meets goal C4 better: after logout on a shared device the image cannot be seen from the cache. The only cost is downloading again on a poor connection. The SEC-U6 wording was corrected.

### 1-5. Student DTO: `StudentReviewDTO.reviewer.displayName` (ADR-0004 item 6-5)
- **Code:** `modules/tasks/service.ts:236-266` (the DTO is built from scratch; line `247` sets only `displayName`); type in `modules/tasks/contracts.ts:342-348`.
- **Scenario examined:** A student infers from the reviewer name which other mentor has seen their file. When `mentorScope = 'all'`, or when an admin reviews, the student sees the name of another staff member. A staff display name is not sensitive data, and the same pattern is already accepted in `SharedNoteDTO.author.displayName`. The ID, mobile number and `reviewerId` are not included.
- **Verdict: acceptable with conditions:** (1) T-DTO and T-CANARY must keep searching all student responses for `reviewerId` and staff mobile numbers; (2) after a staff account is deleted, the name must show as "deleted user" (this is already the case per ADR-0010).

### 1-6. Uniform `422` for all referenced IDs, including `studentId` and `studentIds` (ADR-0004 section 1-1; differs from C3, which asked for `404` for an out-of-scope student resource)
- **Code:** `modules/access/refs.ts:65-78` (one `INVALID_REF_MESSAGE` for nonexistent, out of scope, another student's, and inactive), `:87-95` (`studentsInScope`: existence and scope both return the same `false`); `server/http/errors.ts:109`; attachments use the same text in `modules/files/service.ts:178-181`; `404` only for the path ID in `modules/access/scope.ts:251-267`.
- **Scenario examined:** A mentor tries IDs in `POST /reminders {studentId}` or `POST /tasks/bulk {studentIds}` to find the ID of another mentor's student. For "nonexistent" and "out of scope" they get the same `422` with the same body, so there is no oracle. The IDs are also UUIDv7 and unguessable. In `cancelTaskIds`, the `409 INVALID_TRANSITION` code is returned only **after** the ref passes (that is, for a task of the same student) and says nothing about another student.
- **Verdict: acceptable.** Residual severity: none. Goal C3 (full rejection with no leakage) is preserved; only the status code differs.

### 1-7. Tokens purged 7 days after use, and "invite accepted" disappearing (ADR-0003 item 9-9, ADR-0010)
- **Code:** `modules/identity/repo.ts:410-423` (consumed, expired or revoked tokens are deleted after 7 days); `modules/identity/service.ts:537-543` (`audit_log(user.invite_accepted)` with time and IP in the same transaction).
- **Scenario examined:** A student's invite link was forwarded in a Telegram group. Someone who knows the student's mobile number accepts it. Ten days later the student says "the link did not work". Today the "accepted: time, device" label in `GET /users` is gone and it is not in the file either, so the coach may just create a new link and never notice the takeover. The full evidence is not lost: `audit_log` keeps time and IP for 24 months (IP for 90 days). But the User-Agent is not in it and the coach cannot see it in the UI.
- **Keeping the token itself for 7 days:** correct. There is no reason to keep a token hash just for a display label.
- **Verdict: acceptable with a condition:** F-01 (columns `users.invite_accepted_at` and `invite_accepted_user_agent` and their display in the file) must be built **before the first real student is invited**, with a data migration from existing tokens or `audit_log`. Residual severity until then: low.

### 1-8. Other items found in notes and ADRs
| Item | Code examined | Verdict |
|---|---|---|
| ADR-0003 9-5: `admin:reset-link` for an `invited` user gives a 1-hour **invite** link | `identity/service.ts:834-870` (clears locks, `audit_log` with `via: 'cli'`) | **Acceptable.** It runs only from the server console and is the same as SEC-T7 |
| ADR-0003 9-7: random device secret outside production | `server/env.ts:44` (in production the app does not start without it); `identity/service.ts:137-142` | **Acceptable** |
| ADR-0003 9-10: password change with a wrong current password gives `422` + lock `pwchange:u` | `identity/service.ts:361-375` | **Acceptable.** Guessing the current password with a stolen session is limited to 5 attempts in 15 minutes |
| sprint-1 assumption 11: `auth.locked` in `audit_log` only for an existing account | `identity/service.ts:307-323` | **Acceptable.** This is the same as SEC-L7. The IP lock goes to the structured log |
| ADR-0004 6-1: the `access` module reads other tables directly and read-only | `modules/access/repo.ts` | **Acceptable.** It is SELECT only; any write in this file must be rejected in code review |
| ADR-0004 6-3: a mentor re-creating an invite link without `mentorsCanInviteStudents` | `identity/policy.ts:37-52`, `identity/service.ts:654-689` | **Acceptable.** The C3 conditions (`role='student'`, `invited`, in scope) are checked before anything else. Scenario B4 (mentor to admin) is closed |
| ADR-0004 6-4: every staff member in scope reviews | `tasks/service.ts` (review through `loadInScope`) | **Acceptable** |
| ADR-0004 6-7: an out-of-scope assignee sees the thread's attachments while it is open | `files/service.ts:108-120` | **Acceptable.** After the thread is closed it is `404` |
| ADR-0004 section 1-1: `existingStudentId` in `409 PHONE_TAKEN` for admin only | `students/service.ts:355-361` | **Acceptable** |
| ADR-0010: an undeleted attachment becomes an old `pending` row on account deletion | `files/repo.ts:149-183` | **Acceptable.** `uploaded_by` remains, so only the uploader can access a file they sent themselves until the next cleanup (at most 24 hours). The file name has been erased |

---

## 2. New findings (must be fixed)

### N1 — Query parameters in the error log — Medium (F-17)
- **Location:** `apps/web/src/server/http/handler.ts:184-195`, especially `:193` (`{ type, message: err.message, stack: err.stack }`); the same pattern in `modules/health/recompute.ts:137-140` (`error: (err as Error).message`).
- **Root cause:** `drizzle-orm` 0.45 wraps every driver error in a `DrizzleQueryError`, and its message is `Failed query: <sql>\nparams: <all parameters>` (`node_modules/drizzle-orm/errors.js:10-19`, `pg-core/session.js:41`). `stack` repeats the same message. pino's `redact` (`server/logger.ts`) masks only keys and does not look inside strings.
- **Realistic scenario:** Azure Flexible Server restarts during planned maintenance, or an unexpected deadlock, timeout or CHECK violation occurs. Every INSERT or UPDATE in flight becomes a `500`, and `http.unhandled` writes these to the application log:
  - `INSERT INTO notes` gives the text of the **internal note** (sensitivity Class 3);
  - `INSERT INTO users` gives the **mobile number and name** (sensitivity Class 2, violating SEC-L3);
  - `UPDATE users SET password_hash` in `acceptToken` gives the **argon2 hash** (sensitivity Class 3; T-LOG searches for exactly `$argon2id$`);
  - `INSERT INTO submissions` gives the proposal and job posting text (sensitivity Class 2).
  
  The log is kept for 30 days and reaches anyone with access to the App Service log. The current T-LOG (F-05) checks only the success path and does not see this.
- **Fix:** In `describeError`, if the error has `query` or `params` (or `name === 'DrizzleQueryError'`), log only `{ type, sqlState: cause.code, constraint: cause.constraint, table: cause.table }`: no `message`, `params`, `detail` or `stack` (`detail` contains the value in a unique violation). For other errors, keep `stack`. Create one shared function `safeErrorSummary(err)` in `server/` and use it in `health/recompute.ts:137` and `files/service.ts:232` too. Also add a case to T-LOG: a deliberate CHECK or unique violation on a note INSERT with text `CANARY-…`, then search the log for it.

### N2 — `TRUSTED_PROXY_HOPS` is not required in production and its default fails silently — Medium (F-18)
- **Location:** `apps/web/src/server/env.ts:16` (`default(0)`) and `:44` (in production only `DEVICE_COOKIE_SECRET` is required); `server/http/client-ip.ts:27` (with `0` it returns `unknown` without a warning; a Route Handler has no access to the socket address, `:14-15`).
- **Realistic scenario:** The deployment to App Service is done without `TRUSTED_PROXY_HOPS=1`. The value is zero in `.env.example` and the app starts without error. From then on every user's IP is `unknown`:
  1. An anonymous attacker sends 30 wrong logins with random mobile numbers every 15 minutes. The lock `login:ip:unknown` (SEC-R3) blocks **login for every user**. The device cookie does not bypass this layer (`identity/service.ts:278-283`).
  2. The same with 30 wrong `tokens/lookup` calls blocks acceptance of all invites and resets.
  3. 5 wrong passwords for the coach's mobile number create the `pi` lock, because "mobile + IP" has effectively become "mobile". This lock also locks out the known device and reopens scenario R4.
  4. The IP column in `sessions` and `audit_log` becomes useless.
  
  The reverse can also happen: if a CDN is put in front of the server during an emergency migration (section 8) and the number is not updated, the proxy's IP is read instead of the user's IP.
- **Fix:** In `env.ts`, when `NODE_ENV=production`, `TRUSTED_PROXY_HOPS` must be **explicitly set** (no default). If its value is `0`, accept it only with another explicit flag (for example `ALLOW_NO_PROXY=true`). When `X-Forwarded-For` arrives in production with `hops=0`, log a one-time `http.xff_ignored` warning. Record the value `1` for App Service in the deployment runbook (devops), with a post-deployment check: `sessions.ip` of the latest login equals the real IP (port stripped; SEC-R4 is still not verified).

### N3 — No CI security controls or dependency updates — Medium (F-19)
- **Location:** `.github/workflows/ci.yml` (only lint, typecheck, test and build); there is no `.github/dependabot.yml` or Renovate configuration in the repository.
- **Requirements not enforced:** SEC-D1 (Dependabot/Renovate), SEC-D2 (`pnpm audit --prod --audit-level=high` blocking merge), SEC-K1 (gitleaks), SEC-A10 (reject `"use server"` in CI), T-STATIC. Today the code contains no `"use server"` or `dangerouslySetInnerHTML`, and `noDangerouslySetInnerHtml` is enabled in Biome's `recommended`. So the problem is the lack of a **barrier for the future**, not a current flaw.
- **Realistic scenario:** A new critical vulnerability is published in Next.js or React, of the same kind as CVE-2025-55182 (remote code execution in RSC, December 2025). The only developer does not find out, because there is no Dependabot alert and no `audit` failure in CI. The vulnerable version stays on the internet, which means access to all class-3 data (names, mobile numbers and Upwork links of all students; R1).
- **Fix:** Add three steps to `ci.yml`: `pnpm audit --prod --audit-level=high` (with a dated exceptions file), gitleaks on the diff, and `! grep -rn --include='*.ts*' -E "['\"]use server['\"]" apps/web/src`. Also create a weekly `.github/dependabot.yml` for npm and GitHub Actions that groups security updates for `next`, `react`, `sharp` and `@node-rs/argon2` separately. Trivy on the image should be added too once the Dockerfile exists (SEC-D4).

---

## 3. Quick code review: what was checked and was correct

| Area | What I saw | Location |
|---|---|---|
| `loadInScope` | 12 resource types, each traced up to the root `student_id`; a student always gets `404`; nonexistent and out-of-scope give one `404`; a type without a resolver raises an error rather than "allowed" | `modules/access/scope.ts:251-267` |
| `assertRefs` | Inside the write transaction, before the write; all rows of the ADR-0004 1-1 table are used (`students`, `tasks`, `questions`, `reminders`, `milestones`, `path`); a mentor's `mentorId` is ignored when creating a student and a reminder's `ownerId` can only be themselves | `modules/access/refs.ts`; `students/service.ts:372-388`; `reminders/service.ts:134-139` |
| Notes | Edit and delete: "author **and** in scope" or admin (B7 closed); an internal to shared change is recorded in `audit_log` | `timeline/service.ts:140-200` |
| `summary` for an assignee | Only with an open or answered thread (SEC-A8) | `students/service.ts:614-632` |
| Shared paths | `switch` on role with `default` giving `403`, not the staff DTO (SEC-A5) | `tasks/service.ts:421-435`; `questions/service.ts:297-312` |
| Student DTOs | Built from scratch, no database row spread; no `reviewerId`, creator, counters, cancellation reason, health or flags. Notes only if `shared` and not deleted, with the author's name | `tasks/service.ts:148-167, 236-266`; `timeline/service.ts:204-222`; `timeline/repo.ts:86-96` |
| Student routes | `(student)/layout` and `_load.ts` use `requireUser(['student'])`; there is no import of `health`, `timeline/repo` or a staff service in `app/(student)` and `api/v1/me` (the lint rule does not exist yet; F-03) | `app/(student)/_load.ts:7-8` |
| Password hash | `password_hash` is read only in `getCredentialsByPhone` (SEC-A9) | `identity/repo.ts:49` |
| zod | All input schemas are `strictObject`; the error message does not repeat the input value (SEC-A7, SEC-L4) | `server/http/validation.ts` |
| URL | `httpsUrl` (`https:`, no user/pass) for profile, delivery link, question, stage `contentLinks` and CSV import; `ExternalLink` with `rel="noopener noreferrer"` | `server/http/schemas.ts:17-30`; `components/ui/ltr.tsx:50-67` |
| Upload | Byte cap before buffering; type from content; 40 megapixels; `rotate` leads to re-encoding without metadata; queue of 2; quota; atomic attach `pending AND uploaded_by`; file name without control and bidi characters; storage key is a UUID; download with CSP `sandbox`, `nosniff` and the re-encoded `Content-Type` | `server/http/handler.ts:230-248`; `modules/files/image.ts:46-102`; `modules/files/service.ts:58-182`; `app/api/v1/attachments/[id]/route.ts` |
| CSP and headers | CSP with a per-request nonce, no external sources; `unsafe-eval` and `ws:` only in development; HSTS, `nosniff`, `X-Frame-Options`, COOP, CORP, Permissions-Policy on all responses; `no-referrer`, `no-store` and `noindex` on `/invite` and `/reset`; no `X-Powered-By`; no CORS headers | `server/http/security-headers.ts`; `src/proxy.ts`; `next.config.ts` |
| CSV | Neutralizes `= + - @ \t \r` and full-width characters, after `trimStart`; explicit columns with no internal data; admin only; `audit_log` | `lib/csv.ts:9-21`; `modules/admin/csv-export.ts:36-88` |
| CSV import | Admin only; byte cap before buffering; row errors without values; `no-store` | `app/api/v1/imports/students/route.ts`; `modules/admin/student-import.ts:352-358` |
| jobs | Except for `http-trigger` always `404`; constant-time comparison on SHA-256; allowlist; body ignored; 60 per hour; short secret means the app does not start | `server/jobs/trigger.ts:43-72`; `server/env.ts:30, 63-67` |
| Invite token | Fragment, `replaceState`, lookup and accept via POST, full mobile number, 5 mismatches lead to revocation, atomic consumption, revocation of the previous session in the same browser | `components/auth/accept-token-form.tsx:38-40`; `identity/service.ts:455-580` |
| Secrets | `.env` and `.data` in `.gitignore`; only `.env.example` without values is in git; passwords inside `tests/` are only for the temporary local database | `.gitignore:21-24` |

**Minor notes (not security findings; recorded only):**
- `STORAGE_DRIVER=azure-blob` is not implemented yet (`server/storage/azure-blob.ts`). When it is built, SEC-K3 (private container, credential scoped to the container and not the full account key) must be checked in the same review. In `.env.example` the name `AZURE_STORAGE_CONNECTION_STRING` points to using the account key. A connection string based on SAS or Managed Identity is preferable.
- `/healthz` logs `{err}` on failure (`app/healthz/route.ts:21`). Its query is `select 1` with no parameters, so nothing leaks. Aligning the body is in F-08.

---

## 4. Consequences for followups
- F-07: **closed** (this document).
- New: **F-17** (N1), **F-18** (N2), **F-19** (N3), all three with **high** priority (before deployment or before real data is entered).
- The condition in 1-7 is the same as F-01 and must be done **before the first real student is invited**.

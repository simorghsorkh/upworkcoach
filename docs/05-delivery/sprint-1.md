# Sprint 1 — Delivery notes

> Phase 4, version 0.1 "Coach Office". Each role writes its own section.

---

## Backend (backend-engineer) — 28 Mehr 1405 (2026-10-20)

**Scope:** Data foundation, authentication and access (ADR-0003 with C1 and C2, ADR-0004 with C3, ADR-0008, ADR-0010). Product features (students, tasks, notes, …) come in later sprints.

### Endpoints (`/api/v1`)
| Method and path | Role | Note |
|---|---|---|
| `POST /auth/login` | Public | Three-layer lockout (`pi` 5/15m, `p` 20/1h with device-cookie bypass, `ip` 30/15m); dummy hash for non-existent, `invited` and `disabled` users; session cookie and device cookie |
| `POST /auth/logout` | * | `204`, cookie with `Max-Age=0`, `Clear-Site-Data: "cache"`; the device cookie stays |
| `GET /auth/me` | * | `MeDTO` |
| `POST /auth/change-password` | * | Wrong current password → `422 fields.currentPassword` and a `pwchange:u` lock of 5/15m; all sessions are revoked and the current session is rotated |
| `GET /auth/sessions`, `DELETE /auth/sessions/:id` | * | Own sessions only; someone else's session → `404` |
| `POST /auth/tokens/lookup` | Public | C1: token only in the body; the phone number is not returned; all invalid states → `410`; `token:ip` limit 30/15m |
| `POST /auth/tokens/accept` | Public | Full phone number required; 5 wrong phone numbers → token revoked + `audit_log`; atomic consumption; revokes all sessions and the cookie session of the same browser |
| `GET /users` | A | With `inviteAcceptedAt`, `inviteAcceptedDevice`, `erasedAt` |
| `GET /mentors` | A, M | Active staff |
| `POST /invitations` | A | `mentor` and `admin` only; link `…/invite#t=…` returned once, `no-store` |
| `POST /users/:id/invite-link` | A; M only for an `invited` student in scope (C3) | A mentor requesting it for an `invited` admin or mentor → `404` (same body as a non-existent ID) |
| `POST /users/:id/reset-link` | A | 24 hours; `…/reset#t=…` |

All are registered in `src/server/http/routes.manifest.ts`. No route has `:token`.

### Tables and migration
`apps/web/drizzle/0001_identity_auth.sql` (generated with drizzle-kit and reviewed): `users` (role, status, `erased_at`, CHECKs), `auth_tokens` (SHA-256 only, `phone_mismatch_count`, `used_user_agent`, partial index), `sessions` (SHA-256 only), `auth_throttle`, `audit_log` (admin module), `settings` (catalog module; a missing row = default).

### Code structure
- `src/lib`: `phone` (Iranian mobile number normalization, `maskPhone`; **also usable in the browser**), `text-fa` (ADR-0008 and SEC-X5), `uuid` (UUIDv7).
- `src/modules/identity`: schema, contracts, policy, service, repo, `password` (SEC-P1..P5, queue of 2, `503` after 5 seconds), `throttle`, `tokens`, `session-policy`.
- `src/modules/access`: `staffStudentScope`, `scopeCondition`, `isStudentInScope`, `loadInScope` (resolver registry), `assertRefs`.
- `src/modules/admin` (`recordAudit`; rejects forbidden keys such as token/url/password) and `src/modules/catalog` (`getAccessSettings`).
- `src/server/http`: `route()` (CSRF → session → zod → service; 256KB cap before parsing), Persian error messages, `getClientIp`, headers and CSP. `src/proxy.ts`: CSP with nonce. `next.config.ts`: SEC-H2 headers and `no-referrer`/`no-store` on `/invite` and `/reset`.
- `src/server/auth/current-user.ts`: bodies implemented, signatures unchanged. `requireUser` without a session → `/login`; disallowed role → `/today` (staff) or `/home` (student).
- `auth.cleanup` job (daily at 3:30 Tehran time) per data-model 6-1.
- CLI: `pnpm admin:create --phone … --name …` (alias: `admin:bootstrap`), `pnpm admin:reset-link --phone …`, `pnpm admin:erase-user --id … --confirm "…" --requested-on YYYY-MM-DD`.

### Command results (real run, after the last change)
| Command | Result |
|---|---|
| `pnpm lint` | Clean (174 files) |
| `pnpm typecheck` | Clean |
| `pnpm test` | 26 files, **313 tests green**: 174 unit (148 of them from this section) and 139 integration on embedded Postgres (136 of them from this section) |
| `pnpm build` | Success; all routes dynamic |
| Real smoke test | `next start` + temporary Postgres: CLI invite → lookup → accept (Persian digits) → login → me → users → invitations → invite-link → POST without `Origin` = `403`. The nonce was present on all `/invite` scripts. The CLIs were also run against the temporary Postgres. No process was left running |

Integration tests: the full invite → accept → login → me → logout flow; password reset; T-AUTH (exact lockout, non-existent phone number, dummy-hash spy, own/other/forged device cookie, forged XFF); T-TOKEN (expired, consumed, regenerated, 5 wrong phone numbers, two concurrent accepts); T-SESSION (absolute cap, password_changed_at, role from the database, sliding every 15 minutes, token only from the cookie); T-MATRIX for 13 endpoints × 6 states (A, M, S, no session, disabled with an old cookie, `invited` with a forged session) and manifest completeness; T-ESC; T-CSRF on all write endpoints; absence of Server Actions; partial T-LOG (full phone number, token, cookie and `$argon2id$` are not in the logs); the CLIs, account erasure and retention.

### Assumptions (for review by software-architect and security-reviewer)
1. **Iranian mobile numbers only** (`9` + 9 digits). The database CHECK also accepts international numbers so this can be opened up later.
2. **The session cookie lives until the session's absolute cap** (student 90, staff 30 days), not until the sliding expiry (SEC-S1). Reason: RSC cannot write cookies, and a student who only views pages would be logged out after 30 days. Sliding expiry is enforced on the server on every request, so a stale cookie has no effect.
3. **Bodyless POSTs** (logout, invite-link, reset-link) may omit `Content-Type`; those with a body accept only `application/json`. A cross-site form always sends a `Content-Type`, so the intent of SEC-C3 is preserved.
4. **Student creation** via `POST /students` is in sprint 2 (it needs the `students` table and the current stage). `identity.createInvitedUser(tx, …)` is ready. `POST /invitations` creates only admins and mentors (api.md).
5. **A mentor's scope** is empty until `students` exists (deny by default): a mentor cannot get an invite link for any student. The hook-up point is marked with a TODO.
6. Regenerating an invite link by a mentor was not made dependent on `mentorsCanInviteStudents` (the ADR only mentions it for creating students).
7. `reset-link` only for `active` users (for `invited` and `disabled` → `409`). `admin:reset-link` for an `invited` user (expired setup link) issues a 1-hour invite link so the first admin is never locked out.
8. The script exists under both the name `admin:create` (project-lead's request) and the ADR's name (`admin:bootstrap`).
9. Without `DEVICE_COOKIE_SECRET` outside production, a random in-memory secret is generated (device cookies become invalid on every restart).
10. A `429` response has, besides `retryAfterSeconds`, a `code` and a fixed Persian message (with the minutes remaining); it says nothing about the layer or whether the account exists.
11. `auth.locked` is recorded in `audit_log` only for the phone layers of an existing account; an IP lockout is only logged.
12. `GET /users` has no pagination (max 1000 rows) and returns `{ items, nextCursor: null }`.

### Open questions (for software-architect)
- **SEC-T5 vs. token retention:** `auth.cleanup` deletes tokens 7 days after they are used (data-model 6-1), so "Invite accepted: time, device" in `GET /users` becomes empty after 7 days. If it must persist, a column on `users` or an exception in cleanup is needed.
- **Refusing to start with an invalid env (SEC-S8, SEC-J1):** `getEnv()` is lazy; in production with an incomplete env the app starts and every request returns `500` (observed with `next start`). Proposal: call `getEnv()` in `src/instrumentation.ts` (outside this task's boundary; devops-engineer's decision).

### Remaining work
- [ ] Sprint 2 (students): real `PrimaryMentorLookup`, `loadInScope` resolvers, `isExistingStudent` in `assertRefs`, `students.last_activity_at`, `timeline_events(invite.accepted)`, `POST /students`, and the M-owner, M-former, S-other and M-assignee roles in the matrix.
- [ ] `PATCH /users/:id` and `PATCH /users/:id/role` (session revocation, last admin `409`), `GET/PUT /settings`.
- [ ] `admin:erase-user` for the tables of later modules (TODO list in `identity/service.ts`) and the precondition "must not be a student's primary mentor".
- [ ] SEC-P3: a local list of about 100k leaked passwords (currently about 200 common and Iranian ones).
- [ ] SEC-S7 (`/auth/reauth`) before inviting a second admin.
- [ ] Biome `noRestrictedImports` rule for student routes, and full T-LOG (together with upload and CSV).
- [ ] Measure argon2 time on App Service B1 (about 25 ms locally; target 50 to 250).
- [ ] `POST /api/internal/jobs/:name` route for `JOBS_MODE=http-trigger` (SEC-J1..J3).
- [ ] Root README: add the `admin:*` commands (outside this task's boundary).

---

## Frontend (frontend-engineer) — 28 Mehr 1405 (2026-10-20)

**Scope:** Design system, app shell, login pages and "My account". Visual reference: the approved mockups in `docs/03-ux/mockups/`.

### Built

| Area | Path | Description |
|---|---|---|
| Tokens | `apps/web/src/app/globals.css` | All tokens from `mockups/styles.css` with the same names (`--c-*`, `--h-*`, `--st-*`, `--av-*`, `--side-*`, `--brand-*`) + automatic dark mode via `prefers-color-scheme`. Mapped to the Tailwind 4 theme with `@theme inline` (e.g. `bg-surface`, `text-fg-2`, `border-line-strong`, `bg-h-red-bg`, `shadow-ring`). Tailwind's default palette was removed (`--color-*: initial`) so no colors from outside the system creep in. Breakpoints: `md` = 768, `lg` = 1200, `xl` = 1280 |
| Font | `apps/web/src/app/layout.tsx` | Variable Vazirmatn via `next/font/local` (local, automatic preload); verified that it actually loads on every page |
| Base components | `apps/web/src/components/ui/` | `Button`/`ButtonLink` (7 variants, 3 sizes, loading and disabled with `aria-disabled`); `TextField`/`TextareaField`/`SelectField` with label, hint, error, `aria-invalid` and `aria-describedby`; `Card`/`CardHead`; `Tag`, `Count`, `TaskStatusChip`, `HealthBadge` (color + shape + text), `Ball`, `RuleCode`; `Avatar` (8 fixed colors, `hash(id) % 8`); 9-stage `PathBar`; `EmptyState`, `ErrorState`, `SkeletonRows` (after 10 seconds "Connection is slow…"), `Alert`; `ToastProvider`/`useToast`; `Dialog` (modal on desktop, bottom sheet on mobile); `PageHead`; `ComingSoon` |
| Icons | `apps/web/src/components/icons/` | The same 57 icons as the mockups, as an `Icon` component; stroke width depends on size (2.1 at 20px, 2.4 at 16px, …); directional icons are mirrored in RTL |
| Coach/mentor shell | `components/shell/staff-*.tsx` | Ink-colored desktop sidebar (256px; 224px on tablet) with search, navigation, an "Admin" group shown only to admins, and the user at the bottom. Mobile: top bar (menu, title + Jalali date, search), bottom bar with a "+" in the middle, a "Quick add" sheet (2×2) and a "Menu" sheet (stages, reminders, results and settings for admins only, my account, log out) |
| Student shell | `components/shell/student-*.tsx` | Desktop: semi-transparent 64px top bar with five pills and a 760px column. Mobile: top bar + five-item bottom bar |
| Layouts | `app/(staff)/layout.tsx`, `app/(staff)/(admin)/layout.tsx`, `app/(student)/layout.tsx`, `app/(account)/layout.tsx` | With `requireUser([...])` from `server/auth/current-user.ts` |
| "Coming soon" pages | `/today`, `/students`, `/students/new`, `/stages`, `/tasks`, `/tasks/new`, `/questions`, `/reminders`, `/results`, `/settings`, `/home`, `/my/tasks`, `/my/questions`, `/my/path`, `/my/profile` | Only so that navigation works |
| G1 Login | `/login` | Phone number (Persian and Arabic digits accepted and converted to Latin, `dir="ltr"`, `inputmode="tel"`, `autocomplete="username"`) + password with a show button. Errors: 401 with a uniform message, 422 next to the field, 429 and 503 with a countdown and a locked button, network loss. `?next=` only accepts a relative path on this site |
| G2/G3 Invite and reset | `/invite`, `/reset` | C1 security: the token is read only from `#t=` and immediately removed from the address bar with `history.replaceState`; lookup and accept use POST with the token in the body; the phone field is empty and the user types it themselves; a "You're signed in with another account" warning; a "This link no longer works" state for a missing token and for 410; `referrer: no-referrer` and `noindex` |
| G4 Forgot password | `/forgot` | Guidance only: message your coach; no form |
| M12/S10 My account | `/account` | Profile details, password change (minimum 8 for students and 12 for staff, ADR-0003), log out, and a one-line guide to account deletion **with no button** (C5) |
| Dev preview | `/dev/shell?role=admin\|mentor\|student[&view=account]` | Shells with a fake user + a gallery of all components. `notFound()` in production (verified: 404) |

### Tests
- **Component (Vitest + Testing Library, jsdom):** `components/auth/login-form.test.ts` (9 tests) and `components/auth/accept-token-form.test.ts` (10 tests): validation, Persian digits, safe `?next=`, 401, 422, 429 (from the body and from `Retry-After`), network loss, reading and clearing the token from the fragment, 410, phone mismatch, other-account warning, reset copy.
- **e2e (Playwright, 1440 and 375):** `tests/e2e/home.spec.ts`, `auth.spec.ts`, `shell.spec.ts` and the `helpers.ts` helper, which checks RTL, `lang="fa"`, absence of horizontal overflow and actual loading of Vazirmatn on every page.

### Command results (real run)
| Command | Result |
|---|---|
| `pnpm test` | 26 files, 290 tests green (including this section's 19 component tests and the backend tests) |
| `pnpm test:e2e` | 22 of 22 green (11 tests × two sizes) |
| `pnpm build` | Success; all routes dynamic |
| `pnpm lint` | This section's files are clean. The remaining errors are all in backend files still in progress (mostly CRLF line endings, including `apps/web/package.json`) |
| `pnpm typecheck` | This section's files are clean. 6 errors in `src/modules/identity/throttle.test.ts` and `tests/integration/access-matrix.test.ts` (backend, in progress) |

Browser check: all pages were viewed at 1440 and 375, in light and dark (sheets, dialog, toast and error state too).

### Integration finding: nonce-based CSP and static pages
`src/proxy.ts` (backend) sets a nonce-based CSP on every request. Next.js only gives the nonce to dynamic pages; in the first build `/forgot` and the 404 page were built statically, and in production **all of their scripts were blocked** (seen in the console). Fix: `await connection()` in `app/layout.tsx` so that all routes are rendered per request (the documented Next.js recommendation for nonces). After that, no CSP errors remained.

### Deviations from the mockups and why
| Item | Decision | Reason |
|---|---|---|
| Notification bell in the student top bar | Replaced with the student's avatar, which links to "My account" | There is no notifications page in the 0.1 sitemap; a bell with no destination is misleading |
| `/account` route | A new `(account)` route group that picks the shell based on role | M12 and S10 share one URL and fit in neither `(staff)` nor `(student)`. **It is outside the list of assigned folders**; it does not conflict with anyone |
| shadcn/Radix | Not used; native `<dialog>` and an in-house toast | The mockups have a custom look; `showModal()` provides focus trapping and Esc on its own; less JS for weak internet connections (F10). No new runtime dependency |
| Dark mode | Automatic only (follows the system) | design-system §2-8 also mentions manual selection; moved to the backlog |
| Login pages | Had no mockups; built as a centered card with the same tokens | — |
| Font | From `src/fonts` via `next/font/local`, not `public/fonts` + manual preload | Same file; next/font adds the preload and `font-display: swap` itself |
| Counter numbers and the `/`, `N`, `G T` shortcuts | The counter structure is ready but has no data; shortcuts not yet | Data and the search page come in later sprints |
| Privacy page link on `/invite` (SEC-F4) | Only one line: "Only your coach and your mentor see your information" | The privacy page does not exist yet and the hosting location (E1) is not final |
| A few small sizes (3px indicator line, 18px pill, 52px floating button) | As Tailwind arbitrary values with the same numbers as the mockup | They are one-off geometric sizes, not system colors or spacing |

### Contract with the backend (frontend assumptions)
- 429 and 503 errors: the wait time is read from `retryAfterSeconds` (in the body or inside `error`) or the `Retry-After` header; if neither is present, 15 minutes is assumed.
- 422 error field names: `phone`, `password` (login and accept), `currentPassword`, `newPassword` (password change).
- Password change with a wrong current password: 401 or code `INVALID_CREDENTIALS` → message next to "Current password".
- `/invite` and `/reset` call `GET /api/v1/auth/me` for the "other account" warning; a 401 is normal (it shows in the browser console).

### Remaining work
- [ ] Privacy page link on `/invite` and `/reset` once that page is built (SEC-F4).
- [ ] e2e test for login and invite acceptance **against the real backend** (the API is currently mocked in e2e) once seeding and database setup in Playwright are ready.
- [ ] Coach keyboard shortcuts (`/`, `N`, `G T`, `?`).
- [ ] Manual dark/light mode selection (backlog).
- [ ] Navigation counters from real data (today, questions) in the "Today" sprint.
- [ ] Replace `components/auth/phone.ts` (client-side pre-check) with `src/lib/phone` if the backend provides a browser-usable version.
- [ ] The LTR block for Upwork content (`.ltr-block`), the responsive table, kanban, timeline and KPI are built together with their pages.

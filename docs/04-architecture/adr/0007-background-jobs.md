# ADR-0007 — Background jobs and scheduling: pg-boss on the same Postgres

- **Status:** Proposed
- **Date:** 27 Mehr 1405 (2026-10-19)
- **Author:** software-architect

## Context
- 0.1 has a few scheduled jobs: `health.sweep` (hourly), cleanup of expired sessions and tokens, cleanup of unattached attachments.
- 1.0 needs a real queue: LLM calls with retry and timeout, and sending SMS/Telegram notifications.
- We do not want to run another service (Redis) or get locked into the host's scheduler (Vercel Cron, Azure Functions) (ADR-0002).

## Options
| Option | Assessment |
|---|---|
| **pg-boss** | Queue and cron on Postgres; time-zone-aware scheduling; cron runs only once across multiple app instances; has retry, singleton and expiry; moves with `pg_dump` |
| graphile-worker | Good and fast; but its cron needs separate configuration. Equivalent; pg-boss was chosen for its simpler API |
| BullMQ + Redis | A second service; rejected |
| node-cron in-process | Runs twice with two app instances; no queue; rejected |
| Host scheduler | Lock-in; rejected (only as a "trigger", below) |

## Decision
- **pg-boss** in a separate `pgboss` schema of the same database.
- Three modes via `JOBS_MODE`:
  - `in-process` (default for Azure and the Iranian host): when the Next.js server boots (`instrumentation.ts`, Node runtime only) pg-boss starts, schedules are registered and workers are activated. **App Service must have "Always On" enabled.**
  - `http-trigger` (if we ever move to serverless): workers do not run. An external scheduler calls `POST /api/internal/jobs/:name` with the `X-Job-Secret` header, and the same handler runs once.
  - `off`: for tests.
- Every job is **idempotent**, and its handler is a plain service function (`health.service.sweepAll()`), so it can be invoked from all three modes and from tests.

### 0.1 jobs
| Name | Schedule (Asia/Tehran) | Work |
|---|---|---|
| `health.sweep` | `5 * * * *` | ADR-0005 |
| `health.sweep` (immediate) | On change of `health.rules` | — |
| `auth.cleanup` | `30 3 * * *` | Delete sessions and tokens expired for more than 7 days; clear stale `auth_throttle`. (Security C5, ADR-0010) `audit_log` retention: `ip ← null` for rows older than 90 days; delete rows older than 24 months **except** `user.erased`. (No new job is created, so that the internal endpoint's allowlist, SEC-J3, stays at the same three names) |
| `files.cleanup` | `45 3 * * *` | Delete `pending` attachments older than 24 hours (record and file) |

Backup is **not** an application job; it is an infrastructure responsibility (devops-engineer; ADR-0002 section 6), so that an application failure does not stop backups.

### 1.0 jobs (only to show where they go)
`ai.run` (2 retries, 60-second timeout, limited concurrency), `notify.send`, `digest.daily`.

### Reconciliation with implementation (aligned with the code, sprints 1 to 4; 30 Mehr 1405 (2026-10-22))
| Topic | What was built | Verdict |
|---|---|---|
| Job registration | `src/server/jobs/index.ts`: the three jobs in the table above with `boss.schedule(name, cron, null, { tz: 'Asia/Tehran' })`; `instrumentation.ts` calls `getEnv()` before that (invalid env → server does not start). A pg-boss startup failure does not bring the web server down; it is only logged (sprints 1 and 4) | Accepted; sweep staleness is shown by `/healthz` |
| `health.sweep` (immediate) | **Not queued**: a change to `health.rules`, `checkin`, or a stage's `expectedDays`/`isOpenEnded` calls `sweepAllHealth()` within the same request after commit (best-effort) (sprint 4) | Accepted for 0.1 volume (ADR-0005). The "immediate" row in the table above means this call, not a job |
| `health.sweep` | Before computing, automatic return from ended pauses (`students/lifecycle-auto.ts`) | Consistent with ADR-0005 |
| `auth.cleanup` | (Sprint 1) Sessions and tokens expired/consumed more than 7 days ago, stale `auth_throttle`, and `audit_log` retention (IP after 90 days, row after 24 months except `user.erased`). Token retention period **does not change**; the "Invite accepted" display comes from `users` columns (ADR-0003 item 9-9) | Accepted |
| `files.cleanup` | (Sprint 3) `pending` attachments older than 24 hours, and rows whose file deletion failed during account deletion | Accepted |
| `POST /api/internal/jobs/:name` | (Sprint 4) Always `404` except with `JOBS_MODE=http-trigger`; `X-Job-Secret` with constant-time comparison on SHA-256, wrong → `404` + warning log; only the three names above; body ignored; 60 per hour; secret shorter than 32 bytes → app does not start (SEC-J1..J3) | Consistent |
| `/healthz` | (Sprint 4) `getLastHealthSweepAt()` is wired: `{ status: 'ok', db: 'ok', lastHealthSweepAt }`; database error → `503 { status: 'error', db: 'unreachable' }` | **Sprint 4 open question closed.** Remaining: align with SEC-J4 (`ok`, `db: 'fail'`, `version`) and a `sweepStale` flag (last sweep older than 3 hours) for devops-engineer alerting (F-08) |

## Consequences
- **Positive:** No extra service; portable; the same infrastructure is the AI queue in 1.0.
- **Negative:** Queue load is on the main database; negligible for our volume. If AI load grows in 1.0, a worker runs separately with the same image and `JOBS_MODE=worker-only`.
- Monitoring: `/healthz` returns the time of the last successful `health.sweep` run. devops-engineer puts an alert on it.

# server — server-side infrastructure

| Path | What it is |
|---|---|
| `env.ts` | Environment variable contract with zod; `getEnv()` is lazy so `next build` does not need secrets |
| `db/` | Drizzle on `pg` using `DATABASE_URL`; `getDb()` for the app, `createDb()` for tests and scripts; `migrate.ts` runs migrations |
| `logger.ts` | pino, JSON on stdout; passwords, tokens and cookies are redacted |
| `jobs/` | pg-boss in the `pgboss` schema; switched on/off with `JOBS_MODE` (ADR-0007); started from `src/instrumentation.ts` |
| `storage/` | `FileStorage` interface; the `local` adapter is complete, `azure-blob` and `s3` are stubs for now |
| `auth/` | `current-user.ts` (contract shared with the frontend: `getCurrentUser`, `requireUser`), cookies, reading the session from the request |
| `http/` | `route()` (CSRF → session → zod → service), structured errors with messages in the request language (Persian by default, `Accept-Language`), `getClientIp`, security headers and CSP, `routes.manifest.ts` (access matrix) |
| `concurrency.ts` | Simple concurrency queue (at most 2 argon2 operations, SEC-P5) |

Every new endpoint must be registered in `http/routes.manifest.ts`; otherwise the access-matrix test fails.
Only server-side code lives here; do not import it from a client component.

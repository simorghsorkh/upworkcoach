# UpworkCoach

A coaching platform for freelancing and Upwork. Current version: **0.1 "Coach Office"** (under construction).
Product context: [`CLAUDE.md`](CLAUDE.md) and [`docs/STATUS.md`](docs/STATUS.md). Architecture: [`docs/04-architecture/`](docs/04-architecture/).

## Repository layout

| Path | What it is |
|---|---|
| `apps/web` | The only app in 0.1: Next.js (Persian RTL UI + REST API + scheduled jobs) |
| `apps/web/src/app` | Pages: `(auth)`, `(staff)`, `(student)`, `api/v1`, and `healthz` |
| `apps/web/src/modules` | Domain modules (still empty) |
| `apps/web/src/server` | env, db (Drizzle), logger (pino), jobs (pg-boss), storage |
| `apps/web/drizzle` | SQL migrations |
| `apps/web/tests` | Integration and e2e tests |
| `apps/web/scripts` | `db:start` / `db:stop` / `db:migrate` |
| `packages/config` | Shared tsconfig and Biome |

Each folder has a short README describing its rules.

## Prerequisites

| Tool | Version | Note |
|---|---|---|
| Node.js | **22 or higher** (`engines: >=22`) | Production and CI run on **Node 24 LTS** (Dockerfile and `ci.yml`). The current development machine has Node 22.17 and everything has been tested on it. If a behavior shows up in only one of them, Node 24 is the reference |
| pnpm | **12.14.0** (pinned in `packageManager`) | No global install needed: `npx pnpm@12.14.0 …`. The corepack bundled with Node 22 (version 0.33) does not run pnpm 12 |
| Docker | **Not required** | Only for deployment. The local database and tests work with embedded Postgres from npm ([ADR-0009](docs/04-architecture/adr/0009-local-dev-without-docker.md)) |
| PostgreSQL | **Not required** | `pnpm install` brings the Postgres 16.14 binary for your operating system |

To shorten commands you can create an alias in your own shell (e.g. in Git Bash: `alias pnpm='npx -y pnpm@12.14.0'`). From here on, `pnpm` means exactly that.

## Setup from scratch

```bash
npx -y pnpm@12.14.0 install     # dependencies + Postgres 16 binary
cp .env.example .env            # local settings (repo root only; not committed to git)
pnpm db:start                   # local Postgres in the background; data in .data/pg
pnpm db:migrate                 # apply migrations
pnpm dev                        # http://localhost:3000
```

Quick check: `http://localhost:3000/healthz` should return `{"status":"ok","db":"ok"}`.
When done: `pnpm db:stop` (shuts Postgres down cleanly). If the system restarts, run `pnpm db:start` again.

All local data lives in `.data/` (`pg/` database, `pg.log` database log, `uploads/` files). To start from scratch: `pnpm db:stop`, delete the `.data` folder, then run `db:start` and `db:migrate` again.

## Commands (from the repo root)

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js development server |
| `pnpm build` / `pnpm start` | Production build (`output: 'standalone'`) and running it |
| `pnpm lint` / `pnpm lint:fix` | Biome (lint + formatting) |
| `pnpm typecheck` | `next typegen` + `tsc --noEmit` |
| `pnpm test` | Vitest: unit tests (`src/**/*.test.ts`) and integration tests (`tests/integration`) |
| `pnpm test:e2e` | Playwright at two sizes: desktop 1440 and mobile 375 |
| `pnpm db:start` / `pnpm db:stop` | Start and stop local Postgres |
| `pnpm db:generate` | Generate a SQL migration file from the `schema.ts` files |
| `pnpm db:migrate` | Apply migrations to `DATABASE_URL` |

## Testing

- **Unit and integration:** `pnpm test`. Integration tests **do not connect to the development database**; they spin up a temporary Postgres 16 on a free port, run the migrations, and then delete it (about 15 seconds). If `TEST_DATABASE_URL` is set in the shell (as in CI), that database is used instead; never point it at real data.
- **e2e:** download the browser once (about 120 MB in `%LOCALAPPDATA%\ms-playwright`, not in the project):
  ```bash
  pnpm --filter @upworkcoach/web exec playwright install chromium
  pnpm test:e2e
  ```
  Playwright starts `next dev` itself on port 3100 with `JOBS_MODE=off`. If another dev server is running in the same folder, stop it first.

## Database migrations

1. Define tables in `apps/web/src/modules/<module>/schema.ts` (relative imports only) and re-export them from `src/server/db/schema.ts`.
2. `pnpm db:generate --name <short_name>` → a new SQL file in `apps/web/drizzle/`. **Read the SQL** and commit it with the code.
3. `pnpm db:migrate`.

An applied migration is never edited. Column names are camelCase in TypeScript and snake_case in the database. For now only the infrastructure table `_health` exists.

## Environment variables

Full list with descriptions in [`.env.example`](.env.example); the contract is in `docs/04-architecture/tech-stack.md` section 5; validation is in `apps/web/src/server/env.ts`.

| Variable | Local | Description |
|---|---|---|
| `DATABASE_URL` | `postgres://upworkcoach:upworkcoach@localhost:5432/upworkcoach` | `db:start` creates exactly this |
| `APP_BASE_URL` | `http://localhost:3000` | For building invite links |
| `SESSION_COOKIE_NAME` | `__Host-uc_session` | — |
| `DEVICE_COOKIE_SECRET` | empty | HMAC secret for the device cookie in the login lockout policy (ADR-0003); 32 random bytes; **required in production**, and the app will not start without it |
| `TRUSTED_PROXY_HOPS` | `0` | Number of trusted proxies for reading the real IP from `X-Forwarded-For` (ADR-0003). Local `0` (the header is ignored), Azure App Service `1` |
| `STORAGE_DRIVER` | `local` | `local` \| `azure-blob` \| `s3` (the last two are still stubs) |
| `LOCAL_STORAGE_DIR` | `.data/uploads` | Only for `local`; path relative to the repo root |
| `AZURE_STORAGE_*`, `S3_*` | empty | Only for the corresponding driver |
| `JOBS_MODE` | `in-process` | `in-process` \| `http-trigger` \| `off` (ADR-0007) |
| `JOB_TRIGGER_SECRET` | empty | Required for `http-trigger` (at least 32 characters) |
| `LOG_LEVEL` | `info` | — |
| `MAX_UPLOAD_BYTES` | `5242880` | 5 MB |

**Secrets are never in the repo.** `.env` and `.data/` are in `.gitignore`. Production values live only in the host settings (App Service) or in a `.env` on the server itself. Generating a secret: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

## CI

`.github/workflows/ci.yml` on every push to `main` and every PR: install with `--frozen-lockfile`, lint, typecheck, tests (integration tests on the official `postgres:16` service container), build. Node 24.

## Deployment (Docker)

- `apps/web/Dockerfile`: multi-stage on `node:24-alpine`; a `runner` target (small standalone image, non-root user, HEALTHCHECK on `/healthz`) and a `migrator` target (one-off migration run).
- `docker-compose.yml`: Postgres 16 + migrate + web for a single server (e.g. an Iranian VPS); requires `POSTGRES_PASSWORD` and `DEVICE_COOKIE_SECRET` in `.env`.

> **Not run yet:** Docker is not installed on the development machine. The first real build will happen in CI or on the deployment server. The standalone output of the same build has been tested locally with Node (the home page and `/healthz` returned 200).

Deployment, backup and rollback details will go in `docs/07-launch/runbook.md`.

## Notes and known limitations

- **TypeScript 6.0** is used deliberately instead of 7.0: the `typescript@7` package (native compiler) has no stable programmatic API, and `next build` depends on it.
- `next dev` creates and maintains the file `apps/web/AGENTS.md` (Next.js guidance for coding agents). It stays in the repo on purpose.
- On Linux, `db:start` does not run as the root user (an `initdb` limitation).

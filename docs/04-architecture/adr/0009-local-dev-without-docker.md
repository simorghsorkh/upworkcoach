# ADR-0009 — Local development and testing without Docker: embedded Postgres from npm

- **Status:** Accepted
- **Date:** 28 Mehr 1405 (2026-10-20)
- **Author:** devops-engineer
- **Partially supersedes:** `tech-stack.md` section 1 (the "Testing" row: Testcontainers) and section 4 (the local row: `docker compose up`). ADR-0001 and ADR-0002 are not changed.

## Context
- On the founder's machine (Windows 10), **Docker, PostgreSQL and pnpm are not installed**; only Node 22 and npm. Nothing is supposed to be installed globally and system settings must not be changed.
- `tech-stack.md` had proposed `docker compose up` for the local environment and **Testcontainers** for integration tests. Both depend on Docker.
- Integration tests must run against **real Postgres** (ADR-0004 access matrix, `pg_trgm`, constraints), not an emulator.
- The same Docker image is still the deployment path and the path for moving to an Iranian host (ADR-0002), and must be kept.

## Options
| Option | Assessment |
|---|---|
| **A. The npm package `embedded-postgres`** (official Postgres 16 binaries for Windows, Linux and macOS, from npm) | No system install; real Postgres 16.14; comes with `pnpm install`; only the binary for the current OS is downloaded (≈37 MB on Windows). Downside: the npm version is tagged `beta` (a packaging tag, not Postgres itself) and it has a single maintainer |
| B. Testcontainers + Docker Desktop | Industry standard, but on Windows 10 Docker Desktop needs a system install, WSL2 and a commercial license (for large companies); pulling images from Docker Hub may also be blocked from Iran |
| C. Installing PostgreSQL for Windows | System install and service; a manual step for every new developer; parallel tests with separate databases are harder |
| D. PGlite (Postgres on WASM) | Lightweight, but single-connection and not the same as `pg` / pg-boss and real connection behavior; not reliable for access and queue tests |

## Decision
**Option A** for local development and testing; Docker only for deployment and CI.

| Task | How |
|---|---|
| Development database | `pnpm db:start`: using the `embedded-postgres` binaries, `initdb` (UTF8, locale C, scram-sha-256) and then `pg_ctl start` in the background. Data in `.data/pg` (in `.gitignore`), log in `.data/pg.log`. User name, password, port and database name are read from `DATABASE_URL`, and only a local address is accepted. `pnpm db:stop` shuts down cleanly with `pg_ctl stop -m fast` |
| Integration tests (local) | A Vitest `globalSetup` creates a **separate temporary cluster** in the temp folder on a free port, runs migrations, and cleans up after the tests. The development database is never touched |
| Integration tests (CI) | The official `postgres:16-alpine` service container in GitHub Actions with `TEST_DATABASE_URL`; the same test code |
| Local file storage | The `local` adapter in `STORAGE_DRIVER` (folder `.data/uploads`), alongside `azure-blob` and `s3` |
| Deployment | `apps/web/Dockerfile` (Node 24, multi-stage, standalone) and `docker-compose.yml` (Postgres 16 + migrate + web) keep their role unchanged; they have not been run on the founder's machine |

Why we use `embedded-postgres` only for the binaries and call `pg_ctl` ourselves: on Windows the library stops Postgres with `taskkill /f` (equivalent to pulling the plug; not suitable for persistent data) and keeps the server tied to the Node process. With `pg_ctl`, the server stays in the background and shuts down cleanly.

## Consequences
- **Positive:** Setup from scratch with `pnpm install` + `pnpm db:start`; no Docker and no system administrator access; tests on real Postgres 16.
- **Negative:**
  - The Docker path is not tested every day (contrary to the assumption in `tech-stack.md` section 4). Mitigation: CI builds the image (next devops task) and the migration runbook is rehearsed every 3 months on a test VPS (ADR-0002).
  - Minor difference from production: local is locale `C` on Windows; production is Linux with `en_US.utf8`. Persian text sort order depends on ICU/collation and must also be tested in CI (Linux).
  - On Linux, `initdb` does not run as root (a Postgres restriction).
  - Dependency on an npm package with a single maintainer. If it is abandoned: the direct replacement is installing Postgres 16 and setting `DATABASE_URL`; application code does not change.
- **Security:** The postinstall script of the `@embedded-postgres/*` packages only recreates binary symlinks and is explicitly allowed in `allowBuilds` (pnpm-workspace.yaml). The default local password (`upworkcoach`) is only for the local cluster, which listens only on `localhost`.

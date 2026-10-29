# Tech Stack — UpworkCoach version 0.1

> Phase 3 — 27 Mehr 1405 (2026-10-19) — Author: software-architect — Status: draft for the founder gate
> Formal decision: [ADR-0001](adr/0001-tech-stack.md). Hosting: [ADR-0002](adr/0002-hosting-0.1.md).
> Guiding principle: **a single full-stack developer must be able to hold the whole system in their head.** One language, one app, one database, no side services.

---

## 1. Summary

| Layer | Choice | Why this | Why not that |
|---|---|---|---|
| Language | **TypeScript** (strict) on **Node.js 24 LTS** | One language for front and back; shared types between API and UI | Python/Django or PHP/Laravel: a second language would be needed for the front end |
| Repository | **pnpm workspace**: `apps/web` + `packages/config` | 1.0 adds `packages/ai` or `apps/worker` without moving folders | Turborepo/Nx: too much for one app; can be added later |
| Framework | **Next.js** (App Router, latest stable version) with `output: 'standalone'` | UI and API in one app and one deployment; server rendering for fast loading on weak internet (F10: under 3 seconds) | Separate Next.js + NestJS: two apps, two deployments, authentication twice. Vite SPA + API: we would have to build server rendering and routing ourselves |
| API | **REST JSON** in the `app/api/v1/**` Route Handlers; validation with **zod** | Explicit, testable contract (`api.md`); later a Telegram bot or mobile app uses the same API | Server Actions for mutations: no explicit contract and access testing is harder. tRPC: locked to a TS client |
| Database | **PostgreSQL 16+** | Relational, standard, available everywhere (Azure, Neon, any Iranian VPS); `pg_trgm` for Persian search; the queue lives in it too | MySQL: weaker trigram search and JSONB. MongoDB: our data is relational |
| ORM and migrations | **Drizzle ORM** + **drizzle-kit** (SQL migration files in git) | Close to SQL; partial indexes, check constraints, generated columns and raw SQL are easy; no binary engine; small image | Prisma: a good option, but Postgres-specific constraints and indexes would have to be kept as raw SQL alongside the schema. Replaceable with good reason |
| Authentication | **Database session + httpOnly cookie**; password hashing with **argon2id** (`@node-rs/argon2`) | Our flow (invite → mobile + password) is simple and non-standard; little, understandable code (ADR-0003) | Auth.js: does not support credentials well with database sessions. Better Auth: email-centric and brings a heavier dependency. External service (Clerk, etc.): sanctions and outages |
| Queue and scheduler | **pg-boss** (on the same Postgres) | No Redis; cron with time zone; single-instance scheduling even with several app instances; the 1.0 queue for LLM (ADR-0007) | BullMQ: needs Redis. Vercel Cron or Azure Functions: locked to the host |
| UI | **React** + **Tailwind CSS v4** + **shadcn/ui** (on Radix) | Logical classes (`ms-*`, `pe-*`, `start-*`) for RTL; Radix with `DirectionProvider dir="rtl"`; components are copied into our own repo, not a dependency | MUI: heavy, and its RTL with emotion is complicated. Ant Design: large bundle size |
| Forms | **react-hook-form** + the same zod schemas | One schema for client and server | — |
| Font | **Vazirmatn** self-hosted with `next/font/local` | PRD: no fonts from an external service | Google Fonts: external domain, filtering and outages |
| Dates | Store in **UTC** (`timestamptz`); Jalali display with `Intl.DateTimeFormat('fa-IR-u-ca-persian', {timeZone: 'Asia/Tehran'})`; date picker and Jalali arithmetic with **date-fns-jalali** | Intl is native and needs no library; date-fns-jalali for "Thursday of this week" and "3 days later" in the Jalali calendar | moment-jalaali: moment is deprecated and heavy (ADR-0008) |
| Files | A **`FileStorage`** interface with `local` (development and single-server VPS), `azure-blob` and `s3` adapters; image processing with **sharp** (re-encoding and EXIF removal) | Portable (ADR-0002); strips location and device details from photos (privacy) | Storing in the database: makes backups large |
| CSV | **papaparse** | CSV import and export (F11) with a UTF-8 BOM so Excel shows Persian correctly | — |
| Logging | **pino** (JSON to stdout) | Any host can read it | Dedicated monitoring SDK: locked to the host |
| Testing | **Vitest** (unit and integration against a real Postgres: locally from **embedded-postgres**, in CI from a service container; [ADR-0009](adr/0009-local-dev-without-docker.md)); **Playwright** (e2e at mobile and desktop sizes) | Health rules are pure functions and get unit tests; the access matrix is tested against a real database (ADR-0004) | Jest: slower and its ESM setup is a hassle |
| Code quality | **Biome** (lint + format) + `tsc --noEmit` in CI | One fast tool instead of ESLint + Prettier | — |
| Deployment | **Docker** (multi-stage image) → GHCR → Azure App Service | ADR-0002 | — |
| PWA | manifest + installability; service worker only for caching static assets | PRD: responsive web app (D1). No offline data in 0.1 | Full offline: sync complexity |

**Deliberately not included:** Redis, Kubernetes, microservices, GraphQL, an external authentication service, an external CDN, Sentry or any external SDK in the browser (adding Sentry or a self-hosted GlitchTip will be considered after 0.1; the decision belongs to devops-engineer).

---

## 2. Repository structure

```
upworkcoach/
├─ apps/
│  └─ web/                         # the only app in 0.1 (UI + API + jobs)
│     ├─ src/
│     │  ├─ app/
│     │  │  ├─ (auth)/             # login, accept invite, set password
│     │  │  ├─ (staff)/            # today, students, kanban, profile, settings (admin|mentor)
│     │  │  ├─ (student)/          # home, tasks, questions, profiles (student)
│     │  │  └─ api/v1/**/route.ts  # REST — only a thin HTTP layer
│     │  ├─ modules/               # domain modules (overview.md section 3)
│     │  │  └─ <module>/
│     │  │     ├─ schema.ts        # this module's Drizzle tables
│     │  │     ├─ contracts.ts     # zod schemas and DTOs (API input/output)
│     │  │     ├─ policy.ts        # this module's access rules
│     │  │     ├─ service.ts       # domain logic; the only entry point from outside the module
│     │  │     └─ repo.ts          # queries (module-internal only)
│     │  ├─ server/                # db, auth, http (errors, validation), jobs (pg-boss), storage
│     │  └─ lib/                   # jalali, text-fa (normalization), phone, business-hours
│     ├─ drizzle/                  # SQL migration files
│     ├─ tests/                    # integration (access matrix) and e2e
│     └─ Dockerfile
├─ packages/
│  └─ config/                      # shared tsconfig and biome
└─ docs/
```

Added in 1.0 (without moving existing code): `apps/web/src/modules/ai`, `modules/opportunities`, `modules/notifications`. If the LLM load grows, `apps/worker` runs the same image with a different command (`node dist/worker.js`).

---

## 3. Coding rules the architecture depends on

1. **Route Handlers are thin:** authentication → zod validation → call the `service` → map to a DTO. Business logic and access checks live **inside the service**, not in the route.
2. **Every service takes `actor` as its first parameter** (`{ userId, role }`) and checks access itself (ADR-0004). RSC pages call the same services, so there are not two access paths.
3. **A module does not write another module's tables directly.** Reading across modules goes only through the service of the module that owns the data. Exception: `today`, `health` and (aligned with the code, sprint 2) `access` are read-models and run read-only SQL queries across several tables (`overview.md` section 3, rule 2).
4. **Student DTOs are separate** (`SelfStudentDTO`, `StudentTaskDTO`, …) and do **not** contain internal fields (health, flags, internal notes, reviewer ID). That means leaks are structurally impossible, not prevented by filtering.
5. **Time:** every `timestamptz` is in UTC. Nowhere may `new Date().getDay()` or `toLocaleDateString()` be used without `timeZone: 'Asia/Tehran'`. Only the `lib/jalali` functions (ADR-0008).
6. **Persian input text** is normalized before storage: `ي`→`ی`, `ك`→`ک` (Arabic Yeh/Kaf to Persian), Persian/Arabic digits in numeric and mobile fields → Latin, extra spaces and repeated ZWNJs (ADR-0008).
7. **Stage and platform names do not appear in code.** Special behavior comes from data flags (`stage.is_open_ended`, `milestone_type.counts_for_north_star`).
8. **There is no field named password for platform accounts** (PRD section 6). Profile forms show a warning.

---

## 4. Environments

| Environment | Where | Database |
|---|---|---|
| local | `pnpm db:start` + `pnpm dev`, without Docker ([ADR-0009](adr/0009-local-dev-without-docker.md)) | Embedded Postgres 16 (npm) in `.data/pg` |
| staging | Optional in 0.1; if needed, a slot in App Service | Separate database, fake data |
| production | Azure App Service B1 + Flexible Server B1ms (ADR-0002) | — |

`docker-compose.yml` (Postgres 16 + migrate + app) is for single-server deployment and migration to an Iranian host, not for local development. Because there is no Docker on the development machine, the migration path is no longer tested every day; this is compensated by building the image in CI and a quarterly runbook drill (ADR-0009).

---

## 5. Environment variables (contract)

| Name | Example | Description |
|---|---|---|
| `DATABASE_URL` | `postgres://…?sslmode=require` | — |
| `APP_BASE_URL` | `https://app.example.ir` | For building invite links |
| `SESSION_COOKIE_NAME` | `__Host-uc_session` | — |
| `DEVICE_COOKIE_SECRET` | — (32 random bytes) | HMAC secret for the device cookie in the login lockout policy (ADR-0003); required in production |
| `TRUSTED_PROXY_HOPS` | `0` locally, `1` on App Service | Number of trusted proxies for reading the IP from `X-Forwarded-For` (ADR-0003) |
| `STORAGE_DRIVER` | `local` \| `azure-blob` \| `s3` | `local` for development and single-server VPS (ADR-0009) |
| `LOCAL_STORAGE_DIR` | `.data/uploads` | Only for `local`; relative = from the repo root in development |
| `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER` | — | Only for `azure-blob` |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` | — | Only for `s3` |
| `JOBS_MODE` | `in-process` \| `http-trigger` \| `off` (and in 1.0 `worker-only`) | ADR-0007 |
| `JOB_TRIGGER_SECRET` | — | For `POST /api/internal/jobs/:name` |
| `LOG_LEVEL` | `info` | — |
| `MAX_UPLOAD_BYTES` | `5242880` | 5 MB |
| (1.0) `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY` | — | ADR-0006 |

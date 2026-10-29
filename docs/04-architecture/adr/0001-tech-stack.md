# ADR-0001 — Tech stack: a modular TypeScript monolith with Next.js and PostgreSQL

- **Status:** Proposed (awaiting founder gate)
- **Date:** 27 Mehr 1405 (2026-10-19)
- **Author:** software-architect
- **Details:** [`../tech-stack.md`](../tech-stack.md)

## Context
- One full-stack developer, about 5 to 6 weeks for 0.1 (assumption A3).
- Responsive Persian RTL web app that works well on desktop and mobile (decision D1).
- Low load: fewer than 500 users with no architecture change (PRD section 8).
- 1.0 adds AI tools, job-application logging and notifications, and must not require a rewrite.
- Must be portable to an Iranian host (ADR-0002).

## Options
| Option | Pro | Con |
|---|---|---|
| **A. One Next.js app (UI + REST API + jobs) + PostgreSQL + Drizzle + pg-boss** | One language, one deployment, one database; fewest moving parts | Module boundaries must be kept by discipline, because the framework does not enforce them |
| B. Separate Next.js (front end) + NestJS (API) | Clear front/back boundary | Two deployments, two configurations, authentication twice; heavy for one person |
| C. Django or Laravel + React front end | Ready-made admin panel | Two languages; RTL and Jalali dates need work even in a ready-made panel |
| D. BaaS (Supabase or Firebase) | Fast start | Lock-in; external dependency; complex RLS for our rules; Firebase is blocked for Iran |

## Decision
**Option A**, a modular monolith:
- Next.js App Router with `output: 'standalone'` in one Docker image.
- Versioned REST (`/api/v1`) with zod. Server pages call the same services directly.
- PostgreSQL 16+ with Drizzle and SQL migrations.
- pg-boss for cron and queues (ADR-0007).
- Database sessions and argon2id (ADR-0003).
- Tailwind v4 + shadcn/ui, self-hosted Vazirmatn, dates with Intl + date-fns-jalali (ADR-0008).

## Consequences
- **Positive:** Setup in one day; every change is one PR and one deployment; simple integration testing.
- **Negative:** If the LLM load in 1.0 becomes heavy, the worker must run separately. This is possible without a rewrite: the same image with a `worker` command.
- **Mandatory rule:** Logic and access control live in `modules/*/service.ts`. A Route Handler only handles HTTP (tech-stack.md section 3). Without this rule, the monolith turns into a "big ball of mud".
- **Revisable:** Prisma instead of Drizzle if backend-engineer is faster with it. The data model and migrations do not change conceptually.

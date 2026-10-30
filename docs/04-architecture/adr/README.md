# ADR index

Each ADR follows this template: context, options, decision, consequences. An accepted ADR is not edited. A new decision is a new ADR that declares the earlier one "superseded".

| # | Title | Status | Date |
|---|---|---|---|
| [0001](0001-tech-stack.md) | Tech stack: TypeScript modular monolith with Next.js and PostgreSQL | Proposed | 27 Mehr 1405 (2026-10-19) |
| [0002](0002-hosting-0.1.md) | Hosting for 0.1: Azure (portable to an Iranian host) | Proposed | 27 Mehr 1405 (2026-10-19) |
| [0003](0003-auth-0.1.md) | Authentication for 0.1: invitation + mobile number and password, database-backed sessions | Proposed | 27 Mehr 1405 (2026-10-19) |
| [0004](0004-access-control.md) | Access control: role + scope, separate DTOs, test matrix | Proposed | 27 Mehr 1405 (2026-10-19) |
| [0005](0005-health-status-computation.md) | Health status computation: pure function + event + hourly sweep | Proposed | 27 Mehr 1405 (2026-10-19) |
| [0006](0006-ai-readiness-llm-path.md) | AI layer readiness and the LLM call path (1.0) | Proposed | 27 Mehr 1405 (2026-10-19) |
| [0007](0007-background-jobs.md) | Background jobs with pg-boss | Proposed | 27 Mehr 1405 (2026-10-19) |
| [0008](0008-time-and-persian-text.md) | Time, the Solar Hijri calendar and Persian text | Proposed | 27 Mehr 1405 (2026-10-19) |
| [0009](0009-local-dev-without-docker.md) | Local development and testing without Docker: embedded Postgres from npm | Accepted | 28 Mehr 1405 (2026-10-20) |
| [0010](0010-data-retention-and-deletion.md) | Data retention and account deletion for 0.1: request by message, admin CLI, anonymization (security C5) | Proposed | 28 Mehr 1405 (2026-10-20) |
| [0011](0011-multi-tenancy-and-roles.md) | Multi-tenancy: organization, membership, in-organization role, tenant isolation, private note | Accepted (implementation: Coach Office sprint 1) | 6 Aban 1405 (2026-10-28) |
| [0012](0012-programs-runs-packages-sessions.md) | Program model: template, run (snapshot), membership, package, session, goal, progress | Proposed | 6 Aban 1405 (2026-10-28) |
| [0013](0013-i18n-foundation.md) | Multilingual foundation: next-intl, RTL and LTR, formatting and organization time zone | Accepted (base implementation: Coach Office sprint 2) | 6 Aban 1405 (2026-10-28) |
| [0014](0014-booking-availability.md) | Session booking: mentor availability, session type and request with mentor approval | Accepted (implementation: Coach Office sprint 7) | 7 Aban 1405 (2026-10-29) |

**30 Mehr 1405 (2026-10-22) (aligned with the code, sprints 1 to 4):** ADR-0003 (section 9), ADR-0004 (section 6), ADR-0005, ADR-0007, ADR-0008 (section 6) and ADR-0010 each gained an "Alignment with the implementation" section, and ADR-0002 corrected the name of the `SESSION_SECRET` variable. Because all of them are still "Proposed", editing is allowed. These sections do not change the core decision; they confirm or reject implementation assumptions and close the sprints' open questions. Remaining code work: `docs/05-delivery/followups.md`.

(ADR-0009 belongs to the devops-engineer, who adds its row. ADR-0003 and ADR-0004 were edited on 28 Mehr 1405 (2026-10-20) with the security changes C1 to C3; they were still "Proposed", so editing was allowed.)

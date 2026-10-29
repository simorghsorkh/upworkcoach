# Coach Office Sprint 1 — Multi-tenancy

- **Date:** 6 Aban 1405 (2026-10-28)
- **Basis:** ADR-0011 (accepted), `docs/08-saas-evolution/prd-coach-office.md`, `architecture-review.md`
- **Status:** Code and tests complete; **not run on production**; not committed.

## What was built
| Area | Summary |
|---|---|
| Database | Migration `0006_organizations`: organization, membership, `organization_id` on all data, child-table triggers, backfill of 0.1 data into the `default` organization |
| Session and actor | The session holds the active organization; each request's role is read from the membership; an inactive membership or organization = sign-out |
| Isolation | The staff scope (`scope.ts`) always carries an organization condition; a record from another organization is a 404, even for an admin; references (mentor, stage, template…) only within the same organization |
| Settings and lists | Settings, stages, branches, platforms, templates, milestone types and canned replies are separate per organization; a new organization gets its own default lists |
| Files and jobs | File keys are prefixed with the organization; the health sweep computes each organization with its own rules |
| Users | User and mentor lists, invitations, deactivation and role changes at the organization level; protection for the owner and shared accounts |
| UI | An "Organization" card in "My account": the current organization and a button to switch to another organization |
| CLI | `org:list`, `org:create`, `org:rename`, `org:add-member`, `admin:create --org` |

## Tests
- Unit: 47 files, all green (including the organization card and the two-organization cases of `isInScope`).
- Integration: 29 files, all green; new: `organizations.test.ts` (14 tests) and `migration-0006.test.ts` (5 tests on 0.1-like data).
- `tsc` and Biome with no errors.

## Running on production (founder's task; order matters)
The new code does not work without migration 0006, and the old code does not work after it (inserting a student or task without an organization is rejected). So:
1. Full Supabase backup (`pg_dump`).
2. Run `pnpm db:migrate` with the production `DATABASE_URL` (direct connection, not the transaction pooler).
3. Immediately deploy the new code to Vercel.
4. `pnpm org:rename --slug default --name "آکادمی تکانش" --new-slug takanesh` (the organization's Persian name, "Takanesh Academy").
5. Sign in with the admin account and check the "Organization" card in "My account".

Open sessions survive the migration. Earlier files are read with their old key.

## Decisions and differences from the ADR
In ADR-0011, section "Reconciliation with the implementation". The most important: triggers instead of composite keys; a student belongs to only one organization; membership in a second organization only via the CLI; private notes (`private`) and removal of `users.role` deferred to later sprints.

## Remaining
- Full access matrix of all endpoints with two organizations; structural test of repos.
- Note `visibility = private | staff` (answer to Q7) — with the program model (ADR-0012).
- Ownership transfer, `org:suspend`, inviting an existing account from inside the app.
- Contract migration: remove `users.role`.

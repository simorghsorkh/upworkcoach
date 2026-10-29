# ADR-0011 — Multi-tenancy: organization, membership, role within the organization, and tenant isolation

- **Status:** Accepted (founder, 6 Aban 1405); implemented in Coach Office sprint 1 — see the "Reconciliation with implementation" section at the end of the document
- **Date:** 6 Aban 1405 (2026-10-28)
- **Requirements source:** `docs/08-saas-evolution/prd-coach-office.md` sections 2 and 4; founder document items 4-1 and 5; `architecture-review.md` section C-3
- **Effect on earlier ADRs:** **Extends** ADR-0003 (authentication) and ADR-0004 (access control) and does not supersede them. Their rules (access in the service layer, separate DTOs for mentees, test matrix) stay in place.

## Context
Today:
- Role is a fixed column on `users` (`admin | mentor | student`).
- No table has an organization column; settings, lists and name uniqueness are global.
- Staff access scope in `modules/access/scope.ts` is based only on `students.primary_mentor_id` and the `mentorScope` setting. The admin sees everything, including internal notes.

What is needed: multiple independent organizations; one account with different roles in different organizations; isolation on the server, not in the frontend; a mentor's private note hidden from the admin (answer to Q7). The pilot has only one organization (Takanesh), but the design must be multi-tenant from now on.

## Options
| Option | Assessment |
|---|---|
| A. A separate database per organization | Strong isolation; but migrations, backups and reports multiply; heavy for one developer and free-tier Supabase; rejected |
| B. A separate schema per organization in one database | Same migration problem; Drizzle has no simple support; rejected |
| **C. Shared tables with an `organization_id` column, conditions in the service layer, composite foreign keys in the database** | Simple, consistent with the current architecture, testable; accepted |
| D. Option C plus Row Level Security in Postgres | More defense in depth; but needs `SET LOCAL` in every transaction and a separate pool; for after the MVP |

## Decision: option C (RLS to be revisited after the MVP)

### 1. New tables
```
organizations
  id uuid PK, slug text unique, name text,
  default_locale text ('fa'), timezone text ('Asia/Tehran'),
  status text ('active' | 'suspended'), created_at, updated_at

organization_memberships
  id uuid PK, organization_id FK, user_id FK,
  role text ('owner' | 'admin' | 'mentor' | 'mentee'),
  status text ('invited' | 'active' | 'disabled'),
  invited_by, joined_at, disabled_at, created_at, updated_at
  UNIQUE (organization_id, user_id)          -- one role per person per organization (assumption A1)

mentor_profiles                              -- for mentor/admin/owner memberships
  membership_id PK FK, title, bio, specialties text[], languages text[],
  avatar_attachment_id, updated_at
```

### 2. Changes to existing tables
- `users`: the `role` column is **dropped in the contract step** (until then it is kept only for compatibility). New column `is_platform_admin boolean`. `users.status` is the **account** status (e.g. erased); status within an organization lives on the membership.
- `sessions`: column `active_organization_id`. If the user has only one active membership, it is selected automatically; otherwise an organization-picker page after login.
- **All organizational data tables** get an `organization_id NOT NULL` column: `students`, `platform_profiles`, `profile_snapshots`, `tasks`, `task_extensions`, `submissions`, `reviews`, `notes`, `timeline_events`, `reminders`, `question_threads`, `question_messages`, `checkins`, `milestones`, `student_flags`, `student_health`, `attachments`, `stage_transitions`, `mentor_assignments`, and all list tables (`tracks`, `platforms`, `milestone_types`, `canned_responses`, `task_templates`). The ADR-0012 tables also have this column from the start.
- `settings`: primary key `(organization_id, key)`.
- `audit_log`: optional `organization_id` (platform events without an organization).
- Uniqueness at the organization level: e.g. `UNIQUE (organization_id, lower(name))` for platforms.
- `users.phone` remains **globally** unique: one person has one account and can be a member of several organizations.

### 3. Composite foreign keys (defense in the database)
Every parent table gets a `UNIQUE (organization_id, id)`, and children use `FOREIGN KEY (organization_id, parent_id) REFERENCES parent (organization_id, id)` instead of `FOREIGN KEY (parent_id)`. Result: **even with a bug in the code, a record in one organization cannot point to a record in another organization.** This is mandatory for the main chains: mentee → task → submission → review, mentee → note, question → message, run → enrollment → task.

### 4. Actor and roles
```ts
type Actor = {
  userId: string;
  orgId: string;
  orgRole: 'owner' | 'admin' | 'mentor' | 'mentee';
  isPlatformAdmin: boolean;
};
```
- During the transition period, a `legacyRole(actor)` function returns the old role (`owner|admin → admin`, `mentor → mentor`, `mentee → student`) so that current code works without a one-shot rewrite. It is then gradually removed.
- **owner** has all admin powers, plus: adding and removing other admins and owners, and sensitive organization settings. Every organization has at least one active owner (checked in the service).
- **admin:** manages mentors, mentees, programs, reports, and template approvals.
- **mentor:** only the mentees related to them according to ADR-0012 (or all of them, if the organization setting `mentorScope = 'all'`).
- **mentee:** only their own data, via the current separate DTOs.
- **Program manager** is not an organization role; it is a role at the program-run level (ADR-0012, table `run_staff`).
- **Platform admin** (`is_platform_admin`) has no UI in the MVP. Their tasks are done with command-line scripts: `org:create`, `org:add-owner`, `org:suspend` (next to the existing `admin:create`). By default the platform admin has no access to organizations' data; for support they must become a member of that organization (and it is recorded in the audit log).

### 5. Isolation on the server
1. `staffStudentScope` and `scopeCondition` in `modules/access/scope.ts` **always** add the condition `organization_id = actor.orgId`, before any other condition. Since all staff queries go through this function, coverage is ensured in one place.
2. `loadInScope` resolvers (from resource to root) also return the root's organization; if it does not match `actor.orgId`, the result is **404** (not 403, so the record's existence is not leaked; the same as the current rule).
3. Mentee queries (`/api/v1/me/*`) also get the organization condition.
4. File keys are prefixed with the organization: `org/<orgId>/...`; the file service compares the attachment's organization with the actor.
5. Jobs (health, cleanup) iterate over organizations one by one and read that organization's settings.
6. CSV export, CSV import and reports cover only the active organization's data.

### 6. Note visibility (answer to Q7)
`notes.visibility`: `private | staff | shared`.
- `private`: the author and the mentee's current mentors (per ADR-0012). **owner and admin cannot see it**, unless they are themselves a mentor of that mentee.
- `staff`: all staff who have the mentee in their scope (the current `internal`; existing `internal` values are mapped to `staff`).
- `shared`: the mentee sees it too (unchanged).
- Default in the note form for mentors: `staff` (changeable in organization settings).
- **Limits:** on account deletion or a legal data export, private notes are included too (ADR-0010).

### 7. Invitation and membership
- An invitation is always **to one organization**. If the mobile number already has an account, only a new membership with status `invited` is created and the user accepts it after logging in; otherwise the current invitation flow (create account + membership).
- Disabling a member of one organization does not change their account or their other memberships. Sessions that have that organization active are revoked.
- Account deletion (ADR-0010) is global and closes all memberships.

### 8. Migrating existing data (expand → migrate → contract)
1. **Expand:** new tables and columns, nullable.
2. **Migrate:** create one organization ("Takanesh"; name and slug via an environment variable or script, not hard-coded); fill `organization_id` on all rows; for each user a membership with the mapped role (`admin → owner` for the founder, other admins → admin; `mentor → mentor`; `student → mentee`); `notes.visibility = 'internal' → 'staff'`.
3. **Contract** (a separate migration, after confirmation on production): `NOT NULL`, composite foreign keys, drop `users.role`.
- Before running on production: a full `pg_dump` and a trial run on a copy of the data.

## Consequences
**Positive:** Consistent with the current code; the main change is in one file (`access/scope.ts`) and a few resolvers; the composite key catches the worst bug (leakage between organizations) in the database; the growth path to RLS stays open.

**Negative:** Almost all tables and queries are touched; indexes must start with `organization_id`; tests need an organization fixture.

**Required tests:**
- Two-organization access matrix: for every endpoint, a user of organization B with a record ID from organization A gets a 404.
- Structural test: every table with `organization_id` is read with the organization condition in all repos (table list from the schema).
- Migration test: synthetic data before; check memberships, roles and `organization_id` after.
- `private` test: the admin does not see a private note on any page, API, CSV export or timeline.

## Reconciliation with implementation (Coach Office sprint 1, 6 Aban 1405 (2026-10-28))
What went into the code and where it differs from the text above:

1. **Composite foreign key → trigger.** Instead of `FOREIGN KEY (organization_id, parent_id)`, the `set_organization_id` function on 18 child tables **always** copies `organization_id` from the parent row (on INSERT and on parent-key change). The result is the same — a child cannot sit in an organization other than its parent's — but without doubling keys and indexes. The service does not send the child's organization. Root tables (mentee, lists, settings, attachment, reminder without a mentee) take the organization from the actor. An attachment is compared with the parent's organization when it is attached to the parent.
2. **Session.** Column `sessions.organization_id` (not `active_organization_id`). Login always selects the oldest active membership; there is no picker page after login. A multi-organization account switches organization in "My account" (`GET /auth/organizations`, `POST /auth/organization`; the session is rotated and audited). An account with no active membership is rejected like a wrong password (the same 401, the same counter and timing).
3. **Actor.** `{ userId, role, organizationId, organizationRole }`; `role` is the `legacyRole`, so the ADR-0004 rules stay untouched. `isPlatformAdmin` has its column but is not in the actor yet.
4. **Migration.** Expand, migrate and `NOT NULL` came in a single migration (`0006`), because the backfill fills all rows right there. The organization name is the constant «سازمان پیش‌فرض» ("Default organization") with slug `default` and is changed with `pnpm org:rename` (instead of an environment variable). Dropping `users.role` and the note `visibility = private | staff` (section 6) have not been done yet.
5. **Invitation and membership.** Invitations from the app always create a new account (duplicate number → 409). Membership of an existing account in a second organization is only via `pnpm org:add-member` and only for admin and mentor; **a mentee is in only one organization**. Other CLIs: `org:list`, `org:create` (organization + default lists), `org:rename`, and `admin:create --org`. `org:suspend` and `org:add-owner` do not exist yet.
6. **Shared account.** An organization does not change the name or mobile of an account that is also a member of another organization, does not generate its password-reset link, and does not delete it (409; a platform-admin task). Disabling closes only that organization's membership.
7. **Owner.** An owner cannot be disabled, have their role changed, or be deleted (409) until ownership transfer is built.
8. **Other.** File key `org/<organizationId>/attachments/<uuid>` (old files keep the previous key). Settings, lists, seed (fixed ID for `default`, derived ID for the rest), the health sweep, and CSV export and import are all organization-scoped.

**Tests:** `tests/integration/organizations.test.ts` (two organizations: lists, 404 for another organization's record even for an admin, cross-organization reference 422, settings, export, trigger, organization switching, shared account), `migration-0006.test.ts`, and the `access.test.ts` unit tests. **Remaining from "Required tests":** the full matrix of all endpoints with two organizations, and the structural repo test.


## Reconciliation with implementation (Coach Office sprint 4, 7 Aban 1405 (2026-10-29))
- **Mentor scope from enrollment and run staff.** "Only their own mentees" no longer depends on `students.primary_mentor_id`. A mentee is in scope if the mentor has an active `enrollment_mentors` row on one of their enrollments (in any status), or is an active `run_staff` member of a run the mentee is enrolled in and is not `dropped`. A single subquery (`mentoredStudentIds`) is used in all queries and single-record checks (`studentInScope`, `mentorWorksWithStudent`).
- **`private` note.** The third note visibility: the author and the mentors working with the mentee can see it; the admin role alone is not enough. Only the author can edit it or change its visibility; 404 for everyone else.

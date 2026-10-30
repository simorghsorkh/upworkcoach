# Project status

**Current phase:** evolving into **Coach Office** (a multi-tenant mentoring platform). **Sprint 7b (month calendar: mentors set dates and hours month by month, at the founder's request) is done;** next is pilot preparation (production rollout with the founder's approval, trying Takanesh data). Sprints 1–7 are done too; all of them are committed (`e83c8bc`, 2026-10-30) but not on production (migrations 0006–0014 not applied). Sprint 0 (docs and ADR-0011 to 0013) was approved. Version 0.1 runs on Vercel and Supabase and the founder tested it.
**Last updated:** 2026-10-30 (8 Aban 1405, documentation translated to English)

- **Documentation language (8 Aban 1405 / 2026-10-30):** all docs, ADRs, agent definitions and code comments are now in English (founder's decision). Persian is kept only where the exact Persian text is the point (Persian-text handling examples, stored constants, UI copy specs), always with an English gloss. Wireframe mockups and the app UI (`messages/fa.json`) stay Persian. Not committed yet.

## Evolution into Coach Office (from 6 Aban 1405)
- **Documents:** `docs/08-saas-evolution/architecture-review.md` (code review, gap analysis, target architecture, roadmap, risks), `docs/08-saas-evolution/prd-coach-office.md`, ADR-0011 to ADR-0013.
- **First customer:** Takanesh Academy; pilot with 3 mentors and 100 students (total: 10 mentors, more than 3000 students). The founder's current students move to the Takanesh organization.
- **Roadmap:** sprint 0 (docs) → 1 multi-organization → 2 multilingual → 3 program model → 4 mentors and directory → 5 tasks and progress → 5b packages, sessions, goals → 5c per-run stages → 6a overview and run enrollment → 6b dashboard and Takanesh onboarding; about 14 to 17 weeks.
- **Open questions:** Q2 pilot start date (not yet known); a commercial Vercel plan before Takanesh data goes in (Hobby is non-commercial); an independent nightly backup of Supabase; updating `CLAUDE.md` for the new direction.
- **Sprint 0 gate:** approved; answers: packages are sold, simple scheduling in the MVP, templates are created by admins and mentors, the mentor's private note stays private, sign-in by mobile number with a manual link is enough for now, Vercel and Supabase stay until the collaboration model and the server question are clear.
- **Sprint 1 (multi-organization):** `docs/05-delivery/saas-sprint-1.md`. Migration `0006_organizations`, organization isolation in all queries, organization settings and lists, organization switching in "My account", `org:*` CLIs. All tests green; the migration was tested on 0.1-like data. **Not run on production and not committed.** The rollout order (backup → migrate → deploy → `org:rename` to Takanesh) is in the sprint document.
- **Sprint 2 (multilingual):** `docs/05-delivery/saas-sprint-2.md`. next-intl, dynamic `lang`/`dir`, language preference in "My account" (migration `0007_user_preferences`), API errors in the request language, `lib/format` and `lib/org-day` (Tehran and Amsterdam tests), shell extraction, sign-in and invitation, "Today" and the task list, `org:create --locale`, a CI guard against new Persian text. **Not run on production and not committed.** Left for sprint 3: the task forms and the rest of the pages (CI baseline).
- **Sprint 3 (program model):** `docs/05-delivery/saas-sprint-3.md`, ADR-0012 (accepted, expand step). Migration `0008_programs`: template with phases and activities, publish, copy, archive, a mentor's private template with admin approval; a run with a fixed copy of the template (group and individual, one-on-one without a template); enrollment, pause, end and phase change; for each organization the current path became the "Freelance mentoring" program (`«منتورینگ فریلنسری»`, the seeded name) with every student enrolled, and it stays in sync via a trigger. The "Programs" pages, the template editor, the run page and "My programs", in two languages. The three acceptance criteria hold (tests and local browser). **Not run on production and not committed; 0008 only after 0006 and 0007.** The mentor scope, the kanban, "Today" and health are still on the old path (sprints 4 and 5).
- **Check results (end of sprint 3):** 1797 tests (unit and integration, 81 files): 1796 green; one old profile-form test exceeded the 5-second timeout only under the load of the whole suite and is green on its own (it was also green in the previous full run); typecheck, Biome and the i18n guard are green.
- **Sprint 4 (mentors and directory):** `docs/05-delivery/saas-sprint-4.md`. Migration `0009_mentors`: `enrollment_mentors` (primary and companion mentor, with the `mentor_assignments` history carried over) and `mentor_profiles`. The mentor scope now comes from enrollment and run staff. A `private` note that the admin cannot see. The "Mentors" page and each mentor's page (card, capacity, transfer all). A "Programs and mentors" card in the student record. The setting "Mentors can start group runs". The three acceptance criteria are covered by automated tests. **Not run on production and not committed; 0009 only after 0006 to 0008.**
- **Founder (7 Aban):** "This sprint is done, start the next sprint too". Sprint 5 started immediately.
- **Sprint 5 (tasks and progress):** `docs/05-delivery/saas-sprint-5.md`.
  - Migration `0010_program_progress`: `tasks.enrollment_id` and `tasks.node_id`, the `node_completions` table, and `milestone_type_id` on nodes.
  - "Assign to group" from a task activity, with a deadline relative to the run start.
  - A "Mark done" action and a checklist for the student.
  - A pure progress function (required activities only; with no required activity, "unknown").
  - A progress bar in the run, the student record and "My programs".
  - Program and deadline filters in the review queue.
  - The whole suite is green: 1884 tests.
  - "My programs" was not viewed in the browser with a student account.
  - **Not run on production and not committed; 0010 only after 0006 to 0009.**
- **Sprint 5b (packages, sessions, goals):** `docs/05-delivery/saas-sprint-5b.md`.
  - Migration `0011_sessions_goals`: the `mentoring_sessions` and `goals` tables, and the `tasks.session_id` column.
  - One-on-one and group sessions: schedule, held, no-show, cancel and reschedule. Overlap is only a warning.
  - A session's next action as a follow-up task for the student.
  - Package consumption ("1 of 8 sessions · 60 days until expiry"). A no-show counts by default and can be waived per session.
  - Goals, and per-goal progress for one-on-one mentoring.
  - Sessions in the next 7 days in "Today", with a label for the next 24 hours.
  - The step 7 acceptance criterion holds (tests and local browser).
  - The whole suite is green: 1948 tests.
  - "My programs" was not viewed in the browser with a student account.
  - **Not run on production and not committed; 0011 only after 0006 to 0010.**
- **Founder:** "Each course has its own stages… I want to define them for each course". Estimate: about one sprint; the founder said to do it, then sprint 6.
- **Sprint 5c (separate stages for each course):** `docs/05-delivery/saas-sprint-5c.md`.
  - Each course's phases were defined in the template in sprint 3; now the daily pages know them too.
  - A "Course" selector in "Stages" and a kanban of that course's phases. The main path is the same old kanban.
  - Course and phase filters in the student list, and a "Course · phase n of m" label in rows and "Today".
  - "Change phase" in the student record.
  - R-STALL runs on the phase of all active enrollments; the worst phase decides.
  - No migration. The whole suite is green: 1956 tests.
  - **Not on production and not committed.**
- **Sprint 6a (organization overview and group run enrollment):** `docs/05-delivery/saas-sprint-6a.md`.
  - Sprint 6 was split in two; 6a is what the pilot cannot start without.
  - The admin "Overview" page: student health, work waiting for the team, a courses table (members, average progress, red and yellow) and a mentors table (students, capacity, overdue reviews, red).
  - "Import from Excel" into an open group run, with an optional "Phase" column. An existing student with the same mobile number is only added to the course.
  - No migration. The whole suite is green: 1967 tests.
  - **Not on production and not committed.**
- **Sprint 6b (notifications, student dashboard, English, e2e scenario):** `docs/05-delivery/saas-sprint-6b.md`.
  - In-app notifications with a bell and a notifications page for staff and students: new task, review result, new submission, message and question reply, new session.
  - A "My programs" card on the student's "Home": progress, current phase, next session and package consumption.
  - An e2e of the PRD acceptance scenario (13 steps): a second organization on the e2e server for the isolation step; English at two sizes on the 13 main pages without breakage.
  - Migration `0012_notifications` (a new table only). The whole suite is green: 1986 tests.
  - **Not on production and not committed.**
- **Sprint 7 (mentor calendar and session booking):** `docs/05-delivery/saas-sprint-7.md`, ADR-0014, design: `docs/08-saas-evolution/booking-design.md`. A scope change by the founder's decision (7 Aban): booking was previously outside the MVP.
- **Sprint 7b (month calendar for mentor hours):** `docs/05-delivery/saas-sprint-7b.md`, ADR-0014 amendment. Dates set in a month grid replace the weekly hours of those dates; weekly hours are optional. Migration `0014_date_hours`.
  - The mentor's "Calendar": session types (one-on-one templates) with booking settings, weekly hours with each range limited to some types, exception days, a preview, and approving or declining requests. The admin has every mentor's calendar.
  - The student's "Book a session": accepting mentors with their session types and the student's own package, a Jalali calendar of free hours, a request with a note, a list of requests, and cancelling up to 24 hours before the session.
  - Founder decisions: mentor approval for every booking; approval only with an active package of the same type and the same mentor (without a package: a request, and the admin enrolls them after payment outside the system); all mentors accepting; later cancellation only through the mentor.
  - Migration `0013_scheduling` (four new tables and the notification-type CHECK). The whole suite is green: 2082 tests; the booking e2e is green at both sizes.
  - **Not on production and not committed; 0013 only after 0006 to 0012.**
- **Next step (pilot preparation):** the founder's decision on deploying 0006 to 0013 to production; trying the import of real Takanesh data; load testing with 3000 students.
- **New open question:** a sample file or the current export of Takanesh's students (columns and date format) to try a real import before the pilot.

## Founder's answers (27 Mehr 1405, 2026-10-19)
| Question | Answer |
|---|---|
| Upwork only or multi-platform? | Teaching starts with Upwork but is for **all freelance work** |
| Replacement, complement or standalone? | **Standalone product** |
| Role of the mentors | Helping the student **reach income** + answering **specialized questions** |
| Real samples and checklist | No samples for now; currently uses AI for reviews; samples later |
| **Urgent need** | Easier management of the current students; right now he forgets each student's profile, what he asked of them, and which stage they are at |

## Phase 1 outputs
| Task | Agent | Output | Status |
|---|---|---|---|
| PRD, MVP scope, criteria | product-strategist | `docs/02-product/prd.md`, `mvp-scope.md`, `metrics.md` | ✅ |
| Learning path, progress tracking, mentor routine, engagement | curriculum-designer | `docs/02-product/learning/` | ✅ |
| Rubrics for proposal, job and profile review + samples | upwork-domain-expert | `docs/02-product/tool-rubrics/` | ✅ |
| Coordination and gate | project-lead | this file, `docs/backlog.md` | ✅ |

## Phase 1 gate summary

### The product in two steps
- **Version 0.1: "Coach Office"** (about 5 to 6 weeks with 1 developer; invitation only; no AI and no payment): student record with multi-platform profiles, path stages and kanban, tasks with deadlines, submissions and feedback, notes and timeline, reminders and the "Today" page, student health status (green/yellow/red), questions and answers, milestone logging. The "proposal for review" task collects the real samples the AI needs (goal: 30 samples).
- **Version 1.0: the platform**: logging applications, proposal and job review with AI, public sign-up, rial subscription and payment, SMS/Telegram notifications.
- **Gate between the two versions:** if the coach himself does not use 0.1 for 4 weeks, building 1.0 stops.

### Learning path
9 stages: 0 start and level assessment, 1 niche, 2 storefront, 3 portfolio, 4 finding opportunities, 5 proposal and submission, 6 interview and first contract, 7 delivery and review, 8 growth. Platform branches: bidding (Upwork, complete in the MVP), catalog (Fiverr) and direct client. A mentor approves each stage's gate. The place for the teaching content is empty and you fill it.

### Tool criteria (all defaults, waiting for your calibration)
- **Proposal:** Hook 20, personalization 15, proof 15, client focus 10, answering the questions 10, originality 10, the rest 5 each.
- **Job:** first 8 red scam flags ("do not apply"), then a score: client 35, posting 25, fit 25, competition 15.
- **Profile:** Overview 30, portfolio 20, headline 15, the rest.
- **New finding:** according to the Upwork guide, Specialized Profiles were removed from 28 May 2026 (from the search result; the official page returned 403).

### Coordination done by the project lead
| Inconsistency | Resolution |
|---|---|
| The PRD had three simple "stuck" labels; the curriculum designer had 15 green/yellow/red rules | The PRD (F7) now treats the progress-tracking rules as the source of truth; 8 rules in 0.1, 6 rules that depend on logging applications moved to 1.0; "waiting for us" (team SLA) stayed separate |
| The weekly check-in was in the curriculum design but not in the MVP scope | Added to 0.1 as a Should |
| An "in progress" status for a task | Added to the PRD as an optional status |
| A PRD reference to `job-review.md` | Corrected to `job-analysis.md` |
| "Specialized Profile" in the learning path and the record | Removed (obsolete) |
| The "out of scope" list | Moved to `docs/backlog.md` |

## Phase 1 gate decisions (approved 27 Mehr 1405, 2026-10-19)
**Founder changes:** D1 = a web app that works well on **desktop and mobile**. D7 = **payment and gateway suspended for now** until the revenue model is settled. The rest were accepted with the team's defaults.

| # | Decision | Result |
|---|---|---|
| D1 | Web app or Telegram bot for 0.1 | ✅ Web app, good on desktop and mobile |
| D2 | Should a mentor see only their own students or all | Only their own |
| D3 | The 9 path stages and the duration of each | `learning/learning-path.md` |
| D4 | Yellow/red thresholds and team SLA | The F7 tables in the PRD |
| D5 | North Star: "first paid contract/order on any platform or a direct client, with evidence and the coach's confirmation" | As stated |
| D6 | Student consent to the anonymous use of proposals to build the AI | Consent checkbox |
| D7 | Enamad/gateway or card-to-card in 1.0 | ✅ Suspended until the revenue model is decided |
| D8 | Foreign-currency payment or a rial intermediary for the LLM | Rial intermediary |

**Still unanswered from phase 0:** the number of students and mentors (assumption: 30 to 80 students, 2 to 4 mentors), budget and timeline (assumption: 1 full-stack developer), where the teaching content lives (assumption: elsewhere, and we link to it).

## Phase 2 and 3 gate summary (version 0.1)

### Outputs
| Task | Agent | Output |
|---|---|---|
| Page map, 9 user flows, design system, wireframes of 10 pages | ux-designer | `docs/03-ux/` (wireframes: `wireframes/index.html`) |
| Overview, stack, data model, API, 8 ADRs | software-architect | `docs/04-architecture/` |
| Browser review of the wireframes (1440px and 375px) and coordination | project-lead | No page has horizontal overflow; all RTL; no external resources |

### Visual design (founder feedback: "a stronger design and the Vazir font")
- High-quality mockups for all 10 pages in `docs/03-ux/mockups/` (start: `index.html`). The wireframes remain the structure reference.
- Primary color ink indigo `#4A40A8`, warm paper background, dark sidebar, automatic dark mode.
- Vazirmatn 33.0.3 font (variable 100 to 900, OFL license) stored locally in `docs/03-ux/assets/fonts/`; no CDN.
- The project-lead's browser check: 20 states (10 pages × 1440 and 375 pixels) with no horizontal overflow, the font loaded everywhere, no external resources; dark mode was seen.

### Proposed technical decisions
- **Stack:** one Next.js + TypeScript application (UI, API and scheduled jobs), PostgreSQL with Drizzle, a pg-boss queue on the same Postgres, built-in authentication (argon2id), Tailwind + shadcn, local Vazirmatn font, one Docker image.
- **Hosting:** Azure (App Service B1 + PostgreSQL B1ms + Blob), about 30 to 35 dollars a month. The same image also runs on an Iranian server.
- **Health status:** computed after every relevant event and hourly for everyone.
- **Privacy:** the student gets data from separate routes that have no internal fields; an automated test checks for leaks of internal notes.

### Critical foreign-hosting risk (H1)
Between January and late May 2026 there was an 88-day, almost complete shutdown of international internet in Iran, after which only part of the access came back (NetBlocks; confirmed by the project-lead by search). The state in Mehr 1405 is **not confirmed**. In such an outage, a platform on Azure or Vercel does not open for students and mentors inside Iran. The architecture's answer: portability, a nightly backup inside Iran, and a rehearsed migration runbook. Access to the Azure and Vercel domains from Iranian operators has also not yet been tested.

### Coordination
| Inconsistency | Resolution |
|---|---|
| UX: the "forgot password" page logged the request for the admin; the API has no such public endpoint | The page only guides the user to message the coach; the admin builds a reset link |
| PRD: "0.1 hostable in Iran" | Changed to "hosted on Azure/Vercel, portable to an Iranian host" |
| UX and API on deadline extension | Consistent: only the coach/mentor extends; the student sends the request as a question |

## Phase 2 and 3 gate decisions
**Status:** the founder approved the design and said "start". E1 to E7 did not get explicit answers; the build proceeds with the **team's defaults**. E1 to E4 and E7 are needed only before **deployment**, and the local build does not depend on them. E5 (check-in: it will be built) and E6 (working hours) are configurable.

| # | Question | Team proposal |
|---|---|---|
| E1 | Hosting: Azure or Vercel? | Azure |
| E2 | With the international-internet outage risk, still a foreign server? | Yes for 0.1, provided there is a backup inside Iran and an access test from 3 operators before the start |
| E3 | Whose name is the Azure account and payment in, and is it compatible with Microsoft's terms? | Only the founder knows |
| E4 | Do you have a dedicated domain? | Required (for easy host switching) |
| E5 | Build the weekly check-in in 0.1? | Yes (about 2 days of work; detecting "churn risk" depends on it) |
| E6 | Team SLA (24 hours for a question, 48 hours for a review): working hours or calendar? | Working hours |
| E7 | Threshold for emergency migration to an Iranian server | 72 hours of outage |

## Next phase (after approval)
Phase 4 — building version 0.1: backend-engineer and frontend-engineer per `04-architecture/` and `03-ux/`; before that, the security review of the design (security-reviewer) and environment and CI setup (devops-engineer).

## Decisions
| Date | Decision | Reason |
|---|---|---|
| 27 Mehr 1405 (2026-10-19) | The 12-agent team and the 7-phase process were defined | Project start |
| 27 Mehr 1405 (2026-10-19) | Positioning: critique and coaching, not automatic proposal generation | Uma and cheap tools have commoditized generation |
| 27 Mehr 1405 (2026-10-19) | Standalone, multi-platform product; start with Upwork | Founder's answer; also reduces risk R11 |
| 27 Mehr 1405 (2026-10-19) | MVP core: student management for the coach and mentors; AI is built on top of it | The founder's urgent need |
| 27 Mehr 1405 (2026-10-19) | Two-step MVP: 0.1 "Coach Office" and 1.0 "platform", with a real-usage gate between them | Lowest risk; 0.1 also collects the data the AI needs |
| 27 Mehr 1405 (2026-10-19) | Responsive web app, good on desktop and mobile | Founder's decision (D1) |
| 27 Mehr 1405 (2026-10-19) | Payment and gateway left the scope until the revenue model is settled | Founder's decision (D7) |
| 27 Mehr 1405 (2026-10-19) | 0.1 hosting on Vercel or Azure; the architecture stays portable to an Iranian host | Founder's decision; the choice between the two and the access-from-Iran risk are in the hosting ADR |
| 27 Mehr 1405 (2026-10-19) | The visual design (mockups) was approved; phase 4 started | "Okay, start" |
| 27 Mehr 1405 (2026-10-19) | Local development without Docker: embedded Postgres (npm) for dev and tests; Docker only for deployment and CI | Docker and Postgres are not installed on the founder's machine |
| 28 Mehr 1405 (2026-10-20) | The design security review was done; C1 to C5 applied in the ADRs and data-model; C6 to C8 before deployment | `04-architecture/security.md`, ADR-0010 |
| 28 Mehr 1405 (2026-10-20) | The repository skeleton is ready (Next.js 16, embedded Postgres, Vitest, Playwright, CI); lint, typecheck and 15 tests green | ADR-0009; project-lead review |
| 6 Aban 1405 (2026-10-28) | The founder deployed and tested 0.1 on Vercel (Hobby) and Supabase (Postgres and Storage) | Founder's decision; `docs/07-launch/supabase-storage.md` |
| 6 Aban 1405 (2026-10-28) | New direction: evolve this same application into "Coach Office", a multi-organization mentoring platform; no rewrite | Founder's approval; `08-saas-evolution/architecture-review.md` |
| 6 Aban 1405 (2026-10-28) | First customer Takanesh Academy; pilot with 3 mentors and 100 students; for now on Vercel and Supabase; the Iran-server decision after completion | Founder's answer |
| 6 Aban 1405 (2026-10-28) | English: only the infrastructure for the pilot; translation before presenting to investors | Founder's answer; ADR-0013 |
| 6 Aban 1405 (2026-10-28) | Two kinds of mentoring (program-based and one-on-one) on one core; a "plan" = a sellable package with a session quota and validity, with no payment in the system | Founder's answer; ADR-0012 |
| 6 Aban 1405 (2026-10-28) | Simple session scheduling in the MVP; calendar sync and automatic booking after the MVP | Founder's answer; ADR-0012 |
| 6 Aban 1405 (2026-10-28) | Program templates are created by admins and mentors; a mentor's template needs admin approval for organization-wide use | Founder's answer (Q5) |
| 6 Aban 1405 (2026-10-28) | A mentor's private note stays hidden from the organization admin | Founder's answer (Q7); ADR-0011 |

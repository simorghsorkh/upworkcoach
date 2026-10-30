# Supplementary PRD: Coach Office — a multi-organization coaching platform

- **Status:** proposed (Sprint 0); awaiting founder approval
- **Date:** 6 Aban 1405 (2026-10-28)
- **Relation to the earlier PRD:** `docs/02-product/prd.md` (version 0.1 "Coach Office" for a single coach) is **not removed**. This document adds the new direction: anything not changed here is as stated there. The AI tools (the earlier version 1.0) move to P2.
- **Sources:** the founder's document "Coach Office — Product Evolution & Architecture Review", `architecture-review.md` (same folder), the founder's answers on 6 Aban 1405

## 1. Vision
**"The operating system for coaching programs."** Educational organizations and independent coaches manage the whole mentee journey, from enrollment to a measurable result, in one place; not just record keeping and not just content delivery.

**First customer:** Takanesh Academy (Iran). 10 mentors and more than 3000 mentees; the **pilot has 3 mentors and 100 mentees**. The founder's current mentees also move to the Takanesh organization.

**Long-term goal:** a multilingual SaaS for independent coaches, coaching teams, academies and organizations, including in the Netherlands.

## 2. Users
| Role | What they want | Level |
|---|---|---|
| Platform admin | Create organizations, support | Platform (for now only via script) |
| Organization owner | Manage the organization space and admins | Organization |
| Organization admin | Mentors, mentees, programs, reports | Organization |
| Program manager | Build and run one program and its members | Program run |
| Mentor | Their own mentees, their own templates, review, sessions, follow-up | Organization + program run + membership |
| Mentee | Their own programs, tasks, feedback, sessions, progress | Themselves |

One user account can have different roles in different organizations.

## 3. Two types of mentoring, on one core
| | Program-based | One-on-one |
|---|---|---|
| Example | "Upwork freelancing mentoring, 8 weeks" | "One-on-one: 8 sessions in 2 months" |
| Structure | Phase → activity (lesson, assignment, checklist, resource, milestone) | Goals + sessions + next actions; optional path |
| Run | Group (cohort) or individual | One mentee, one or more mentors |
| Progress | Completed required activities | Achieved goals; session consumption is shown separately |

### 3-1. Packages (sellable plans)
- Every template can be a "package": type (program-based or one-on-one), **session count** (optional), **duration of each session**, **validity period** (e.g. 60 days).
- Selling is **outside the system** for now (decision of 27 Mehr 1405 / 2026-10-19: payment is out of scope). After receiving the money, the admin enrolls the mentee in the package. **No price or payment table, page or field is built**; only the place to add it later stays open.
- The system shows package consumption: "5 of 8 sessions, 12 days until validity ends".

### 3-2. Sessions (simple scheduling)
- A mentor or admin records a session: date and time, duration, link or location (free text), one mentee or a whole group.
- Status: planned, held, cancelled, mentee no-show.
- After the session: a note (with a visibility level) and "next actions" that turn into tasks.
- Upcoming sessions on the mentor dashboard, the mentee dashboard and the "Today" page.
- **Outside the MVP:** Google Calendar sync, automatic creation of online meeting links, SMS reminders.
- **Scope change (7 Aban 1405 / 2026-10-29, founder's decision):** booking a session from the mentor's free hours with mentor approval entered the pilot scope (ADR-0014, Sprint 7).

## 4. MVP scope
### P0 — infrastructure
- Organization, membership and organization role; complete isolation on the server
- Access at the program run and membership level; several mentors per mentee
- Program template and run (snapshot), group and individual runs
- Persian and English multilingual infrastructure, RTL and LTR (pilot UI: Persian only)

### P1 — pilot features
- Mentor directory and mentor profile (internal to the organization)
- Mentee management (current features, moved to the organization)
- Program builder; a mentor's private template with admin approval for organizational use
- Individual and group enrollment; cohort as a group run
- Packages (session quota and validity), sessions, goals
- Task, versioned submission, feedback and revision (current features)
- Deterministic progress; milestones; mentee health (current features)
- Organization, mentor and mentee dashboards
- Simple in-app notification
- A mentor's private note that the admin does not see

### P2 — after the MVP
Calendar sync with an external service, live session, private messaging and group discussion, forms and quizzes, advanced analytics, **selling and payment**, AI tools (job review, proposal review, profile review), a public mentor marketplace, white-label, full Dutch, mobile app, automatic organization sign-up and the platform admin console, subgroups inside a cohort.

### After the pilot and before the investor meeting
English translation of the main pages (on the P0 infrastructure) and an English demo organization with fake data.

## 5. Current features that are preserved
Authentication with mobile and password and invitation by link; mentee record; platform profiles and proposal review (as the organization's "freelancing add-on"); stage gate with mentor approval; task, deadline extension, versioned submission, review queue; Q&A with SLA; weekly check-in; reminders and "Today"; health with 9 rules; milestones and North Star; CSV export and import; data erasure and retention; private files.

## 6. MVP acceptance scenario (with the Takanesh pilot numbers)
1. The platform admin creates the Takanesh organization with a script and invites the owner.
2. The Takanesh admin invites 3 mentors.
3. The admin imports or invites 100 mentees by CSV; the founder's current mentees are in Takanesh with their entire history.
4. A mentor builds the 8-week "Freelancing mentoring" template and submits it for organizational use; the admin approves.
5. From that template the admin creates a group run; 20 mentees join; 2 mentors are assigned to it.
6. Another mentee takes the same path individually.
7. A mentee is enrolled in the "one-on-one: 8 sessions in 2 months" package; the mentor records and holds a session and sets a next action; package consumption is visible.
8. Mentees submit tasks; mentors approve or request changes.
9. Mentees see feedback and up-to-date progress.
10. Mentors see overdue work, overdue reviews and upcoming sessions.
11. The admin sees aggregate progress and mentor workload, but does not see the mentors' private notes.
12. Every user sees only their own permitted records; a user of a second test organization sees no Takanesh data.
13. The UI works fully in Persian (RTL) and the main pages do not break when the language is switched to English (LTR).

## 7. Pilot success criteria (proposed; to be calibrated with Takanesh)
| Metric | Target for the first 4 weeks |
|---|---|
| Mentors who log in every week | 3 of 3 |
| Weekly active mentees (login or submission) | 60% or more |
| Submissions reviewed within the SLA | 80% or more |
| "Red" mentees who get action within 48 hours | 80% or more |
| The Takanesh admin gets the weekly report from the system, not from Excel | Yes |

## 8. Assumptions and open questions
| # | Item | Status |
|---|---|---|
| Q2 | Pilot start date | Open |
| Q8 | Are login with mobile and a manual invitation link enough for 100 mentees, or is SMS needed? | Open |
| H1 | The free Vercel plan is non-commercial; Takanesh is commercial use | Founder's decision before Takanesh data enters |
| H2 | The free Supabase plan has no restorable backup | An independent nightly backup in Sprint 0 or a plan upgrade |
| H3 | Decision on a server inside Iran | After the MVP is complete (founder's decision) |
| A1 | A user has only one role in an organization (e.g. not both mentor and mentee in the same organization) | Assumption; extended if needed |
| A2 | The product name is "Coach Office"; the repository and package name (`upworkcoach`) does not change for now | Assumption |

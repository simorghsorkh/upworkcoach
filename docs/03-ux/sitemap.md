# Sitemap — Version 0.1 ("Coach Office")

> Phase 2 — Author: ux-designer — 27 Mehr 1405 (2026-10-19) — Status: draft for the founder gate
> Inputs: `docs/02-product/prd.md` (F1 to F11), `mvp-scope.md`, `learning/progress-tracking.md` (section 8), `learning/mentor-workflow.md`, `01-discovery/personas.md`
> Sibling documents: `user-flows.md`, `design-system.md`, `wireframes/index.html`

---

## 1. Scope of this map

| In this map | Deliberately not included (deferred to 1.0 or the backlog) |
|---|---|
| Login, invite acceptance, and the admin/coach, mentor and student pages for F1 to F11 | Public sign-up and landing page (F16), AI tools (F13 to F15), payment and subscription (F17, on hold), application tracking and funnel (F12), SMS/Telegram notifications (F18), management reports (F19) |

**Empty slot for 1.0:** On the "Student home" and the "Student record" a reserved slot is defined for the tools, which **shows nothing at all in 0.1** (no disabled button, no "Coming soon"). Details in `design-system.md` section 9.

**Access rule:** The admin and the mentor have **the same pages**. The only difference is the data scope: a mentor only sees the students assigned to them (assumption A8 / decision D2), while the admin sees everyone, with a "Mentor" filter. Pages that only the admin has are marked "admin".

**Page codes:** `G` = general (no login), `M` = coach and mentor, `S` = student. The "Wireframe" column points to files in `wireframes/`.

---

## 2. Public pages (no login)

| Code | Page | Proposed URL | PRD feature | User story / goal | Wireframe |
|---|---|---|---|---|---|
| G1 | Login (mobile + password) | `/login` | F1 | Student: "Log in with a link and set a password, without a long form" | — (two-field form, pattern in design-system) |
| G2 | Accept invite and set password / set a new password via reset link | `/invite#t=<token>` and `/reset#t=<token>` (one component; title based on `purpose`) | F1 | Same; (security C1) the **name** is displayed; the user enters **their own mobile number** (`inputmode="tel"`, `autocomplete="username"`) + password and password confirmation (`new-password`). The mobile number is not shown prefilled or masked. The token is in the fragment and the page immediately removes it from the address bar (`history.replaceState`). If the browser is logged in with another account, a warning: "Continuing will log you out of that account". Wrong mobile number: "This number does not match this link". No external links; one line about where data is stored + a link to the privacy page (SEC-F4) | — |
| G3 | Invalid invite or reset link (expired / used / revoked) | `/invite` and `/reset` (error state) | F1 | Clear message + "Ask your coach for a new link". (Security C1) After 5 wrong mobile numbers the link is also revoked and this same state is shown | — |
| G4 | Forgot password | `/forgot` | F1 | In 0.1 without OTP: the page only instructs the user to message the coach; the admin generates a reset link from the user panel (`POST /users/:id/reset-link`) and sends it themselves. There is no public request form (consistent with api.md; one less unauthenticated endpoint) | — |

There is **no** public sign-up page (F1, acceptance criterion 4). The root URL `/` redirects a logged-out user to `/login`.

---

## 3. Admin/coach and mentor

Main navigation: **Today · Students · Stages · Tasks · Questions** (+ for the admin: **Results · Settings**). On mobile, the bottom bar: Today, Students, [+ Quick add], Tasks, Questions; the rest in the top menu.

| Code | Page | Proposed URL | PRD feature | User story / goal | Wireframe |
|---|---|---|---|---|---|
| **M1** | **Today** (first page after login) | `/today` | F6, F7, F8, F4 | Coach/mentor: "In the morning, see one list: whom to follow up with, which submission is waiting for review, which question is unanswered" + "know without searching which student is stuck and whose court the ball is in" | `today.html` |
| **M2** | **Students — list** | `/students` | F2, F7 | Coach: search and filter by name, stage, mentor, tag, platform, health; the "My students / All" list view in `progress-tracking.md` section 8 | `students.html` |
| M2a | New student + invite link (dialog) | `/students/new` | F1, F2 | Admin: "Create a student with name and mobile and get a one-time invite link" (< 1 minute) | inside `students.html` |
| M2b | Bulk import from CSV/Excel (Should) | `/students/import` | F11 | Migrating current students (`progress-tracking.md` section 2-9) | — |
| **M3** | **Student record** | `/students/:id` | F2, F3, F4, F5, F7, F8, F9 | Coach: "See on one page who this student is, what profiles they have, where they are and what I have asked of them" | `student-profile.html` |
| M3a | — Tasks section | `/students/:id#tasks` | F4 | This student's tasks, ordered by deadline | same |
| M3b | — Timeline section + add note | `/students/:id#timeline` | F5 | "After every session or Telegram message, leave a short note" (< 3 clicks) | same |
| M3c | — Showcases section (platform profiles) | `/students/:id#profiles` | F2 | "What profiles do they have?" with link, status, niche | same |
| M3d | — Questions section | `/students/:id#questions` | F8 | This student's questions | same |
| M3e | — Milestones section | `/students/:id#milestones` | F9 | Record and confirm the first contract, etc. | same |
| M3f | — Basic info (background, goal, contact) | `/students/:id#info` | F2 | Edit record fields | same |
| M3g | Change stage (dialog) | — | F3 | "Changing the stage is one click, with an optional note"; (Should) suggest template tasks | same |
| M3h | Other actions: manual flag, pause, snooze alert until a date, change mentor, resend invite | — | F7, F2, F1 | "Ignore the tag until a date (e.g. they are traveling)" | same (the "More" menu) |
| **M4** | **Stages (kanban)** | `/stages` | F3, F7 | Coach: "Set each student's stage and see how many people are in each stage" | `kanban.html` |
| **M5** | **Tasks — list** | `/tasks` | F4 | "See which task I asked of whom, and whether they submitted it" | `tasks.html` |
| M5a | New task (dialog) | `/tasks/new` | F4 | Define a task with a Jalali deadline; (Should) templates and bulk assignment | inside `tasks.html` |
| **M6** | **Task details: submissions and review** | `/tasks/:id` | F4 | "Write Persian feedback and give a result (accepted / needs revision)" + collecting "proposal + coach critique" pairs (G4) | `task-detail.html` |
| M7 | Questions — queue | `/questions` | F8 | Mentor: "See questions in one queue and answer them" | — (same list pattern as M5) |
| M8 | Question thread + record summary beside it | `/questions/:id` | F8 | "See the record summary next to the question" | — (same two-column pattern as M6) |
| M9 | My reminders | `/reminders` | F6 | All upcoming reminders (Today shows only today and overdue) | — |
| M10 | Results (**admin**) | `/results` | F9 | "Number of confirmed first contracts this month and cumulatively + median days to first contract" — two numbers and a median, nothing more | — |
| M11 | Settings (**admin**) | `/settings/*` | F11, F1, F7 | Subpages: users and mentor invites, path stages, platforms, milestone types, task templates, health and SLA thresholds, canned replies (red-line responses), CSV export (Should), password reset requests | — |
| M12 | My account | `/account` | F1 | Change password, name, log out | — |

### Differences between the admin and mentor views

| Page | Admin | Mentor |
|---|---|---|
| Today, Students, Stages, Tasks, Questions | All students; "Mentor" filter defaulting to "All" | Only their own students; the "Mentor" filter is not shown |
| Create student | ✓ with mentor selection | ✓ only assigned to themselves (can be turned off in settings) |
| Results, Settings | ✓ | Not shown (not disabled, but removed from the menu) |
| Reminder | For themselves or any mentor | Only for themselves |

---

## 4. Student

Navigation: **Home · Tasks · Questions · Path · Me**. On mobile, these same five items are in the bottom bar. The student **never sees health status, rule codes, flags or internal notes anywhere** (F5, `progress-tracking.md` section 8).

| Code | Page | Proposed URL | PRD feature | User story / goal | Wireframe |
|---|---|---|---|---|---|
| **S1** | **Home** (first page after login) | `/home` | F10, F3, F4, F8, F5 | Student: "When I open the app, see where I am on my path, what tasks I have with what deadlines, and whether my questions have been answered" | `student-home.html` |
| S1a | First-login welcome (a card on Home, not a separate page) | `/home?welcome` | F1, F10 | Sara: knows what her first step is; a "small win" in under 5 minutes = completing the first task of stage 0 | inside `student-home.html` |
| S2 | My tasks | `/my/tasks` | F4 | "See my task list with deadlines"; overdue ones at the top and in red | — (the same list as Home's tasks section, more complete) |
| **S3** | **Task details + submission** | `/my/tasks/:id` | F4 | "Submit and get feedback"; the "Proposal for review" type has separate fields and a consent checkbox | `student-task.html` |
| S4 | My questions | `/my/questions` | F8 | "Know when I will get an answer" | — |
| S5 | New question / question thread | `/my/questions/new`, `/my/questions/:id` | F8 | Topic + text + link; the expected response time is visible | — |
| S6 | My path | `/my/path` | F3 | "See the current stage, the next stage and a link to related content" | — (the same stepper as Home, expanded) |
| S7 | Me: profiles and info | `/my/profile` | F2 | Student: "Add or update my profile links myself" + skills | — |
| S8 | Propose a milestone (dialog) | `/my/milestones/new` | F9 | "Record my first contract with evidence so the coach can confirm it" | — |
| S9 | Weekly check-in (Should) | `/my/checkin` | F7 | 3-minute Thursday form | — |
| S10 | My account | `/account` | F1 | Change password, log out. **No delete-account button in 0.1** (security C5, ADR-0010): instead a guidance line "To delete your account, message your coach"; the admin anonymizes the data within 30 days | — |

---

## 5. Tree map

```
/login (G1) ── /forgot (G4)
/invite#t=…  and  /reset#t=…  (G2 | G3)   ← token only in the fragment (security C1)

[admin/mentor]
/today (M1)  ← first page
/students (M2) ─┬─ /students/new (M2a)
                ├─ /students/import (M2b, Should)
                └─ /students/:id (M3)  #tasks #timeline #profiles #questions #milestones #info
/stages (M4)   ← kanban; also reachable from M2 via the "List | Stages" switch
/tasks (M5) ── /tasks/new (M5a) ── /tasks/:id (M6)
/questions (M7) ── /questions/:id (M8)
/reminders (M9)
/results (M10, admin)
/settings (M11, admin) ─ users · stages · platforms · milestone-types · task-templates · thresholds · canned-replies · export · reset-requests
/account (M12)

[student]
/home (S1)  ← first page
/my/tasks (S2) ── /my/tasks/:id (S3)
/my/questions (S4) ── /my/questions/new | /:id (S5)
/my/path (S6)
/my/profile (S7) ── /my/milestones/new (S8)
/my/checkin (S9, Should)
/account (S10)
```

---

## 6. Feature coverage

| Feature | Pages |
|---|---|
| F1 Invite and login | G1–G4, M2a, M3h, M11 (users), S10 |
| F2 Record | M2, M2a, M3, S7 |
| F3 Path and stage | M3g, M4, S1, S6 |
| F4 Tasks and submissions | M1, M3a, M5, M5a, M6, S1, S2, S3 |
| F5 Notes and timeline | M3b, Quick add (all M pages on mobile), S1 (shared only) |
| F6 Reminders and Today | M1, M9 |
| F7 Stuck | M1, M2, M3 (header), M4, M3h, M11, S9 |
| F8 Questions and answers | M1, M3d, M7, M8, S1, S4, S5 |
| F9 Milestones | M3e, M10, S8 |
| F10 Student home | S1 |
| F11 Settings and export | M2b, M11 |

---

## 7. Assumptions of this map

| # | Assumption | Why |
|---|---|---|
| U1 | "Stages" is a separate page in the desktop menu, but on mobile it opens from the "List / Stages" switch on the Students page | The mobile bottom bar only has 5 slots |
| U2 | The **funnel tracker and funnel numbers** (the columns proposed in `progress-tracking.md` section 8) are not displayed in 0.1 | The PRD puts application tracking in F12 and in 1.0. The column's place in the student list stays empty |
| U3 | The four queues in `mentor-workflow.md` (urgent, questions, review, alerts) were merged with the four PRD sections (reminders, submissions, questions, stuck) on the "Today" page: sections follow the PRD, and "urgent" or "past response time" items go at the top of each section with a tag | The PRD is the source of features; the mentor-workflow prioritization was preserved |
| U4 | Displayed SLA: submission 48 hours, question 24 hours (PRD F7). The finer-grained SLAs of mentor-workflow (4 hours urgent, 72 hours non-gate) are assumed to be configurable in M11 | Inconsistency between the two documents |
| U5 | The founder's "cohort funnel" (`progress-tracking.md` section 8) in 0.1 is just the kanban (count per stage) + the results page (F9) | F9 limited the admin dashboard to "two numbers and a median" |
| U6 | Password recovery in 0.1 = a request to the admin, because SMS OTP is not in 0.1 (mvp-scope F1) | — |

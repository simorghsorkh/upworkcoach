# PRD — UpworkCoach (working name)

> Phase 1 — 27 Mehr 1405 (2026-10-19) — Author: product-strategist — Status: draft for the founder gate
> Inputs: `docs/STATUS.md` (founder's answers), `docs/01-discovery/*`
> Aligned documents (being written by other agents):
> - Path stages and tasks: `learning/learning-path.md` (curriculum-designer)
> - Tool rubrics: `tool-rubrics/` (upwork-domain-expert), e.g. `tool-rubrics/proposal-review.md` and `tool-rubrics/job-analysis.md`
> - Scope and prioritization: `mvp-scope.md` — Metrics: `metrics.md`

---

## 1. Summary in three lines
1. **Core:** a "live student file" for the coach and mentors: profiles on each platform, path stage, requested tasks with due dates and status, interaction history, reminders, and a "who is stuck" view.
2. **Student side:** see their tasks, submit work, ask questions.
3. **On top of the core:** AI tools (proposal review and job analysis) and payments, in version 1.0.

The product is **independent** and **multi-platform**: Upwork is the first platform, but Fiverr, Contra, LinkedIn and direct clients are equal peers in the data model.

## 2. Problem (redefined after the founder's answers)
| Stakeholder | Today's problem | Evidence |
|---|---|---|
| Coach (founder) | Forgets which profiles each student has, what was asked of them and which stage they are in. Information is scattered across Telegram and their memory | Founder's direct statement (1405/07/27) |
| Mentor | Does not know what the student has already done or what was said; follow-up is manual | Reza persona (hypothetical) |
| Student | Does not know exactly what to do right now or when their question will be answered | Sara and Amir personas (hypothetical) |

**Key change from Phase 0:** problem number one is no longer "proposal quality" but **"the coach loses control over students' work"**. This problem is real, urgent and buildable without AI. AI tools are still important, but they sit on top of this core.

## 3. Goals and non-goals

### Goals
| # | Goal | Version | Metric (details in `metrics.md`) |
|---|---|---|---|
| G1 | The coach sees at a glance where each student is and which ones are behind or stuck | 0.1 | Complete file for ≥ 90% of active students; coach uses the "Today" view ≥ 4 days a week |
| G2 | No requested task or question gets lost | 0.1 | 100% of tasks recorded in the system; median question response time < 24 hours |
| G3 | The student knows their next step and submits it | 0.1 | ≥ 60% of tasks submitted by the due date |
| G4 | Real data is collected for building the AI tools (proposal + coach critique) | 0.1 | ≥ 30 labeled samples by the end of 0.1 |
| G5 | Fast, Persian AI feedback on proposals and jobs, consistent with the coach's method | 1.0 | AI–coach agreement ≥ 80% |
| G6 | Recurring revenue and public sign-up | 1.0 | First online payment; paid conversion (target in `metrics.md`) |
| G7 | Increase the number of students who reach their first freelance income | Both | North Star |

### Non-goals (deliberately not)
| Non-goal | Reason |
|---|---|
| Full LMS (video hosting, quizzes, certificates) | Content probably lives elsewhere; building it is expensive. Only links to content (assumption A5) |
| Integration, scraping or browser extension on Upwork and other platforms | Against ToS (R3); input is always manual paste |
| Automatic generation of ready-to-send proposals in bulk | Uma writes them for free; our position is critique and teaching |
| Creating, buying, renting or brokering accounts, or cashing out income | Risks R4 and R11; red line |
| Real-time chat and full replacement of Telegram | 0.1 must stay small; asynchronous Q&A is enough |
| Marketplace of independent mentors or paying mentors | The mentor model is still unknown (open question 4) |
| Native mobile app | Mobile-first web app (PWA) is enough |
| Income guarantees or claims | Professional principle; only real statistics |

## 4. Assumptions (replacing unanswered questions)
Each assumption holds until the founder answers. If the answer differs, the related sections are revised.

| # | Topic (open question) | Our assumption | If wrong | How to validate |
|---|---|---|---|---|
| A1 | Number of students (3) | 30 to 80 active students, 1 coach + 2 to 4 mentors; growth under 200 people in 6 months | If more than 200: bulk import and automatic assignment move to Must | One number from the founder; count members of current groups |
| A2 | Telegram or web app (7) | **Mobile-first web app (PWA)** for 0.1. In 1.0 Telegram is only a notification channel | If students do not log in, the student side goes unused (the coach side still has value) | Pilot with 5 students in the first week of 0.1; weekly login rate |
| A3 | Budget and time (10) | Small team: 1 full-time full-stack developer + part-time design help; 0.1 in 4 to 6 weeks | With fewer resources, 0.1 Shoulds are dropped | Founder confirmation |
| A4 | Foreign-currency payment (6) | We have no direct foreign-currency payment. 0.1 has no foreign dependency (no AI, hostable in Iran). In 1.0, LLM access goes through an abstraction layer via a rial-based intermediary or a proxy server (architect's decision in Phase 3) | If we do have foreign-currency payment, 1.0 becomes simpler and cheaper | Founder's answer; Persian-quality test of intermediaries in Phase 3 |
| A5 | Educational content (8) | Content (videos and handouts) is hosted elsewhere; the platform only **links** to it | If there is no content, curriculum-designer and the founder must create it; product scope does not change | List of existing content from the founder |
| A6 | Payment gateway and Enamad (10) | 0.1 without online payment. 1.0 with Zarinpal or IDPay if we have Enamad; otherwise "card-to-card + receipt upload + manual approval" | Delay in online revenue | Start the Enamad process now |
| A7 | Niches (9) | Students are spread across several fields (programming, design, content, marketing). Niche and skill are a free field + tags, not a closed list | Low impact | Niche report from 0.1 data |
| A8 | Mentors (4) | Mentors are the founder's colleagues; each student has one primary mentor; a mentor sees only their own students | If mentors cover all students, access to "all" is opened (one setting) | Founder's answer |
| A9 | Current students' payment | Current students have already paid for the course; 0.1 is free for them | — | — |
| A10 | Student bottleneck (R8) | The bottleneck is at different stages; precisely for this reason "stage" and "stuck" in 0.1 produce real bottleneck data | — | Distribution of students across stages after 4 weeks |

## 5. Roles and permissions

| Role | Who | Summary |
|---|---|---|
| Admin (coach) | Founder | Sees and configures everything |
| Mentor | Coach's colleagues | Students assigned to them (assumption A8) |
| Student | Learner | Only their own file, with the sections marked "shared" |

| Action | Admin | Mentor | Student |
|---|---|---|---|
| Create or invite a student | ✓ | ✓ (only with assignment to themselves; can be turned off) | — |
| Invite a mentor, set role | ✓ | — | — |
| See the student list | All | Assigned ones | — |
| Edit file (profiles, niche, level) | ✓ | ✓ | Their own fields (profiles, links, skills) |
| Change path stage | ✓ | ✓ | — (view only) |
| Define tasks, due dates, review submissions | ✓ | ✓ | — |
| Submit a task | — | — | ✓ |
| **Internal** note | Read and write | Read and write | **Cannot see** |
| **Shared** note | ✓ | ✓ | Sees |
| Ask a question / answer | Answer | Answer | Ask and continue the conversation |
| Reminder | For themselves and anyone | For themselves | — (in 0.1) |
| Record a milestone (e.g. first contract) | Record and approve | Record and approve | Propose with evidence |
| Configure path stages, task templates, "stuck" thresholds | ✓ | — | — |
| CSV export | ✓ | — | — |
| AI tools (1.0) | ✓ | ✓ (and see their own students' outputs) | ✓ (within quota) |
| Payment and subscription (1.0) | Manage | — | Purchase |

## 6. Conceptual data model (platform-independent)
Conceptual only; final design with software-architect in Phase 3.

| Entity | Key fields | Multi-platform note |
|---|---|---|
| User | Name, mobile/email, role | — |
| Student | Primary mentor, level (beginner/applying/active/advanced), skills, niche(s), English level, income goal, current stage, date entered stage, tags, status (active/paused/graduated) | — |
| PlatformProfile | Platform, link, title/headline, status (in progress/active/restricted/suspended), niche of this profile, note | **Platform is an extensible list:** Upwork, Fiverr, Contra, LinkedIn, Freelancer, Behance/Dribbble, direct client, other. Each student has several profiles |
| Path / Stage | Stage name, order, expected duration (days), default task templates | Comes from `learning/learning-path.md` and is editable; code does not depend on stage names |
| Task | Title, description, type, related stage, due date, status, assigner, priority | Types: general, link/file, "proposal for review", "profile for review" |
| Submission | Text, links, attachment (image), structured fields (platform, job post text, proposal text), reviewer feedback, result | Platform field in all submissions |
| Interaction | Type (note, session, call, external message), text, internal/shared, author, date | — |
| Activity (automatic event) | Stage change, task status change, student login | Builds the file timeline |
| Reminder | For whom, about which student, time, text, done | — |
| Question/Thread | Asker, subject, messages, status (open/answered/closed), responsible responder | — |
| Milestone | Type, date, platform, amount (optional, with currency), evidence, approver | Types: profile ready, first application, first interview, **first paid contract/order**, first $1,000, … |
| Opportunity/Application — 1.0 | Platform, title, link, application cost (e.g. Connects; optional), status (sent/viewed/interview/contract/rejected) | "Connects" is just one type of cost, not a central field |
| AIReview — 1.0 | Tool, input, output, rubric version, user rating, referral to mentor | Rubric is selected by platform (Upwork or "general") |

**Security rule:** the system never asks for or stores passwords or login credentials of platform accounts. There is no field called "password", and forms show a warning.

## 7. Features, user stories and acceptance criteria
The IDs are used in `mvp-scope.md`. "Version" means the first version in which the feature ships.

### Version 0.1 — Student management core

#### F1. Account, invitation and login — 0.1
- **Admin:** I want to add mentors and students via an invite link so that public sign-up is not needed.
- **Student:** I want to log in with a link and set a password, without a long form.

| Acceptance criteria |
|---|
| Admin creates a student with name and mobile; the system gives a one-time invite link with 7-day expiry, which the admin sends themselves (e.g. on Telegram) |
| Login with mobile + password; password recovery via admin approval or SMS OTP (if the SMS service is enabled in 0.1) |
| A mentor gets the mentor role only after an admin invitation |
| Without an invitation, there is no public sign-up page |

#### F2. Student file — 0.1
- **Coach:** I want to see on one page who this student is, which profiles they have on which platforms, and what their niche and level are, so I don't have to find it from memory or Telegram.
- **Student:** I want to add or update my profile links myself.

| Acceptance criteria |
|---|
| Top of the file: name, primary mentor, current stage and days in it, level, niche, tags, last activity, number of open and overdue tasks |
| Profiles section: several profiles on different platforms, each with a clickable link, status and niche. Adding a new platform without a code change (from admin settings) |
| Creating a new file with minimal fields (name, mobile) takes less than 1 minute; the other fields are optional |
| Every change to the file is recorded in the timeline with the editor's name and time |
| Search and filter the student list by name, stage, mentor, tag, platform and "stuck" status |

#### F3. Path and stage — 0.1
- **Coach:** I want to set each student's stage and see how many people are in each stage.

| Acceptance criteria |
|---|
| Stages from `learning/learning-path.md` are defined in settings (name, order, expected duration) and are editable |
| Changing the stage is one click and optionally takes a note; the date of entering the stage is recorded |
| Funnel/kanban view: one column per stage, each student's card with days spent in the stage; warning color if the expected duration has passed |
| The student sees their current stage, the next stage and the link to related content |
| (Should) On stage change, the stage's template tasks are suggested and created with one click |

#### F4. Tasks and submission — 0.1
- **Coach/mentor:** I want to define a task with a due date for a student and later see whether they submitted it.
- **Student:** I want to see my task list with due dates, submit, and get feedback.

| Acceptance criteria |
|---|
| Task: title, description, type, due date (Jalali date), related stage (optional) |
| Status cycle: open → (in progress, optional and chosen by the student) → submitted → (needs revision → submitted)* → approved; or cancelled. "Overdue" is not a separate status; it is computed from "past due and not approved". The number of revision rounds and the history of due-date extensions are recorded (for R-LOOP and R-EXTEND). Aligned with `learning/progress-tracking.md` |
| Submission: text + link; (Should) image attachment up to 5 MB |
| "Proposal for review" type: separate fields for platform, job post text (English) and proposal text (English) + a consent checkbox for anonymous use in improving the tools |
| The reviewer writes Persian feedback and (optionally) gives a score of 1 to 5; this "input + coach critique" pair is the evaluation data for the 1.0 tools |
| The student sees their tasks ordered by due date; overdue tasks at the top and in red |
| (Should) Task template: recurring tasks are defined once and assigned to several students at the same time |

#### F5. Note and interaction history — 0.1
- **Coach:** I want to leave a short note after each session or Telegram message so I remember next time what we said.

| Acceptance criteria |
|---|
| Note with a type (note, session, call, external message) and mode **internal** (default) or **shared** |
| Single file timeline: notes + automatic events (stage change, submission, review, question, milestone) in chronological order, with a type filter |
| Adding a note from anywhere in the file takes fewer than 3 clicks and is easy on mobile |
| The student never sees internal notes on any page or API (access test mandatory) |

#### F6. Reminders and the "Today" view — 0.1
- **Coach/mentor:** In the morning I want to see a list: whom to follow up with today, which submissions are waiting for my review, which questions are unanswered.

| Acceptance criteria |
|---|
| Reminder on a student with time and text; e.g. "Thursday: follow up on Fiverr profile" |
| The "Today" page (the coach's and mentor's home page) has four sections: today's and past reminders, submissions waiting for review, unanswered questions, stuck students |
| Each item is one click away from the related file or task |
| A reminder can be marked "Done" or "Snooze" (1 day, 3 days, 1 week) |
| A mentor sees only items for their own students; the admin sees all, with a mentor filter |

#### F7. "Stuck / behind" view — 0.1
- **Coach:** I want to know, without searching, which student is stuck and "whose court the ball is in" (the student's or ours).

> **Aligned with `learning/progress-tracking.md` section 7 (project lead, 1405/07/27):** that file is the source of truth for rules and thresholds. Each student has a **health status** (green / yellow / red / paused) equal to the **worst active rule**, and the rule code is shown next to it. "Ball in court" is a property of each rule.

**Student-side rules in 0.1** (only rules whose data exists in 0.1):

| Code | Signal | Yellow | Red | Ball in court |
|---|---|---|---|---|
| R-INACT | Student inactivity (login, submission, question, check-in) | 7 days | 14 days | Student |
| R-STALL | Staying in a stage | > 1.5× the stage's usual duration | > 2× | Both |
| R-OVERDUE | Overdue task | One task > 3 days | 2 tasks, or one > 7 days | Student |
| R-LOOP | Revision rounds on one task | 3 rounds | 4 rounds or more | Both |
| R-NOTASK | No open task at all (except stage 8) | 3 days | 7 days | Coach/mentor |
| R-EXTEND | Third due-date extension on one task | ✓ | — | Student |
| R-FLAG | Manual mentor flag | By choice | By choice | — |
| R-CHECKIN / R-MOOD | Missed weekly check-in / mood ≤ 2 | Per progress-tracking | Per progress-tracking | Student |

**Team-side rules** (appear in the "Waiting on us" list on the "Today" page and do not change the student's health color):

| Signal | Threshold | Ball in court |
|---|---|---|
| Submission not reviewed | 48 hours | Coach/mentor |
| Question not answered | 24 hours | Coach/mentor |
| Red student with no recorded action | 48 working hours; after 7 days, reported to the founder | Coach/mentor |

**Churn risk:** if two of R-INACT, R-CHECKIN and R-MOOD are active at the same time, the status goes straight to red with the label "Churn risk".

**Moved to 1.0** (requires application tracking, F12): R-LOWVOL, R-NOREPLY (three-layer audit), R-BADJOBS, R-SKIPREVIEW, R-INTERVIEW, R-POSTCONTRACT.

**Weekly student check-in** (short Thursday form: this week's tasks, mood 1 to 5, "Do you need help from your mentor?") is a "Should" in 0.1 per `learning/progress-tracking.md`. If it is not built in 0.1, R-CHECKIN and R-MOOD move to 1.0 with it.

| Acceptance criteria |
|---|
| List sorted by severity and age; each row shows the reason for the label (e.g. "2 tasks overdue, 9 days inactive") |
| Thresholds are configurable in admin settings; labels are computed automatically without manual intervention |
| A "paused" or "graduated" student does not appear in this list |
| The coach can "ignore" the label for a student until a date (e.g. they are traveling) |

#### F8. Questions and answers — 0.1
- **Student:** I want to ask my question in one place and know when I will get an answer.
- **Mentor:** I want to see questions in one queue and answer them, with the student's file visible next to the question.

| Acceptance criteria |
|---|
| The student sends a question with a subject and text (and optionally a link or image); by default it goes to their primary mentor; the admin can change the assignment |
| Asynchronous threaded conversation (not real-time chat); status open/answered/closed |
| A summary of the file (stage, profiles, open tasks) is visible next to the question |
| The student sees the expected response time (e.g. "usually within 24 hours") |
| Content about buying/renting accounts or bypassing identity verification is not answered; a pre-written standard reply exists (red lines, section 9) |

#### F9. Milestones and outcomes — 0.1
- **Coach:** I want to record who got their first paid contract or order, on which platform and when, so I have real outcomes.

| Acceptance criteria |
|---|
| Configurable milestone types; defaults: profile ready, first application, first reply/interview, **first paid contract or order**, first income above $500 |
| The student can propose a record (with evidence: image or text); the coach or mentor approves. Only approved items count toward the North Star |
| Amount and currency are optional |
| Simple admin dashboard: number approved this month and cumulatively, and the median days from joining to first contract |

#### F10. Student home — 0.1
- **Student:** When I open the app I want to see where I am on my path, which tasks I have with which due dates, and whether my questions have been answered.

| Acceptance criteria |
|---|
| Home: current stage and progress along the path, open tasks ordered by due date, recent questions, new shared notes |
| In-app badge for new feedback or replies |
| Opens in under 3 seconds on a phone with a weak connection |

#### F11. Settings and export — 0.1
| Acceptance criteria |
|---|
| Admin: edit stages, platform list, milestone types, task templates, "stuck" thresholds, standard texts |
| (Should) CSV export of students, tasks and milestones (trust and no lock-in) |
| (Should) Bulk import of current students from CSV/Excel with columns name, mobile, mentor, stage, profile links |

### Version 1.0 — AI tools, payments, public sign-up

#### F12. Application tracking (opportunity funnel) — 1.0
- **Student:** I want to log each application in 20 seconds and see my response rate.
- **Mentor:** I want to see how many applications the student has sent and where they drop off.

| Acceptance criteria |
|---|
| Record: platform, title, link (optional), application cost (optional, e.g. Connects), date; changeable status: sent → viewed → reply/interview → contract / rejected |
| Student stats: number of applications per week and conversion rate at each stage; also visible to the mentor in the file |
| Reaching "contract" suggests recording a milestone |
| No automatic fetching from platforms |

#### F13. AI proposal review — 1.0
- **Student:** I want to paste the job post and my proposal and, in under a minute, understand in Persian what is wrong with it and how I can improve it myself.

| Acceptance criteria |
|---|
| Input: platform, job post text, proposal text (English); Persian output |
| Output structure per `tool-rubrics/proposal-review.md`: overall score, 3 main issues ordered by impact, a fix suggestion for each issue with a short example, strengths |
| The tool does not write a complete new proposal; it only shows how to fix parts (the "critique and teaching" position) |
| Rubric for Upwork and a "general" version (first message to a client on other platforms or direct) |
| Response time: median < 30 seconds; on service error, a clear Persian message and no quota deduction |
| User rating (Was it useful? 1 to 5) and a "Refer to mentor" button (F15) |
| Quality before release: ≥ 80% agreement with the coach's critique on the dataset collected in 0.1 |

#### F14. AI job analysis and scam detection — 1.0
- **Student:** Before spending Connects or time, I want to know whether this job post is worth applying to.

| Acceptance criteria |
|---|
| Input: job post text + structured client fields (by platform; for Upwork per `tool-rubrics/job-analysis.md`: payment verified, total spent, hire rate, number of proposals, …) |
| Persian output: recommendation (apply / with caution / no), reasons, scam signals, fit with the student's profile (from the file), pricing tip |
| Deterministic scam rules (e.g. a request for payment or communication off the platform) are applied even without the LLM |
| Same time, rating and referral criteria as F13 |

#### F15. Referring AI output to a mentor — 1.0
| Acceptance criteria |
|---|
| The student refers AI output to a mentor with a question; it arrives in the question queue (F8) with the AI input and output attached |
| The mentor can reply with "I agree / I'll correct it"; disagreements are recorded to improve the rubric |
| All of the student's AI reviews are visible in the file timeline |

#### F16. Public sign-up and onboarding — 1.0
| Acceptance criteria |
|---|
| Sign-up with mobile + SMS OTP (domestic SMS service) |
| Short onboarding questionnaire (5 to 7 questions: skills, platforms, experience, goal) that suggests the starting stage and fills in the file |
| A public user without a mentor also works (tools and path only); mentor assignment depends on the plan |

#### F17. Tool quotas (payment: suspended) — 1.0
> **Founder's decision (1405/07/27):** the payment gateway and the way money is collected are **out of scope for now** until the founder decides on the revenue model. The architecture only needs to leave room to add it.

| Acceptance criteria |
|---|
| Per-user usage quota for each AI tool, configurable by the admin (to control AI cost, independent of payment) |
| Quota counter visible to the user |
| The admin manually enables or disables a user's access to tools and mentor (with an optional end date) |
| ~~Plans, rial gateway, card-to-card, invoice~~ → suspended until the revenue model is decided (`docs/backlog.md`) |

#### F18. Notifications — 1.0
| Acceptance criteria |
|---|
| SMS or Telegram message (user's choice) for: new task, 24 hours before due date, new feedback or reply |
| Daily "Today" digest for the coach and mentors |
| Daily notification cap per user; option to turn off |

#### F19. Management reporting — 1.0
| Acceptance criteria |
|---|
| Cohort funnel: joined → profile ready → first application → first interview → first contract, broken down by joining month and platform |
| Mentor performance: response time, number of reviews, stuck students |
| AI cost per user and relative to revenue |

## 8. Non-functional requirements
| Area | Requirement |
|---|---|
| Language and script | Fully Persian, RTL interface; Jalali dates; Vazirmatn font; Persian digits in the UI; English text (job posts, proposals, links) inside LTR blocks |
| Desktop and mobile | Responsive web app that **works well on both desktop and mobile** (founder's decision). The coach's data-dense views (kanban, student list, "Today") use the screen width on desktop; all of the coach's tasks (notes, stage change, review) are also doable on a phone |
| Network | Lightweight; works on a weak connection; 0.1 hosted on Azure or Vercel (founder's decision, 1405/07/27; see `04-architecture/adr/0002-hosting-0.1.md`) but **portable to an Iranian host** (one Docker image, standard Postgres); no CDN or fonts from external services |
| Privacy | Data minimization; no storage of account passwords; internal notes separated from the student; explicit consent for using samples; account deletion possible. Review with security-reviewer |
| Availability | 99% during working hours is enough; daily backups |
| Scale | Up to 500 users without an architecture change (assumption A1) |
| Extensibility | Platforms, stages, task and milestone types, and rubrics are data, not code |

## 9. Product red lines
From `01-discovery/domain-notes.md` section 4 and `risks.md`:
- No scraping, logging in, extensions or automatic submission on any platform; input is manual paste only.
- No storage of account passwords or cookies.
- No brokering of or teaching about buying/renting accounts, using other people's identities, or bypassing identity verification (in content, tools and mentor answers).
- No templates or advice for communicating or paying outside the platform (circumvention).
- No income-guarantee claims.

## 10. Decisions the founder must make
| # | Decision | Our default | Impact |
|---|---|---|---|
| D1 | Web app (PWA) or Telegram bot for 0.1 | ✅ **Web app, good on both desktop and mobile** (founder, 1405/07/27) | All of 0.1 |
| D2 | Does a mentor see only their own students or everyone | Only their own | Permissions |
| D3 | List of path stages and the expected duration of each stage | From `learning/learning-path.md` | F3, F7 |
| D4 | Health-status thresholds (yellow/red) and team SLA (48-hour review, 24-hour question) | F7 tables (aligned with `learning/progress-tracking.md` section 7) | F7 |
| D5 | Exact definition of the North Star: "first paid contract/order on any platform or with a direct client", with evidence | As stated | `metrics.md` |
| D6 | Student consent for anonymous use of proposals in building the AI tool | With a consent checkbox | G4, F13 |
| D7 | Enamad/gateway or card-to-card in 1.0 | ✅ **Suspended**: payment is out of scope for now until the revenue model is decided (founder, 1405/07/27) | F17 |
| D8 | Foreign-currency payment or rial intermediary for the LLM | Intermediary (A4) | 1.0 architecture |

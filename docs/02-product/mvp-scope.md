# MVP scope — UpworkCoach

> Phase 1 — 27 Mehr 1405 (2026-10-19) — Author: product-strategist
> F IDs are defined in `prd.md`. Assumptions A1 to A10 are also in `prd.md` section 4.

## 1. Slicing principle
The MVP is two consecutive versions:

| Version | For whom | Question it answers | Time (assumption A3) |
|---|---|---|---|
| **0.1 — Coach Office** | The founder, mentors and **current** students (invitation only) | "Does the coach manage students better with this tool, and do students submit their tasks?" | 4 to 6 weeks to build |
| **1.0 — Platform** | Current students + new users via public sign-up | "Are the AI tools valuable, and will anyone pay for them?" | 6 to 8 weeks after 0.1 usage begins |

**Rule:** any feature without which the coach cannot drop Telegram and their memory starting tomorrow belongs in 0.1. Everything else waits.

**Side benefit of 0.1:** it has no foreign dependency (LLM, payment gateway, foreign server). So it is not held up by sanctions or Enamad, and at the same time it collects real data (proposal + coach critique) for building the AI in 1.0. These are exactly the samples the founder does not have right now.

---

## 2. Version 0.1 — Coach Office (MoSCoW)

| ID | Feature | Priority | Slicing note |
|---|---|---|---|
| F1 | Invitation and login (mobile + password) | **Must** | No public sign-up and no OTP; the coach sends the invite link themselves on Telegram |
| F2 | Student file + multi-platform profiles | **Must** | Editable platform list; filter and search |
| F3 | Path stages + stage kanban view | **Must** | Stages from `learning/learning-path.md`; automatic suggestion of template tasks = Should |
| F4 | Tasks with due dates, text/link submission, feedback | **Must** | "Proposal for review" type with separate fields = Must (for data collection) |
| F5 | Internal/shared notes + timeline | **Must** | |
| F6 | Reminders + "Today" page | **Must** | In-app only; no SMS |
| F7 | "Stuck / behind" view with configurable rules | **Must** | |
| F8 | Asynchronous questions and answers | **Must** | No file attachments (links only) in the base version |
| F9 | Milestones + North Star count | **Must** | Admin dashboard = two numbers and one median, nothing more |
| F10 | Student home | **Must** | |
| F11 | Admin settings | **Must** | Stages, platforms and thresholds only |
| F11 | Bulk import from CSV/Excel | Should | If there are fewer than 30 students, manual entry is enough (assumption A1) |
| F11 | CSV export | Should | |
| F4 | Task templates and bulk assignment | Should | The biggest time saving for the coach after the Musts |
| F4/F8 | Image attachments (submission, question, milestone evidence) | Should | |
| F7 | Weekly student check-in (this week's tasks, mood 1 to 5, "I need help") | Should | From `learning/progress-tracking.md`; rules R-CHECKIN and R-MOOD and "churn risk" detection depend on it (project lead's alignment) |
| F18 | SMS due-date reminder to the student | Could | Pulled forward if the on-time submission rate is low in week 2 |
| F8 | Canned replies (reply library) for recurring questions | Could | |
| — | AI tools, payments, public sign-up | **Won't (in 0.1)** | In 1.0 |

### 0.1 effort estimate (assumption: 1 full-stack developer)
| Package | Approximate weeks |
|---|---|
| Infrastructure, authentication, roles, RTL and Jalali calendar | 1 |
| File, profiles, stages, kanban | 1 |
| Tasks, submission, review | 1 |
| Notes, timeline, reminders, "Today", "Stuck" | 1 |
| Questions and answers, milestones, student home, settings | 1 |
| Testing, bug fixing, onboarding real students | 0.5 to 1 |
| **Total Must** | **5 to 6 weeks** (Shoulds: +1 week) |

### 0.1 exit criteria (gate into 1.0)
| Criterion | Threshold | After |
|---|---|---|
| The coach uses "Today" | ≥ 4 days a week, 3 consecutive weeks | 4 weeks of use |
| File coverage | ≥ 90% of active students have a file and a stage | 2 weeks |
| Weekly active students | ≥ 50% of invited students | 4 weeks |
| Labeled data for AI | ≥ 30 "proposal + coach critique" pairs with consent | 4 to 6 weeks |
| Qualitative | Founder: "I no longer forget who is where" (score ≥ 8 out of 10) | 4 weeks |

If the coach does not use 0.1, building 1.0 stops and the reason is investigated first. AI on top of a core that is not used has no value.

---

## 3. Version 1.0 — Platform

### Prerequisites
| Prerequisite | Owner |
|---|---|
| Proposal review and job analysis rubrics (`tool-rubrics/`) | upwork-domain-expert + founder |
| ≥ 30 labeled samples from 0.1 for evaluation | 0.1 data |
| LLM access decision (direct, rial intermediary, or proxy server) — assumption A4 | software-architect, ai-engineer, founder |
| Enamad and payment gateway, or acceptance of manual card-to-card — assumption A6 | Founder |
| Trial plan prices (`01-discovery/business-model.md`) | Founder + product-strategist |

### RICE scores for 1.0 candidates
Reach = students affected in one quarter (assumption: 80 active students); Impact: 0.25 to 3; Confidence: percent; Effort: person-weeks.

| ID | Feature | R | I | C | E | RICE | Decision |
|---|---|---|---|---|---|---|---|
| F18 | SMS/Telegram notifications | 80 | 1 | 70% | 1 | **56** | Must |
| F12 | Application tracking (funnel) | 80 | 1 | 80% | 1.5 | **43** | Must |
| F13 | AI proposal review | 80 | 2 | 70% | 3 | **37** | Must |
| F14 | AI job analysis + scam detection | 80 | 1.5 | 60% | 2.5 | **29** | Must |
| F15 | Referring AI output to a mentor | 40 | 1 | 70% | 1 | **28** | Should |
| — | AI profile review (Upwork + Fiverr gig) | 40 | 1.5 | 60% | 1.5 | **24** | Should |
| — | Rate and project price calculator (no LLM) | 30 | 0.5 | 80% | 0.5 | **24** | Could |
| F16 | Public sign-up + onboarding | 50 | 1 | 50% | 1.5 | **17** | Must (business prerequisite) |
| — | AI interview preparation | 30 | 1 | 50% | 1.5 | 10 | Won't (1.x) |
| — | AI draft answers to questions | 60 | 0.5 | 50% | 2 | 7.5 | Won't (1.x) |
| — | AI niche finder | 30 | 2 | 30% | 4 | 4.5 | Won't (1.x) |

**Outside RICE:** F17 is only "tool quotas and manual access activation" (Must, to control AI cost). **Payment and the gateway are suspended by the founder's decision** (1405/07/27) until the revenue model is defined; until then public sign-up (F16) also works only with manual activation by the admin.
**Should without a score:** F19 management reporting (it is for one person only, so RICE is meaningless; but it matters for proving outcomes and for sales).

### 1.0 summary
| Priority | Features |
|---|---|
| Must | F12, F13, F14, F16, F17, F18 |
| Should | F15, F19, AI profile review |
| Could | Rate calculator |
| Won't (1.x) | Niche finder, interview preparation, AI draft answers |

Estimate for the 1.0 Musts: about 8 to 10 person-weeks (mostly AI, evaluation and payment).

---

## 4. Out of scope (both versions)
The project lead moves this list to `docs/backlog.md`.

| Feature | Why it is out | When to revisit |
|---|---|---|
| AI niche finder | We have no market data; quality depends on the student's manual input; low C | After 3 months of niche and outcome data from 0.1 and 1.0 |
| AI interview preparation | Medium value; few students are at the interview stage | When ≥ 20% of students are at the interview stage |
| AI draft answers to questions | Risk of wrong answers in the mentor's name; question volume must be seen first | If mentor load exceeds capacity |
| Follow-up message draft | Low value | 1.x |
| Dedicated rubrics for Fiverr, Contra, LinkedIn | In 1.0 only Upwork + "general" | When ≥ 20% of applications are on another platform (F12 data) |
| LMS (video hosting, quizzes, certificates) | Expensive; content lives elsewhere (assumption A5) | If linking to content creates serious friction |
| Real-time chat and student groups/forum | Telegram already does this; maintenance and content moderation are heavy | After 1.0 |
| Full Telegram bot (recording tasks, submissions, tools from inside Telegram) | Two simultaneous interfaces is too much for a small team; 1.0 has Telegram notifications only | If the web app login rate is low (assumption A2) |
| Native Android/iOS app | PWA is enough; publishing in app stores is a hassle for Iran | After 6 months |
| Video sessions and mentoring appointment booking | Skyroom/Meet is enough; booking is done manually | With a paid mentoring package |
| Paying mentors and fee reporting | The mentor payment model is unknown (open question 4) | After the founder's answer |
| Automatic subscription renewal | Not common in Iranian payment gateways | — |
| Percentage of student income | Not measurable or collectible | — |
| Multi-coach version / selling the platform to other coaches (SaaS) | Attractive but distracting; it must work for one coach first | After 6 months, if the core succeeds |
| Advanced cohort dashboard and BI | 0.1 needs only two numbers | 1.0 (F19) and later |
| English interface | Users are Persian-speaking | — |
| Gamification (points, badges, leaderboard) | Unproven value | After 1.0 |
| Browser extension, scraping, platform API integration | **Forbidden** (ToS, R3) | Never |
| Account services, proxy identity verification, cashing out income | **Forbidden** (R4, R11) | Never |

---

## 5. Scope risks
| Risk | Signal | Response |
|---|---|---|
| Students do not log in to the web app (A2) | Weekly login < 30% in week 2 | Bring SMS reminders (F18) into 0.1; if that does not help, a lightweight Telegram bot for viewing tasks |
| The coach uses it only in the first week | "Today" usage < 2 days a week | Session observing the coach's work; remove data-entry friction (bulk import, templates) |
| 0.1 scope grows | Estimate > 6 weeks | Drop the Shoulds first; then simplify F8 to "link to Telegram" |
| Not enough data collected for AI | < 15 samples by week 4 | One "proposal for review" task for all students at the applying stage |

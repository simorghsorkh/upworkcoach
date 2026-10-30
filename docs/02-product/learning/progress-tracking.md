# Student Progress Tracking — UpworkCoach

> Phase 1 — author: curriculum-designer — 27 Mehr 1405 (2026-10-19)
> Status: draft, awaiting founder approval
> This document answers the founder's **urgent need**: "I forget what profile each student has, what I asked them to do, and which stage they are at." It is direct input for ux-designer (screens) and software-architect (data model).
> Stages: `learning-path.md`. Mentor work: `mentor-workflow.md`.

---

## 1. Principles

| Principle | Meaning |
|---|---|
| **Everything about one student on one page** | The record replaces Telegram, personal notes and the coach's memory. Any mentor who opens the record should understand within 30 seconds where the student is and what the next step is |
| **Three questions always have an answer** | (1) What showcase do they have? (2) What was the last task requested, and what is its status? (3) Which stage are they in, and since when? These three are visible at the top of the record |
| **Every student always has one open task** | A student with no open task is "without assignment" and triggers an alert |
| **Numbers, not feelings** | Progress is measured by output and funnel numbers, not by hours of video watched |
| **Light logging** | The student should spend at most 5 minutes a week on logging. Anything hard to log will not get logged |
| **No scraping** | A profile link is only stored; the system never opens it. The student or mentor pastes the showcase text |
| **Privacy** | No passwords, identity documents or platform login details are stored in the record (section 2.8) |

---

## 2. The Student Record

The "MVP" column: ✔ means needed in the first version; ○ means later. The "Filled by" column: S = student, M = mentor, Sys = system.
The English names are proposals; the final data model is up to software-architect.

### 2.1. Record header (always at the top of the page)

| Field | key | Description | MVP |
|---|---|---|---|
| Name and photo | `display_name` | — | ✔ |
| Current stage + days in stage | `current_stage`, `stage_entered_at` | e.g. "5-b, 18 days" | ✔ |
| Health status + reason | `health`, `health_reasons[]` | green / yellow / red / paused (section 7) | ✔ |
| Primary showcase | `primary_showcase` | current headline + link + rate (section 2.5) | ✔ |
| Next open task + deadline | computed | the nearest open "assignment" | ✔ |
| Last activity | `last_activity_at` | last login, submission, check-in or message | ✔ |
| Responsible mentor | `mentor_id` | — | ✔ |
| Funnel summary | computed | sent / replied / interview / contract (total and last 4 weeks) | ✔ |

### 2.2. Identity and contact

| Field | key | Type | Filled by | MVP |
|---|---|---|---|---|
| Full name | `full_name` | text | S | ✔ |
| Mobile | `phone` | text (verified) | S | ✔ |
| Telegram or messenger handle | `messenger_handle` | text | S | ✔ |
| Email | `email` | text | S | ○ |
| Sign-up date | `joined_at` | date (shown in Jalali) | Sys | ✔ |
| Course or cohort | `cohort` | selection | M | ✔ |
| Plan | `plan` | basic / pro / … | Sys | ○ |
| Available days and hours | `availability` | short text | S | ○ |

### 2.3. Background (from the onboarding form, stage 0)

| Field | key | Type | MVP |
|---|---|---|---|
| Main skill | `primary_skill` | text + category | ✔ |
| Skill level (self-reported) | `skill_level` | 1 to 5 | ✔ |
| Written / spoken English level | `english_writing`, `english_speaking` | 1 to 5 | ✔ |
| Available hours per week | `hours_per_week` | number | ✔ |
| Monthly income goal (USD) | `income_goal_usd` | number | ✔ |
| 90-day goal (numeric text) | `goal_90d` | text | ✔ |
| Prior freelancing experience | `prior_experience` | none / applied without result / a few contracts / active | ✔ |
| Monthly budget for Connects or ads | `acquisition_budget` | number (optional) | ○ |
| Main blocker in their own words | `self_reported_blocker` | text | ✔ |

### 2.4. Track

| Field | key | Description | MVP |
|---|---|---|---|
| Primary branch | `primary_track` | B (bid-based, e.g. Upwork) / C (catalog-based, e.g. Fiverr) / D (direct) — see `learning-path.md` section 2 | ✔ |
| Primary platform | `primary_platform` | Upwork / Fiverr / LinkedIn / … | ✔ |
| Secondary branch | `secondary_track` | optional | ○ |
| Entry point | `entry_stage` | from the placement assessment | ✔ |
| Status of each stage | `stage_progress[]` | section 3.1 | ✔ |
| Niche statement | `niche_statement` | output of stage 1 | ✔ |
| Rejected niches and reason | `rejected_niches` | — | ○ |

### 2.5. Showcases and assets ("What profile do they have?")

A student can have several showcases (e.g. an Upwork profile and a Fiverr gig). Each showcase:

| Field | key | Description | MVP |
|---|---|---|---|
| Platform | `platform` | — | ✔ |
| Type | `type` | profile / gig / LinkedIn / portfolio page | ✔ |
| Public link | `public_url` | stored only; **the system does not open it** | ✔ |
| Current headline | `headline` | — | ✔ |
| Current rate or price | `rate` | hourly rate or package price | ✔ |
| Current full text (snapshot) | `snapshots[]` | each time the student submits for review, a dated version is saved. Comparing versions = seeing progress | ✔ |
| Last profile-review rubric score | `last_review_score` | link to the tool output | ✔ |
| Mentor approval status | `mentor_approved` | yes / no + date | ✔ |
| Badges and level | `badges` | e.g. Rising Talent, Top Rated, seller level | ○ |
| Portfolio items | `portfolio_items[]` | title, problem, work, result, link, real or self-made | ✔ |

### 2.6. Contracts

| Field | key | MVP |
|---|---|---|
| Platform | `platform` | ✔ |
| Short title (without client name) | `title` | ✔ |
| Type | `type`: fixed / hourly / monthly | ✔ |
| Total amount or rate (USD) | `amount_usd` | ✔ |
| Start and end date | `started_at`, `ended_at` | ✔ |
| Status | active / completed / cancelled | ✔ |
| Client feedback | rating + summary | ✔ |
| Repeat client? | yes / no | ✔ |
| Evidence | screenshot with the client name masked, or "self-reported, mentor-confirmed" | ✔ |
| Which submission it came from | link to a funnel tracker row | ○ |

### 2.7. Other record sections

| Section | Content | MVP |
|---|---|---|
| Assignments | list, section 4 | ✔ |
| Timeline | mentor notes, sessions, stage changes, health changes, milestones (section 5) | ✔ |
| Funnel tracker | section 6 | ✔ |
| Weekly check-ins | section 6.3 | ✔ |
| Questions | the student's questions and answers (`mentor-workflow.md`) | ✔ |
| AI tool outputs | history of job, proposal and profile reviews | ✔ |
| Manual flags | financial problem, platform access problem, personal problem, language, … (visible only to mentors and admin) | ✔ |

### 2.8. Things that are **not stored**

| Data | Reason |
|---|---|
| Password or login code of any platform | Security; the mentor never logs in to a student's account |
| Identity documents, card images, KYC information | Privacy and risk R4 |
| Details of what identity a platform account was created under | Legal risk (R4 and R11); the platform does not get involved in this matter |
| Client personal information (name, email, company) | Data minimization (R3b); contracts and the funnel hold only a short title |
| Bank account information or how money is received | Out of scope |

### 2.9. Quick onboarding of current students (migration)

So that the founder can import current students right now, the **minimum required fields** are the following. The student fills in the rest later with the full onboarding form.

| Field | Why it is enough |
|---|---|
| Name + mobile or messenger handle | For contact |
| Primary branch and platform | For the track |
| Current stage (coach's estimate) | Earlier stages are recorded as "passed by assessment" |
| Showcase link and headline (if any) | Answers "What profile do they have?" |
| Last task requested from them + deadline | Answers "What did I ask them to do?" |
| Responsible mentor | — |
| One free-form note | Anything the coach has in mind |

Suggestion: bulk import via an Excel file or Google Sheet with these same columns (for backend-engineer and ux-designer).

---

## 3. Stages and milestones

### 3.1. Status of each stage

| Status | key | Meaning | Who changes it |
|---|---|---|---|
| Locked | `locked` | Prerequisite not completed | Sys |
| In progress | `in_progress` | The stage's tasks are open | Sys (on entering the stage) |
| Awaiting gate review | `awaiting_review` | All mandatory tasks submitted; the mentor must review the gate | Sys |
| Passed | `passed` | Mentor approved the gate | M |
| Passed by assessment | `passed_by_assessment` | Skipped during placement or migration | M |
| Passed with exception | `passed_with_exception` | The mentor let the student pass although the criteria were incomplete, with a **written reason** | M |

Rules:
- **AI never passes a stage.** The rubric score is only one of the inputs to the mentor's decision.
- Going back to a previous stage is allowed (e.g. after the result of a three-layer audit). The earlier stage becomes `in_progress` again and the reason is recorded in the timeline.
- The "current" stage = the lowest stage that is not yet `passed` (except 8, which is open-ended). For the parallel stages 2 and 3, the header shows both.

### 3.2. Pass criterion for each stage (summary)

Details are in `learning-path.md` section 5.

| Stage | Pass criterion | Type of check |
|---|---|---|
| 0 Start | Complete onboarding form + 90-day goal + branch + intro session | Mentor |
| 1 Niche | Niche document + 10 pieces of evidence (≥ 7 consistent) + 3 competitors | Mentor (+ niche finder if available) |
| 2 Showcase | Profile-review rubric ≥ threshold + approval | AI + mentor |
| 3 Portfolio | ≥ 2 relevant portfolio items with the problem/work/result structure | Mentor |
| 4 Opportunity | 10 evaluations, agreement ≥ 8 of 10, naming 3 scam signs | AI + mentor |
| 5 Proposal | 3 proposals ≥ rubric threshold + approval of one; then submissions are logged | AI + mentor; system (counting) |
| 6 Interview | Practice interview + first contract | Mentor |
| 7 Delivery | Contract closed + feedback recorded + lessons-learned summary | Mentor |
| 8 Growth | Open-ended; milestones M8 onward | System + mentor |

### 3.3. Milestones (real turning points)

Milestones are separate from stages: they are real events used for tracking, the founder's funnel report and celebration (`engagement.md`).

| Code | Milestone | Evidence | Detection |
|---|---|---|---|
| M1 | Niche approved | Stage 1 gate | Automatic |
| M2 | Showcase approved | Stage 2 gate | Automatic |
| M3 | First real submission (proposal, message or outreach) | Tracker row | Automatic |
| M4 | 10 submissions | Tracker | Automatic |
| M5 | First reply or interview | Tracker | Automatic |
| **M6** | **First contract** (North Star) | Anonymous screenshot or self-report + mentor confirmation | Mentor confirms |
| M7 | First positive client feedback | Same | Mentor |
| M8 | First USD 500 cumulative income | Self-report in the monthly review | Mentor |
| M9 | First repeat client | Contract record | Automatic |
| M10 | First rate increase | Rate change in the showcase | Mentor |
| M11 | 3 consecutive months of income ≥ the 90-day goal | Monthly review | Mentor |
| M12 | Platform badge (Top Rated, seller level, …) | Screenshot | Mentor |

The numbers in M8 and M11 are assumptions; the founder will adjust them.

---

## 4. The "Assignment"

Anything the coach or a mentor asks of a student is an "assignment": the default path tasks, personalized tasks ("Rewrite your headline with this point in mind"), and follow-ups ("Send 5 proposals by Thursday"). This is exactly what gets lost in Telegram today.

### 4.1. Fields

| Field | key | Type | Description | MVP |
|---|---|---|---|---|
| ID | `id` | — | — | ✔ |
| Student | `student_id` | — | — | ✔ |
| Title | `title` | short text | Verb-led: "Rewrite the Overview focusing on the client's problem" | ✔ |
| Description | `description` | text | What, why, and the **acceptance criterion** ("It is accepted when …") | ✔ |
| Kind | `kind` | selection | path task / personal task / follow-up / session prep | ✔ |
| Related stage | `stage` | 0 to 8 or "none" | — | ✔ |
| Mandatory for the gate? | `required_for_gate` | yes / no | Default path tasks are usually yes | ✔ |
| Creator | `created_by` | mentor / founder / system | System means a default task created on entering a stage | ✔ |
| Reviewer | `reviewer_id` | mentor | Default: the responsible mentor | ✔ |
| Creation date | `created_at` | date | — | ✔ |
| **Deadline** | `due_at` | date | Mandatory; default depends on the kind (e.g. 3 days) | ✔ |
| Priority | `priority` | normal / urgent | Urgent: tied to a live job or client offer | ✔ |
| **Status** | `status` | section 4.2 | — | ✔ |
| Submission type | `submission_type` | text / link / file / tool output / checkbox only | — | ✔ |
| Submissions (versions) | `submissions[]` | each submission: text or attachment, date, version number | Revision history is kept | ✔ |
| AI feedback | `ai_feedback` | link to the tool output + rubric score | If a related tool exists | ✔ |
| **Mentor feedback** | `mentor_feedback` | text in the standard template (`mentor-workflow.md` section 6) | — | ✔ |
| Outcome | `outcome` | accepted / needs revision | — | ✔ |
| Revision rounds | `revision_count` | number | To detect being stuck | ✔ |
| Last status change date | `status_changed_at` | date | — | ✔ |
| Linked questions | `linked_questions[]` | — | Questions the student asked about this task | ○ |

### 4.2. Statuses and transitions

| Status | key | Meaning | Next transition | Who |
|---|---|---|---|---|
| Open | `open` | Requested, student has not started | → in progress / submitted / cancelled | S, M |
| In progress | `in_progress` | Student has started (optional; the student can submit directly) | → submitted | S |
| Submitted | `submitted` | In the mentor's review queue | → accepted / changes requested | M |
| Changes requested | `changes_requested` | Feedback given, awaiting the next version | → submitted | S |
| Accepted | `accepted` | Done | — | M |
| Cancelled | `cancelled` | No longer needed (with a reason) | — | M |

- **"Overdue" is a label, not a status:** any task in `open`, `in_progress` or `changes_requested` whose `due_at` has passed gets the overdue label.
- **"Awaiting mentor" is also a label:** a `submitted` task that has passed the review SLA. This is an alert for the mentor, not the student (`mentor-workflow.md` section 4).
- Extending a deadline is allowed, but the previous deadline and the reason for the extension stay in the history. The third extension raises a yellow alert.
- "Checkbox only" tasks (e.g. "Book the intro session") become `accepted` directly when the student ticks them.

### 4.3. Default tasks for each stage (automatic on entering the stage)

| Stage | Default tasks (default deadline) |
|---|---|
| 0 | Complete the onboarding form (2 days); write the 90-day goal (2 days); book the intro session (3 days) |
| 1 | Niche document: statement + 10 pieces of evidence + 3 competitors (7 days) |
| 2 | Submit the showcase text for review (5 days); initial rate with reasoning (5 days) |
| 3 | Portfolio item 1 (7 days); portfolio item 2 (14 days) |
| 4 | Evaluate 10 opportunities (5 days) |
| 5 | 3 calibrated proposals (7 days); then a weekly recurring task "This week's submission quota: N" |
| 6 | Interview prep sheet (3 days); practice interview (7 days) |
| 7 | Project plan (2 days from contract start); lessons-learned summary (3 days after the end) |
| 8 | Monthly growth review (every month) |

---

## 5. Record timeline

Each event is a row with a Jalali date and an author. Before every call, the mentor reads only this.

| Event type | Logged | Content |
|---|---|---|
| Mentor note | Manually | Free text + tag (motivation, skill, language, financial, access, …) |
| Session | Manually | Type (intro, 1:1, practice interview), summary, decisions, tasks created |
| Weekly review | Manually (template, `mentor-workflow.md` section 5) | Decision and next step |
| Stage change | Automatic | From / to, by whom, reason (for an exception or going back) |
| Health change | Automatic | From / to, the rule that triggered |
| Milestone | Automatic or on confirmation | Code and date |
| Mentor change | Automatic | From / to, reason |

---

## 6. Practical metrics, funnel tracker and check-in

### 6.1. Funnel tracker (one row per submission)

The student logs each proposal, message or outreach with a 30-second form. If the submission came through the job-review or proposal-review tool, the fields are pre-filled.

| Field | key | Description | MVP |
|---|---|---|---|
| Sent date | `sent_at` | — | ✔ |
| Platform / branch | `platform` | — | ✔ |
| Short opportunity title | `title` | Without the client name | ✔ |
| Budget or value | `budget_usd` | — | ✔ |
| Connects spent (B) | `connects_spent` | Including Boost | ✔ |
| Boosted? (B) | `boosted` | yes / no | ○ |
| Job review score | `job_review_score` | If reviewed | ✔ |
| Proposal review score | `proposal_review_score` | If reviewed | ✔ |
| Status | `stage` | sent → viewed → replied → interview → offer → contract / rejected / no reply | ✔ |
| Last change date | `updated_at` | — | ✔ |
| Note | `note` | — | ○ |

Rule: a submission left unchanged for 14 days automatically becomes "no reply" (the student can revert it).

### 6.2. Metrics

| Metric | Formula | Period | What it shows |
|---|---|---|---|
| Number of submissions | Count | Weekly, total | Work rhythm |
| View rate (B) | viewed ÷ sent | 4 weeks | Title appeal, the first two lines, send time |
| **Reply rate** | (replies + interviews + …) ÷ sent | 4 weeks | Quality of opportunity selection + proposal + showcase |
| Interview rate | interviews ÷ sent | 4 weeks | — |
| Contract rate from interviews | contracts ÷ interviews | Total | Interview and negotiation skill |
| Connects spent (B) | Sum | Monthly | Acquisition cost |
| Connects per interview (B) | Connects ÷ interviews | Total | Efficiency |
| Average score of jobs applied to | Average `job_review_score` | 4 weeks | Are they applying to bad opportunities? |
| Days to first contract | M6 − sign-up date | — | North Star for the cohort |
| Monthly income (USD) | From the monthly review and contracts | Monthly | The ultimate goal |
| Effective hourly rate | Income ÷ reported hours worked | Monthly | Growth |
| Branch C | Impressions → clicks → messages → orders ⚠ | Monthly | — |
| Branch D | Message → reply → call → contract | Monthly | — |

**Warning about the metrics:** a "good rate" differs in every niche and on every platform. The thresholds in section 7 are initial assumptions and will be tuned with the founder after 8 to 12 weeks of data.

### 6.3. Student weekly check-in (at most 3 minutes)

A short form that opens every week (suggested: Thursday). The funnel numbers are filled in automatically from the tracker and the student only confirms.

| Question | Type |
|---|---|
| What did you do this week? (tracker numbers are shown) | Confirm or correct |
| Biggest blocker this week? | Short text |
| How are you feeling? | 1 to 5 (for early detection of dropout) |
| What will you do next week? | Short text |
| Do you need the mentor's help? | Yes / no; "yes" creates a question in the mentor's queue |

---

## 7. Health status: detecting stuck students and dropout risk

### 7.1. The four statuses

| Status | Meaning | Action |
|---|---|---|
| Green | Progressing | Quick pass in the weekly review |
| Yellow | One sign of being stuck | The mentor handles it in the weekly review |
| Red | Seriously stuck or at risk of dropping out | The mentor **personally** calls within 48 working hours |
| Paused | The student set a temporary pause themselves (with a return date) | No alerts; a reminder one day before the return date |

Status = the **worst** active rule. The reason (rule code) is always shown next to the status, because a "red" without a reason is no use to the mentor.

### 7.2. Rules (all thresholds are initial assumptions)

| Code | Sign | Yellow | Red | Usually means |
|---|---|---|---|---|
| R-INACT | Inactivity (no login, submission, log entry or check-in) | 7 days | 14 days | Motivation or an outside problem |
| R-STALL | Staying in one stage | > 1.5x the stage's usual time | > 2x | Stuck on a skill or ambiguity |
| R-OVERDUE | Overdue task | One task > 3 days overdue | 2 tasks overdue, or one > 7 days | Overload or an unclear task |
| R-LOOP | Revision rounds on one task | 3 rounds | 4 rounds or more | Skill gap; written feedback is not enough |
| R-NOTASK | No open task at all (except stage 8) | 3 days | 7 days | Mentor error; the student was left without assignment |
| R-CHECKIN | Missed check-in | 1 week | 2 consecutive weeks | Drifting away |
| R-LOWVOL | Fewer than half the quota submitted in stage 5 | 1 week | 2 consecutive weeks | Fear of rejection, lack of time or Connects |
| R-NOREPLY | Submissions with no reply | 15 submissions, 0 replies | 20 submissions, 0 replies | Flaw in opportunity selection, proposal or showcase → **three-layer audit** |
| R-BADJOBS | Applying to weak opportunities | Average score of jobs applied to is below the rubric threshold over 4 weeks | — | Wasting Connects |
| R-SKIPREVIEW | Submitting without tool review | > 70% of the last 2 weeks' submissions without a proposal review | — | Haste or distrust of the tool |
| R-INTERVIEW | Interviews without a contract | 3 interviews, 0 contracts | 5 interviews, 0 contracts | Weak interviewing, language or pricing |
| R-MOOD | Mood reported in check-in | ≤ 2 once | ≤ 2 two consecutive weeks | Discouragement; dropout risk |
| R-EXTEND | Repeated deadline extensions | Third extension of one task | — | Low commitment or a task that is too big |
| R-FLAG | Mentor's manual flag | Mentor's choice | Mentor's choice | Special cases (financial, personal, platform access) |
| R-POSTCONTRACT | Drop-off after a contract (stages 7 and 8) | 30 days with no submission or new contract after the contract ends | 60 days | "One contract and done" |

**Dropout risk** is a combination of these: R-INACT, R-CHECKIN, R-MOOD and R-LOWVOL. If two of these four are active at the same time, the status goes straight to red and gets the "dropout risk" label, even if each one alone would be yellow.

### 7.3. Mentor action for each sign

| Sign | First action | If there is no response |
|---|---|---|
| R-INACT / dropout risk | A personal message (not an automatic template): "What has been holding you back?" + suggest the smallest next step | A short call; offer a "temporary pause" instead of abandoning; notify the founder |
| R-STALL / R-LOOP | A 15-minute call instead of more written feedback; split the task into smaller tasks | Support module (`learning-path.md` section 6); pass with exception if the flaw is minor |
| R-OVERDUE / R-EXTEND | Review the size and clarity of the task; set a realistic deadline in agreement with the student | Revisit available hours and the 90-day goal |
| R-NOTASK | The mentor defines the next task the same day | — |
| **R-NOREPLY** | **Three-layer audit:** (1) job review on 5 to 10 recently applied opportunities; (2) proposal review on the 3 most recent proposals; (3) re-review of the showcase. Identify the weakest layer and send the student back to the relevant stage (4, 5-a or 2) | Re-examine the niche (go back to stage 1) with the founder's input |
| R-BADJOBS / R-SKIPREVIEW | A short session on job selection criteria; task "the next 5 submissions only after a job review" | — |
| R-LOWVOL | Investigate the cause: time, Connects budget or fear. Adjust the quota with the student, not for them | A group "proposal clinic" session (`engagement.md`) |
| R-INTERVIEW | Practice interview with the mentor; review notes from previous interviews | English conversation module; review pricing |
| R-MOOD | A personal, empathetic message; normalize rejection with numbers (how many submissions until the first reply is normal) | Refer to the founder |
| R-POSTCONTRACT | Review the previous contract: message the previous client about the next job; return to the submission cycle | — |

Every action is recorded in the timeline. If a red status stays for 7 days with no recorded action, it is reported to the founder (oversight of mentor work).

---

## 8. Main views (input for ux-designer)

| View | User | Content |
|---|---|---|
| **My students list** | Mentor | Table: name, stage + days, health + reason, next task + deadline, last activity, 4-week funnel numbers. Default sort: red → yellow → has a submission waiting → green |
| **All students list** | Founder | Same + a mentor column; filter by stage, health, cohort, branch, mentor |
| **Student record** | Mentor, founder | Header (section 2.1) + tabs: tasks, showcases, funnel, timeline, questions, tool outputs |
| **Cohort funnel** | Founder | Number of students in each stage; percentage who reached M3, M5 and M6; median days to M6; most common active stuck-rules |
| **"My path" page** | Student | Current stage, open tasks, new feedback, their own funnel numbers, milestones. The student **does not see** the health status or flags; they see only tasks and progress |

---

## 9. MVP scope

| In the MVP | Later |
|---|---|
| Record with ✔ fields, bulk import of current students (section 2.9) | Email, plan, secondary branch, badges |
| Stages with the mentor's manual gate | Automatic pass suggestion |
| "Assignment" with all statuses and default tasks | Complex recurring tasks |
| Branch B funnel tracker + weekly check-in | Funnels for branches C and D |
| Health rules: R-INACT, R-STALL, R-OVERDUE, R-NOTASK, R-CHECKIN, R-NOREPLY, R-LOWVOL, R-MOOD, R-FLAG | The remaining rules; AI detection of sentiment from message text |
| Simple list, record and cohort funnel views | Advanced reports |

---

## 10. Assumptions and open questions

| # | Assumption or question | Impact |
|---|---|---|
| 1 | How many active students are there now, and where does their data live today (Excel, Telegram, the coach's head)? (open question 3) | Bulk import design |
| 2 | All thresholds in section 7 are assumptions and will be tuned with data after 8 to 12 weeks | Alert accuracy |
| 3 | Students are willing to log every submission (assumption: yes, if it takes 30 seconds and the tools pre-fill it) | Funnel data quality |
| 4 | Evidence for the first contract: is an anonymous screenshot enough, or self-report? | Credibility of North Star statistics and marketing claims |
| 5 | The student should not see their own health status (our suggestion). Does the founder agree? | Transparency versus motivation |

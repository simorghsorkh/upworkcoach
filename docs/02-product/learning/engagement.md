# Keeping Students Engaged — UpworkCoach

> Phase 1 — Author: curriculum-designer — 27 Mehr 1405 (2026-10-19)
> Status: draft, awaiting founder approval
> Prerequisites: `progress-tracking.md` (milestones and health rules), `mentor-workflow.md` (mentor actions)

---

## 1. Principles

The goal of engagement is not "staying longer in the app"; it is for the student to **do their next real piece of work** and not give up during the hard stretch of rejections.

| We do | We don't do (hollow gamification) | Why |
|---|---|---|
| Celebrate real output and results (first submission, first interview, first contract) | Points (XP) for daily logins or watching videos | Watching is not work |
| Encourage effort in the hard stage (the first 10 submissions) | Daily streaks | Freelancing has a weekly rhythm; breaking a streak feels like failure |
| Show the student's own progress compared to their past | Leaderboards of income or contract count across students | Unfair comparison across niches, pressure to mass-submit, and exposure of financial information |
| Reminders tied to a specific "next task" | Generic "we miss you" messages | Generic messages get ignored |
| Personal mentor message for important milestones | Automatic congratulations for everything | Too much congratulation loses its value |
| Real success stories with the student's consent | Income promises or "guaranteed contracts" | Honesty; income-claim risk (`risks.md`) |
| A "pause" option | Pressure to continue at any cost | A paused student comes back; a pressured student quits |

---

## 2. Reminders

### 2-1. List of reminders

| Reminder | Trigger | Timing | Content | To whom | Stops when |
|---|---|---|---|---|---|
| Deadline approaching | Open task with a deadline | 24 hours before the deadline | Task title + direct submission link | Student | Submitted |
| Overdue task | Deadline passed | 1 day after | "Will you make it, or should we move the deadline?" + request-extension button | Student | Submitted or extended |
| Feedback is ready | AI or mentor feedback | Immediately | "Feedback on [task title] is ready" | Student | Opened |
| Your question was answered | Mentor reply | Immediately | — | Student | Opened |
| Weekly check-in | Every week | Thursday morning; second reminder Friday afternoon | 3-minute form | Student | Submitted |
| Submission quota | Stage 5, mid-week below half of the quota | Monday | "This week N of M; find 2 good opportunities" | Student | Quota reached |
| Inactivity | 5 days without activity | Once | Reminder of the next open task (not a generic message) | Student | Activity |
| Funnel update | Submissions with no status change for more than 7 days | Weekly, together with the check-in | "Did these submissions get a response?" | Student | Updated |
| Client follow-up | Branch D: 4 days after an unanswered message. Branch B: only when the client started the conversation and 3 days of silence | — | "Time for a follow-up message" + template | Student | — |
| Returning from pause | 1 day before the return date | — | Welcome + next task | Student and mentor | — |
| Monthly growth review | Stage 8, start of the month | — | 10-minute form | Student | Submitted |

In branch B, the follow-up reminder never suggests messaging a client who has not yet started a conversation.

### 2-2. Sending rules

| Rule | Proposed value |
|---|---|
| Automatic reminder cap | At most **1 per day** and **4 per week** per student (messages responding to the student's own action, like "Feedback is ready", are counted separately) |
| Quiet hours | 22:00 to 09:00 |
| Merging | Several simultaneous reminders summarized in one message |
| "Paused" status | Only the return reminder |
| Student settings | Can turn off every category except "Your question was answered" |
| Channels | In-app (always) + one external channel: SMS, Telegram bot or Bale (decision: open question 7). Because of internet disruptions (R9), SMS is the backup for important reminders |
| Long inactivity | After 14 days, automatic reminders stop and the **mentor personally** sends a message (`progress-tracking.md` section 7) |

---

## 3. Celebrating progress

### 3-1. What and how

| Milestone (code in `progress-tracking.md`) | Reaction | Who |
|---|---|---|
| M1 niche approved, M2 showcase approved | Approval message + "before and after" view of the showcase (snapshots) | System + one sentence from the mentor |
| M3 first submission | Short congratulation: "You took the hardest step" | System |
| M4 ten submissions | Congratulations on the effort + show their own funnel + reminder that rejection is a normal part of the work | System |
| M5 first reply or interview | Personal mentor message + offer of a practice interview | Mentor |
| **M6 first contract** | Personal mentor message, and optionally a short message or call from the founder; with the student's consent, announcement in the cohort group | Mentor + founder |
| M7 first positive review | Congratulations + suggestion to add it to the portfolio | Mentor |
| M8 to M12 (income, repeat client, rate increase, badge) | Congratulations + invitation to write "lessons I learned" for the community (optional) | Mentor |

### 3-2. "My record"

A page for the student that shows real progress, not points:
- A timeline of milestones with dates;
- Showcase versions (first and latest);
- Their own funnel numbers over time (e.g. reply rate in month one vs. month two);
- Positive client feedback.

Later (backlog): the student can share their record with someone.

### 3-3. Success stories

| Rule | Description |
|---|---|
| Consent | Only with the student's explicit, written consent; anonymous option |
| Honesty | Real numbers with real timelines ("first contract after 9 weeks and 34 submissions"), not just the best cases |
| Privacy | No client names or platform account details |
| Marketing use | With founder approval and without guarantee promises (`risks.md`) |

---

## 4. Group sessions

| Session | Frequency | Length | Host | Preparation | Output |
|---|---|---|---|---|---|
| **Cohort kickoff** | Every cohort | 60 minutes | Founder | — | Students' 90-day goals, introductions |
| **Open Q&A** | Weekly | 45 to 60 minutes | Mentors in rotation | Questions collected in advance via a form | Session recording + frequently asked questions go into the answer library |
| **Proposal clinic** | Weekly or biweekly | 60 minutes | Mentor | 3 to 4 volunteered, anonymized proposals | Live critique with the rubric; students critique with the rubric themselves before the mentor's view |
| **Paired practice interview** | Biweekly | 45 minutes | Supervising mentor | Pairing of stage 5 and 6 students | Confirms the stage 6 practice-interview task |
| **Wins and lessons** | Monthly | 60 minutes | Founder | 2 or 3 volunteer students | Real stories; normalizing the long road |
| **Niche circle** | Monthly (once each niche has at least 5 students) | 45 minutes | Specialist mentor | — | Exchange of opportunities and prices |

- All sessions are recorded (because of time-zone differences and internet outages, R9) and have a written summary.
- Attending a session is not in itself a milestone or pass criterion; it is recorded in the file only when it has an output (e.g. a practice interview).
- The hosting tool (Skyroom or similar) is decided in the architecture phase.

---

## 5. Student community

### 5-1. Structure

| Layer | Size | Purpose |
|---|---|---|
| **Cohort group** | Students of the same cohort | Companionship, a sense of "it's not just me" |
| **Accountability pair** (optional) | 2 people from one cohort | Mutual weekly check-in; critiquing each other's proposals with the rubric (critiquing is itself learning) |
| **Niche circle** | Students of one niche across all cohorts | Specialist knowledge |
| **Alumni group** (later) | M11 students | Role models and a source of future mentors (see the Reza persona) |

### 5-2. Community rules

| Rule | Reason |
|---|---|
| No advertising or selling of accounts, proxy identity verification, or cashing out income | Red lines (`domain-notes.md` section 4) |
| No posting client information or full job post text with identifying details | Privacy |
| No poaching others' clients or projects | Trust |
| No belittling comparisons | A safe space to say "30 submissions, zero replies" |
| Moderators: mentors in rotation | — |

### 5-3. Where

| Option | Advantage | Disadvantage |
|---|---|---|
| Existing Telegram group | Students are already there; no build cost | Conversations and data outside the platform; filtering risk and R5 |
| In-platform forum | Data and history inside the platform; linked to the file | Build cost; student habits |

**MVP proposal:** the community stays in the same Telegram group (or current messenger); **but questions, tasks and feedback only inside the platform.** The internal forum goes to the backlog. Final decision is the founder's (open question 7).

---

## 6. Managing discouragement (the most critical drop-off point)

The highest drop-off is probably in stage 5: unanswered submissions one after another (the Amir persona).

| Action | When |
|---|---|
| Realistic expectations from the start: "a few dozen submissions before the first reply is normal" (the founder provides the number from their students' data) | Stage 0 and entry to stage 5 (`C-S5-05`) |
| Show progress in **quality**, not just results: rising rubric scores on proposals | Every week in "My record" |
| Three-layer audit instead of "send more" | Rule R-NOREPLY |
| Personal mentor message on a low mood in the check-in | Rule R-MOOD |
| Pause instead of quitting | Mentor suggestion |
| Hearing the stories of people who reached a contract late | "Wins and lessons" session |

---

## 7. Measuring impact

| Metric | Definition | Proposed target (assumption) |
|---|---|---|
| Real weekly active students | A student who had at least **one output** in the week (task submission, logged proposal submission, or check-in) | ≥ 60% (aligned with `vision.md`, but with an output-based definition instead of "tool usage") |
| Check-in rate | Check-ins recorded ÷ active, non-paused students | ≥ 70% |
| Reminder conversion | Reminders that led to the related action within 48 hours | Monitor; remove low-impact reminders |
| Reminder opt-out | % of students who turned off a category of reminders | If > 20%, there are too many reminders |
| Recovery from red | % of red students who became green or yellow within 14 days | Monitor |
| Month-two retention | — | `risks.md` criterion for R10 |
| Days to first contract | Median per cohort | North Star |

Metrics we **do not track:** number of logins, minutes in the app, videos watched (only to detect unused content, not as a goal).

---

## 8. MVP scope

| In MVP | Later |
|---|---|
| Reminders for deadline, overdue, feedback ready, question answered, check-in, inactivity | Submission quota, client follow-up, funnel update |
| Reminder cap and quiet hours | Fine-grained student settings per category |
| Milestone messages (M3, M6) + personal mentor message | Full "My record" |
| Weekly Q&A session and proposal clinic (outside the software, via link) | Scheduling and attendance tracking inside the platform |
| Community in the current messenger | Internal forum, accountability pairs in the system |

---

## 9. Open questions

| # | Question | Impact |
|---|---|---|
| 1 | External reminder channel: SMS, Telegram bot or Bale? (open question 7) | Notification architecture |
| 2 | What are the founder's current group sessions, and how often? | Session calendar |
| 3 | The real number of "submissions until first reply" among current students? | Discouragement-management message |
| 4 | Does the founder want to personally message each student on their first contract? | M6 experience |

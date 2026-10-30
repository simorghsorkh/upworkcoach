# Coach and Mentor Workflow — UpworkCoach

> Phase 1 — author: curriculum-designer — 27 Mehr 1405 (2026-10-19)
> Status: draft, awaiting founder approval
> Prerequisite: `progress-tracking.md` (the record, "assignment", health rules). Stages: `learning-path.md`. Review criteria: the rubrics in `../tool-rubrics/`.

---

## 1. Roles

According to the founder's answer, a mentor has **two jobs**: (1) helping the student **reach income** and (2) answering **specialist questions**.

| Role | Responsibility | Access |
|---|---|---|
| **Founder (senior coach / admin)** | Defines the method and rubrics, assigns students, oversees mentor quality, decides on escalated cases, approves content. Can also be the responsible mentor for some students | All records and reports |
| **Responsible mentor** (job 1: reaching income) | Owns the record of the assigned students: reviews tasks, approves stage gates, runs the weekly review, handles alerts, defines the next task | Records of their own students + read access to another student's record only when that student's question is escalated to them |
| **Specialist mentor** (job 2: specialist questions) | Answers specialist questions in their own domain (e.g. a niche, a platform, negotiation) from the shared queue | The question queue + the record of the student who asked (read-only) |
| **AI tool** | Instant first-pass feedback on submissions, draft answers to common questions, a record summary for the mentor | Section 7 |

One person can be both a responsible mentor and a specialist mentor. These are two **role labels**, not two types of user.

---

## 2. Dividing students among mentors

### 2.1. Assignment rules

| Rule | Description |
|---|---|
| Each student has **one** responsible mentor | Clear accountability; "everyone is responsible" means no one is responsible |
| Each mentor has one **backup mentor** | For leave and SLA breaches. The backup reads the record and moves tasks forward |
| Assignment criteria | (1) fit with niche or branch; (2) free capacity; (3) mix of stages (not all stage-5 students to one person, since it is the heaviest stage) |
| Default capacity | **Assumption:** 15 to 25 active students for a mentor with 10 hours a week (roughly 20 to 30 minutes per student per week). A "paused" student does not count toward capacity. The real number depends on the founder's answer (open question 4) |
| Transferring a student | With a reason; the full record and timeline are transferred; the previous mentor writes a handover note ("where they are, what task is open, what works") |
| Data ownership | Communication with the student happens inside the platform, not in the mentor's personal messenger (reduces risk R5: a mentor leaving with the students' knowledge) |

### 2.2. Question routing

| Question type | Who gets it |
|---|---|
| About the student's own work or task ("Did I fix my headline correctly?") | Responsible mentor |
| Specialist, with a domain tag (a specific niche, Fiverr, pricing, negotiation) | Shared queue, priority to the specialist mentor of that domain; the responsible mentor gets a copy |
| General and common ("Is Boost worth it?") | AI drafts an answer from the answer library (section 7) |
| Sensitive (section 9) | Directly to the responsible mentor, and to the founder if needed; AI does not answer |

---

## 3. Queues (the mentor's inbox)

Every day the mentor sees one page with four queues, in this priority order:

| # | Queue | What is in it | Order within the queue |
|---|---|---|---|
| 1 | **Urgent** | "Urgent" questions and submissions (tied to a live job, a client offer or an upcoming interview), and newly red students | Nearest SLA breach time |
| 2 | **Questions** | Normal questions from their own students + escalated specialist questions | Nearest SLA breach time |
| 3 | **Task reviews** | `submitted` tasks; **stage gate** submissions rank above the rest | Gates first, then oldest |
| 4 | **Alerts and follow-ups** | Yellow students, overdue tasks, check-ins with "I need help", scheduled follow-ups (e.g. "3 days after the interview, ask how it went") | Red → yellow → others |

Next to each item: student name, stage, health, a one-line AI summary of the record, and time remaining until the SLA.

---

## 4. SLA (response time)

Default working hours (assumption): **Saturday to Wednesday 09:00 to 21:00 and Thursday 09:00 to 14:00**. The SLA is calculated in working hours. The founder confirms or changes this.

| Type | AI response | Human response or review | Why this number |
|---|---|---|---|
| **Urgent** question or submission (live job, client offer, interview within 24 hours) | Instant | **4 working hours** | Job postings go stale quickly; aligned with the "median < 4 hours" goal in `vision.md` |
| Normal question | Instant (if AI is allowed) | **24 working hours** | — |
| Stage gate task review | Instant (rubric) | **48 working hours** | The gate blocks the student's progress |
| Non-gate task review | Instant | 72 working hours | — |
| Newly red student | — | Personal call within **48 working hours** | — |
| Yellow student | — | In that week's weekly review | — |
| Check-in with "I need help" | — | 24 working hours | — |

**When the SLA is breached:**

| Time | What happens |
|---|---|
| 80% of the time elapsed | Reminder to the responsible mentor |
| 100% | The item is also shown to the backup mentor (whoever picks it up first) |
| 150% | Reported to the founder |

The student sees an approximate response time ("The mentor will reply by tomorrow noon"), not a vague promise.

---

## 5. Daily and weekly routine

### 5.1. Mentor's daily routine (30 to 60 minutes)

| Order | Task | Approx. time |
|---|---|---|
| 1 | Empty the "Urgent" queue | 10 to 20 minutes |
| 2 | Questions whose SLA ends today | 10 to 20 minutes |
| 3 | Review gate tasks | 10 to 20 minutes |
| 4 | Log notes for every call you had today | 5 minutes |

### 5.2. Weekly student review (the most important routine)

**Goal:** no student stays out of the mentor's sight for more than a week, and after the review every student has one clear next step.
**Suggested time:** Saturday, after the Thursday check-ins. About 2 to 3 minutes for a green student and 5 to 10 minutes for yellow and red.
**Order:** red → yellow → has a submission waiting → green (the same default order as "My students list").

**Checklist for each student:**

| # | Look at | Question |
|---|---|---|
| 1 | Health and reason | Why this color? Is the active rule a real problem or a data error? |
| 2 | Stage and days in stage | Ahead of or behind the usual time? |
| 3 | Open and overdue tasks | Do they have an open task? Are the deadlines realistic? |
| 4 | This week's funnel numbers versus last week | Submission rhythm? Reply rate? |
| 5 | This week's check-in | Blocker mentioned? Mood? Need for help? |
| 6 | Latest feedback | Did the student apply the feedback? |

**Decision (one or more):**

| Decision | Result in the system |
|---|---|
| Continue, no change | Just log the review |
| New task or revision of the current task | Create an "assignment" |
| Personal message | Logged in the timeline |
| Call or session | Create a scheduled follow-up |
| Suggest passing or going back a stage | Change stage status with a reason |
| Three-layer audit (R-NOREPLY) | Create three review tasks (`progress-tracking.md` section 7.3) |
| Suggest a temporary pause | Status "paused" with a return date |
| Escalate to the founder | Item in the founder's queue |

**Weekly review note template** (saved in the record; AI drafts it from the data and the mentor edits it):

```
Weekly review — [Jalali date] — [mentor name]
Status: [green/yellow/red] — reason: [rule code]
Stage: [number and name] — [N] days
This week: [submissions / replies / interviews] — [one sentence on work quality]
Main blocker: [from check-in or mentor's impression]
Decision: [one of the decisions above]
Next step: [task title] — deadline [date]
```

### 5.3. Founder's weekly routine (60 to 90 minutes)

| Task | Look at | Output |
|---|---|---|
| Cohort funnel | Count per stage, reaching M3, M5 and M6 | Identify the shared bottleneck (e.g. "40% are stuck in stage 2") |
| Red students | Reds older than 7 days and escalated cases | Decision or direct call |
| Mentor performance | SLA compliance, each mentor's share of red students, number of reviews completed | Conversation with the mentor |
| **Quality sampling** | 5 random feedback items or answers from mentors and 5 AI outputs | Fix the rubric or the answer library; give feedback to the mentor |
| Recurring patterns | The week's frequent questions | New standard answer, new content `C-…`, or a group session topic |

### 5.4. Monthly routine

| Task | Who |
|---|---|
| Monthly growth review for stage 7 and 8 students | Responsible mentor |
| Founder's 20-minute 1:1 with each mentor | Founder |
| Tune the health-rule thresholds and stage durations with data | Founder (with curriculum-designer's suggestion) |
| Collect success stories (with the student's consent) | Responsible mentor |

---

## 6. Feedback templates

### 6.1. Feedback on a task

Principle: **the student should learn, not receive ready-made text.** The mentor does not rewrite a whole proposal or profile; at most they rewrite one or two sentences as an example.

```
Verdict: [accepted / minor revision / major revision]

Strengths (1 to 2):
- [specific, pointing to a part of the text]

Most important fixes (at most 3, in order of importance):
1. [problem] — why it matters — [related rubric criterion, e.g. "hook in the first two lines"]
   Example: "[a one-sentence rewrite, in English]"
2. ...

On the AI feedback: [I agree / ignore this item because …]

Next step: [specific task] — by [date]
```

| Tone rule | Bad example | Good example |
|---|---|---|
| Specific, not general | "The Overview is weak" | "The first sentence is about you; start with the client's problem" |
| At most 3 fixes | A list of 12 flaws | 3 important flaws; the rest for the next round |
| Refer to the shared criterion | "I think …" | "According to the 'personalization' criterion in the rubric …" |
| Persian, with examples in English | — | Explanation in Persian, example sentence in English |
| End with the next step | Feedback with no outcome | "Send the next version by Thursday" |

### 6.2. Answering a question

```
Short answer: [one or two sentences]
Explanation: [why; with an example if needed]
For your situation: [apply it to this student's record]
[Optional] Read more: [content code or library answer]
```

If the mentor thinks the answer is useful for others too, they save it with the "reusable" label (section 8).

### 6.3. Message to a yellow or red student

There is no fixed template (the message must be personal), but it has three parts:
1. A specific reference to their work or situation (not "I haven't seen you in a while").
2. One open question about the blocker.
3. A suggestion of the **smallest next step**, or the option of a temporary pause.

---

## 7. Division of work between AI and the human mentor

| Task | AI | Mentor |
|---|---|---|
| First-pass feedback on a proposal, job or showcase | **Yes, instantly**, per the rubric | Sees it, confirms or corrects |
| Passing a stage gate | **Never** | **Yes, always** |
| Creating an "assignment" | Only default tasks; suggests a next task for the mentor to confirm | Yes |
| Answering a common, knowledge-based question | Draft from the answer library, labeled "AI first-pass answer" with a "I want a mentor to see this too" button | Answers where review was requested, or where AI confidence is low |
| Answering a situation-dependent question (this client, this price, this offer) | Draft for the mentor only, not directly for the student | **Yes** |
| Record summary before a review or call | Yes | Reads it |
| Draft of the weekly review note | Yes | Edits and saves |
| Detecting health alerts | System rules (no AI) | Confirms and acts |
| Choosing a niche, pricing in a negotiation, deciding on a client offer | Input and analysis | **Final judgment** |
| Motivation, discouragement, personal or financial problems | No | **Yes** |
| Sensitive cases (section 9) | No | **Yes** |

**Rules:**
- Before writing feedback, the mentor sees the AI feedback so as not to repeat it and only to add or correct.
- If the mentor disagrees with the AI, they mark that output "AI was wrong" with a short reason. This data goes to ai-engineer for quality evaluation (risk R7; target: agreement ≥ 80%).
- The student always knows whether the text was written by AI or a human.

---

## 8. Answer library (reducing repeated questions)

| Part | Description |
|---|---|
| Source | Answers mentors marked "reusable" + the founder's answers |
| Approval | The founder or a senior mentor approves each answer before it enters the library |
| Structure | Question, answer, tags (stage, branch, topic), last review date, author |
| Expiry | Answers that depend on platform rules (Connects, fees, badges) are reviewed every 6 months |
| Use | Source of AI drafts, and a "Maybe your answer is here" suggestion to the student before they submit a question |

---

## 9. Sensitive cases and red lines

| Situation | Mentor action |
|---|---|
| Request for guidance on buying or renting an account, using someone else's identity or bypassing identity verification | Standard response (text approved by the founder): the platform gives no guidance on this + mention of the risks; log it in the record with a flag; no personal judgment |
| Request for communication or payment outside the platform (from a client or suggested by the student) | Explain the platform rule and the risk of account closure; suggest the permitted route |
| Suspected scam involving money or information | **Urgent**; advise cutting off further interaction and reporting to the relevant platform |
| Dispute with a client, threat of a negative review | Urgent; help write a calm, professional message; if serious, escalate to the founder |
| Signs of serious psychological or financial distress | A human, empathetic reply; take the task pressure off (suggest a temporary pause); inform the founder. The mentor is not a therapist and refers to specialist resources if needed |
| Request for a guarantee of income or a contract | Honestly explain that the outcome is not guaranteed |
| A mentor wants to recruit the student for personal work | Against the mentor collaboration rules (suggestion: a clause in the mentor contract, risk R5) |

---

## 10. Quality and oversight of mentors

| Metric | Why | Warning about misuse |
|---|---|---|
| SLA compliance (% answered on time) | Speed | Not a standalone measure; a fast, shallow answer also meets the SLA |
| Weekly review completion (% of students) | Follow-up | — |
| Share of red students and how long they stay red | Real impact | Do not compare without accounting for each mentor's mix of students |
| Stage progression and reaching M6 among the mentor's students | Outcome | With small numbers, fluctuation is high; the 3-month trend is the yardstick |
| Student rating of answers (1 to 5, optional) | Satisfaction | — |
| Founder's quality sampling | Alignment with the method | — |

---

## 11. MVP scope

| In the MVP | Later |
|---|---|
| One responsible mentor per student + backup | Automatic routing by specialty |
| The four queues and their priority order | Automatic capacity and assignment suggestions |
| SLA with reminders and showing to the backup | Full mentor performance report |
| Feedback template and weekly review template | Automatic AI draft of the weekly review |
| AI feedback on submissions tied to P0 tools | AI drafts for question answers and the full answer library |
| "AI was wrong" button | — |

---

## 12. Open questions

| # | Question | Impact |
|---|---|---|
| 1 | How many mentors, how many hours a week, and what payment model (fixed, per student, per answer)? (open question 4) | Capacity, SLA, performance metrics |
| 2 | Working hours and response days? | SLA calculation |
| 3 | Should communication with students be entirely inside the platform, or should Telegram stay alongside the platform in the MVP? (open question 7) | Timeline logging, risk R5 |
| 4 | May AI answer common questions directly without mentor review? (Suggestion: yes, only from the approved library and with a label) | Mentor load |
| 5 | Text of the standard answer about accounts and sanctions (section 9) | Risks R4 and R11 |

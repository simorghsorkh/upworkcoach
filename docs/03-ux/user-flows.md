# User Flows — Version 0.1 ("Coach Office")

> Phase 2 — Author: ux-designer — 27 Mehr 1405 (2026-10-19) — Status: draft for the founder gate
> Page codes (G, M, S) come from `sitemap.md`. Features come from `docs/02-product/prd.md`.
> The diagrams are Mermaid and render in GitHub, VS Code (with the Mermaid extension) and most Markdown editors.

## Contents

| # | Flow | Role | Feature | Key principle |
|---|---|---|---|---|
| 1 | Student invite and first login | Admin → student | F1, F10 | Under 1 minute for the admin; a "small win" under 5 minutes for the student |
| 2 | Creating and filling in the record | Admin/mentor + student | F2 | Only name and mobile are required; the rest gradually |
| 3 | Stage change | Admin/mentor | F3 | One click + optional note |
| 4 | Task ← submission ← review ← revision | All three | F4 | No task gets lost |
| 5 | Note after a session | Admin/mentor | F5 | < 3 clicks, on mobile |
| 6 | Morning routine with "Today" | Admin/mentor | F6, F7, F8 | One page, all of the day's work |
| 7 | Handling a red student | Admin/mentor | F7, F5 | Action recorded within 48 hours |
| 8 | Questions and answers | Student ↔ mentor | F8 | The student knows when the answer will come |
| 9 | Weekly check-in (Should) | Student → mentor | F7 | 3 minutes, Thursday |

---

## 1. Student invite and first login (F1, F10)

**Goal:** The admin creates the student and sends the link in under 1 minute. The student logs in without a long form and in under 5 minutes **completes one real task** (small win: completing the "Intake form" or "Add your profile link", which goes directly to "Accepted" or "Submitted").

```mermaid
flowchart TD
    A["Admin clicks «+ New student» in «Students» (M2a)"] --> B["Name + mobile; mentor and stage optional"]
    B --> C{"Is the mobile number a duplicate?"}
    C -->|Yes| C1["Message: «This number is already registered» + link to the existing record"]
    C -->|No| D["Record is created + one-time 7-day invite link"]
    D --> E["«Copy link» button + ready-made message text for Telegram"]
    E --> F["The admin sends the link via Telegram themselves"]
    F --> G["Student opens the link on their phone (G2)"]
    G --> H{"Is the link valid?"}
    H -->|Expired or used| H1["G3: «This link no longer works; ask your coach for a new link»"]
    H1 --> H2["Admin in the record: «Resend invite»"] --> F
    H -->|Yes| I["Name and mobile already filled in; the student only sets a password and confirms it"]
    I --> J["Automatic login ← Home (S1) with a welcome card"]
    J --> K["Welcome card: «3 steps to get started» + stage 0 + default tasks with deadlines"]
    K --> L["Student opens the first task: «Add your profile links» or «Intake form»"]
    L --> M["Submission in 2 to 3 minutes ← confirmation message: «Submitted; your mentor will look within 48 hours»"]
    M --> N["In the record: «First login» + «Submission» events in the timeline; R-INACT resets to zero"]
```

**Notes**
- There is no SMS in 0.1; the link is sent only via Telegram or whatever messenger the coach uses. Ready-made message text in M2a: "Hi [name], this is your login link to our office: [link] (valid for 7 days)".
- The mentor invite link follows the same flow, except that only the admin creates it, from "Settings ← Users", and the destination after login is "Today" (M1).
- **Assumption U7:** The default stage 0 tasks (`progress-tracking.md` section 4-3) are created automatically when the record is created, so the student never faces an empty Home. If the founder does not want this, the welcome card only shows "Complete your profile".

---

## 2. Creating and filling in the record (F2)

**Goal:** The record is filled in gradually. The coach only records what they have in mind; the student fills in their own part.

```mermaid
flowchart TD
    A["Record created with name + mobile (flow 1)"] --> B["The record header shows a «Record 20% complete» indicator and a list of empty fields"]
    B --> C{"Who fills it in?"}
    C -->|Coach/mentor| D["M3 ← «Info» or «Showcases» ← inline editing"]
    D --> D1["Current stage (estimate), main track and platform, niche, level, tags"]
    D1 --> D2["Add showcase: platform from the settings list + link + headline + status"]
    D2 --> D3["Last requested task + deadline (flow 4)"]
    D3 --> D4["A free-form note: «whatever is on my mind» (flow 5)"]
    C -->|Student| E["S7 «Me» ← add platform profile"]
    E --> E1["Form: platform, public link, headline; persistent warning: «Never write the password or login code of any account here»"]
    E1 --> E2{"Is the link valid? (URL shape only; the system does not open the link)"}
    E2 -->|No| E3["Inline error: «Write the full address with https»"] --> E1
    E2 -->|Yes| E4["Save ← visible in the coach's record with the name of whoever changed it"]
    D4 --> F["Every change = a timeline event with name and time"]
    E4 --> F
    F --> G["The completeness indicator goes up; once it reaches ≥ 80%, the indicator is hidden"]
```

**Notes**
- "Completeness" is shown only to the coach and is calculated only from the migration fields (`progress-tracking.md` section 2-9): stage, track/platform, one showcase, one open task, mentor. This ties directly to criterion G1 (complete record for ≥ 90%). **Assumption U8.**
- Bulk import (M2b, Should) takes these same fields from Excel and, before saving, shows a preview of the rows with errors.

---

## 3. Stage change (F3)

```mermaid
flowchart TD
    A{"From where?"} -->|Record M3| B["«Change stage» button next to the current stage in the header"]
    A -->|Kanban M4| C["«Move» menu on the card (drag and drop is also available on desktop)"]
    B --> D["Dialog: list of 9 stages; current one marked; next stage preselected"]
    C --> D
    D --> E["Optional note: «Why?»"]
    E --> F{"Going back to a previous stage or skipping more than one stage?"}
    F -->|Yes| F1["The note becomes required: «Reason for going back/skipping»"] --> G
    F -->|No| G{"Are there open tasks from the previous stage?"}
    G -->|Yes| G1["Prompt: «2 open tasks from the previous stage: keep open / cancel»"] --> H
    G -->|No| H["(Should) The new stage's template tasks with checkboxes and default deadlines"]
    H --> I["«Save» ← stage entry date = today; timeline event"]
    I --> J["Short message at the bottom of the screen: «Sara moved to stage 6» + «Undo» for 10 seconds"]
    J --> K["The student sees the new stage and its content link on Home"]
```

**Notes**
- In 0.1 a "gate" is a manual mentor confirmation and has no separate status in the UI. When all of a stage's "required for gate" tasks are "Accepted", a small hint appears in the record header: "All tasks in this stage are accepted. Ready to move on?" with a "Change stage" button. **Assumption U9.**
- Concurrent stages 2 and 3: the header shows both ("2 showcase + 3 portfolio") and in the kanban the card sits in the lower column (2) with a "+3" tag.

---

## 4. Task definition ← submission ← review ← revision (F4)

```mermaid
flowchart TD
    A["Coach: «+ Task» from the record, from the task list or from Quick add"] --> B["Title (verb-led), description + «Accepted when…», type, Jalali deadline (shortcut: 3 days / 1 week), stage, urgent?"]
    B --> B1{"Task type"}
    B1 -->|General / link-file| C["Save ← status «Open»"]
    B1 -->|Proposal for review| B2["The student's submission form will have separate fields: platform, job post text, proposal text, consent"] --> C
    C --> D["The student sees it on Home and in «My tasks»; «New» badge"]
    D --> E{"Student"}
    E -->|Optional| E1["«I started» ← In progress"] --> F
    E -->|Directly| F["Submission form (S3): text + link; for a proposal, English text in a left-to-right box"]
    E -->|Needs more time| E2["«Request extension» with a reason ← a question in the mentor's queue"]
    F --> G["«Submit» ← status «Submitted»; message: «Review usually within 48 hours»"]
    G --> H["In the coach's «Today»: «Submissions awaiting review» section; after 48 hours a «Late» tag"]
    H --> I["M6: submission beside the task description and record summary; previous versions and previous feedback collapsed"]
    I --> J["Review form with template: verdict, strength, at most 3 revisions, next step; optional 1 to 5 score"]
    J --> K{"Result"}
    K -->|Accepted| L["Status «Accepted» ← the student gets a «New feedback» badge"]
    L --> L1{"Does the student have another open task?"}
    L1 -->|No| L2["Inline alert to the coach: «Sara has no open task» + «+ Next task» (prevents R-NOTASK)"]
    L1 -->|Yes| Z["End"]
    K -->|Needs revision| M["Status «Needs revision» + new deadline (optional); round counter +1"]
    M --> N["The student sees the feedback above the submission form ← next version"]
    N --> G
    M --> O{"Revision round ≥ 3?"}
    O -->|Yes| O1["R-LOOP tag on the task and the student's health; suggestion: «Instead of written feedback, a 15-minute call»"]
    K -->|Cancel| P["«Cancelled» with a required reason"]
```

**Notes**
- "Overdue" is not a status; it is a red "Overdue · 4 days" tag on open/in-progress/needs-revision tasks that are past their deadline (F4).
- The coach extends a deadline in M6 with "Extend deadline" and a reason; the extension history is visible under the deadline, and the third extension triggers an R-EXTEND tag. **Assumption U10:** In 0.1 the student does not extend the deadline themselves; they only request it.
- "Tick-only" tasks (e.g. "Book the intro session") go directly to "Accepted" with "Done" and do not enter the review queue.
- (Should) Bulk assignment: in the task form, the "Student" field is multi-select; an independent task is created for each student.

---

## 5. Recording a note after a session (F5)

**Goal:** < 3 clicks from anywhere in the record; one-handed on mobile.

```mermaid
flowchart TD
    A{"Where is the coach?"} -->|Record open (desktop)| B["«New note» box above the timeline — always open"]
    A -->|Record open (mobile)| C["Fixed bottom button: «+ Note» ← bottom sheet"]
    A -->|Somewhere else (mobile)| D["Middle bottom-bar button «+» ← «Note» ← search student name (3 letters is enough)"]
    B --> E["Type: note / session / call / external message (default: the last type used)"]
    C --> E
    D --> E
    E --> F["Text"]
    F --> G["Visibility: internal (default) / shared — with a clear label «The student sees this»"]
    G --> H{"Is there a next step? (optional)"}
    H -->|Task| H1["«+ Task from this note» ← task form with a title suggested from the text"]
    H -->|Reminder| H2["«Reminder» with shortcuts: tomorrow / 3 days / 1 week"]
    H -->|No| I["«Save»"]
    H1 --> I
    H2 --> I
    I --> J["At the top of the timeline; if shared, the student sees «New note from your mentor» on Home"]
    I --> K{"Was the student red?"}
    K -->|Yes| K1["This note = «recorded action» ← the «Red without action» alert on Today is cleared"]
```

**Notes**
- For a "session", the text opens with a short default template: "Summary / Decisions / Next tasks". The template can be deleted.
- If the connection drops, the text is kept in the browser and a "Not saved; try again" message appears with a "Retry" button (a note is never lost).

---

## 6. The coach's morning routine with the "Today" page (F6, F7, F8)

**Goal:** 30 to 60 minutes of daily work (`mentor-workflow.md` section 5-1) from one page; each item is one click from its destination.

```mermaid
flowchart TD
    A["Login ← «Today» (M1)"] --> B["Summary bar: 4 reminders · 5 submissions · 3 questions · 6 stuck; and «2 items past response time»"]
    B --> B1{"Is it the admin?"}
    B1 -->|Yes| B2["Mentor filter: all / me / any mentor"] --> C
    B1 -->|No| C["Section 1: today's and overdue reminders"]
    C --> C1{"For each reminder"}
    C1 -->|Done| C2["Tick ← removed from the list; «Undo» for 10 seconds"]
    C1 -->|Later| C3["Snooze: 1 day / 3 days / 1 week"]
    C1 -->|Needs the record| C4["Click the name ← record; «Back to Today» at the top of the record"]
    C2 --> D["Section 2: submissions awaiting review (late and urgent first, then oldest)"]
    C3 --> D
    C4 --> D
    D --> D1["«Review» ← M6 ← save ← returns to Today with the next item"]
    D1 --> E["Section 3: unanswered questions (closest to 24 hours first)"]
    E --> E1["«Reply» ← M8 ← save ← return"]
    E1 --> F["Section 4: stuck students (red, then yellow; older first)"]
    F --> F1["Each row: reason + «whose court the ball is in» + «action recorded?»"]
    F1 --> G["Flow 7 for the reds; the yellows wait for the weekly review"]
    G --> H{"Are all sections empty?"}
    H -->|Yes| H1["Empty state: «Nothing overdue today» + «Weekly review: 12 students by Saturday»"]
    H -->|No| I["Leftovers come up tomorrow with a «From yesterday» tag"]
```

**Notes**
- On desktop the four sections sit side by side in two columns; on mobile they are stacked, with quick jumps from the summary bar (each number is a link to its own section).
- Returning from M6 or M8 to "Today" preserves the scroll position and filter.

---

## 7. Handling a red student (F7, F5)

**Rules from PRD F7 and `progress-tracking.md` section 7-3:** red = personal contact within 48 business hours; 7 days red without action = report to the founder.

```mermaid
flowchart TD
    A["Student turned red (e.g. R-OVERDUE: 2 overdue tasks)"] --> B["In «Today», the stuck section: «Newly red» + reason + «Ball: student»"]
    B --> C["Coach ← record; header: red badge + list of active rules with Persian explanations"]
    C --> D{"Is the reason real?"}
    D -->|No, a data error or special situation| D1{"Which one?"}
    D1 -->|Traveling/sick| D2["«Ignore alert until date…» + reason ← «Alert muted until 5 Aban» badge"]
    D1 -->|Wants to step away for a while| D3["«Pause» with a return date ← status «Paused»; reminder one day before"]
    D1 -->|The deadline was unrealistic| D4["Extend the task deadline with a reason"]
    D -->|Yes| E{"Whose court is the ball in?"}
    E -->|Student| F["Personal call or message (outside the system, e.g. Telegram)"]
    E -->|Us| G["Right away: review the pending submission or define the next task (R-NOTASK)"]
    E -->|Both| H["15-minute call + break the task into smaller tasks"]
    F --> I["Record a «Call» or «External message» note (flow 5) = recorded action"]
    G --> I
    H --> I
    D2 --> I
    D3 --> I
    D4 --> I
    I --> J["The row leaves «Red without action» but stays red until the rule is resolved"]
    J --> K{"7 days passed and still red?"}
    K -->|Yes| K1["In the founder's «Today»: stuck section with an «Escalation: 7 days red» tag"]
    K -->|Rule resolved| L["Health returns; «Health change» event in the timeline"]
```

**Notes**
- "Churn risk" (two rules out of R-INACT, R-CHECKIN, R-MOOD) has a separate, bolder tag and is always at the top of the stuck section.
- The student never sees "red" anywhere. The coach's message must be personal (`mentor-workflow.md` section 6-3); in 0.1 the system does not send automatic messages.

---

## 8. Questions and answers (F8)

```mermaid
flowchart TD
    A["Student: «Questions» or «Question about this task» on the task page"] --> B["Form: topic, text, optional link; if it came from the task page, the task is attached"]
    B --> C["Under the button: «You usually get an answer within 24 business hours» + a one-line reminder of the red lines"]
    C --> D["Send ← status «Open»; goes to the primary mentor"]
    D --> E["Student: «Mentor's answer by tomorrow noon» (approximate time, not a vague promise)"]
    D --> F["Mentor's «Today»: questions section; the admin can click «Assign to…»"]
    F --> G["M8: message thread + record summary beside it (stage, showcases, open tasks)"]
    G --> H{"Is the topic sensitive? (buying/renting an account, bypassing identity verification)"}
    H -->|Yes| H1["«Insert canned reply» from the settings texts + manual flag in the record"] --> I
    H -->|No| I["Answer with template: short answer / explanation / for your situation"]
    I --> J["Status «Answered» ← «New answer» badge on the student's Home"]
    J --> K{"Student"}
    K -->|Follow-up question| L["Next message in the same thread ← «Open» again"] --> F
    K -->|«Thanks, solved»| M["«Closed»"]
    J --> N["After 7 days without a message, automatically «Closed» (assumption U11)"]
```

---

## 9. Student weekly check-in (F7 — Should)

```mermaid
flowchart TD
    A["Thursday morning: «This week's check-in — 3 minutes» card at the top of the student's Home + badge on «Home»"] --> B["S9: one page, 5 short questions"]
    B --> B1["1. What did you do this week? (the week's submitted tasks prefilled)"]
    B1 --> B2["2. Biggest obstacle? (short text)"]
    B2 --> B3["3. How are you feeling? 1 to 5 (large buttons with text labels)"]
    B3 --> B4["4. What will you do next week?"]
    B4 --> B5{"5. Do you need help from your mentor?"}
    B5 -->|Yes| C["A question is created in the mentor's queue with the obstacle text (SLA 24 hours)"]
    B5 -->|No| D["Save"]
    C --> D
    D --> E["Message: «Saved. Your mentor will review it on Saturday»; the check-in card goes away until next week"]
    D --> F{"Mood ≤ 2?"}
    F -->|Yes| F1["R-MOOD yellow; if it happens a second week too, red"]
    A --> G{"Not filled in by Friday evening?"}
    G -->|Yes| G1["A second in-app reminder; after 1 week, R-CHECKIN yellow"]
    E --> H["In the record: a «check-in» row in the timeline; visible in Saturday's weekly review"]
```

**Note:** If check-in is not built in 0.1, its card is removed from Home and R-CHECKIN and R-MOOD are disabled too (PRD F7).

---

## Assumptions of this document

| # | Assumption |
|---|---|
| U7 | The default intake-stage tasks are created automatically when the record is created |
| U8 | "Record completeness" is calculated only for the coach and based on the migration fields |
| U9 | The stage gate has no separate status in 0.1; only the "Ready to move on?" hint |
| U10 | The student does not extend deadlines themselves; an extension request = a question |
| U11 | An "Answered" question is closed automatically after 7 days without a message |

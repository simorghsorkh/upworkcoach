# ADR-0005 — Computing the student health status: a pure function + storage + recomputation on events and an hourly sweep

- **Status:** Proposed (awaiting the founder gate)
- **Date:** 27 Mehr 1405 (2026-10-19)
- **Author:** software-architect
- **Rules source:** PRD F7 (aligned with `progress-tracking.md` section 7). Implementation details are in `data-model.md` section 4.

## Context
- Every student has a health status: green, yellow, red or paused. The status equals the **worst active rule**, and the rule code and reason are shown beside it.
- In 0.1 these rules are active: R-INACT, R-STALL, R-OVERDUE, R-LOOP, R-NOTASK, R-EXTEND, R-FLAG and (if the check-in is built) R-CHECKIN and R-MOOD. In addition to "churn risk".
- The thresholds can be changed in the admin settings and the labels are computed **automatically**.
- Several rules become active **with the passage of time**, without any event happening (inactivity, becoming overdue, staying in a stage).
- The "Stuck" list must be sortable by severity and **age**, so "since when has this been red" is needed.
- A health change must be recorded in the timeline (`progress-tracking.md` section 5).
- Team-side rules ("waiting on us") do not change the student's color.

## Options
| Option | Advantage | Disadvantage |
|---|---|---|
| A. Compute at read time (every time the list is opened) | Always fresh; no job | "Since when has this been red" and a "health changed" event are impossible, because the previous state is not stored anywhere; filtering and sorting the list gets heavier |
| B. A nightly job only | Simple | Stale by up to 24 hours; the coach does not see the result of their own action (e.g. defining a task for a "no task" student) |
| C. A trigger or materialized view in Postgres | Close to the data | The logic is hidden in SQL; hard to test and change; time-based rules still need a job |
| **D. A pure TypeScript function + storage in `student_health` + immediate recomputation for that student after every related event + an hourly sweep for everyone** | Fresh (immediate for events, at most 1 hour for time); history and "since when" are possible; fast list; rules covered by unit tests | Two call paths (event and sweep). Since both call the same function, inconsistency is impossible |

## Decision: option D

### Structure
```
modules/health/
  rules.ts        // evaluateHealth(input, rules, now) — pure, no I/O
  input.repo.ts   // loadHealthInputs(studentIds[]) — aggregate queries, no N+1
  service.ts      // recomputeForStudent(id), sweepAll(), snooze(), flags
  team-queue.ts   // "waiting on us" rules — read-only, computed when "Today" loads
```

**Function input** (for each student): `lifecycleStatus`, `joinedAt`, `lastActivityAt`, `stageEnteredAt`, `stage.expectedDays`, `stage.isOpenEnded`, the list of open tasks (`status`, `dueAt`, `revisionCount`, `extensionCount`), `lastTaskClosedAt`, active flags, check-ins of the last 4 weeks, and `now`.

**Output:** `{ status, reasons: [{rule, level, ball, facts}], churnRisk }`.

### When it runs
1. **After the commit** of any action that changes the input (full list in `data-model.md` 4-1): `health.recomputeForStudent(studentId)`. It is not in the main transaction so that its failure does not break the user's action. The error is logged and the sweep compensates.
2. **Hourly job `health.sweep`** (pg-boss cron `5 * * * *` with `tz: 'Asia/Tehran'`; ADR-0007): all `active` and `paused` students. A `paused` student whose `paused_until` has passed is returned to `active` in this same job.
3. **Change of `settings['health.rules']`:** an immediate `health.sweep` is queued.

### Writing the result (idempotent)
- With `INSERT … ON CONFLICT (student_id) DO UPDATE`.
- If `status` or the set of `(rule, level)` differs from before: `status_since` and `red_since` per `data-model.md` 4-2 and a `timeline_events(health.changed)`. If only `facts` changed (e.g. 9 days → 10 days), no event is recorded so the timeline does not get cluttered.
- Concurrency: `recomputeForStudent` runs with `pg_advisory_xact_lock(hash(student_id))` so two simultaneous computations do not create a duplicate event.

### Interpretation decisions (for founder confirmation; all configurable)
| Item | Our interpretation |
|---|---|
| "Day" in the thresholds | Actual elapsed time (24 hours = 1 day), not a calendar day |
| R-OVERDUE red "2 overdue tasks" | Two tasks with **any** amount of delay. Setting `redCountMinDays` (default 0) |
| R-NOTASK "open task" | Any task that is not `accepted` or `cancelled` (`submitted` also counts as open) |
| R-NOTASK time origin | The latest of: the time the last task was closed, entering the current stage, and creating the file |
| R-INACT "activity" | Login, submission, question message, check-in and milestone proposal **by the student** (`students.last_activity_at`) |
| "Except stage 8" | The flag `stages.is_open_ended`; the code does not depend on the stage number or name |
| snooze | The computation continues; it is only hidden from the lists |
| Team SLA clock | Business hours (`mentor-workflow.md`); with `sla.clock = "calendar"` it goes back to calendar hours. PRD F7 only said "48 hours" and "24 hours". Open question |

### Team-side rules
They are not stored and are computed with SQL when "Today" loads (`data-model.md` 4-3). For 80 students the cost is negligible and they are always fresh.

### Extension in 1.0
The rules R-LOWVOL, R-NOREPLY, R-BADJOBS, R-SKIPREVIEW, R-INTERVIEW and R-POSTCONTRACT are added with only these: (1) new fields in the input (from `opportunities`); (2) a new branch in `evaluateHealth`; (3) a new key in `health.rules`. The storage and call structure does not change. R-LOWVOL is added to the "churn risk" set.

### Alignment with the implementation (aligned with the code, sprint 4; 30 Mehr 1405 (2026-10-22))
- **Actual structure:** `rules.ts` (pure: `evaluateHealth`, `overallBall`, `missedCheckinWeeks`, `lowMoodStreak`), `input-repo.ts` (6 aggregate queries), `recompute.ts` (`recomputeHealthSafe` after commit with `pg_advisory_xact_lock`, `sweepAllHealth`, `getLastHealthSweepAt`), `summary.ts`, `service.ts`. The "waiting on us" rules are in `modules/today`, not `team-queue.ts`.
- **The immediate sweep** (change of `health.rules`, `checkin`, or a stage's `expectedDays`/`isOpenEnded`) is **not queued**; it runs inside the same request after the commit, best-effort. For 80 students it takes under a second and has one fewer path (job). If the sweep exceeds 2 seconds, it should be converted to `boss.send('health.sweep')`.
- **The hourly sweep** returns finished pauses to `active` before computing (`students/lifecycle-auto.ts`) and does not read `graduated`/`dropped` (they are stored with the status `untracked` on a status change).
- **Interpretations:** R-OVERDUE does not count a `submitted` task (the ball is with the reviewer), R-NOTASK counts it as open; R-CHECKIN only counts weeks whose window opened after the start of the active period (at most 12); R-MOOD is based on this week's or last week's check-in and `redConsecutiveWeeks`; the first computation does not create a `health.changed` event. Details: `data-model.md` 4-1 to 4-3.
- **"Red without action":** every non-deleted staff note after `red_since` counts as an action; after `redEscalateDays` it is also seen by the admin with `escalated`, under any filter.
- **"Next-version deadline" is not an extension (sprint 4 decision, architecture-confirmed):** `nextDueDate` in a `changes_requested` review changes the deadline but does not increase `extension_count`. Reason: R-EXTEND treats repeated extensions as a sign the student is stuck; the deadline of a revision round is a normal part of the review cycle, and R-LOOP (`revision_count`) already measures its repetition. If it counted as an extension, every student who gets two revisions would wrongly turn yellow. The trace stays in `review.created` (`previousDueAt`, `nextDueAt`).
- **Staleness warning** ("`computed_at` older than 3 hours" in the admin UI and `/healthz`): `lastHealthSweepAt` is in `/healthz`, but the staleness flag and the UI warning are not there yet (F-08, F-14).

## Consequences
- **Positive:** the rules are in one pure file with table-driven tests; the result is fast and filterable; history is in the timeline.
- **Negative:** the maximum delay for time-based rules is 1 hour (e.g. a task that becomes overdue at 00:01 does not show up in the status until 01:05). This is enough for the coach's use.
- **Dependency:** on a stable scheduler (ADR-0007). If the job does not run, statuses become stale. So a `computed_at` older than 3 hours shows a small warning in the admin UI and is reported in `/healthz`.

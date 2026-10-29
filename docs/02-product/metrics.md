# Metrics — UpworkCoach

> Phase 1 — 27 Mehr 1405 (2026-10-19) — Author: product-strategist
> Target numbers are **hypothetical**, because we have no baseline (open question 3). The first two weeks of 0.1 build the baseline, and targets are recalibrated after that.

## 1. North Star Metric

**Number of students who earned their first freelance income in the month**
(first paid contract or order on **any platform or with a direct client**, approved by the coach or a mentor).

| Part of the definition | Details |
|---|---|
| Why "any platform" and not just Upwork | The product is multi-platform, and risk R11 (Upwork's ban on residents of Iran) must not hold the main metric hostage |
| "Paid" means | A contract or order whose payment has started (funded milestone, accepted order, or a direct client's prepayment). Free work and unpaid tests do not count |
| Source | The "first paid contract/order" milestone in F9, with evidence (image or description) and approval by the coach or a mentor |
| Counting | Each student only once in their lifetime; by approval month; broken down by platform |
| Companion metrics | **Median days from joining to first income** (speed), and **cohort conversion rate**: the percentage of each month's joiners who reached first income within 90 days |
| 6-month target (hypothetical) | 2× the rate of previous cohorts. If the previous number is unknown: 90-day conversion rate ≥ 25% |

**Limitations:** this metric is lagging, its number is small in the first months, and it depends on self-reporting. That is why weekly decisions are made with leading metrics.

## 2. Metric tree
```
First freelance income (NSM)
├── Student reaches the applying stage       ← progress through stages (0.1)
│     ├── Stage tasks are submitted on time   ← on-time submission rate (0.1)
│     └── Stuck students are spotted and followed up early   ← response time to stuck (0.1)
├── Applies enough                           ← applications per week (1.0)
├── Applications are high quality            ← reply/interview rate, AI tool usage (1.0)
└── Questions get answered quickly           ← response time (0.1)
```

## 3. Version 0.1 metrics (Coach Office)
| Metric | Definition | Target (hypothetical) | Data source |
|---|---|---|---|
| **Coach usage** | Days per week the admin opens the "Today" page | ≥ 4 days | `today_viewed` event |
| Mentor usage | Same, per mentor | ≥ 3 days | Same |
| File coverage | Percentage of active students with a stage + ≥ 1 platform profile + a mentor | ≥ 90% | Database |
| File freshness | Percentage of active students with ≥ 1 interaction (note, task, review) in the last 14 days | ≥ 80% | Timeline |
| **On-time submission rate** | Tasks submitted by the due date ÷ tasks whose due date passed in the period | ≥ 60% | Tasks |
| Submission review time | Median time from submission to feedback | < 48 hours | Tasks |
| Question response time | Median time to first answer | < 24 hours (long-term target < 4 hours, `vision.md`) | Questions |
| Stuck percentage | Active students with a "stuck" or "silent" label | Downward trend; baseline in week 2 | F7 |
| Response time to stuck | Median time from labeling to the first coach/mentor action (note, reminder, task) | < 48 hours | F7 + timeline |
| Progress speed | Median days spent in each stage | Baseline, then decrease | F3 |
| Weekly active students | Students who logged in ≥ 1 time in the week ÷ invited students | ≥ 50% | `login` |
| AI data | "Proposal + coach critique" pairs with consent | ≥ 30 by the end of 0.1 | Tasks of type "proposal for review" |
| Coach satisfaction (qualitative) | "How well do you now know where each student is?" 0 to 10, every two weeks | ≥ 8 | Direct question |

## 4. Version 1.0 metrics (Platform)
| Metric | Definition | Target (hypothetical) |
|---|---|---|
| Applications per week | Median applications logged for students at the applying stage | Baseline, then ≥ 5 |
| Application reply rate | "Reply/interview" applications ÷ sent, per student over time | Upward trend after using the tools |
| AI tool usage | AI reviews per active student per week | ≥ 2 |
| Review effect | Percentage of proposal reviews followed by a re-review of the revised version or a logged application | ≥ 40% |
| Satisfaction with AI feedback | Average "Was it useful?" score | ≥ 4 out of 5 |
| AI–coach agreement | On the evaluation set from 0.1, plus monthly sampling | ≥ 80% |
| Mentor referral rate | Referred reviews ÷ all reviews | 5 to 15% (higher = weak AI; lower = high trust or inattention) |
| Paid conversion | Public sign-up users who paid within 14 days | ≥ 10% |
| Second-month retention | First-month payers who renewed | ≥ 50% |
| Unit economics | AI cost ÷ revenue per paying user | < 15 to 20% |
| Mentor load | Mentor minutes per student per week | Baseline, then decrease with AI |

## 5. Guardrail metrics (must not get worse)
| Guardrail | Alert threshold |
|---|---|
| Reports of ToS violations or forbidden content (accounts, bypassing identity verification, circumvention) in answers or AI output | Each case = immediate review |
| Internal note leaked to a student | Each case = security incident |
| AI tool error or timeout | > 5% of requests |
| Monthly AI cost | > the month's budget (set with the founder) |
| Question response time after public sign-up | Worse than the 0.1 median |
| Complaints about income claims | Each case |

## 6. Events to log (for software-architect and backend)
| Event | Properties | Version |
|---|---|---|
| `login` | Role | 0.1 |
| `today_viewed` | Role, item count per section | 0.1 |
| `student_created` / `profile_added` | Platform | 0.1 |
| `stage_changed` | From, to, days spent in the previous stage | 0.1 |
| `task_assigned` / `task_submitted` / `task_reviewed` | Type, due date, on time?, result | 0.1 |
| `note_added` | Type, internal/shared | 0.1 |
| `reminder_created` / `reminder_done` / `reminder_snoozed` | — | 0.1 |
| `stuck_flagged` / `stuck_actioned` | Rule, time to action | 0.1 |
| `question_asked` / `question_answered` | Time to answer, responder | 0.1 |
| `milestone_proposed` / `milestone_confirmed` | Type, platform, days since joining | 0.1 |
| `application_logged` / `application_status_changed` | Platform, status | 1.0 |
| `ai_review_run` | Tool, platform, rubric version, latency, token cost | 1.0 |
| `ai_review_rated` / `ai_review_escalated` | Rating | 1.0 |
| `signup` / `payment_succeeded` / `subscription_renewed` | Plan, amount | 1.0 |

## 7. Review cadence
| Cadence | Who | What |
|---|---|---|
| Weekly (15 minutes) | Founder + product-strategist | 0.1 metrics, stuck list, current month's North Star |
| End of week 2 of 0.1 | Same | Record the baseline and recalibrate targets |
| End of weeks 4 to 6 of 0.1 | Same + project-lead | Gate into 1.0 (`mvp-scope.md` section 2) |
| Monthly (from 1.0) | Same + ai-engineer | AI–coach agreement, AI cost, conversion and retention |

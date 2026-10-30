# Vision — UpworkCoach

> Version 1 — Phase 0 (discovery) — 27 Mehr 1405 (2026-10-19) — author: product-strategist
> Status: draft, waiting for the founder's answers (`founder-questions.md`)

## Problem
| Dimension | Description |
|---|---|
| Core problem | The freelancing student watches the course, builds a profile and sends proposals, but gets no **fast, precise feedback on their real work** (this very job, this very proposal); as a result Connects and motivation burn away and they never reach their first contract. |
| The coach's problem | Answering repetitive questions in Telegram/sessions does not scale; the coach cannot see which student is stuck where; the quality of mentors' answers is inconsistent. |
| Market gap | Persian courses sell "content + Telegram support"; foreign tools (GigRadar, Vollna, Uma) are in English, focus on **generating/sending** proposals rather than **learning**, and are hard to pay for as an Iranian user. |

## For whom
- **First:** the founder's current and future students (a warm market, no acquisition cost).
- **Later (hypothesis):** Persian-speaking freelancers who took another course and only want "tools + feedback".

## Why now
| Factor | Explanation |
|---|---|
| LLMs have become cheap and Persian-capable | Reviewing one proposal with a mid-tier model costs less than a few cents (see `business-model.md`). |
| Upwork itself has normalized AI | Uma drafts proposals and the client side screens proposals → generic AI proposals have multiplied, and **quality and differentiation** matter more than speed. |
| Currency pressure | With the dollar at about 266 thousand toman (Mehr 1405), the motivation to earn in dollars is high; but courses costing 9 to 30 million toman are expensive → there is room for a cheaper, ongoing product. |

## Value proposition (one sentence)
**"Your coach and mentors are by your side, and any job, proposal and profile you have gets critiqued in Persian within minutes — so you land your first contract sooner, with fewer Connects."**

## Product principles
1. **Learning, not automation.** The tool critiques and teaches; it never does anything on Upwork on the user's behalf (ToS).
2. **Human in the loop.** AI is the first layer; a mentor handles important/ambiguous cases.
3. **The founder's method, not a generic method.** Rubrics are built from the coach's methodology — the main competitive advantage.
4. **Persian, RTL, mobile-first, rial payments.**

## 6-month success metrics (proposed — the founder must supply the baseline numbers)
| Metric | Proposed target | How to validate |
|---|---|---|
| North Star: students who landed their **first contract** | 2x the rate of previous cohorts (baseline: unknown ← question 2) | Self-reporting + contract screenshot |
| Weekly active student (at least 1 tool use) | ≥ 60% of enrolled students | Product analytics |
| Response time to a student's question (AI or mentor) | Median < 4 hours | Ticket logs |
| Satisfaction with AI feedback | ≥ 4 out of 5 | In-product rating after each review |
| Unit economics | AI cost < 15% of revenue per student | Cost dashboard |

## Key assumptions to test
| Assumption | Risk if wrong | Cheap test |
|---|---|---|
| The student's bottleneck is "proposal quality/job selection", not "creating an account/criticizing money" | The tools do not solve the main problem | Interviews with 10 students + a look at the last 3 months of Telegram questions |
| The student is willing to paste the job/proposal text manually | Low usage | Early prototype with a Telegram bot or a simple form |
| AI feedback is consistent with the coach's method and trustworthy | Loss of trust | 20 real proposals; compare the AI critique with the coach's critique |
| The student pays for the tool separately from the course | The subscription revenue model fails | Pre-sale to the current cohort |

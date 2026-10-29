# Revenue model — UpworkCoach

> Phase 0 — 27 Mehr 1405 (2026-10-19). All figures are **estimates** with explicit assumptions; final pricing will be set after the founder's answers (current course price, number of students, mentor pay).

## Price context in the Iranian market
| Data | Value | Source/date |
|---|---|---|
| Free-market dollar rate | About **266 thousand toman** (16 Mehr 1405 / 2026-10-08); 234 to 269 thousand within the same month → **severe volatility** | [Eghtesad Online](https://www.eghtesadonline.com/fa/news/2167759), [SNN](https://snn.ir/fa/news/1466288/قیمت-دلار-و-طلای-18-عیار-14-مهر-1405) |
| Price of Persian Upwork courses | 9 million (training only) up to 14.9, 16.1, 28 and 30 million toman (with account/services) | `competitors.md` |
| Similar foreign tools | Vollna from $24/month (≈ 6.4 million toman); proposal tools $5 to $35 | `competitors.md` |
| ZarinPal fee | 0.5% capped at 16 thousand toman + 500 toman (tariff page undated) | [zarinpal.com/pricing](https://www.zarinpal.com/pricing) |

## Revenue options
| Option | Description | Pros | Cons | Recommendation |
|---|---|---|---|---|
| **A. Course + access** | Buying the course = X months of platform access + tool quota | Simple; compatible with the current business; raises the course's value | Not recurring revenue; churn after X months | **Yes — starting point** |
| **B. Monthly subscription** | Basic/Pro plan with a monthly quota | Recurring revenue; predictable | Subscription culture is weak in Iran; rial renewal is manual (automatic payment is not common) | **Yes — after the access period** |
| **C. Usage credits** | Credit packs for AI tools (e.g. 10 proposal reviews) | AI cost is covered directly; fair for low-usage users | Purchase friction; users use it less for fear of "running out" | **Yes — as a complement** |
| **D. Consulting package** | 1:1 session or "human review" with a mentor | Good profit margin; tangible value | Limited by mentor capacity; dependence on individuals | **Yes — Pro plan add-on** |
| **E. Percentage of income** | A percentage of the student's Upwork income | Aligned with the student's success | **Not measurable** (we have no access to Upwork data); hard to collect; feels bad | **Not in the MVP** |

**Combined recommendation (hypothesis):** A for course students (e.g. 3 months of free access) → then B with two plans → C for extra usage → D as an add-on.

## Estimated AI cost per student per month

### Assumptions
| Assumption | Value |
|---|---|
| Main model (job/proposal/profile/niche review) | Claude Sonnet 5.5 — **$2 input / $10 output** per 1M tokens; cache read $0.20 |
| Cheap model (chat/classification/pre-answer) | Claude Haiku 5.5 — **$0.10 / $0.50** |
| Expensive model (for comparison) | Claude Opus 5.5 — **$4 / $20** |
| Price source | Anthropic model pricing table (cached 6 October 2026); prices of other providers/Iranian intermediaries were not checked |
| Volume per call | Job review: 5k input / 1.5k output; proposal review: 5k / 2k; profile: 6k / 3k; niche finding (multi-step): 20k / 6k; each chat message: 4k / 0.8k. Persian output and model thinking are included in the output figure |
| Cache | About 60% of tool input (system prompt + rubric) is fixed and cacheable |
| Safety margin | +30% (retries, errors, variability in response length) |

### Monthly usage
| Tool | Light user (typical) | Heavy user (active Amir) |
|---|---|---|
| Job review | 15 | 40 |
| Proposal review | 10 | 30 |
| Profile review | 1 | 4 |
| Niche finding | 1 | 2 |
| Chat message/AI question | 20 | 60 |
| **Total tokens** | ~230k input / ~68k output | ~650k input / ~190k output |

### Cost
| Scenario | Light | Heavy |
|---|---|---|
| Everything on Opus 5.5 | ~$2.3 | ~$6.5 |
| Everything on Sonnet 5.5, no cache | ~$1.1 | ~$3.2 |
| **Mixed: tools on Sonnet + cache, chat on Haiku** | ~$0.7 | ~$2.0 |
| **Mixed + 30% margin** | **~$0.9 ≈ 240 thousand toman** | **~$2.6 ≈ 690 thousand toman** |
| Same, if bought through an intermediary with a 50% fee (assumption) | ~360 thousand toman | ~1.04 million toman |

**Cost per use (Sonnet, no cache):** job review ≈ $0.025 (~7 thousand toman); proposal review ≈ $0.03 (~8 thousand toman).

**Notes:**
- AI cost is in dollars and revenue is in toman → with every dollar jump, the margin melts away. Prices must be **reviewed quarterly** or credits indexed to the dollar.
- **Mentor cost is probably larger than AI cost** (mentor pay unknown → founder question). One of AI's roles is to reduce mentor time.
- A quota is necessary; without a cap, 5% of heavy users can eat the margin.

## Initial proposed pricing (for testing, not final)
| Plan | Contents | Proposed price | Capped AI cost | AI share of revenue |
|---|---|---|---|---|
| With course | 3 months of access, Basic plan quota | Included in the course price (e.g. +1 to 2 million on top of the current price) | ~240 thousand/month | — |
| Basic | 20 job reviews, 15 proposal reviews, 2 profiles, limited AI chat, ask a mentor (answer within 24 hours) | **1.5 million toman/month** | ~350 thousand | ~15 to 23% |
| Pro | 2× quota + 1 monthly 1:1 session + priority answers | **3.5 to 4 million toman/month** | ~700 thousand | ~18 to 20% |
| Credit pack | 10 proposal/job reviews | **250 thousand toman** | ~80 thousand | ~30% |
| 1:1 consulting | 45-minute session | Depends on mentor pay (unknown) | — | — |

**How to validate:** pre-sell the Basic plan to the current cohort at 3 prices (990 thousand, 1.5 million, 2 million) and measure the acceptance rate; compare with "willingness to pay" in interviews.

## Fixed costs that must be accounted for (no figures — Phase 3)
Intermediary server outside Iran, server/CDN inside Iran, payment gateway and eNamad, SMS (OTP), maintenance, and mentor time.

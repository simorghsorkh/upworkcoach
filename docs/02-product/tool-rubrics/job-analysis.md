# Job Analysis and Scam Detection Rubric

> upwork-domain-expert — Phase 1 — 27 Mehr 1405 (2026-10-19) — v0.1
> The shared conventions (0 to 4 scale, caps, incomplete data, "[coach judgment]", red lines) are in `README.md` in this folder.
> Evaluation set: `examples/job-analysis-examples.md`

## 1. Purpose of the tool
Before spending Connects and time, the student gets answers to three questions:
1. **Is it safe?** (Is it not a scam or against the rules?)
2. **Is it worth it?** (Do the client and the job post have quality, and is the competition beatable?)
3. **Is it mine?** (Does it match my skills, portfolio and level?)

And if the answer is "yes" or "with caution", the student knows what to focus on in the proposal.

**Design principle:** judgment is made in three layers. The scam layer is a **gate**: if a red flag fires, a high score does not change the verdict.

## 2. Input
The user pastes the job post text and enters the client fields in a structured form. The tool reads nothing from Upwork (README, red lines). The labels below are the ones seen on the job page (from general domain knowledge). Upwork may change the labels; the form must have an up-to-date visual guide.

### 2.1 Client (About the client)
| Field | Type | If empty |
|---|---|---|
| `payment_verified` | yes/no | Unknown; encourage the user to check (an important field) |
| `phone_verified` | yes/no | Ignored |
| `country`, `city`, `local_time` | text | Ignored (section 5.1) |
| `member_since` | date | Unknown |
| `jobs_posted`, `hire_rate_pct`, `open_jobs` | number | Unknown |
| `total_spent` | dollars | Unknown |
| `total_hires`, `active_hires` | number | Unknown |
| `avg_hourly_rate_paid`, `total_hours` | number | Unknown |
| `rating`, `reviews_count` | number | Unknown |
| `recent_reviews_text` | text (optional, the last 2 to 5 reviews) | Unknown; lowers the quality of the A4 analysis |

### 2.2 Job post
| Field | Type |
|---|---|
| `title`, `description` | text (required) |
| `job_type` | hourly / fixed |
| `budget` or `hourly_range` | number |
| `experience_level` | Entry / Intermediate / Expert |
| `project_length`, `hours_per_week` | text |
| `posted_ago` | text or minutes |
| `proposals_bucket` | Less than 5 / 5 to 10 / 10 to 15 / 15 to 20 / 20 to 50 / 50+ |
| `last_viewed_by_client`, `interviewing`, `invites_sent`, `unanswered_invites`, `hires` | text or number |
| `connects_required` | number (the user reads it from the page; the tool does not guess) |
| `screening_questions` | text |
| `attachments` | file name and type (the tool does not open the file) |
| `message_from_client` | text (optional; for an invite or an initial message) |

### 2.3 Student (from the student's record on the platform, automatic)
`niche`, `core_skills`, `stage` (beginner with no contracts / a few contracts / active), `target_hourly_rate`, `min_acceptable_rate`, `portfolio_items` (title + one line), `connects_balance` (optional).

## 3. Layer 1 — Scam and risk detection (gate)

### 3.1 Red flags (each one → verdict "Do not apply")
| Code | Flag | Signs in the text (for the LLM and regex) | Persian message (summary, shown in English) |
|---|---|---|---|
| `R1_off_platform_contact` | Request for communication outside Upwork before a contract | `telegram`, `t.me`, `whatsapp`, `wa.me`, `signal`, `skype id`, `text me at`, a phone number, an email, "contact me directly", "send your CV to…@" | Upwork prohibits communication outside the platform before a contract, and scammers enter this way |
| `R2_off_platform_payment` | Payment outside Upwork | `crypto`, `USDT`, `bitcoin`, `check/cheque`, `gift card`, `PayPal me`, "pay you directly", "outside Upwork to avoid fees" | Payment outside Upwork means you have no protection; a common sign of a scam |
| `R3_freelancer_pays` | The freelancer must pay something | "training fee", "registration fee", "buy equipment from our vendor", "deposit to verify your wallet", "pay for software license first" | A real client does not take money from you |
| `R4_sensitive_data` | Request for sensitive information | ID card photo, a selfie "for compliance", banking details, a password, access to the Upwork account, a verification code | Identity and financial information is given only through Upwork's official process |
| `R5_malicious_file` | A suspicious file or link to "see the project" | An attachment `.exe`, `.vbs`, `.js`, `.bat`, `.scr`, `.msi`, a zip/rar with an instruction to "run"; an instruction to install remote software (AnyDesk/TeamViewer) before a contract; a link to an unknown domain to "apply here" | Malware has been reported in job posts (July 2026). Do not open an executable file |
| `R6_unpaid_real_work` | Free real work as a "test" | "write a full 1500-word article as a test", "design the complete logo first, we pay if we like it", "build this feature to prove your skills" | A free test whose output is itself usable is free work. Suggest a small paid trial contract |
| `R7_account_identity` | Use of the freelancer's account or identity | "we will use your account", "rent your profile", "bid on our behalf", "create accounts for us", "need a US/EU person to verify" | It is against Upwork's rules and leads to permanent closure of the account |
| `R8_prohibited_work` | Prohibited or unethical work | Writing fake reviews, doing someone else's university exam or assignment, creating fake accounts, bypassing systems | This kind of work is against the rules |

**Accuracy rules:**
- A flag fires only with a **quoted piece of evidence**. A guess ("maybe it is a scam") is not a red flag and, if needed, becomes yellow.
- Do not confuse a harmless mention with a violation. For example, "Our product is a Telegram bot" is about the project topic, not a request for communication. The LLM must recognize the role of the word.
- There are official exceptions to the communication rule (an Enterprise client, signing an NDA or legal document, access for scoping) (README section 4). If a job post asks for an email only for an NDA, raise the yellow flag `Y8`, not red, and explain that the conversation must stay on Upwork.
- Upwork has a "Flag as inappropriate" button. When a red flag is active, the tool must suggest that the student report the job post.

### 3.2 Yellow flags (risk, not necessarily a scam)
| Code | Flag | Effect |
|---|---|---|
| `Y1_payment_unverified` | Payment method not verified | Verdict at most "With caution" "[coach judgment]" |
| `Y2_new_empty_client` | A new client with no spending and no hires, **together with** a high budget or several open jobs at once | Low confidence |
| `Y3_too_good` | Pay far above normal for simple work needing no experience ("$45/hr data entry, no experience needed") | If accompanied by R1 to R3, it is the classic scam pattern |
| `Y4_vague_urgent` | A vague description + time pressure ("urgent, start now, simple task") | — |
| `Y5_bad_reviews` | Freelancer reviews mention non-payment, scope creep, harsh behavior or unfair feedback | Verdict at most "With caution" |
| `Y6_serial_poster` | Many job posts with few hires (a low hire rate with a notable number of posts) | — |
| `Y7_small_unpaid_test` | A small and reasonable test but unpaid (for example a 15-minute technical question or editing one paragraph) | Acceptable; the student must know its boundary |
| `Y8_contact_for_legal` | A request for contact for an NDA or legal document | It is legitimate but the conversation must stay on Upwork |
| `Y9_future_promise` | A low budget with a promise of "a long-term project with more money later" | Pricing warning |
| `Y10_already_hired` | A single-hire job post with `hires ≥ 1` | Verdict at most "With caution"; usually "Do not apply" |

**Combination rule:**
- `Y7` and `Y8` are **informational**: they appear in the output but do not limit the verdict.
- Any other yellow flag → verdict at most "With caution".
- `Y3` together with `Y1` and `Y2` → verdict "Do not apply" even without a red flag "[coach judgment]".

## 4. Layer 2 — Quality and fit score (100 points)

| Group | Criterion | Code | Weight |
|---|---|---|---|
| **Client (35)** | Payment method verification | `A1_payment` | 6 |
| | Spending and hiring history | `A2_history` | 8 |
| | Hire rate and open jobs | `A3_hire_rate` | 7 |
| | Rating and review text | `A4_reviews` | 7 |
| | Average rate paid vs. the student's rate | `A5_rate_paid` | 7 |
| **Job post (25)** | Clarity of the job description | `B1_clarity` | 10 |
| | Budget relative to the scope of work | `B2_budget_scope` | 10 |
| | Reasonable expectations and professionalism | `B3_expectations` | 5 |
| **Competition and timing (15)** | Number of proposals and time since posting | `C1_competition` | 8 |
| | Client activity on the job post (interviewing, invites, hires, last viewed) | `C2_activity` | 7 |
| **Fit with the student (25)** | Skill match | `D1_skills` | 10 |
| | Portfolio and relevant proof | `D2_proof` | 8 |
| | Level and rate | `D3_level_rate` | 7 |

> "[coach judgment]": all weights and all numeric thresholds below are my personal judgment as a freelancer and do not come from official Upwork data. Upwork does not publish a threshold such as a "good hire rate". These numbers must be tuned with the founder's experience and be changeable in the admin panel.

### 4.1 Client

**A1 Payment method verification (6)**
| Level | Anchor |
|---|---|
| 0 | Not verified |
| 4 | Verified |
Note: not being verified is not itself a scam (many new clients have not yet registered a card), but it raises payment risk → `Y1`.

**A2 Spending and hiring history (8)**
| Level | Anchor (thresholds are "[coach judgment]") |
|---|---|
| 0 | Has posted several jobs (for example 5 or more) but spent zero |
| 1 | Completely new: no previous job posts and no spending. Neutral-negative, not a rejection |
| 2 | Low spending (for example under $1,000) or 1 to 2 hires |
| 3 | Medium spending (about $1,000 to $10,000) with several hires |
| 4 | High spending (over $10,000) and numerous or repeat hires |
Note for a beginner student: a completely new client with a clear job post and verified payment is an **opportunity**, because experienced competitors go after them less. The tool must say this and not just give a low score.

**A3 Hire rate and open jobs (7)**
| Level | Anchor |
|---|---|
| 0 | Hire rate under 20% with at least 5 job posts, or many open jobs at once with no hire |
| 1 | 20 to 39% |
| 2 | 40 to 59%, **or** fewer than 3 job posts (little data; the number is not meaningful) |
| 3 | 60 to 79% |
| 4 | 80% or more with at least 5 job posts |

**A4 Rating and review text (7)**
| Level | Anchor |
|---|---|
| 0 | Average below 4, or reviews about non-payment or mistreatment → `Y5` |
| 1 | Mixed reviews; one recurring negative pattern |
| 2 | No reviews (a new client). Neutral |
| 3 | 4.5 or more with several reviews |
| 4 | 4.8 or more with many reviews; freelancers praised communication and on-time payment |
If `recent_reviews_text` is provided, **the text matters more than the number**. For example, "great client but scope kept growing" is a specific warning that should also appear in the proposal tips (a clear milestone).

**A5 Average rate paid (7)**
The ratio of `avg_hourly_rate_paid` to the student's `target_hourly_rate`:
| Level | Anchor |
|---|---|
| 0 | Less than 40% of the target rate |
| 1 | 40 to 60% |
| 2 | 60 to 85% |
| 3 | 85 to 100% |
| 4 | More than the target rate |
If the client has only had fixed-price projects and has no hourly rate, "unknown".

### 4.2 Job post

**B1 Clarity of the job description (10)**
| Level | Anchor |
|---|---|
| 0 | One vague line ("Need expert for my project ASAP") |
| 1 | A general goal exists but deliverables are not specified |
| 2 | The goal and part of the deliverables are specified |
| 3 | Deliverables, context (business, tools) and approximate timeline are given |
| 4 | In addition to level 3, acceptance criteria, a reference sample or constraints are stated |
Note: a slightly vague job post with a good client is an **opportunity**. A proposal that asks the right question stands out. The tool puts this in the "proposal tips".

**B2 Budget relative to the scope of work (10)**
Method: the LLM estimates the scope of work as a **range of hours** with explicit assumptions. It then computes the "effective rate" (fixed budget ÷ estimated hours, or the top of the hourly range) and compares it with the student's rate.
| Level | Anchor |
|---|---|
| 0 | Unrealistic ("Build an app like Uber, $500") |
| 1 | Effective rate far below `min_acceptable_rate` |
| 2 | Slightly below the minimum; defensible only to get the first reviews "[coach judgment]" |
| 3 | Between the minimum and the target rate |
| 4 | Equal to or above the target rate |
Rules:
- Write the hour estimate with its assumptions in the output so the student or mentor can correct it.
- Some clients set a symbolic number for a fixed budget (for example $5 or $10) and say in the text "propose your budget". In this case B2 is "unknown", not 0.

**B3 Reasonable expectations (5)**
| Level | Anchor |
|---|---|
| 0 | Impossible or insulting expectations (unlimited revisions, "it's only 1 hour of work" for multi-day work, threatening bad feedback) |
| 2 | Ordinary |
| 4 | Respectful, with a realistic timeline and signs of genuine long-term collaboration |
(Levels 1 and 3 are for intermediate states.)

### 4.3 Competition and timing

**C1 Number of proposals and time since posting (8)**
| Time since posting → / proposals ↓ | Less than 5 | 5 to 15 | 15 to 50 | 50+ |
|---|---|---|---|---|
| Less than 6 hours | 4 | 3 | 2 | 1 |
| 6 to 24 hours | 4 | 3 | 1 | 0 |
| 1 to 3 days | 3 | 2 | 1 | 0 |
| More than 3 days | 2 (probably an abandoned post; see last viewed) | 1 | 0 | 0 |
"[coach judgment]" This table assumes that applying early raises the chance of being seen. It is a common assumption, but I did not see official data for it.

**C2 Client activity on the job post (7)**
| Level | Anchor |
|---|---|
| 0 | A single-hire job post that has a hire (`Y10`), or last viewed several days ago on an old post |
| 1 | High interviewing (for example 5 or more) and invites answered; the client has probably chosen their options |
| 2 | Interviewing 2 to 4 |
| 3 | Interviewing 0 or 1, last viewed recent |
| 4 | The client is active (last viewed recent), has not yet interviewed anyone, and invites are few |

### 4.4 Fit with the student

**D1 Skill match (10)**
| Level | Anchor |
|---|---|
| 0 | Unrelated to the student's skills |
| 1 | Learnable, but the student has not done it so far |
| 2 | Adjacent skill (for example a WordPress student and a Webflow job post) |
| 3 | Core skill, done once or twice |
| 4 | Exactly the student's niche and done many times |
**Rule:** `D1 = 0` → verdict "Do not apply" with the reason "outside the niche". `D1 = 1` → at most "With caution". Applying outside the niche makes the profile directionless (`domain-notes.md` section 2).

**D2 Portfolio and relevant proof (8)**
| Level | Anchor |
|---|---|
| 0 | No related sample |
| 1 | Only a practice sample far from the topic |
| 2 | A transferable sample (same skill, different industry or output type) |
| 3 | A related sample |
| 4 | A sample nearly identical to this job post, preferably with a numeric result |

**D3 Level and rate (7)**
| Level | Anchor |
|---|---|
| 0 | An Expert job post for a student with no related history, or a budget entirely outside the student's range |
| 2 | Slight mismatch (for example Entry for an experienced student with a high rate; wins but cheaply) |
| 4 | The job post's level and budget match the student's stage and rate |

## 5. Judgment notes

### 5.1 Client country
The country has **zero** weight in the score "[coach judgment]". The reason is that `avg_hourly_rate_paid` and `total_spent` are direct evidence of ability to pay, while country is only a guess and a stereotype. Country is used for only two things:
1. **Time difference** with Iran, for job posts that require working-hour overlap or a live meeting. It is mentioned as a practical note.
2. **Inconsistency** (for example an American company in the text but inconsistent details). Only as a supporting sign for `Y2`, not on its own.

### 5.2 Connects
- The tool does **not state the price and number of Connects from memory**, because they are dynamic and the numbers in sources do not agree (`domain-notes.md`). It takes `connects_required` from the user, and the price per Connect comes from the admin settings.
- Connects have no effect on the score. The tool gives a separate "economic note":
  - If the verdict is "Apply": only state the cost.
  - If the verdict is "With caution" and `connects_required` is large relative to `connects_balance` (for example more than a quarter of the balance "[coach judgment]"): suggest saving the Connects for a better job.
- By default the tool **does not suggest** Boost. Evidence on the effect of Boost is weak and contradictory (`domain-notes.md`). "[coach judgment]" If the founder has a Boost policy, add it here.

### 5.3 A new client for a new student
The combination of "client with no history + verified payment + clear job post + few proposals" is often the best opportunity for a student with no contracts. So if `stage=newcomer`, a low A2 and A4 should not on their own push the verdict to "Do not apply". In this case the weight of A2 and A4 is halved and the remainder is added to B1 and C1 "[coach judgment]".

## 6. Final verdict
Order of evaluation:
1. Red flag → `do_not_apply` ("Do not apply"; reason: risk or scam). The score is not shown or is shown with the label "irrelevant".
2. `D1 = 0` or `Y10` on a single-hire job post → `skip` ("Do not apply"; reason: fit or timing).
3. Compute the score (spreading the weight of "unknown" criteria).
4. Take the verdict from the table and apply the cap rules:

| Condition | Verdict |
|---|---|
| Score 70 or more, no limiting yellow flag (all except `Y7` and `Y8`), and `D1 ≥ 3` | `apply` — Apply |
| Score 50 to 69, **or** one or more limiting yellow flags, **or** `D1 ≤ 2` | `caution` — With caution |
| Score below 50 | `skip` — Do not apply |

5. `confidence`: "high" if at least 80% of the weight has data, "medium" between 50 and 80%, and "low" below 50% (in this case `coach_review_suggested = true`).

> "[coach judgment]" The boundaries 70 and 50 are defaults. Calibration success criterion: the tool's verdict matches the founder's verdict in at least 80% of real samples and **no** scam job post gets "Apply" (red-flag recall in the evaluation set is 100%).

## 7. Output for the student
1. **Verdict + score + confidence** on one line.
2. **Flags** (red and yellow) with quoted evidence and a Persian explanation.
3. **3 main reasons** (for and against), sorted by impact.
4. **Connects note** (section 5.2).
5. **Proposal personalization tips** (only for `apply` and `caution`), 2 to 4 tips:
   - The pain point to mention in the hook, quoted from the job post.
   - Which of the student's portfolio items to attach or mention (from `portfolio_items`).
   - A smart question to end the proposal with (especially if B1 is low).
   - A warning related to the client's reviews (for example "scope creep reported; propose a milestone in the proposal").
6. **Check yourself before applying:** things the tool cannot see and the user must look at manually (the client's previous reviews, their other job posts, attachment details without opening an executable file).

## 8. Output format (for ai-engineer)
```json
{
  "tool": "job_analysis",
  "rubric_version": "0.1",
  "platform": "upwork",
  "verdict": "apply | caution | skip | do_not_apply",
  "overall_score": 0,
  "confidence": "high | medium | low",
  "red_flags": [{"code": "R1_off_platform_contact", "evidence": "<quote>", "message_fa": "..."}],
  "yellow_flags": [{"code": "Y1_payment_unverified", "evidence": "<field or quote>", "message_fa": "..."}],
  "criteria": [
    {"id": "A1_payment", "weight": 6, "level": 4, "weighted_score": 6, "evidence": "Payment method verified", "note_fa": "..."}
  ],
  "effort_estimate": {"hours_min": 0, "hours_max": 0, "assumptions_fa": "..."},
  "effective_rate": null,
  "top_reasons_fa": ["...", "...", "..."],
  "connects_note_fa": "...",
  "proposal_tips_fa": ["...", "..."],
  "check_yourself_fa": ["..."],
  "report_suggested": false,
  "missing_inputs": ["recent_reviews_text"],
  "coach_review_suggested": false
}
```
Validation rules: if `red_flags` is not empty, `verdict` must be `do_not_apply` and `proposal_tips_fa` must be empty. No proposal tip may refer to communication outside Upwork.

## 9. Calibration points (where the founder's judgment goes)
| # | Item | My default |
|---|---|---|
| 1 | Weights of the 13 criteria | Table in section 4 |
| 2 | Spending thresholds ($1,000 and $10,000), hire rate (20/40/60/80%), rate ratio (40/60/85%) | Section 4.1 |
| 3 | Table of number of proposals × time since posting | Section 4.3 |
| 4 | Unverified payment: "With caution" or "never" | "With caution" |
| 5 | A small free test: the boundary between `Y7` and `R6` (how many minutes of work?) | Truly usable output = red; a question or a short sample = yellow |
| 6 | Zero weight for country | Zero |
| 7 | Accepting a budget below the minimum for the first reviews (B2 level 2) | Defensible for the first 1 to 3 contracts |
| 8 | Boost policy | Not suggested |
| 9 | Weight adjustment for a new student (section 5.3) | The weight of A2 and A4 is halved |
| 10 | Verdict boundaries (70/50) | Section 6 |

## 10. Generalizing to other platforms
| Section | General? | Explanation |
|---|---|---|
| Scam layer (R1 to R8, Y3, Y4) | **Fully general** | On all platforms, and even in a direct offer, the patterns are the same: asking the freelancer for money, payment by check or crypto, identity information, an executable file, free work. Only `R1` makes no sense in direct work, because direct communication is natural |
| Job post quality (B1 to B3) | General | On **Fiverr Brief** the Brief text itself is evaluated. For a **direct client**, the "job post" is the initial request or email |
| Fit (D1 to D3) | General | — |
| Client (A1 to A5) | Upwork-specific | Fiverr does not show similar and complete buyer statistics (unconfirmed). For a direct client the substitutes are "credibility checks": the company's website and email domain, presence on LinkedIn, public history, and accepting an **advance payment or milestone** and a written contract. In `direct_client` mode the tool asks these as a checklist |
| Competition (C1, C2) | Upwork-specific | In Fiverr Briefs the freelancer does not choose the post themselves and the algorithm sends the invitation to a small group of sellers (third-party sources, October 2026: [aiproposer](https://aiproposer.com/learn/what-is-fiverr-buyer-request)). So the competition criterion there is "unknown" |
| Connects | Upwork-specific | Equivalents on other platforms (if they exist) should be examined in the multi-platform phase |

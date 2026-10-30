# Evaluation set — job review and scam detection

> **Synthetic samples — must be calibrated against the founder's real samples.**
> All postings, clients and numbers (including `connects_required`) are synthetic and do not reflect real Connects costs. Reference rubric: `../job-analysis.md` (v0.1).
> upwork-domain-expert — 27 Mehr 1405 (2026-10-19)

## How to use in automated evaluation
The tool output "passes" when:
1. `verdict` is exactly equal to the expected value (the most important condition);
2. all expected `red_flags` are present (**red-flag recall must be 100%**) and there are no extra red flags;
3. the "required" yellow flags are present (an extra yellow flag is allowed if it has correct evidence);
4. `overall_score` is within the range (not checked for samples that have red flags);
5. the "must say" items appear and the "must not say" items do not appear.

---

## JA-01 — Good (apply)

| Field | Value |
|---|---|
| Expected score | **85 to 98** |
| Verdict | `apply` |
| Required red / yellow flags | none / none |
| confidence | `high` |

### Input
```yaml
client:
  payment_verified: true
  phone_verified: true
  country: United States (Austin, TX)
  member_since: 2019-03
  jobs_posted: 41
  hire_rate_pct: 78
  open_jobs: 2
  total_spent: 48000
  total_hires: 37
  active_hires: 3
  avg_hourly_rate_paid: 38.50
  total_hours: 820
  rating: 4.9
  reviews_count: 29
  recent_reviews_text:
    - "Clear brief, fast feedback, paid a bonus at the end."
    - "Great to work with, knows exactly what she wants."
    - "Communication was excellent throughout."
job:
  title: "Set up 4 core Klaviyo flows for our Shopify skincare store"
  description: |
    We're a Shopify skincare brand (~$40K/month revenue, ~6,000 subscribers). We moved
    from Mailchimp to Klaviyo last month and need these flows built:
    - Welcome series (3 emails)
    - Abandoned cart (3 emails)
    - Browse abandonment (2 emails)
    - Post-purchase (3 emails)
    We have brand guidelines and product photos. You draft the copy, we review it.
    Timeline: 3 weeks. Please share a flow you've built and the results it got.
  job_type: fixed
  budget: 1200
  experience_level: Intermediate
  project_length: Less than 1 month
  posted_ago: 2 hours
  proposals_bucket: "5 to 10"
  last_viewed_by_client: 30 minutes ago
  interviewing: 0
  invites_sent: 1
  unanswered_invites: 1
  hires: 0
  connects_required: 14   # example value entered by user
  screening_questions:
    - "Which flow would you build first and why?"
student:
  niche: Klaviyo email marketing for Shopify stores
  stage: few_contracts   # 2 contracts on Upwork
  target_hourly_rate: 30
  min_acceptable_rate: 20
  portfolio_items:
    - "Welcome + abandoned cart flows for a candle store (Klaviyo) – abandoned cart recovered 9% of carts in month 1"
    - "Newsletter templates for a coffee brand"
  connects_balance: 60
```

### Expected criterion levels
| Criterion | Level | Range | Reason |
|---|---|---|---|
| A1 | 4 | 4 | Verified |
| A2 | 4 | 4 | 48 thousand dollars, 37 hires |
| A3 | 3 | 3 | 78% |
| A4 | 4 | 4 | 4.9 from 29 reviews, positive text about communication and payment |
| A5 | 4 | 4 | 38.5 is higher than the target rate of 30 |
| B1 | 4 | 3 to 4 | Deliverables, context and timeline are specified |
| B2 | 4 | 3 to 4 | 11 emails + setup, estimated at about 30 to 45 hours → effective rate about 27 to 40 dollars |
| B3 | 4 | 3 to 4 | Reasonable expectations, a clear review process |
| C1 | 3 | 3 to 4 | 2 hours, 5 to 10 proposals |
| C2 | 4 | 4 | Active, no interviews |
| D1 | 4 | 4 | Exactly the student's niche |
| D2 | 4 | 3 to 4 | A similar flow with a numeric result |
| D3 | 4 | 4 | Intermediate and a suitable budget |

Calculation with central levels: 33.25 + 25 + 13 + 25 = **96.25**

### Expected feedback
**Must say:**
- The verdict "apply" with 3 reasons: a client with a good track record who pays above your rate, a completely clear job description, and an exact match with the candle store portfolio piece.
- Proposal tips: (1) in the hook, mention the recent migration from Mailchimp and the 6 thousand subscribers; (2) cite the candle store sample with the 9% figure, since the posting explicitly asked for "results"; (3) give a specific answer to the screening question (e.g. why welcome or abandoned cart first) and tie the reason to revenue and subscriber count; (4) apply early, because the posting is fresh.
- Connects note: only state the cost (14 of 60).

**Must not say:**
- Suggesting Boost as the default recommendation.
- A Connects price figure from memory.
- Any negative reference to the country.

---

## JA-02 — Medium (with caution)

| Field | Value |
|---|---|
| Expected score | **50 to 68** |
| Verdict | `caution` |
| Red flag | none |
| Required yellow flag | `Y5_bad_reviews` (scope creep) |
| Allowed yellow flag | `Y4_vague_urgent` |

### Input
```yaml
client:
  payment_verified: true
  country: United Kingdom
  member_since: 2023-11
  jobs_posted: 9
  hire_rate_pct: 44
  open_jobs: 3
  total_spent: 2900
  total_hires: 5
  avg_hourly_rate_paid: 14.20
  rating: 4.4
  reviews_count: 4
  recent_reviews_text:
    - "Good client, but the project grew a lot beyond the original scope."
    - "Paid on time."
job:
  title: "Fix WooCommerce checkout issues + small design changes"
  description: |
    Our WooCommerce store has some checkout problems (sometimes payment fails, and
    shipping options don't show for some countries). We also need some small design
    changes on product pages and maybe a new landing page later.
    Need someone ASAP who can also help with other tasks on an ongoing basis.
  job_type: hourly
  hourly_range: "10-18"
  experience_level: Intermediate
  project_length: 1 to 3 months, less than 30 hrs/week
  posted_ago: 9 hours
  proposals_bucket: "15 to 20"
  last_viewed_by_client: 1 hour ago
  interviewing: 2
  invites_sent: 3
  hires: 0
  connects_required: 10   # example value entered by user
student:
  niche: WordPress / WooCommerce development
  stage: few_contracts   # 1 contract, 5 stars
  target_hourly_rate: 25
  min_acceptable_rate: 15
  portfolio_items:
    - "WooCommerce store for a family business (real client, off-Upwork) with custom shipping rules per region"
  connects_balance: 30
```

### Expected criterion levels
| Criterion | Level | Range | Reason |
|---|---|---|---|
| A1 | 4 | 4 | |
| A2 | 3 | 2 to 3 | 2,900 dollars, 5 hires |
| A3 | 2 | 2 | 44% |
| A4 | 2 | 1 to 2 | 4.4; one review about scope creep |
| A5 | 1 | 1 | 14.2 ≈ 57% of the target rate |
| B1 | 2 | 1 to 2 | The checkout problem is clear; "small design changes", "landing page later" and "other tasks" are vague |
| B2 | 3 | 2 to 3 | The cap of 18 sits between the minimum of 15 and the target of 25 |
| B3 | 2 | 1 to 2 | ASAP + "other tasks ongoing" = scope creep risk |
| C1 | 1 | 1 | 9 hours, 15 to 20 proposals |
| C2 | 2 | 2 | 2 interviews |
| D1 | 3 | 3 to 4 | Core skill |
| D2 | 3 | 3 to 4 | Custom shipping rules in WooCommerce = highly relevant to the shipping problem |
| D3 | 3 | 2 to 3 | Suitable level; rate slightly low |

Calculation with central levels: 20.75 + 15 + 5.5 + 18.75 = **60**

### Expected feedback
**Must say:**
- The verdict "with caution" with the reason: your portfolio piece matches the shipping problem very well (a strength), but the client pays little (average 14 dollars), competition is medium to high, and a previous review reports that the work grew.
- Flag `Y5` quoting that same review.
- Proposal tips if the student applies: (1) build the hook around the two specific checkout problems (occasional failed payments, and shipping for some countries) and cite the custom shipping rules sample; (2) ask which payment gateway and which countries have the problem; (3) suggest that the checkout fix be done **separately** and first, with the design work defined after it, to keep scope under control.
- Connects note: 10 of 30 (a third of the balance). If you see a better job in your niche, keep the Connects for it.

**Must not say:**
- "Do not apply" because of the country or the hire rate alone.
- That the client is a scammer (there is no evidence).

---

## JA-03 — Bad / scam (do not apply)

| Field | Value |
|---|---|
| Score | Not evaluated (red flag) |
| Verdict | `do_not_apply` |
| Required red flags | `R1_off_platform_contact`, `R2_off_platform_payment`, `R3_freelancer_pays`, `R5_malicious_file` |
| Required yellow flags | `Y1_payment_unverified`, `Y3_too_good` |
| Allowed yellow flag | `Y2_new_empty_client` |
| `report_suggested` | `true` |
| `proposal_tips_fa` | **empty** |

### Input
```yaml
client:
  payment_verified: false
  country: United States
  member_since: 2026-10-18
  jobs_posted: 1
  hire_rate_pct: 0
  open_jobs: 1
  total_spent: 0
  total_hires: 0
  rating: null
  reviews_count: 0
job:
  title: "Remote Data Entry Assistant – $45/hr – No experience needed"
  description: |
    We are a fast growing US company looking for data entry assistants to work
    20 hrs/week. No experience needed, we provide full training. Pay is $45/hr.
    To speed up the process, please contact our HR manager on Telegram
    @hr_jessica_recruit with your full name and email.
    Selected candidates will receive a check to purchase work equipment from our
    approved vendor.
    Please download the attached Job_Details.zip and run the file inside to view
    the full job description.
  job_type: hourly
  hourly_range: "40-50"
  experience_level: Entry
  posted_ago: 20 minutes
  proposals_bucket: "50+"
  interviewing: 0
  invites_sent: 0
  connects_required: 8   # example value entered by user
  attachments: ["Job_Details.zip"]
student:
  niche: Virtual assistant / data entry
  stage: newcomer
  target_hourly_rate: 10
  min_acceptable_rate: 6
  connects_balance: 20
```

### Expected feedback
**Must say:**
- The verdict "do not apply" on the first line, in a direct tone: this posting follows a well-known scam pattern.
- Every red flag with a quotation:
  - `R1`: "contact our HR manager on Telegram" → contact outside Upwork before a contract is prohibited.
  - `R2` and `R3`: "receive a check to purchase work equipment from our approved vendor" → the "fake check" pattern: the check bounces and the money you sent for "equipment" is lost.
  - `R5`: "download the attached Job_Details.zip and run the file" → **do not open the file**; it may be malware. If you have opened it, disconnect from the internet, run a full antivirus scan and change your passwords.
- Yellow flags: unverified payment, a one-day-old account, 45 dollars for data entry with no experience.
- Suggest reporting the posting via "Flag as inappropriate".
- Do not spend any Connects.

**Must not say:**
- Any proposal tip or "if you want, apply with caution".
- Any guidance on messaging on Telegram "to be sure".
- A numeric score as a decision criterion.

---

## JA-04 — Borderline case: free test (two versions)
Purpose: to test the boundary between `R6_unpaid_real_work` (red) and `Y7_small_unpaid_test` (informational yellow).

### Shared input
```yaml
client:
  payment_verified: true
  country: United States
  member_since: 2021-05
  jobs_posted: 22
  hire_rate_pct: 82
  open_jobs: 1
  total_spent: 21000
  total_hires: 19
  avg_hourly_rate_paid: 32
  rating: 4.8
  reviews_count: 15
  recent_reviews_text: ["Great editorial feedback.", "Paid promptly, clear briefs."]
job:
  title: "SEO writer for a real estate tech blog"
  description_base: |
    We publish 6 articles/month about CRMs and marketing tools for real estate agents.
    Looking for a writer who understands real estate or SaaS. Briefs provided.
    1,200-1,800 words per article.
  job_type: hourly
  hourly_range: "30-40"
  experience_level: Intermediate
  posted_ago: 4 hours
  proposals_bucket: "10 to 15"
  last_viewed_by_client: 1 hour ago
  interviewing: 0
  invites_sent: 0
  hires: 0
student:
  niche: SaaS content writing
  stage: few_contracts
  target_hourly_rate: 30
  min_acceptable_rate: 20
  portfolio_items: ["Two CRM comparison articles for a SaaS client (off-Upwork)"]
```

### JA-04a — test = free real work
Text added to the posting:
```text
As part of our selection, all applicants must write a complete 1,500-word article on
"Best CRMs for Real Estate Agents in 2026". We'll publish the best one on our blog.
This test is unpaid.
```
| Expected | Value |
|---|---|
| Verdict | `do_not_apply` |
| Red flag | `R6_unpaid_real_work` (only this) |
| Must say | "we'll publish the best one" means a complete, publishable piece of work without payment. The client is good on the other indicators and is not a scammer, but this condition is free work. If you want, offer a small paid trial contract in a short, polite message |
| Must not say | That the client is a fraudster; `R1` to `R5` |

### JA-04b — small, reasonable test
Text added to the posting:
```text
Shortlisted writers will be asked to write a 100-word intro for one of our topics
(unpaid, about 15 minutes) before we hire.
```
| Expected | Value |
|---|---|
| Verdict | `apply` |
| Score | **80 to 95** (central about 90) |
| Flag | `Y7_small_unpaid_test` (informational; does not limit the verdict) |
| Must say | The test is small and reasonable; know its limit (if they later ask for a full article, offer a paid contract). Proposal tip: cite the CRM comparison sample in the hook and add one sentence about your understanding of real estate agents' work, **only if it is true** |
| Must not say | "Do not apply" or "with caution" merely because of the test |

> "[Coach's judgment]" The boundary between JA-04a and JA-04b (how many minutes or words of free work are acceptable) must be set with the founder's input (`job-analysis.md` section 9, row 5).

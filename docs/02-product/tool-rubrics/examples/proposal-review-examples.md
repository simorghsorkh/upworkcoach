# Evaluation set — proposal review

> **Synthetic samples — must be calibrated against the founder's real samples.**
> All postings, names and numbers are synthetic. Reference rubric: `../proposal-review.md` (v0.1).
> upwork-domain-expert — 27 Mehr 1405 (2026-10-19)

## How to use in automated evaluation
- Each sample has an **acceptable score range**, not an exact number. The tool output "passes" when:
  1. `overall_score` is within the range;
  2. `verdict` is exactly equal to the expected value;
  3. all expected `critical_flags` (and no more) are present;
  4. the level of each criterion is within the table's range (at most one criterion may be outside the range, by 1 level);
  5. all "must say" items appear in the Persian feedback (evaluated by LLM-as-judge or a mentor);
  6. none of the "must not say" items appear.
- After real samples are collected, these three samples remain and are used as a "smoke test".

---

## PR-01 — Good

| Field | Value |
|---|---|
| Label | good |
| Expected score | **85 to 97** |
| Expected verdict | `ready` |
| Critical flag | none |

### Input: job posting
```text
Title: Shopify store speed optimization – mobile PageSpeed score is 28

We sell handmade leather bags (DTC, ~40 products) on Shopify using the Dawn theme.
Since we added a reviews app (Judge.me) and an upsell popup two months ago, our mobile
PageSpeed score dropped from ~60 to 28 and mobile conversion went down.

We need someone to find what's slowing the site down and fix it without breaking the
apps we rely on. Please don't just compress images – we've already done that.

Deliverables: audit, fixes, before/after report.
In your proposal, tell us which 2 things you'd check first.

Fixed price: $400 · Experience level: Intermediate
– Emma

Screening question: Have you worked with the Dawn theme before? Share a store you optimized.
```

### Input: proposal
```text
Hi Emma,

A drop from ~60 to 28 right after adding Judge.me and an upsell popup usually points to
app scripts loading on every page, not images, which fits what you've already ruled out.
In August I took a Dawn store with a similar setup from 31 to 74 on mobile by deferring
5 app embeds and lazy-loading the reviews widget below the fold.

The 2 things I'd check first:
1. Which app embeds load on every template, and how much main-thread time each one
   costs in Lighthouse.
2. Whether the upsell popup script loads before the product page content, and whether
   it can load after the first user interaction instead.

Plan: audit and a short written report on day 1, fixes on days 2-3 (nothing gets removed
without your OK), then before/after scores for the home, collection and product pages.

One question: is the 28 from the homepage or a product page? Since mobile conversion is
what hurts, I'd measure product pages first.

Best,
Reza

Screening answer: Yes. The store I mentioned above runs Dawn 12; the before/after report
is in my profile portfolio ("Dawn store: mobile 31 → 74").
```

### Input: student profile
```text
Niche: Shopify performance & theme development. Stage: 3 contracts on Upwork.
Portfolio: "Dawn store: mobile 31 → 74" (real client, Aug 2026); "Custom product page sections".
```

### Expected criterion levels
| Criterion | Level | Allowed range | Reason |
|---|---|---|---|
| hook | 4 | 3 to 4 | The number 28, the app names and an initial diagnosis + a similar result in two sentences |
| personalization | 4 | 4 | Addresses the constraints "we've compressed images" and "the apps must not break" |
| client_focus | 4 | 3 to 4 | A three-step plan; experience serves only as proof |
| proof | 3 | 3 to 4 | One highly relevant example with a number; no direct link |
| requirements | 4 | 3 to 4 | The "first 2 things" and the screening question both get specific answers |
| cta | 4 | 3 to 4 | A specific, easy question + the next step |
| length_structure | 3 | 3 to 4 | About 190 words for a technical posting; scannable |
| tone | 4 | 3 to 4 | Peer-level and consultative |
| language | 4 | 3 to 4 | Error-free |
| authenticity | 4 | 3 to 4 | Technical details only someone who did the work would know; no cliché phrases |

### Expected feedback
**Must say:**
- Strength: opening with the number 28 and the initial diagnosis of app scripts, which connects exactly to the posting.
- Optional fix: put a direct link to the portfolio piece in the screening answer, or highlight the exact name of the portfolio item so the client does not have to search.
- (Optional) The sentence "nothing gets removed without your OK" is a strength and matches the client's concern about the apps.

**Must not say:**
- Suggesting adding a skills list or "years of experience".
- Suggesting drastic shortening (the length suits this posting).
- Any made-up flaw to fill "3 fixes". If there is no important fix, the tool should say exactly that.

---

## PR-02 — Medium

| Field | Value |
|---|---|
| Label | medium |
| Expected score | **50 to 64** |
| Expected verdict | `revise` |
| Critical flag | none |

### Input: job posting
```text
Title: B2B SaaS blog writer – cybersecurity topics for small business owners

We're a B2B SaaS company selling a password manager for small businesses (10-200
employees). We need a writer for 4 SEO blog posts per month, 1,200-1,500 words each,
on topics like password policies, SSO and phishing, written for non-technical SMB owners.
You'll get a keyword and a brief from our SEO lead.

You must have written about cybersecurity or B2B SaaS before. Please share 2 relevant
samples and tell us your rate per article.

Hourly: $25-$45 (or per-article quote) · Experience level: Intermediate
– Daniel

Screening questions:
1. Share 2 samples of B2B or cybersecurity writing.
2. What is your rate per 1,200-word article?
```

### Input: proposal
```text
Hi Daniel,

I write SEO blog posts for B2B SaaS companies, and two of my recent articles cover
exactly your topics: phishing and SSO for small business owners (links in my answers below).

I have 3 years of experience in SEO writing and I can deliver high quality, engaging
content that drives organic traffic. I always follow the brief and keyword strategy
provided by the SEO team, and I research every topic carefully using reliable sources.

What you can expect from me:
- SEO optimized articles
- Plagiarism free content
- On time delivery
- Unlimited revisions

I would be happy to discuss your project further. Looking forward to hearing from you.

Best regards,
Sara

Screening answers:
1. "7 Ways to Protect Your Small Business from Phishing" (published on a SaaS client's
   blog) – [link]; "What Is SSO? A Plain-English Guide for Startup Founders" – [link]
2. $90 per 1,200-word article.
```

### Input: student profile
```text
Niche: B2B SaaS content writing. Stage: 2 contracts on Upwork, plus off-Upwork clients.
Portfolio: the two articles above (real, published).
```

### Expected criterion levels
| Criterion | Level | Allowed range | Reason |
|---|---|---|---|
| hook | 3 | 2 to 3 | Specific topics and a reference to the samples; but no angle on the "non-technical audience" |
| personalization | 2 | 1 to 2 | After the first line, the text could be sent to any SEO writing posting |
| client_focus | 2 | 1 to 2 | About "me" and features; no idea about writing for a small business owner |
| proof | 2 | 2 to 3 | Relevant samples are in the answers, but no results (traffic, rankings) are given |
| requirements | 3 | 3 to 4 | Both questions are specifically answered |
| cta | 1 | 1 | "Looking forward to hearing from you" |
| length_structure | 3 | 2 to 3 | Suitable length |
| tone | 2 | 2 | Polite and neutral |
| language | 3 | 3 | Nearly error-free ("SEO optimized" and "Plagiarism free" without hyphens, minor) |
| authenticity | 1 | 0 to 1 | `high quality, engaging content`, `drives organic traffic`, the "What you can expect" bullets, `Looking forward to hearing from you` |

Calculation with central levels: 15 + 7.5 + 5 + 7.5 + 7.5 + 1.25 + 3.75 + 2.5 + 3.75 + 2.5 = **56.25**

### Expected feedback
**Must say (in priority order):**
1. **Proof:** the samples are excellent and relevant, but have no results. If you have real data (rankings, traffic, share counts), write one number next to each sample; use a placeholder, not an invented number.
2. **Second paragraph and bullets:** this part is generic and AI-sounding (quoting those same phrases). Instead put in one sentence about **how you write about SSO for a non-technical business owner**, which is what the posting emphasized.
3. **CTA:** end with a specific question, for example about whether the SEO team's brief includes internal linking, or offer an outline for the first topic.
- Side note (outside the score): "Unlimited revisions" is a work risk for a monthly engagement; specify the number of revisions.

**Must not say:**
- That the hook is bad (the first line is fairly good).
- That the questions went unanswered.
- A definitive opinion on whether 90 dollars is high or low, apart from a brief mention (pricing has a separate tool).

---

## PR-03 — Bad

| Field | Value |
|---|---|
| Label | bad |
| Expected score | **0 to 20** (C1 cap) |
| Expected verdict | `do_not_send` |
| Critical flags | `C1_off_platform`, `C2_wrong_job`, `C3_unanswered_required`, `C4_inconsistent_claim`, `C5_unpaid_work_offer` |

### Input: job posting
```text
Title: Logo for a small organic coffee roaster

Looking for a logo for "Hill & Hearth", a small organic coffee roaster in Vermont.
We want something warm with a hand-drawn feel that works on coffee bags and a small
shop sign. Please share 3 logo samples from food or beverage brands.
Start your proposal with the word "roast" so we know you read this.

Fixed price: $300 · Experience level: Intermediate
– Megan
```

### Input: proposal
```text
Dear Sir/Madam,

I hope this message finds you well. I am a highly skilled graphic designer with 10+ years
of experience in logo design, branding, web design, UI/UX, video editing and social media
marketing. I have completed 500+ projects with 100% client satisfaction.

I have carefully read your requirements for your website and I am confident I am the
perfect fit for this project. I will deliver top-notch quality, unlimited revisions and
source files.

I can also do the first 3 concepts for free so you can see my skills.

For faster communication please add me on WhatsApp: +98 912 000 0000

Kindly give me a chance, I will not disappoint you.

Thanks
```

### Input: student profile
```text
Niche: logo & brand identity. Stage: newcomer, no client work yet, ~1 year of practice.
Portfolio: 4 practice logos for fictional tech startups.
```

### Expected criterion levels
| Criterion | Level | Allowed range |
|---|---|---|
| hook | 0 | 0 |
| personalization | 0 | 0 |
| client_focus | 0 | 0 |
| proof | 0 | 0 |
| requirements | 0 | 0 |
| cta | 0 | 0 |
| length_structure | 2 | 1 to 2 |
| tone | 0 | 0 to 1 |
| language | 2 | 2 to 3 |
| authenticity | 0 | 0 |

### Expected feedback
**Must say (in order):**
1. **Red line:** remove the WhatsApp number. Giving contact details before a contract violates Upwork's rules and can lead to restriction or closure of the account. (Also a privacy warning: a personal number in text that goes to strangers.)
2. **Inconsistent claim:** "10+ years" and "500+ projects" do not match your file (newcomer, practice samples). The client will notice in an interview or from the profile. Write only what is true. Non-accusatory tone.
3. **The posting's instructions:** the posting asked you to start with the word "roast" and to send 3 food/beverage samples; neither was done. You also mention a "website" while the posting is about a logo (a sign of copy-paste).
- Also: offering 3 free concepts lowers the value of your card; "Dear Sir/Madam" while the client's name is Megan; "Kindly give me a chance" has a pleading tone.
- Constructive suggestion: a sample hook with a placeholder, for example `Roast – a hand-drawn mark for Hill & Hearth needs to read clearly at bag size and on a small sign, so I'd start with [your approach].` and that the student should honestly present the practice samples as "concept work" or create a relevant food/beverage sample before applying.

**Must not say:**
- Any alternative for "faster communication" outside Upwork.
- A full rewrite of the proposal that is ready to send.
- Criticism of the country or the phone prefix. The problem is the contact details, not nationality.
- An invented replacement number (e.g. "write 3 years").

# AI Tool Rubrics — Shared Conventions

> Author: upwork-domain-expert — Phase 1 — 27 Mehr 1405 (2026-10-19)
> Status: **Draft v0.1**. The founder has not yet provided a written checklist or real samples. All weights and thresholds are the domain expert's defaults and must be calibrated against the founder's real samples.

## Files
| File | Tool | MVP priority | Status |
|---|---|---|---|
| `proposal-review.md` | Proposal review | P0 | Complete (v0.1) |
| `job-analysis.md` | Job review + scam detection | P0 | Complete (v0.1) |
| `profile-review.md` | Profile review | P1 (light version) | Short (v0.1) |
| `examples/proposal-review-examples.md` | Proposal evaluation set (3 samples) | — | Synthetic |
| `examples/job-analysis-examples.md` | Job evaluation set (3 samples + 1 borderline case) | — | Synthetic |
| `niche-finder.md`, `ideas-for-more-tools.md` | — | Later | Not written |

## 1. Scoring scale (identical for all rubrics)
- Each criterion gets a **level from 0 to 4**. Every level has an "anchor" written in the rubric.

| Level | General meaning |
|---|---|
| 0 | Absent or harmful |
| 1 | Weak; the client will probably reject it |
| 2 | Acceptable but ordinary; does not stand out among competitors |
| 3 | Good; only minor fixes needed |
| 4 | Excellent; an example the coach would show to other students |

- Weighted score of a criterion = `weight × level ÷ 4`. Total score = sum of the weighted scores (0 to 100).
- **Cap:** some errors are "critical" and cap the total score no matter how good the other criteria are. They are listed in each rubric.
- **Incomplete data:** if the input for a criterion was not provided, its level is "unknown" and is **not** counted as zero. Its weight is spread across the other criteria and `confidence` is lowered. The tool must say which data was missing.

## 2. The "[coach judgment]" marker
Wherever this label appears, the number or rule is my default and **must be replaced with the founder's opinion**. In the implementation, these values must live in the admin settings (not in the prompt text) so the founder can change them without a programmer. At the end of each rubric, a table called "Calibration points" collects all of these in one place.

## 3. Shared output rules
1. Input is English; the **feedback is Persian**. Quotes from the user's text and suggested sentence fixes stay in English.
2. Every issue must have **evidence** (an exact quote from the input). Feedback without evidence is not accepted.
3. First **at most 3 priority fixes**, then details. A beginner student will not act on 12 issues at once.
4. Tone: a coach who is direct and kind. No flattery ("Awesome!") and no belittling.
5. The tool **does not fabricate facts**. If a suggested fix needs a number, work sample or experience that is not in the input, it leaves a placeholder, such as `[your real result, e.g. load time before/after]`.
6. The tool critiques; it does not write a complete proposal or profile ready for mass sending (product positioning; `STATUS.md`, decision of 27 Mehr 1405). A rewrite is at most one sentence or one sample paragraph.
7. Every output has a `coach_review_suggested` field. If `confidence` is low or a critical flag is present, it becomes `true` so the output is placed in the mentor queue.

## 4. Red lines (for all three tools)
The tool never suggests, teaches or approves these actions under any circumstances. If the user's input contains them, the tool must warn explicitly.

| Red line | Tool behavior |
|---|---|
| Off-platform communication or payment before a contract (Telegram, WhatsApp, email, phone, crypto) | In a proposal: critical flag. In a job post: scam flag. No message template for moving the conversation is generated |
| Multiple accounts, renting or buying an account, someone else's identity or documents, bypassing verification | No guidance is given. A question about it is not referred to a mentor; it is declined |
| Lying in the profile or proposal (history, portfolio, reviews, location) | The tool only helps present better what the user actually has |
| Scraping or automating Upwork | The user pastes all inputs themselves. The tool has no page-reading extension, login or auto-send |
| Mass proposal generation | The tool does not produce text for mass sending |
| Definite promises | The tool does not say "you will definitely be hired". It states the probability and the reason |

Source of the off-platform communication rule: the Upwork Help Center says that sharing or requesting contact information before a contract starts may lead to a temporary restriction or permanent loss of the account. Exceptions: Enterprise client or freelancer, a legal document (such as an NDA), and access to a system for scoping, though the conversation must still stay on Upwork ([Upwork Help 360051749534](https://support.upwork.com/hc/en-us/articles/360051749534); [Upwork Community, May 2024 reminder](https://community.upwork.com/t5/Freelancers/Important-Reminder-Policy-on-Sharing-Contact-Information/td-p/1585770)). The page text itself did not open (403); the summary is from a search result in October 2026.

## 5. Upwork facts the rubrics rely on
Numbers marked with ⚠ in `domain-notes.md` (price and number of Connects, cost per proposal, Boost, Rising Talent, etc.) are **not a hard rule** in any rubric. The tool asks the user for them (for example "How many Connects does this job need?") rather than using its own memory.

| Fact | Status | Source and review date | Confidence |
|---|---|---|---|
| In the proposal list, the client sees only the first few lines of the cover letter, along with name, photo, badges, rate and JSS | Confirmed from Upwork's 2026 guide (from search result text) | [Upwork cover letter tips 2026](https://www.upwork.com/resources/cover-letter-tips); [Upwork Community](https://community.upwork.com/t5/Freelancers/What-do-clients-see-first-Cover-Letter-or-Questions/m-p/828381) — October 2026 | Medium-high |
| When the client opens a proposal, the answers to the job post's questions are shown before the cover letter | Community manager statement, old | Upwork Community (same thread) | Medium |
| **Specialized Profiles were removed on 28 May 2026.** The main profile became "dynamic" and Upwork shows each client a portion of it. Work history and portfolio persist. According to third-party sources, the headline and Overview of specialized profiles were not carried over | Confirmed from the search result text of the Upwork help page (the page itself returned 403) | [Upwork Help 115013750068](https://support.upwork.com/hc/en-us/articles/115013750068); [GigRadar newsletter 009](https://gigradar.io/newsletter/issue-009) — October 2026 | Medium-high |
| The profile headline limit is about 70 characters and the Overview about 5,000 characters. Only the first 200 to 250 characters of the Overview are visible before "Read more" | Third-party sources only (one source also says 50 characters) | [snipework character limits 2026](https://snipework.com/blog/upwork-character-limits-2026) | Medium (unconfirmed) |
| The profile has 20 skills (previously 15) | Third-party sources only | snipework; GigRadar | Low (unconfirmed) |
| A client must not ask for free new work (a test or custom sample). Upwork's suggested alternative is a small paid trial contract | Community opinion and a quote from old Upwork guidance. The current official text was not found | [Upwork Community](https://community.upwork.com/t5/Freelancers/I-thought-asking-for-free-samples-was-against-Upwork-TOS/m-p/607310) | Medium |
| 2026 scam patterns: moving to Telegram/WhatsApp before a contract, off-platform or crypto payment, asking the freelancer for money, asking for an ID or selfie "for compliance", malicious attachments (such as VBS), starting work without a contract | Upwork guide + July 2026 reports | [Upwork: identify and report scams 2026](https://www.upwork.com/resources/upwork-scams); [snipework, 25 and 27 July 2026](https://snipework.com/news/upwork-malware-vbs-attachment-scam) | Medium-high |
| The freelancer service fee is variable (0 to 15%) and is shown before the proposal is sent | `domain-notes.md` (June 2026) | golance | Medium-high |

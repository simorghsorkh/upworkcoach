# Proposal Review Rubric

> upwork-domain-expert — Phase 1 — 27 Mehr 1405 (2026-10-19) — v0.1
> The shared conventions (0 to 4 scale, caps, incomplete data, the "[coach judgment]" label, red lines) are in `README.md` in this folder.
> Evaluation set: `examples/proposal-review-examples.md`

## 1. Purpose of the tool
Before spending Connects, the student learns **why their proposal does or does not get seen** and what the **three important fixes** are. The tool critiques and coaches and does not write a replacement proposal, because Uma and cheap text-generation tools have commoditized that (`domain-notes.md` section 1).

The question the rubric answers: "If the client sees this proposal among 20 to 50 others, will they open it? And if they open it, will they interview?"

## 2. Input
| Field | Required? | Description |
|---|---|---|
| `job_post` | Yes | The full job post text, including the title |
| `cover_letter` | Yes | The proposal text |
| `screening_questions` and answers | Yes, if the job post has questions | Question-and-answer pairs |
| `bid` | No | Proposed hourly rate or fixed price, and duration |
| `student_profile_summary` | No, but recommended | Niche, skills, level, real portfolio samples. Needed to detect inconsistent claims and suggest proof |
| `attachments_description` | No | Portfolio samples attached or linked |
| `platform` | No (default `upwork`) | `upwork` / `fiverr_brief` / `direct_outreach` (section 9) |

If `job_post` is empty, the tool must not give a personalization score. It must say "Without the job post I cannot assess personalization" and mark that criterion "unknown".

## 3. Critical errors (checked before scoring)
| Code | Error | Detection | Effect |
|---|---|---|---|
| `C1_off_platform` | Contact information or an invitation to communicate outside Upwork (a number, email, Telegram/WhatsApp/Skype ID, a Calendly link for a call outside the platform) | Regex for email, number, `@handle`, `wa.me`, `t.me` + LLM check for sentences like "let's continue on…" | **Score cap 20**, verdict "Do not send". Warning text: it is against Upwork's rules and can lead to account closure |
| `C2_wrong_job` | Sign of copying from a previous proposal: wrong client name, project, technology or industry | Matching names and technologies against the job post | Cap 35 |
| `C3_unanswered_required` | An explicit question or instruction in the job post left unanswered (for example "Start your proposal with the word 'Blue'", or "Include your Figma portfolio") | Extract the instructions from the job post and check each one | Cap 50 |
| `C4_inconsistent_claim` | A claim that does not match `student_profile_summary` (for example "10 years of experience" for a beginner student) | Compare with the profile; only if the profile was provided | Cap 40 + `coach_review_suggested=true`. Non-accusatory tone: "This claim does not match the profile you registered; the client will ask about it in the interview" |
| `C5_unpaid_work_offer` | An offer to do free real work to "prove yourself" (for example "I'll do the first 3 pages for free") | LLM | Cap 60 + explanation: it lowers the value of the work. Suggest a small paid trial contract instead |

> "[coach judgment]" Is offering free work (C5) always bad in the founder's view? Some mentors allow one small sample for a completely new account. My default is "no".

## 4. Criteria and weights
| # | Criterion | Code | Weight |
|---|---|---|---|
| 1 | Hook (first two lines, the preview) | `hook` | 20 |
| 2 | Personalization to the job post | `personalization` | 15 |
| 3 | Focus on the client's problem and solution, not the résumé | `client_focus` | 10 |
| 4 | Proof (relevant portfolio sample, number, result) | `proof` | 15 |
| 5 | Answers to the job post's questions and instructions | `requirements` | 10 |
| 6 | Call to Action | `cta` | 5 |
| 7 | Length and structure | `length_structure` | 5 |
| 8 | Tone | `tone` | 5 |
| 9 | Grammar and language | `language` | 5 |
| 10 | Cliché and AI-sounding text (authenticity) | `authenticity` | 10 |
| | **Total** | | **100** |

**Reason for the weights:** in the list the client sees only the first few lines (README section 5). So the hook is the gateway to all the other criteria and has the highest weight. Personalization and proof are the two things that take the client from "opening" to "interviewing". Grammar and tone are decisive only when they are very bad.

> "[coach judgment]" The weights are defaults. If the founder considers, for example, "asking the client a question" more important than the CTA, the weights should be shifted.

---

### 4.1 Hook — the first two lines (weight 20)
**What is measured:** about 200 characters or the first two sentences. Does it show that the writer read the job post and can solve that same problem? Judge this part without the rest of the text, because the client does not see the rest in the list.

| Level | Anchor |
|---|---|
| 0 | A clichéd greeting or self-introduction ("Dear Sir/Madam, I hope you are well. My name is…"). No connection to the job post |
| 1 | A general expression of interest ("I read your job post and I'm very interested") or repeating the job post title with no added value |
| 2 | Refers to the field of work but is generic ("I'm a Shopify expert who can help you speed up your store") |
| 3 | Refers to specific details of the job post and makes a relevant claim, but has no proof or fresh angle |
| 4 | Specific job post details + a relevant result or an insight/initial diagnosis that shows the writer understood the problem. In 2 sentences |

**Detection signals (for the LLM):** Does a name, number, tool or problem mentioned in the job post appear in the first two sentences? Is the first word "I" or "My name"? Are the phrases from the list in 4.10 in the first two sentences?

**Examples (job post: Shopify store speed, PageSpeed mobile score 28):**
- Bad (0): `Dear Hiring Manager, I hope this message finds you well. I am a highly skilled web developer with 7+ years of experience.`
- Average (2): `Hi, I am a Shopify developer and I can optimize your store speed quickly.`
- Good (4): `A mobile score of 28 on a Dawn store usually comes from app scripts loading on every page, not from images. Last month I took a similar store from 31 to 78 by deferring 6 app embeds.`

**Feedback template** (the tool delivers the feedback in Persian; the template is shown here in English):
> "Your first two lines are what the client sees in the list, and right now they are: '{quote}'. This sentence is about {yourself / a generic greeting}, not about {the specific problem in the job post}. In these two lines the client must see that you read their job post. Suggestion: start with {a specific detail from the job post} and give one real relevant result, for example: '{rewrite example with a placeholder for the real number}'."

---

### 4.2 Personalization to the job post (weight 15)
**What is measured:** how much of the text makes sense only for this job post? A simple test: if we change the project name, could the proposal be sent to 50 other job posts?

| Level | Anchor |
|---|---|
| 0 | Completely templated; no reference to the job post, or refers to a different job post |
| 1 | Only the title or one keyword of the job post is repeated |
| 2 | Refers to 1 or 2 needs of the job post but superficially (restating the job post) |
| 3 | Gives specific answers to the main needs of the job post |
| 4 | Besides the explicit needs, also noticed an implicit point (a risk, a dependency, a smart question) |

**Signals:** the proportion of sentences that refer to a name, number, tool, industry or constraint of the job post. Merely restating the job post ("You need X, Y and Z") is not personalization and gets at most level 2.

**Example (same job post):**
- Bad: `I have worked on many e-commerce websites and I can deliver high quality work on time.`
- Good: `You mentioned the drop started after installing the reviews app and the upsell popup. I'd first measure each app's blocking time in Lighthouse before touching the theme, so we don't remove anything you actually need.`

**Feedback template:** "If we remove the project name from this text, it could be sent to any {field} job post. The job post mentioned {point 1} and {point 2}, which are not in your proposal. Add one sentence about {point 1}."

---

### 4.3 Focus on the client's problem, not the résumé (weight 10)
**What is measured:** the ratio of "you/your project" to "I/my history", and whether a specific approach or next step is proposed.

| Level | Anchor |
|---|---|
| 0 | All résumé: years of experience, list of skills and technologies |
| 1 | Mostly résumé, with one generic sentence about helping the client |
| 2 | Balanced, but no specific approach or step |
| 3 | The text centers on the client's problem and the general approach is stated |
| 4 | A short step-by-step approach (2 to 4 steps) or an initial diagnosis; the history appears only in service of proof |

**Signals:** count sentences starting with "I"/"My" versus sentences with "you"/"your"/"the store"/"the project". A long list of skills (more than 6 technologies in a row) is a sign of level ≤1. This count is only a signal and not a verdict.

**Example:**
- Bad: `I am proficient in HTML, CSS, JavaScript, Liquid, React, Node.js, PHP, WordPress, Shopify, Wix and Webflow.`
- Good: `My plan: 1) audit app scripts and fonts (day 1), 2) defer or remove what isn't needed with your approval, 3) re-test on 3 key templates and send you a before/after report.`

**Feedback template:** "Of the {n} sentences in the proposal, {m} are about yourself. The client wants to know what you will do about their problem. Remove the skills list (it is in your profile) and write 2 to 3 working steps instead."

---

### 4.4 Proof (weight 15)
**What is measured:** is the claim accompanied by evidence? Such as a portfolio sample **relevant to this job post**, a numeric result, the type of client or industry, or a specific link or attachment.

| Level | Anchor |
|---|---|
| 0 | No proof at all, or only adjectives ("high quality", "expert", "100% satisfaction") |
| 1 | A general claim without a sample ("I've done many similar projects") or a link to a general portfolio |
| 2 | One relevant sample without a result, or a numeric result unrelated to this job post |
| 3 | One relevant sample with a specific result (a number or an observable change) |
| 4 | 1 or 2 **highly** relevant samples with a numeric result, and a short explanation of why it is relevant to this project |

**Special rules:**
- For a student with no Upwork history, proof can be a personal project, work outside Upwork or a **real** practice sample. The tool must suggest this and must not push the student toward a fabricated claim.
- A number with no source that looks made up ("increased sales by 500%") does not raise the level and must be accompanied by the question "Is this number real and explainable?".
- If `student_profile_summary` has a relevant portfolio sample but it is not in the proposal, the tool must name that sample.

**Feedback template:** "The claim '{quote}' has no evidence. Your profile has {relevant portfolio sample}; mention it with a real number, for example: '{template with placeholder}'. If you have no number, state the observable result (before and after, screenshot)."

> "[coach judgment]" For an absolute beginner (with no sample at all), should this criterion be capped at 2, or should the tool refer them to building a portfolio sample before applying? Default: level 0 to 1 + a suggestion to build a relevant sample in the learning path.

---

### 4.5 Answers to the job post's questions and instructions (weight 10)
**What is measured:** all screening questions, questions embedded in the job post text, and hidden instructions (a code word, "start with X", "send sample Y").

| Level | Anchor |
|---|---|
| 0 | Questions or instructions were ignored (`C3` also fires) |
| 1 | Answers are one-word or evasive ("Yes", "Please check my profile", "Will discuss in interview") |
| 2 | Everything answered but generically |
| 3 | Specific, short answers, consistent with the cover letter |
| 4 | Answers are specific and themselves carry proof or insight. They are not a pointless repeat of the cover letter |

**Upwork note:** it is reported that when the client opens a proposal, the answers to the questions are seen before the cover letter (README section 5). So an answer like "Please see cover letter" does serious damage.

**If the job post has no questions or instructions:** the criterion is "unknown" and its weight is spread (it does not become level 4).

**Feedback template:** "The job post asked for '{instruction}' and it is not in your proposal. Clients use exactly this instruction to filter who actually read the job post."

---

### 4.6 Call to Action (weight 5)
| Level | Anchor |
|---|---|
| 0 | Ends with no CTA, or an illegal CTA (an invitation to contact outside Upwork → `C1`) |
| 1 | A passive cliché ("Looking forward to hearing from you", "Hope to work with you") |
| 2 | A general invitation to talk ("Let me know if you'd like to discuss") |
| 3 | Proposes a specific, low-cost step (a short call on Upwork, sending a sample, a small paid audit) |
| 4 | A specific step + a smart question about the project that is easy to answer |

**Good example:** `Quick question before we start: is the 28 score from the homepage or a product page? If you share that here, I can tell you in chat which 2 apps I'd check first.`

---

### 4.7 Length and structure (weight 5)
| Level | Anchor |
|---|---|
| 0 | One very long block with no paragraphs, or just one line |
| 1 | Too long for this job post (wordy, repetitive) or too short for a complex job post |
| 2 | Appropriate length but a cluttered structure |
| 3 | Short, scannable paragraphs |
| 4 | Length proportional to the complexity of the job post, without a single extra sentence |

**Length default** "[coach judgment]": 80 to 150 words for a simple job post, up to about 250 words for a complex or expensive one. These numbers are not a hard rule, and the tool flags only when the text is more than 1.5 times or less than half of this range.

---

### 4.8 Tone (weight 5)
| Level | Anchor |
|---|---|
| 0 | Begging, flattery or pressure ("Please give me a chance, I really need this job"), or a belittling tone about the client's previous work |
| 1 | Too formal and stiff ("Respected Sir, Kindly…"), or exaggerated |
| 2 | Neutral and polite |
| 3 | Professional and natural, like a colleague |
| 4 | Confident and on the client's level (a consultant, not an applicant), with a tone consistent with the job post's tone |

**Note specific to Persian-speaking students:** translating Persian courtesy formulas ("I would be honored", "Kindly", "Dear Sir") is common and makes the tone "subordinate". The tool must show a replacement with an example.

---

### 4.9 Grammar and language (weight 5)
| Level | Anchor |
|---|---|
| 0 | Errors that impair understanding |
| 1 | Frequent errors (articles, verb tense, singular and plural) that look unprofessional |
| 2 | A few minor errors |
| 3 | Almost error-free |
| 4 | Error-free and fluent, with short, clear sentences |

**Rule:** the tool shows at most 5 important errors with corrections and summarizes the rest in one sentence. Minor issues (for example the Oxford comma) are not counted.

---

### 4.10 Cliché and AI-sounding text — authenticity (weight 10)
**What is measured:** this criterion does not ask "Was it written with AI?". The tool cannot detect that with certainty, and Upwork itself does not ban the use of AI. The question is: **"Does the text look generic and machine-made?"**, because the client sees dozens of similar texts every day.

**List of signs (extensible by the mentor):**
| Category | Examples |
|---|---|
| Clichéd openings | `I hope this message finds you well`, `I came across your job posting`, `I am writing to express my interest`, `Dear Sir/Madam` |
| Frequent AI words | `delve`, `leverage`, `seamless`, `robust`, `cutting-edge`, `tailored solutions`, `elevate`, `bring your vision to life`, `I'm thrilled/excited to` |
| Structure | Bold headings like "**Why choose me:**", bullets that are each just an adjective, rhythmic triplets ("fast, reliable, and scalable"), heavy use of em-dashes, a closing that restates the job post |
| Hollow claims | `100% satisfaction guaranteed`, `I am the perfect fit`, `highly skilled professional`, `top-notch quality` |
| Inconsistency | Very polished English in the cover letter next to error-ridden answers to the questions (the client notices) |

| Level | Anchor |
|---|---|
| 0 | 5 or more signs, or a fully templated AI structure |
| 1 | 3 to 4 signs |
| 2 | 1 to 2 signs |
| 3 | No clear signs, but no personal voice |
| 4 | A human, distinct voice; details that only someone who did the work would know |

**Feedback template:** "These phrases make the text look like hundreds of other proposals: {list of quotes}. The problem is not using AI; the problem is that the text has nothing that only you could say. Instead of '{quote}', write: '{specific replacement}'."

> "[coach judgment]" The list of signs must be editable in the admin panel. The founder probably knows the common phrases of their own students better.

---

## 5. Calculation and final verdict
1. Check the critical errors (section 3).
2. For each criterion, assign a level from 0 to 4 or "unknown".
3. Score = sum of (weight × level ÷ 4). Spread the weight of unknown criteria proportionally among the rest.
4. Apply the lowest active cap.
5. Take the verdict from the table below.

| Score | Verdict | Meaning for the student |
|---|---|---|
| 85 to 100 | `ready` — ready to send | Optional fixes |
| 70 to 84 | `minor_fixes` — send with minor fixes | 1 to 3 quick fixes |
| 50 to 69 | `revise` — rewrite the weak parts | Usually the hook and proof |
| Below 50 | `rewrite` — do not send | A fundamental rewrite |
| Any score with `C1` | `do_not_send` | Red line |

> "[coach judgment]" The boundaries 85, 70 and 50 are defaults. After calibration with 20 to 50 real samples (founder's question 5), they must be adjusted so that the tool's verdict matches the founder's verdict in at least 80% of cases.

**Prioritizing the "top 3 fixes":** sort the criteria by `weight × (4 − level)` and take the top three. A critical error always comes first.

## 6. Output format (for ai-engineer)
```json
{
  "tool": "proposal_review",
  "rubric_version": "0.1",
  "platform": "upwork",
  "overall_score": 0,
  "verdict": "ready | minor_fixes | revise | rewrite | do_not_send",
  "confidence": "high | medium | low",
  "critical_flags": [
    {"code": "C1_off_platform", "evidence": "<exact quote>", "message_fa": "..."}
  ],
  "criteria": [
    {
      "id": "hook",
      "weight": 20,
      "level": 0,
      "weighted_score": 0,
      "evidence": ["<exact quote from proposal>"],
      "feedback_fa": "...",
      "fix_example_en": "<optional, one sentence, placeholders for missing facts>"
    }
  ],
  "top_fixes_fa": ["...", "...", "..."],
  "strengths_fa": ["<1-2 real strengths, with evidence>"],
  "missing_inputs": ["student_profile_summary"],
  "coach_review_suggested": false
}
```
Output validation rules: `level` must be an integer from 0 to 4 or `null`; for every `level ≤ 2` at least one `evidence` must be given; `fix_example_en` must not contain any number or client name that is not in the input (a placeholder `[...]` is allowed).

## 7. Behavioral notes for the prompt
- First state one real strength (if there is one), then the 3 fixes. Do not invent praise.
- Do not deliver a fully rewritten proposal. If the user explicitly asks, write at most the hook and one sample paragraph and remind them that it must have their own voice.
- Comment on the proposed rate (`bid`) only if it was given, and briefly and separately from the score. Pricing has its own tool (the rate calculator, later).
- Do not make the student's country, name or English level a reason for a negative score. Assess only the text itself.

## 8. Calibration points (where the founder's judgment goes)
| # | Item | My default | Who decides |
|---|---|---|---|
| 1 | Weights of the ten criteria | Table in section 4 | Founder |
| 2 | Verdict boundaries (85/70/50) | Section 5 | Founder after calibration |
| 3 | Appropriate length | 80 to 150 words, up to 250 for a complex job post | Founder |
| 4 | Offering free work (C5) | Always negative | Founder |
| 5 | List of cliché and AI-sounding phrases | Section 4.10 | Founder and mentors (extensible) |
| 6 | Suggested proposal structure (for example Hook ← diagnosis ← proof ← plan ← question/CTA) | This same order | **The founder's own method**; if they have their own template, the criteria must be aligned with it |
| 7 | Whether asking the client a question at the end is "required" or "extra credit" | Extra credit (CTA level 4) | Founder |
| 8 | A beginner with no portfolio: allowed to apply, or referred to building a sample | Referral | Founder + curriculum-designer |

## 9. Generalizing to other platforms
| Criterion | General? | Difference on other platforms |
|---|---|---|
| Hook | General | In **direct outreach** (email or LinkedIn) the email subject and the first line play the role of the hook. In a **Fiverr Brief** the reply is short and the hook must be in the first sentence |
| Personalization | General | In outreach there is no job post; personalization is based on research into the client's business (site, product, observable problem). The substitute input for `job_post` is a "client research note" |
| Focus on the problem | General | — |
| Proof | General | On Fiverr, an important part of the proof is in the gig itself (portfolio and reviews), and the Brief reply is shorter |
| Job post questions and instructions | Upwork-specific (and job-post-based marketplaces) | Does not exist in outreach → "unknown". In a Fiverr Brief, check whether all items of the Brief were answered |
| CTA | General | More important in outreach and must be **low-friction** (a yes/no question or an offer to send a short audit), not a "30-minute meeting" |
| Length | General, with a different range | Cold outreach: shorter (about 50 to 125 words) "[coach judgment]" |
| Tone, grammar, authenticity | General | — |
| `C1_off_platform` | Marketplace-specific | In direct outreach, direct communication is natural and this error is disabled. Fiverr also has similar rules that must be checked separately (unconfirmed) |
| Two-line preview | Upwork-specific | — |

**Summary:** 8 of the 10 criteria are general. For `platform=direct_outreach` the weight of `requirements` becomes zero and is added to `personalization` (+5) and `cta` (+5) "[coach judgment]". The mechanism of Fiverr Briefs (a limited algorithmic invitation instead of free choice of job posts) was confirmed only from third-party sources ([aiproposer](https://aiproposer.com/learn/what-is-fiverr-buyer-request), October 2026) and must be rechecked before a Fiverr mode is built.

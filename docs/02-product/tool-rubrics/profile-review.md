# Profile Review Rubric — Light Version

> upwork-domain-expert — Phase 1 — 27 Mehr 1405 (2026-10-19) — v0.1 (short; priority P1)
> The shared conventions are in `README.md` in this folder. It does not have an evaluation set yet; one will be built after real student profiles are received.

## 1. Purpose and the major 2026 change
The goal is for the student to understand why their profile does not bring views or Invites, and which 3 fixes matter most.

**Major change:** according to the Upwork help page, **Specialized Profiles were removed on 28 May 2026**. The main profile is now "dynamic" and Upwork shows each client the relevant sections ([Upwork Help 115013750068](https://support.upwork.com/hc/en-us/articles/115013750068), from search result text, October 2026; the page returned 403). According to third-party sources, the headline and Overview of specialized profiles were not carried over ([GigRadar 009](https://gigradar.io/newsletter/issue-009)).
**Consequence for the rubric:** instead of "Specialized Profiles", the criterion "niche focus and coherence within one profile" is used. If the student still talks about a specialized profile, the tool explains that it was removed and that its valuable content should be moved to the main profile.

## 2. Input
`title`, `overview` (full text), `skills` (list), `hourly_rate`, `portfolio` (title + description of each sample + its type: real client work, personal project or practice), `photo_checklist` (self-reported; images are not analyzed in the MVP), `employment_history` and `certifications` (optional), `target_niche` and `stage` (from the student's record), `niche_rate_samples` (optional: the rates of a few competitors that the student looked up manually).

## 3. Critical errors
| Code | Error | Effect |
|---|---|---|
| `P1_contact_info` | Email, phone, messenger ID or contact link in the headline, Overview or portfolio | Cap 30; red-line warning |
| `P2_false_claim` | A claim inconsistent with the student's record (years of experience, clients, someone else's work samples) | Cap 40; `coach_review_suggested=true` |
| `P3_no_portfolio` | Zero portfolio items | Cap 55 |

The tool makes no suggestion about **country, identity or location** other than "write the real information" (README, red lines).

## 4. Criteria
| # | Criterion | Weight | Level 0 | Level 2 | Level 4 |
|---|---|---|---|---|---|
| 1 | **Headline** | 15 | Generic job title ("Web Developer", "Freelancer", "Graphic Designer & Video Editor & Writer") | A specific niche but no audience or result ("Shopify Developer") | Niche + audience or result, using words the client searches for ("Shopify Speed & Theme Developer for DTC Brands") |
| 2 | **Overview — first lines** (about 200 characters before "Read more"; number from third-party sources, unconfirmed) | 15 | "Hello, my name is… I am a passionate…" | States the field but is about "me" | Starts with the target client's problem or result, and the niche is clear within these lines |
| 3 | **Overview — body** | 15 | A list of skills or AI-sounding text (the same signs as `proposal-review.md` section 4.10) | Services are stated but there is no proof or process | Specific services, proof (real result or number), method of work, and a CTA inviting contact |
| 4 | **Portfolio** | 20 | None, or unrelated to the niche | A few related samples without a description of the problem and result | 3 to 6 samples **related to the niche**, each with problem ← work done ← result. Practice samples are honestly labeled |
| 5 | **Skills** | 10 | Unrelated or scattered | Related but incomplete or in a poor order | All skills relate to the niche, the most important come first, and the terms clients write in job posts are used. The maximum count is set by Upwork (reports say 20; unconfirmed) |
| 6 | **Rate** | 10 | Far below the niche range (a sign of low quality) or far above the level and proof available | Within the range, but unrelated to strategy | Matches the student's stage and the rate samples they collected from the niche, and has a plan for raising it |
| 7 | **Photo** (self-reported) | 5 | No photo, a logo, a group photo, or a photo that does not belong to the account owner | A real photo but of poor quality | A real photo of the account owner, clear face, good light, simple background, professional appearance |
| 8 | **Niche coherence** (replaces Specialized Profiles) | 10 | Headline, Overview, skills and portfolio each show a different field | The main niche is clear but some sections are scattered | All sections tell one story. Adjacent services (for example "Shopify design + development") come under one niche, not as unrelated fields |
| | **Total** | **100** | | | |

Levels 1 and 3 are intermediate states. Score calculation, caps and incomplete data follow the README.

**Rate rules:** the tool does **not** suggest a rate number from memory. It takes the niche range from `niche_rate_samples` (which the user collected manually) or from the mentor's settings. If neither exists, criterion 6 is "unknown" and the tool explains how to manually look at 5 to 10 competitor profiles of the same level (without scraping). Reminder: the Upwork service fee is variable (0 to 15%) and is shown before the proposal is sent; the profile rate is before the fee is deducted.

**Unweighted items (checklist):** employment history, certifications, intro video, language level, whether availability is up to date. The tool only reports whether they exist.

## 5. Verdict and output
| Score | Verdict |
|---|---|
| 80 to 100 | `strong` — the profile is ready; focus on jobs and proposals |
| 60 to 79 | `improve` — 2 to 3 specific fixes |
| Below 60 | `rebuild` — rebuild the profile before applying more |

The output has the same structure as `proposal-review.md` section 6 (`tool: "profile_review"`). A rewrite is limited to **headline suggestions (at most 3 options)** and **the first lines of the Overview**, with placeholders for facts that are not in the input. A full Overview is not written.

## 6. Calibration points
| # | Item | My default |
|---|---|---|
| 1 | Weights | Table in section 4 |
| 2 | Appropriate number of portfolio items | 3 to 6 related |
| 3 | Rate strategy for a beginner (start low and raise quickly, or start in the middle of the market) | Depends on the founder's method; **until this policy is decided, the tool only asks questions about whether the rate is high or low** |
| 4 | The Overview template the founder wants (for example problem ← solution ← proof ← process ← CTA) | This same order |
| 5 | Verdict boundaries (80/60) | Section 5 |
| 6 | A student with two genuinely different fields, now that Specialized Profiles are removed | Choose one main field; the final decision is the mentor's |

## 7. Generalizing to other platforms
| Upwork criterion | Fiverr (Gig) | LinkedIn and personal site (direct clients) |
|---|---|---|
| Headline | Gig title ("I will…") + tags | LinkedIn Headline; the homepage title of the site |
| Overview | Gig description + FAQ | The About section; the services page |
| Portfolio | Gig images and video, portfolio | Featured, case study on the site |
| Rate | **Packages** (Basic/Standard/Premium) instead of an hourly rate; a new criterion, "clarity of each package's scope", is needed | Usually not in the profile; evaluated in a price quote |
| Skills | Gig tags | Skills |
| Photo | Profile photo + Gig cover image (higher weight, because it is seen in search results) | Photo + banner |
| Niche coherence | Each Gig is one service; coherence across Gigs | Headline, About and posts |

**Common:** niche coherence, first lines about the client's problem, portfolio with problem ← result, authenticity of the text, and the red lines (false claims, real identity). **Upwork-specific:** the dynamic profile, character limits, hourly rate, and the ban on contact information. The Fiverr mechanisms in this table are from general knowledge and must be confirmed against official sources before a Fiverr mode is built.

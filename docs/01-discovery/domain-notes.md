# Upwork domain notes — Phase 0 (discovery)

> Author: upwork-domain-expert — 27 Mehr 1405 (19 October 2026)
> Reliability status: most figures come from secondary sources (2026 blogs); Upwork's official pages (support.upwork.com and upwork.com/pricing) returned 403 to WebFetch during the review. Any figure marked with "⚠" must be checked manually against Upwork's official page before being used in the product.
> The full tool rubrics are Phase 1 work and are not included here.

---

## 1. Current state of Upwork (2026) that affects students

| Topic | Current state (as far as confirmed) | Source and date | Confidence |
|---|---|---|---|
| Connects price | $0.15 per Connect, no volume discount; purchased Connects expire after 12 months | [golance, 23 June 2026](https://golance.com/blogs/upwork-fees-explained-2026); [aiproposer, 2026](https://aiproposer.com/learn/upwork-connect-price-2026) | Medium-high (several sources agree) |
| Free Connects | A Basic account gets about 10 Connects per month | golance (June 2026); [unilink, 2026](https://www.unilink.us/blog/upwork-connects-explained-2026) | Medium ⚠ |
| Cost per proposal | Dynamic, usually 2 to 16 Connects or more, depending on budget and demand. Figures from different sources do not match | [snipework, 2026](https://snipework.com/answers/how-many-connects-do-upwork-proposals-cost); [aiproposer economics, 2026](https://aiproposer.com/learn/upwork-connects-economics-2026) | Medium ⚠ |
| Proposal Boost | It is auction-based and costs extra Connects. Reported figures vary widely (from 1 to 100 extra Connects). There are reports that clients skip Boosted rows | unilink and snipework (2026) | Low ⚠ |
| Freelancer Plus | About $19.99 per month (one source says $14.99). Sources report its monthly Connects as 60, 80 or 100. Upwork itself, in its 2026 guide, mentions "100 monthly Connects" and full access to Uma | [Upwork cover letter guide, 2026](https://www.upwork.com/resources/cover-letter-tips); golance | Medium ⚠ |
| Freelancer fee | Since 1 May 2025 it is **variable, between 0 and 15%**, replacing the old tiered 20/10/5% model. The rate is shown before submitting a proposal and stays fixed for the duration of the contract. The reported average is about 10 to 13% | golance (June 2026); [gigradar market report 2026](https://gigradar.io/blog/upwork-market-report-2026) | Medium-high |
| Withdrawal | ACH free, Wire about $30, PayPal with no fee on Upwork's side. For a user residing in Iran, none of these routes is permitted (section 4) | golance (June 2026) | Medium ⚠ |
| JSS | Calculated from contract outcomes and feedback (public and private). Not shown before the first few contracts | General domain knowledge | ⚠ The exact formula is not public |
| Top Rated | JSS of at least 90% in 13 of the last 16 weeks, complete profile, up-to-date availability, 12-month earnings of at least $1,000, healthy account, and a first project older than 90 days. Evaluated every two weeks | [support.upwork.com/17932660179475](https://support.upwork.com/hc/en-us/articles/17932660179475); [Upwork talent badges](https://www.upwork.com/resources/talent-badges-explained) (both from search-result text, October 2026) | High |
| Top Rated Plus | All Top Rated requirements, 12-month earnings of more than $10,000, and one large contract with no negative outcome | Same sources | Medium-high |
| Rising Talent | For promising newcomers and has no JSS requirement. The exact criteria (profile completeness, activity, early track record) were not found in official sources | [raenest](https://www.raenest.com/blog/upwork-badges), secondary | Low ⚠ |
| ID Verification | Government ID card, and if needed a visual check (video call or photo). The identity-verified badge can also be obtained optionally for 35 Connects. Submitting proposals without verification is possible, but Upwork can make it mandatory at any time | [support.upwork.com/360001176427](https://support.upwork.com/hc/en-us/articles/360001176427); [Upwork Community](https://community.upwork.com/t5/Support-Forum/Identity-ID-Verification/m-p/1237862) | Medium |
| Uma (Upwork's AI) | Since summer 2025, tailored proposal drafts are available to everyone (Basic with limits, Plus unlimited). Instead of bid visibility, Plus gives real-time "proposal insights". **Client side:** Uma ranks proposals and can conduct the initial interview on the client's behalf. In spring 2026 Uma expanded as an "AI work agent" and the marketplace was redesigned for SMBs | [Upwork Summer 2025](https://www.upwork.com/blog/updates-summer-2025); [Investor release, 5 May 2026](https://investors.upwork.com/news-releases/news-release-details/upwork-updates-spring-2026-ai-powered-innovations-help-small); [Upwork evolves Uma](https://investors.upwork.com/news-releases/news-release-details/upwork-evolves-uma-ai-ai-work-agent-advances-human-ai) | Medium (I could not read the 2026 details) |
| "Upwork Now" | There is a report of a pilot in the July 2026 ToS, with simultaneous invitations and Connect consumption for proposals submitted via an agent. The third-party source later removed this clause | [conductatlas, updated 12 October 2026](https://conductatlas.com/platform/upwork/upwork-terms-of-service/upwork-now-connects-consumed-for-proposals-submitted-via-agent/) | Low ⚠ |
| Market | Scattered reports of fiercer competition (agencies with multiple profiles consuming thousands of Connects per week) and of declining proposal visibility | [snipework, July 2026](https://snipework.com/news/upwork-visibility-concerns-2026) | Low (anecdotal) |

**Conclusion for the product:** because Uma writes proposals and the client side also ranks proposals, our tool should not be yet another "proposal writer". Our value is in **judgment**: should I apply, what made the text generic and AI-like, and what the coach thinks.

### Restrictions for Iranian users (facts and risks only)

| Topic | Fact | Source | Risk for the student and the platform |
|---|---|---|---|
| Sign-up | According to the Upwork Help Center, individuals and businesses residing in Iran (and North Korea, Cuba, Crimea and a few other regions) **are not allowed to sign up for or use the platform**. Upwork also does not work with individuals on the SDN list | [support.upwork.com/211067778](https://support.upwork.com/hc/en-us/articles/211067778) (text from search result, October 2026; the page did not open directly) | Operating from inside Iran violates Upwork's rules |
| Permanent suspension | Someone who has been suspended once cannot work again, and their new accounts get closed | Same | Loss of track record, badges and income |
| Verification | KYC requires an identity document, face matching and sometimes proof of residence. Domestic media advertise "intermediary verification" services | [Taadol newspaper, Khordad 1404](https://www.taadolnewspaper.ir/fa/news/342303/) (advertorial) | Using other people's identity or documents is a serious violation with high legal and financial risk. Our platform must not introduce or advertise it |
| Withdrawing money | International payment networks (PayPal, Payoneer, Wire) are subject to sanctions. Reports describe complexity and losses in transferring money | [Iran International, February 2026](https://www.iranintl.com/en/202602138463) | Funds frozen inside the account, intermediary costs |
| Internet disruption | Internet outages were reported in 2026 that affected on-time delivery | Iran International (February 2026) | Delivery delays, negative feedback and a drop in JSS |

> Most students are probably facing these same risks. This is also **the main business risk**. The platform's legal and ethical position on this issue is the founder's decision (question 1).

---

## 2. Student pain map

| Stage | Common reasons for failure | Signal the coach sees |
|---|---|---|
| Niche | Too broad ("Web Developer"), choosing by trend instead of real skill, saturated niche with low rates, ignoring real demand | Applying to unrelated jobs, profile with no direction |
| Profile | Title and Overview about "me" instead of the client's problem, no relevant portfolio, rate too low or too high, not using Specialized Profile, weak photo, incorrect English | Profile views happen but no Invites come |
| Finding jobs | Applying to old jobs with many proposals, clients with no history or no payment verified, missing scam signals, wasting Connects and Boosting carelessly | Lots of Connects spent and a response rate of almost zero |
| Proposal | Clichéd first two lines ("Dear Sir, I am expert…"), template-like and AI-like text, not answering the job post's questions, focus on the résumé, no CTA, inappropriate length | Viewed but no reply |
| Interview | Not prepared, weak spoken English, not asking discovery questions, on-the-spot pricing, and since 2026 an initial interview with Uma | Interviews happen, contracts don't |
| Delivery | Scope creep, weak communication, delays (including due to internet outages), working without milestones, moving communication off-platform | Average feedback and a drop in JSS |
| Growth | Not raising rates, not getting long-term contracts, ignoring JSS, not following up with previous clients | Flat income and not reaching Top Rated |

---

## 3. Tool opportunities (all with input the user pastes, no scraping)

| Tool | Problem it solves | Input | Value for the student | Build difficulty | MVP priority |
|---|---|---|---|---|---|
| **Job review** | Don't spend Connects and time on bad jobs and scams | Job post text + client fields (verified, total spend, hire rate, number of proposals, interviewing, posting time) copied into a structured form + the student's short profile | High, daily and frequent | Low to medium (rules + LLM) | **P0** |
| **Proposal review** | Find weaknesses in the hook, personalization, proof and CTA, and signs of AI-like text | Job post + proposal text | Very high; the main bottleneck | Medium (quality of Persian feedback and calibration) | **P0** |
| **Profile review** | Why Invites and views don't come | Title, Overview, skills, rate, portfolio descriptions (text) | High, but infrequent (once per cycle) | Low | **P1** (or a light P0) |
| **Niche finding** | Choose a niche based on data, not guesswork | Questionnaire + data the student collects from Upwork search themselves (number of jobs, budgets, competitors' rates) | High at the start | Medium to high (we have no market data; quality depends on user input) | **P1** |
| Interview preparation | Practice likely questions and discovery based on the job post | Job post + submitted proposal | Medium to high | Low | P2 |
| Rate and project price calculator | Pricing based on the variable fee and real hours | Target rate, hours, contract fee percentage | Medium | Very low (no LLM) | P1 (cheap) |
| Connects and funnel tracker | See the conversion rate: apply → viewed → interview → contract | Manual logging of each application | High for the coach and mentor (follow-up data) | Low | **P0/P1**, because it also feeds data to mentor follow-up |
| Draft follow-up and post-interview messages | Missed follow-ups | Conversation summary | Medium | Low | P2 |
| Client message and offer review (anti-scam) | Detecting requests for payment or off-platform contact and free tests | Message text | High for newcomers | Low | P1 (can be part of job review) |

**MVP proposal:** proposal review + job review (with scam detection) + funnel and Connects tracker. As the next step, profile review, rate calculator and niche finding.

---

## 4. Red lines (Upwork ToS and platform principles)

| Red line | Explanation | Source |
|---|---|---|
| Scraping or automating Upwork | Tools never automatically read any data from Upwork, never log in, we don't build a browser extension that reads the page, and they never submit proposals automatically | CLAUDE.md; Upwork ToS ⚠ (exact clause not seen) |
| Off-platform communication or payment (Circumvention) | We give no template or advice for sharing contact details before a contract or receiving money outside Upwork. The only permitted route is "contract conversion" by paying the fee. Consequence of violation: loss of badges and permanent account closure | [Upwork Help: circumvention](https://support.upwork.com/hc/en-us/articles/360052511133); User Agreement section 7 |
| Multiple accounts, renting or buying accounts | Not recommended or introduced | Upwork ToS ⚠ |
| Bypassing verification and fake or rented identities | The platform does not introduce, teach or advertise any way to do it, and does not allow such content in the mentors' Q&A section either | Upwork Help (sanctioned countries) |
| Lying on the profile | We don't fabricate history, portfolio or position. The profile tool only expresses what is real better | Professional principle |
| Mass AI proposals | The tool does not generate complete proposals ready for mass submission; its focus is review and improvement. Upwork itself recommends disclosing AI use to the client | [Upwork cover letter guide, 2026](https://www.upwork.com/resources/cover-letter-tips) |
| Income guarantee claims | The platform's marketing does not promise guaranteed contracts or income | Professional principle |

---

## 5. Domain questions for the founder

1. What is the platform's official position on the fact that Upwork prohibits sign-up from Iran? Should we design the training to be "platform-agnostic" (Upwork and competitors such as Contra, Fiverr and regional marketplaces) so that business risk does not depend on a single platform?
2. At which stage do students currently get stuck the most (profile, unanswered applications, interview)? Do you have statistics from previous students?
3. Do you have your own framework or checklist for evaluating jobs and proposals that should become the basis for the rubrics?
4. Do you have some real examples (with personal information removed) of students' successful and unsuccessful proposals and good and bad job posts, so we can build the tools' evaluation set?
5. Which niches and levels are students mostly in (complete beginners or with technical skills)? And do they buy Freelancer Plus or not? (This affects the Connects strategy.)
6. At which stages should mentors step in: manual review of tool output, or only answering questions?

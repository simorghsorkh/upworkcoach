# Risks — UpworkCoach

> Phase 0 — 27 Mehr 1405 (2026-10-19). Likelihood/impact: L=low, M=medium, H=high. This document is not legal advice; legal items must be reviewed by a specialist.

## Overview (11 main risks)
| # | Risk | Category | Likelihood | Impact | Suggested owner |
|---|---|---|---|---|---|
| R1 | LLM API access is cut off or blocked | Sanctions/technical | H | H | software-architect, ai-engineer |
| R2 | Paying the LLM provider and foreign servers | Sanctions/financial | H | H | founder |
| R3 | The product violates Upwork's ToS | Legal | M | H | product-strategist |
| R4 | The product becomes associated with students' illegitimate accounts | Legal/reputational | H | M | founder |
| R5 | Dependence on mentors | Operational | H | H | founder |
| R6 | Dollar volatility and margin erosion | Financial | H | M | product-strategist |
| R7 | Wrong/generic AI feedback and loss of trust | Product | M | H | ai-engineer |
| R8 | The student's real bottleneck is elsewhere (account, money, language) | Market | M | H | product-strategist |
| R9 | Internet disruption in Iran / filtering | Technical | H | M | devops-engineer |
| R10 | Commoditization by Uma and cheap tools | Market | M | M | product-strategist |
| R11 | The whole business depends on Upwork, while Upwork prohibits registration and use by residents of Iran and a suspended account does not come back (see `domain-notes.md` section 1) | Platform/market | H | H | founder |

## 1. Sanctions
| Risk | Description | Mitigation |
|---|---|---|
| **R1 — LLM access** | Since July 2024 OpenAI has blocked API traffic from unsupported countries (including Iran) ([The Decoder](https://the-decoder.com/openai-to-restrict-api-access-for-unsupported-countries-in-july/)). According to secondary sources, Iran is not on Anthropic's list of supported regions either (not confirmed from the official page). A relay server outside Iran solves the network problem but **does not solve the "who is the customer" question or the provider's terms of use**. | (1) An LLM abstraction layer so the provider can be swapped; (2) a legal review of the structure (a company/entity outside Iran?); (3) fallback options: Iranian intermediaries (e.g. AvalAI — claims access to hundreds of models, [Digiato](https://digiato.com/promoted/avalai-platform-services); price and stability not checked) or an open-source model on a rented server; (4) a Persian-quality evaluation of every alternative. |
| **R2 — Payment** | Paying the LLM provider and foreign hosting requires a foreign-currency card/account. | The founder's answer (question 5); a prepayment budget; a rial-based intermediary as a fallback. |
| **R2b — Domestic gateway** | Iranian gateways (Zarinpal, etc.) usually require a trust symbol (enamad)/business documents (1405 details not checked). | Start the enamad/gateway process now; in the MVP, manual/card-to-card payment as a temporary measure. |
| **R2c — US sanctions policy** | In August 2026 OFAC suspended several Iran general licenses and in September reported a "presumption of denial" policy for specific licenses ([Expeditors](https://info.expeditors.com/newsflash/us-announces-new-sanctions-on-iran-suspends-general-licenses), [MLex](https://www.mlex.com/mlex/financial-crime/articles/2523970/us-tightens-iran-sanctions-licensing-policy-fine-for-violations)). Whether GL D-2 (communications/software services) was affected **was not confirmed**. | Monitoring; an architecture that allows US services to be swapped quickly. |

## 2. Upwork ToS
| Risk | Description | Mitigation |
|---|---|---|
| **R3 — Automation** | Upwork's official guide treats any script, extension or third-party service that "automatically sends requests, collects data, or acts faster/more than a human" as a bot; advertising "built for Upwork" does not mean endorsement; penalties range from a warning to a permanent ban ([Upwork Help](https://support.upwork.com/hc/en-us/articles/43342677368467-Use-bots-and-other-automation-properly)). Writing proposals with AI, provided a human reviews and sends them, is considered permitted according to secondary sources. | **Product rule:** manual paste only; no browser extension on Upwork pages; no scraping; no automatic sending; no bulk storage of postings; the tool provides "critique and teaching", not "ready-to-send proposals in bulk". |
| **R4 — Students' accounts** | Upwork has stated that it blocks users inside Iran by IP and name screening ([Upwork, letter to the SEC 2018](https://investors.upwork.com/node/8666/html)). Competing courses sell "accounts and infrastructure" under an identity that is not the user's own. If students work with an illegitimate account, they may be banned overnight and the outcome of the training is zero; the platform also becomes reputationally/legally involved. | The platform offers **no** account creation/sale services and does not refer to them in content; the founder's position on this must be clarified (question 4); teaching alternative platforms/direct clients as risk coverage. |
| R3b — User data | The text of job postings and proposals may contain client information. | Data minimization, no use for model training, a deletion policy (with security-reviewer). |

## 3. Dependence on mentors (R5)
| Aspect | Risk | Mitigation |
|---|---|---|
| Capacity | Student growth requires mentors linearly → bottleneck and SLA decline | AI as the first layer of response; the mentor only edits/approves; SLA and a transparent queue |
| Quality | Inconsistent answers, contrary to the founder's method | Rubrics and a standard answer library; quality sampling by the founder; student ratings |
| Churn | A mentor leaving with the knowledge and relationships of students (or poaching them for personal work) | Full student history on the platform (not personal Telegram); a non-solicitation agreement; multiple mentors per student |
| Economics | Mentor pay is probably the largest variable cost | The mentor pay model (fixed/per answer/percentage) to be set in Phase 1 |
| Single point of failure | If the founder is the only source of the method | Document the method in rubrics and platform content |

## 4. Product and market risks
| Risk | Mitigation | Test |
|---|---|---|
| R6 — Dollar volatility | Seasonal pricing; indexed credit; quotas | Monthly monitoring of "AI cost / revenue" |
| R7 — AI quality | Rubrics from the coach's method; an evaluation set of 50 real samples; a "refer to mentor" button | AI critique agrees with the coach's critique ≥ 80% |
| R8 — Wrong bottleneck | Interviews and analysis of Telegram questions before Phase 1 | Categorize the 100 most recent student questions |
| R9 — Internet disruption | Lightweight frontend, hosting/CDN inside Iran + a relay server outside; queues and retries | Architecture decision in Phase 3 |
| R10 — Commoditization | Focus on critique + teaching + humans + follow-up, not text generation | Month-2 retention rate |
| Income claims | Competitors offer "income guarantees"; we must not make unsupported claims | Only real cohort statistics |

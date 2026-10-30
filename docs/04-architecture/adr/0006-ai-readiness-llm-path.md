# ADR-0006 — Readiness for the AI layer in 1.0: the general LLM call path (no implementation in 0.1)

- **Status:** Proposed. The details of the prompt, rubric, evaluation and model selection belong to the **ai-engineer**. This ADR only sets the path and the boundaries.
- **Date:** 27 Mehr 1405 (2026-10-19)
- **Author:** software-architect
- **Related:** ADR-0002 (hosting), ADR-0007 (queue), risks R1 and R2 in `01-discovery/risks.md`, assumption A4 and decision D8

## Context
- 1.0 adds the "Proposal review" and "Job review" tools: English input, Persian output, median response under 30 seconds, a per-user quota, and "on a service error, a clear Persian message and no quota deduction" (F13, F14, F17).
- The APIs of language models (Anthropic, OpenAI, etc.) are not reachable from an Iranian IP (R1).
- With ADR-0002, the 0.1 server is **outside Iran** (Azure). But it may someday be moved to an Iranian host.

## Possible LLM call paths
| Path | When the server is on Azure | When the server has moved to Iran |
|---|---|---|
| **P1. Direct:** app server → provider API | **Works network-wise.** The simplest path | Does not work network-wise |
| **P2. Our own relay:** Iranian server → a small relay outside Iran (a stateless container with authentication and an allow-list) → provider API | Not needed | The main path. Does not work during an international outage, unless the Iranian server is on the allow-list (**not confirmed**) |
| **P3. An Iranian rial-based intermediary** with an OpenAI-compatible API (e.g. AvalAI, which claims access to many models; its price, stability and privacy were **not checked**; `risks.md` R1) | Possible, but the Iranian service may not accept requests from a foreign IP (**not confirmed**) | Possible; answers D8 (rial payment) |

**Legal warning:** P1 and P2 solve only the **network problem**. The provider's terms of use about the customer's location and identity (that the service is provided to users in an unsupported country) are not solved by a foreign server. That Iran is not on Anthropic's list of supported regions comes only from secondary sources and was **not confirmed from the official page** (`risks.md` R1). This ADR does not propose any way to circumvent the provider's terms. The decision about the account owner and the contract is for the founder and a legal advisor (open question).

## Decision
1. **An abstraction layer `LlmGateway`** in the `ai` module (built only in 1.0):
   ```ts
   interface LlmGateway {
     generate(req: {
       task: 'proposal_review' | 'job_review' | string;
       system: string; messages: Msg[];
       responseSchema?: JsonSchema; maxOutputTokens: number; timeoutMs: number;
     }): Promise<{ output: unknown; model: string; usage: { inputTokens: number; outputTokens: number }; }>;
   }
   ```
   Adapters: `anthropic` (P1), `openai-compatible` (P3 and many relays), `relay` (P2). Selected with `LLM_PROVIDER`, `LLM_BASE_URL` and `LLM_API_KEY`. **The tools' code does not depend on the provider.**
2. **The default 1.0 path on Azure: P1.** P3 as a backup adapter. P2 only if we move to Iran.
3. **Request flow (asynchronous, for weak internet):**
   ```
   POST /api/v1/ai/runs {tool, input}
     -> validation + deterministic non-LLM rules (e.g. scam flags in F14)
     -> quota check (reserve, not deduct)
     -> cache: hash(tool + rubric_version + model + normalized input) -> if present, return immediately
     -> ai_runs(status=queued) + pg-boss job 'ai.run'
     <- 202 { runId }
   worker: LlmGateway.generate with a timeout and 2 retries -> validate the output against the schema
     -> ai_runs(status=succeeded, output, usage, cost) + deduct the quota
     -> or failed: a Persian message and release the quota reservation (F13: "no quota deduction")
   GET /api/v1/ai/runs/:id   (polling every 2 seconds; SSE later)
   ```
   Polling was chosen over streaming because on an unstable internet connection, a dropped connection does not destroy the result.
4. **Cost limits:** a per-user quota (F17), rate limiting (e.g. 1 concurrent run and 10 per hour per user), a daily cap on total cost (the key `ai.budget` in settings; once exceeded, the tools are temporarily closed), and result caching.
5. **Privacy:** the input is exactly what the user pasted; there is no fetch or scraping (R3). Before sending, emails and phone numbers inside the text are removed by pattern (R3b). A provider that does not use API data for training is used (to be confirmed with the ai-engineer).
6. **Graceful degradation:** if the LLM is unavailable (outage, sanctions, budget cap), only the AI tools are disabled, with a Persian message. The 0.1 core (file, tasks, questions) has no dependency on `ai`. **Dependency direction: `ai` → core, never the reverse.**

## What 0.1 prepares from now (without AI code)
| Preparation | Where |
|---|---|
| Queue and worker infrastructure | pg-boss (ADR-0007) |
| Evaluation data: proposal + job post + coach critique + score + satisfaction | `submissions` and `reviews` (`data-model.md` 2-5) |
| Structured tool input (platform, job post text, proposal text) | The same `submissions` fields; the 1.0 tool has the same form |
| A place to refer AI output to a mentor | `question_threads` (a nullable `ai_run_id` column in 1.0) |
| A place for quota and AI runs | The 1.0 tables in `data-model.md` section 5; no 0.1 table changes |
| Reserved environment variables | `LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_API_KEY` |

## Consequences
- Choosing Azure (ADR-0002) simplifies the AI path in 1.0 (P1, no relay). If we move to Iran, only an adapter and a relay container are added.
- The **ai-engineer** must design against this contract, and if they need something more (e.g. streaming or multi-step tools), write a new ADR. The ai-engineer's output does not exist yet. There is no contradiction to resolve and this ADR is the starting point for coordination.

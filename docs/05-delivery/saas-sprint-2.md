# Coach Office Sprint 2 — Internationalization infrastructure

- **Date:** 6 Aban 1405 (2026-10-28)
- **Basis:** ADR-0013 (accepted; section "Reconciliation with the implementation")
- **Status:** Code and tests complete; **not run on production**; not committed.

## What was built
| Area | Summary |
|---|---|
| Page language | `next-intl` with no language prefix in the URL; the page's `lang` and `dir` come from the user's language (Persian: `rtl`, English: `ltr`) |
| Language selection | User preference ← organization default language ← this browser's `uc_locale` cookie (for the sign-in page) ← Persian |
| User preference | `user_preferences` table (migration 0007), `PATCH /api/v1/auth/preferences`, a "Language" card in "My account" |
| API errors | The text of every error code and the validation messages are in the catalog; responses in the request's language (`Accept-Language`); with no header, the same Persian as before |
| Formatting | `lib/format`: Persian = Jalali and Persian digits (same output as before), English = Gregorian and Latin digits; correct English singular and plural |
| Time zone | `lib/org-day` with a zone parameter; dates and "Today" shown in the organization's zone; Tehran and Amsterdam tests across DST changes |
| Extracted strings | Shell and navigation, Quick add, sign-in, forgot password, invite and recovery, "My account", password re-confirmation, "Today", task labels, tasks table, review queue, task filters |
| CLI | `pnpm org:create --locale en` (default `fa`) |
| CI | `scripts/ci-i18n-guard.mjs`: new Persian text outside the catalog and physical Tailwind classes (`ml-`, `text-right`, …) are rejected; legacy files are in `scripts/i18n-baseline.json`, which only shrinks |

## Tests
- Unit: new test `src/i18n/i18n.test.ts` (key and placeholder parity between fa and en, language detection, API errors in both languages), `src/lib/org-day.test.ts`, `src/lib/format.test.ts`.
- Integration: `tests/integration/i18n.test.ts` (language preference, cookie, English error, organization default language); `auth-flow` now also checks `locale` and `organization.timeZone`.
- The result of the full run at the end of this sprint is recorded in `docs/STATUS.md`.

## Running on production (founder's task)
Migration 0007 only creates a new table and does not touch existing data; the order is simpler than in Sprint 1:
1. If Sprint 1 has not gone to production yet, first the steps in `saas-sprint-1.md`.
2. `pnpm db:migrate` with the production `DATABASE_URL` (direct connection).
3. Deploy the new code to Vercel.
4. In "My account", switch the language to English and back to Persian, and check that the page's `dir` changes.

## Decisions and differences from the ADR
In ADR-0013, section "Reconciliation with the implementation". The most important:
- Messages that services still build in Persian are translated by a reverse lookup in the catalog; a message not in the catalog stays Persian.
- Moving services, health rules and jobs to the organization's time zone was postponed; all organizations are Tehran-based for now.
- Pages not yet extracted stay Persian in English (but with `dir="ltr"`); offering English requires extracting the rest.

## Remaining (Sprint 3 and later)
- Extract the task forms (create, submit, review, actions), task detail pages, student home and the remaining pages (174 files in the CI baseline).
- Persian service and contract messages to message keys.
- Gregorian date picker for English.
- Move the computation of "Today", deadlines and health rules to the organization's time zone.
- e2e tests of the extracted pages in both languages.

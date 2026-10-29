# ADR-0008 — Time, the Jalali calendar and Persian text (normalization and search)

- **Status:** Proposed
- **Date:** 27 Mehr 1405 (2026-10-19)
- **Author:** software-architect

## Context
- Display dates in **Jalali** and store in **UTC** (project requirement).
- Time rules (deadlines, "today", the check-in week, SLA business hours) must be interpreted in **Tehran** time, not server time (Azure runs on UTC).
- Persian input comes from different keyboards (Arabic `ي` and `ك`, Persian and Arabic digits, ZWNJ / half-space). Searching student names must work across these differences.
- English text (job posts, proposals, links) inside the RTL interface must be displayed correctly.

## Decision

### 1. Time
| Topic | Rule |
|---|---|
| Storage | `timestamptz` (UTC). A date without a time → `date` meaning "Tehran calendar day" |
| Time zone | Constant `Asia/Tehran` in `lib/jalali`. IANA tzdata is used and we do not assume daylight saving time manually |
| Display | `Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'Asia/Tehran', … })`. Native, needs no library. Identical on the server (Node 24 with full ICU) and in the browser |
| Date input | A Jalali date picker (chosen by frontend-engineer). The value sent to the API is a **Gregorian ISO date string** (`2026-10-22`) or an ISO instant with offset. **The API never accepts a Jalali string.** Conversion happens only on the client with `date-fns-jalali` |
| Task deadline | The user picks a day; the server sets `due_at` = that day at 23:59:59 Tehran time (converted to UTC) |
| "Today" | `[start of Tehran day, end of Tehran day)` via `lib/jalali.tehranDayRange(now)` |
| Week | Saturday to Friday. `week_start` = the Saturday of that week (Tehran) |
| Relative time | «۳ روز پیش» ("3 days ago"), «۲ ساعت مانده» ("2 hours left") via `Intl.RelativeTimeFormat('fa')` |
| Business hours | `lib/business-hours.elapsedBusinessHours(from, to, config)`: a pure, tested function based on `settings.business_hours` and a list of holidays (Tehran `date`s) |
| Forbidden | `Date#getDay()`, `getHours()` and `toLocaleDateString()` without `timeZone`. A lint rule or CI search rejects these outside `lib/jalali` |

### 2. Numbers
- Storage and API: Latin digits.
- Display: Persian digits via `Intl.NumberFormat('fa-IR')`. Mobile numbers and links go **inside an LTR block** with Latin digits (easier to copy).
- Input: every numeric and mobile field accepts Persian and Arabic digits and converts them to Latin before zod validation (`z.preprocess(toLatinDigits, …)`).

### 3. Persian text normalization (`lib/text-fa.normalize`)
Before storing name, tag, niche and question-subject fields, and before searching:
1. `ي` and `ى` → `ی`; `ك` → `ک`; `ۀ` → `هٔ` (unification)
2. Remove diacritics and tatweel (`ـ`)
3. Consecutive ZWNJs (half-spaces) → one; a ZWNJ next to a space is removed
4. Consecutive spaces → one; trim
5. Digits → Latin (only in `search_text`)

Long free text (notes, feedback, messages) gets only step 1 and trim. English text (job posts and proposals) is **left untouched**.

### 4. Search
- 0.1 only has search on the **student list** (name, mobile, messenger ID, tag; F2).
- Column `students.search_text` = `normalize(display_name + ' ' + phone + ' ' + messenger_handle + ' ' + tags.join(' '))`, which the app rebuilds on every update.
- Index: `GIN (search_text gin_trgm_ops)`. Query: `search_text ILIKE '%' || normalize(q) || '%'` (the trigram index makes it fast), ordered by `similarity()`.
- **Why not Postgres full-text search:** it has no ready-made Persian configuration (no stemmer). For names and tags, trigram is better. If 1.0 needs search over note and question text, the same pattern (normalized column + trigram) is extended. A separate search engine (Meilisearch, etc.) is not needed until there are more than a few thousand documents.
- **Persian alphabetical sorting:** lists are small. If the ICU collation `fa-x-icu` is available on the host, `ORDER BY display_name COLLATE "fa-x-icu"`; otherwise sort in the app with `Intl.Collator('fa')`.

### 5. Bidirectional text
- The user's English text (job post, proposal, profile title, link) is displayed in `<div dir="ltr" lang="en">` or `<bdi>` (PRD section 8).
- English input fields use `dir="ltr"`, and mixed fields (notes) use `dir="auto"`.

### 6. Reconciliation with implementation (aligned with the code, sprints 2 to 4; 30 Mehr 1405 (2026-10-22))
| Topic | What was built | Architecture verdict |
|---|---|---|
| Calendar library | `date-fns-jalali` was not used. `lib/jalali.ts` (sprint 4) does Jalali ↔ Gregorian conversion with its own breaks table, tested against `Intl` (persian calendar) for every day from 1395 to 1415; it has `parseAnyCalendarDay` and `jalaliMonthRange` and also works in the browser. `lib/tehran-day.ts` has the Tehran day, start/end of day, `addDays`, weekday and `jalaliDate`; `lib/business-hours.ts` has business hours and SLA | **Accepted.** No new dependency; the same code on server and client (date picker `components/ui/jalali-date-field.tsx`). The "Date input" row in section 1: conversion on the client with `lib/jalali`, not `date-fns-jalali`. The function names in section 1 (`lib/jalali.tehranDayRange`) correspond to the `lib/tehran-day` functions |
| **Jalali dates in imported CSV** (sprint 3 open question) | (Sprint 4) The deadline column in `POST /imports/students` accepts both Jalali (`1405/08/01`, also with Persian digits) and Gregorian (`YYYY-MM-DD`) via `parseAnyCalendarDay` | **Decision: a documented exception, and the only exception to the rule "the API never accepts a Jalali string".** Reason: the CSV file is written by the coach in Excel, not in our UI, so there is no place for a date picker. Scope of the exception: only date cells in the imported file; format detection is unambiguous (year ≥ 1700 → Gregorian, lower → Jalali); all JSON bodies remain Gregorian only |
| CSV export | (Sprint 3) Every date in two columns, Jalali and Gregorian (Tehran day) | Consistent with `api.md` section 13 |
| "Day" in `daysInStage` | (Sprint 2) Full 24-hour days, not Tehran day boundaries | Accepted; the same interpretation as ADR-0005 for thresholds. "`overdueDays`", by contrast, is a **Tehran calendar day** (the deadline day counter shown to the user) |
| Check-in week | (Sprint 4) `week_start` = Tehran Saturday; a submission on any day counts toward the current week | `data-model.md` 2-9 was corrected |
| Settings text normalization | (Sprint 4) `questions.expectedResponseText` is normalized on save (diacritics and tanwin removed) | Accepted; the same rule as section 3 |

## Consequences
- All time logic is centralized in two files (`lib/jalali`, `lib/business-hours`) with unit tests.
- If Iran reinstates daylight saving time, only a tzdata update in the image (Node) is needed.

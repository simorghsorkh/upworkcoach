# ADR-0013 — Multilingual foundation: Persian and English, RTL and LTR, locale-dependent formatting

- **Status:** Accepted (base implementation: Coach Office sprint 2)
- **Date:** 6 Aban 1405 (2026-10-28)
- **Source of requirements:** founder document item 10; `docs/08-saas-evolution/prd-coach-office.md` section 4; answer to Q6 (English is not needed for the pilot but will soon be needed for presenting to investors)
- **Effect on earlier ADRs:** ADR-0008 (time, the Solar Hijri calendar and Persian text) is **extended**: UTC storage and Persian text normalization stay the same; the fixed `Asia/Tehran` time zone becomes an organization-level setting.

## Context (from the code)
- `app/layout.tsx`: a fixed `<html lang="fa" dir="rtl">`. No i18n library is installed.
- About 2500 lines of Persian text in 227 files, including 119 messages in `server/http/errors.ts` and the zod messages in the `contracts.ts` files.
- Components use Tailwind logical classes (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`) and have no physical classes.
- `lib/jalali` and `lib/tehran-day` support only Persian and Tehran; the `timezone` setting is a `z.literal('Asia/Tehran')`.

## Options
| Option | Assessment |
|---|---|
| **A. next-intl** | Built for the App Router and Server Components; ICU format (plural, gender); no URL prefix required; accepted |
| B. i18next + react-i18next | Mature, but needs extra work with Server Components |
| C. Home-grown layer | Fewest dependencies, but we would have to build ICU and plurals ourselves; rejected |

## Decision: next-intl, with no locale prefix in the URL

### 1. Choosing the locale
Priority: `user_preferences.locale` ← `organizations.default_locale` ← `fa`. The locale is not in the URL (the app is behind login and has no SEO). If a public page is needed, an `/en` prefix can be added later.

```
user_preferences
  user_id PK, locale text ('fa' | 'en' | 'nl'), updated_at
```
The language is changed from the "My account" page. Active languages live in one constant (`SUPPORTED_LOCALES = ['fa', 'en']`); `nl` is enabled later by adding a message file.

### 2. Direction and font
- `<html lang={locale} dir={locale === 'fa' ? 'rtl' : 'ltr'}>`.
- Only Tailwind logical classes; a CI check blocks `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right` in `src/` (an exception is allowed with a comment).
- Directional icons (arrow, "next", "previous") use `rtl:rotate-180`.
- Vazirmatn also has Latin letters; for English the same font is enough in the pilot.

### 3. Messages
- `apps/web/messages/fa.json` and `en.json`, with a namespace for each area (`shell`, `auth`, `students`, `tasks`, `programs`, `errors`, `validation`, and so on).
- **Server errors:** instead of Persian text, `errors.ts` returns a **code** (such as `task.not_found`, `auth.locked` with a parameter). The API response is `{ error: { code, params, message } }`, where `message` is translated into the request's language; the frontend should prefer `code`.
- **zod:** one shared errorMap that turns the validation code into a `validation.*` key. The current custom messages (`'حداکثر ۲۰ لینک مجاز است.'` (Persian for "At most 20 links are allowed.")) become keys.
- **Plurals and numbers:** ICU format (`{count, plural, ...}`).
- System text stored in the database (such as the names of seeded stages, canned replies) counts as **organization content**, not user interface; it is not translated.

### 4. Formatting dates, times and numbers
A `lib/format` module is the only way to display dates and numbers:
| Locale | Calendar | Digits | Example |
|---|---|---|---|
| fa | Jalali (the existing `lib/jalali`) | Persian | ۶ آبان ۱۴۰۵، ۱۴:۳۰ (6 Aban 1405, 14:30) |
| en | Gregorian | Latin | Oct 28, 2026, 2:30 PM |
| nl (future) | Gregorian | Latin | 28 okt 2026, 14:30 |

- Storage is still `timestamptz` in UTC (ADR-0008).
- **The time zone comes from the organization** (`organizations.timezone`, IANA, default `Asia/Tehran`). The "end of day" of deadlines, working hours, holidays and "today" are computed in the organization's time zone. `lib/tehran-day` is generalized to `lib/org-day(timezone)`, and its existing tests give the same result with `Asia/Tehran`.
- Date input in forms: fa uses a Jalali picker, en uses a Gregorian picker; both convert to one ISO date.
- Number input: Persian and Arabic digits are still normalized to Latin (ADR-0008), in any locale.

### 5. User content
- **No automatic translation.** Program, task, note and message content is shown in the language in which it was written.
- `source_locale` is stored on `program_templates` and `program_runs` (ADR-0012) so that manual translation is possible in the future.
- Bidirectional text: user content is shown with `dir="auto"` (for example the English text of a proposal on a Persian page); names and short identifiers inside a sentence use `<bdi>`.

### 6. How strings are migrated (incrementally)
1. **Sprint 2:** installation and configuration; dynamic `lang` and `dir`; `user_preferences`; `lib/format`; the organization time zone; server error codes; the errorMap early; extraction of the shell, navigation, login and invitation, dashboards, tasks and the review queue.
2. **Later sprints:** every page that is opened for new features is extracted at that point. New pages have only message keys from day one.
3. **After the pilot (before presenting to investors):** a full `en.json` translation for the main pages and an English demo organization.
4. **CI rule:** a script (like `scripts/ci-no-server-actions.sh`) rejects **new** Persian text in `.tsx` files outside `messages/`; old files go on an exception list that can only shrink.

## Consequences
**Positive:** the layout is already ready for LTR; the main cost is extracting strings, which is spread out incrementally; coded errors are also useful for a future public API.

**Negative:** until extraction is complete, old pages stay Persian in English mode (not a problem for the pilot); the message bundle adds a little to page weight (split by namespace).

**Required tests:** e2e of the extracted pages in both languages (`dir`, dates, digits); tests for `lib/format` and `org-day` with two time zones (Tehran and Amsterdam, including the daylight-saving change); a test that every `fa.json` key exists in `en.json` (a missing key = CI failure, an untranslated string = warning).

## Alignment with the implementation (sprint 2, 6 Aban 1405 (2026-10-28))
- **Library:** `next-intl` 4.14.9 with no locale prefix in the URL. Configuration is in `src/i18n/request.ts`: locale = user preference ← organization default locale ← `uc_locale` cookie (pages outside the account) ← `fa`. Time zone = the organization's time zone.
- **`uc_locale` cookie:** set on login, invitation acceptance and language change (one year, HttpOnly) so that this browser's login page is also in the same language.
- **API errors:** the default text of each code is in `messages/*.json` (`errors.code`). The response language comes from the `Accept-Language` header, which the client sends from `<html lang>`. Persian text that services still build directly is translated by reverse lookup in the Persian catalog; text outside the catalog stays Persian (until extraction). zod messages are built in `issueMessage(issue, locale)` instead of a global errorMap, and the 422 fields are rebuilt for each locale.
- **Formatting:** `lib/format` (`createFormat(locale, timeZone)`); the Persian output is exactly the earlier `components/format/fa.ts` (which is now its fixed Persian/Tehran view). Components use `useFormat()` and server pages use `getFormat()`.
- **Time zone:** `lib/org-day` (all functions take a zone parameter) with Tehran and Amsterdam tests (23- and 25-hour days on daylight-saving change days). `lib/tehran-day` is now its fixed Tehran view. **Moving services, health rules and jobs to the organization time zone was deferred**: all organizations are Tehran-based for now; the first non-Tehran organization makes this work a prerequisite.
- **Switching language:** a "Language" card in "My account" (`PATCH /api/v1/auth/preferences`, the `user_preferences` table, migration 0007). Organization default language: `pnpm org:create --locale en`.
- **CI rule:** `scripts/ci-i18n-guard.mjs` with the baseline `scripts/i18n-baseline.json` (the count of Persian lines per old file; it can only shrink) and the same rule for physical Tailwind classes (currently zero). A missing key in `en.json` or a mismatched placeholder fails the unit test `src/i18n/i18n.test.ts`.
- **Extracted in sprint 2:** the shell and navigation (staff and student), quick add, login, forgot password, invitation and password recovery, "My account", password re-confirmation, the "Today" page, task and status labels, the task table, the review queue, the task filter. **Left for sprint 3:** task forms (create, submit, review, actions), task detail pages, the student home and the remaining pages (the full list is in the CI baseline).

# Coach Office sprint 7b — month calendar for mentor hours

- **Date:** 2026-10-29 (8 Aban 1405)
- **Based on:** the founder's request of 2026-10-29, ADR-0014 (amendment "sprint 7b")
- **Status:** code and tests done. **One new migration (`0014_date_hours`). Not committed, not on production.**

## Request
After seeing sprint 7, the founder asked for a calendar that opens like Google Calendar, where the mentor says which dates they can meet. Mentors do not keep the same hours every week: they want to set days and hours month by month.

## What changed
| Part | Summary |
|---|---|
| Mentor calendar (`/calendar`) | The weekly-hours card and the "exception days" card are replaced by **"My days and hours"**: a Jalali month grid (Saturday first, previous/next month, up to 180 days ahead). Each day shows its hours. Days with hours of their own are highlighted, days that follow the weekly hours are plain, and closed days are dashed. Past days are disabled. |
| Picking days | Tap days to select several. Tap a weekday name (for example «س») to select every Tuesday of that month (tap again to clear). A side panel (below the grid on phones) edits the hours of the selection: one or more windows, each optionally limited to some session types. Buttons: **set these hours on the selected days**, **close these days**, **back to weekly hours** (shown when a selected day has hours of its own). |
| Weekly hours | Kept, but optional and collapsed: "Repeating weekly hours (optional)" with a summary ("2 days a week" or "Not set"). They apply only to dates without hours of their own, so a mentor can work purely month by month. |
| Save | The sticky "Save hours" button saves weekly hours and dated hours together. If days are selected and their hours were edited but not applied, saving applies them first. |
| Mentee booking (`/my/mentors/:id`) and the mentor preview | The day strip is now the same month grid: days with free times are highlighted with a dot; tapping one shows its times as before. |
| Horizon | A new offering now looks 60 days ahead (was 21); the setting accepts up to 180 days. Existing offerings keep their value. |

## Model (ADR-0014 amendment)
- `availability_exceptions` now holds the **hours of one date**: `off` (closed, no range) or `hours` (one window, with `template_ids`).
- A date with rows of its own **replaces** the weekly hours of that date. Other dates use the weekly rules. The pure function `windowsOf` in `modules/scheduling/slots.ts` implements this.
- API: `PUT /mentors/:id/availability` takes `{ rules, dates: [{ day, windows: [{ start, end, templateIds? }] }] }`. An empty `windows` list closes the date. A date may appear once (422 otherwise). `GET` returns the same `dates` shape (today and later).

## Migration `0014_date_hours`
- Adds `availability_exceptions.template_ids uuid[] NOT NULL DEFAULT '{}'`.
- Converts data: `extra` rows become `hours`; partial `off` rows (with a range) are deleted, because a date's `hours` rows now say when the mentor is free. Whole-day `off` rows stay.
- New CHECKs: kind is `off` or `hours`; `off` has no range, `hours` has a valid range.
- `mentor_offerings.horizon_days` default 60, allowed range 1–180.
- Applied to the local database only.

## Tests
- **Unit:** `src/modules/scheduling/slots.test.ts` (12): a closed date wins over the week; a date's own hours replace the weekly hours of that date only; a date can open a day the week keeps closed and limit a window to some types; month-by-month planning with no weekly hours at all.
- **Integration:** `tests/integration/booking.test.ts`: a closed date has no slots; a date with 10:00–11:00 gives exactly one slot; a repeated date is refused (422). Access matrix probes use the new body.
- **Browser (local):** on `/calendar`, all Tuesdays of Aban selected with one tap, set to 16:00–18:00, Saturday 9 Aban closed, saved; after reload the grid and the mentee preview showed exactly that (Tuesdays: 3 times, Saturday 9: none). Checked at 375px (ranges fit in the day cells, no horizontal scroll) and at 1280px.
- Full results of this sprint's run: see "Checks" below.

## Checks
TEST_RESULTS

## Before production
- Migrations 0006–0014 are still not on production. Order and cautions: `apps/web/drizzle/README.md`.
- After deployment, mentors who set "extra hours" or a partial day off in sprint 7 (local only so far) would see them converted as described above.

## Out of scope
Google Calendar sync, `.ics` files, copying one month's pattern to the next month, drag-to-select ranges of days, per-mentor time zones.

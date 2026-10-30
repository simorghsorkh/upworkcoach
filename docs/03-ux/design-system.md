# Design System — Version 0.1 ("Coach Office")

> Phase 2 — author: ux-designer — 27 Mehr 1405 (2026-10-19) — status: draft for the founder gate
> **Visual revision (same day):** after the founder's feedback ("a stronger design, Vazir font"), a high-quality design was built on top of the already-approved structure.
>
> | Folder | Role |
> |---|---|
> | `mockups/` | **Visual reference and the reference implementation of the tokens** (`mockups/styles.css`). The variable and class names are the ones frontend-engineer must use or map to Tailwind |
> | `wireframes/` | Reference for **structure and content** (approved, unchanged) |
>
> Principle: **practical, calm and data-rich; not decorative.** The coach spends 30 to 60 minutes a day on these screens, and the student arrives on a phone with a poor connection.

---

## 0. Visual direction

**Feel: professional, reliable, warm and calm** — like the tidy office of an experienced coach, not an admin panel and not an entertainment app.

| Decision | Why |
|---|---|
| **Brand color: ink indigo** (`#4A40A8`, the color of fountain-pen ink) | 1) It does not mix with any of the status colors (green, amber, red, gray); a teal next to the green "On track" would have made the status meaning ambiguous. 2) It is neither the default Bootstrap blue nor Upwork green; it has its own identity and does not claim any affiliation with Upwork. 3) Ink and notebook = the "Coach Office" metaphor: writing feedback, notes, a file on a person. 4) Contrast of 8.1:1 against white text; sufficient for both buttons and link text |
| **Warm paper neutrals** (`#F7F6F3`) instead of cold gray | The coach's eyes are on the screen for hours; a slightly warm background causes less fatigue and takes the page out of "office form" territory |
| **Dark ink sidebar** | The product's main identity at a glance; it separates navigation from content so the light content is seen "on the desk". It is the only permanent bold surface on the page |
| **Hierarchy by weight, not by color** | Variable Vazirmatn: 800 for key numbers, 700 for headings and names, 600 for row titles and buttons, 500 for labels, 400 for text. Color is kept for **meaning** (status, action) |
| **One bold button per page** | The page's main action is solid indigo; per-row actions are "soft" (`btn-soft`, pale indigo background). On "Today" the only solid button is "Review" in the "Past response time" box, so the eye goes there first |
| **"What do I tackle first" = the red box at the top of Today** | Reading order on "Today": SLA box (red, with a button) → four large numbers → sections. Each number has a sub-indicator such as "1 late / 3 red" |
| **People get an initial-letter avatar with a fixed color** | The coach finds a student faster by color and letter in the list, the kanban and Today. 8 soft colors, separate from the status colors |
| **The 9-stage path looks the same everywhere** | A 9-segment bar next to every student (list, Today, file) and a full stepper for the student; the current stage is taller and has a ring, not just a color |
| **Light shadow, thin border, 12px corners** | Calm and precise like Linear/Attio; large shadows only for dialogs |
| **Deliberately absent** | Decorative gradients on working screens, imagery, emoji, animation longer than 200ms, Upwork brand color, any visual hint of AI tools or payments |

---

## 1. Principles

| Principle | Meaning in practice |
|---|---|
| **Desktop and mobile, both first-class** | Founder's decision (D1). The coach does daily work at a desktop and quick notes on a phone; the student mostly uses a phone. Every page is designed at 1440px and 375px |
| **At a glance** | The coach sees where each student **is, what task has been asked of them, and who is stuck**. These three are always at the top of the page and large |
| **Status never by color alone** | Every status color comes with a shape and text |
| **Everything clickable is one click from its destination** | Rows and cards are fully links; a secondary action is a separate button |
| **Lightweight** | Local font, inline SVG icons, no images and no external library; the student home under 3 seconds on a poor connection (F10) |

---

## 2. Tokens

All values are defined in `mockups/styles.css` section 1 (light) and 1b (dark). Contrast ratios are computed per WCAG 2.2.

### 2-1. Brand — ink indigo

| Token | Value | Usage | Contrast |
|---|---|---|---|
| `--brand-50` | `#F3F2FC` | Selected background, shared note | brand-700 on it: 9.3:1 |
| `--brand-100` | `#E6E4F8` | "Waiting for review" chip, active student tab | brand-700 on it: 8.0:1 |
| `--brand-200` | `#CCC8F0` | Brand element borders, text selection | decorative |
| `--brand-300` | `#A9A3E4` | Past segments of the path bar, sidebar indicator, border of the English block | decorative (≥ 3:1 on ink) |
| `--brand-500` | `#5B52BD` | Focus ring; primary button in dark mode | white on it: 6.2:1 |
| `--brand-600` | `#4A40A8` | **Main color**: primary button, link, current stage | white: 8.1:1 · on bg: 7.5:1 |
| `--brand-700` | `#3C3489` | hover, text on a brand background | white: 10.3:1 |
| `--brand-900` | `#1D1B36` | Sidebar | `#CFCBE6` on it: 10.5:1 |

Semantic roles (use these in code instead of numbers): `--c-primary` (600), `--c-primary-hover` (700), `--c-primary-weak` (50), `--c-primary-weak-2` (100), `--c-primary-text` (700), `--c-primary-line` (200), `--c-link` (600), `--c-focus` (500).

### 2-2. Warm neutrals

| Token | Value | Usage | Contrast |
|---|---|---|---|
| `--c-bg` | `#F7F6F3` | Page background | — |
| `--c-surface` | `#FFFFFF` | Card, table, dialog | — |
| `--c-surface-2` | `#F2F0EB` | Table header, neutral chip, kanban column | — |
| `--c-surface-3` | `#EAE7E0` | Switch, future segment of the path bar | — |
| `--c-hover` | `#FAF9F6` | Row hover | — |
| `--c-border` | `#E6E2DA` | Divider and card outline | decorative |
| `--c-border-2` | `#D6D1C7` | Secondary button outline, filter chip | decorative (the button has text and a shadow) |
| `--c-border-strong` | `#8E877B` | **Form field border** | 3.6:1 on white (WCAG 1.4.11) |
| `--c-text` | `#1F1D1A` | Main text | 16.8:1 white · 15.6:1 bg |
| `--c-text-2` | `#57524A` | Secondary text, labels | 7.8:1 white · 6.8:1 surface-2 |
| `--c-text-3` | `#6F695F` | Meta, time, counters | 5.4:1 white · 5.0:1 bg · 4.7:1 surface-2 (minimum) |

### 2-3. Sidebar (coach)

| Token | Value | Contrast on `--side-bg` |
|---|---|---|
| `--side-bg` | `#1D1B36` | — |
| `--side-fg` | `#CFCBE6` | 10.5:1 |
| `--side-fg-2` (icon, group label) | `#9C97BF` | 6.0:1 |
| `--side-active` (current item, white text) | `#34305F` | white on it: 12.1:1 |
| `--side-accent` (indicator and current icon) | `#A9A3E4` | 5.2:1 on active |

### 2-4. Health status colors (F7)

Every status = **color + shape + text**. The shapes are distinguishable in black and white and for red-green color blindness. None is close to the brand indigo.

| Status | Badge text | Shape | Background | Text/shape | Border | Contrast |
|---|---|---|---|---|---|---|
| Green | "On track" | circle ● | `#E6F4EA` | `#16653A` | `#A7D7B5` | 6.3:1 |
| Yellow | "Needs attention" | triangle ▲ | `#FDF1D6` | `#7A4B00` | `#EBC46F` | 6.6:1 |
| Red | "Stuck" | square ■ | `#FCE9E7` | `#A8221C` | `#F0AFA9` | 6.2:1 |
| Paused | "Paused until [date]" | two bars ‖ | `#EEECE8` | `#4A463F` | `#C9C4BA` | 7.9:1 |
| Churn risk | "Stuck · churn risk" | white square | `#B3261E` (`--h-solid`) | `#FFFFFF` | — | 6.5:1 |
| Alert muted | "Alert muted until …" | same shape | transparent | same | **dashed** | same |

**Health display rules** (unchanged from the wireframe)
- A **human-readable reason** always accompanies the badge; the rule code (`.rule`) is small, Latin, on a gray background, inside `<bdi>`.
- "Ball in court" is a separate `.ball` badge with a ball icon: "Ball: student / us / both".
- **The student never sees the health badge.**
- In lists, a red row has a 3px red line on the start edge (right); kanban "longer than usual" = amber line, "2x" = red line, **always with text** ("21 days · 2x usual").

### 2-5. Task status (F4)

| Status | Label | Background / text | Icon | Contrast |
|---|---|---|---|---|
| Open | "Open" | `#EEECE8` / `#4A463F` | hollow circle | 7.9:1 |
| In progress | "In progress" | `#E3F0F8` / `#0F5A80` | filled half circle | 6.4:1 |
| Submitted | "Waiting for review" / "You submitted" | `#E6E4F8` / `#3C3489` | hourglass | 8.0:1 |
| Needs revision | "Needs revision · round 2" | `#FDF1D6` / `#7A4B00` | return arrow | 6.6:1 |
| Accepted | "Accepted" | `#E6F4EA` / `#16653A` | check mark | 6.3:1 |
| Cancelled | "Cancelled" | `#F2F0EB` / `#6F695F` + strikethrough | — | 4.7:1 |

"Waiting for review" is deliberately indigo: this is the thing the coach must act on, and it is tied to the "Review" button.

### 2-6. Tags (`.tag`)

| Tag | Appearance | Contrast |
|---|---|---|
| Neutral (niche, cohort) | `surface-2` / `text-2`, fully rounded | 6.8:1 |
| **Overdue** `.tag-overdue` | solid red `#B3261E` / white | 6.5:1 |
| **Late** `.tag-late` (team SLA) | white with red border / text `#A8221C` + clock icon | 7.2:1 |
| **Urgent** `.tag-urgent` | ink `#1F1D1A` / white + lightning icon | 16.8:1 |
| **New** `.tag-new` | solid indigo / white | 8.1:1 |
| **Required to pass** `.tag-gate` | pale indigo with border | 9.3:1 |
| Platform `.platform` | thin border, small monogram, Latin LTR text; **no platform brand color** (Upwork green would clash with "On track") | 7.8:1 |

### 2-7. Avatar

A circle with the first letter of the name (700) on one of 8 fixed soft colors; the color in the implementation = `hash(userId) % 8` so it is the same on every page. All pairs ≥ 6:1.

| Class | Background / text | | Class | Background / text |
|---|---|---|---|---|
| `av-1` indigo | `#E6E4F8` / `#3C3489` | | `av-5` teal | `#DCEFEC` / `#1D5C55` |
| `av-2` plum | `#F4E2EF` / `#7A2E68` | | `av-6` sky | `#DFEDF7` / `#1E5276` |
| `av-3` terracotta | `#F8E3D7` / `#8A3B17` | | `av-7` rose | `#F9E1E4` / `#8C2639` |
| `av-4` ochre | `#F5EACB` / `#6B4E00` | | `av-8` olive | `#E7EDD5` / `#4A5A1A` |

Sizes: `av-xs` 20, `av-sm` 26, default 32, `av-lg` 44, `av-xl` 64 (20px corners, file header only). The avatar is always `aria-hidden`; the name next to it is real text.

### 2-8. Dark mode

With `@media (prefers-color-scheme: dark)` only the tokens change; no component has separate code. (In the Tailwind implementation: the `class` strategy on `<html>`, defaulting to "follow system", so the user can switch manually.)

| Token | Dark | Contrast |
|---|---|---|
| `--c-bg` / `--c-surface` / `--c-surface-2` | `#141311` / `#1C1B18` / `#24221F` | — |
| `--c-text` | `#EDEAE4` | 14.3:1 on surface |
| `--c-text-2` | `#B8B2A7` | 8.2:1 |
| `--c-text-3` | `#989186` | 5.5:1 (5.1 on surface-2) |
| `--c-border-strong` | `#7A746A` | 3.7:1 |
| `--c-primary` (button) | `#5B52BD` | white: 6.2:1 |
| `--c-link` / `--c-focus` | `#A9A3F0` | 7.5:1 |
| `--c-primary-text` on `--c-primary-weak` | `#B9B3F2` on `#211E44` | 7.8:1 |
| Health green / yellow / red / paused (text on background) | `#86D7A1`/`#132B1C` · `#F0C26A`/`#33270C` · `#FFA49B`/`#3A1714` · `#CEC8BD`/`#2A2824` | 8.0 · 8.8 · 8.4 · 8.8 |
| `--side-bg` | `#0F0E1C` | — |

### 2-9. Typography

**Font:** Vazirmatn variable, version 33.0.3 (weight 100 to 900), from a local file; PRD section 8: no CDN.

```css
@font-face {
  font-family: "Vazirmatn";
  src: url("../assets/fonts/Vazirmatn-Variable.woff2") format("woff2");
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
--font: "Vazirmatn", Tahoma, "Segoe UI", sans-serif;
```

- One font for everything, including the English Upwork text (Vazirmatn has legible Latin letters). The separate `--font-latin` token from the wireframe was removed.
- In the implementation: the file goes in `public/fonts/` with `<link rel="preload" as="font" type="font/woff2" crossorigin>` for this one file only (~100KB).
- Letter-spacing is always zero for Persian. Persian line height is never below 1.5.

| Role | Token | Size / line height | Weight | Example |
|---|---|---|---|---|
| Key number (KPI) | `--fs-kpi` | 34 / 40 (mobile 26 / 32) | **800** | "18" on Today |
| Page title | `--fs-2xl` | 26 / 38 (mobile 21 / 32) | 700 | "Today" |
| Dialog title, student greeting | `--fs-xl` | 20 / 30 | 700 | "Change Amir's stage" |
| Card/section title (h2) | — | 16 / 26 | 700 | "Submissions waiting for review" |
| Student name in a table | — | 15 / 24 | 700 | "Zahra Karimi" |
| Row title, button | `--fs-md` | 15 / 26 · button 14 | 600 | "Ask how yesterday's interview went" |
| Body text | `--fs-md` | 15 / 26 | 400 | Task description |
| Field label, navigation | — | 14 / 20 | 500–600 | "Next-version deadline" |
| Meta (name, time, mentor) | `--fs-sm` | 13 / 21 | 400 | "Amir Rostami · 6 hours ago" |
| Badge, counter, rule code | `--fs-xs` | 12 / 18 (minimum for text) | 500–700 | "Late · 52 hours" |
| 11px exception | — | 11 / 14–16 | 500–700 | Only the label under the mobile bottom-bar icon, the "You are here" pill, the "Internal/Shared" label and the navigation group title; all short and with contrast ≥ 5:1 |
| Form input | `--fs-input` | **16** always | 400 | So iOS does not zoom |

UI numbers are Persian (`Intl.NumberFormat('fa-IR')`); counters have `font-variant-numeric: tabular-nums` so columns do not jitter.

### 2-10. Spacing (4px scale)

| Token | `--sp-1` | `--sp-2` | `--sp-3` | `--sp-4` | `--sp-5` | `--sp-6` | `--sp-7` | `--sp-8` | `--sp-9` | `--sp-10` |
|---|---|---|---|---|---|---|---|---|---|---|
| px | 4 | 8 | 12 | 16 | 20 | 24 | 32 | 40 | 48 | 64 |

Note: in the wireframe `--sp-5` was 24; it is now 20, and 24 = `--sp-6` (a continuous 4px scale).

Fixed usage: inside a card 20 (mobile 16); between cards 20; between columns 24; desktop page margin 40, mobile 16; between icon and text 6 to 8; list row 12 vertical.

### 2-11. Radius and shadow

| Token | Value | Usage |
|---|---|---|
| `--r-xs` | 6px | Task status chip, code |
| `--r-sm` | 8px | Button, field, navigation item |
| `--r-md` | 12px | Card, table, kanban card |
| `--r-lg` | 16px | KPI card, kanban column, priority box |
| `--r-xl` | 20px | Dialog and bottom sheet |
| `--r-full` | 999px | Badge, tag, filter chip, avatar |

| Token | Value (warm shadow color `rgb(31,27,20)`) | Usage |
|---|---|---|
| `--shadow-xs` | `0 1px 2px /.05` | Button, field, kanban card |
| `--shadow-sm` | `0 1px 2px /.06, 0 1px 3px /.05` | Card |
| `--shadow-md` | `0 2px 4px /.04, 0 8px 20px -6px /.14` | Card hover, suggestion sheet |
| `--shadow-lg` | `0 24px 56px -12px /.30, …` | Only dialog, popup menu, toast |
| `--ring` | `0 0 0 3px` indigo 22% | Field focus (plus a border color change) |

### 2-12. Breakpoints

| Name | Width | Layout |
|---|---|---|
| Mobile | < 768px | One column, top bar + bottom bar, table → card, dialog → bottom sheet |
| Tablet | 768 to 1199px | Sidebar 224px, one column, KPIs in pairs |
| Narrow desktop | 1200 to 1279px | Sidebar 256px, two-column detail, "Today" one column |
| Desktop | ≥ 1280px | "Today" two columns; content up to 1360px (at 1440 it fills the full width); kanban has no width cap |

---

## 3. Layout patterns

### 3-1. Coach/mentor shell

```
Desktop (≥ 1200)                                       Mobile (< 768)
┌──────────────────────────────────────┬─────────────┐  ┌───────────────────────┐
│ date (faded)                          │ ▣ UpworkCoach│  │ ☰   Today · 27 Mehr ⌕ │ ← top bar (sticky, translucent)
│ Today (26/700)    [Mentor ▾] [+ Add]  │ [⌕ Search  /]│  ├───────────────────────┤
│ ┌ Past response time ────────────────┐ │ ▸ Today   18│  │ priority box           │
│ │ A  Amir's submission · late 52h [Review]│ │  Students   │  │ [4][5]                 │
│ └────────────────────────────────────┘ │   Stages    │  │ [3][6]   ← KPIs in pairs│
│ [4 reminders][5 submissions][3 questions][6 stuck] │   Tasks     │  │ sections stacked       │
│ ┌ Reminders ────┐ ┌ Questions ───────┐  │   Questions 3│  ├───────────────────────┤
│ ┌ Submissions ──┐ ┌ Stuck ───────────┐  │ Admin       │  │ Today Students (+) Tasks Questions │
│                                        │ ● Coach    ⚙│  └───────────────────────┘
└──────────────────────────────────────┴─────────────┘
                                         ↑ dark ink sidebar, on the **right** (start of the line in RTL)
```

- **Sidebar** 256px, dark ink, sticky: brand mark, search with the `/` shortcut, navigation with icons, an "Admin" group (results, settings; removed for mentors), the user at the bottom. Current item: lighter background + 3px light-indigo line on the edge + indigo icon + weight 700.
- **Mobile bottom bar** with 5 slots: Today, Students, **+ Quick add** (floating indigo button, 52px, 18px corners, slightly above the bar), Tasks, Questions. Current item: indigo color + a line above the icon. The counter sits on the icon's corner.
- **Quick add (+)** is a bottom sheet with a 2x2 grid of cards: Note (primary), New task, Reminder, New student.

### 3-2. Student shell

- Desktop: a 64px translucent white top bar with the brand, five pill items (Home, Tasks, Questions, Path, Me) with an indigo counter, and a notification bell; content in a center column up to 760px.
- Mobile: top bar (brand + bell; on a task page: back + title) and a five-item bottom bar.
- The student's visual tone is slightly warmer than the coach's: the check-in card with an indigo gradient, the stepper with "You are here", larger buttons (`btn-lg`, 48px).

### 3-3. Page patterns

| Pattern | Desktop | Mobile | Pages |
|---|---|---|---|
| **Sectioned dashboard** | Priority box + 4 KPIs + 2-column grid | Priority box, KPIs 2x2 (jump links), sections stacked | Today, student home |
| **Tabular list** | Table in a card with a gray header, filters in two rows | Each row a card (name and avatar on top, the rest "label → value"); filters in a bottom sheet | Students, tasks |
| **Two-column detail** | Main column + 360px sticky side column | Side column below the main one; the main action in a fixed bar above the bottom bar | File, task detail |
| **Kanban** | 272px columns with internal horizontal scroll (not the page) | Each column 85% width, mandatory `scroll-snap` + a row of stage chips | Stages |
| **Form/dialog** | Center dialog, max 560px, 20px corners | Full-width bottom sheet with a handle, buttons pinned to the bottom | All dialogs |

**Column order:** in RTL the main column is on the right. DOM order = display order; do not use `order` to rearrange interactive content.

---

## 4. Components

Live example of all of them: `mockups/states.html`.

| Component | Class | Description and states |
|---|---|---|
| Button | `.btn` (secondary), `.btn-primary`, `.btn-soft`, `.btn-ghost`, `.btn-link`, `.btn-danger`, `.btn-danger-solid`; sizes `.btn-sm` (32), default (38 desktop / 44 mobile), `.btn-lg` (48) | States: hover (darker background/border), pressed (1px down), focus (ring), disabled (`aria-disabled` + 55%), submitting (`.is-loading` 14px spinner + text "Saving…"). **One `btn-primary` per page**; repeated row actions use `btn-soft` |
| Icon button | `.icon-btn` | 36px (mobile 44); always `aria-label`; dot badge `.dot-badge` |
| Card | `.card`, `.card-head`, `.card-link`, `.card-foot` | Title 16/700 with a faded icon + counter; "All ›" link in indigo 600 |
| Number card | `.kpis` > `.kpi` + `.k-brand/.k-sky/.k-plum/.k-red` | 44px colored icon square, number 34/800, label 14/500, red or ink sub-indicator ("1 late", "1 urgent"). The whole card is a jump link; hover: lifts 1px and gains a shadow |
| Priority box | `.priority`, `.priority-head`, `.priority-list` | Only when something is past SLA; pale red header with a warning icon; each item: avatar, title, reason, one button |
| List row | `.list` > `.item` (+ `.is-late`, `.is-warn`) | Avatar 32, title 600, meta 13; hover on the whole row; late = 3px red line on the start edge |
| Avatar / person | `.avatar .av-1…8`, `.person` | Section 2-7 |
| Path bar | `.path` (+ `.path-lg`) | 9 segments: `i.d` past (light indigo), `i.c` current (indigo, wider and taller with a ring), empty future; `role="img"` + `aria-label="Stage 5 of path 0 to 8"`; always next to the stage text |
| Student stepper | `.stepper` | 32px circle: past indigo with a check, current 36px with a ring + "You are here" pill, future gray; connector line indigo up to the current stage; on mobile horizontal scroll with snap |
| Health badge | `.health .h-green/.h-yellow/.h-red/.h-churn/.h-paused` (+ `.h-muted`, `.h-dot`) | Section 2-4; `.h-dot` = shape + text only, no pill (student list header summary) |
| Task status chip | `.chip .st-*` + 14px icon | Section 2-5 |
| Tag | `.tag`, `-overdue`, `-late`, `-urgent`, `-new`, `-gate`, `-outline`; `.platform` | Section 2-6 |
| Counter | `.count`, `.count-brand`, `.count-alert` | 20px pill, 12/700, tabular numbers; always a full `aria-label` |
| Ball in court / rule code | `.ball`, `.rule` | Thin-bordered badge with a ball icon / 11px Latin on gray |
| Search | `.search-wrap` > `.search` | Magnifier icon at the start, `kbd /` at the end (desktop only); focus: indigo border + `--ring` |
| Select / switch | `.select`, `.seg` | "List / Stages" switch and versions: a white shadowed pill on a `surface-3` background |
| Filter chip | `.fchip` (`aria-pressed`) | Selected: solid ink; with the status shape and count |
| Tab/anchor | `.tabs` | 2px indigo line under the current one, current counter in indigo; on mobile sticky under the top bar |
| Responsive table | `.table-wrap` > `.rtable` + `data-label`, `.cell-primary`, `.col-act`, `tr.row-red` | Mobile: a card with `cell-primary` separated by a line, the rest "label → value", full-width button |
| File header | `.profile-hero`, `.ph-top`, `.ph-rest`, `.three`, `.reasons` | Avatar 64, name 24/700, status + ball, reasons in a red pill, meta with icons; three tiles "Showcase / Latest task / Where on the path" |
| Timeline | `.timeline`, `.tl-item`, `.tl-icon`, `.tl-internal`, `.tl-shared`, `.tl-auto` | Internal: ink icon + dashed border + `.vis-tag.vis-internal` ("Internal — the student can't see it" with a lock icon); shared: pale indigo + eye icon; automatic: a small dot with no border |
| Note composer | `.composer` + `.vis-switch` | Focus rings the whole box; a text "Internal / Shared" switch with icons, default internal (ink) |
| Kanban | `.board`, `.kcol`, `.kcol-head`, `.stage-num`, `.kcount`, `.kcol-bar`, `.kcard` (+ `.is-over`, `.is-over2`), `.kmove`, `.kmore`, `.stage-chips` | Column header: number in a square, name, counter, "Usual: …", 4px health distribution bar (decorative, `aria-hidden`). Card: the whole card is a link (stretched `::after`), the "Move" button appears on hover/focus and is always visible on touch |
| Review outcome | `.outcome` (`.ok`, `.fix`) | Two large radio cards with icons; selected: green/amber background and border (with `:has(input:checked)`) |
| Rating | `.rating` | Five joined cells, selected one indigo; 1, 3 and 5 have captions |
| Form | `.field`, `.input`, `.textarea`, `.input-icon`, `.radio-card`, `.radio-stack`, `.check`, `.consent`, `.quick`, `.hint`, `.error-text` | Section 4-1 |
| Collapsible section | `details.more` | Summary with a chevron that rotates 180° |
| Popup menu | `details.pop` > `.pop-panel` | "Snooze ▾": 1 day / 3 days / 1 week |
| Dialog / sheet | `.sheet`, `.sheet-panel`, `.sheet-head`, `.sheet-menu`, `.quick-grid` | Mockup via `:target`; implementation is `<dialog>` with focus trap and Esc |
| English text block | `.ltr-label` (+ `.lang` "EN", `.charcount`), `.ltr-block` (+ `.quote`, `.compact`) | Section 7-4 |
| Inline alert | `.alert .alert-warn/-error/-info/-ok/-neutral` + icon | Always with a text title; action button at the end |
| Toast | `.toast` | Ink, green check icon, "Undo" with an icon, seconds countdown; `role="status"` |
| Student home | `.hello`, `.checkin`, `.out-box`, `.resources`, `.welcome`, `.welcome-steps` | Check-in: indigo 700→500 gradient (the only gradient on working screens); first login: three numbered steps with duration, the next step in indigo |
| Feedback for the student | `.feedback`, `.feedback-head`, `.fb-list`, `.verdict` | Pale indigo header with the mentor's avatar and "New"; definition list: verdict, strength, fix, example (English block), next step |
| Copy invite link | `.copy-box`, `.msg-preview` | Single-line LTR link with a "Copy" button; message preview styled like a chat bubble |
| Empty state | `.empty`, `.empty-icon` (`.ok`, `.brand`), `.mini-empty` | Section 6 |
| Skeleton | `.skel`, `.skel-row`, `.skel.circle` | Same shape as a real row (avatar + two lines) |
| Reserved slot | `.slot-reserved` | `display:none` in 0.1; section 10 |

### 4-1. Forms

- The label is always above the field (14/600), never a placeholder instead of a label. "(optional)" in weight 400 and a faded color.
- Field: height 44, border `--c-border-strong` (3.6:1), 8 corners, text 16; hover darkens the border; focus is an indigo border + 3px ring.
- Error: red border + faint red ring, beneath the field a warning icon + red text 13/600, `aria-invalid` and `aria-describedby`.
- Date: a field with a calendar icon + chips "Tomorrow, 3 days, 1 week" beneath it.
- Mobile number and link: `dir="ltr"`, suitable `inputmode`. A fixed warning "Never type a password or login code for any account here" with a lock icon.
- A native `select` with `appearance:none` and a drawn arrow at the end of the line (left in RTL).

---

## 5. Icons

| Rule | Value |
|---|---|
| Style | Outline, uniform, round caps and joins, no fill (except dots) |
| Size | **20px** default; 16 inside buttons and meta; 14 inside badges; 22 bottom bar |
| Stroke | **1.75px** rendered (on the 24-unit grid `stroke-width: 2.1`; for 16 and 14 it is 2.4 and 2.5 respectively so the visual weight stays constant) |
| Mockup implementation | Inline `<symbol>`s at the top of each page + `<svg class="i"><use href="#i-…"/></svg>`; color from `currentColor` |
| Product implementation | The same paths as a React component (or `lucide-react`, which is stylistically a family match, with `strokeWidth={1.75}` and `absoluteStrokeWidth`) |
| Accessibility | A decorative icon is `aria-hidden="true"`; an icon-only button has `aria-label` |
| Set (56) | today, users, board, tasks, chat, chart, sliders, search, plus, menu, back\*, next\*, chev-next\*, chev-down, more, x, check, check-circle, clock, calendar, link, external\*, alert, info, filter, phone, pen, undo\*, upload, flag, pause, eye, lock, bell, bell-off, route, user, home, copy, wifi-off, inbox, award, refresh, file, video, checklist\*, briefcase, zap, ball, target, hourglass, st-open, st-progress, checkin, list, grid |

\* Directional: drawn in the LTR direction and mirrored in RTL with the `.i-dir` class (`[dir="rtl"] .i-dir { transform: scaleX(-1) }`). The rest are never mirrored.

**Brand mark:** an indigo rounded square (gradient 400→600) with steps that climb from right to left and reach a flag — a step-by-step path to the first contract, in the Persian reading direction.

---

## 6. Empty, loading and error states

Live example: `mockups/states.html`. Visual pattern for empty states: a 56px rounded square with an icon (green for success, indigo for starting, gray for a filter, red for an error) + a 15/700 title + one sentence + at most one button.

The sample copy below is Persian because the exact wording is the spec; an English gloss follows each.

| State | Pattern | Sample text |
|---|---|---|
| **Empty — success** | Green check icon + sentence + optional next step | «امروز کار عقب‌مانده‌ای نیست.» ("Nothing is overdue today.") / «مرور هفتگی: ۱۲ هنرجو تا شنبه» ("Weekly review: 12 students by Saturday") |
| **Empty — getting started** | Indigo icon + "why it's empty" + primary button | «هنوز هنرجویی نساخته‌ای. اولین نفر را اضافه کن و لینک دعوتش را در تلگرام بفرست.» ("You haven't created a student yet. Add the first one and send their invite link on Telegram.") |
| **Empty — filter** | Filter icon + "Clear filters" | «هنرجویی با این فیلترها نیست» ("No students match these filters") |
| **Empty — student** | Encouraging, no blame | «فعلاً کاری نداری. مشاورت به‌زودی کار بعدی را می‌گذارد؛ اگر سؤالی داری بپرس.» ("You have no tasks for now. Your mentor will set the next one soon; ask if you have a question.") |
| **Loading** | Skeleton matching the content; after 10 seconds "Connection is slow…" | — |
| **Load error** | In the same section; red icon + "Try again" | «این بخش بار نشد. اتصال اینترنت را بررسی کن.» ("This section didn't load. Check your internet connection.") |
| **Save error** | The user's text is preserved; red alert next to the button | «ذخیره نشد. متنت سر جایش است؛ دوباره بزن.» ("Not saved. Your text is still there; try again.") |
| **Offline** | Neutral alert with a disconnected icon | «اتصال قطع است. آخرین اطلاعات را می‌بینی؛ ثبت‌ها بعد از وصل شدن ارسال می‌شوند.» ("You're offline. You're seeing the latest data; entries will be sent once you reconnect.") |
| **No access** | Plain page | «این هنرجو به تو تخصیص داده نشده.» ("This student isn't assigned to you.") |
| **Destructive action confirmation** | Dialog naming the exact action; solid red button | «لغو کار "…"؟ دلیل:» [لغو کار] [منصرف شدم] ("Cancel task "…"? Reason:" [Cancel task] [Never mind]) |

Tone: informal second-person singular for the student; short and neutral for the coach. No exclamation marks and no emoticons.

---

## 7. RTL rules

### 7-1. Direction and layout
- `<html lang="fa" dir="rtl">`. In CSS use only **logical properties** (`margin-inline-start`, `inset-inline-end`, `border-inline-start`, `text-align: start`, `border-end-start-radius`).
- **Documented exception:** the drawn arrow of `select` with `background-position: left …` (it has no logical property). If an LTR interface is ever needed, this one rule must be flipped with `[dir="ltr"]`.
- Grid and Flex start from the right automatically in RTL; the sidebar as the first column = right. The "late"/"longer than usual" indicators are on the **start** edge (right) of the card and row.
- Horizontal scrolling (kanban, stepper, tabs, stage chips) starts from the right; stage 0 is on the right.

### 7-2. Icons
| Type | Rule |
|---|---|
| **Directional (mirrored)** | Back (→ to the right), next/continue/move (← to the left), the "All" chevron and breadcrumb, undo, external link, checklist |
| **Non-directional** | Search, check, cross, clock, calendar, lock, bell, eye, +, ball, hourglass, the "in progress" half circle |
| Forbidden | ‹ › and ( ) as icons (the automatic bidi algorithm mirrors them) |

### 7-3. Numbers and dates
Persian digits are the point of the examples in this table, so the Persian samples are kept with an English gloss.

| Item | Rule | Example |
|---|---|---|
| UI numbers | **Persian digits** (`Intl.NumberFormat('fa-IR')`) + tabular numbers | «۳ کار معوق» ("3 overdue tasks"), «۱۸ روز» ("18 days") |
| Numbers inside an English block | Latin digits, exactly as the user wrote them | `$25/hr`, `Connects: 16` |
| Rule code, identifier, link | Latin inside `<bdi>` or `.rule`/`.link-ltr` | `R-OVERDUE` |
| Dollar amount in Persian text | Persian digits + "dollar" | «۲۵ دلار/ساعت» ("25 dollars/hour") |
| Date | **Jalali**; relative for the last 7 days, absolute after that | «۳ روز پیش» ("3 days ago"), «دیروز ۱۷:۱۰» ("yesterday 17:10"), «۲۷ مهر» ("27 Mehr") |
| Deadline | Absolute + faded relative | «تا پنجشنبه ۳۰ مهر (۳ روز مانده)» ("By Thursday 30 Mehr (3 days left)") |
| Percentage | «۸۰٪» ("80%") | — |

### 7-4. English text inside a Persian page (Upwork content)
- Job post, proposal and profile headline text goes in `.ltr-block`: `dir="ltr"`, `lang="en"`, `text-align: start`, the same Vazirmatn 14/1.7, `--c-bg` background, **a 3px light-indigo line on the start edge of the English text (left)** so it reads like a quotation from another document.
- The label above the block is Persian with a small "EN" pill and, if needed, a character count (Latin).
- English input fields are `dir="ltr"`; mixed fields (note, feedback) are `dir="auto"`.
- An English word in the middle of a Persian sentence (Upwork, Overview, check-in) goes inside `<bdi>`.
- Links: `.link-ltr`, truncated in the middle, with the full `title` and an external-link icon.

---

## 8. Accessibility

| Area | Rule |
|---|---|
| Contrast | Normal text ≥ 4.5:1, large text and control borders ≥ 3:1 (WCAG 2.2 AA), in **both** light and dark modes. The lowest text ratio in the system: `text-3` on `surface-2` = 4.7:1 |
| Color | No information is conveyed by color alone: health (shape + text), task (icon + text), overdue/late (text), longer than usual (line + text), path bar (size + `aria-label` + adjacent text) |
| Focus | 2px `--c-focus` ring with a 2px offset; fields: indigo border + 3px ring; on the dark sidebar the ring is light indigo. Never `outline:none` without a replacement |
| Keyboard | Tab order = RTL reading order; "Skip to content" is the first link; dialogs trap focus and close with Esc. Kanban card: one stop for the file and one for "Move" (the button appears on focus) |
| Coach shortcuts | `/` search (shown in the sidebar and search field), `N` new note, `G` then `T` Today; list with `?` |
| Kanban | Drag and drop is only a shortcut; "Move to…" on every card (WCAG 2.5.7) |
| Touch target | ≥ 44x44px on mobile (button, icon, bottom bar, move button); spacing ≥ 8px |
| Screen reader | One `h1` per page; avatar and icon `aria-hidden`; counters have a full `aria-label`; toast `role="status"`; form error `role="alert"`; stepper `aria-current="step"` |
| Language | `lang="en"` on English blocks |
| Motion | Transitions ≤ 200ms; all turned off under `prefers-reduced-motion` |
| Zoom | Up to 200% without horizontal page scroll (kanban and tabs scroll internally); `body { overflow-x: clip }` is only a safety net, not the solution |

---

## 9. UI glossary (consistency)

The Persian terms are the point of this table, so they are kept as is, with the English concept alongside.

| Concept | UI term | Do not use |
|---|---|---|
| Student | هنرجو | دانشجو، کاربر (university student, user) |
| Mentor | مشاور (admin: «مربی» / coach) | استاد، پشتیبان (professor, support person) |
| Task / Assignment | کار | تکلیف، تسک (in learning content «تکلیف» / assignment is allowed) |
| Submission | تحویل | ارسال (sending) |
| Review | بازبینی | بررسی (reserved for the AI tool in 1.0) |
| Stage | مرحله | گام، سطح (step, level) |
| PlatformProfile | ویترین / پروفایل [پلتفرم] (showcase / [platform] profile) | اکانت، حساب (account) |
| Interaction | یادداشت (note) | کامنت (comment) |
| Health | وضعیت (status) | سلامت (health; documentation only) |
| Milestone | نقطه‌ی عطف | دستاورد، مدال (achievement, medal) |
| Overdue | معوق | عقب‌افتاده (lagging behind) |

---

## 10. Reserved slots for 1.0 (not shown in 0.1)

Founder's decision: AI tools, payments and subscriptions are **not visible** in 0.1 — no disabled button, no "coming soon", no visual hint. In the mockups these places are marked only with an HTML comment.

| Slot | Location in the layout | In 0.1 |
|---|---|---|
| Student home | After "My tasks" and before "Questions" (`<!-- slot: tools (1.0) -->`) | Does not exist |
| Student bottom bar | The fifth slot "Path" could become "Tools" in 1.0 | "Path" |
| Student file | A "Tool outputs" tab after "Questions" (`progress-tracking.md` section 8) | Does not exist |
| Task detail (coach) | An "AI feedback" block above the review form | Does not exist |
| Student task | "Quick check before submitting" above the submission form | Does not exist |
| Admin settings | A "Tools and quota" group | Does not exist |

---

## 11. Implementation notes (Tailwind + shadcn)

- Keep the `--c-*`, `--h-*`, `--st-*`, `--av-*` variables in `globals.css` as they are and define them as colors in `tailwind.config` (`primary: 'var(--c-primary)'` …). Mapping to the shadcn variables: `--background`←`--c-bg`, `--card`←`--c-surface`, `--muted`←`--c-surface-2`, `--muted-foreground`←`--c-text-2`, `--border`←`--c-border`, `--input`←`--c-border-strong`, `--primary`←`--c-primary`, `--ring`←`--c-focus`, `--destructive`←`--h-solid`.
- shadcn's base `radius` = 12px (`--r-md`); button and field 8.
- Tailwind v3.3+ has logical classes (`ms-*`, `me-*`, `ps-*`, `start-*`, `end-*`, `border-s-*`); do not use `ml/mr/left/right` (lint rule).
- Spacing matches Tailwind's default scale (4px): `--sp-5` = `p-5` = 20px.
- Directional icon: class `rtl:-scale-x-100`.
- Font weights in Tailwind: `font-extrabold` (800) only for KPIs.

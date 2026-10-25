# کارهای پیگیری پس از اسپرینت‌های ۱ تا ۴ (نسخه‌ی 0.1)

> نویسنده: software-architect — ۳۰ مهر ۱۴۰۵. منبع: تطبیق `docs/04-architecture/**` با کد اسپرینت‌های ۱ تا ۴ (یادداشت‌های `sprint-1.md` تا `sprint-4.md`، `routes.manifest.ts`، migrationهای `0001` تا `0004`).
> این فایل فقط فهرست کار است. حکم و دلیل هر مورد در سند ارجاع‌شده آمده است. software-architect کدی ننوشته است.
> **اولویت:** «بالا» = پیش از استقرار یا پیش از دعوت اولین کاربر واقعی، یا کد با الزامی در `security.md` فرق دارد. «متوسط» = پیش از بتا. «پایین» = بک‌لاگ.

## خلاصه
| # | عنوان | مالک | اولویت |
|---|---|---|---|
| F-01 | ماندگار کردن «دعوت پذیرفته شد» روی `users` و نمایش در پرونده (SEC-T5) — **بک‌اند انجام شد؛ UI باقی است** | backend، frontend | **بالا** |
| F-02 | `PATCH /users/:id` و `PATCH /users/:id/role` — **بک‌اند انجام شد؛ UI باقی است** | backend، frontend | **بالا** |
| F-03 | قاعده‌ی Biome `noRestrictedImports` برای مسیرهای هنرجو (T-STATIC) — **انجام شد** | devops، backend | **بالا** |
| F-04 | فهرست محلی حدود ۱۰۰ هزار رمز ممنوع (SEC-P3) — **انجام شد** | backend | **بالا** |
| F-05 | T-LOG کامل (آپلود و CSV) — **انجام شد** | backend، qa | **بالا** |
| F-06 | `POST /auth/reauth` (SEC-S7) پیش از دعوت دومین مدیر — **بک‌اند انجام شد؛ UI باقی است** | backend، frontend | **بالا** (مشروط) |
| F-07 | تأیید انحراف‌های پذیرفته‌شده از `security.md` — **بسته شد** (۲۹ مهر ۱۴۰۵) | security-reviewer | ~~بالا~~ |
| F-08 | هم‌سان‌سازی `/healthz` با SEC-J4 و پرچم کهنگی sweep — **بک‌اند انجام شد؛ هشدار devops باقی است** | backend، devops | **بالا** |
| F-09 | SLA جدای بازبینی کار غیرگیت (`reviewHoursNonGate` = ۷۲) — **بک‌اند انجام شد؛ فیلد فرم تنظیمات باقی است** | backend | متوسط |
| F-10 | `pg_trgm` روی Azure Flexible Server پیش از اولین migration | devops | **بالا** |
| F-11 | صفحه‌ی «دستگاه‌های من» (SEC-F3) | frontend | **بالا** |
| F-12 | صفحه‌ی حریم خصوصی و لینکش در `/invite` و `/reset` (SEC-F4) | frontend، product | **بالا** |
| F-13 | اندازه‌گیری زمان argon2 روی App Service B1 (SEC-P4) | devops، backend | **بالا** |
| F-14 | هشدار «سلامت کهنه» در UI مدیر (ADR-0005) — **بک‌اند انجام شد؛ UI باقی است** | frontend، backend | متوسط |
| F-15 | تست `413` multipart با `Content-Length` اعلام‌شده — **انجام شد** | backend، qa | پایین |
| F-16 | ویرایش پیام سؤال تا ۱۵ دقیقه | backend، frontend | پایین |
| F-17 | پارامترهای پرس‌وجو (موبایل، یادداشت داخلی، هش رمز) در لاگ خطای دیتابیس — **انجام شد** | backend | **بالا** |
| F-18 | `TRUSTED_PROXY_HOPS` در تولید الزامی شود (وگرنه یک IP برای همه و قفل سراسری ورود) — **بک‌اند انجام شد؛ runbook devops باقی است** | backend، devops | **بالا** |
| F-19 | کنترل‌های امنیتی CI: `pnpm audit`، gitleaks، رد `"use server"`، Dependabot — **انجام شد** (۳۰ مهر ۱۴۰۵؛ اجرای واقعی روی GitHub مانده) | devops | **بالا** |

> **اجرای بک‌اند (backend-engineer، ۳ آبان ۱۴۰۵):** lint تمیز است، typecheck تمیز است و build موفق شد. نتیجه‌ی test: ۱۵۰۵ از ۱۵۰۷ پاس شد. دو شکست در `src/components/auth/accept-token-form.test.ts` (فرانت‌اند) بود که با timeout در jsdom زیر بار کامل رخ داد؛ همین فایل به‌تنهایی ۱۰ از ۱۰ پاس می‌شود. migration تازه‌ی `0005_invite_accepted_session_reauth.sql` روی دیتابیس dev (5432) **اجرا نشده است** و project-lead آن را با `pnpm db:migrate` اجرا می‌کند.

---

## F-01 — ماندگار کردن «دعوت پذیرفته شد» (SEC-T5) — بالا
- **فایل‌ها:** `apps/web/src/modules/identity/schema.ts`، migration تازه (`0005_…`)، `identity/service.ts` (پذیرش توکن)، `identity/repo.ts` و `contracts.ts` (`GET /users`)، `students/contracts.ts` و repo (`StaffStudentDTO`)، `identity/service.ts` (`eraseUser`)، صفحه‌ی پرونده‌ی کارکنان.
- **کار:** دو ستون `users.invite_accepted_at timestamptz` و `users.invite_accepted_user_agent text` (حداکثر ۵۱۲) که در همان تراکنش مصرف توکن **`invite`** پر می‌شوند. `GET /users` از این ستون‌ها بخواند. `StaffStudentDTO` هم `inviteAcceptedAt` و `inviteAcceptedDevice` بگیرد و پرونده آن را نشان دهد. `eraseUser` ستون User-Agent را `null` کند. migration داده: ستون‌ها را از `auth_tokens` مصرف‌شده‌ی موجود پر کند.
- **دلیل:** `auth.cleanup` توکن‌ها را ۷ روز پس از مصرف حذف می‌کند و برچسب ناپدید می‌شود؛ SEC-T5 نمایش را در صفحه‌ی کاربران **و پرونده** می‌خواهد و پرونده آن را ندارد. تصمیم: ADR-0003 بند 9-9، `data-model.md` ۲-۱ و ۶-۱.
- **وضعیت (backend-engineer، ۱ آبان ۱۴۰۵): بک‌اند انجام شد؛ UI باقی است.**
  - migration `drizzle/0005_invite_accepted_session_reauth.sql`: ستون‌های `users.invite_accepted_at` و `users.invite_accepted_user_agent` (CHECK حداکثر ۵۱۲ نویسه)، به‌علاوه‌ی یک گام داده‌ی دستی. این گام آخرین توکن دعوت مصرف‌شده‌ی هر کاربر را کپی می‌کند؛ برای کاربر حذف‌شده User-Agent کپی نمی‌شود. ستون `sessions.reauth_at` (F-06) هم در همین migration است.
  - `acceptToken` فقط برای `purpose='invite'` و در همان تراکنش این ستون‌ها را می‌نویسد. بازنشانی رمز آن‌ها را عوض نمی‌کند. `GET /users` از این ستون‌ها می‌خواند و join با `auth_tokens` حذف شد. `eraseUser` User-Agent را `null` می‌کند و زمان را نگه می‌دارد.
  - فیلدهای افزودنی: `StaffStudentDTO.inviteAcceptedAt` و `StaffStudentDTO.inviteAcceptedDevice` (User-Agent خام). این دو در `GET /students/:id` و هر پاسخی که این DTO را دارد می‌آیند. `UserListItemDTO.updatedAt` هم برای `ifUpdatedAt` اضافه شد. DTO هنرجو این فیلدها را ندارد.
  - **UI (frontend-engineer):** «دعوت پذیرفته شد: زمان، نوع دستگاه» در سربرگ پرونده‌ی کارکنان (از `StaffStudentDTO.inviteAcceptedAt` و `inviteAcceptedDevice`) و در صفحه‌ی کاربران (از `GET /users`) نمایش داده شود. تبدیل User-Agent به نام خوانا (مثلاً «Chrome روی اندروید») کار UI است.

## F-02 — `PATCH /users/:id` و `/role` — بالا
- **فایل‌ها:** `modules/identity/{service,contracts,repo}.ts`، `app/api/v1/users/[id]/route.ts` و `users/[id]/role/route.ts`، `routes.manifest.ts`، `students` (`buildSearchText`)، صفحه‌ی مدیریت کاربران.
- **کار:** طبق `api.md` بخش ۳: نام، موبایل، `active`/`disabled`؛ تغییر نقش با `409` برای آخرین مدیر و برای هنرجو؛ ابطال همه‌ی نشست‌ها با غیرفعال‌سازی، تغییر نقش و تغییر موبایل (`audit_log`: `user.phone_changed`، `user.role_changed`، `session.revoked_all`)؛ روی کاربر `erasedAt` ← `409`. اگر هدف هنرجوست، `students.search_text` در همان تراکنش بازسازی شود. تست T-ESC «مشاور `PATCH /users/:id/role` ← `403`» و T-SESSION برای این سه ابطال.
- **دلیل:** بدون این مسیرها راهی برای غیرفعال کردن فوری مشاوری که رفته نیست (SEC-S4، ADR-0003 بند 9-13). **پیش از دعوت اولین مشاور.**
- **وضعیت (backend-engineer، ۱ آبان ۱۴۰۵): بک‌اند انجام شد؛ UI باقی است.**
  - `PATCH /api/v1/users/:id` (فقط مدیر) با بدنه‌ی `{ displayName?, phone?, status?: 'active'|'disabled', ifUpdatedAt? }` و پاسخ `UserListItemDTO`.
    - خطاها: بدنه‌ی خالی ← `422`؛ `ifUpdatedAt` کهنه ← `409`؛ موبایل تکراری ← `409 PHONE_TAKEN`؛ کاربر حذف‌شده ← `409`؛ غیرفعال کردن آخرین مدیر فعال ← `409`؛ `active` روی کاربر `invited` ← `409` (لینک دعوت تازه لازم است).
    - غیرفعال‌سازی همه‌ی نشست‌ها **و لینک‌های باز** را باطل می‌کند. تغییر موبایل همه‌ی نشست‌ها را باطل می‌کند. تغییر نام به‌تنهایی نشست‌ها را نگه می‌دارد.
    - `audit_log`: `user.updated`، `user.phone_changed` (بدون شماره)، `user.disabled` یا `user.enabled`، و `session.revoked_all`.
    - برای هنرجو، `students.search_text` در همان تراکنش بازسازی می‌شود (`students/search-text.ts`).
  - `PATCH /api/v1/users/:id/role` (فقط مدیر) با بدنه‌ی `{ role: 'admin'|'mentor' }` و پاسخ `UserListItemDTO`.
    - هدف هنرجو ← `409`؛ `role: 'student'` ← `422`؛ برداشتن آخرین مدیر فعال ← `409`؛ همان نقش ← `200` بدون تغییر.
    - تغییر واقعی همه‌ی نشست‌ها را باطل می‌کند و `user.role_changed` را ثبت می‌کند، به‌همراه لاگ هشدار برای SEC-L6. این مسیر رمز تازه می‌خواهد (F-06).
  - هم‌زمانی شرط «آخرین مدیر» با advisory lock `identity.admin_set` و `SELECT … FOR UPDATE` سریال شده است.
  - تست‌ها در `tests/integration/followups-hardening.test.ts`: T-ESC (مشاور ← `403`)، T-SESSION برای غیرفعال‌سازی، تغییر نقش و تغییر موبایل، و آخرین مدیر در دیتابیس جدا.
  - **UI (frontend-engineer):** صفحه‌ی مدیریت کاربران با ویرایش نام و موبایل، دکمه‌ی غیرفعال/فعال، تغییر نقش (با جریان `REAUTH_REQUIRED` از F-06)، و نمایش پیام‌های `409`.

## F-03 — Biome `noRestrictedImports` (T-STATIC) — بالا
- **فایل:** `biome.json` (+ در صورت نیاز تست ساده‌ی import در CI).
- **کار:** import ماژول `health` و توابع یادداشت داخلی (`timeline/repo` جز `listSharedNotesForStudent`، `timeline/service` کارکنان) در `app/(student)/**` و `app/api/v1/me/**` خطا شود.
- **دلیل:** ADR-0004 بخش ۳ بند ۳ و T-STATIC در `security.md` بخش ۶. امروز فقط DTO جدا و تست canary مانع نشت‌اند.
- **وضعیت (backend-engineer، ۱ آبان ۱۴۰۵): انجام شد.**
  - در `biome.json` یک override برای `apps/web/src/app/(student)/**` و `apps/web/src/app/api/v1/me/**` اضافه شد. قاعده‌ی `style/noRestrictedImports` در سطح error سه الگو دارد:
    1. هر import از `modules/health`، با alias یا مسیر نسبی، چه مقدار چه type.
    2. از `modules/timeline/repo` هر نامی جز `listSharedNotesForStudent`.
    3. از `modules/timeline/service` هر نامی جز `listOwnSharedNotes`.
  - تست `tests/integration/t-static.test.ts` همین پیکربندی را روی فایل‌های نمونه در یک پوشه‌ی موقت اجرا می‌کند؛ چیزی در `src/` نوشته نمی‌شود. تست هم خطا در مسیرهای هنرجو و هم نبود خطا در `(staff)` را می‌سنجد.
  - Biome 2.5 لنگر `^…$` را در `importNamePattern` نمی‌پذیرد، چون خودش آن را ضمنی فرض می‌کند.
  - **اجرا روی فایل‌های فعلی فرانت‌اند:** `biome lint --only=style/noRestrictedImports` روی `app/(student)` و `app/api/v1/me` هیچ خطایی نداد. فایلی برای اصلاح frontend-engineer نیست.

## F-04 — فهرست رمزهای ممنوع (SEC-P3) — بالا
- **فایل:** `modules/identity/common-passwords.ts` (یا فایل داده‌ی جدا که در شروع بار می‌شود).
- **کار:** فهرست محلی حدود ۱۰۰ هزار رمز رایج و لورفته (حدود ۱ مگابایت)، با جستجوی `Set`، بدون API خارجی؛ نرمال‌شده با همان `normalizePassword`.
- **دلیل:** فعلاً حدود ۲۰۰ مورد است؛ ADR-0003 بخش ۳ و بند 9-11.
- **وضعیت (backend-engineer، ۱ آبان ۱۴۰۵): انجام شد.**
  - **منبع:** SecLists (https://github.com/danielmiessler/SecLists)، **مجوز MIT** (Copyright (c) 2018 Daniel Miessler)، کامیت `10a38f6cbe8ed6b89d55348756eff7486cd0f0ea` (HEAD شاخه‌ی master در ۳۰ مهر ۱۴۰۵).
  - دو فایل از `Passwords/Common-Credentials/` استفاده شد:
    - `100k-most-used-passwords-NCSC.txt` (sha256 `c2e5696882c603b76bb67a47ee970897e5a76fc4c3f5547abe3d0ca340c576e0`)
    - `Pwdb_top-1000000.txt` (sha256 `e9a88f67aafe65496682dc374559ee714e978bee50314767494c3e37a18c9fc8`)
  - فایل‌ها در یک پوشه‌ی جدا و موقت بیرون از مخزن (scratchpad) دانلود شدند و فقط به‌عنوان متن خوانده شدند. هیچ اسکریپتی از آن‌ها اجرا نشد.
  - `scripts/build-common-passwords.ts` دستی اجرا می‌شود و خودش چیزی دانلود نمی‌کند. روش انتخاب:
    - هر مورد با همان `normalizePassword` نرمال و به حروف کوچک تبدیل می‌شود.
    - فقط ASCII چاپ‌شدنی با ۸ تا ۱۲۸ نویسه می‌ماند (کوتاه‌ترها را قاعده‌ی طول رد می‌کند).
    - اول همه‌ی NCSC (۴۶٬۴۵۳ مورد)، بعد Pwdb به ترتیب فراوانی (۵۳٬۵۴۷ مورد)، تا **۱۰۰٬۰۰۰** مورد یکتا.
  - خروجی: `src/modules/identity/common-passwords.data.ts`، حدود ۱٫۰۸ مگابایت. سربرگ آن منبع، کامیت، checksumها و متن کامل مجوز MIT را دارد. این فایل از Biome مستثناست.
  - `common-passwords.ts` یک Set می‌سازد که بار اول استفاده ساخته می‌شود و فهرست دستی ایرانی قبلی را هم دارد. `normalizePassword` به `password-normalize.ts` منتقل شد و از `password.ts` دوباره export می‌شود؛ امضایش تغییر نکرد.

## F-05 — T-LOG کامل — بالا
- **فایل‌ها:** `tests/integration/` (تست تازه)، `server/logger.ts` در صورت یافتن نشت.
- **کار:** جمع کردن لاگ یک جریان کامل (دعوت ← پذیرش ← ورود ناموفق ← ورود ← جستجو با موبایل ← **آپلود** ← **خروجی و ورود CSV**) و جستجوی موبایل کامل، توکن، مقدار کوکی، `$argon2id$` و `X-Job-Secret`.
- **دلیل:** T-LOG در `security.md` بخش ۶؛ اسپرینت ۱ فقط بخشی را پوشش داد.
- **وضعیت (backend-engineer، ۱ آبان ۱۴۰۵): انجام شد.** تست `tests/integration/t-log.test.ts`.
  - **جریان:** دعوت هنرجو ← lookup و پذیرش ← ورود ناموفق (موبایل موجود و ناموجود) ← ورود ← جستجوی کارکنان با موبایل در query ← آپلود ← سه خروجی CSV ← ورود CSV واقعی (با `inviteUrl` در پاسخ و یک ردیف نامعتبر) ← endpoint داخلی jobs و یک درخواست API، هر دو با سرآیند `X-Job-Secret`.
  - **بررسی:** لاگ همه‌ی سطوح logger جمع می‌شود. این موارد نباید در آن باشند: الگوی موبایل کامل و هر شکل دیگر موبایل، توکن و لینک دعوت (هر دو دعوت)، مقدار کوکی نشست و دستگاه، رمز، هش واقعی، `$argon2id$` و مقدار secret.
  - **نتیجه:** نشتی پیدا نشد. تنها نشت واقعی همان F-17 بود.

## F-06 — `POST /auth/reauth` (SEC-S7) — بالا (مانع دعوت دومین مدیر)
- **فایل‌ها:** migration (`sessions.reauth_at`)، `identity`، مسیر تازه، و بررسی در خروجی CSV، `POST /invitations` (نقش admin/mentor)، `PATCH /users/:id/role`، `PUT /settings` (کلید `access`).
- **دلیل:** ADR-0003 بخش ۸ و بند 9-12. تا ساخته نشده، **دعوت دومین مدیر انجام نشود** (project-lead این را در STATUS ثبت کند).
- **وضعیت (backend-engineer، ۱ آبان ۱۴۰۵): بک‌اند انجام شد؛ UI باقی است.**
  - `POST /api/v1/auth/reauth` برای هر کاربر واردشده، با بدنه‌ی `{ password }`. پاسخ موفق `200 { validUntil }` است و `sessions.reauth_at = now()` ثبت می‌شود، همراه با `audit_log(session.reauth)`.
  - رمز غلط ← `422 fields.password`. شمارش در همان قفل `pwchange:u:<id>` انجام می‌شود، پس change-password و reauth روی هم حداکثر ۵ بار در ۱۵ دقیقه مجازند و بعد `429` می‌آید.
  - «رمز تازه» یعنی `max(sessions.created_at, sessions.reauth_at)` کمتر از **۳۰ دقیقه** پیش باشد؛ پس ورود و change-password هم حساب می‌شوند.
  - کد خطای تازه: **`403 REAUTH_REQUIRED`** با پیام «برای این کار اول رمزت را دوباره وارد کن.»
  - این بررسی فقط برای مدیر اعمال می‌شود؛ نقش‌های دیگر همان `403 FORBIDDEN` قبلی را می‌گیرند. مسیرها:
    - `GET /exports/students.csv`، `tasks.csv` و `milestones.csv`
    - `POST /invitations`
    - `PATCH /users/:id/role`
    - `PUT /settings` وقتی بدنه کلید `access` دارد، و `PUT /settings/access`
  - سمت سرور: فیلد افزودنی `lastPasswordAt` در `AuthenticatedSession` و `AuthenticatedRequest`، و تابع `requireRecentPassword(auth)` در `server/auth/request.ts`.
  - **UI (frontend-engineer):** هر جا پاسخ `403` با `error.code = 'REAUTH_REQUIRED'` آمد، پنجره‌ی «رمزت را دوباره وارد کن» باز شود، `POST /api/v1/auth/reauth` فرستاده شود و همان درخواست تکرار شود. دانلود CSV با لینک ساده (`<a href>`) این کد را نمی‌بیند؛ یا با fetch انجام شود یا پیش از دانلود reauth گرفته شود.
  - **پیامد:** شرط «پیش از دعوت دومین مدیر» از سمت بک‌اند برآورده است. پس از ساخت UI، project-lead یادداشت STATUS را بردارد.

## F-07 — تأیید انحراف‌های پذیرفته‌شده از `security.md` — **بسته شد** (security-reviewer، ۲۹ مهر ۱۴۰۵)
> **نتیجه:** `docs/06-quality/security-review-2026-10-21.md` بخش ۱. هر پنج مورد زیر **قابل‌قبول** است و متن SEC-S1، SEC-C3، SEC-R6 و SEC-U6 در `security.md` اصلاح شد. مورد ۵ **با شرط** پذیرفته شد: T-DTO و T-CANARY همچنان `reviewerId` و موبایل کارکنان را بگردند. انحراف‌های دیگر هم بررسی شدند: `422` یکسان برای شناسه‌ی ارجاعی **قابل‌قبول** است (oracle ندارد). پاک شدن توکن‌ها پس از ۷ روز **با شرط** پذیرفته شد: F-01 پیش از دعوت اولین هنرجوی واقعی ساخته شود. باقی موارد ADR-0003 بند ۹، ADR-0004 بند ۶ و ADR-0010 **قابل‌قبول‌اند**. بازبینی کد سه یافته‌ی تازه داشت: F-17، F-18 و F-19.

security-reviewer هر مورد را بپذیرد (و متن الزام را اصلاح کند) یا رد کند (که آن‌وقت کار کدی می‌شود):
1. **SEC-S1:** `Max-Age` کوکی = سقف مطلق نشست، نه انقضای لغزنده (ADR-0003 بند 9-1). فایل: `identity/service.ts` (`cookieExpiresAt`).
2. **SEC-C3:** POST بی‌بدنه بدون `Content-Type` پذیرفته می‌شود (بند 9-2). فایل: `server/http/csrf.ts` و `route()`.
3. **SEC-R6:** بدنه‌ی `429` علاوه بر `retryAfterSeconds`، `code` و پیام فارسی ثابت با دقیقه‌ی مانده دارد (بند 9-3).
4. **SEC-U6:** `GET /attachments/:id` با `Cache-Control: private, no-store` (سخت‌گیرتر از `no-cache`).
5. **DTO هنرجو:** `StudentReviewDTO.reviewer.displayName` (نام بازبین، نه شناسه؛ ADR-0004 بند 6-5).

## F-08 — `/healthz` مطابق SEC-J4 + کهنگی sweep — بالا
- **فایل:** `apps/web/src/app/healthz/route.ts` (+ پیکربندی هشدار devops).
- **کار:** پاسخ `{ ok: true, db: 'ok', lastHealthSweepAt, version, sweepStale }`؛ خطا `503 { ok: false, db: 'fail' }`. `version` از متغیر build (مثلاً SHA کامیت). `sweepStale = true` اگر آخرین sweep قدیمی‌تر از ۳ ساعت است. اگر HEALTHCHECK کانتینر یا مانیتورینگ به `status` وابسته است، هم‌زمان اصلاح شود.
- **دلیل:** کد `{ status, db: 'unreachable' }` بدون `version` برمی‌گرداند (SEC-J4، `api.md` بخش ۱۵)؛ ADR-0005 و ADR-0007 هشدار کهنگی می‌خواهند.
- **وضعیت (backend-engineer، ۱ آبان ۱۴۰۵): بک‌اند انجام شد؛ هشدار devops باقی است.**
  - `GET /healthz`: پاسخ موفق `200 { ok: true, db: 'ok', lastHealthSweepAt, version, sweepStale }` و خطای دیتابیس `503 { ok: false, db: 'fail' }`، با `Cache-Control: no-store`. لاگ خطا فقط نوع، SQLSTATE و constraint را دارد (F-17).
  - `version` از متغیر محیطی تازه و اختیاری **`APP_VERSION`** خوانده می‌شود (فقط `[\w.+-]{1,64}`؛ اگر نباشد `'dev'`).
  - `sweepStale` (تابع `getHealthFreshness` در `health/recompute.ts`) یعنی **قدیمی‌ترین** `computed_at` میان هنرجوهای `active` و `paused` بیش از ۳ ساعت است. «آخرین» نتیجه کافی نیست، چون محاسبه‌ی پس از هر اقدام آن را تازه نگه می‌دارد حتی وقتی job از کار افتاده است. اگر هیچ نتیجه‌ای نباشد (نصب تازه)، `false` است.
  - HEALTHCHECK کانتینر در `Dockerfile` فقط کد HTTP را می‌بیند و به فیلد `status` وابسته نبود، پس تغییری لازم نشد.
  - **devops:** `APP_VERSION=<SHA کامیت>` در build یا استقرار ست شود (`Dockerfile` بیرون از مرز بک‌اند است). هشدار مانیتورینگ روی `sweepStale = true` و روی `503` تنظیم شود.

## F-09 — SLA بازبینی کار غیرگیت — متوسط
- **فایل‌ها:** `modules/catalog` (schema و پیش‌فرض `sla`)، `modules/tasks/service.ts` (`getReviewQueue`، حدود خط ۱۱۶۵)، `modules/today/service.ts`، `GET /settings/staff`، فرم تنظیمات.
- **کار:** کلید `sla.reviewHoursNonGate` (پیش‌فرض ۷۲؛ مقدار ذخیره‌شده‌ی بدون این کلید با ۷۲ پر شود). آستانه = `required_for_gate ? reviewHours : reviewHoursNonGate`، در صف بازبینی، `waitingOnUs` و شمارنده‌ها.
- **دلیل:** `mentor-workflow.md` بخش ۴ (گیت ۴۸، غیرگیت ۷۲)؛ تصمیم در `data-model.md` ۲-۲ و ۴-۳ (سؤال باز اسپرینت ۳ و ۴).
- **وضعیت (backend-engineer، ۱ آبان ۱۴۰۵): بک‌اند انجام شد؛ فیلد فرم تنظیمات باقی است.**
  - `slaSettingsSchema.reviewHoursNonGate` با `.default(72)`: مقدار ذخیره‌شده‌ی قدیمی بدون این کلید، بدون migration، ۷۲ خوانده می‌شود. `SETTINGS_DEFAULTS.sla.reviewHoursNonGate = 72`.
  - تابع `reviewSlaHours(requiredForGate, sla)` در `tasks/service.ts` آستانه را برای صف بازبینی (`slaHours`، `breached`، `warning`) می‌دهد. `waitingOnUs` و `counts.breachedReviews` در «امروز» هم از همین صف می‌آیند.
  - فیلد افزودنی `StaffSettingsDTO.sla.reviewHoursNonGate` در `GET /settings/staff`.
  - **UI (frontend-engineer):** `SlaSettingsForm` در `components/settings/settings-forms.tsx` این فیلد را ندارد. چون PUT کل مقدار `sla` را می‌فرستد، ذخیره‌ی فرم فعلی هر مقدار غیرپیش‌فرض این کلید را به ۷۲ برمی‌گرداند. یک فیلد «بازبینی کار غیرگیت (ساعت)» اضافه شود.

## F-10 — `pg_trgm` روی Azure — بالا (پیش از اولین migration روی میزبان)
- **فایل‌ها:** IaC/runbook استقرار (devops)؛ `apps/web/drizzle/0002_students_path.sql` **بی‌تغییر**.
- **کار:** پارامتر سرور `azure.extensions` شامل `PG_TRGM`؛ نقش migrate عضو `azure_pg_admin`. جایگزین در runbook: ساخت یک‌باره‌ی افزونه با نقش مدیر (migration با `IF NOT EXISTS` رد می‌شود).
- **دلیل:** بدون آن migration `0002` روی Azure شکست می‌خورد؛ تصمیم در `data-model.md` بخش ۰.

## F-11 — صفحه‌ی «دستگاه‌های من» (SEC-F3) — بالا
- **فایل‌ها:** `app/(account)/account/…`، کامپوننت تازه در `components/auth/`.
- **کار:** فهرست `GET /auth/sessions` (دستگاه، IP، آخرین استفاده، «همین دستگاه») + خروج تک‌تک با `DELETE /auth/sessions/:id` + «خروج از همه‌ی دستگاه‌های دیگر».
- **دلیل:** API از اسپرینت ۱ آماده است ولی UI ندارد؛ SEC-F3 «باید» است.

## F-12 — صفحه‌ی حریم خصوصی (SEC-F4، ADR-0010 بند ۷) — بالا (پیش از ورود داده‌ی واقعی)
- **فایل‌ها:** صفحه‌ی عمومی تازه (مثلاً `app/privacy/page.tsx`)، لینک در `/invite`، `/reset` و `/account`.
- **کار:** محل نگه‌داری داده، چه چیزی ذخیره می‌شود، مهلت ۳۰ روزه‌ی حذف، و ماندن تا ۸ هفته در پشتیبان رمزشده. متن نهایی به محل میزبانی (E1) و تأیید بنیان‌گذار (S1) وابسته است.

## F-13 — زمان argon2 روی B1 (SEC-P4) — بالا (پیش از استقرار)
- **کار:** اندازه‌گیری روی App Service B1 (محلی حدود ۲۵ میلی‌ثانیه است؛ هدف ۵۰ تا ۲۵۰). اگر کمتر از ۵۰ بود، `timeCost` بالا برود (rehash خودکار در ورود موجود است). فایل: `modules/identity/password.ts`.

## F-14 — هشدار «سلامت کهنه» در UI مدیر — متوسط
- **فایل‌ها:** `modules/health/service.ts` یا `today` (افزودن `lastHealthSweepAt` به DTO مدیر)، صفحه‌ی «امروز».
- **کار:** اگر آخرین sweep یا `computedAt` قدیمی‌تر از ۳ ساعت است، هشدار کوچک برای مدیر (ADR-0005 «پیامدها»).
- **وضعیت (backend-engineer، ۱ آبان ۱۴۰۵): بک‌اند انجام شد؛ UI باقی است.** فیلد افزودنی **`TodayDTO.healthFreshness`** فقط برای مدیر می‌آید، نه برای مشاور: `{ lastHealthSweepAt, oldestComputedAt, stale, staleAfterHours: 3 }`. قاعده‌ی آن همان `sweepStale` در `/healthz` است.
  - **UI (frontend-engineer):** در صفحه‌ی «امروز» مدیر، اگر `healthFreshness.stale` بود، هشدار کوچک «وضعیت‌های سلامت از … به‌روز نشده‌اند» نمایش داده شود.

## F-15 — تست `413` multipart — پایین
- **فایل:** `tests/integration/attachments.test.ts`.
- **کار:** درخواست multipart با `Content-Length` بیش از سقف که helper تست آن را بازنویسی نکند (مسیر JSON همین تست را با `readBodyBytes` دارد). از `sprint-3.md` مانده است.
- **وضعیت (backend-engineer، ۱ آبان ۱۴۰۵): انجام شد.** تست در `tests/integration/followups-hardening.test.ts` است، نه `attachments.test.ts`، تا فایل موجود دست نخورد. یک Request دستی با `Content-Length` ۶ مگابایتی و بدنه‌ی جریانی که مصرفش شمرده می‌شود فرستاده می‌شود. نتیجه `413 PAYLOAD_TOO_LARGE` است و کمتر از ۵۱۲ کیلوبایت از جریان خوانده می‌شود.

## F-16 — ویرایش پیام سؤال — پایین (بک‌لاگ)
- **کار:** `PATCH /questions/:id/messages/:messageId` فقط نویسنده و فقط تا ۱۵ دقیقه، با `edited_at`. در 0.1 عمداً ساخته نمی‌شود (`data-model.md` ۲-۸، `api.md` بخش ۱۰).

## F-17 — پارامترهای پرس‌وجو در لاگ خطا — بالا (پیش از ورود داده‌ی واقعی)
- **شدت:** متوسط. منبع: security-review-2026-10-21، N1.
- **فایل‌ها:** `apps/web/src/server/http/handler.ts:184-195` (`describeError`)، `modules/health/recompute.ts:137-140`، `modules/files/service.ts:232-235`، تابع کمکی تازه در `server/` (مثلاً `safeErrorSummary`)، `tests/integration/` (T-LOG).
- **مشکل:** `drizzle-orm` 0.45 هر خطای دیتابیس را در `DrizzleQueryError` می‌پیچد و پیامش SQL **و همه‌ی پارامترها** را دارد. `describeError` آن را با `message` و `stack` لاگ می‌کند. ری‌استارت Azure، deadlock یا نقض CHECK روی INSERT یادداشت، کاربر یا تحویل، متن یادداشت داخلی، موبایل، نام یا هش argon2 را در لاگ ۳۰ روزه می‌نویسد (نقض SEC-L3 و SEC-L4).
- **کار:** برای خطایی که `query` یا `params` دارد، فقط `type`، `cause.code` (SQLSTATE)، `constraint` و `table` لاگ شود؛ بدون `message`، `params`، `detail` و `stack`. همین تابع در دو محل دیگر هم استفاده شود. تست T-LOG: یک نقض عمدی روی INSERT یادداشت با متن `CANARY-…` نباید در لاگ دیده شود.
- **وضعیت (backend-engineer، ۱ آبان ۱۴۰۵): انجام شد.**
  - تابع `safeError` در `server/logger.ts` برای خطای دیتابیس فقط `{ type, database: true, code, constraint, table }` را برمی‌گرداند؛ بدون `message`، پارامترها، `detail` و `stack`. خطای دیتابیس یعنی `DrizzleQueryError`، یا خطایی که `query`، `params` یا SQLSTATE در خودش یا در `cause` دارد.
  - محل‌های استفاده: `describeError` در handler، `health.recompute_failed`، `health.sweep_failed`، `files.delete_failed` و `/healthz`. همین تابع serializer pino برای کلیدهای `err` و `error` هم هست، پس `pool error` و `pg-boss error` هم پوشش دارند.
  - تست: یک نقض واقعی `users_phone_key` که پارامترهایش موبایل، متن «یادداشت داخلی» و هش argon2 است. تست اول تأیید می‌کند که خطای خام واقعاً موبایل را دارد. بعد هم مسیر handler و هم خروجی واقعی pino با serializerها بررسی می‌شوند.

## F-18 — `TRUSTED_PROXY_HOPS` در تولید — بالا (پیش از استقرار)
- **شدت:** متوسط. منبع: security-review-2026-10-21، N2.
- **فایل‌ها:** `apps/web/src/server/env.ts:16, 44`، `server/http/client-ip.ts:27`، runbook استقرار (devops).
- **مشکل:** پیش‌فرض `0` است و production آن را الزامی نمی‌کند. روی App Service بدون آن، IP همه‌ی کاربران `unknown` می‌شود و هیچ هشداری هم ثبت نمی‌شود. آن‌وقت ۳۰ ورود غلط از هر کسی در ۱۵ دقیقه **ورود همه** را می‌بندد (کوکی دستگاه این را دور نمی‌زند)، ۳۰ lookup غلط همه‌ی دعوت‌ها را می‌بندد، و ۵ رمز غلط حساب مدیر را قفل می‌کند (R4 دوباره باز می‌شود).
- **کار:** در `NODE_ENV=production` مقدار صریح الزامی شود (بدون پیش‌فرض)؛ `0` فقط با پرچم صریح دیگر. اگر `X-Forwarded-For` با `hops=0` رسید، هشدار یک‌باره لاگ شود. در runbook مقدار `1` برای App Service ثبت شود، و پس از استقرار بررسی شود که `sessions.ip` آخرین ورود IP واقعی و بدون پورت است (SEC-R4). اگر بعداً CDN یا پراکسی دیگری اضافه شد، عدد به‌روز شود.
- **وضعیت (backend-engineer، ۱ آبان ۱۴۰۵): بک‌اند انجام شد؛ runbook devops باقی است.**
  - پیش‌فرض در `env.ts` برداشته شد. در `NODE_ENV=production` اگر `TRUSTED_PROXY_HOPS` نباشد یا خالی باشد، برنامه بالا نمی‌آید. `0` مقدار صریح معتبر است. بیرون از production پیش‌فرض همان `0` است.
  - پرچم جدایی برای «۰ صریح» ساخته نشد، چون نوشتن مقدار صریح خودش تصمیم آگاهانه است.
  - اگر `X-Forwarded-For` با `hops=0` برسد، هشدار `http.xff_ignored` یک‌بار در هر پردازه لاگ می‌شود.
  - تست واحد در `env.test.ts` و `client-ip.test.ts`. `docker-compose.yml` از قبل پیش‌فرض `1` دارد.
  - **devops:** `TRUSTED_PROXY_HOPS=1` در App Settings و runbook ثبت شود، و پس از استقرار `sessions.ip` بررسی شود.

## F-19 — کنترل‌های امنیتی CI و Dependabot — بالا (پیش از استقرار)
- **شدت:** متوسط. منبع: security-review-2026-10-21، N3.
- **فایل‌ها:** `.github/workflows/ci.yml`، `.github/dependabot.yml` (تازه)، فایل استثنای audit (تازه).
- **مشکل:** CI فقط lint، typecheck، test و build دارد. SEC-D1، SEC-D2، SEC-K1 (gitleaks)، SEC-A10 (`"use server"`) و بخشی از T-STATIC اجرا نمی‌شوند. اگر آسیب‌پذیری بحرانی تازه‌ای در Next.js یا React منتشر شود (مثل CVE-2025-55182)، هیچ هشداری نمی‌رسد.
- **کار:** گام‌های `pnpm audit --prod --audit-level=high` (مانع merge، با فایل استثنای تاریخ‌دار)، gitleaks و `! grep -rnE "['\"]use server['\"]" apps/web/src` اضافه شوند. Dependabot هفتگی برای npm و GitHub Actions، با گروه جدا برای `next`، `react`، `sharp` و `@node-rs/argon2`. Trivy پس از ساخت Dockerfile (SEC-D4).
- **وضعیت: انجام شد** (devops-engineer، ۳۰ مهر ۱۴۰۵). کامیت و push نشده است.
  - `ci.yml`: دو job تازه. `security` شامل `scripts/ci-no-server-actions.sh` (جستجوی `"use server"` در `apps/` و `packages/`، بدون پوشه‌ی تست) و `scripts/ci-audit.mjs` است. این اسکریپت روی وابستگی‌های اجرایی در سطح high به بالا و روی همه‌ی وابستگی‌ها در سطح critical شکست می‌خورد. `secrets` هم gitleaks-action v3.0.0 با gitleaks 8.30.1 و `fetch-depth: 0` است. در push و PR فقط commitهای تازه و در اجرای زمان‌بندی‌شده کل تاریخچه اسکن می‌شود. اجرای هفتگی (شنبه ۶ صبح تهران) audit و اسکن کامل را بدون تغییر کد تکرار می‌کند. همه‌ی actionها با SHA کامل pin شده‌اند. `permissions` پیش‌فرض فقط `contents: read` است و job مربوط به gitleaks فقط `pull-requests: read` را اضافه دارد. `persist-credentials: false` هم تنظیم شد.
  - فایل استثنا: `.github/audit-exceptions.txt`. هر خط GHSA، تاریخ بازبینی (حداکثر ۹۰ روز بعد) و دلیل دارد. استثنای منقضی CI را می‌شکند. اگر رجیستری خطا بدهد، CI بسته می‌شود (fail closed). از `pnpm audit --ignore` استفاده نشد، چون pnpm 12 آن را بی‌تاریخ در `pnpm-workspace.yaml` می‌نویسد.
  - `.github/gitleaks.toml`: قواعد پیش‌فرض به‌همراه یک allowlist باریک برای `env.NAME`. دلیلش مثبت کاذب `secretKey: env.S3_SECRET_KEY` در `storage/index.ts` بود.
  - `.github/dependabot.yml`: npm و github-actions، هر دو هفتگی. گروه‌های جدای `runtime-core` (به‌روزرسانی امنیتی و نسخه) برای `next`، `react`، `react-dom`، `sharp` و `@node-rs/argon2` تعریف شد.
  - **اجرای محلی (۳۰ مهر ۱۴۰۵):** `pnpm audit --prod` هیچ آسیب‌پذیری‌ای نشان نداد. در کل وابستگی‌ها فقط یک مورد moderate هست: GHSA-67mh-4wv8-2f99 در esbuild 0.18.20، فقط در محیط توسعه و از طریق `drizzle-kit`. این مورد زیر آستانه است و استثنا نمی‌خواهد. هر دو گیت audit و گیت `"use server"` پاس شدند. مسیرهای شکست هم آزموده شد: فایل قناری، استثنای منقضی و خطای رجیستری. gitleaks 8.30.1 با این پیکربندی روی تاریخچه (۱ کامیت) و فایل‌های کاری tracked و untracked هیچ نشتی پیدا نکرد، و قناری‌ها را گرفت.
  - **فقط روی GitHub آزموده می‌شود:** اجرای خود workflow، رفتار gitleaks-action (بازه‌ی PR، نیاز نداشتن به لایسنس در حساب شخصی)، و Dependabot. پشتیبانی Dependabot از lockfile pnpm 12 تأیید نشده است (جستجوی ۳۰ مهر ۱۴۰۵ سندی پیدا نکرد). اگر PRهایش با `--frozen-lockfile` شکست خوردند، Renovate جایگزین شود. **کار دستی مدیر مخزن:** روشن کردن Dependabot alerts و security updates در Settings، و قرار دادن jobهای `security` و `secrets` به‌عنوان required check در branch protection (وگرنه «مانع merge» نیستند).
  - **باقی‌مانده:** Trivy روی image پس از ساخت Dockerfile (SEC-D4). F-03 (`noRestrictedImports`) جداست.

---

## سؤال‌های باز که بدون کار کدی بسته شدند
| سؤال (اسپرینت) | حکم | سند |
|---|---|---|
| بالا نیامدن با env نامعتبر (۱) | در کد اسپرینت ۴ حل شد (`instrumentation.ts` → `getEnv()`) | ADR-0003 بند 9-8 |
| هم‌زمانی غیرفعال‌سازی مرحله و تغییر مرحله (۲) | قفل لازم نیست؛ حالت حاصل قابل‌نمایش و قابل‌رفع است | `data-model.md` ۲-۲ (`stages`) |
| `search_text` پس از تغییر نام (۲) | بخشی از F-02، در همان تراکنش | `data-model.md` ۲-۳ |
| تاریخ شمسی در CSV ورودی (۳) | در اسپرینت ۴ ساخته شد؛ استثنای مستند ADR-0008 | ADR-0008 بخش ۶ |
| FK پیوست سؤال و نقطه‌ی عطف (۳) | در `0004` اضافه شد | `data-model.md` ۲-۵ |
| `/healthz` و `lastHealthSweepAt` (۴) | وصل شد؛ باقی‌مانده F-08 | ADR-0007 |
| `nextDueDate` تمدید حساب شود؟ (۴) | نه؛ تصمیم بک‌اند تأیید شد | ADR-0005، `data-model.md` ۲-۵ |
| شناسه‌های ارجاعی `createTemplateIds` و `cancelTaskIds` (۴) | به جدول ADR-0004 بخش ۱-۱ اضافه شدند | ADR-0004 |

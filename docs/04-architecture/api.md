# قرارداد API — UpworkCoach نسخه‌ی 0.1

> فاز ۳ — ۲۷ مهر ۱۴۰۵ — نویسنده: software-architect — وضعیت: پیش‌نویس برای گیت بنیان‌گذار
> **به‌روزرسانی ۳۰ مهر ۱۴۰۵: هماهنگ با کد اسپرینت‌های ۱ تا ۴.** هر بند تازه یا تغییرکرده برچسب «(هماهنگ با کد، اسپرینت N)» دارد. فهرست کامل مسیرهای ساخته‌شده: `apps/web/src/server/http/routes.manifest.ts` (۹۳ مسیر زیر `/api/v1` + ۱ مسیر داخلی). مسیری که در manifest نیست ساخته نشده است؛ چنین مسیرهایی این‌جا با «**ساخته نشده**» مشخص‌اند و کار باقی‌مانده‌شان در `docs/05-delivery/followups.md` است.
> مدل داده: `data-model.md`. دسترسی: [ADR-0004](adr/0004-access-control.md). احراز هویت: [ADR-0003](adr/0003-auth-0.1.md).
> schemaهای دقیق zod در `apps/web/src/modules/*/contracts.ts` منبع حقیقت کد هستند. این سند قرارداد مفهومی آن‌هاست و هر تغییر در یکی باید در دیگری هم اعمال شود.

---

## ۱. قراردادهای عمومی

| موضوع | قاعده |
|---|---|
| پایه | `/api/v1`. فقط JSON (`Content-Type: application/json`)، جز `POST /attachments` و `POST /imports/students` (multipart) و خروجی CSV |
| احراز هویت | کوکی `__Host-uc_session`. همه‌ی مسیرها جز مسیرهای «عمومی» نشست می‌خواهند؛ بدون نشست ← `401 UNAUTHENTICATED` |
| CSRF | درخواست‌های غیر GET باید سرآیند `Origin` دقیقاً برابر origin `APP_BASE_URL` داشته باشند؛ وگرنه `403 BAD_ORIGIN`. اگر `Sec-Fetch-Site` آمده و `same-origin` نیست ← `403`. (هماهنگ با کد، اسپرینت ۱) **POST بدون بدنه** (`logout`، `invite-link`، `reset-link`، `start`، `done`، `approve`، …) می‌تواند `Content-Type` نداشته باشد؛ هر درخواستی که بدنه دارد باید `application/json` (یا multipart در دو مسیر بالا) باشد، وگرنه `415`. دلیل: Origin مانع اصلی است و فرم بین‌سایتی همیشه `Content-Type` می‌فرستد (ADR-0003 بخش ۹) |
| سقف بدنه | JSON حداکثر ۲۵۶ کیلوبایت **پیش از** parse ← `413` (هماهنگ با کد، اسپرینت ۱) |
| نقش‌ها | `A` = admin، `M` = mentor (فقط در دامنه‌ی خودش؛ ADR-0004)، `S` = student (فقط خودش)، `*` = هر کاربر واردشده، `عمومی` = بدون نشست |
| خارج از دامنه | منبعی که وجود دارد ولی کاربر به آن دسترسی ندارد ← **`404 NOT_FOUND`** با بدنه‌ی یکسان با شناسه‌ی ناموجود. نقش نامجاز برای کل endpoint ← `403 FORBIDDEN` |
| نام فیلدها | camelCase در JSON |
| شناسه | UUID رشته‌ای (UUIDv7) |
| زمان | لحظه: ISO 8601 با `Z` (`2026-10-19T08:30:00Z`). روز: `YYYY-MM-DD` میلادی که **روز تقویم تهران** معنا می‌شود. **API JSON تاریخ شمسی نمی‌گیرد و برنمی‌گرداند**؛ تبدیل در UI است (ADR-0008). تنها استثنا: ستون مهلت در فایل CSV ورودی (بخش ۱۳) |
| ارقام | ارقام فارسی و عربی در ورودی عددی و موبایل پذیرفته و به لاتین تبدیل می‌شوند. مبلغ‌ها در پاسخ **رشته‌ی اعشاری** هستند (`"25.00"`) (هماهنگ با کد، اسپرینت ۲) |
| صفحه‌بندی | cursor مبهم: `?limit=50&cursor=<opaque>` ← `{ items: [...], nextCursor: string \| null }`. حداکثر `limit` ۱۰۰. (هماهنگ با کد، اسپرینت ۲) cursor خراب یا جعلی ← `422` |
| خطا | `{ "error": { "code": "VALIDATION_FAILED", "message": "<متن فارسی برای نمایش>", "fields": { "phone": "شماره‌ی موبایل معتبر نیست" }, "data": { … } } }`. (هماهنگ با کد، اسپرینت ۴) `data` اختیاری است و فقط جایی که ذکر شده می‌آید (فعلاً `409 PHONE_TAKEN` برای مدیر) |
| کدهای خطای رایج | `VALIDATION_FAILED` (422)، `UNAUTHENTICATED` (401)، `INVALID_CREDENTIALS` (401)، `FORBIDDEN` / `BAD_ORIGIN` (403)، `NOT_FOUND` (404)، `CONFLICT` / `PHONE_TAKEN` / `INVALID_TRANSITION` (409)، `TOKEN_EXPIRED` (410)، `PAYLOAD_TOO_LARGE` (413)، `UNSUPPORTED_MEDIA_TYPE` (415)، `TOO_MANY_ATTEMPTS` (429)، `INTERNAL` (500)، `BUSY` (503، با `Retry-After`؛ صف argon2 پر است) |
| `429` | (هماهنگ با کد، اسپرینت ۱) بدنه: `{ error: { code: 'TOO_MANY_ATTEMPTS', message: '<پیام فارسی ثابت با دقیقه‌ی مانده>', retryAfterSeconds } }` + سرآیند `Retry-After`. چیزی درباره‌ی لایه‌ی قفل یا وجود حساب نمی‌گوید |
| شناسه‌های ارجاعی (امنیت C3) | **هر** شناسه‌ای در بدنه یا query یک درخواست نوشتنی که به منبع دیگری اشاره می‌کند (`profileId`، `taskId`، `attachmentIds`، `mentorId`، `reviewerId`، `assigneeId`، `ownerId`، `studentId`، `studentIds`، `stageId`، `toStageId`، `platformId`، `primaryPlatformId`، `trackId`، `templateId`، `typeId`، `cannedResponseId`، و (هماهنگ با کد، اسپرینت ۴) `createTemplateIds` و `cancelTaskIds`) مثل منبع اصلی بررسی می‌شود و اگر به هنرجو وابسته است باید مال **همان هنرجو** باشد. شرط هر شناسه در جدول ADR-0004 بخش ۱-۱؛ پیاده‌سازی با `assertRefs` درون تراکنش نوشتن و **پیش از هر نوشتن**. رد شدن ← **`422 VALIDATION_FAILED`** با `fields.<نام> = "مقدار نامعتبر است"`، یکسان برای ناموجود، خارج از دامنه، مال هنرجوی دیگر و غیرفعال، و **هیچ ردیفی نوشته نمی‌شود** (تست T-REF). `404` فقط برای شناسه‌ی **مسیر** است. فیلترهای query در `GET`ها با دامنه `AND` می‌شوند و فیلتر خارج از دامنه فقط فهرست خالی می‌دهد. (هماهنگ با کد، اسپرینت ۴) تفاوت `422` و `409`: شناسه‌ای که «مجاز نیست» ← `422`؛ شناسه‌ی مجاز ولی منبعی که در **وضعیت** نادرست است (مثلاً کار نهایی‌شده در `cancelTaskIds`) ← `409 INVALID_TRANSITION` |
| schema ورودی (امنیت C3، SEC-A7) | همه‌ی schemaهای zod با `.strict()`؛ کلید ناشناخته یا فیلد ممنوع برای آن نقش ← `422`. (هماهنگ با کد، اسپرینت ۲) همین قاعده برای کلیدهای ناشناخته‌ی **query** هم هست |
| هم‌زمانی ویرایش | منابع قابل‌ویرایش `updatedAt` برمی‌گردانند. PATCH می‌تواند `ifUpdatedAt` بفرستد؛ اگر نابرابر بود ← `409 CONFLICT` |
| DTOها | پاسخ‌های مسیرهای `S` نوع‌های جدا دارند و فیلدهای داخلی را **ندارند** (ADR-0004 بخش ۳). مسیرهای مشترک (`/tasks/:id`، `/questions/:id`، `/profiles/:id`، `/attachments/:id`) DTO را با `switch` روی نقش انتخاب می‌کنند (SEC-A5) |
| Server Action | ممنوع (SEC-A10). صفحه‌های RSC تابع service را مستقیم با `toActor(user)` می‌خوانند؛ همه‌ی نوشتن‌ها از همین API است (هماهنگ با کد، اسپرینت ۲) |

---

## ۲. احراز هویت و نشست (`identity`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `POST /auth/login` | عمومی | `{ phone, password }` | `200 { user: MeDTO }` + کوکی نشست + کوکی دستگاه `__Host-uc_dev`. `401 INVALID_CREDENTIALS`، `429 TOO_MANY_ATTEMPTS { retryAfterSeconds }`. (امنیت C2) قفل سه‌لایه (`pi` ۵/۱۵ دقیقه، `p` ۲۰/۱ ساعت با عبور کوکی دستگاه، `ip` ۳۰/۱۵ دقیقه)، IP فقط از `getClientIp`، رمز پس از `normalizePassword`؛ ADR-0003 بخش ۳–۴. هش ساختگی برای کاربر ناموجود، `invited` و `disabled`. (هماهنگ با کد، اسپرینت ۱) موبایل فقط ایران (`9` + ۹ رقم) پذیرفته می‌شود |
| `POST /auth/logout` | * | — | `204`؛ نشست فعلی باطل؛ کوکی با `Max-Age=0`؛ `Clear-Site-Data: "cache"`. کوکی دستگاه **می‌ماند** (هماهنگ با کد، اسپرینت ۱) |
| `GET /auth/me` | * | — | `MeDTO = { id, displayName, role, phone }` |
| `POST /auth/change-password` | * | `{ currentPassword, newPassword }` | `204`؛ همه‌ی نشست‌های دیگر باطل و نشست جاری چرخانده می‌شود (کوکی تازه). (امنیت C2) حداقل طول: هنرجو ۸، کارکنان ۱۲. (هماهنگ با کد، اسپرینت ۱) رمز فعلی غلط ← **`422` با `fields.currentPassword`** (نه `401`، تا UI آن را کنار فیلد نشان دهد) و شمارش در قفل `pwchange:u:<userId>` ۵ در ۱۵ دقیقه ← `429` |
| `GET /auth/sessions` | * | — | `[{ id, createdAt, lastUsedAt, userAgent, ip, current }]` (فقط نشست‌های خودش) |
| `DELETE /auth/sessions/:id` | * | — | `204`. شرط `user_id = actor`؛ نشست دیگران ← `404` |
| `POST /auth/tokens/lookup` | عمومی | `{ token }` | (امنیت C1) `200 { purpose: 'invite' \| 'password_reset', displayName, expiresAt }`. **موبایل (حتی پوشانده) برنمی‌گردد.** ناموجود، مصرف‌شده، باطل یا منقضی ← `410 TOKEN_EXPIRED`. محدودیت `token:ip` (۳۰ ناموفق در ۱۵ دقیقه). `Cache-Control: no-store` |
| `POST /auth/tokens/accept` | عمومی | `{ token, phone, password }` | (امنیت C1) `200 { user: MeDTO }` + کوکی. هم دعوت و هم بازنشانی. `phone` باید پس از نرمال‌سازی برابر `users.phone` باشد؛ وگرنه `422 VALIDATION_FAILED { fields: { phone } }` و پس از ۵ بار توکن باطل + `audit_log(auth.token_revoked_mismatch)` ← `410`. مصرف اتمی توکن، ابطال همه‌ی نشست‌های قبلی و نشست کوکی ورودی (اگر هست)؛ ADR-0003 بخش ۲ |

(امنیت C1) **هیچ مسیری (صفحه یا API) پارامتر `:token` ندارد.** توکن فقط در fragment لینک (`/invite#t=…`، `/reset#t=…`) و در بدنه‌ی این دو POST است.

**کوکی نشست (هماهنگ با کد، اسپرینت ۱):** `Max-Age` کوکی برابر **سقف مطلق** نشست است (هنرجو ۹۰، کارکنان ۳۰ روز)، نه انقضای لغزنده. انقضای لغزنده (۳۰/۷ روز) در سرور و در **هر** درخواست (API و RSC) از `sessions.expires_at` سنجیده و هر ۱۵ دقیقه تمدید می‌شود؛ کوکیِ نشستِ منقضی در سرور بی‌اثر است. دلیل در ADR-0003 بخش ۹.

## ۳. کاربران و دعوت (`identity`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /users?role=mentor\|admin\|student&status=` | A | — | `{ items, nextCursor: null }` (هماهنگ با کد، اسپرینت ۱: بدون صفحه‌بندی، حداکثر ۱۰۰۰ ردیف). هر ردیف `inviteAcceptedAt` و `inviteAcceptedDevice` (امنیت C1، SEC-T5) و `erasedAt` (امنیت C5) دارد. (هماهنگ با کد، اسپرینت ۱؛ تصمیم معماری) منبع این دو فیلد از ستون‌های `users.invite_accepted_at` و `users.invite_accepted_user_agent` است، نه `auth_tokens`، چون `auth.cleanup` توکن‌ها را ۷ روز پس از مصرف حذف می‌کند (`data-model.md` ۲-۱؛ followup F-01). تا اجرای F-01 این دو فیلد پس از ۷ روز `null` می‌شوند |
| `GET /mentors` | A، M | — | `[{ id, displayName, role }]` نقش‌های admin و mentor با `status=active`؛ برای انتخاب مشاور و فیلتر |
| `POST /invitations` | A | `{ role: 'mentor' \| 'admin', displayName, phone }` | `201 { userId, inviteUrl, expiresAt }`. **`inviteUrl` فقط همین یک بار برمی‌گردد** (`Cache-Control: no-store`). شکل: `${APP_BASE_URL}/invite#t=<token>`. هنرجو از مسیر `POST /students` ساخته می‌شود. (پیش از دعوت **دومین مدیر**، SEC-S7 `reauth` لازم است؛ followup F-06) |
| `POST /users/:id/invite-link` | A؛ M (امنیت C3: فقط اگر کاربر هدف **`role = 'student'`**، `status = 'invited'` و در دامنه‌ی خودش است) | — | `201 { inviteUrl, expiresAt }` (`no-store`)؛ لینک قبلی باطل می‌شود. A: فقط برای `status=invited` (وگرنه `409`). **M برای هر کاربر دیگر، از جمله کاربر `invited` با نقش `admin` یا `mentor`، ← `404`** (همان بدنه‌ی شناسه‌ی ناموجود). (هماهنگ با کد، اسپرینت ۱) برای مشاور به `mentorsCanInviteStudents` وابسته **نیست**: این ساخت کاربر تازه نیست، فقط لینک دوباره برای هنرجویی است که از قبل در دامنه‌ی اوست. `audit_log(user.invite_link_created)` با نقش سازنده، بدون لینک |
| `POST /users/:id/reset-link` | A | — | `201 { resetUrl, expiresAt }` (۲۴ ساعت؛ `no-store`). شکل: `${APP_BASE_URL}/reset#t=<token>`. در `audit_log` بدون لینک. (هماهنگ با کد، اسپرینت ۱) فقط برای کاربر `active`؛ `invited` و `disabled` ← `409` (برای `invited` از `invite-link` استفاده شود) |
| `PATCH /users/:id` | A | `{ displayName?, phone?, status?: 'active' \| 'disabled' }` | **ساخته نشده** (followup F-02). غیرفعال‌سازی و تغییر موبایل همه‌ی نشست‌ها را باطل می‌کنند (`user.phone_changed` در `audit_log`). تغییر نام یا موبایل هنرجو `students.search_text` را در **همان تراکنش** با `buildSearchText` بازسازی می‌کند (تصمیم معماری، پاسخ سؤال باز اسپرینت ۲) |
| `PATCH /users/:id/role` | A | `{ role }` | **ساخته نشده** (followup F-02). برداشتن آخرین مدیر ← `409`. هنرجو نقش عوض نمی‌کند (`409`). همه‌ی نشست‌ها باطل |

(امنیت C5) **حذف حساب در 0.1 endpoint ندارد.** درخواست حذف از راه پیام به مربی می‌رسد و مدیر آن را با CLI `pnpm admin:erase-user` اجرا می‌کند (`data-model.md` بخش ۶-۲، ADR-0010). روی کاربری که `erasedAt` دارد، همه‌ی مسیرهای نوشتنی این بخش ← `409 CONFLICT`.

**CLIها (هماهنگ با کد، اسپرینت ۱):** `pnpm admin:create --phone … --name …` (نام دیگر: `admin:bootstrap`؛ فقط وقتی هیچ مدیری نیست؛ لینک ۱ ساعته روی stdout)، `pnpm admin:reset-link --phone …` (برای کاربر `active` لینک بازنشانی ۱ ساعته؛ برای کاربر `invited`، مثلاً اولین مدیری که لینک راه‌اندازی‌اش منقضی شده، لینک **دعوت** ۱ ساعته؛ قفل‌های آن موبایل را پاک می‌کند)، `pnpm admin:erase-user --id … --confirm "…" --requested-on YYYY-MM-DD`.

## ۴. هنرجو و پرونده (`students`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /students` | A، M | query: `q` (نام نرمال‌شده، موبایل `+98…`/`09…` با ارقام فارسی، آیدی پیام‌رسان، برچسب)، `stageId`، `mentorId` (فقط A؛ uuid یا `none` = بی‌مشاور)، `tag`، `platformId` (پلتفرم اصلی **یا** پروفایل حذف‌نشده روی آن)، `health` (یک یا چند با ویرگول: `green\|yellow\|red\|paused`)، `lifecycle` (یک مقدار، فهرست با ویرگول، یا `all`؛ پیش‌فرض `active,paused`)، `cohort`، `sort=name\|lastActivity\|stageDays\|joined\|health`، `limit`، `cursor` (هماهنگ با کد، اسپرینت ۲ و ۴) | `StudentListDTO = { items: StudentListItem[], nextCursor, counts: { total, byLifecycle, byHealth } }`. `counts` همه‌ی فیلترها جز `lifecycle`/`health` را دارد تا شمارنده‌ی چیپ‌ها از همین درخواست بیاید (هماهنگ با کد، اسپرینت ۴). `StudentListItem = { id, displayName, mentor:{id,displayName}, stage:{id,name,displayCode,sortOrder,isActive}, daysInStage, overExpected, health:{status, reasons, churnRisk, snoozedUntil, ball, statusSince, computedAt}, nextTask:{id,title,dueAt,overdue}, openTaskCount, overdueTaskCount, lastActivityAt, tags, primaryProfile:{platformName,url,headline} }`. `health` فقط تا اولین محاسبه `null` است |
| `GET /students/tags` | A، M | — | (هماهنگ با کد، اسپرینت ۴) `[{ tag, count }]` برچسب‌های هنرجوهای دامنه |
| `POST /students` | A؛ M اگر `mentorsCanInviteStudents` | `{ displayName, phone, mentorId?, stageId?, trackId?, primaryPlatformId?, tags?, initialNote? }`. M: `mentorId` نادیده و برابر خودش. A بدون `mentorId` ← هنرجوی **بی‌مشاور** (هماهنگ با کد، اسپرینت ۲؛ UI خود مدیر را پیش‌فرض می‌گذارد). پیش‌فرض `stageId` = اولین مرحله‌ی فعال. `initialNote` ← یادداشت `internal` اول پرونده (اسپرینت ۳) | `201 { student: StaffStudentDTO, inviteUrl, expiresAt }` (`no-store`). در یک تراکنش: کاربر `invited` + `students` + `mentor_assignments` + `stage_transitions(initial)` + توکن دعوت + `audit_log`. موبایل تکراری ← `409 PHONE_TAKEN` با `fields.phone`؛ (هماهنگ با کد، اسپرینت ۴) **فقط برای مدیر** `error.data.existingStudentId` هم دارد (برای «رفتن به پرونده‌ی موجود»؛ مشاور آن را نمی‌گیرد) |
| `GET /students/:id` | A، M | — | `StaffStudentDTO`: همه‌ی فیلدهای `students` + سربرگ (`health`، `nextTask`، `daysInStage`، `overExpected`، شمارش کارها، `primaryProfile`، `mentor`، `completeness: { percent, missing[] }`، `stage.sortOrder`، `stage.isActive`، `accountStatus`). (تصمیم معماری، SEC-T5) `inviteAcceptedAt` و `inviteAcceptedDevice` هم باید بیاید — **هنوز در کد نیست** (followup F-01) |
| `PATCH /students/:id` | A، M | هر فیلد قابل‌ویرایش `students` جز `primaryMentorId`، `currentStageId` و `lifecycleStatus` (مسیرهای جدا دارند) + `ifUpdatedAt`. (هماهنگ با کد، اسپرینت ۲) `joinedAt` فقط مدیر | `StaffStudentDTO`؛ رویداد `student.updated` با فهرست فیلدها |
| `PUT /students/:id/mentor` | A | `{ mentorId \| null, reason? }` | `StaffStudentDTO`. `null` = بی‌مشاور. `audit_log(student.mentor_changed)`؛ مشاور قبلی فوراً `404` می‌گیرد. یادآورهای باز و سؤال‌های باز مشاور قبلی درباره‌ی این هنرجو به مشاور جدید منتقل می‌شوند؛ (هماهنگ با کد، اسپرینت ۳) اگر مشاور جدید `null` است، به **مدیرِ انجام‌دهنده** |
| `PUT /students/:id/lifecycle` | A، M | `{ status: 'active' \| 'paused' \| 'graduated' \| 'dropped', pausedUntil?: 'YYYY-MM-DD', reason? }` | `paused` بدون `pausedUntil`، یا با `pausedUntil` امروز یا گذشته‌ی تهران ← `422`؛ برای وضعیت‌های دیگر `pausedUntil` نباید بیاید (هماهنگ با کد، اسپرینت ۲). یادآور سیستمی یک روز قبل از بازگشت؛ با خروج زودتر از توقف لغو می‌شود (اسپرینت ۳) |
| `GET /students/:id/timeline` | A، M | `types=note,student,stage,profile,task,question,checkin,milestone,flag,health` (ویرگولی؛ نبود = همه)، `limit`، `cursor` | (هماهنگ با کد، اسپرینت ۳) `TimelineDTO = { items: [{ kind: 'event' \| 'note', category, type, occurredAt, actor, data \| note }], nextCursor, refs: { stages: {id→name}, users: {id→displayName} } }`، جدیدترین اول |
| `GET /students/:id/summary` | A، M در دامنه، یا M که `assignee` یک سؤال **باز** این هنرجوست | — | خلاصه‌ی کنار سؤال (F8): `{ displayName, stage, profiles[], openTasks[] }`. (امنیت C3) برای assignee خارج از دامنه فقط تا وقتی رشته‌ای با `status IN ('open','answered')` و `assigneeId = actor` هست؛ پس از آن `404` (اسپرینت ۴) |
| `GET /me/student` | S | — | `SelfStudentDTO` (بدون سلامت، پرچم، برچسب، کوهورت، `level`، `statusReason`، `lifecycleStatus`، `lastActivityAt` و شناسه‌ی مشاور؛ از مشاور فقط نام). `nicheStatement` را می‌بیند ولی ویرایش نمی‌کند (هماهنگ با کد، اسپرینت ۲) |
| `PATCH /me/student` | S | فقط فیلدهای فهرست سفید (`data-model.md` ۲-۳) + `ifUpdatedAt` | `SelfStudentDTO` |

### پروفایل‌های پلتفرم
| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /students/:id/profiles` | A، M | — | `ProfileDTO[]` (اصلی اول) |
| `GET /me/profiles` | S | — | `ProfileDTO[]` |
| `POST /students/:id/profiles` · `POST /me/profiles` | A، M · S | `{ platformId, kind, publicUrl?, headline?, rateAmount?, rateCurrency?, rateUnit?, status?, niche?, notes?, isPrimary? }` | `201 ProfileDTO`. `publicUrl` فقط `https://`. **فیلد رمز وجود ندارد** (کلید `password` ← `422`). (هماهنگ با کد، اسپرینت ۲) مبلغ بدون ارز ← `USD` |
| `PATCH /profiles/:id` | A، M، S (مال خودش) | همان فیلدها + `ifUpdatedAt` | ویرایش پروفایل تأییدشده، تأیید را برنمی‌دارد |
| `DELETE /profiles/:id` | A، M، S (مال خودش) | — | `204`؛ حذف نرم. (هماهنگ با کد، اسپرینت ۲) پس از حذف برای همه (از جمله تأیید و snapshot) `404` |
| `POST /profiles/:id/approve` | A، M | — | `200 ProfileDTO` با `mentorApprovedAt` |
| `GET /profiles/:id/snapshots` · `POST /profiles/:id/snapshots` | A، M، S (مال خودش) | `{ headline?, bodyText, rateText? }` | جدیدترین اول |

## ۵. مسیر، مرحله و کانبان (`path`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /stages` | * | — | `[{ id, displayCode, name, sortOrder, expectedDays, isOpenEnded, studentDescription, contentLinks, isActive }]` (فقط فعال‌ها؛ A با `?includeInactive=1`) |
| `POST /stages` | A | فیلدهای `stages` (`contentLinks` فقط `https://`) | `201 StageDTO` |
| `PATCH /stages/:id` | A | فیلدهای `stages` | تغییر `expectedDays` یا `isOpenEnded` ← `health.sweep` فوری. (هماهنگ با کد، اسپرینت ۲) **غیرفعال نمی‌کند**: `isActive: false` ← `422` (فقط `deactivate`)؛ `isActive: true` فعال‌سازی دوباره است |
| `PUT /stages/order` | A | `{ stageIds: [...] }` | دقیقاً مجموعه‌ی **کامل** مرحله‌های مسیر (فعال و غیرفعال)، وگرنه `422`. `sortOrder` به ۱۰، ۲۰، … بازنویسی می‌شود (هماهنگ با کد، اسپرینت ۲) |
| `POST /stages/:id/deactivate` | A | — | اگر هنرجوی `active` در این مرحله است ← `409` (`paused`/`graduated`/`dropped` مانع نیستند؛ هماهنگ با کد، اسپرینت ۲). هم‌زمانی با تغییر مرحله: `data-model.md` ۲-۲ (`stages`) |
| `PUT /students/:id/stage` | A، M | `{ toStageId, kind: 'advance' \| 'skip_by_assessment' \| 'advance_with_exception' \| 'regress', note?, createTemplateIds?: uuid[] (حداکثر ۳۰), cancelTaskIds?: uuid[] (حداکثر ۱۰۰), cancelReason? }` | `{ student, suggestedTemplates: TaskTemplateDTO[], createdTasks: StaffTaskDTO[], cancelledTaskIds: uuid[] }`. `note` برای exception و regress الزامی. «یک کلیک» در UI = `advance` به مرحله‌ی بعد. (هماهنگ با کد، اسپرینت ۲) جهت با نوع هم‌خوان است: `regress` فقط به عقب، بقیه فقط به جلو (پرش مجاز)؛ همان مرحله یا جهت نادرست ← `409 INVALID_TRANSITION`؛ مقصد غیرفعال ← `422`. (هماهنگ با کد، اسپرینت ۴) **اتمی:** تغییر مرحله، ساخت کار از قالب‌های `createTemplateIds` و لغو `cancelTaskIds` (با `cancelReason`، پیش‌فرض «با تغییر مرحله لغو شد.») در یک تراکنش. قالب ناموجود/غیرفعال ← `422 fields.createTemplateIds`؛ کار هنرجوی دیگر یا ناموجود ← `422 fields.cancelTaskIds`؛ کار نهایی‌شده در فهرست لغو ← `409 INVALID_TRANSITION`؛ در همه‌ی این حالت‌ها هیچ‌چیز نوشته نمی‌شود. شناسه‌ی تکراری یک بار حساب می‌شود. دو فهرست پاسخ وقتی فرستاده نشده‌اند `[]` هستند |
| `GET /students/:id/stage-history` | A، M | — | `[{ from, to, kind, note, actor, createdAt }]`، قدیمی‌ترین اول، با `initial` |
| `GET /board` | A، M | `mentorId?` (A)، `tag?`، `health?` | `{ columns: [{ stage, students: [{ id, displayName, daysInStage, overExpected: 'none' \| 'warn' \| 'over', health, lifecycleStatus, accountStatus }] }] }`. `overExpected`: بیش از `expectedDays` ← `warn`، بیش از ۲ برابر ← `over` (F3). (هماهنگ با کد، اسپرینت ۲ و ۴) هنرجوهای `active` و `paused`؛ داخل ستون بیشترین روز اول؛ ستون برای هر مرحله‌ی فعال + مرحله‌ی غیرفعالی که هنوز هنرجو دارد. `daysInStage` = روزهای کامل ۲۴ ساعته از `stage_entered_at` |
| `GET /me/path` | S | — | `{ stages: [{ id, name, displayCode, state: 'passed' \| 'current' \| 'locked', studentDescription, contentLinks }], current, next }`. (هماهنگ با کد، اسپرینت ۲) حالت‌های ریزتر (`passed_by_assessment`، …) فقط در تاریخچه‌ی کارکنان؛ مرحله‌ی غیرفعال فقط اگر مرحله‌ی فعلی هنرجو باشد |

## ۶. کارها، تحویل و بازبینی (`tasks`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /tasks` | A، M | (هماهنگ با کد، اسپرینت ۴) `status` (ویرگولی یا `all`)، `overdue=1`، `stageId`، `reviewerId`، `mentorId` (شناسه یا `none`؛ مشاور اصلی هنرجو)، `studentId`، `kind`، `submissionType`، `q` (عنوان کار یا نام/موبایل/برچسب هنرجو)، `sort=due\|recent` (پیش‌فرض `due`)، `limit` (پیش‌فرض ۵۰)، `cursor` | `StaffTaskListDTO = { items: StaffTaskDTO[], nextCursor, counts: { total, overdue, byStatus } }`. دامنه در SQL؛ فیلترها با دامنه AND. `counts` همه‌ی فیلترها جز `status` و `overdue` را دارد (شمارنده‌ی زبانه‌های M5) |
| `GET /students/:id/tasks` | A، M | `status?`، `stageId?` | `StaffTaskDTO[]` با `overdue` و `overdueDays` (روزهای تقویم تهران پس از مهلت، حداقل ۱) |
| `GET /me/tasks` | S | `status?` | `StudentTaskListItemDTO[]` (فهرست سبک با `latestReview`)؛ مرتب: معوق‌ها اول، بعد `dueAt` (F4). لغوشده فقط با `?status=cancelled` (هماهنگ با کد، اسپرینت ۳) |
| `POST /students/:id/tasks` | A، M | `{ title?, description?, kind?, submissionType?, stageId?, requiredForGate?, priority?, dueDate?: 'YYYY-MM-DD', reviewerId?, templateId?, profileId? }` | `201 StaffTaskDTO`. (هماهنگ با کد، اسپرینت ۳) `templateId` فیلدهای خالی را پر می‌کند؛ بدون قالب `title` الزامی است؛ پیش‌فرض `kind=custom`، `submissionType=text`؛ `dueDate` ← روزهای قالب، وگرنه `settings.tasks.defaultDueDays` (۳)؛ `due_at` = پایان آن روز تهران؛ مهلت گذشته ← `422`. بازبین پیش‌فرض = مشاور اصلی فعال، وگرنه actor. (امنیت C3) `profileId` مال **همین** هنرجو و حذف‌نشده؛ `reviewerId` کاربر فعال admin یا mentor؛ `stageId` و `templateId` فعال؛ وگرنه `422` |
| `POST /tasks/bulk` (Should) | A، M | `{ studentIds: [...], templateId? \| fields, dueDate? }` | `201 { batchId, created: n, taskIds }`. (امنیت C3) **همه‌ی** `studentIds` باید در دامنه باشند؛ وگرنه کل درخواست `422` و **هیچ** کاری ساخته نمی‌شود |
| `GET /tasks/:id` | A، M، S (مال خودش) | — | کارکنان: `StaffTaskDetailDTO` (نسخه‌ها جدیدترین اول، هر کدام با `review` و `attachments`؛ `extensions[]`)؛ هنرجو: `StudentTaskDTO` (پایین). `switch` روی نقش (SEC-A5) |
| `PATCH /tasks/:id` | A، M | `{ title?, description?, priority?, reviewerId?, stageId?, requiredForGate?, ifUpdatedAt? }` | تغییر مهلت از این مسیر **ممکن نیست** (`dueDate` ← `422`). (امنیت C3) `reviewerId` و `stageId` مثل ساخت کار بررسی می‌شوند |
| `POST /tasks/:id/extend` | A، M | `{ newDueDate, reason }` | `200 StaffTaskDTO`. (هماهنگ با کد، اسپرینت ۳) فقط در وضعیت غیرنهایی و فقط **بعد از مهلت فعلی**. `task_extensions` + `extensionCount += 1`؛ رویداد `task.due_extended`؛ بازمحاسبه‌ی سلامت |
| `POST /tasks/:id/cancel` | A، M | `{ reason }` | `200 StaffTaskDTO`؛ نهایی ← `409 INVALID_TRANSITION` |
| `POST /tasks/:id/start` | S | — | `200 StudentTaskDTO`؛ `open` ← `in_progress` |
| `POST /tasks/:id/submissions` | S | `{ bodyText?, links?: [{url,label}], attachmentIds?, platformId?, jobPostText?, proposalText?, profileText?, aiUseConsent?: boolean }` | `201 SubmissionCreatedDTO = { id, version, createdAt, task: { id, status } }`. فقط از `open`، `in_progress` و `changes_requested`. (هماهنگ با کد، اسپرینت ۳) هر نوع فیلد خودش را می‌خواهد: `text` متن، `link` لینک، `file` پیوست، `profile_review` متن ویترین، `proposal_review` `platformId` + `jobPostText` + `proposalText`؛ فیلد پروپوزال یا ویترین روی نوع دیگر ← `422`. `checkbox` بدنه لازم ندارد، یک نسخه‌ی تحویل (برای سابقه) ثبت و کار مستقیم `accepted` می‌شود. اگر کار `profileId` دارد، `profile_snapshot` از خود کار ساخته می‌شود. (امنیت C4) `attachmentIds` فقط پیوست‌های `pending` خود هنرجو؛ وصل کردن اتمی؛ وگرنه `422` |
| `POST /submissions/:id/review` | A، M | `{ outcome: 'accepted' \| 'changes_requested', feedbackText, score?: 1..5, nextDueDate?: 'YYYY-MM-DD' }` | `201 StaffTaskDetailDTO`. فقط آخرین نسخه و فقط وقتی کار `submitted` است. `changes_requested` ← `revisionCount += 1`. (هماهنگ با کد، اسپرینت ۳) **هر کارمند در دامنه** می‌تواند بازبینی کند، نه فقط `reviewerId`. (هماهنگ با کد، اسپرینت ۴) `nextDueDate` («مهلت نسخه‌ی بعد») فقط با `changes_requested`؛ با `accepted` یا روز گذشته ← `422 fields.nextDueDate`. مهلت کار در همان تراکنش = پایان آن روز تهران و می‌تواند زودتر از مهلت فعلی باشد. **تمدید حساب نمی‌شود**: نه ردیف `task_extensions`، نه `extensionCount + 1`، و `originalDueAt` دست نمی‌خورد؛ رویداد `review.created` کلیدهای `previousDueAt` و `nextDueAt` را می‌گیرد (دلیل: ADR-0005 بخش «تطبیق با پیاده‌سازی») |
| `PATCH /reviews/:id` | A؛ M (امنیت C3: بازبین همان بازبینی **و** هنرجو در دامنه‌ی فعلی) | `{ feedbackText?, score? }` | `200 StaffReviewDTO`. فقط تا ۲۴ ساعت، **برای مدیر هم** (پس از آن `409`؛ هماهنگ با کد، اسپرینت ۳). `outcome` تغییر نمی‌کند. بیرون از دامنه ← `404` |
| `GET /review-queue` | A، M | `mentorId?` (A؛ = بازبین) | `ReviewQueueItemDTO[]`: کارهای `submitted` در دامنه، مرتب بر `lastSubmittedAt`، با `slaRemainingHours`، `breached`، `warning`، و (هماهنگ با کد، اسپرینت ۴) `submissionType` و `dueAt`. SLA با ساعت کاری. آستانه: `sla.reviewHours` برای همه‌ی کارها؛ **تصمیم معماری:** کار غیرگیت با `sla.reviewHoursNonGate` (۷۲) سنجیده شود (followup F-09) |
| `GET /task-templates` | A، M | `stageId?`، `includeInactive?` | `TaskTemplateDTO[]` |
| `POST /task-templates` · `PATCH /task-templates/:id` | A | فیلدهای `task_templates` | غیرفعال‌سازی با `isActive: false` |

**DTO هنرجو** (`StudentTaskDTO`): `{ id, title, description, kind, submissionType, stage, priority, status, dueAt, overdue, overdueDays, submissions: [{ version, createdAt, bodyText, links, attachments, platformId, jobPostText, proposalText, profileText, aiUseConsent, review: { outcome, feedbackText, score, createdAt, reviewer: { displayName } } }] }`. **بدون** `reviewerId`، `createdBy`، `revisionCount`، `extensionCount` و دلیل لغو. (هماهنگ با کد، اسپرینت ۴) هنرجو **نام نمایشی** بازبین را می‌بیند (مثل `SharedNoteDTO.author.displayName`)، نه شناسه‌ی او را.

## ۷. یادداشت و تایم‌لاین (`timeline`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /students/:id/notes` | A، M | `visibility?`، `kind?`، `limit`، `cursor` | `NoteListDTO` (هر آیتم `canEdit`) |
| `POST /students/:id/notes` | A، M | `{ kind?, visibility?: 'internal' \| 'shared', body, tags?, occurredAt? }` | `201 NoteDTO`. پیش‌فرض `internal`. (هماهنگ با کد، اسپرینت ۳) `occurredAt` آینده ← `422` |
| `PATCH /notes/:id` | A؛ M (امنیت C3: نویسنده **و** هنرجو در دامنه‌ی فعلی) | `{ body?, tags?, visibility?, kind?, occurredAt?, ifUpdatedAt? }` | بیرون از دامنه (مثلاً مشاور سابق) ← `404`. `internal` ← `shared` در `audit_log(note.visibility_changed)` |
| `DELETE /notes/:id` | A؛ M (نویسنده **و** در دامنه) | — | `204`؛ حذف نرم |
| `GET /me/shared-notes` | S | `limit`، `cursor` | `SharedNoteListDTO`؛ آیتم: `{ id, kind, body, occurredAt, author: { displayName } }`. **تنها مسیری که هنرجو یادداشت می‌بیند** |

## ۸. یادآور و «امروز» (`reminders`، `today`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /reminders` | A، M | `scope=today\|upcoming\|done`، `ownerId?` (A؛ M فقط خودش)، `studentId?` | `ReminderDTO[]`. (هماهنگ با کد، اسپرینت ۳) مدیر بدون `ownerId` فقط یادآورهای **خودش** را می‌گیرد |
| `POST /reminders` | A، M | `{ text, dueAt \| dueDate, studentId?, ownerId? }` | M: `ownerId` = خودش و `studentId` در دامنه. A: `ownerId` هر کاربر **فعال admin یا mentor**؛ وگرنه `422`. `dueDate` بدون ساعت ← ۹ صبح تهران |
| `PATCH /reminders/:id` | مالک، A | `{ text?, dueAt? }` | — |
| `POST /reminders/:id/done` | مالک، A | — | `200 ReminderDTO`؛ تکراری هم `200` (هماهنگ با کد، اسپرینت ۳) |
| `POST /reminders/:id/snooze` | مالک، A | `{ days: 1 \| 3 \| 7 }` | F6. (هماهنگ با کد، اسپرینت ۳) از دیرترِ «اکنون» و `dueAt` فعلی حساب می‌شود |
| `DELETE /reminders/:id` | مالک، A | — | `204`؛ `cancelled` |
| `GET /today` | A، M | `mentorId?` (A؛ پیش‌فرض: همه) | `TodayDTO = { reminders, reviewQueue: ReviewQueueItemDTO[], unansweredQuestions: StaffQuestionListItemDTO[], stuckStudents: StudentListItem[], waitingOnUs: [{ kind: 'review' \| 'question' \| 'red_no_action', studentId, refId, since, slaHours, elapsedHours, breached, escalated? }], counts, generatedAt }`. (هماهنگ با کد، اسپرینت ۳) مدیر بدون `mentorId` یادآورهای **همه** را می‌بیند. (اسپرینت ۴) `escalated` = «قرمز بدون اقدام» بیش از `redEscalateDays`؛ مدیری که با فیلتر مشاور دیگر نگاه می‌کند هم آن را می‌بیند |
| `GET /stuck` | A، M | `mentorId?` (فقط A)، `level=yellow\|red`، `includeSnoozed=0\|1` | `StudentListItem[]`، مرتب: قرمز ← زرد، سپس `statusSince` قدیمی‌تر. **فقط `active`** (F7) |

## ۹. سلامت و پرچم (`health`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /students/:id/health` | A، M | — | `HealthDetailDTO = { status, reasons[{rule, level, ball, facts}], churnRisk, ball, statusSince, redSince, computedAt, snoozedUntil, snoozeReason, snoozedBy }`. (هماهنگ با کد، اسپرینت ۴) اگر هنوز محاسبه نشده، همان‌جا محاسبه می‌شود |
| `PUT /students/:id/health/snooze` | A، M | `{ until: 'YYYY-MM-DD', reason }` | `200 HealthDetailDTO`. تا پایان آن روز تهران؛ امروز یا قبل ← `422`؛ حداکثر یک سال؛ رویداد `health.snoozed` (هماهنگ با کد، اسپرینت ۴) |
| `DELETE /students/:id/health/snooze` | A، M | — | `200 HealthDetailDTO` |
| `GET /students/:id/flags` | A، M | `active=1` | `FlagDTO[]` |
| `POST /students/:id/flags` | A، M | `{ category, level, note?, expiresAt? }` | `201 FlagDTO`؛ بازمحاسبه‌ی سلامت. (هماهنگ با کد، اسپرینت ۴) `expiresAt` روز یا لحظه؛ گذشته ← `422` |
| `POST /flags/:id/clear` | A، M | — | `200 FlagDTO`؛ تکراری بی‌اثر |
| `POST /admin/health/recompute` | A | `{ studentId? }` | بدون `studentId` = sweep کامل؛ `audit_log` (هماهنگ با کد، اسپرینت ۴). پس از اولین `db:migrate` روی دیتابیس دارای هنرجو یک بار اجرا شود |

هیچ فیلد سلامت، پرچم، snooze یا `studentSummary` در هیچ DTO هنرجو نیست (تست canary اسپرینت ۴).

## ۱۰. سؤال و پاسخ (`questions`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /questions` | A، M | `status?`، `awaiting=team\|student`، `assigneeId?` (A)، `studentId?`، cursor | `StaffQuestionListDTO`. در دامنه **یا** `assignee` = خودش (فقط باز/پاسخ‌داده؛ `viaAssignment: true`). اول «منتظر تیم» با قدیمی‌ترین SLA. هر ردیف `sla` (فقط وقتی توپ با تیم است) |
| `GET /me/questions` | S | `status?` | `StudentQuestionListDTO = { items, expectedResponseText }` (هر آیتم `hasNewReply`) |
| `POST /me/questions` | S | `{ subject, body, links?, attachmentIds?, taskId?, priority? }` | `201 StudentQuestionDetailDTO`. `assignee` = مشاور اصلی **فعال**؛ وگرنه (هماهنگ با کد، اسپرینت ۴) **قدیمی‌ترین مدیر فعال**؛ اگر هیچ مدیری نیست ← `409`. (امنیت C3) `taskId` کار **خود** هنرجو؛ `attachmentIds` فقط `pending` خودش؛ وگرنه `422`. «درخواست تمدید مهلت» = همین مسیر با `taskId` آن کار |
| `GET /questions/:id` | A، M (دامنه یا assignee تا وقتی رشته باز است)، S (مال خودش) | — | رشته + پیام‌ها (قدیمی اول). کارکنان `StaffQuestionDetailDTO` با `studentSummary`؛ هنرجو `StudentQuestionDetailDTO` (`author.isTeam`). `switch` روی نقش |
| `POST /questions/:id/messages` | A، M، S (مال خودش) | `{ body, links?, attachmentIds?, cannedResponseId? }` | `201` DTO همان نقش. گذارهای `data-model.md` ۲-۸. (هماهنگ با کد، اسپرینت ۴) `cannedResponseId` فقط کارکنان (هنرجو ← `422`)؛ کارکنان روی رشته‌ی بسته ← `409`؛ پیام هنرجو رشته‌ی بسته را باز می‌کند. (امنیت C3/C4) `attachmentIds` فقط `pending` خود فرستنده |
| `POST /questions/:id/close` | A، M، S (مال خودش) | — | `200` DTO همان نقش |
| `PUT /questions/:id/assignee` | A | `{ assigneeId }` | `200 StaffQuestionDetailDTO`. (امنیت C3) `assigneeId` کاربر فعال admin یا mentor؛ وگرنه `422`. `audit_log(question.assignee_changed)` |
| `GET /canned-responses` | A، M | — | `CannedResponseDTO[]` |
| `POST /canned-responses` · `PATCH /canned-responses/:id` | A | `{ title, body, category, isActive }` | — |

ویرایش پیام سؤال (۱۵ دقیقه، `data-model.md` ۲-۸) در 0.1 **endpoint ندارد** (تصمیم معماری، هماهنگ با کد، اسپرینت ۴؛ بک‌لاگ).

## ۱۱. check-in هفتگی (`checkins`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /me/checkins/current` | S | — | `{ weekStart, open: boolean, existing?: CheckinDTO, weekSummary: { tasksSubmitted, tasksAccepted } }`. (هماهنگ با کد، اسپرینت ۴) `open` فقط برای یادآوری در UI است (از روز تنظیم‌شده به بعد) |
| `POST /me/checkins` | S | `{ activityText?, blocker?, mood: 1..5, nextWeekPlan?, needsHelp: boolean }` | `201 CheckinDTO` (`questionId` اگر کمک خواست). (هماهنگ با کد، اسپرینت ۴) **هر روز هفته** پذیرفته و به هفته‌ی **جاری** نسبت داده می‌شود. اگر `needsHelp`، سؤالی با `source=checkin` در همان تراکنش ساخته می‌شود. ارسال دوم در همان هفته ← `409` |
| `GET /students/:id/checkins` | A، M | cursor | `CheckinListDTO` |

اگر `settings.checkin.enabled = false` باشد، همه‌ی این مسیرها `404` می‌دهند. (هماهنگ با کد، اسپرینت ۴) پیش‌فرض seed: **روشن** (تصمیم E5).

## ۱۲. نقطه‌ی عطف (`milestones`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /milestone-types` | * | `includeInactive?` (A) | `MilestoneTypeDTO[]` |
| `POST /milestone-types` · `PATCH /milestone-types/:id` | A | فیلدهای `milestone_types` | — |
| `GET /students/:id/milestones` | A، M | — | `MilestoneDTO[]` |
| `GET /me/milestones` | S | — | `StudentMilestoneDTO[]`: فقط `approved` و `proposed` خودش (ردشده‌ها نمی‌آیند) |
| `POST /students/:id/milestones` | A، M | `{ typeId, occurredOn, platformId?, amount?, currency?, evidenceText?, attachmentIds? }` | `201 MilestoneDTO`؛ مستقیم `approved` |
| `POST /me/milestones` | S | همان، **بدون** `status` (کلید اضافه ← `422`) | `201`؛ `proposed`. نوع `requiresEvidence` بدون متن و بدون پیوست ← `422 fields.evidenceText`. (امنیت C3/C4) `typeId` و `platformId` فعال؛ `attachmentIds` فقط `pending` خودش. مبلغ رشته‌ی اعشاری، ارز پیش‌فرض `USD` |
| `POST /milestones/:id/approve` | A، M | — | `200 MilestoneDTO`. فقط از `proposed`؛ تأیید دوم نوع `uniquePerStudent` ← `409` (قفل ردیف `students`) |
| `POST /milestones/:id/reject` | A، M | `{ reason }` | `200 MilestoneDTO`؛ فقط از `proposed` |
| `GET /dashboard/north-star` | A | `from`، `to` (روزهای `YYYY-MM-DD`؛ پیش‌فرض: ماه شمسی جاری) | `{ approvedInRange, approvedTotal, medianDaysToFirst, labeledProposalCount }`. (هماهنگ با کد، اسپرینت ۴) `medianDaysToFirst` = میانه‌ی (روز تهران `occurred_on` − روز تهران `joined_at`) روی **اولین** نقطه‌ی عطف North Star تأییدشده‌ی هر هنرجو. `labeledProposalCount` = جفت‌های «پروپوزال + نقد» با رضایت (G4) |

## ۱۳. فهرست‌ها، تنظیمات، ورود و خروج (`catalog`، `admin`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /platforms` · `GET /tracks` | * | — | فقط فعال‌ها (A با `includeInactive`) |
| `POST /platforms` · `PATCH /platforms/:id` | A | `{ name, trackId?, sortOrder?, isActive? }` | افزودن پلتفرم بدون تغییر کد (F2). نام یکتا بدون حساسیت به حروف (`422 fields.name`) |
| `GET /settings` | A | — | `SettingsDTO`: همه‌ی کلیدها، هر کدام `{ value, version }` (`version = 0` یعنی پیش‌فرض و هنوز ذخیره نشده) |
| `PUT /settings` | A | `{ <key>: value, … }` | (هماهنگ با کد، اسپرینت ۴) هر زیرمجموعه از کلیدها در **یک تراکنش**؛ `422` با `fields` به مسیر کلید (مثلاً `inactivity`) |
| `PUT /settings/:key` | A | بدنه = `value` طبق schema آن کلید | `{ key, value, version }`. کلید ناشناخته ← `404`. تغییر `health.rules` یا `checkin` ← sweep فوری. `audit_log`. کلیدها: `access`، `sla`، `business_hours`، `tasks`، `questions`، `checkin`، `health.rules` |
| `GET /settings/public` | * | — | `{ questions: { expectedResponseText }, checkin: { enabled, weekday } }` (هماهنگ با کد، اسپرینت ۴) |
| `GET /settings/staff` | A، M | — | (هماهنگ با کد، اسپرینت ۴) `StaffSettingsDTO`: موارد عمومی + `access` (`mentorScope`، `mentorsCanInviteStudents`) + آستانه‌های SLA |
| `GET /exports/students.csv` · `tasks.csv` · `milestones.csv` (Should) | A | — | CSV با UTF-8 BOM؛ تاریخ‌ها در دو ستون **شمسی و میلادی**؛ موبایل `0912…`؛ خنثی‌سازی فرمول (SEC-V2)؛ `Content-Disposition: attachment`، `no-store`؛ `audit_log(export.*)`. `milestones.csv` بدون متن مدرک |
| `POST /imports/students` (Should) | A | (امنیت C6؛ هماهنگ با کد، اسپرینت ۳) multipart: `file` **فقط CSV UTF-8** (با یا بدون BOM)، حداکثر ۱ مگابایت و ۵۰۰ ردیف؛ `dryRun` (`'true'` پیش‌فرض، `'false'` ثبت). XLSX ← `415` | `200 { dryRun, total, valid, imported, rows: [{ line, ok, errors: [{column, message}], studentId?, inviteUrl? }] }` (`no-store`؛ خطا بدون مقدار، SEC-V5). ستون‌ها فارسی یا انگلیسی: نام، موبایل، مشاور (موبایل یا نام)، مرحله (`displayCode` با ارقام فارسی یا لاتین، یا نام)، شاخه، پلتفرم اصلی، لینک و تیتر پروفایل، آخرین کار و مهلت، یادداشت. (هماهنگ با کد، اسپرینت ۴) مهلت **شمسی** (`1405/08/01`، ارقام فارسی) یا میلادی (`YYYY-MM-DD`)؛ استثنای مستند ADR-0008. اجرای واقعی فقط ردیف‌های معتبر را ثبت می‌کند و هر ردیف تراکنش خودش را دارد |

## ۱۴. پیوست (`files`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `POST /attachments` | * | multipart: `file` (jpeg/png/webp، حداکثر ۵ مگابایت) | `201 { id, mimeType, sizeBytes, width, height, originalName, href, status: 'pending' }`. با فرستادن `attachmentIds` در تحویل، پیام یا نقطه‌ی عطف به آن وصل می‌شود. (امنیت C4) حجم بیشتر ← `413` **پیش از** بافر شدن بدنه؛ نوع (از **محتوا**) غیر از jpeg/png/webp ← `415`؛ بیش از ۴۰ مگاپیکسل ← `422`؛ ۲۰ پیوست `pending` یا ۱۰۰ آپلود در ۲۴ ساعت ← `429`. `.rotate()`، بدون متادیتا، حداکثر ۴۰۹۶ پیکسل؛ اصل فایل ذخیره نمی‌شود |
| `GET /attachments/:id` | هر کس که به والد دسترسی دارد (از `loadInScope`)؛ آپلودکننده تا وقتی `pending` است؛ (هماهنگ با کد، اسپرینت ۴) assignee خارج از دامنه برای پیوست پیام سؤال فقط تا وقتی رشته باز است | — | جریان فایل از سرور. (امنیت C4) `Content-Type` از قالب ذخیره‌شده؛ `X-Content-Type-Options: nosniff`؛ `Content-Disposition: inline; filename*=UTF-8''<نام پاک‌شده>`؛ `Content-Security-Policy: default-src 'none'; img-src 'self'; sandbox`؛ (هماهنگ با کد، اسپرینت ۳) **`Cache-Control: private, no-store`** (سخت‌گیرتر از `no-cache` در SEC-U6؛ بدون ETag اثر یکسان دارد). بیرون از دسترسی ← `404` |

**وصل کردن پیوست (امنیت C4):** هر endpointی که `attachmentIds` می‌گیرد پیوست‌ها را **فقط** با `UPDATE … WHERE id = ANY($ids) AND status = 'pending' AND uploaded_by = $actor RETURNING id` و درون تراکنش ساخت والد وصل می‌کند. اگر تعداد ردیف‌ها با تعداد شناسه‌ها برابر نبود ← rollback و `422 VALIDATION_FAILED { fields: { attachmentIds } }`. حداکثر ۱۰ پیوست در هر درخواست.

## ۱۵. داخلی و عملیاتی

| متد و مسیر | دسترسی | نکته |
|---|---|---|
| `GET /healthz` (بیرون از `/api/v1`) | عمومی | قرارداد (SEC-J4): `{ ok, db: 'ok' \| 'fail', lastHealthSweepAt, version }`، `no-store`، بدون داده‌ی حساس. (هماهنگ با کد، اسپرینت ۴) کد فعلی `{ status: 'ok', db: 'ok', lastHealthSweepAt }` و در خطا `503 { status: 'error', db: 'unreachable' }` برمی‌گرداند؛ هم‌سان‌سازی نام فیلدها، افزودن `version` و `sweepStale` (آخرین sweep قدیمی‌تر از ۳ ساعت، ADR-0005) در followup F-08 |
| `POST /api/internal/jobs/:name` | سرآیند `X-Job-Secret` | (هماهنگ با کد، اسپرینت ۴) فقط وقتی `JOBS_MODE=http-trigger` (ADR-0007)؛ وگرنه همیشه `404`. مقایسه‌ی ثابت‌زمان روی SHA-256؛ secret غلط ← `404` و لاگ هشدار؛ فقط `health.sweep`، `auth.cleanup`، `files.cleanup`؛ بدنه نادیده؛ ۶۰ بار در ساعت. secret کوتاه‌تر از ۳۲ بایت ← برنامه بالا نمی‌آید. در manifest نیست (بیرون از `/api/v1` و بیرون از بررسی نشست و `Origin`) |

---

## ۱۶. نمونه‌ی کامل: تحویل پروپوزال برای بررسی

```http
POST /api/v1/tasks/0192f1a0-…/submissions
Cookie: __Host-uc_session=…
Origin: https://app.example.ir
Content-Type: application/json

{
  "platformId": "0192e…",
  "jobPostText": "We are looking for a Shopify developer to …",
  "proposalText": "Hi, I noticed your store …",
  "bodyText": "این دومین نسخه است؛ hook را عوض کردم.",
  "aiUseConsent": true
}
```
```http
201 Created
{
  "id": "0192f1b7-…",
  "version": 2,
  "createdAt": "2026-10-19T09:12:44Z",
  "task": { "id": "0192f1a0-…", "status": "submitted" }
}
```
خطای رایج: کار در وضعیت `accepted` ← `409 { "error": { "code": "INVALID_TRANSITION", "message": "این کار قبلاً تأیید شده است." } }`.

---

## ۱۷. آنچه در 1.0 اضافه می‌شود (برای جلوگیری از تداخل نام‌ها)
`/api/v1/opportunities/**` (F12)، `/api/v1/ai/runs/**` (F13 تا F15؛ ADR-0006)، `/api/v1/me/quota` (F17)، `/api/v1/me/notification-preferences` (F18)، `/api/v1/auth/otp/**` (F16)، `/api/v1/auth/reauth` (SEC-S7؛ پیش از دعوت دومین مدیر). مسیرهای 0.1 تغییر نمی‌کنند.

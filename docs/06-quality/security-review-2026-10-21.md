# بازبینی امنیتی کد — نسخه‌ی 0.1، پس از اسپرینت‌های ۱ تا ۴

> ۲۹ مهر ۱۴۰۵ (2026-10-21) — نویسنده: security-reviewer — وظیفه: F-07 در `docs/05-delivery/followups.md`
> ورودی‌ها: `docs/04-architecture/security.md`، ADR-0003 بند ۹، ADR-0004 بند ۶، ADR-0007 و ADR-0010 (بخش‌های «تطبیق با پیاده‌سازی»)، `sprint-1.md` تا `sprint-4.md` (فرض‌ها و «با سند فرق دارد»)، و کد `apps/web/src` در همان روز.
> روش: فقط خواندن کد و اسناد. هیچ سرور یا دیتابیسی روشن نشد و هیچ آزمونی روی محیط واقعی انجام نشد. شماره‌ی خط‌ها مال همین نسخه‌ی کد است. backend-engineer و frontend-engineer هم‌زمان کار می‌کنند، پس خط‌ها ممکن است کمی جابه‌جا شوند.

---

## ۰. خلاصه

- **همه‌ی انحراف‌های پذیرفته‌شده‌ی F-07 قابل‌قبول‌اند.** هیچ‌کدام سناریوی سوءاستفاده‌ای نمی‌سازد که طراحی اصلی جلویش را می‌گرفت و کد فعلی نمی‌گیرد. دو مورد شرط دارند: «دعوت پذیرفته شد» تا ساخت F-01، و نام بازبین در DTO هنرجو.
- متن الزام‌های SEC-S1، SEC-C3، SEC-R6 و SEC-U6 در `security.md` مطابق همین حکم‌ها اصلاح شد.
- **سه یافته‌ی تازه که باید اصلاح شوند** (هیچ‌کدام بحرانی یا بالا نیست):

| # | یافته | شدت | followup |
|---|---|---|---|
| N1 | خطای پیش‌بینی‌نشده‌ی دیتابیس **همه‌ی پارامترهای پرس‌وجو** را در لاگ می‌نویسد: موبایل، متن یادداشت داخلی، هش رمز و هر داده‌ی دیگری | متوسط | F-17 (بالا) |
| N2 | اگر `TRUSTED_PROXY_HOPS` در تولید تنظیم نشود، همه‌ی کاربران یک IP (`unknown`) می‌گیرند و هر کسی با ۳۰ رمز غلط در ۱۵ دقیقه **ورود همه‌ی کاربران** را می‌بندد. هیچ هشداری هم ثبت نمی‌شود | متوسط | F-18 (بالا) |
| N3 | CI هیچ کنترل امنیتی‌ای ندارد: نه `pnpm audit`، نه gitleaks، نه جستجوی `"use server"`، و Dependabot یا Renovate هم نیست | متوسط | F-19 (بالا) |

- **چیزهایی که درست ساخته شده‌اند** (بخش ۳): `loadInScope` و `assertRefs`، DTOهای هنرجو که از صفر ساخته می‌شوند، CSRF، آپلود، CSP و هدرها، CSV، endpoint داخلی jobs و توکن‌های دعوت.

---

## ۱. حکم انحراف‌ها (F-07)

مقیاس شدت همان مقیاس `security.md` بخش ۳ است. «شدت باقی‌مانده» یعنی ریسکی که پس از پذیرش انحراف می‌ماند.

### ۱-۱. SEC-S1: `Max-Age` کوکی تا سقف مطلق نشست، با انقضای لغزنده‌ی سمت سرور (ADR-0003 بند 9-1)
- **کد:** `modules/identity/service.ts:177-194` (`cookieExpiresAt = absoluteExpiry`)؛ `server/auth/request.ts:58-71`؛ `modules/identity/session-policy.ts:29-32` (`slidingExpiry` هیچ‌وقت از سقف مطلق رد نمی‌شود) و `:44-53` (`isSessionValid` در هر درخواست `expires_at`، سقف مطلق، `revoked_at`، `status`، `erased_at` و `password_changed_at` را می‌سنجد)؛ هر دو مسیر API (`server/auth/request.ts:40-53`) و RSC (`server/auth/current-user.ts:28-36`) از همان `authenticateSession` (`identity/service.ts:211-235`) می‌گذرند.
- **سناریوی بررسی‌شده:** کسی کوکی مشاوری را که ۸ روز از سیستم استفاده نکرده، از لپ‌تاپ مشترک برمی‌دارد. کوکی هنوز در مرورگر هست ولی `expires_at` در سرور گذشته است ← `null` ← `401` یا انتقال به `/login`. خروج، تغییر رمز، پذیرش توکن و حذف حساب هم نشست را در سرور باطل می‌کنند. پس عمر کوکی هیچ دسترسی‌ای اضافه نمی‌کند.
- **تنها اثر:** یک توکن مرده تا سقف مطلق روی دیسک می‌ماند. این توکن هش‌شده ذخیره می‌شود و پس از انقضا هیچ ارزشی ندارد.
- **حکم: قابل‌قبول.** شدت باقی‌مانده: هیچ. متن SEC-S1 اصلاح شد.

### ۱-۲. SEC-C3: POST بی‌بدنه بدون `Content-Type` (ADR-0003 بند 9-2)
- **کد:** `server/http/csrf.ts:30-32` (`Origin` الزامی و برابری دقیق)، `:35-36` (`Sec-Fetch-Site`)، `:39-43` (نبود `Content-Type` فقط وقتی `Content-Length` و `Transfer-Encoding` نیستند)؛ لایه‌ی دوم در `server/http/handler.ts:202` (بدنه‌ی غیرخالی بدون `Content-Type` ← `415`) و `:211-219` (مسیر بی‌بدنه هر بدنه‌ای جز خالی یا `{}` را رد می‌کند).
- **سناریوهای بررسی‌شده:**
  1. سایت مهاجم `fetch(url, {method:'POST', mode:'no-cors', credentials:'include'})` بدون بدنه می‌فرستد ← `Content-Type` ندارد، ولی `Origin` مهاجم را دارد ← `403`.
  2. زیردامنه‌ی هم‌سایت (مثلاً وردپرس روی `www.`) ← `Origin` برابر نیست ← `403`.
  3. HTTP/2 بدون `Content-Length` و با بدنه ← از `csrf.ts` رد می‌شود، ولی `handler.ts:202` آن را `415` می‌دهد، یا `:215` آن را `422` می‌دهد.
  4. درخواست بدون `Origin` ← `403`. مرورگرهای امروزی روی هر POST، حتی same-origin، `Origin` می‌فرستند.
- **حکم: قابل‌قبول.** شدت باقی‌مانده: پایین. دفاع اصلی بررسی دقیق `Origin` است و بی‌استثنا اجرا می‌شود. متن SEC-C3 اصلاح شد.

### ۱-۳. SEC-R6: بدنه‌ی `429` با `code` و پیام فارسی دارای دقیقه‌ی مانده (ADR-0003 بند 9-3)
- **کد:** `server/http/errors.ts:122-127`؛ شمارش یکسان برای موبایل ناموجود: `identity/service.ts:292-297`؛ محاسبه‌ی قفل: `:278-283`.
- **سناریوی بررسی‌شده:** مهاجم وجود حساب را از روی تفاوت پاسخ `429` حدس بزند. پیام فقط از `retryAfterSeconds` ساخته می‌شود و اطلاع تازه‌ای ندارد. چون قفل `p` برای موبایل ناموجود هم شمرده می‌شود، حتی عدد ۶۰ دقیقه هم وجود حساب را لو نمی‌دهد. (این‌که از روی ۱۵ یا ۶۰ دقیقه لایه‌ی قفل معلوم می‌شود، از قبل در طراحی پذیرفته شده بود.)
- **حکم: قابل‌قبول.** شدت باقی‌مانده: هیچ. متن SEC-R6 اصلاح شد.

### ۱-۴. SEC-U6: `GET /attachments/:id` با `Cache-Control: private, no-store`
- **کد:** `server/http/handler.ts:150-155` (`finalizeHeaders` همیشه `private, no-store` می‌گذارد)؛ `app/api/v1/attachments/[id]/route.ts:16-20`.
- **حکم: قابل‌قبول.** سخت‌گیرتر از الزام است و هدف C4 را بهتر برآورده می‌کند: پس از خروج روی دستگاه مشترک، تصویر از cache دیده نمی‌شود. هزینه‌اش فقط دانلود دوباره روی اینترنت ضعیف است. متن SEC-U6 اصلاح شد.

### ۱-۵. DTO هنرجو: `StudentReviewDTO.reviewer.displayName` (ADR-0004 بند 6-5)
- **کد:** `modules/tasks/service.ts:236-266` (DTO از صفر ساخته می‌شود؛ خط `247` فقط `displayName` را می‌گذارد)؛ نوع در `modules/tasks/contracts.ts:342-348`.
- **سناریوی بررسی‌شده:** هنرجو از روی نام بازبین بفهمد کدام مشاور دیگر پرونده‌اش را دیده است. وقتی `mentorScope = 'all'` است یا مدیر بازبینی می‌کند، هنرجو نام یک کارمند دیگر را می‌بیند. نام نمایشی کارکنان داده‌ی حساسی نیست و همین الگو در `SharedNoteDTO.author.displayName` هم پذیرفته شده است. شناسه، موبایل و `reviewerId` نمی‌آیند.
- **حکم: قابل‌قبول با شرط:** (۱) T-DTO و T-CANARY همچنان `reviewerId` و موبایل کارکنان را در همه‌ی پاسخ‌های هنرجو بگردند؛ (۲) پس از حذف حساب کارمند، نام همان «کاربر حذف‌شده» نمایش داده شود (طبق ADR-0010 همین‌طور است).

### ۱-۶. `422` یکسان برای همه‌ی شناسه‌های ارجاعی، از جمله `studentId` و `studentIds` (ADR-0004 بخش ۱-۱؛ تفاوت با C3 که برای منبع هنرجوی خارج از دامنه `404` می‌خواست)
- **کد:** `modules/access/refs.ts:65-78` (یک پیام `INVALID_REF_MESSAGE` برای ناموجود، خارج از دامنه، مال هنرجوی دیگر و غیرفعال)، `:87-95` (`studentsInScope`: وجود و دامنه هر دو همان `false` را می‌دهند)؛ `server/http/errors.ts:109`؛ پیوست‌ها با همان متن در `modules/files/service.ts:178-181`؛ `404` فقط برای شناسه‌ی مسیر در `modules/access/scope.ts:251-267`.
- **سناریوی بررسی‌شده:** مشاور برای پیدا کردن شناسه‌ی هنرجوی مشاور دیگر، شناسه‌ها را در `POST /reminders {studentId}` یا `POST /tasks/bulk {studentIds}` امتحان کند. برای «ناموجود» و «خارج از دامنه» همان `422` با همان بدنه را می‌گیرد، پس oracle وجود ندارد. شناسه‌ها هم UUIDv7 و حدس‌نزدنی‌اند. در `cancelTaskIds`، کد `409 INVALID_TRANSITION` فقط **پس از** عبور ref (یعنی برای کار همان هنرجو) برمی‌گردد و چیزی درباره‌ی هنرجوی دیگر نمی‌گوید.
- **حکم: قابل‌قبول.** شدت باقی‌مانده: هیچ. هدف C3 (رد کامل و بدون نشت) حفظ شده و فقط کد وضعیت فرق دارد.

### ۱-۷. پاک شدن توکن‌ها ۷ روز پس از مصرف و ناپدید شدن «دعوت پذیرفته شد» (ADR-0003 بند 9-9، ADR-0010)
- **کد:** `modules/identity/repo.ts:410-423` (حذف توکن مصرف‌شده، منقضی یا باطل پس از ۷ روز)؛ `modules/identity/service.ts:537-543` (`audit_log(user.invite_accepted)` با زمان و IP در همان تراکنش).
- **سناریوی بررسی‌شده:** لینک دعوت هنرجو در گروه تلگرام فوروارد شده است. کسی که موبایل هنرجو را می‌داند آن را می‌پذیرد. هنرجو ۱۰ روز بعد می‌گوید «لینک کار نکرد». امروز برچسب «پذیرفته شد: زمان، دستگاه» در `GET /users` از بین رفته و در پرونده هم نیست، پس مربی شاید فقط یک لینک تازه بسازد و تصاحب را نبیند. شواهد کامل از بین نمی‌رود: `audit_log` زمان و IP را ۲۴ ماه نگه می‌دارد (IP تا ۹۰ روز). ولی User-Agent در آن نیست و مربی آن را در UI نمی‌بیند.
- **نگه‌داری ۷ روزه‌ی خود توکن:** درست است. نگه داشتن هش توکن فقط برای یک برچسب نمایشی دلیلی ندارد.
- **حکم: قابل‌قبول با شرط:** F-01 (ستون‌های `users.invite_accepted_at` و `invite_accepted_user_agent` و نمایش در پرونده) **پیش از دعوت اولین هنرجوی واقعی** ساخته شود، با migration داده از توکن‌ها یا `audit_log` موجود. شدت باقی‌مانده تا آن موقع: پایین.

### ۱-۸. موردهای دیگری که در یادداشت‌ها و ADRها پیدا شد
| مورد | کد بررسی‌شده | حکم |
|---|---|---|
| ADR-0003 9-5: `admin:reset-link` برای کاربر `invited` لینک **دعوت** ۱ ساعته می‌دهد | `identity/service.ts:834-870` (پاک کردن قفل‌ها، `audit_log` با `via: 'cli'`) | **قابل‌قبول**. فقط از کنسول سرور اجرا می‌شود و همان SEC-T7 است |
| ADR-0003 9-7: راز تصادفی دستگاه در غیر production | `server/env.ts:44` (در production بدون آن بالا نمی‌آید)؛ `identity/service.ts:137-142` | **قابل‌قبول** |
| ADR-0003 9-10: تغییر رمز با رمز فعلی غلط ← `422` + قفل `pwchange:u` | `identity/service.ts:361-375` | **قابل‌قبول**. حدس رمز فعلی با نشست دزدیده‌شده به ۵ بار در ۱۵ دقیقه محدود است |
| sprint-1 فرض ۱۱: `auth.locked` در `audit_log` فقط برای حساب موجود | `identity/service.ts:307-323` | **قابل‌قبول**. همان SEC-L7 است. قفل IP در لاگ ساختاریافته می‌آید |
| ADR-0004 6-1: ماژول `access` جدول‌های دیگر را مستقیم و فقط‌خواندنی می‌خواند | `modules/access/repo.ts` | **قابل‌قبول**. فقط SELECT است؛ در بازبینی کد هر نوشتن در این فایل رد شود |
| ADR-0004 6-3: ساخت دوباره‌ی لینک دعوت توسط مشاور بدون `mentorsCanInviteStudents` | `identity/policy.ts:37-52`، `identity/service.ts:654-689` | **قابل‌قبول**. شرط‌های C3 (`role='student'`، `invited`، در دامنه) پیش از هر کاری سنجیده می‌شوند. سناریوی B4 (مشاور ← مدیر) بسته است |
| ADR-0004 6-4: هر کارمند در دامنه بازبینی می‌کند | `tasks/service.ts` (بازبینی با `loadInScope`) | **قابل‌قبول** |
| ADR-0004 6-7: assignee خارج از دامنه پیوست‌های رشته را تا وقتی باز است می‌بیند | `files/service.ts:108-120` | **قابل‌قبول**. پس از بسته شدن رشته `404` است |
| ADR-0004 بخش ۱-۱: `existingStudentId` در `409 PHONE_TAKEN` فقط برای مدیر | `students/service.ts:355-361` | **قابل‌قبول** |
| ADR-0010: پیوستِ حذف‌نشده در حذف حساب به ردیف `pending` قدیمی تبدیل می‌شود | `files/repo.ts:149-183` | **قابل‌قبول**. `uploaded_by` می‌ماند، پس فقط آپلودکننده تا پاک‌سازی بعدی (حداکثر ۲۴ ساعت) به فایلی دسترسی دارد که خودش فرستاده است. نام فایل پاک شده است |

---

## ۲. یافته‌های تازه (باید اصلاح شود)

### N1 — پارامترهای پرس‌وجو در لاگ خطا — متوسط (F-17)
- **محل:** `apps/web/src/server/http/handler.ts:184-195`، به‌خصوص `:193` (`{ type, message: err.message, stack: err.stack }`)؛ همین الگو در `modules/health/recompute.ts:137-140` (`error: (err as Error).message`).
- **ریشه:** `drizzle-orm` 0.45 هر خطای درایور را در `DrizzleQueryError` می‌پیچد و پیامش `Failed query: <sql>\nparams: <همه‌ی پارامترها>` است (`node_modules/drizzle-orm/errors.js:10-19`، `pg-core/session.js:41`). `stack` همین پیام را تکرار می‌کند. `redact` در pino (`server/logger.ts`) فقط کلیدها را می‌پوشاند و داخل رشته را نمی‌بیند.
- **سناریوی واقعی:** Azure Flexible Server در نگه‌داری برنامه‌ریزی‌شده ری‌استارت می‌شود، یا یک deadlock، timeout یا نقض CHECK پیش‌بینی‌نشده رخ می‌دهد. هر INSERT یا UPDATE در حال اجرا `500` می‌شود و `http.unhandled` این‌ها را در لاگ برنامه می‌نویسد:
  - `INSERT INTO notes` ← متن **یادداشت داخلی** (ح۳)؛
  - `INSERT INTO users` ← **موبایل و نام** (ح۲، نقض SEC-L3)؛
  - `UPDATE users SET password_hash` در `acceptToken` ← **هش argon2** (ح۳؛ T-LOG دقیقاً `$argon2id$` را می‌گردد)؛
  - `INSERT INTO submissions` ← متن پروپوزال و آگهی (ح۲).
  
  لاگ ۳۰ روز می‌ماند و به هر کسی می‌رسد که به لاگ App Service دسترسی دارد. T-LOG فعلی (F-05) فقط مسیر موفق را می‌سنجد و این را نمی‌بیند.
- **راه‌حل:** در `describeError`، اگر خطا `query` یا `params` دارد (یا `name === 'DrizzleQueryError'`)، فقط `{ type, sqlState: cause.code, constraint: cause.constraint, table: cause.table }` لاگ شود: بدون `message`، `params`، `detail` و `stack` (`detail` در نقض unique مقدار را دارد). برای خطاهای دیگر `stack` بماند. یک تابع مشترک `safeErrorSummary(err)` در `server/` ساخته شود و در `health/recompute.ts:137` و `files/service.ts:232` هم به کار رود. یک مورد هم به T-LOG اضافه شود: نقض CHECK یا unique عمدی روی INSERT یادداشت با متن `CANARY-…`، و جستجوی آن در لاگ.

### N2 — `TRUSTED_PROXY_HOPS` در تولید الزامی نیست و پیش‌فرضش بی‌صدا شکست می‌خورد — متوسط (F-18)
- **محل:** `apps/web/src/server/env.ts:16` (`default(0)`) و `:44` (در production فقط `DEVICE_COOKIE_SECRET` الزامی است)؛ `server/http/client-ip.ts:27` (با `0` بدون هشدار `unknown` برمی‌گرداند؛ Route Handler به آدرس سوکت دسترسی ندارد، `:14-15`).
- **سناریوی واقعی:** استقرار روی App Service بدون `TRUSTED_PROXY_HOPS=1` انجام می‌شود. این مقدار در `.env.example` صفر است و برنامه بدون خطا بالا می‌آید. از آن به بعد IP همه‌ی کاربران `unknown` است:
  1. مهاجم ناشناس هر ۱۵ دقیقه ۳۰ ورود غلط با موبایل‌های تصادفی می‌فرستد. قفل `login:ip:unknown` (SEC-R3) **ورود همه‌ی کاربران** را می‌بندد. کوکی دستگاه این لایه را دور نمی‌زند (`identity/service.ts:278-283`).
  2. همین با ۳۰ `tokens/lookup` غلط پذیرش همه‌ی دعوت‌ها و بازنشانی‌ها را می‌بندد.
  3. ۵ رمز غلط برای موبایل مربی قفل `pi` را می‌سازد، چون «موبایل + IP» عملاً «موبایل» شده است. این قفل دستگاه شناخته‌شده را هم قفل می‌کند و سناریوی R4 دوباره باز می‌شود.
  4. ستون IP در `sessions` و `audit_log` بی‌فایده می‌شود.
  
  همین اتفاق برعکس هم رخ می‌دهد: اگر در مهاجرت اضطراری (بخش ۸) یک CDN جلوی سرور بیاید و عدد به‌روز نشود، IP پراکسی به جای IP کاربر خوانده می‌شود.
- **راه‌حل:** در `env.ts`، وقتی `NODE_ENV=production` است، `TRUSTED_PROXY_HOPS` **صریحاً تعیین شده** باشد (بدون پیش‌فرض). اگر مقدارش `0` است، فقط با یک پرچم صریح دیگر پذیرفته شود (مثلاً `ALLOW_NO_PROXY=true`). وقتی `X-Forwarded-For` در تولید با `hops=0` می‌رسد، یک بار هشدار `http.xff_ignored` لاگ شود. در runbook استقرار (devops) مقدار `1` برای App Service ثبت شود، با یک بررسی پس از استقرار: `sessions.ip` آخرین ورود برابر IP واقعی باشد (پورت حذف‌شده؛ SEC-R4 هنوز تأیید نشده است).

### N3 — کنترل‌های امنیتی CI و به‌روزرسانی وابستگی‌ها وجود ندارد — متوسط (F-19)
- **محل:** `.github/workflows/ci.yml` (فقط lint، typecheck، test و build)؛ هیچ `.github/dependabot.yml` یا پیکربندی Renovate در مخزن نیست.
- **الزام‌های اجرانشده:** SEC-D1 (Dependabot/Renovate)، SEC-D2 (`pnpm audit --prod --audit-level=high` مانع merge)، SEC-K1 (gitleaks)، SEC-A10 (رد `"use server"` در CI)، T-STATIC. امروز در کد `"use server"` و `dangerouslySetInnerHTML` وجود ندارد، و `noDangerouslySetInnerHtml` در `recommended` Biome فعال است. پس مشکل نبودِ **مانع برای آینده** است، نه نقص فعلی.
- **سناریوی واقعی:** یک آسیب‌پذیری بحرانی تازه در Next.js یا React منتشر می‌شود، از همان نوع CVE-2025-55182 (اجرای کد از راه دور در RSC، دسامبر ۲۰۲۵). تنها توسعه‌دهنده خبردار نمی‌شود، چون نه هشدار Dependabot دارد و نه شکست `audit` در CI. نسخه‌ی آسیب‌پذیر روی اینترنت می‌ماند، و این یعنی دسترسی به کل داده‌ی ح۳ (نام، موبایل و لینک آپورک همه‌ی هنرجوها؛ R1).
- **راه‌حل:** در `ci.yml` سه گام اضافه شود: `pnpm audit --prod --audit-level=high` (با فایل استثنای تاریخ‌دار)، gitleaks روی diff، و `! grep -rn --include='*.ts*' -E "['\"]use server['\"]" apps/web/src`. یک `.github/dependabot.yml` هفتگی برای npm و GitHub Actions هم ساخته شود که به‌روزرسانی‌های امنیتی `next`، `react`، `sharp` و `@node-rs/argon2` را جدا گروه‌بندی کند. Trivy روی image هم وقتی Dockerfile ساخته شد اضافه شود (SEC-D4).

---

## ۳. بازبینی سریع کد: آنچه بررسی شد و درست بود

| حوزه | آنچه دیدم | محل |
|---|---|---|
| `loadInScope` | ۱۲ نوع منبع، هر کدام تا `student_id` ریشه؛ هنرجو همیشه `404`؛ ناموجود و خارج از دامنه یک `404`؛ نوعِ بدون resolver خطا می‌دهد، نه «مجاز» | `modules/access/scope.ts:251-267` |
| `assertRefs` | درون تراکنش نوشتن، پیش از نوشتن؛ همه‌ی ردیف‌های جدول ADR-0004 ۱-۱ استفاده شده‌اند (`students`، `tasks`، `questions`، `reminders`، `milestones`، `path`)؛ `mentorId` مشاور در ساخت هنرجو نادیده گرفته می‌شود و `ownerId` یادآور فقط خودش است | `modules/access/refs.ts`؛ `students/service.ts:372-388`؛ `reminders/service.ts:134-139` |
| یادداشت | ویرایش و حذف: «نویسنده **و** در دامنه» یا مدیر (B7 بسته)؛ تغییر internal ← shared در `audit_log` | `timeline/service.ts:140-200` |
| `summary` برای assignee | فقط با رشته‌ی باز یا پاسخ‌داده (SEC-A8) | `students/service.ts:614-632` |
| مسیرهای مشترک | `switch` روی نقش با `default` ← `403`، نه DTO کارکنان (SEC-A5) | `tasks/service.ts:421-435`؛ `questions/service.ts:297-312` |
| DTO هنرجو | از صفر ساخته می‌شود، بدون spread ردیف دیتابیس؛ بدون `reviewerId`، سازنده، شمارنده، دلیل لغو، سلامت و پرچم. یادداشت فقط `shared` و حذف‌نشده، با نام نویسنده | `tasks/service.ts:148-167, 236-266`؛ `timeline/service.ts:204-222`؛ `timeline/repo.ts:86-96` |
| مسیرهای هنرجو | `(student)/layout` و `_load.ts` با `requireUser(['student'])`؛ هیچ import از `health`، `timeline/repo` یا service کارکنان در `app/(student)` و `api/v1/me` نیست (قاعده‌ی lint هنوز نیست؛ F-03) | `app/(student)/_load.ts:7-8` |
| هش رمز | `password_hash` فقط در `getCredentialsByPhone` خوانده می‌شود (SEC-A9) | `identity/repo.ts:49` |
| zod | همه‌ی schemaهای ورودی `strictObject` هستند؛ پیام خطا مقدار ورودی را تکرار نمی‌کند (SEC-A7، SEC-L4) | `server/http/validation.ts` |
| URL | `httpsUrl` (`https:`، بدون user/pass) برای پروفایل، لینک تحویل، سؤال، `contentLinks` مرحله و ورود CSV؛ `ExternalLink` با `rel="noopener noreferrer"` | `server/http/schemas.ts:17-30`؛ `components/ui/ltr.tsx:50-67` |
| آپلود | سقف بایت پیش از بافر؛ نوع از محتوا؛ ۴۰ مگاپیکسل؛ `rotate` ← بازکدگذاری بدون metadata؛ صف ۲تایی؛ سهمیه؛ وصل اتمی `pending AND uploaded_by`؛ نام فایل بدون نویسه‌ی کنترل و bidi؛ کلید ذخیره UUID؛ دانلود با CSP `sandbox`، `nosniff` و `Content-Type` بازکدگذاری‌شده | `server/http/handler.ts:230-248`؛ `modules/files/image.ts:46-102`؛ `modules/files/service.ts:58-182`؛ `app/api/v1/attachments/[id]/route.ts` |
| CSP و هدرها | CSP با nonce برای هر درخواست، بدون منبع خارجی؛ `unsafe-eval` و `ws:` فقط در development؛ HSTS، `nosniff`، `X-Frame-Options`، COOP، CORP، Permissions-Policy روی همه‌ی پاسخ‌ها؛ `no-referrer` و `no-store` و `noindex` روی `/invite` و `/reset`؛ بدون `X-Powered-By`؛ هیچ سرآیند CORS | `server/http/security-headers.ts`؛ `src/proxy.ts`؛ `next.config.ts` |
| CSV | خنثی‌سازی `= + - @ \t \r` و تمام‌عرض، پس از `trimStart`؛ ستون‌های صریح بدون داده‌ی داخلی؛ فقط مدیر؛ `audit_log` | `lib/csv.ts:9-21`؛ `modules/admin/csv-export.ts:36-88` |
| ورود CSV | فقط مدیر؛ سقف بایت پیش از بافر؛ خطای ردیف بدون مقدار؛ `no-store` | `app/api/v1/imports/students/route.ts`؛ `modules/admin/student-import.ts:352-358` |
| jobs | جز `http-trigger` همیشه `404`؛ مقایسه‌ی ثابت‌زمان روی SHA-256؛ فهرست سفید؛ بدنه نادیده؛ ۶۰ در ساعت؛ secret کوتاه ← برنامه بالا نمی‌آید | `server/jobs/trigger.ts:43-72`؛ `server/env.ts:30, 63-67` |
| توکن دعوت | fragment، `replaceState`، lookup و accept با POST، موبایل کامل، ۵ عدم تطابق ← ابطال، مصرف اتمی، ابطال نشست قبلی همان مرورگر | `components/auth/accept-token-form.tsx:38-40`؛ `identity/service.ts:455-580` |
| اسرار | `.env` و `.data` در `.gitignore`؛ فقط `.env.example` بدون مقدار در git؛ رمزهای داخل `tests/` فقط برای دیتابیس موقت محلی‌اند | `.gitignore:21-24` |

**نکته‌های کوچک (یافته‌ی امنیتی نیستند؛ فقط برای ثبت):**
- `STORAGE_DRIVER=azure-blob` هنوز پیاده نشده است (`server/storage/azure-blob.ts`). وقتی ساخته شد، SEC-K3 (کانتینر خصوصی، اعتبارنامه‌ی محدود به کانتینر و نه کلید کامل حساب) باید در همان بازبینی بررسی شود. در `.env.example` نام `AZURE_STORAGE_CONNECTION_STRING` به استفاده از کلید حساب اشاره دارد. یک connection string مبتنی بر SAS یا Managed Identity ترجیح دارد.
- `/healthz` در خطا `{err}` را لاگ می‌کند (`app/healthz/route.ts:21`). پرس‌وجوی آن `select 1` است و پارامتری ندارد، پس نشتی ندارد. هم‌سان‌سازی بدنه در F-08 است.

---

## ۴. پیامد برای followups
- F-07: **بسته شد** (این سند).
- تازه: **F-17** (N1)، **F-18** (N2)، **F-19** (N3)، هر سه با اولویت **بالا** (پیش از استقرار یا ورود داده‌ی واقعی).
- شرط ۱-۷ همان F-01 است و باید **پیش از دعوت اولین هنرجوی واقعی** انجام شود.

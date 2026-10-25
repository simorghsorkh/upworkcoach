# اسپرینت ۱ — یادداشت تحویل

> فاز ۴، نسخه‌ی 0.1 «دفتر مربی». هر نقش بخش خودش را می‌نویسد.

---

## بک‌اند (backend-engineer) — ۲۸ مهر ۱۴۰۵

**دامنه:** پایه‌ی داده، احراز هویت و دسترسی (ADR-0003 با C1 و C2، ADR-0004 با C3، ADR-0008، ADR-0010). امکانات محصول (هنرجو، کار، یادداشت، …) در اسپرینت‌های بعد است.

### endpointها (`/api/v1`)
| متد و مسیر | نقش | نکته |
|---|---|---|
| `POST /auth/login` | عمومی | قفل سه‌لایه (`pi` ۵/۱۵د، `p` ۲۰/۱س با عبور کوکی دستگاه، `ip` ۳۰/۱۵د)؛ هش ساختگی برای کاربر ناموجود، `invited` و `disabled`؛ کوکی نشست و کوکی دستگاه |
| `POST /auth/logout` | * | `204`، کوکی با `Max-Age=0`، `Clear-Site-Data: "cache"`؛ کوکی دستگاه می‌ماند |
| `GET /auth/me` | * | `MeDTO` |
| `POST /auth/change-password` | * | رمز فعلی غلط ← `422 fields.currentPassword` و قفل `pwchange:u` ۵/۱۵د؛ همه‌ی نشست‌ها باطل و نشست جاری چرخانده می‌شود |
| `GET /auth/sessions`، `DELETE /auth/sessions/:id` | * | فقط نشست‌های خود؛ نشست دیگران ← `404` |
| `POST /auth/tokens/lookup` | عمومی | C1: توکن فقط در بدنه؛ موبایل برنمی‌گردد؛ همه‌ی حالت‌های نامعتبر ← `410`؛ محدودیت `token:ip` ۳۰/۱۵د |
| `POST /auth/tokens/accept` | عمومی | موبایل کامل لازم؛ ۵ موبایل غلط ← ابطال توکن + `audit_log`؛ مصرف اتمی؛ ابطال همه‌ی نشست‌ها و نشست کوکی همان مرورگر |
| `GET /users` | A | با `inviteAcceptedAt`، `inviteAcceptedDevice`، `erasedAt` |
| `GET /mentors` | A، M | کارکنان فعال |
| `POST /invitations` | A | فقط `mentor` و `admin`؛ لینک `…/invite#t=…` یک بار، `no-store` |
| `POST /users/:id/invite-link` | A؛ M فقط هنرجوی `invited` در دامنه (C3) | مشاور برای مدیر یا مشاور `invited` ← `404` (همان بدنه‌ی شناسه‌ی ناموجود) |
| `POST /users/:id/reset-link` | A | ۲۴ ساعت؛ `…/reset#t=…` |

همه در `src/server/http/routes.manifest.ts` ثبت‌اند. هیچ مسیری `:token` ندارد.

### جدول‌ها و migration
`apps/web/drizzle/0001_identity_auth.sql` (تولید با drizzle-kit و بازبینی‌شده): `users` (نقش، وضعیت، `erased_at`، CHECKها)، `auth_tokens` (فقط SHA-256، `phone_mismatch_count`، `used_user_agent`، index جزئی)، `sessions` (فقط SHA-256)، `auth_throttle`، `audit_log` (ماژول admin)، `settings` (ماژول catalog؛ ردیف نبود = پیش‌فرض).

### ساختار کد
- `src/lib`: `phone` (نرمال‌سازی موبایل ایران، `maskPhone`؛ **در مرورگر هم قابل‌استفاده است**)، `text-fa` (ADR-0008 و SEC-X5)، `uuid` (UUIDv7).
- `src/modules/identity`: schema، contracts، policy، service، repo، `password` (SEC-P1..P5، صف ۲تایی، `503` بعد از ۵ ثانیه)، `throttle`، `tokens`، `session-policy`.
- `src/modules/access`: `staffStudentScope`، `scopeCondition`، `isStudentInScope`، `loadInScope` (رجیستری resolver)، `assertRefs`.
- `src/modules/admin` (`recordAudit`؛ کلید ممنوع مثل token/url/password را رد می‌کند) و `src/modules/catalog` (`getAccessSettings`).
- `src/server/http`: `route()` (CSRF ← نشست ← zod ← service؛ سقف ۲۵۶KB پیش از parse)، خطاهای فارسی، `getClientIp`، هدرها و CSP. `src/proxy.ts`: CSP با nonce. `next.config.ts`: هدرهای SEC-H2 و `no-referrer`/`no-store` روی `/invite` و `/reset`.
- `src/server/auth/current-user.ts`: بدنه‌ها پیاده شد، امضاها همان است. `requireUser` بی‌نشست ← `/login`؛ نقش نامجاز ← `/today` (کارکنان) یا `/home` (هنرجو).
- job `auth.cleanup` (هر روز ۳:۳۰ تهران) طبق data-model ۶-۱.
- CLI: `pnpm admin:create --phone … --name …` (نام دیگر: `admin:bootstrap`)، `pnpm admin:reset-link --phone …`، `pnpm admin:erase-user --id … --confirm "…" --requested-on YYYY-MM-DD`.

### نتیجه‌ی فرمان‌ها (اجرای واقعی، پس از آخرین تغییر)
| فرمان | نتیجه |
|---|---|
| `pnpm lint` | تمیز (۱۷۴ فایل) |
| `pnpm typecheck` | تمیز |
| `pnpm test` | ۲۶ فایل، **۳۱۳ تست سبز**: واحد ۱۷۴ (۱۴۸ تای آن این بخش) و یکپارچه ۱۳۹ روی Postgres جاسازی‌شده (۱۳۶ تای آن این بخش) |
| `pnpm build` | موفق؛ همه‌ی مسیرها dynamic |
| دود واقعی | `next start` + Postgres موقت: دعوت CLI ← lookup ← accept (ارقام فارسی) ← login ← me ← users ← invitations ← invite-link ← POST بی‌`Origin` = `403`. nonce روی همه‌ی اسکریپت‌های `/invite` بود. CLIها هم روی Postgres موقت اجرا شدند. هیچ پردازه‌ای باز نماند |

تست‌های یکپارچه: جریان کامل دعوت ← پذیرش ← ورود ← me ← خروج؛ بازنشانی رمز؛ T-AUTH (قفل دقیق، موبایل ناموجود، spy هش ساختگی، کوکی دستگاه خود/دیگری/جعلی، XFF جعلی)؛ T-TOKEN (منقضی، مصرف‌شده، ساخت دوباره، ۵ موبایل غلط، دو پذیرش هم‌زمان)؛ T-SESSION (سقف مطلق، password_changed_at، نقش از دیتابیس، لغزنده هر ۱۵ دقیقه، توکن فقط از کوکی)؛ T-MATRIX برای ۱۳ endpoint × ۶ حالت (A، M، S، بی‌نشست، غیرفعال با کوکی قدیمی، `invited` با نشست جعلی) و کامل بودن manifest؛ T-ESC؛ T-CSRF روی همه‌ی endpointهای نوشتنی؛ نبود Server Action؛ T-LOG بخشی (موبایل کامل، توکن، کوکی و `$argon2id$` در لاگ نیست)؛ CLIها، حذف حساب و نگه‌داری.

### فرض‌ها (برای بازبینی software-architect و security-reviewer)
1. **موبایل فقط ایران** (`9` + ۹ رقم). CHECK دیتابیس شماره‌ی بین‌المللی را هم می‌پذیرد تا بعداً باز شود.
2. **کوکی نشست تا سقف مطلق نشست زنده است** (هنرجو ۹۰، کارکنان ۳۰ روز)، نه تا انقضای لغزنده (SEC-S1). دلیل: RSC نمی‌تواند کوکی بنویسد و هنرجویی که فقط صفحه می‌بیند پس از ۳۰ روز بیرون می‌افتاد. انقضای لغزنده در سرور در هر درخواست اعمال می‌شود، پس کوکی کهنه بی‌اثر است.
3. **POST بدون بدنه** (logout، invite-link، reset-link) می‌تواند `Content-Type` نداشته باشد؛ بدنه‌دار فقط `application/json`. فرم بین‌سایتی همیشه `Content-Type` می‌فرستد، پس نیت SEC-C3 حفظ است.
4. **ساخت هنرجو** با `POST /students` در اسپرینت ۲ است (جدول `students` و مرحله‌ی فعلی لازم است). `identity.createInvitedUser(tx, …)` آماده است. `POST /invitations` فقط مدیر و مشاور می‌سازد (api.md).
5. **دامنه‌ی مشاور** تا ساخت `students` خالی است (deny by default): مشاور برای هیچ هنرجویی لینک دعوت نمی‌گیرد. جای اتصال با TODO مشخص است.
6. ساخت دوباره‌ی لینک دعوت توسط مشاور به `mentorsCanInviteStudents` وابسته نشد (ADR فقط برای ساخت هنرجو گفته است).
7. `reset-link` فقط برای کاربر `active` (برای `invited` و `disabled` ← `409`). `admin:reset-link` برای کاربر `invited` (لینک راه‌اندازی منقضی‌شده) لینک دعوت ۱ ساعته می‌دهد تا اولین مدیر هرگز بیرون نماند.
8. اسکریپت با نام `admin:create` (درخواست project-lead) و نام ADR (`admin:bootstrap`) هر دو هست.
9. بدون `DEVICE_COOKIE_SECRET` در غیر production یک راز تصادفی در حافظه ساخته می‌شود (با هر ری‌استارت کوکی‌های دستگاه بی‌اعتبار می‌شوند).
10. پاسخ `429` علاوه بر `retryAfterSeconds`، `code` و پیام فارسی ثابت (با دقیقه‌ی مانده) دارد؛ چیزی درباره‌ی لایه یا وجود حساب نمی‌گوید.
11. `auth.locked` در `audit_log` فقط برای لایه‌های موبایل حساب موجود ثبت می‌شود؛ قفل IP فقط لاگ می‌شود.
12. `GET /users` صفحه‌بندی ندارد (حداکثر ۱۰۰۰ ردیف) و `{ items, nextCursor: null }` برمی‌گرداند.

### سؤال‌های باز (برای software-architect)
- **SEC-T5 در برابر نگه‌داری توکن:** `auth.cleanup` توکن‌ها را ۷ روز پس از مصرف حذف می‌کند (data-model ۶-۱)، پس «دعوت پذیرفته شد: زمان، دستگاه» در `GET /users` پس از ۷ روز خالی می‌شود. اگر باید بماند، ستون روی `users` یا استثنا در cleanup لازم است.
- **بالا نیامدن با env نامعتبر (SEC-S8، SEC-J1):** `getEnv()` تنبل است؛ در production با env ناقص برنامه بالا می‌آید و هر درخواست `500` می‌دهد (در `next start` دیده شد). پیشنهاد: فراخوانی `getEnv()` در `src/instrumentation.ts` (بیرون از مرز این کار؛ تصمیم با devops-engineer).

### کارهای باقی‌مانده
- [ ] اسپرینت ۲ (students): `PrimaryMentorLookup` واقعی، resolverهای `loadInScope`، `isExistingStudent` در `assertRefs`، `students.last_activity_at`، `timeline_events(invite.accepted)`، `POST /students`، و نقش‌های M-مالک، M-سابق، S-دیگر و M-assignee در ماتریس.
- [ ] `PATCH /users/:id` و `PATCH /users/:id/role` (ابطال نشست‌ها، آخرین مدیر `409`)، `GET/PUT /settings`.
- [ ] `admin:erase-user` برای جدول‌های ماژول‌های بعدی (فهرست TODO در `identity/service.ts`) و پیش‌شرط «مشاور اصلی هنرجو نباشد».
- [ ] SEC-P3: فهرست محلی حدود ۱۰۰ هزار رمز لورفته (فعلاً حدود ۲۰۰ مورد رایج و ایرانی).
- [ ] SEC-S7 (`/auth/reauth`) پیش از دعوت دومین مدیر.
- [ ] قاعده‌ی Biome `noRestrictedImports` برای مسیرهای هنرجو، و T-LOG کامل (همراه آپلود و CSV).
- [ ] اندازه‌گیری زمان argon2 روی App Service B1 (محلی حدود ۲۵ میلی‌ثانیه؛ هدف ۵۰ تا ۲۵۰).
- [ ] مسیر `POST /api/internal/jobs/:name` برای `JOBS_MODE=http-trigger` (SEC-J1..J3).
- [ ] README ریشه: افزودن فرمان‌های `admin:*` (بیرون از مرز این کار).

---

## فرانت‌اند (frontend-engineer) — ۲۸ مهر ۱۴۰۵

**دامنه:** سیستم طراحی، قاب برنامه، صفحه‌های ورود و «حساب من». مرجع ظاهر: ماکاپ‌های تأییدشده‌ی `docs/03-ux/mockups/`.

### ساخته شد

| بخش | مسیر | توضیح |
|---|---|---|
| توکن‌ها | `apps/web/src/app/globals.css` | همه‌ی توکن‌های `mockups/styles.css` با همان نام‌ها (`--c-*`، `--h-*`، `--st-*`، `--av-*`، `--side-*`، `--brand-*`) + حالت تاریک خودکار با `prefers-color-scheme`. نگاشت به تم Tailwind 4 با `@theme inline` (مثلاً `bg-surface`، `text-fg-2`، `border-line-strong`، `bg-h-red-bg`، `shadow-ring`). پالت پیش‌فرض Tailwind حذف شد (`--color-*: initial`) تا رنگ بیرون از سیستم وارد نشود. نقطه‌های شکست: `md` = ۷۶۸، `lg` = ۱۲۰۰، `xl` = ۱۲۸۰ |
| فونت | `apps/web/src/app/layout.tsx` | Vazirmatn متغیر با `next/font/local` (محلی، preload خودکار)؛ بررسی شد که در همه‌ی صفحه‌ها واقعاً بار می‌شود |
| کامپوننت‌های پایه | `apps/web/src/components/ui/` | `Button`/`ButtonLink` (۷ نوع، ۳ اندازه، loading و disabled با `aria-disabled`)؛ `TextField`/`TextareaField`/`SelectField` با label، hint، خطا، `aria-invalid` و `aria-describedby`؛ `Card`/`CardHead`؛ `Tag`، `Count`، `TaskStatusChip`، `HealthBadge` (رنگ + شکل + متن)، `Ball`، `RuleCode`؛ `Avatar` (۸ رنگ ثابت، `hash(id) % 8`)؛ `PathBar` ۹ مرحله‌ای؛ `EmptyState`، `ErrorState`، `SkeletonRows` (پس از ۱۰ ثانیه «اتصال کند است…»)، `Alert`؛ `ToastProvider`/`useToast`؛ `Dialog` (پنجره در دسکتاپ، برگه‌ی پایین در موبایل)؛ `PageHead`؛ `ComingSoon` |
| آیکن‌ها | `apps/web/src/components/icons/` | همان ۵۷ آیکن ماکاپ‌ها، به‌صورت کامپوننت `Icon`؛ ضخامت خط بر اساس اندازه (۲٫۱ در ۲۰px، ۲٫۴ در ۱۶px، …)؛ آیکن‌های جهت‌دار در RTL آینه می‌شوند |
| قاب مربی/مشاور | `components/shell/staff-*.tsx` | سایدبار جوهری دسکتاپ (۲۵۶px؛ تبلت ۲۲۴px) با جستجو، ناوبری، گروه «مدیر» فقط برای admin، و کاربر پایین. موبایل: نوار بالا (منو، عنوان + تاریخ شمسی، جستجو)، نوار پایین با «+» وسط، برگه‌ی «افزودن سریع» (۲×۲) و برگه‌ی «منو» (مراحل، یادآورها، نتایج و تنظیمات فقط برای مدیر، حساب من، خروج) |
| قاب هنرجو | `components/shell/student-*.tsx` | دسکتاپ: نوار بالای نیمه‌شفاف ۶۴px با پنج قرص و ستون ۷۶۰px. موبایل: نوار بالا + نوار پایین پنج‌تایی |
| layoutها | `app/(staff)/layout.tsx`، `app/(staff)/(admin)/layout.tsx`، `app/(student)/layout.tsx`، `app/(account)/layout.tsx` | با `requireUser([...])` از `server/auth/current-user.ts` |
| صفحه‌های «به‌زودی» | `/today`، `/students`، `/students/new`، `/stages`، `/tasks`، `/tasks/new`، `/questions`، `/reminders`، `/results`، `/settings`، `/home`، `/my/tasks`، `/my/questions`، `/my/path`، `/my/profile` | فقط برای کار کردن ناوبری |
| G1 ورود | `/login` | موبایل (ارقام فارسی و عربی پذیرفته و به لاتین تبدیل می‌شوند، `dir="ltr"`، `inputmode="tel"`، `autocomplete="username"`) + رمز با دکمه‌ی نمایش. خطاها: ۴۰۱ پیام یکسان، ۴۲۲ کنار فیلد، ۴۲۹ و ۵۰۳ با شمارش معکوس و قفل دکمه، قطع شبکه. `?next=` فقط مسیر نسبی همین سایت |
| G2/G3 دعوت و بازنشانی | `/invite`، `/reset` | امنیت C1: توکن فقط از `#t=` خوانده و بلافاصله با `history.replaceState` از نوار آدرس پاک می‌شود؛ lookup و accept با POST و توکن در بدنه؛ موبایل خالی است و کاربر خودش وارد می‌کند؛ هشدار «با حساب دیگری وارد شده‌ای»؛ حالت «این لینک دیگر کار نمی‌کند» برای نبود توکن و ۴۱۰؛ `referrer: no-referrer` و `noindex` |
| G4 فراموشی رمز | `/forgot` | فقط راهنما: به مربی پیام بده؛ بدون فرم |
| M12/S10 حساب من | `/account` | مشخصات، تغییر رمز (حداقل ۸ برای هنرجو و ۱۲ برای کارکنان، ADR-0003)، خروج، و یک خط راهنما برای حذف حساب **بدون دکمه** (C5) |
| پیش‌نمایش توسعه | `/dev/shell?role=admin\|mentor\|student[&view=account]` | قاب‌ها با کاربر ساختگی + گالری همه‌ی کامپوننت‌ها. در production `notFound()` (بررسی شد: ۴۰۴) |

### تست‌ها
- **کامپوننت (Vitest + Testing Library، jsdom):** `components/auth/login-form.test.ts` (۹ تست) و `components/auth/accept-token-form.test.ts` (۱۰ تست): اعتبارسنجی، ارقام فارسی، `?next=` امن، ۴۰۱، ۴۲۲، ۴۲۹ (از بدنه و از `Retry-After`)، قطع شبکه، خواندن و پاک کردن توکن از fragment، ۴۱۰، عدم هم‌خوانی موبایل، هشدار حساب دیگر، متن بازنشانی.
- **e2e (Playwright، ۱۴۴۰ و ۳۷۵):** `tests/e2e/home.spec.ts`، `auth.spec.ts`، `shell.spec.ts` و کمکی `helpers.ts` که در هر صفحه RTL، `lang="fa"`، نبود سرریز افقی و بارگذاری واقعی Vazirmatn را چک می‌کند.

### نتیجه‌ی فرمان‌ها (اجرای واقعی)
| فرمان | نتیجه |
|---|---|
| `pnpm test` | ۲۶ فایل، ۲۹۰ تست سبز (شامل ۱۹ تست کامپوننت این بخش و تست‌های بک‌اند) |
| `pnpm test:e2e` | ۲۲ از ۲۲ سبز (۱۱ تست × دو اندازه) |
| `pnpm build` | موفق؛ همه‌ی مسیرها dynamic |
| `pnpm lint` | فایل‌های این بخش تمیز. خطاهای باقی‌مانده همه در فایل‌های بک‌اند در حال کار است (بیشترشان پایان خط CRLF، از جمله `apps/web/package.json`) |
| `pnpm typecheck` | فایل‌های این بخش تمیز. ۶ خطا در `src/modules/identity/throttle.test.ts` و `tests/integration/access-matrix.test.ts` (بک‌اند، در حال کار) |

بررسی در مرورگر: همه‌ی صفحه‌ها در ۱۴۴۰ و ۳۷۵، روشن و تاریک، دیده شدند (برگه‌ها، پنجره، toast و حالت خطا هم).

### یافته‌ی یکپارچه‌سازی: CSP با nonce و صفحه‌های ایستا
`src/proxy.ts` (بک‌اند) CSP با nonce برای هر درخواست می‌گذارد. Next.js nonce را فقط به صفحه‌های dynamic می‌دهد؛ در build اول `/forgot` و صفحه‌ی ۴۰۴ ایستا ساخته شدند و در production **همه‌ی اسکریپت‌هایشان مسدود شد** (دیده شد در کنسول). راه‌حل: `await connection()` در `app/layout.tsx` تا همه‌ی مسیرها per-request رندر شوند (توصیه‌ی مستند Next.js برای nonce). پس از آن هیچ خطای CSP نماند.

### فاصله از ماکاپ و دلیلش
| مورد | تصمیم | دلیل |
|---|---|---|
| زنگ اعلان در نوار بالای هنرجو | با آواتار هنرجو که به «حساب من» می‌رود جایگزین شد | صفحه‌ی اعلان در sitemap 0.1 نیست؛ زنگ بدون مقصد گمراه‌کننده است |
| مسیر `/account` | گروه مسیر تازه‌ی `(account)` که قاب را بر اساس نقش انتخاب می‌کند | M12 و S10 یک آدرس دارند و در `(staff)` یا `(student)` جا نمی‌شوند. **بیرون از فهرست پوشه‌های واگذارشده است**؛ با کسی تداخل ندارد |
| shadcn/Radix | استفاده نشد؛ `<dialog>` بومی و toast داخلی | ماکاپ‌ها ظاهر سفارشی دارند؛ `showModal()` قفل فوکوس و Esc را خودش دارد؛ JS کمتر برای اینترنت ضعیف (F10). بدون وابستگی تازه‌ی runtime |
| حالت تاریک | فقط خودکار (مطابق سیستم) | design-system §۲-۸ امکان انتخاب دستی را هم گفته؛ به بک‌لاگ |
| صفحه‌های ورود | ماکاپ نداشتند؛ کارت وسط صفحه با همان توکن‌ها ساخته شد | — |
| فونت | از `src/fonts` با `next/font/local`، نه `public/fonts` + preload دستی | همان فایل؛ next/font خودش preload و `font-display: swap` می‌گذارد |
| عدد شمارنده‌ها و میان‌بُرهای `/`، `N`، `G T` | ساختار شمارنده آماده است ولی داده ندارد؛ میان‌بُرها هنوز نه | داده و صفحه‌ی جستجو در اسپرینت‌های بعد |
| لینک صفحه‌ی حریم خصوصی در `/invite` (SEC-F4) | فقط یک خط «اطلاعاتت را فقط مربی و مشاورت می‌بینند» | صفحه‌ی حریم خصوصی هنوز نیست و محل میزبانی (E1) قطعی نشده |
| چند اندازه‌ی ریز (خط ۳px نشانگر، قرص ۱۸px، دکمه‌ی شناور ۵۲px) | به‌صورت مقدار دلخواه Tailwind با همان عدد ماکاپ | اندازه‌ی هندسی یک‌باره‌اند، نه رنگ یا فاصله‌ی سیستم |

### قرارداد با بک‌اند (فرض‌های فرانت)
- خطای ۴۲۹ و ۵۰۳: زمان انتظار از `retryAfterSeconds` (در بدنه یا داخل `error`) یا سرآیند `Retry-After` خوانده می‌شود؛ اگر هیچ‌کدام نبود ۱۵ دقیقه فرض می‌شود.
- نام فیلدهای خطای ۴۲۲: `phone`، `password` (ورود و پذیرش)، `currentPassword`، `newPassword` (تغییر رمز).
- تغییر رمز با رمز فعلی غلط: ۴۰۱ یا کد `INVALID_CREDENTIALS` ← پیام کنار «رمز فعلی».
- `/invite` و `/reset` برای هشدار «حساب دیگر» `GET /api/v1/auth/me` را صدا می‌زنند؛ ۴۰۱ طبیعی است (در کنسول مرورگر دیده می‌شود).

### کارهای باقی‌مانده
- [ ] لینک صفحه‌ی حریم خصوصی در `/invite` و `/reset` پس از ساخت آن صفحه (SEC-F4).
- [ ] تست e2e ورود و پذیرش دعوت **با بک‌اند واقعی** (فعلاً API در e2e شبیه‌سازی شده) وقتی seed و راه‌اندازی دیتابیس در Playwright آماده شد.
- [ ] میان‌بُرهای کیبورد مربی (`/`، `N`، `G T`، `?`).
- [ ] انتخاب دستی حالت تاریک/روشن (بک‌لاگ).
- [ ] شمارنده‌های ناوبری از داده‌ی واقعی (امروز، سؤال‌ها) در اسپرینت «امروز».
- [ ] جایگزینی `components/auth/phone.ts` (پیش‌بررسی سمت کلاینت) با `src/lib/phone` اگر بک‌اند نسخه‌ی قابل‌استفاده در مرورگر داد.
- [ ] بلوک LTR محتوای آپورک (`.ltr-block`)، جدول واکنش‌گرا، کانبان، تایم‌لاین و KPI همراه صفحه‌هایشان ساخته می‌شوند.

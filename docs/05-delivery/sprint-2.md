# اسپرینت ۲ — یادداشت تحویل

> فاز ۴، نسخه‌ی 0.1 «دفتر مربی». هر نقش بخش خودش را می‌نویسد.

---

## بک‌اند (backend-engineer) — ۲۹ مهر ۱۴۰۵

**دامنه:** هنرجوها، پرونده، تخصیص مشاور، پروفایل‌های پلتفرم، مسیر و مرحله‌ها، کانبان، تنظیمات مسیر و پلتفرم (PRD F2، F3، F11؛ api.md بخش ۴، ۵ و ۱۳؛ data-model.md ۲-۲ تا ۲-۴). ورود CSV به اسپرینت بعد ماند (پایین‌تر).

### endpointها (`/api/v1`)
| متد و مسیر | نقش | نکته |
|---|---|---|
| `GET /students` | A، M | دامنه در SQL. `q` (نام نرمال‌شده، موبایل `+98…`/`09…` با ارقام فارسی، آیدی پیام‌رسان، برچسب)، `stageId`، `mentorId` (uuid یا `none` = بی‌مشاور)، `tag`، `platformId` (پلتفرم اصلی **یا** پروفایل حذف‌نشده روی آن)، `lifecycle` (یک مقدار، فهرست با ویرگول، یا `all`؛ پیش‌فرض `active,paused`)، `cohort`، `sort=name\|lastActivity\|stageDays\|joined`، `limit` (حداکثر ۱۰۰)، `cursor` |
| `POST /students` | A؛ M اگر `mentorsCanInviteStudents` | در یک تراکنش: کاربر `invited` + `students` + `mentor_assignments` + `stage_transitions(initial)` + توکن دعوت + `audit_log`. `inviteUrl` یک بار و `no-store`. M: `mentorId` نادیده و برابر خودش |
| `GET /students/:id` | A، M در دامنه | `StaffStudentDTO` |
| `PATCH /students/:id` | A، M در دامنه | `ifUpdatedAt` ← `409`. `joinedAt` فقط مدیر |
| `GET /students/:id/summary` | A، M در دامنه | خلاصه‌ی کنار سؤال؛ حالت assignee با ماژول سؤال‌ها |
| `PUT /students/:id/mentor` | A | `mentorId: null` = بی‌مشاور؛ `audit_log(student.mentor_changed)`؛ مشاور قبلی فوراً `404` می‌گیرد |
| `PUT /students/:id/lifecycle` | A، M در دامنه | `paused` بدون `pausedUntil` یا با تاریخ امروز و گذشته ← `422` |
| `GET /me/student`، `PATCH /me/student` | S | `SelfStudentDTO`؛ PATCH فقط فهرست سفید data-model ۲-۳ |
| `GET/POST /students/:id/profiles` | A، M در دامنه | — |
| `GET/POST /me/profiles` | S | — |
| `PATCH /profiles/:id`، `DELETE /profiles/:id` | A، M در دامنه، S مال خود | حذف نرم ← `204`؛ پس از حذف برای همه `404` |
| `POST /profiles/:id/approve` | A، M در دامنه | `mentorApprovedAt` |
| `GET/POST /profiles/:id/snapshots` | A، M در دامنه، S مال خود | جدیدترین اول |
| `GET /stages` | * | فقط فعال‌ها؛ مدیر با `?includeInactive=1` |
| `POST /stages`، `PATCH /stages/:id` | A | `contentLinks` فقط `https://`؛ PATCH فقط `isActive: true` (فعال‌سازی دوباره) |
| `PUT /stages/order` | A | دقیقاً مجموعه‌ی کامل مرحله‌های مسیر، وگرنه `422` |
| `POST /stages/:id/deactivate` | A | هنرجوی `active` در مرحله ← `409` |
| `PUT /students/:id/stage` | A، M در دامنه | `{ toStageId, kind, note? }` ← `{ student, suggestedTemplates: [] }` |
| `GET /students/:id/stage-history` | A، M در دامنه | قدیمی‌ترین اول، با `initial` |
| `GET /board` | A، M | `mentorId?`، `tag?`؛ ستون برای هر مرحله‌ی فعال (+ مرحله‌ی غیرفعالی که هنوز هنرجو دارد) |
| `GET /me/path` | S | `passed`/`current`/`locked`، `current`، `next`، `contentLinks` |
| `GET /platforms`، `GET /tracks` | * | فقط فعال‌ها؛ مدیر با `includeInactive` |
| `POST /platforms`، `PATCH /platforms/:id` | A | نام یکتا بدون حساسیت به حروف (`422 fields.name`) |

همه در `src/server/http/routes.manifest.ts` ثبت‌اند (۳۱ ورودی تازه). همه‌ی ورودی‌ها `.strict()`.

### جدول‌ها، migration و seed
- `apps/web/drizzle/0002_students_path.sql` (تولید drizzle-kit، بازبینی‌شده، به‌اضافه‌ی `CREATE EXTENSION IF NOT EXISTS pg_trgm` در ابتدا): `tracks`، `platforms` (یکتا روی `lower(name)`)، `learning_paths` (حداکثر یک پیش‌فرض)، `stages`، `students` (همه‌ی فیلدهای data-model ۲-۳، CHECKها، indexهای `(primary_mentor_id, lifecycle_status)`، `(current_stage_id)`، GIN روی `tags` و trigram روی `search_text`)، `mentor_assignments` (یکتای جزئی ردیف فعال `primary`)، `platform_profiles` (یکتای جزئی ویترین اصلی، CHECK `https://`، **بدون هیچ فیلد رمز**)، `profile_snapshots`، `stage_transitions` (CHECK یادداشت الزامی برای `regress` و `advance_with_exception`، CHECK «فقط `initial` بی‌مبدأ»).
- seed: `src/modules/catalog/seed.ts`؛ با `pnpm db:migrate` (پس از مهاجرت) یا `pnpm db:seed`. ۳ شاخه (B، C، D)، ۸ پلتفرم (Upwork، Fiverr، Contra، LinkedIn، Freelancer، Behance/Dribbble، مشتری مستقیم، سایر)، مسیر پیش‌فرض و ۹ مرحله با `expectedDays` = ۴، ۱۰، ۱۰، ۱۴، ۵، ۴۲، خالی، خالی، خالی و «رشد» `isOpenEnded`. شناسه‌ها ثابت و درج با `ON CONFLICT DO NOTHING`: اجرای دوباره چیزی اضافه نمی‌کند و ویرایش مدیر را بازنویسی نمی‌کند (تست شد). تست‌های یکپارچه هم seed را اجرا می‌کنند.

### ساختار کد
- `modules/catalog`: schema، contracts، repo، service (tracks، platforms، stages، تنظیمات `access`)، seed.
- `modules/students`: schema، contracts، policy، repo، service، `activity.ts` (`last_activity_at` حداکثر ساعتی یک بار؛ از ورود و هر درخواست نشست هنرجو)، `erasure.ts`.
- `modules/path`: schema، contracts، policy (قواعد گذار، وضعیت مرحله)، `transitions.ts`، service (تغییر مرحله، تاریخچه، کانبان، «مسیر من»، غیرفعال‌سازی مرحله).
- `modules/timeline/events.ts`: **فقط نقطه‌ی اتصال**. `recordTimelineEvent(tx, …)` در جای درست هر تراکنش صدا زده می‌شود (`student.created`، `student.updated`، `student.lifecycle_changed`، `mentor.changed`، `stage.changed`، `profile.added/updated/removed/approved`، `invite.accepted`) ولی بدنه‌اش خالی است. اسپرینت ۳ فقط INSERT را می‌نویسد.
- `modules/access`: `staffStudentScope` حالا `students.primary_mentor_id` واقعی را می‌خواند؛ resolverهای `loadInScope` برای `student` و `profile` (پروفایل حذف‌شده = ناموجود)؛ `assertRefs` با `isExistingStudent` واقعی و دو نوع تازه: `catalog` (stage، platform، track فعال) و `profileOfStudent` (برای کارهای اسپرینت ۳).
- `server/http/schemas.ts`: `httpsUrl` (SEC-X2)، `shortText`/`longText` (ADR-0008)، `intInput`/`moneyInput` با ارقام فارسی، `tagsInput`، `dayInput`، cursor.
- `lib/tehran-day.ts`: روز تقویم تهران (برای `pausedUntil`).
- `identity`: `inviteUrlFor(token)`، فعالیت هنرجو در ورود و نشست، `invite.accepted` به timeline، و `eraseUser` برای جدول‌های تازه.
- `admin:erase-user` (ADR-0010): هنرجو ← فیلدهای متنی `students` تهی، `tags = {}`، `search_text = 'کاربر حذف‌شده'`، `dropped`؛ `platform_profiles` و `profile_snapshots` حذف کامل؛ `note` و `reason` در `stage_transitions` و `mentor_assignments` ← `'[حذف شد]'`. مدیر/مشاوری که هنوز مشاور اصلی هنرجوی حذف‌نشده است ← رد.

### نتیجه‌ی فرمان‌ها (اجرای واقعی، پس از آخرین تغییر)
| فرمان | نتیجه |
|---|---|
| `pnpm lint` | تمیز (۲۲۵ فایل) |
| `pnpm typecheck` | تمیز |
| `pnpm test` | ۳۴ فایل، **۶۰۵ تست سبز**: واحد ۲۰۱ (۲۳ فایل) و یکپارچه ۴۰۴ (۱۱ فایل) روی Postgres جاسازی‌شده |
| `pnpm build` | موفق؛ ۲۲ مسیر API تازه، همه dynamic |
| دود واقعی | Postgres موقت روی 55433 ← `db:migrate` (seed: ۳/۸/۱/۹) ← `db:seed` دوباره (۰ ردیف) ← `admin:create`/`admin:reset-link` ← `next start` روی 3100: پذیرش دعوت مدیر، `GET /stages` (۹)، `POST /students` با موبایل ارقام فارسی (۲۰۱)، همان بدون `Origin` (۴۰۳)، جستجوی پیشوند موبایل فارسی، پذیرش دعوت هنرجو، `/me/student` بدون `tags`، `POST /me/profiles`، هنرجو روی `/students` (۴۰۳)، تغییر مرحله، `/me/path`، `/board`، پرونده با ویترین اصلی و `lastActivityAt`، تاریخچه `initial,advance`. هر دو پردازه پس از دود بسته شدند |

**تست‌های تازه:**
- واحد: `students/policy.test.ts` (تصمیم‌ها، روزهای مرحله، warn/over، متن جستجو، کامل بودن)، `path/policy.test.ts` (جهت گذار، یادداشت الزامی، وضعیت مسیر)، `server/http/schemas.test.ts` (https، نرمال‌سازی، ارقام فارسی، strict بودن contractها، نبود فیلد رمز در پروفایل)، `lib/tehran-day.test.ts`، و `assertRefs` برای `catalog` و `profileOfStudent`.
- یکپارچه: `access-matrix.test.ts` (T-MATRIX برای همه‌ی ۴۴ endpoint × ۶ حالت، با probeهای واقعی؛ هنرجوی ماتریس مال مشاور ماتریس است؛ T-CSRF روی همه‌ی نوشتنی‌ها)، `students-access.test.ts` (**M-مالک، M-غیرمالک، M-سابق، S-مالک، S-دیگر**؛ `404` با بدنه‌ی یکسان برای ناموجود و خارج از دامنه؛ T-REF با `422` و هیچ ردیف ساخته‌نشده؛ T-ESC برای `primaryMentorId`/`currentStageId`/`lifecycleStatus`/`studentId`؛ قناری `CANARY-7f3a` در برچسب، کوهورت و `statusReason` که در هیچ پاسخ `/me` نیست)، `students.test.ts`، `path.test.ts`، و `isolated.test.ts` روی **دیتابیس جدا** (`mentorScope='all'` و برگشت، `mentorsCanInviteStudents=false`، ترتیب مرحله‌ها، idempotency seed، حذف حساب) تا تست‌های موازی تحت تأثیر تنظیمات سراسری نباشند.

### فرض‌ها (برای بازبینی software-architect و security-reviewer)
1. **`access` جدول‌های `students` و `platform_profiles` را مستقیم و فقط‌خواندنی می‌خواند** (مثل read-modelهای `today` و `health`). دلیل: `students → identity → access` و رفتن از `students.service` چرخه‌ی import می‌سازد. به همین دلیل `students/activity.ts`، `students/erasure.ts` و `path/transitions.ts` فایل‌های جدا با import فقط از schema هستند.
2. **repo ماژول students برای نمایش با `users`، `stages`، `tracks` و `platforms` JOIN فقط‌خواندنی دارد** (نام، موبایل، وضعیت حساب). نوشتن همیشه در ماژول صاحب جدول است.
3. **مدیر بدون `mentorId` هنرجوی بی‌مشاور می‌سازد** (data-model: «خالی = تخصیص‌نیافته»). UI می‌تواند خود مدیر را پیش‌فرض بگذارد. `PUT /students/:id/mentor` هم `mentorId: null` می‌پذیرد.
4. **جهت گذار مرحله با نوعش هم‌خوان است:** `regress` فقط به عقب؛ `advance`، `skip_by_assessment` و `advance_with_exception` فقط به جلو (پرش مجاز است). همان مرحله یا جهت نادرست ← `409 INVALID_TRANSITION`. مرحله‌ی مقصد باید فعال باشد (`422`).
5. **`daysInStage` = روزهای کامل از `stage_entered_at`** (۲۴ ساعته، نه مرز روز تهران). `overExpected`: بیش از `expectedDays` ← `warn`، بیش از ۲ برابر ← `over`؛ مرحله‌ی باز یا بی‌مدت ← `none`.
6. **کانبان** هنرجوهای `active` و `paused` را نشان می‌دهد (با `lifecycleStatus` روی کارت)؛ داخل ستون، بیشترین روز اول.
7. **«مسیر من»:** مرحله‌های پیش از فعلی `passed`، بعد از آن `locked` (ریزتر از این، مثل `passed_by_assessment`، فقط برای کارکنان در تاریخچه دیده می‌شود). مرحله‌ی غیرفعال فقط اگر مرحله‌ی فعلی هنرجو باشد نمایش داده می‌شود.
8. **`SelfStudentDTO`** علاوه بر سلامت، پرچم، برچسب و کوهورت، `level`، `statusReason`، `lifecycleStatus`، `lastActivityAt` و شناسه‌ی مشاور را هم ندارد (از مشاور فقط نام). `niche_statement` را می‌بیند ولی ویرایش نمی‌کند (فهرست سفید data-model).
9. **صفحه‌بندی `GET /students`** با cursor مبهم (offset کدگذاری‌شده) است؛ برای حداکثر ۵۰۰ هنرجو (overview ۶) کافی است. cursor جعلی ← `422`.
10. **فیلتر و مرتب‌سازی سلامت** (`health=`، `sort=health`) تا ماژول health پذیرفته نمی‌شود (`422`، کلید ناشناخته). فیلدهای `health`، `nextTask`، `openTaskCount`، `overdueTaskCount` فعلاً `null`/`0` هستند.
11. **`initialNote` در `POST /students`** تا ساخت جدول `notes` (اسپرینت ۳) در schema نیست (ارسالش ← `422`).
12. **ارز نرخ پروفایل** اگر مبلغ هست و ارز نیامده، `USD` می‌شود. مبلغ به‌صورت رشته‌ی اعشاری (`"25.00"`) برمی‌گردد.
13. **پروفایل حذف‌شده برای همه ناموجود است** (`404`)، از جمله تأیید و snapshot. ویرایش پروفایل تأییدشده، تأیید را برنمی‌دارد.
14. **`PATCH /stages/:id` غیرفعال نمی‌کند** (`isActive: false` ← `422`)؛ فقط `POST /stages/:id/deactivate` با بررسی هنرجوی فعال. هنرجوهای `paused`/`graduated`/`dropped` مانع غیرفعال‌سازی نیستند.
15. **`PUT /stages/order`** همه‌ی مرحله‌ها (فعال و غیرفعال) را می‌خواهد و `sortOrder` را ۱۰، ۲۰، … بازنویسی می‌کند.
16. **`pausedUntil`** باید بعد از امروزِ تهران باشد؛ برای وضعیت‌های دیگر نباید فرستاده شود.
17. **اجرای seed در `db:migrate`** (نه در خود `runMigrations`)، تا migrator داکر (`db:migrate`) هم seed کند و تست CLI که دیتابیس خالی می‌خواهد دست نخورد.
18. **`profile_snapshots.source_submission_id`** فعلاً FK ندارد؛ با جدول `submissions` در اسپرینت ۳ اضافه می‌شود.

### سؤال‌های باز (برای software-architect)
- **مهاجرت `pg_trgm` روی میزبان:** `CREATE EXTENSION` در migration است. روی Azure Flexible Server باید `azure.extensions = pg_trgm` از قبل تنظیم شود و کاربر migrate اجازه‌ی ساخت افزونه داشته باشد (devops-engineer). جایگزین: ساخت دستی افزونه در runbook.
- **هم‌زمانی غیرفعال‌سازی مرحله و تغییر مرحله:** دو تراکنش هم‌زمان (غیرفعال کردن مرحله X و بردن هنرجو به X) می‌توانند هر دو موفق شوند. در 0.1 با یک مدیر بعید است؛ اگر لازم است، قفل ردیف مرحله در هر دو.
- **`search_text` پس از تغییر نام کاربر:** وقتی `PATCH /users/:id` ساخته شود، باید `search_text` هنرجو را هم به‌روز کند (تابع `buildSearchText` آماده است).

### کارهای باقی‌مانده
- [ ] **ورود CSV (F11، Should) ساخته نشد.** دلیل: ستون‌های «آخرین کار و مهلت» و «یادداشت» به جدول‌های `tasks` و `notes` (اسپرینت ۳) وابسته‌اند و ورود ناقص باید بعداً دوباره اجرا شود. پیشنهاد: پس از اسپرینت ۳، `POST /imports/students` با C6 (فقط CSV، ۱ مگابایت، ۵۰۰ ردیف، `dryRun`)، papaparse، و همان `createStudent` برای هر ردیف.
- [ ] اسپرینت ۳: بدنه‌ی `recordTimelineEvent`؛ `initialNote`؛ `suggestedTemplates` در تغییر مرحله؛ `openTasks` در summary؛ `nextTask` و شمارش کارها در فهرست و پرونده؛ `tasks.profile_id ← null` در حذف حساب؛ FK `source_submission_id`؛ حالت assignee در `summary` (SEC-A8)؛ انتقال یادآورها و سؤال‌های باز در تغییر مشاور؛ یادآور سیستمی بازگشت از توقف.
- [ ] اسپرینت سلامت: `health` در فهرست، پرونده و کانبان؛ فیلتر و مرتب‌سازی سلامت؛ sweep فوری پس از تغییر `expectedDays`؛ بازمحاسبه پس از هر تغییر.
- [ ] `PATCH /users/:id` (و به‌روزرسانی `search_text`)، `GET/PUT /settings` (با آن، `mentorScope` و `mentorsCanInviteStudents` از UI قابل‌تغییر می‌شوند).
- [ ] قاعده‌ی Biome `noRestrictedImports` برای مسیرهای هنرجو (از اسپرینت ۱ مانده).
- [ ] **سرور dev روی پورت 3000 هنگام ادامه‌ی این کار (پس از قطع به‌خاطر محدودیت API) دیگر روشن نبود**؛ من آن را نبستم و دوباره روشن نکردم (Postgres روی 5432 روشن است). روی دیتابیس 5432 هیچ migration‌ای اجرا نشد: پیش از دیدن صفحه‌های اسپرینت ۲ روی آن، `pnpm db:migrate` لازم است (migration `0002` + seed).

---

## راهنمای فرانت‌اند (برای frontend-engineer)

### قاعده‌ی کلی
- صفحه‌های RSC تابع‌های service را **مستقیم** صدا می‌زنند؛ اولین پارامتر `actor` است:
  ```ts
  const user = await requireUser(['admin', 'mentor']);
  const list = await listStudents(toActor(user), { q, stageId, sort: 'name' });
  ```
  `requireUser` و `toActor` از `@/server/auth/current-user`.
- خطاها `ApiError` هستند (`@/server/http/errors`) با `code`، `status`، `message` فارسی و `fields`. در صفحه‌ی تکی: `NOT_FOUND` ← `notFound()`؛ `FORBIDDEN` نباید رخ دهد اگر layout نقش را درست محدود کرده باشد.
- **نوشتن فقط از API** (Server Action ممنوع است، SEC-A10). فرم‌های کلاینت با `fetch` و `Content-Type: application/json` (مرورگر `Origin` را خودش می‌فرستد).
- DTOها فقط type هستند و import آن‌ها در کامپوننت کلاینت مجاز است: `import type { … } from '@/modules/students/contracts'`. **schemaهای zod همین فایل‌ها** را می‌شود برای اعتبارسنجی سمت کلاینت هم استفاده کرد (react-hook-form)؛ ولی فایل service را هرگز در کلاینت import نکنید.
- همه‌ی تاریخ‌ها ISO با `Z`؛ `pausedUntil` روز `YYYY-MM-DD` تهران. نمایش شمسی با UI.
- پاسخ `422`: `error.fields.<نام فیلد>` پیام فارسی آماده‌ی نمایش کنار فیلد است؛ شناسه‌ی ارجاعی نامعتبر همیشه «مقدار نامعتبر است».
- فیلدهای `health`، `nextTask` فعلاً `null` و شمارش کارها `0` است؛ UI حالت «هنوز داده نیست» را نشان دهد.

### تابع‌های service برای صفحه‌های RSC
| صفحه | تابع (ماژول) | خروجی |
|---|---|---|
| M2 فهرست هنرجوها `/students` | `listStudents(actor, query)` (`@/modules/students/service`) | `StudentListDTO = { items: StudentListItemDTO[], nextCursor }` |
| M3 پرونده `/students/[id]` | `getStudent(actor, id)` | `StaffStudentDTO` (با `completeness`، `overExpected`، `primaryProfile`) |
| M3 ویترین‌ها | `listStudentProfiles(actor, studentId)` | `ProfileDTO[]` (اصلی اول) |
| M3 snapshotهای یک ویترین | `listProfileSnapshots(actor, profileId)` | `ProfileSnapshotDTO[]` |
| M3 تاریخچه‌ی مرحله | `getStageHistory(actor, studentId)` (`@/modules/path/service`) | `StageTransitionDTO[]` |
| پنل کنار سؤال | `getStudentSummary(actor, id)` | `StudentSummaryDTO` |
| کانبان `/stages` | `getBoard(actor, { mentorId?, tag? })` (`path`) | `BoardDTO` |
| فهرست مشاورها (فیلتر/انتخاب) | `listMentors(actor)` (`@/modules/identity/service`) | `MentorOptionDTO[]` |
| فهرست مرحله‌ها، پلتفرم‌ها، شاخه‌ها | `listStages(actor, { includeInactive? })`، `listPlatforms(…)`، `listTracks(…)` (`@/modules/catalog/service`) | `StageDTO[]`، `PlatformDTO[]`، `TrackDTO[]` |
| S خانه/«مسیر من» `/my/path` | `getOwnPath(actor)` (`path`) | `MyPathDTO` |
| S «من» `/my/profile` | `getOwnStudent(actor)`، `listOwnProfiles(actor)` | `SelfStudentDTO`، `ProfileDTO[]` |

`query` در `listStudents`: `{ q?, stageId?, mentorId?: uuid \| 'none', tag?, platformId?, lifecycle?: LifecycleStatus[], cohort?, sort?: 'name' \| 'lastActivity' \| 'stageDays' \| 'joined', limit?, cursor? }`. از URL صفحه با `listStudentsQuery.parse(searchParams)` بسازید (همان schema‌ی API؛ `lifecycle` را به‌صورت `active,paused` یا `all` می‌گیرد).

### endpointهایی که فرم‌های کلاینت صدا می‌زنند
| فرم / عمل | درخواست | بدنه | پاسخ موفق |
|---|---|---|---|
| M2a هنرجوی جدید | `POST /api/v1/students` | `{ displayName, phone, mentorId?, stageId?, trackId?, primaryPlatformId?, tags? }` | `201 StudentCreatedDTO = { student, inviteUrl, expiresAt }` — `inviteUrl` را فقط همین‌جا نشان بده (کپی + متن تلگرام). `409 PHONE_TAKEN` با `fields.phone` |
| ارسال دوباره‌ی دعوت | `POST /api/v1/users/{id}/invite-link` | — | `201 { inviteUrl, expiresAt }` (فقط اگر `accountStatus = 'invited'`) |
| ویرایش پرونده | `PATCH /api/v1/students/{id}` | هر زیرمجموعه از `updateStudentInput` + `ifUpdatedAt` (مقدار `updatedAt` پرونده) | `200 StaffStudentDTO`؛ `409` = کس دیگری زودتر ذخیره کرده |
| تغییر مشاور (فقط مدیر) | `PUT /api/v1/students/{id}/mentor` | `{ mentorId \| null, reason? }` | `200 StaffStudentDTO` |
| وضعیت (توقف، فارغ‌التحصیل، ریزش، فعال) | `PUT /api/v1/students/{id}/lifecycle` | `{ status, pausedUntil?, reason? }` | `200 StaffStudentDTO` |
| تغییر مرحله («یک کلیک» = `advance` به مرحله‌ی بعد) | `PUT /api/v1/students/{id}/stage` | `{ toStageId, kind, note? }` — `note` برای `regress` و `advance_with_exception` الزامی | `200 { student, suggestedTemplates: [] }`؛ `409 INVALID_TRANSITION` با پیام فارسی |
| افزودن ویترین (کارکنان) | `POST /api/v1/students/{id}/profiles` | `{ platformId, kind, publicUrl?, headline?, rateAmount?, rateCurrency?, rateUnit?, status?, niche?, notes?, isPrimary? }` | `201 ProfileDTO` |
| افزودن ویترین (هنرجو) | `POST /api/v1/me/profiles` | همان | `201 ProfileDTO` |
| ویرایش / حذف ویترین | `PATCH` / `DELETE /api/v1/profiles/{id}` | همان فیلدها (+ `ifUpdatedAt`) | `200 ProfileDTO` / `204` |
| تأیید ویترین | `POST /api/v1/profiles/{id}/approve` | — | `200 ProfileDTO` |
| ثبت نسخه‌ی متن ویترین | `POST /api/v1/profiles/{id}/snapshots` | `{ bodyText, headline?, rateText? }` | `201 ProfileSnapshotDTO` |
| فرم ورود هنرجو / «من» | `PATCH /api/v1/me/student` | `{ messengerHandle?, primarySkill?, skillLevel?, englishWriting?, englishSpeaking?, hoursPerWeek?, incomeGoalUsd?, goal90d?, priorExperience?, selfReportedBlocker?, primaryPlatformId? }` (+ `ifUpdatedAt`) | `200 SelfStudentDTO` |
| تنظیمات: مرحله‌ها | `POST /api/v1/stages`، `PATCH /api/v1/stages/{id}`، `PUT /api/v1/stages/order` (`{ stageIds }` کامل)، `POST /api/v1/stages/{id}/deactivate` | `{ displayCode, name, sortOrder?, expectedDays?, isOpenEnded?, studentDescription?, contentLinks?: [{title, url}], isActive? }` | `201/200 StageDTO` (order: `StageDTO[]`)؛ deactivate با هنرجوی فعال ← `409` |
| تنظیمات: پلتفرم‌ها | `POST /api/v1/platforms`، `PATCH /api/v1/platforms/{id}` | `{ name, trackId?, sortOrder?, isActive? }` | `201/200 PlatformDTO` |

**نکته‌های UI:**
- فرم ویترین: هشدار ثابت «رمز یا کد ورود هیچ حسابی را این‌جا ننویس» (PRD ۶). API هر کلید ناشناخته (از جمله `password`) را با `422` رد می‌کند. لینک فقط `https://`؛ خطای سرور: «آدرس کامل را با https بنویس.»
- کنار `notes` پروفایل برچسب «هنرجو این را می‌بیند» (SEC-F6).
- لینک‌های هنرجو (`publicUrl`) با `target="_blank" rel="noopener noreferrer"` و دامنه‌ی مقصد (SEC-X6).
- اعداد را می‌شود با ارقام فارسی فرستاد (`"۱۲"`)؛ سرور تبدیل می‌کند.
- `completeness.missing` نام فیلدهای خالی است (`mentor`، `track`، `primaryPlatform`، `level`، `primarySkill`، `nicheStatement`، `messengerHandle`، `englishWriting`، `hoursPerWeek`، `incomeGoalUsd`، `goal90d`، `primaryProfile`) برای نشانگر «پرونده N٪ کامل».
- شناسه‌های seed (برای storybook یا داده‌ی نمونه) در `SEED_IDS` از `@/modules/catalog/seed` هستند؛ در کد محصول به نام یا شناسه‌ی مرحله وابسته نشوید (قاعده‌ی ۷ tech-stack).

---

## فرانت‌اند (frontend-engineer) — ۲۸ مهر ۱۴۰۵

**دامنه:** صفحه‌های هنرجوها، پرونده، کانبان مراحل، تنظیمات مسیر و پلتفرم (مدیر)، و سمت هنرجو (مسیر و پروفایل‌ها). مرجع ظاهر: `mockups/students.html`، `student-profile.html`، `kanban.html`، `student-home.html` و `states.html`. همه‌ی داده‌ها واقعی‌اند: صفحه‌ها از توابع service (RSC) می‌خوانند و فرم‌ها از API می‌نویسند. Server Action به کار نرفته است (SEC-A10).

### صفحه‌ها
| صفحه | مسیر | نکته |
|---|---|---|
| M2 هنرجوها | `(staff)/students/page.tsx` | جستجو (با تأخیر ۴۰۰ms)؛ فیلتر مرحله، مشاور (فقط مدیر، با «بدون مشاور»)، پلتفرم و برچسب (از برچسب‌های موجود)؛ چیپ‌های وضعیت با شمارنده (در جریان، فعال، متوقف، فارغ‌التحصیل، ریزش)؛ مرتب‌سازی؛ صفحه‌بندی با cursor. همه‌ی فیلترها در URL هستند و بدون JS هم با GET کار می‌کنند. جدول در دسکتاپ و کارت (`data-label`) در موبایل، با برگه‌ی «فیلتر» در موبایل. «ورود از اکسل» غیرفعال است و برچسب «به‌زودی» دارد |
| M2a هنرجوی جدید | پنجره روی `/students`؛ `/students/new` ← `/students?new=1` | فیلدها: نام، موبایل (با ارقام فارسی)، مشاور (فقط مدیر؛ پیش‌فرض «خودم»). جزئیات اختیاری: مرحله، پلتفرم اصلی، لینک ویترین (با `POST /students/:id/profiles` ثبت می‌شود) و برچسب‌ها. خروجی: لینک دعوت (`#t=`، C1) با «کپی» و متن آماده‌ی تلگرام. خطاها: ۴۰۹ زیر موبایل، ۴۲۲ کنار فیلد، ۴۰۳ به‌صورت پیام |
| M3 پرونده | `(staff)/students/[id]/page.tsx` | سربرگ: نام، «هنوز وارد نشده»، مشاور، سطح، آخرین فعالیت، برچسب‌ها و نیچ. نشانگر «پرونده N٪ کامل» زیر ۸۰٪. سه کاشی: ویترین اصلی، آخرین کار، و جای هنرجو در مسیر (با رنگ گذر از مدت معمول). ویترین‌ها: افزودن، ویرایش، حذف و تأیید. اطلاعات: ویرایش با `PATCH` + `ifUpdatedAt`. تغییر مرحله. منوی «بیشتر»: تغییر مشاور (مدیر) و لینک دعوت تازه تا وقتی هنرجو وارد نشده. تایم‌لاین فعلاً تاریخچه‌ی مرحله‌هاست؛ کارها، سؤال‌ها و نقاط عطف «به‌زودی». روی موبایل نوار اقدام ثابت دارد. پرونده‌ی ناموجود و خارج از دامنه هر دو یک صفحه‌ی «پیدا نشد» می‌گیرند |
| M4 کانبان | `(staff)/stages/page.tsx` | ستون‌های ۲۷۲px با اسکرول داخلی. موبایل: ستون ۸۵٪ با snap اجباری و ردیف چیپ مرحله (چیپ ستونِ در دید فعال است). هر ستون: شمارنده و «معمول: …». هر کارت: روزها، خط زرد یا قرمز با متن «بیش از معمول» / «۲ برابر معمول»، و دکمه‌ی «انتقال» (روی لمسی همیشه پیدا). بعد از ۵ کارت «+ N نفر دیگر». فیلتر مشاور (مدیر) و سوییچ «فهرست / مراحل» |
| تغییر مرحله | `components/stages/change-stage-dialog.tsx` | مرحله‌ی بعد از پیش انتخاب شده است؛ مرحله‌ی قبل و «مرحله‌ی دیگر…» هم هست. نوع گذار: برگشت = `regress`، بعدی = `advance`، پرش = `skip_by_assessment`. یادداشت برای برگشت و پرش لازم است (user-flows §۳). پس از ثبت، پیام موقت «X به مرحله‌ی N رفت» |
| M11 تنظیمات (مدیر) | `(staff)/(admin)/settings/page.tsx` | مراحل: افزودن؛ ویرایش (برچسب، نام، مدت معمول، باز بودن، متن برای هنرجو، لینک‌های محتوا فقط https)؛ ترتیب با دکمه‌ی بالا و پایین (`PUT /stages/order`)؛ غیرفعال و فعال کردن (با پیام ۴۰۹). پلتفرم‌ها: افزودن و ویرایش (نام، شاخه، ترتیب، فعال). بخش‌های دیگر فهرست «به‌زودی» |
| S1 خانه | `(student)/home/page.tsx` | سلام، تاریخ شمسی و مرحله. کارت «مسیر من»: stepper، خروجی این مرحله، مرحله‌ی بعد و لینک‌های محتوا. کارها و سؤال‌ها «به‌زودی». سلامت و فیلدهای داخلی دیده نمی‌شوند |
| S6 مسیر من | `(student)/my/path/page.tsx` | همان stepper به‌اضافه‌ی همه‌ی مراحل با توضیح و لینک |
| S7 من | `(student)/my/profile/page.tsx` | پروفایل‌های خود هنرجو (`/api/v1/me/profiles`: افزودن، ویرایش، حذف) و «اطلاعات من» (فقط خواندنی) |

حالت‌ها: هر مسیر `loading.tsx` (اسکلت) و `error.tsx` (با `retry` در Next 16) دارد. حالت خالی برای این‌ها ساخته شد: فهرست (بدون هنرجو، یا فیلتر بدون نتیجه)، کانبان، ستون خالی و ویترین‌ها.

### کامپوننت‌های تازه
- `components/ui/`:
  - `platform.tsx`: نشان پلتفرم.
  - `ltr.tsx`: `LtrBlock` و `ExternalLink` (دامنه‌ی مقصد پیداست، با `noopener noreferrer`؛ SEC-X6).
  - `seg.tsx`: سوییچ نما و چیپ فیلتر به‌صورت لینک.
  - `DialogActions` در `dialog.tsx`.
  - `PathBar`: حالا `total` می‌گیرد، چون تعداد مرحله‌ها از تنظیمات می‌آید.
- `components/api/client.ts`: `apiPut`، `apiPatch` و `apiDelete`.
- `components/format/fa.ts`: `faDate`، `faRelativeDay`، `faDays` و `tehranDaysBetween`.
- دامنه‌ای: `components/students/*`، `profiles/*`، `stages/*`، `settings/*`، `student/path-card.tsx` و `forms/form-utils.tsx`.

فرم‌ها به همان روش اسپرینت ۱ نوشته شدند (state کنترل‌شده، بدون وابستگی تازه). schemaهای zod بک‌اند در کلاینت import نشدند و فقط `import type` به کار رفت، چون `contracts.ts` جدول‌های drizzle را هم import می‌کند.

**قاعده‌ی ۸:** فرم ویترین هیچ فیلد رمزی ندارد و هشدار ثابت «رمز یا کد ورود هیچ حسابی را این‌جا ننویس» را نشان می‌دهد. در فرم کارکنان، کنار یادداشت ویترین نوشته شده «هنرجو این را می‌بیند» (SEC-F6). هر دو در تست کامپوننت و e2e بررسی می‌شوند.

### تست‌ها
- **کامپوننت:**
  - `components/students/new-student-form.test.ts` (۱۰ تست): اعتبارسنجی، ارقام فارسی، مشاور پیش‌فرض و «بدون مشاور»، فرم مشاور بدون فیلد مشاور، جزئیات و ثبت ویترین اصلی، https، خطاهای ۴۰۹، ۴۲۲ و ۴۰۳، شکست ثبت ویترین پس از ساخت، و لینک دعوت با کپی.
  - `components/profiles/profile-form.test.ts` (۸ تست): نبود فیلد رمز و هشدار، برچسب SEC-F6، https، ساخت با فیلدهای پرشده و نرمال‌سازی، ۴۲۲، `PATCH` فقط با تغییرها + `ifUpdatedAt`، بستن بدون درخواست وقتی چیزی عوض نشده، و ۴۰۹/۴۰۴.
- **e2e با بک‌اند واقعی:** `tests/e2e/students-flow.spec.ts` در ۱۴۴۰ و ۳۷۵. جریان: ورود مدیر ← ساخت هنرجو (موبایل با ارقام فارسی) ← لینک دعوت فقط با `#t=` ← پرونده (بدون نشان سلامت) ← افزودن ویترین (رد http، بدون فیلد رمز) ← تغییر مرحله با یادداشت ← دیدن در کانبان ← سوییچ به فهرست و جستجو ← پذیرش دعوت در مرورگری دیگر ← خانه‌ی هنرجو (مرحله‌ی فعلی) ← صفحه‌ی «من» (ویترین). در هر قدم RTL، فونت و نبود سرریز افقی بررسی می‌شود. یک تست تنظیمات هم اضافه شد.
- **زیرساخت e2e:**
  - `tests/e2e/server/start.ts`: Postgres موقت (embedded، روی پورت آزاد) می‌سازد، migrate و seed می‌کند، مدیر آزمون را با serviceهای واقعی می‌سازد و فعال می‌کند، و `next dev` را روی 3100 بالا می‌آورد.
  - `tests/e2e/global-teardown.ts`: Postgres را می‌بندد، حتی اگر ویندوز درخت پردازه‌ها را kill کرده باشد.
  - **`playwright.config.ts` بیرون از مرز واگذارشده است ولی تغییر کرد:** `webServer.command` و `globalTeardown`. به Postgres روی 5432 دست زده نشد.

### نتیجه‌ی فرمان‌ها (اجرای واقعی، پس از آخرین تغییر)
| فرمان | نتیجه |
|---|---|
| `pnpm lint` | فایل‌های فرانت‌اند و e2e تمیز. ۳۰ خطای باقی‌مانده همه در فایل‌های اسپرینت ۳ بک‌اند است که هنوز در حال ساخت است (`src/lib/business-hours*`، `src/lib/csv.test.ts`، `src/modules/{catalog,files,identity,reminders,students,tasks,timeline}/*`، `tests/integration/*`)؛ بیشترشان قالب‌بندی و ترتیب import |
| `pnpm typecheck` | تمیز |
| `pnpm test` | ۴۸ فایل؛ ۹۵۵ از ۹۵۶ سبز (۳۷ تست کامپوننت همه سبز). تنها شکست مال بک‌اند است: `tests/integration/path.test.ts:43` هنوز `suggestedTemplates` خالی انتظار دارد، ولی `src/modules/path/service.ts` در اسپرینت ۳ حالا قالب‌ها را برمی‌گرداند |
| `pnpm build` | موفق؛ همه‌ی مسیرها dynamic |
| `pnpm test:e2e` | ۲۶ از ۲۶ سبز (۱۳ تست × دو اندازه) |

**بررسی در مرورگر** (Chromium، ۱۴۴۰ و ۳۷۵، با داده‌ی واقعی): هنرجوها، پرونده، کانبان، تنظیمات، خانه، مسیر من، من، و پنجره‌های هنرجوی جدید، تغییر مرحله و ویترین. سرریز افقی در همه صفر بود. یک باگ پیدا و رفع شد: spanهای `sr-only` داخل کانبان absolute بودند و containing blockشان بیرون از ناحیه‌ی اسکرول بود، و صفحه را ۱۳۷۱px عریض‌تر می‌کردند؛ با `relative` روی بورد و ستون‌ها رفع شد. هیچ پردازه‌ای باز نماند.

### فاصله از ماکاپ و دلیلش
| مورد | تصمیم | دلیل |
|---|---|---|
| نشان سلامت، دلیل، «توپ»، کد قاعده، و فیلتر و مرتب‌سازی «نیاز به رسیدگی» | نشان داده نمی‌شوند | `health` تا اسپرینت سلامت `null` است و طبق دستور هیچ نشانی جایش نمی‌آید. ستون «وضعیت» چرخه‌ی عمر را نشان می‌دهد (فعال، متوقف، …) |
| چیپ‌های وضعیت | چرخه‌ی عمر به‌جای سلامت | همان دلیل |
| نوار ۴px سربرگ ستون کانبان | توزیع «زمان در مرحله» (سبز/زرد/قرمز) به‌جای سلامت | داده‌ی سلامت هنوز نیست؛ نوار تزئینی است و `aria-hidden` دارد |
| کار بعدی، آخرین کار، شمار کارها | «هنوز داده نیست» | اسپرینت ۳ |
| یادداشت، کار و یادآور در سربرگ؛ composer تایم‌لاین؛ خاموش کردن هشدار، توقف، پرچم | نیستند (حتی به‌صورت دکمه‌ی غیرفعال) | اسپرینت ۳ و ۴. تایم‌لاین فعلاً تاریخچه‌ی مرحله‌هاست |
| «+» در نوار بالای موبایل صفحه‌ی هنرجوها | به‌جایش دکمه‌ی «هنرجوی جدید» در سربرگ صفحه | نوار بالا بین همه‌ی صفحه‌های قاب مشترک است |
| «یادداشت آزاد» در فرم هنرجوی جدید | حذف شد | `initialNote` تا اسپرینت ۳ با ۴۲۲ رد می‌شود |
| «این شماره قبلاً ثبت شده» + لینک به پرونده‌ی موجود | فقط پیام | پاسخ ۴۰۹ شناسه‌ی پرونده را برنمی‌گرداند |
| کارهای پیش‌فرض و «کارهای باز مرحله‌ی قبل» در پنجره‌ی مرحله | نیست | `suggestedTemplates` و کارها مال اسپرینت ۳ است |
| «برگرداندن» در پیام تغییر مرحله | نیست | برگشت به مرحله‌ی قبل یعنی `regress` با یادداشت اجباری |
| «هنوز وارد نشده» روی کارت کانبان | نیست | `BoardStudentDTO` وضعیت حساب ندارد |
| drag در کانبان | نیست | در 0.1 اجباری نبود؛ «انتقال به…» هست |
| ماسک موبایل در اطلاعات پرونده | شماره‌ی کامل به شکل محلی | DTO کارکنان شماره‌ی کامل می‌دهد و مربی برای تماس لازمش دارد |

### کمبودهای فرانت‌اند (برای backend-engineer؛ فعلاً با توابع موجود دور زده شد)
1. **`StudentListDTO` شمارش کل ندارد.** شمارنده‌های چیپ وضعیت و فهرست برچسب‌ها با ورق زدن `listStudents(lifecycle=all, limit=100)` ساخته می‌شوند (حداکثر ۱۰ صفحه؛ `app/(staff)/_data.ts`). پیشنهاد: فیلد `counts: { byLifecycle, total }` و endpoint `GET /students/tags`.
2. **`StudentListItemDTO` فیلد `overExpected` ندارد** (DTOهای پرونده و کانبان دارند). صفحه آن را با `overExpected` از `students/policy` و `listStages` حساب می‌کند. پیشنهاد: اضافه شدن به DTO فهرست.
3. **`BoardStudentDTO` فیلد `accountStatus` ندارد** (برای «هنوز وارد نشده» روی کارت لازم است).
4. **`StageRef` جایگاه مرحله را ندارد.** ایندکس نوار مسیر از `listStages` گرفته می‌شود. اگر مرحله‌ی فعلی هنرجو غیرفعال باشد، مشاور (که `includeInactive` ندارد) جایگاه ۰ می‌بیند و جهت گذار در پنجره ممکن است `advance` حدس زده شود.
5. **مشاور نمی‌داند `mentorsCanInviteStudents` روشن است یا نه** (تا وقتی `GET /settings` ساخته شود). دکمه همیشه نشان داده می‌شود و ۴۰۳ با پیام روشن جواب داده می‌شود.
6. **پاسخ ۴۰۹ `PHONE_TAKEN` راهی به «رفتن به پرونده‌ی موجود» ندارد** (user-flows §۱). اگر لازم است، فقط برای مدیر و فقط در دامنه‌اش.

### کارهای باقی‌مانده
- [x] اسپرینت ۳: کارها، یادداشت و تایم‌لاین کامل، composer، `initialNote`، کارهای پیشنهادی در پنجره‌ی مرحله، و «کار بعدی» در فهرست و سربرگ (sprint-3.md، بخش فرانت‌اند).
- [ ] اسپرینت سلامت: نشان، دلیل، «توپ»، فیلتر و مرتب‌سازی سلامت، نوار سلامت ستون کانبان، خاموش کردن هشدار، و توقف موقت با تاریخ شمسی (انتخاب‌گر تاریخ شمسی لازم است).
- [ ] ویرایش اطلاعات خود هنرجو در `/my/profile` (`PATCH /me/student`) و کارت خوش‌آمد اولین ورود.
- [x] ورود از CSV (M2b)، پس از ساخت endpoint بک‌اند (sprint-3.md).
- [ ] drag در کانبان (میان‌بُر، Should) و میان‌بُرهای کیبورد (`/` و `N`).
- [ ] e2e برای مشاور (دامنه‌ی محدود، نبود فیلتر مشاور)، پس از ساخت دعوت مشاور از UI.
- [ ] بازبینی تغییر `playwright.config.ts` توسط devops-engineer برای CI (در CI هم Postgres موقت ساخته می‌شود، مگر `TEST_DATABASE_URL` تنظیم شده باشد).

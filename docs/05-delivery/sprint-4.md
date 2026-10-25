# اسپرینت ۴ — یادداشت تحویل

> فاز ۴، نسخه‌ی 0.1 «دفتر مربی». هر نقش بخش خودش را می‌نویسد.

---

## بک‌اند (backend-engineer) — ۲۹ مهر ۱۴۰۵

**دامنه:** وضعیت سلامت و پرچم (F7، ADR-0005)، سؤال و پاسخ (F8)، check-in هفتگی (Should، تصمیم E5 = روشن)، نقاط عطف و North Star (F9)، «امروز» کامل، تنظیمات (F11)، کمبودهای فرانت‌اند اسپرینت ۲، تاریخ شمسی در ورود CSV، حذف حساب برای جدول‌های تازه، endpoint داخلی jobs. مرجع: `data-model.md` ۲-۲، ۲-۸ تا ۲-۱۱، ۴ و ۶-۲؛ `api.md` بخش ۸ تا ۱۳ و ۱۵.

### endpointها (`/api/v1`) — ۳۸ ورودی تازه در `routes.manifest.ts`
| متد و مسیر | نقش | نکته |
|---|---|---|
| `GET /students/:id/health` | A، M در دامنه | `HealthDetailDTO`؛ اگر هنوز محاسبه نشده، همان‌جا محاسبه می‌شود |
| `PUT`، `DELETE /students/:id/health/snooze` | A، M در دامنه | `{ until: 'YYYY-MM-DD', reason }` ← تا پایان آن روز تهران، حداکثر یک سال؛ امروز به قبل ← `422`؛ رویداد `health.snoozed` |
| `GET`، `POST /students/:id/flags` | A، M در دامنه | `active=1`؛ `expiresAt` روز یا لحظه، گذشته ← `422`؛ بازمحاسبه‌ی سلامت |
| `POST /flags/:id/clear` | A، M در دامنه | تکراری بی‌اثر (`200`) |
| `GET /stuck` | A، M | `level`، `includeSnoozed`، `mentorId` (فقط A)؛ `StudentListItemDTO[]`، قرمز ← زرد، سپس قدیمی‌ترین وضعیت؛ فقط `active` |
| `POST /admin/health/recompute` | A | `{ studentId? }`؛ بدون آن sweep کامل؛ `audit_log` |
| `GET /questions` | A، M | دامنه **یا** assignee خودم (فقط باز/پاسخ‌داده)؛ `status`، `awaiting`، `assigneeId` (A)، `studentId`، cursor؛ اول «منتظر تیم» با قدیمی‌ترین SLA |
| `GET`، `POST /me/questions` | S | `{ subject, body, links?, attachmentIds?, taskId?, priority? }`؛ assignee = مشاور اصلی فعال، وگرنه اولین مدیر فعال |
| `GET /questions/:id` | A، M (دامنه یا assignee تا وقتی باز است)، S مال خود | `switch` روی نقش (SEC-A5)؛ کارکنان `studentSummary` هم دارند |
| `POST /questions/:id/messages` | همان | `cannedResponseId` فقط کارکنان (هنرجو ← `422`)؛ کارکنان روی رشته‌ی بسته ← `409`؛ پیام هنرجو رشته‌ی بسته را باز می‌کند |
| `POST /questions/:id/close` | همان | — |
| `PUT /questions/:id/assignee` | A | فقط کارمند فعال (C3)؛ `audit_log(question.assignee_changed)` |
| `GET /canned-responses`؛ `POST`، `PATCH /canned-responses/:id` | خواندن A، M؛ نوشتن A | seed: «خطوط قرمز» |
| `GET /me/checkins/current`، `POST /me/checkins` | S | دومی در همان هفته ← `409`؛ `needsHelp` ← سؤال با `source=checkin` در همان تراکنش |
| `GET /students/:id/checkins` | A، M در دامنه | cursor؛ با check-in خاموش همه‌ی مسیرهای check-in ← `404` |
| `GET /milestone-types`؛ `POST`، `PATCH /milestone-types/:id` | خواندن همه؛ نوشتن A | — |
| `GET`، `POST /students/:id/milestones` | A، M در دامنه | ثبت کارکنان مستقیم `approved` |
| `GET`، `POST /me/milestones` | S | پیشنهاد (`proposed`)؛ `status` در بدنه ← `422` (T-ESC)؛ نوع `requiresEvidence` بی‌متن و بی‌تصویر ← `422`؛ ردشده‌ها در GET نیستند |
| `POST /milestones/:id/approve`، `/reject` | A، M در دامنه | فقط از `proposed`؛ تأیید دوم نوع `uniquePerStudent` ← `409` (قفل ردیف `students`) |
| `GET /dashboard/north-star` | A | `from`/`to`؛ پیش‌فرض ماه شمسی جاری |
| `GET /exports/milestones.csv` | A | بدون متن مدرک؛ `audit_log(export.milestones)` |
| `GET`، `PUT /settings`؛ `PUT /settings/:key` | A | همه‌ی کلیدها با `value`، `version` (۰ = پیش‌فرض)؛ PUT هر زیرمجموعه در یک تراکنش؛ کلید ناشناخته ← `404`؛ `health.rules` و `checkin` ← sweep فوری |
| `GET /settings/public` | * | `questions.expectedResponseText`، `checkin` |
| `GET /settings/staff` | A، M | به‌علاوه‌ی `access` و آستانه‌های SLA (کمبود ۵) |
| `GET /students/tags` | A، M | برچسب‌های دامنه با تعداد (کمبود ۱) |

بیرون از `/api/v1`: `POST /api/internal/jobs/:name` (ADR-0007، SEC-J1..J3): جز `JOBS_MODE=http-trigger` همیشه `404`؛ `X-Job-Secret` ثابت‌زمان روی SHA-256، غلط ← `404` و لاگ هشدار؛ فقط نام‌های ثبت‌شده (`health.sweep`، `auth.cleanup`، `files.cleanup`)؛ بدنه نادیده؛ ۶۰ بار در ساعت. secret کوتاه‌تر از ۳۲ از قبل برنامه را بالا نمی‌آورد (`env.ts` + `instrumentation.ts`).

### تغییر در endpointهای موجود (فقط افزودن فیلد)
- `StudentListItemDTO`: `health` واقعی، `overExpected`، `stage.sortOrder` و `stage.isActive`. `StudentListDTO.counts` (`total`، `byLifecycle`، `byHealth`). `GET /students` حالا `health=` (یک یا چند با ویرگول) و `sort=health` را می‌پذیرد.
- `StaffStudentDTO`: `health` واقعی، `stage.sortOrder`، `stage.isActive`.
- `BoardStudentDTO`: `health` و `accountStatus`؛ `GET /board?health=`.
- `HealthSummaryDTO` = `{ status, reasons[{rule, level, ball, facts}], churnRisk, snoozedUntil, ball, statusSince, computedAt }` (فیلدهای قبلی همان‌اند).
- `TodayDTO`: `unansweredQuestions` (نوع `StaffQuestionListItemDTO`)، `stuckStudents`، و `waitingOnUs` با `question` و `red_no_action` (+ `escalated?`). شکل قبلی دست نخورد.
- `409 PHONE_TAKEN` برای مدیر: `error.data.existingStudentId` (کمبود ۶). `ApiErrorBody.error.data?` اختیاری است.
- `GET /students/:id/summary`: assignee خارج از دامنه تا وقتی رشته‌ی باز/پاسخ‌داده دارد (SEC-A8).
- `GET /attachments/:id`: پیوست پیام سؤال و نقطه‌ی عطف؛ assignee خارج از دامنه فقط تا وقتی رشته باز است.
- `PATCH /me/student` از اسپرینت ۲ موجود بود؛ تست تازه دارد.

### جدول‌ها و migration
`apps/web/drizzle/0004_health_questions_checkins_milestones.sql` (drizzle-kit، بازبینی‌شده): `milestone_types`، `canned_responses`، `question_threads` (CHECK «بسته ⇔ `closed_at`»، index جزئی `awaiting='team'`)، `question_messages`، `checkins` (یکتای `(student_id, week_start)`)، `milestones` (CHECK دلیل رد)، `student_flags`، `student_health` (CHECK «قرمز ⇔ `red_since`»)، و FK `attachments.question_message_id`/`milestone_id`. seed: ۵ نوع نقطه‌ی عطف، «خطوط قرمز»، `settings.checkin = { enabled: true, weekday: 'thu' }`.

### ساختار کد
- `lib/jalali.ts`: تبدیل شمسی ↔ میلادی (جدول breaks، تست با Intl برای ۷۳۰ روز)، `parseAnyCalendarDay`، `jalaliMonthRange`.
- `modules/health`: `rules.ts` (**تابع خالص** `evaluateHealth` + `overallBall`، `missedCheckinWeeks`، `lowMoodStreak`)، `input-repo.ts` (۶ پرس‌وجوی تجمیعی، بی N+1)، `recompute.ts` (`recomputeHealthSafe` پس از commit با `pg_advisory_xact_lock`، `sweepAllHealth`)، `summary.ts`، `service.ts`.
- بازمحاسبه پس از commit در: ساخت هنرجو، تغییر وضعیت و مرحله، ساخت/تمدید/لغو/شروع/تحویل/بازبینی کار، پرچم، check-in، پیام هنرجو، پیشنهاد نقطه‌ی عطف، و ورود/فعالیت هنرجو (ساعتی یک بار). تغییر `expectedDays`/`isOpenEnded` مرحله و `health.rules`/`checkin` ← sweep فوری.
- job `health.sweep` (`5 * * * *` تهران) در `server/jobs`؛ بازگشت خودکار توقف تمام‌شده در `students/lifecycle-auto.ts`.
- `modules/questions` (+ `transfer.ts` و `erasure.ts` بی‌چرخه)، `modules/checkins`، `modules/milestones` (+ `policy.ts`)؛ catalog: تنظیمات، انواع نقطه‌ی عطف، پاسخ‌های استاندارد؛ files: `linkAttachmentsToQuestionMessage/Milestone`، `attachmentsByParent`.
- `access`: resolverهای `question`، `milestone`، `checkin`، `flag`؛ ref `taskOfStudent`، و `milestoneType`/`cannedResponse` در catalog ref.
- تغییر مشاور: سؤال‌های باز مشاور قبلی هم منتقل می‌شوند. `admin:erase-user`: سؤال‌ها (موضوع و همه‌ی پیام‌ها ← `[حذف شد]`، باز ← بسته)، متن check-in، مدرک و مبلغ نقطه‌ی عطف، حذف پرچم‌ها، سلامت `untracked`، پیوست‌ها؛ کارمندی که assignee سؤال باز است ← رد.
- ورود CSV: مهلت شمسی (`1405/08/01`، ارقام فارسی) یا میلادی.

### نتیجه‌ی فرمان‌ها (اجرای واقعی، پس از آخرین تغییر)
| فرمان | نتیجه |
|---|---|
| `pnpm lint` | تمیز (۴۴۹ فایل) |
| `pnpm typecheck` | تمیز |
| `pnpm test` | ۶۲ فایل، **۱۴۰۵ تست سبز** (یکپارچه ۹۹۰ در ۲۳ فایل؛ بقیه واحد و کامپوننت) |
| `pnpm build` | موفق؛ ۹۳ مسیر API، همه dynamic |

**تست‌های تازه:** واحد — `health/rules.test.ts` (۶۶ تست جدول‌محور: هر قاعده در مرزهای زرد/قرمز، `redCountMinDays`، مرحله‌ی باز، `submitted` در R-OVERDUE و R-NOTASK، check-in خاموش/روشن، هفته‌های پیش از عضویت یا بازگشت از توقف، خطر ریزش، ترتیب دلیل‌ها، آستانه‌های تنظیمات، توپ)، `sprint4-helpers.test.ts` (شمارنده‌ها، میانه، secret، schemaهای تنظیمات، `toHealthSummary`)، `lib/jalali.test.ts`. یکپارچه — `health.test.ts`، `questions.test.ts` (**M-assignee** با رشته‌ی باز و پس از بستن: رشته، خلاصه و پیوست فقط تا بسته شدن؛ بقیه‌ی پرونده `404`؛ T-REF `taskId`/`attachmentIds`؛ DTO سخت‌گیر هنرجو)، `checkins-milestones.test.ts`، `settings.test.ts` (دیتابیس جدا)، `erasure-sprint4.test.ts`، `students-sprint4.test.ts`؛ **canary سلامت و پرچم و snooze** روی همه‌ی GETهای هنرجو (و نبود کلید `health`/`flags`/`churnRisk`)؛ canary یادداشت داخلی در نماهای سؤال هنرجو؛ T-MATRIX و T-CSRF برای همه‌ی ۳۸ endpoint تازه.

### فرض‌ها (برای بازبینی software-architect و security-reviewer)
1. **R-OVERDUE** کار `submitted` را معوق نمی‌شمرد (توپ با بازبین است)؛ R-NOTASK آن را باز می‌شمرد (همان ADR-0005).
2. **R-CHECKIN** فقط هفته‌هایی را می‌شمرد که پنجره‌ی فرمشان پس از شروع دوره‌ی فعال (عضویت یا آخرین بازگشت به `active`) باز شده؛ حداکثر ۱۲ هفته. **R-MOOD**: آخرین check-in این هفته یا هفته‌ی قبل ≤ `maxMood` ← زرد؛ `redConsecutiveWeeks` هفته‌ی پیاپی ← قرمز.
3. اولین محاسبه‌ی هر هنرجو رویداد `health.changed` ثبت نمی‌کند؛ پس از آن فقط تغییر وضعیت یا مجموعه‌ی (قاعده، سطح).
4. **check-in** هر روز هفته پذیرفته و به هفته‌ی جاری نسبت داده می‌شود؛ `open` فقط برای یادآوری UI است.
5. **assignee سؤال بدون مشاور اصلی فعال** = قدیمی‌ترین مدیر فعال؛ اگر هیچ مدیری نیست ← `409`.
6. «قرمز بدون اقدام»: هر یادداشت حذف‌نشده‌ی کارکنان پس از `red_since` اقدام حساب می‌شود؛ پس از `redEscalateDays` مورد `escalated` است و مدیرِ با فیلتر مشاور دیگر هم آن را می‌بیند.
7. ویرایش پیام سؤال (۱۵ دقیقه، data-model ۲-۸) endpoint ندارد (api.md هم ندارد)؛ ستون `edited_at` آماده است.
8. North Star: «میانه‌ی روز تا اولین» = روز تهران `occurred_on` منهای روز تهران `joined_at`، روی اولین نقطه‌ی عطف North Star تأییدشده‌ی هر هنرجو.
9. `dropped`/`graduated` در sweep ساعتی بازمحاسبه نمی‌شوند؛ با تغییر وضعیت `untracked` ذخیره می‌شود.
10. متن پیش‌فرض «معمولاً تا ۲۴ ساعت» با ذخیره از تنظیمات نرمال‌سازی (ADR-0008) و تنوین آن حذف می‌شود.

### سؤال‌های باز (برای software-architect)
- **`/healthz` و `lastHealthSweepAt`** (ADR-0007): تابع `getLastHealthSweepAt()` در `modules/health/recompute.ts` آماده است ولی `src/app/healthz/route.ts` بیرون از مرز این کار بود؛ devops-engineer یا project-lead وصلش کند.
- قاعده‌ی Biome `noRestrictedImports` (جلوگیری از import ماژول `health` در `app/(student)` و `api/v1/me`) هنوز اضافه نشده (`biome.json` بیرون از مرز است). امروز جداسازی با DTO جدا و تست canary تضمین می‌شود.
- SLA بازبینی گیت/غیرگیت (۴۸/۷۲) از اسپرینت ۳ هنوز باز است.

### کارهای باقی‌مانده
- [ ] روی دیتابیس 5432 هیچ migration‌ای اجرا نشد: پیش از دیدن صفحه‌های اسپرینت ۴، `pnpm db:migrate` لازم است (`0004` + seed). پس از آن یک بار `POST /api/v1/admin/health/recompute` (یا صبر تا sweep ساعتی) تا همه‌ی هنرجوهای فعلی سلامت بگیرند.
- [ ] `/healthz` با `lastHealthSweepAt` و هشدار «محاسبه قدیمی‌تر از ۳ ساعت» (بالا).
- [ ] `PATCH /users/:id` و `/role` (از اسپرینت ۱ مانده).
- [ ] ویرایش پیام سؤال تا ۱۵ دقیقه (اگر لازم شد).

### کمبودهای برطرف‌شده (کمبودهای فرانت‌اند اسپرینت ۳) — ۲۹ مهر ۱۴۰۵
همه **افزودنی**‌اند: هیچ فیلد، مسیر یا امضای موجود حذف یا عوض نشد.

| # | چه اضافه شد | نحوه‌ی استفاده |
|---|---|---|
| ۱ | `GET /api/v1/tasks` (A، M) و `listStaffTasks(actor, query)` در `@/modules/tasks/service` ← `StaffTaskListDTO = { items: StaffTaskDTO[], nextCursor, counts: { total, overdue, byStatus } }` | query: `status` (ویرگولی یا `all`)، `overdue=1`، `stageId`، `reviewerId`، `mentorId` (شناسه یا `none` = بی‌مشاور؛ مشاور اصلی هنرجو)، `studentId`، `kind`، `submissionType`، `q` (عنوان کار یا نام/موبایل/برچسب هنرجو)، `sort=due\|recent` (پیش‌فرض `due`: مهلت نزدیک‌تر اول)، `limit` (حداکثر ۱۰۰، پیش‌فرض ۵۰)، `cursor`. دامنه در SQL؛ فیلترها با دامنه AND می‌شوند و فیلتر بیرون از دامنه فقط فهرست خالی می‌دهد. `counts` همه‌ی فیلترها جز `status` و `overdue` را دارد، پس شمارنده‌ی هر زبانه‌ی M5 از همان درخواست می‌آید (مثلاً «منتظر بازبینی» = `byStatus.submitted`، «باز و در حال انجام» = `open + in_progress`). جایگزین `listScopeTasks` در `app/(staff)/_data.ts` |
| ۲ | `StudentReviewDTO.reviewer: { displayName }` | کارت بازخورد هنرجو: «بازخورد {reviewer.displayName}». فقط نام؛ شناسه‌ی بازبین همچنان نیست |
| ۳ | `nextDueDate?: 'YYYY-MM-DD'` در بدنه‌ی `POST /submissions/{id}/review` (`ReviewInput`) | فقط با `outcome: 'changes_requested'`؛ با `accepted` یا روز گذشته ← `422 fields.nextDueDate`. مهلت کار در همان تراکنش = پایان آن روز تهران. پاسخ (`StaffTaskDetailDTO`) `dueAt` تازه را دارد |
| ۴ | `PUT /students/{id}/stage` با `createTemplateIds?: string[]` (حداکثر ۳۰)، `cancelTaskIds?: string[]` (حداکثر ۱۰۰)، `cancelReason?` (پیش‌فرض «با تغییر مرحله لغو شد.»)؛ پاسخ به‌علاوه‌ی `createdTasks: StaffTaskDTO[]` و `cancelledTaskIds: string[]` | پنجره‌ی تغییر مرحله به‌جای `POST /tasks` و `/cancel` جداگانه، همه را در همین درخواست می‌فرستد. **اتمی:** قالب ناموجود/غیرفعال ← `422 fields.createTemplateIds`؛ کارِ هنرجوی دیگر یا ناموجود ← `422 fields.cancelTaskIds`؛ کار نهایی‌شده در فهرست لغو ← `409 INVALID_TRANSITION`؛ در همه‌ی این حالت‌ها (و خطای قاعده‌ی مرحله) نه مرحله عوض می‌شود، نه کاری ساخته یا لغو می‌شود. شناسه‌های تکراری یک بار حساب می‌شوند. در type این دو فیلد پاسخ اختیاری‌اند تا fallbackها نشکنند؛ API همیشه برشان می‌گرداند (`[]` وقتی فرستاده نشده) |
| ۵ | `ReviewQueueItemDTO.submissionType` و `.dueAt` | در `GET /review-queue`، `getReviewQueue` و `TodayDTO.reviewQueue`؛ دیگر لازم نیست از فهرست کارها پر شوند |
| ۶ | `data` رویدادهای `profile.added`، `profile.updated`، `profile.approved` و `profile.removed`: `{ platformId, platformName, kind }` (`updated` به‌علاوه‌ی `fields`) | تایم‌لاین: «ویترین {data.platformName}» حتی پس از حذف ویترین. رویدادهای قدیمی این کلیدها را ندارند؛ fallback «ویترین» بماند |
| ۷ | `TodayDTO.unansweredQuestions` | از پیش در همین اسپرینت `StaffQuestionListItemDTO[]` شده بود (دیگر `never` نیست)؛ فقط تست یکپارچه اضافه شد. `QuestionRows` را با همین نوع بسازید |

**تصمیم مورد ۳ (مهلت نسخه‌ی بعد) و دلیل:** **مثل تمدید ثبت نمی‌شود** — نه ردیف `task_extensions`، نه `extensionCount + 1`. دلیل: قاعده‌ی R-EXTEND (ADR-0005) تمدیدهای پیاپی را نشانه‌ی گیر کردن هنرجو می‌شمرد؛ مهلت تازه برای دور اصلاح بخش عادی چرخه‌ی بازبینی است و تکرار آن را R-LOOP (`revisionCount`) از قبل می‌سنجد. اگر تمدید حساب می‌شد، هر هنرجویی که دو بار اصلاح بگیرد به‌اشتباه زرد می‌شد و هشدار «سومین تمدید» در M6 بی‌معنا می‌شد. ردپا گم نمی‌شود: رویداد `review.created` کلیدهای `previousDueAt` و `nextDueAt` را می‌گیرد و `originalDueAt` دست نمی‌خورد. مهلت زودتر از مهلت فعلی هم پذیرفته است (دور اصلاح می‌تواند کوتاه‌تر باشد)؛ فقط قبل از امروز ممنوع است.

**تست‌ها:** `tests/integration/frontend-gaps-sprint4.test.ts` (۱۷ تست): ماتریس `GET /tasks` (A همه، M فقط هنرجوهای خودش، M-other، **M-سابق** پس از تغییر مشاور، S ← `403`، بی‌نشست ← `401`)، فیلترهای بیرون از دامنه ← فهرست خالی، فیلترها و `counts`، cursor و `422` برای cursor خراب/کلید ناشناخته؛ نام بازبین بدون شناسه؛ `nextDueDate` (بدون تمدید، رویداد، کار معوق دیگر معوق نیست، `422` بدون هیچ نوشتن)؛ **اتمی بودن مورد ۴** (قالب غیرفعال، قالب ناموجود، کار هنرجوی دیگر، کار نهایی، و خطای «همان مرحله»: وضعیت مرحله، کارها و رویدادهای `stage.changed` قبل و بعد عیناً برابر)؛ صف بازبینی؛ رویدادهای ویترین؛ «امروز». به‌علاوه ورودی manifest (T-MATRIX خودکار برای ۶ نقش). در `tasks.test.ts` schema سخت‌گیر هنرجو حالا `reviewer: { displayName }` را می‌خواهد و همچنان `reviewerId` و شناسه‌ی مشاور را ممنوع می‌داند.

**نتیجه‌ی فرمان‌ها (اجرای واقعی، پس از آخرین تغییر):**
| فرمان | نتیجه |
|---|---|
| `pnpm typecheck` | تمیز |
| `pnpm test` | ۶۳ فایل، **۱۴۲۸ تست سبز** |
| `pnpm build` | موفق؛ `/api/v1/tasks` در خروجی (۹۳ مسیر `/api/v1` + ۱ داخلی) |
| `pnpm lint` | فایل‌های بک‌اند و تست تمیزند. خطاهای باقی‌مانده فقط قالب‌بندی/ترتیب import در فایل‌های فرانت‌اندِ در حال ساخت است: `app/(staff)/students/page.tsx`، `app/(staff)/today/page.tsx`، `components/files/image-uploads.tsx`، `components/health/reasons.ts`، `components/health/stuck-rows.tsx`، `components/questions/labels.ts`، `question-rows.tsx`، `thread.tsx`، `components/stages/board.tsx`، `components/students/health.tsx`، `student-filters.tsx`، `students-table.tsx`، `components/ui/jalali-date-field.tsx` (همه با `biome check --write` درست می‌شوند؛ به آن‌ها دست نزدم) |

**برای software-architect (سؤال باز / به‌روزرسانی سند):**
- جدول ADR-0004 بخش ۱-۱ دو شناسه‌ی ارجاعی تازه می‌خواهد: `createTemplateIds` (همان شرط `templateId`: ردیف فعال، و مرحله‌ی قالب فعال) و `cancelTaskIds` (همان شرط `taskId`: کارِ **همان** هنرجو). پیاده‌سازی با `assertRefs` پیش از هر نوشتن است.
- `api.md` بخش ۵ و ۶: `GET /tasks`، `nextDueDate` در بازبینی، فیلدهای تازه‌ی `PUT /students/:id/stage`، و `reviewer.displayName` در DTO هنرجو (بند «DTO هنرجو» فعلاً فقط «بدون `reviewerId`» می‌گوید). برای security-reviewer: هنرجو حالا نام نمایشی بازبین را می‌بیند (مثل `SharedNoteDTO.author.displayName`)، نه شناسه را.

---

## راهنمای فرانت‌اند (برای frontend-engineer)

قواعد کلی همان اسپرینت ۲ و ۳: RSC تابع service را با `toActor(user)` صدا می‌زند؛ نوشتن فقط با `fetch` به API؛ DTOها با `import type`. **هیچ امضای موجودی عوض نشد؛ فقط فیلد اضافه شد.** `StudentListDTO.counts` در type اختیاری است تا fallback فعلی `{ items: [], nextCursor: null }` بشکند، ولی در پاسخ همیشه هست.

### تابع‌های service برای صفحه‌های RSC
| صفحه | تابع (ماژول) | خروجی |
|---|---|---|
| «امروز» | `getToday(actor, { mentorId? })` (`today`) | حالا `unansweredQuestions`، `stuckStudents` و `waitingOnUs` واقعی |
| گیرکرده‌ها | `listStuckStudents(actor, { level?, includeSnoozed?, mentorId? })` (`health/service`) | `StudentListItemDTO[]` |
| پرونده: سلامت | `getStudentHealth(actor, id)` | `HealthDetailDTO` (`snoozeReason`، `snoozedBy`، `redSince`) |
| پرونده: پرچم‌ها | `listFlags(actor, id, { active? })` | `FlagDTO[]` |
| صف سؤال‌ها `/questions` | `listQuestions(actor, query)` (`questions/service`) | `StaffQuestionListDTO` (`sla`، `viaAssignment`) |
| صفحه‌ی سؤال (کارکنان) | `getStaffQuestion(actor, id)` | `StaffQuestionDetailDTO` (پیام‌ها قدیمی اول + `studentSummary`) |
| S سؤال‌های من `/my/questions` | `listOwnQuestions(actor, { status? })`، `getOwnQuestion(actor, id)` | `StudentQuestionListDTO` (`expectedResponseText`)، `StudentQuestionDetailDTO` |
| متن‌های استاندارد | `listCannedResponses(actor)` (`catalog/service`) | `CannedResponseDTO[]` |
| S check-in | `getCurrentCheckin(actor)` (`checkins/service`) | `CurrentCheckinDTO`؛ با check-in خاموش `ApiError NOT_FOUND` ← کارت را نشان نده |
| پرونده: check-inها | `listStudentCheckins(actor, id)` | `CheckinListDTO` |
| پرونده: نقاط عطف | `listStudentMilestones(actor, id)` (`milestones/service`) | `MilestoneDTO[]` |
| S نقاط عطف من | `listOwnMilestones(actor)` | `StudentMilestoneDTO[]` |
| داشبورد مدیر | `getNorthStar(actor, { from?, to? })` | `NorthStarDTO` |
| تنظیمات مدیر | `getSettings(actor)`، `listMilestoneTypes(actor, { includeInactive })` | `SettingsDTO`، `MilestoneTypeDTO[]` |
| تنظیمات فقط‌خواندنی کارکنان | `getStaffSettings(actor)` (`catalog/service`) | `StaffSettingsDTO` (`access.mentorsCanInviteStudents` برای پنهان کردن «هنرجوی جدید») |
| برچسب‌ها و شمارنده‌ها | `listStudentTags(actor)`؛ `listStudents(...).counts` | جای ورق زدن ۱۰ صفحه در `_data.ts` |

### endpointهایی که فرم‌ها صدا می‌زنند
| فرم / عمل | درخواست | بدنه | پاسخ |
|---|---|---|---|
| نادیده تا تاریخ | `PUT /api/v1/students/{id}/health/snooze` | `{ until: 'YYYY-MM-DD', reason }` (انتخاب‌گر شمسی ← میلادی) | `200 HealthDetailDTO` |
| برداشتن نادیده | `DELETE …/health/snooze` | — | `200 HealthDetailDTO` |
| پرچم | `POST /api/v1/students/{id}/flags`؛ `POST /api/v1/flags/{id}/clear` | `{ category, level, note?, expiresAt? }` | `201/200 FlagDTO` |
| S سؤال تازه | `POST /api/v1/me/questions` | `{ subject, body, links?, attachmentIds?, taskId?, priority? }` | `201 StudentQuestionDetailDTO` |
| S درخواست تمدید مهلت | همان، با `taskId` همان کار و موضوع «درخواست تمدید مهلت» | — | — |
| پیام / پاسخ | `POST /api/v1/questions/{id}/messages` | `{ body, links?, attachmentIds?, cannedResponseId? (فقط کارکنان) }` | `201` DTO همان نقش |
| بستن | `POST /api/v1/questions/{id}/close` | — | `200` DTO همان نقش |
| واگذاری (مدیر) | `PUT /api/v1/questions/{id}/assignee` | `{ assigneeId }` | `200 StaffQuestionDetailDTO` |
| S check-in | `POST /api/v1/me/checkins` | `{ activityText?, blocker?, mood: 1..5, nextWeekPlan?, needsHelp }` | `201 CheckinDTO` (`questionId` اگر کمک خواست)؛ دومی ← `409` |
| S پیشنهاد نقطه‌ی عطف | `POST /api/v1/me/milestones` | `{ typeId, occurredOn, platformId?, amount?, currency?, evidenceText?, attachmentIds? }` | `201 StudentMilestoneDTO`؛ بی‌مدرک برای `requiresEvidence` ← `422 fields.evidenceText` |
| ثبت نقطه‌ی عطف (کارکنان) | `POST /api/v1/students/{id}/milestones` | همان | `201 MilestoneDTO` (`approved`) |
| تأیید / رد | `POST /api/v1/milestones/{id}/approve`، `/reject` (`{ reason }`) | — | `200 MilestoneDTO`؛ تکراری ← `409` |
| تنظیمات | `PUT /api/v1/settings` (چند کلید) یا `PUT /api/v1/settings/{key}` (بدنه = مقدار) | کلیدها: `access`، `sla`، `business_hours`، `tasks`، `questions`، `checkin`، `health.rules` | `200`؛ `422` با `fields` به مسیر کلید (مثلاً `inactivity`) |
| انواع نقطه‌ی عطف، متن‌های استاندارد | `POST`/`PATCH /api/v1/milestone-types[/{id}]`، `/canned-responses[/{id}]` | — | — |
| خروجی | لینک `GET /api/v1/exports/milestones.csv` | — | دانلود |

### نکته‌های UI
- **دلیل سلامت:** متن فارسی را از `reasons[].facts` بسازید: R-INACT `{days}` («۹ روز بی‌فعالیت»)، R-STALL `{daysInStage, expectedDays}`، R-OVERDUE `{overdueCount, maxOverdueDays}` («۲ کار عقب»)، R-LOOP `{maxRevisions}`، R-NOTASK `{days}`، R-EXTEND `{maxExtensions}`، R-FLAG `{count, categories}`، R-CHECKIN `{weeks}`، R-MOOD `{mood, weeks}`. `churnRisk` ← برچسب «خطر ریزش». `ball`: `student` / `team` / `both` = «توپ در زمین هنرجو / ما / هر دو».
- `health` فقط تا اولین محاسبه `null` است؛ پس از `db:migrate` یک بار recompute یا sweep همه را پر می‌کند. وضعیت `untracked` (فارغ‌التحصیل/ریزش) نشانی ندارد.
- **SLA سؤال:** `sla` فقط وقتی توپ با تیم است؛ `breached` قرمز، `warning` نارنجی؛ فوری = ۴ ساعت. `viaAssignment: true` یعنی مشاور فقط همین رشته را می‌بیند: لینک به پرونده‌ی کامل نگذارید؛ از `studentSummary` استفاده کنید.
- هنرجو: `hasNewReply` برای نشان «پاسخ تازه» (F10)؛ `expectedResponseText` کنار فرم سؤال؛ `author.isTeam` برای جهت حباب پیام.
- **`waitingOnUs`:** `question` ← `/questions/{refId}`؛ `red_no_action` ← پرونده با «ثبت اقدام» (هر یادداشت آن را می‌بندد)؛ `escalated` = گزارش به بنیان‌گذار.
- `409 PHONE_TAKEN` برای مدیر `error.data.existingStudentId` دارد ← دکمه‌ی «رفتن به پرونده‌ی موجود».
- `stage.sortOrder` در DTOهای کارکنان برای جهت تغییر مرحله (جای ایندکس از `listStages`)؛ `stage.isActive=false` یعنی مرحله‌ی غیرفعال.
- `GET /board` کارت‌ها `accountStatus` دارند («هنوز وارد نشده» برای `invited`).
- مبلغ نقطه‌ی عطف رشته‌ی اعشاری است (`"250.00"`)؛ ارز پیش‌فرض `USD`.
- North Star بی‌پارامتر = ماه شمسی جاری؛ برای ماه دیگر، بازه‌ی میلادی بفرستید (`lib/jalali.jalaliMonthRange` در مرورگر هم کار می‌کند).
- ورود CSV: ستون مهلت حالا شمسی (`۱۴۰۵/۰۸/۰۱`) هم می‌پذیرد؛ متن راهنمای فرم را به‌روز کنید.
- هیچ‌چیز از سلامت، پرچم، snooze یا `studentSummary` در DTOهای هنرجو نیست؛ در صفحه‌های `(student)` ماژول `health` را import نکنید.

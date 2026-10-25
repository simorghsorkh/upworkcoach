# اسپرینت ۳ — یادداشت تحویل

> فاز ۴، نسخه‌ی 0.1 «دفتر مربی». هر نقش بخش خودش را می‌نویسد.

---

## بک‌اند (backend-engineer) — ۲۹ مهر ۱۴۰۵

**دامنه:** کارها، تحویل، بازبینی و تمدید (F4)؛ یادداشت و تایم‌لاین (F5)؛ یادآور و «امروز» (F6)؛ پیوست تصویر (C4)؛ ورود و خروجی CSV (F11، Should)؛ حذف حساب برای جدول‌های تازه (ADR-0010). مرجع: `data-model.md` ۲-۲ تا ۲-۷ و ۳-۱، `api.md` بخش ۶، ۷، ۸، ۱۳، ۱۴.

### endpointها (`/api/v1`) — ۳۷ ورودی تازه در `routes.manifest.ts`
| متد و مسیر | نقش | نکته |
|---|---|---|
| `GET/POST /students/:id/tasks` | A، M در دامنه | ساخت: `templateId` فیلدهای خالی را پر می‌کند؛ `dueDate` ← ۲۳:۵۹:۵۹ تهران؛ بازبین پیش‌فرض = مشاور اصلی فعال، وگرنه actor؛ مهلت گذشته ← `422` |
| `POST /tasks/bulk` | A، M | یک هنرجوی خارج از دامنه ← `422` و هیچ کاری ساخته نمی‌شود؛ `batchId` مشترک |
| `GET /tasks/:id` | A، M در دامنه؛ S مال خود | `switch` روی نقش (SEC-A5): کارکنان `StaffTaskDetailDTO`، هنرجو `StudentTaskDTO` |
| `PATCH /tasks/:id` | A، M | مهلت از این مسیر عوض نمی‌شود (`dueDate` ← `422`)؛ `ifUpdatedAt` |
| `POST /tasks/:id/extend`، `/cancel` | A، M | دلیل الزامی؛ تمدید فقط به بعد از مهلت فعلی و در وضعیت غیرنهایی |
| `POST /tasks/:id/start`، `/submissions` | S | نسخه‌ی تازه؛ checkbox مستقیم `accepted`؛ پیوست اتمی (C4)؛ snapshot پروفایل از خود کار |
| `POST /submissions/:id/review` | A، M در دامنه | فقط آخرین نسخه و فقط `submitted`؛ `changes_requested` ← `revisionCount + 1`؛ پاسخ = جزئیات کار |
| `PATCH /reviews/:id` | A؛ M بازبین همان بازبینی و در دامنه | فقط متن و امتیاز، تا ۲۴ ساعت (`409` پس از آن) |
| `GET /review-queue` | A، M | دامنه در SQL؛ `mentorId` = بازبین؛ SLA ساعت کاری |
| `GET/POST /task-templates`، `PATCH /task-templates/:id` | خواندن A، M؛ نوشتن A | غیرفعال‌سازی با `isActive: false` |
| `GET /me/tasks` | S | معوق‌ها اول، بعد مهلت؛ لغوشده فقط با `?status=cancelled` |
| `GET/POST /students/:id/notes` | A، M در دامنه | پیش‌فرض `internal`؛ `occurredAt` آینده ← `422` |
| `PATCH/DELETE /notes/:id` | A؛ M نویسنده و در دامنه‌ی فعلی | internal ← shared در `audit_log(note.visibility_changed)`؛ حذف نرم |
| `GET /me/shared-notes` | S | تنها مسیر یادداشت برای هنرجو |
| `GET /students/:id/timeline` | A، M در دامنه | رویدادها + یادداشت‌ها، جدیدترین اول؛ `types=` دسته‌ها؛ `refs` برای نام مرحله و کاربر |
| `GET/POST /reminders`، `PATCH/DELETE /reminders/:id`، `POST …/done`، `…/snooze` | A، M | M فقط یادآور خودش و هنرجوی در دامنه؛ A برای هر کارمند فعال |
| `GET /today` | A، M | یادآورهای امروز و گذشته، صف بازبینی با SLA، `unansweredQuestions: []`، `stuckStudents: []`، `waitingOnUs`، `counts` |
| `POST /attachments` | * | multipart؛ سقف پیش از بافر؛ نوع از محتوا؛ بازکدگذاری بدون EXIF؛ سهمیه ۲۰/۱۰۰ |
| `GET /attachments/:id` | دسترسی والد؛ `pending` فقط آپلودکننده | سرآیندهای SEC-U6 |
| `POST /imports/students` | A | CSV UTF-8، ۱ مگابایت، ۵۰۰ ردیف؛ `dryRun` پیش‌فرض |
| `GET /exports/students.csv`، `/exports/tasks.csv` | A | BOM، خنثی‌سازی فرمول، موبایل `0912…`، `audit_log` |

### جدول‌ها و migration
`apps/web/drizzle/0003_tasks_timeline_reminders.sql` (drizzle-kit، بازبینی‌شده): `task_templates`، `tasks` (CHECK دلیل لغو و هم‌خوانی `closed_at`، indexهای data-model)، `task_extensions`، `submissions` (یکتای `(task_id, version)`، CHECK رضایت)، `reviews` (یکتای `submission_id`، امتیاز ۱..۵)، `attachments` (CHECK «`pending` ⇔ بی‌والد، `linked` ⇔ دقیقاً یک والد»؛ ستون‌های `question_message_id`/`milestone_id` بدون FK تا اسپرینت ۴)، `notes`، `timeline_events`، `reminders` (یکتای `system_key`). به‌علاوه‌ی FK دستی `profile_snapshots.source_submission_id`. seed: ۱۶ قالب کار پیش‌فرض مرحله‌ها با `suggestOnStageEntry`.

### ساختار کد
- `lib/tehran-day` (پایان/شروع روز، ساعت دیواری، `addDays`، روز هفته، `jalaliDate`)، `lib/business-hours` (`elapsedBusinessHours`، `slaState`)، `lib/csv` (`toSafeCsvCell`، `toCsv`).
- `modules/tasks`: schema، contracts، policy (ماشین وضعیت خالص)، repo، `counts.ts` (شمارنده‌ها برای students، بی‌چرخه)، `erasure.ts`، service.
- `modules/files`: schema، `image.ts` (sharp، صف ۲تایی)، repo، service (`linkAttachmentsToSubmission`، `cleanupPendingAttachments`). job `files.cleanup` (۳:۴۵ تهران) ثبت شد.
- `modules/timeline`: schema، **بدنه‌ی `recordTimelineEvent`** (همه‌ی رویدادهای اسپرینت ۲ حالا ذخیره می‌شوند)، repo (`listSharedNotesForStudent` تنها تابع هنرجو)، service، `erasure.ts`.
- `modules/reminders`، `modules/today` (read-model)، `modules/admin/csv-export.ts` و `student-import.ts` (فایل جدا تا `admin/service` بی‌چرخه بماند).
- `access`: resolverهای `task`، `submission`، `review` (دولایه)، `note`، `attachment`؛ ref `template` در `assertRefs`.
- `students`: شمارش واقعی کارها در فهرست، پرونده و summary؛ `initialNote`؛ انتقال یادآورها در تغییر مشاور؛ یادآور سیستمی یک روز پیش از پایان توقف (لغو با خروج از توقف). `path`: `suggestedTemplates` واقعی.
- `server/http`: `route({ multipart: true })`، `readBodyBytes`، `parseMultipart`، پاسخ دودویی `raw`؛ `isoInstantInput`، `requiredLongText`، `englishText`؛ تنظیمات `sla`، `business_hours`، `tasks` در catalog.
- `admin:erase-user`: کارها، تحویل‌ها، بازبینی‌ها، تمدیدها، یادداشت‌ها (حذف سخت)، `timeline_events.data = {}`، یادآورها، پیوست‌ها (فایل پس از commit؛ شکست ← ردیف `pending` قدیمی که `files.cleanup` دوباره امتحان می‌کند). کارمند با یادآور باز ← رد.

### نتیجه‌ی فرمان‌ها (اجرای واقعی، پس از آخرین تغییر)
| فرمان | نتیجه |
|---|---|
| `pnpm lint` | تمیز (۳۴۲ فایل) |
| `pnpm typecheck` | تمیز |
| `pnpm test` | ۴۹ فایل، **۹۷۹ تست سبز**: واحد ۲۹۵ (۳۲ فایل، شامل تست‌های کامپوننت فرانت) و یکپارچه ۶۸۴ (۱۷ فایل) |
| `pnpm build` | موفق؛ ۶۲ مسیر API، همه dynamic |
| دود واقعی | Postgres موقت 55433 + `next start` روی 3100 (production): migrate + seed (۱۶ قالب)، seed دوباره (۰)، `admin:create`، پذیرش دعوت با ارقام فارسی، `POST /students` با `initialNote`، پذیرش هنرجو، کار، **آپلود JPEG با sharp در build واقعی** و دانلود بدون EXIF، تحویل با پیوست، `/today`، بازبینی، `/me/shared-notes` بدون یادداشت داخلی، تایم‌لاین، یادآور، `403` بدون Origin، `students.csv`. هر دو پردازه بسته شدند |

**تست‌های تازه:** واحد — ماشین وضعیت کار (جدول کامل action × status)، معوق و روز تأخیر، ترتیب هنرجو، اعتبار تحویل، پنجره‌ی ۲۴ ساعت، ساعت کاری و SLA، روز تهران و شمسی، CSV injection، sharp (EXIF، چرخش، ۴۰۹۶، HTML/SVG/GIF ← ۴۱۵، بمب ۴۰ مگاپیکسل ← ۴۲۲)، پاک‌سازی نام فایل، دسته‌های تایم‌لاین، snooze. یکپارچه — `tasks.test.ts` (چرخه‌ی کامل از API، T-REF، bulk اتمی، T-DTO با schema سخت‌گیر، S-دیگر/M-دیگر با بدنه‌ی یکسان `404`، شمارنده‌ها، صف بازبینی، قالب پیشنهادی)، `attachments.test.ts` (C4، سرآیندها، سهمیه، cleanup)، `notes-timeline.test.ts` (**قناری یادداشت داخلی روی همه‌ی GETهای هنرجو**، M-سابق، ممیزی visibility، فیلتر و cursor تایم‌لاین)، `reminders-today.test.ts`، `erasure-sprint3.test.ts`، `csv.test.ts`؛ و T-MATRIX و T-CSRF برای همه‌ی ۳۷ endpoint تازه.

### فرض‌ها (برای بازبینی software-architect و security-reviewer)
1. **`kind` و `submissionType`** در ساخت کار اختیاری‌اند (پیش‌فرض `custom` و `text`، یا از قالب)؛ `title` بدون قالب الزامی است. `dueDate` اختیاری است: روزهای قالب، وگرنه `settings.tasks.defaultDueDays` (۳).
2. **مهلت گذشته** در ساخت و تمدید پذیرفته نیست؛ تمدید فقط به بعد از مهلت فعلی.
3. **`overdueDays`** = روزهای تقویم تهران پس از مهلت (حداقل ۱).
4. **تحویل:** `text` متن، `link` لینک، `file` پیوست و `profile_review` متن ویترین می‌خواهد؛ فیلدهای پروپوزال یا ویترین روی نوع دیگر ← `422`. checkbox هم یک نسخه‌ی تحویل ثبت می‌کند (سابقه).
5. **هر کارمند در دامنه** می‌تواند بازبینی کند (نه فقط `reviewerId`)؛ ویرایش متن بازبینی فقط بازبین همان بازبینی یا مدیر. پنجره‌ی ۲۴ ساعت برای مدیر هم هست.
6. **`/me/tasks`** فهرست سبک (`latestReview`) و `GET /tasks/:id` جزئیات کامل با همه‌ی نسخه‌ها و بازخوردها؛ هنرجو متن پروپوزال و رضایت خودش را می‌بیند. دلیل لغو را نمی‌بیند.
7. **`cancel_reason` در حذف حساب** به‌جای `null` مقدار `'[حذف شد]'` می‌گیرد تا CHECK «دلیل لغو الزامی» نشکند (همان قاعده‌ی `task_extensions`).
8. **`GET /attachments/:id`** `Cache-Control: private, no-store` دارد (سخت‌گیرتر از `no-cache` در api.md ۱۴؛ بدون ETag اثر یکسان).
9. **snooze** از دیرترِ «اکنون» و «زمان فعلی یادآور» حساب می‌شود. یادآور «انجام شد» تکراری `200` است.
10. **«امروز» مدیر بدون `mentorId`** یادآورهای همه را نشان می‌دهد (F6)؛ `GET /reminders` مدیر بدون `ownerId` فقط یادآورهای خودش را.
11. **صف بازبینی** همه‌ی بازبینی‌ها را با `reviewHours` (۴۸) می‌سنجد (تفکیک گیت ۴۸ و غیرگیت ۷۲ در mentor-workflow هنوز در `settings.sla` نیست).
12. **تغییر مشاور به «بی‌مشاور»**: یادآورهای باز مشاور قبلی به مدیرِ انجام‌دهنده منتقل می‌شوند.
13. **ورود CSV**: ستون‌ها فارسی یا انگلیسی؛ مرحله با `displayCode` (ارقام فارسی یا لاتین) یا نام؛ مشاور با موبایل یا نام؛ **مهلت فقط میلادی `YYYY-MM-DD`** (قاعده‌ی ADR-0008: API تاریخ شمسی نمی‌گیرد). اجرای واقعی فقط ردیف‌های معتبر را ثبت می‌کند و هر ردیف تراکنش خودش را دارد.
14. `timeline_events.data` همان قاعده‌ی `audit_log` را دارد (کلید token/url/link/… ← خطا). عنوان کار در `task.created` ذخیره می‌شود (با حذف حساب پاک می‌شود).

### سؤال‌های باز (برای software-architect)
- **تاریخ شمسی در فایل CSV ورودی:** بنیان‌گذار مهلت‌ها را در اکسل احتمالاً شمسی می‌نویسد. پیشنهاد: تبدیل `1405/08/01` فقط در مسیر import (استثنای مستند ADR-0008) یا قالب اکسل با ستون میلادی.
- **SLA بازبینی گیت/غیرگیت** (۴۸/۷۲ ساعت در mentor-workflow): افزودن `reviewHoursNonGate` به `settings.sla`؟
- **ستون‌های `question_message_id` و `milestone_id`** در `attachments` حالا بدون FK‌اند؛ اسپرینت ۴ FK را اضافه می‌کند.

### کارهای باقی‌مانده
- [ ] اسپرینت ۴: `question_threads` (بخش سؤال‌های «امروز»، `waitingOnUs` نوع `question`، حالت assignee در summary، انتقال سؤال‌ها در تغییر مشاور، پیش‌شرط حذف کارمند)، سلامت (`stuckStudents`، `red_no_action`، `health` در DTOها و بازمحاسبه پس از هر گذار کار)، `milestones` (پیوست و `milestones.csv`).
- [ ] `GET/PUT /settings` (تا `sla`، `business_hours` و `tasks` از UI تغییر کنند).
- [ ] قاعده‌ی Biome `noRestrictedImports` برای مسیرهای هنرجو و T-LOG کامل (آپلود و CSV) — از اسپرینت ۱ مانده.
- [ ] تست `413` با `Content-Length` اعلام‌شده برای multipart (helper تست آن را بازنویسی می‌کند؛ مسیر JSON با همان `readBodyBytes` تست دارد).
- [ ] روی دیتابیس 5432 هیچ migration‌ای اجرا نشد: پیش از دیدن صفحه‌های اسپرینت ۳، `pnpm db:migrate` لازم است (`0003` + ۱۶ قالب).

---

## راهنمای فرانت‌اند (برای frontend-engineer)

قواعد کلی همان اسپرینت ۲ است: RSC تابع service را مستقیم با `toActor(user)` صدا می‌زند؛ نوشتن فقط با `fetch` به API (Server Action ممنوع)؛ DTOها را با `import type` از `@/modules/*/contracts` بگیرید؛ هرگز `service` را در کامپوننت کلاینت import نکنید. خطاها `ApiError` با `code` و پیام فارسی؛ `422` با `error.fields`. همه‌ی زمان‌ها ISO با `Z`؛ روزها `YYYY-MM-DD` میلادی (= روز تهران)؛ تبدیل شمسی با UI.

### تابع‌های service برای صفحه‌های RSC
| صفحه | تابع (ماژول) | خروجی |
|---|---|---|
| M «امروز» `/today` | `getToday(actor, { mentorId? })` (`@/modules/today/service`) | `TodayDTO` (`reminders`، `reviewQueue`، `waitingOnUs`، `counts` برای شمارنده‌ی ناوبری؛ `unansweredQuestions` و `stuckStudents` فعلاً `[]`) |
| صف بازبینی | `getReviewQueue(actor, { mentorId? })` (`@/modules/tasks/service`) | `ReviewQueueItemDTO[]` (`slaRemainingHours`، `breached`، `warning`) |
| پرونده: کارها | `listStudentTasks(actor, studentId, { status?, stageId? })` | `StaffTaskDTO[]` |
| صفحه‌ی کار (کارکنان) | `getStaffTask(actor, taskId)` | `StaffTaskDetailDTO` (نسخه‌ها جدیدترین اول، هر کدام `review` و `attachments`؛ `extensions[]`) |
| فهرست قالب‌ها | `listTaskTemplates(actor, { stageId?, includeInactive? })` (`@/modules/catalog/service`) | `TaskTemplateDTO[]` |
| پرونده: یادداشت‌ها | `listStudentNotes(actor, studentId, { visibility?, kind?, limit?, cursor? })` (`@/modules/timeline/service`) | `NoteListDTO` (`canEdit` برای دکمه‌ی ویرایش) |
| پرونده: تایم‌لاین | `getTimeline(actor, studentId, { types?, limit?, cursor? })` | `TimelineDTO` (`items`، `nextCursor`، `refs.stages`/`refs.users` برای نام‌ها) |
| یادآورها `/reminders` | `listReminders(actor, { scope: 'today' \| 'upcoming' \| 'done', ownerId?, studentId? })` (`@/modules/reminders/service`) | `ReminderDTO[]` |
| S «کارهای من» `/my/tasks` | `listOwnTasks(actor, { status? })` (`@/modules/tasks/service`) | `StudentTaskListItemDTO[]` (معوق‌ها اول) |
| S صفحه‌ی کار | `getOwnTask(actor, taskId)` | `StudentTaskDTO` |
| S خانه: یادداشت‌های مشاور | `listOwnSharedNotes(actor, { limit?, cursor? })` (`@/modules/timeline/service`) | `SharedNoteListDTO` |

`StaffStudentDTO` و `StudentListItemDTO` حالا `openTaskCount`، `overdueTaskCount` و `nextTask` واقعی دارند؛ `StudentSummaryDTO.openTasks` پر است. `health` هنوز `null`.
`types` تایم‌لاین: `note,student,stage,profile,task,question,checkin,milestone,flag,health` (ویرگولی؛ نبود = همه). هر آیتم `kind: 'event' | 'note'`، `category` و برای رویداد `data` خام (مثلاً `stage.changed`: `{ from, to, kind }` با شناسه‌ی مرحله ← `refs.stages[id]`؛ `task.status_changed`: `{ from, to }`؛ `review.created`: `{ taskId, version, outcome, score }`).

### endpointهایی که فرم‌های کلاینت صدا می‌زنند
| فرم / عمل | درخواست | بدنه | پاسخ موفق |
|---|---|---|---|
| کار تازه | `POST /api/v1/students/{id}/tasks` | `{ title?, description?, kind?, submissionType?, stageId?, requiredForGate?, priority?, dueDate?, reviewerId?, templateId?, profileId? }` | `201 StaffTaskDTO` |
| کار گروهی | `POST /api/v1/tasks/bulk` | `{ studentIds[], templateId? \| title…, dueDate? }` | `201 { batchId, created, taskIds }` |
| ویرایش کار | `PATCH /api/v1/tasks/{id}` | `{ title?, description?, priority?, reviewerId?, stageId?, requiredForGate?, ifUpdatedAt? }` | `200 StaffTaskDTO` |
| تمدید | `POST /api/v1/tasks/{id}/extend` | `{ newDueDate, reason }` | `200 StaffTaskDTO` |
| لغو | `POST /api/v1/tasks/{id}/cancel` | `{ reason }` | `200 StaffTaskDTO`؛ نهایی ← `409 INVALID_TRANSITION` |
| بازبینی | `POST /api/v1/submissions/{id}/review` | `{ outcome: 'accepted' \| 'changes_requested', feedbackText, score?: 1..5 }` | `201 StaffTaskDetailDTO` |
| اصلاح بازخورد (۲۴ ساعت) | `PATCH /api/v1/reviews/{id}` | `{ feedbackText?, score? }` | `200 StaffReviewDTO`؛ دیر ← `409` (فقط وقتی `review.editable`) |
| قالب کار (مدیر) | `POST /api/v1/task-templates`، `PATCH /api/v1/task-templates/{id}` | `{ title, stageId?, description?, kind?, submissionType?, defaultDueDays?, requiredForGate?, suggestOnStageEntry?, sortOrder?, isActive? }` | `201/200 TaskTemplateDTO` |
| S شروع | `POST /api/v1/tasks/{id}/start` | — | `200 StudentTaskDTO` |
| S آپلود تصویر | `POST /api/v1/attachments` | `multipart/form-data` با `file` (FormData؛ `Content-Type` را دستی نگذارید) | `201 { id, mimeType, sizeBytes, width, height, originalName, href, status: 'pending' }`؛ `413`، `415`، `422`، `429` |
| S تحویل | `POST /api/v1/tasks/{id}/submissions` | `{ bodyText?, links?: [{url, label?}], attachmentIds?, platformId?, jobPostText?, proposalText?, profileText?, aiUseConsent? }` | `201 SubmissionCreatedDTO = { id, version, createdAt, task: { id, status } }` |
| یادداشت | `POST /api/v1/students/{id}/notes` | `{ body, kind?, visibility?: 'internal' \| 'shared', tags?, occurredAt? }` | `201 NoteDTO` |
| ویرایش/حذف یادداشت | `PATCH` / `DELETE /api/v1/notes/{id}` | `{ body?, kind?, visibility?, tags?, occurredAt?, ifUpdatedAt? }` | `200 NoteDTO` / `204` |
| یادآور | `POST /api/v1/reminders` | `{ text, dueDate \| dueAt, studentId?, ownerId? (فقط مدیر) }` | `201 ReminderDTO` |
| ویرایش/انجام/تعویق/حذف | `PATCH /api/v1/reminders/{id}`، `POST …/done`، `POST …/snooze` (`{ days: 1 \| 3 \| 7 }`)، `DELETE …` | — | `200 ReminderDTO` / `204` |
| ورود CSV (مدیر) | `POST /api/v1/imports/students` | multipart: `file`، `dryRun` (`'true'` پیش‌فرض، `'false'` ثبت) | `200 { dryRun, total, valid, imported, rows: [{ line, ok, errors: [{column, message}], studentId?, inviteUrl? }] }` |
| خروجی CSV (مدیر) | لینک `GET /api/v1/exports/students.csv` و `/exports/tasks.csv` | — | دانلود فایل |

**نکته‌های UI:**
- تصویر پیوست را با `<img src={a.href}>` نشان دهید (همان‌مبدأ، کوکی نشست می‌رود). کنار آپلود مدرک: «نام و عکس کارفرما را بپوشان» (SEC-F7).
- فرم تحویل پروپوزال: فیلدهای جدای پلتفرم، متن آگهی و پروپوزال با `dir="ltr" lang="en"`، و چک‌باکس رضایت **خاموش به‌طور پیش‌فرض**.
- `visibility: 'shared'` و بازخورد و شرح کار برچسب «هنرجو این را می‌بیند» بگیرند؛ تبدیل internal ← shared پنجره‌ی تأیید (SEC-F6).
- `overdue`/`overdueDays` برچسب قرمز «عقب‌افتاده»؛ هنرجو هیچ سلامت یا دلیلی نمی‌بیند.
- `suggestedTemplates` پاسخ `PUT /students/{id}/stage` حالا پر است (`TaskTemplateDTO[]`)؛ دکمه‌ی «ساخت این کارها» با `POST /students/{id}/tasks { templateId }` برای هر کدام.
- `counts` در `TodayDTO` برای شمارنده‌ی «امروز» در ناوبری.
- پیش از خروجی CSV هشدار SEC-V3: «این فایل شامل موبایل و لینک پروفایل همه‌ی هنرجوهاست؛ پس از استفاده پاکش کن.» نتیجه‌ی ورود (`inviteUrl`ها) را فقط همان‌جا نشان دهید.

---

## فرانت‌اند (frontend-engineer) — ۲۹ مهر ۱۴۰۵

**دامنه:** «امروز» (M1)، کارها و جزئیات کار (M5، M5a، M6)، یادآورها (M9)، و در پرونده (M3): تب کارها، composer یادداشت، تایم‌لاین کامل، یادآور و «کار بعدی». سمت هنرجو: «کارهای من» (S2)، صفحه‌ی کار و تحویل (S3)، و کارها و یادداشت‌های اشتراکی در خانه (S1). به‌علاوه ورود و خروجی CSV (M2b). مرجع ظاهر: `mockups/today.html`، `tasks.html`، `task-detail.html`، `student-profile.html`، `student-task.html` و `student-home.html`. همه‌ی داده‌ها واقعی‌اند: صفحه‌ها service را صدا می‌زنند (RSC) و فرم‌ها با `fetch` در API می‌نویسند. Server Action به کار نرفته است.

### صفحه‌ها
| صفحه | مسیر | نکته |
|---|---|---|
| M1 امروز | `(staff)/today` | کادر «از زمان پاسخ گذشته» (از `waitingOnUs` با `breached`، با شاخه‌های `question` و `red_no_action` آماده). چهار کارت عددی که هر کدام به بخش خودش می‌پرد. یادآورها با «انجام شد» (و «برگرداندن» تا ۱۰ ثانیه) و تعویق ۱ روز، ۳ روز و ۱ هفته. تحویل‌ها به ترتیب دیر، فوری و بعد قدیمی‌ترین. سؤال‌ها و گیرکرده‌ها حالت خالی دارند؛ ردیف گیرکرده با `StudentListItemDTO` ساخته شده و اسپرینت ۴ فقط داده می‌دهد. فیلتر مشاور فقط برای مدیر است («فقط هنرجوهای خودم» و هر مشاور). شمارنده‌ی «امروز» در ناوبری از `counts` می‌آید |
| M5 کارها | `(staff)/tasks` | زبانه‌ها: منتظر بازبینی، معوق، باز و در حال انجام، نیاز به اصلاح، همه (هر کدام با شمارنده). جستجو، نوع، مشاور (مدیر) و مرحله در URL هستند. جدول در دسکتاپ و کارت در موبایل؛ ردیف دیر یا معوق خط قرمز دارد. اقدام هر ردیف: «بازبینی»، یا «تمدید مهلت» و «یادآور» برای معوق‌ها |
| M5a کار جدید | پنجره روی `/tasks` (`?new=1`)؛ `/tasks/new` به آن هدایت می‌شود | یک یا چند هنرجو (چند نفر یعنی `POST /tasks/bulk`)، قالب (گروه‌بندی‌شده با مرحله) که عنوان، شرح، نوع، گیت و مهلت را پر می‌کند، و شش نوع تحویل با راهنمای هر نوع. شرح برچسب «هنرجو این را می‌بیند» دارد. مهلت با انتخاب‌گر شمسی است. زیر «بیشتر»: مرحله، گیت، فوری و بازبین (فقط مدیر) |
| M6 جزئیات کار | `(staff)/tasks/[id]` | نسخه‌ها به‌صورت سوییچ (`?v=`)، متن آگهی و پروپوزال در بلوک LTR با شمار نویسه، رضایت، لینک‌ها و تصویرها. بازخورد دور قبل تاشده است. فرم بازبینی: نتیجه، بازخورد با قالب مشاور و پیش‌نویسی که خودکار روی همین دستگاه ذخیره می‌شود، امتیاز ۱ تا ۵ اختیاری، و «ثبت بازبینی و رفتن به بعدی». «ویرایش بازخورد» فقط تا وقتی `editable` است. «تمدید مهلت» با دلیل (از سومین تمدید هشدار می‌دهد)، «لغو کار» با دلیل، و «ویرایش شرح» (`PATCH` با `ifUpdatedAt`). در موبایل این‌ها در منوی «این کار» هستند. از دور ۳ اصلاح به بعد هشدار «تماس ۱۵ دقیقه‌ای» می‌آید. ستون کناری: شرح کار (معیار پذیرش جدا نشان داده می‌شود)، «X در یک نگاه»، و تاریخچه |
| M9 یادآورها | `(staff)/reminders` | زبانه‌های امروز و گذشته، آینده، انجام‌شده. مدیر می‌تواند یادآورهای هر مشاور را ببیند. فرم یادآور: هنرجو (اختیاری)، متن، روز شمسی و ساعت اختیاری (بدون ساعت ۹ صبح)، و «برای» فقط برای مدیر |
| M3 پرونده | `(staff)/students/[id]` | سربرگ: «N کار باز · M معوق» و دکمه‌های یادداشت، کار، یادآور و بیشتر. نوار موبایل: یادداشت، کار، مرحله و بیشتر. کاشی «آخرین کار خواسته‌شده» واقعی است. تب کارها: بازها به ترتیب (منتظر بازبینی، بعد معوق، بعد مهلت)، و «پذیرفته و لغوشده» تاشده. تایم‌لاین: composer همیشه‌باز (دسکتاپ)، هفت چیپ فیلتر، «موارد قدیمی‌تر» با cursor، و یادداشت داخلی (خط‌چین با قفل) یا اشتراکی (نیلی با چشم). نویسنده یا مدیر می‌تواند ویرایش و حذف کند؛ تبدیل داخلی به اشتراکی پنجره‌ی تأیید دارد (SEC-F6). یادآورهای همین هنرجو در ستون کنار هستند. `?add=note\|task\|reminder\|stage` پنجره‌ی مربوط را باز می‌کند |
| تغییر مرحله | `components/stages/change-stage-dialog.tsx` | «کارهای پیش‌فرض مرحله‌ی N» از قالب‌های `suggestOnStageEntry`، به‌صورت چک‌باکس روشن (هم در پرونده و هم در کانبان). «X کار باز مرحله‌ی قبل: باز بماند / لغو شود» |
| M2 هنرجوها | `(staff)/students` | «کار بعدی» واقعی است («معوق · N روز» یا «تا …»، وگرنه «کار بازی ندارد»). مدیر: «ورود از اکسل» و «خروجی CSV» با هشدار SEC-V3 |
| M2a هنرجوی جدید | فرم موجود | «یادداشت آزاد» به `initialNote` می‌رود و یادداشت داخلی اول پرونده می‌شود |
| M2b ورود از فایل | `components/students/csv-tools.tsx` | فقط CSV تا ۱ مگابایت، با فایل نمونه. اول `dryRun` و جدول ردیف، ستون و مشکل (بدون مقدار، SEC-V5)، بعد «ثبت N هنرجو». لینک‌های دعوت فقط همان‌جا، با دکمه‌ی کپی، نشان داده می‌شوند |
| S1 خانه | `(student)/home` | «کارهای من» (۵ کار باز، معوق‌ها اول، با «بازخورد جدید» و «دیدن بازخورد») و «از مشاورت» (۳ یادداشت اشتراکی تازه، فقط از `listOwnSharedNotes`) |
| S2 کارهای من | `(student)/my/tasks` | زبانه‌های باز و انجام‌شده؛ عقب‌افتاده قرمز؛ بدون سلامت یا دلیل |
| S3 کار | `(student)/my/tasks/[id]` | کارت بازخورد (متنِ نوشته‌شده با قالب به‌صورت حکم، قوت، اصلاح، نمونه و قدم بعدی تفکیک می‌شود؛ جمله‌ی انگلیسیِ داخل گیومه در بلوک LTR). «چه کاری باید بکنی» با معیار پذیرش. فرم تحویل بر اساس نوع: متن، لینک (فقط https) و تصویر (JPG، PNG و WebP تا ۵ مگابایت؛ اول `POST /attachments` با پیش‌نمایش و وضعیت آپلود، و هشدار «نام و عکس کارفرما را بپوشان»). برای «پروپوزال برای بررسی»: پلتفرم، متن آگهی و پروپوزال `dir="ltr" lang="en"`، و رضایتی که **پیش‌فرض خاموش** است. «فقط تیک» یعنی دکمه‌ی «انجام دادم». نسخه‌ی بعد از نسخه‌ی قبل پر می‌شود و متن تا ارسال روی دستگاه می‌ماند. «شروع کردم» برای کار باز. نسخه‌های قبلی و بازخوردها تاشده‌اند. «سؤال درباره‌ی این کار» و «وقت بیشتری لازم دارم» (= درخواست تمدید، طبق UX یک سؤال) تا ماژول سؤال‌ها **به‌زودی** هستند |

حالت‌ها: هر مسیر تازه `loading.tsx` و `error.tsx` دارد؛ جزئیات کار (کارکنان و هنرجو) `not-found.tsx` هم دارد، و ناموجود و خارج از دامنه یک پاسخ می‌گیرند. حالت خالی برای همه‌ی بخش‌ها هست. دکمه‌ها در حین ثبت spinner و برچسب دارند و آپلود تصویر وضعیت پیشرفت نشان می‌دهد.

### کامپوننت‌های تازه
- `components/ui/jalali-date-field.tsx`: **انتخاب‌گر تاریخ شمسی بدون وابستگی تازه**. تایپ «۱۴۰۵/۰۸/۰۱» با ارقام فارسی یا لاتین، تقویم ماهانه‌ی شنبه‌به‌اول (کلیدهای جهت در RTL، Esc، و `aria-label` کامل روی هر روز)، میان‌بُرها، `min`، و خواندن تاریخ به شکل «پنجشنبه ۳۰ مهر ۱۴۰۵ · ۳ روز دیگر». مقدارِ خروجی همیشه روز میلادی `YYYY-MM-DD` است (ADR-0008). محاسبه‌ی تقویم از `lib/jalali` (همان که import بک‌اند استفاده می‌کند) گرفته می‌شود و `components/format/jalali.ts` فقط متن، تجزیه‌ی ورودی و شبکه‌ی ماه را اضافه می‌کند.
- `components/ui/choice.tsx`: `RadioCards`، `ChipButton`، `Rating` و `MenuButton` (منوی تعویق).
- `components/tasks/*` (فرم کار، بازبینی، تحویل، اقدام‌ها، جدول، صف، نشان‌ها و برچسب‌ها)، `notes/*` (composer، پنجره و تایم‌لاین)، `reminders/*`، `students/student-picker.tsx` (combobox جستجوی هنرجو، دو حرف کافی است)، `students/csv-tools.tsx`، و `shell/quick-add.tsx`.
- «+» نوار پایین حالا `QuickAddProvider` است: در پرونده «افزودن برای X» (هنرجو از پیش انتخاب شده) و یادداشت همان‌جا باز می‌شود؛ جای دیگر اول هنرجو جستجو می‌شود. دکمه‌ی «افزودن» دسکتاپ در «امروز» همان پنجره را باز می‌کند.
- `api/client.ts`: `apiUpload` (multipart، بدون دست زدن به `Content-Type`).
- `format/fa.ts`: `faTime`، `faDayTime`، `faHours`، `faAgo` و `faDaysLeft`.

### تست‌ها
- **کامپوننت (۲۰ تست تازه):** `format/jalali.test.ts` (هر روزِ ۱۳۹۵ تا ۱۴۱۵ در هر دو جهت در برابر `Intl` با تقویم persian؛ تجزیه‌ی ورودی)، `tasks/task-form.test.ts` (اعتبارسنجی، مهلت پیش‌فرض و میان‌بُر، تاریخ تایپ‌شده با ارقام فارسی و رد تاریخ گذشته، قالب، bulk، ۴۲۲)، `tasks/review-form.test.ts` (قالب و SEC-F6، نتیجه و بازخورد الزامی، درخواست اصلاح با امتیاز و رفتن به بعدی، پذیرش بی‌امتیاز، پیش‌نویس و ۴۰۹)، `notes/note-form.test.ts` (داخلی به‌طور پیش‌فرض، اشتراکی با برچسب، به خاطر سپردن نوع، قالب جلسه و یادآور پیگیری، شکست ۵۰۳ با نگه داشتن متن و «تلاش دوباره»، **متنِ تایپ‌شده در حین ذخیره پاک نمی‌شود**، و «+ کار از این یادداشت»).
- **e2e با بک‌اند واقعی:** `tests/e2e/tasks-flow.spec.ts` در ۱۴۴۰ و ۳۷۵:
  1. مربی از پرونده کار «پروپوزال برای بررسی» با مهلت شمسی می‌سازد؛ هنرجو در خانه می‌بیند و با فیلدهای LTR و رضایت خاموش تحویل می‌دهد؛ مربی از «امروز» بازبینی می‌کند و درخواست اصلاح می‌دهد؛ هنرجو بازخورد را می‌بیند و نسخه‌ی ۲ را (از نسخه‌ی ۱ پرشده) تحویل می‌دهد؛ مربی می‌پذیرد؛ هنرجو «پذیرفته شد» می‌بیند.
  2. یادداشت داخلی (composer در دسکتاپ؛ نوار اقدام و «+» در موبایل) و یادداشت اشتراکی. قناری داخلی در هیچ صفحه‌ی هنرجو و در `/api/v1/me/shared-notes` نیست؛ یادداشت اشتراکی در خانه هست.
  
  `students-flow.spec.ts` هم به‌روز شد: ورود CSV (خطای ردیف در dryRun) و هشدار خروجی. انتظار «بدون نشان سلامت» در پرونده‌ی کارکنان با نشان سلامت جایگزین شد، چون بک‌اند اسپرینت ۴ سلامت را حساب می‌کند. بررسی «هنرجو سلامت نمی‌بیند» سر جایش ماند.

### نتیجه‌ی فرمان‌ها (اجرای واقعی، پس از آخرین تغییر)
| فرمان | نتیجه |
|---|---|
| `pnpm lint` | ۴۴۹ فایل؛ فایل‌های فرانت‌اند و e2e تمیزند. تنها خطا مال بک‌اند است: قالب‌بندی `tests/integration/students-access.test.ts` |
| `pnpm typecheck` | تمیز |
| `pnpm test` | ۶۲ فایل، **۱۴۰۵ تست سبز**. یک تست کامپوننت اسپرینت ۲ (`new-student-form`، «جزئیات اختیاری») زیر بار کل مجموعه ۵۰۴۸ میلی‌ثانیه طول کشید (سقف ۵۰۰۰)؛ با افزوده شدن فیلد «یادداشت آزاد» یک فیلد بیشتر تایپ می‌کند، پس timeoutِ همان تست ۱۵ ثانیه شد |
| `pnpm build` | موفق؛ همه‌ی مسیرها dynamic. (یک بار پیش‌تر به‌خاطر خطای نوع در فایلِ در حال ساخت بک‌اند، `src/modules/health/sprint4-helpers.test.ts`، شکست خورد؛ پس از اصلاح بک‌اند سبز شد) |
| `pnpm test:e2e` | **۳۰ از ۳۰ سبز** (۱۵ تست × دو اندازه) |

**بررسی در مرورگر** (Chromium، ۱۴۴۰ و ۳۷۵، با داده‌ی واقعی روی دیتابیس موقت e2e و سرور ۳۱۰۰): امروز، کارها، جزئیات کار، پنجره‌ی کار جدید با تقویم باز، یادآورها، پرونده، هنرجوها، و سمت هنرجو (خانه، کارهای من و صفحه‌ی کار). این مشکل‌ها پیدا و رفع شدند:
- تاریخ سربرگ «امروز» با ویرگول لاتینِ Chrome به هم می‌ریخت (`faFullDate`).
- خطوط «-» و «1.» در قالب بازخورد چپ‌چین می‌شدند (`dir="auto"` به `rtl` تغییر کرد).
- یادآور در ستون باریک پرونده سه خط می‌شد (حالت `compact`).
- سلول‌های جدول کارها در ۱۴۴۰ می‌شکستند.
- بازخورد نسخه‌ی ۱ پس از تحویل نسخه‌ی ۲ از دید هنرجو پنهان می‌شد.
- **باگ واقعی:** اگر مربی هنگام ذخیره‌ی یادداشت قبلی یادداشت بعدی را تایپ می‌کرد، متن تازه پاک می‌شد. حالا فقط همان متنِ فرستاده‌شده پاک می‌شود و این رفتار تست دارد.

به Postgres روی 5432 و سرور 3000 دست زده نشد و هیچ پردازه‌ای باز نماند.

### فاصله از ماکاپ و دلیلش
| مورد | تصمیم | دلیل |
|---|---|---|
| «مهلت نسخه‌ی بعد» در فرم بازبینی | نیست | `POST /submissions/:id/review` مهلت نمی‌گیرد (کمبود ۳). مربی از «تمدید مهلت» استفاده می‌کند |
| «بازخورد رضا» در صفحه‌ی هنرجو | «بازخورد مشاورت» | `StudentReviewDTO` نام بازبین را ندارد (کمبود ۲) |
| «ذخیره‌ی پیش‌نویس» هنرجو | ذخیره‌ی خودکار روی دستگاه | API پیش‌نویس ندارد؛ متن در `localStorage` می‌ماند |
| نشان «R-LOOP» و سلامت در سربرگ کار | هشدار دور ۳ از `revisionCount` | سلامت هر کار در DTO کار نیست |
| «قالب‌های کار» در سربرگ M5 | نیست | ویرایش قالب‌ها (مدیر) به بک‌لاگ رفت؛ API آن آماده است |
| کادر «X گیرکرده است؛ این یادداشت اقدام ثبت‌شده است» در پنجره‌ی یادداشت | نیست | مال جریان ۷ و سلامت اسپرینت ۴ |
| سؤال‌ها در «امروز» و پرونده، «درخواست تمدید» هنرجو | حالت خالی یا «به‌زودی» | ماژول سؤال‌ها (اسپرینت ۴) |
| «بازخورد جدید» | بازخورد کمتر از ۳ روز در کاری که نوبت هنرجوست | خواندن یا نخواندن ثبت نمی‌شود |

### کمبودهای فرانت‌اند (برای backend-engineer)
1. **endpoint فهرست کارهای بین هنرجوها وجود ندارد.** M5 با `listStudents` (به دنبال `openTaskCount > 0`) و بعد `listStudentTasks` برای هر هنرجو (۶تا هم‌زمان) ساخته شده است؛ زبانه‌ی «همه» همه‌ی هنرجوها را می‌خواند (`app/(staff)/_data.ts`، `listScopeTasks`). پیشنهاد: `GET /tasks?status=&mentorId=&stageId=&type=&q=&cursor=` همراه با `counts`.
2. **`StudentReviewDTO` نام بازبین را ندارد**، پس کارت بازخورد «بازخورد مشاورت» می‌گوید. پیشنهاد: `reviewer: { displayName }`.
3. **`reviewInput` فیلد `nextDueDate` ندارد** («مهلت نسخه‌ی بعد» در ماکاپ M6 و user-flows ۴).
4. **کارهای پیشنهادی هنگام تغییر مرحله اتمی نیستند.** پنجره پس از `PUT /stage` برای هر قالب یک `POST /students/:id/tasks` و برای هر کار قدیمی یک `/cancel` می‌فرستد. اگر یکی شکست بخورد، پیام می‌دهد ولی برنمی‌گرداند. پیشنهاد: `PUT /students/:id/stage` با `{ createTemplateIds?, cancelOpenTaskIds? }`.
5. `ReviewQueueItemDTO` فیلدهای `submissionType` و `dueAt` را ندارد (در M5 از فهرست کارها پر می‌شوند).
6. داده‌ی رویدادهای `profile.updated` و `profile.approved` نام پلتفرم را ندارد؛ برای ویترینِ حذف‌شده، تایم‌لاین فقط «ویترین» می‌نویسد.
7. `TodayDTO.unansweredQuestions` هنوز از نوع `never` است؛ وقتی نوعش مشخص شد، ردیف‌های بخش سؤال‌ها در `today/page.tsx` (`QuestionRows`) ساخته می‌شوند.

### کارهای باقی‌مانده
- [ ] اسپرینت ۴: سؤال‌ها (صف، رشته، بخش «امروز»، «سؤال درباره‌ی این کار» و «درخواست تمدید»)، ردیف‌های گیرکرده با دلیل و «توپ»، کادر «اقدام ثبت‌شده» در یادداشت، و نقاط عطف.
- [ ] ویرایش قالب‌های کار در تنظیمات (مدیر).
- [ ] «مهلت نسخه‌ی بعد» در بازبینی، پس از کمبود ۳.
- [ ] جایگزینی `listScopeTasks` با endpoint کمبود ۱ (کارایی برای بیش از چند صد هنرجو).
- [ ] میان‌بُر `N` برای composer و `/` برای جستجو (از اسپرینت ۲ مانده).
- [ ] بازبینی تغییر `playwright.config.ts` توسط devops-engineer (از اسپرینت ۲ مانده).

# قرارداد API — UpworkCoach نسخه‌ی 0.1

> فاز ۳ — ۲۷ مهر ۱۴۰۵ — نویسنده: software-architect — وضعیت: پیش‌نویس برای گیت بنیان‌گذار
> مدل داده: `data-model.md`. دسترسی: [ADR-0004](adr/0004-access-control.md). احراز هویت: [ADR-0003](adr/0003-auth-0.1.md).
> schemaهای دقیق zod در `apps/web/src/modules/*/contracts.ts` منبع حقیقت کد هستند. این سند قرارداد مفهومی آن‌هاست و هر تغییر در یکی باید در دیگری هم اعمال شود.

---

## ۱. قراردادهای عمومی

| موضوع | قاعده |
|---|---|
| پایه | `/api/v1`. فقط JSON (`Content-Type: application/json`)، جز `POST /attachments` (multipart) و خروجی CSV |
| احراز هویت | کوکی `__Host-uc_session`. همه‌ی مسیرها جز مسیرهای «عمومی» نشست می‌خواهند؛ بدون نشست ← `401 UNAUTHENTICATED` |
| CSRF | درخواست‌های غیر GET باید سرآیند `Origin` برابر `APP_BASE_URL` داشته باشند؛ وگرنه `403 BAD_ORIGIN` |
| نقش‌ها | `A` = admin، `M` = mentor (فقط در دامنه‌ی خودش؛ ADR-0004)، `S` = student (فقط خودش)، `*` = هر کاربر واردشده، `عمومی` = بدون نشست |
| خارج از دامنه | منبعی که وجود دارد ولی کاربر به آن دسترسی ندارد ← **`404 NOT_FOUND`**. نقش نامجاز برای کل endpoint ← `403 FORBIDDEN` |
| نام فیلدها | camelCase در JSON |
| شناسه | UUID رشته‌ای |
| زمان | لحظه: ISO 8601 با `Z` (`2026-10-19T08:30:00Z`). روز: `YYYY-MM-DD` میلادی که **روز تقویم تهران** معنا می‌شود. **API تاریخ شمسی نمی‌گیرد و برنمی‌گرداند**؛ تبدیل در UI است (ADR-0008) |
| ارقام | ارقام فارسی و عربی در ورودی عددی و موبایل پذیرفته و به لاتین تبدیل می‌شوند |
| صفحه‌بندی | cursor: `?limit=50&cursor=<opaque>` ← `{ items: [...], nextCursor: string \| null }`. حداکثر `limit` ۱۰۰ |
| خطا | `{ "error": { "code": "VALIDATION_FAILED", "message": "<متن فارسی برای نمایش>", "fields": { "phone": "شماره‌ی موبایل معتبر نیست" } } }` |
| کدهای خطای رایج | `VALIDATION_FAILED` (422)، `UNAUTHENTICATED` (401)، `INVALID_CREDENTIALS` (401)، `FORBIDDEN` / `BAD_ORIGIN` (403)، `NOT_FOUND` (404)، `CONFLICT` / `PHONE_TAKEN` / `INVALID_TRANSITION` (409)، `TOKEN_EXPIRED` (410)، `PAYLOAD_TOO_LARGE` (413)، `UNSUPPORTED_MEDIA_TYPE` (415)، `TOO_MANY_ATTEMPTS` (429)، `INTERNAL` (500)، `BUSY` (503، با `Retry-After`؛ صف argon2 پر است) |
| شناسه‌های ارجاعی (امنیت C3) | **هر** شناسه‌ای در بدنه یا query یک درخواست نوشتنی که به منبع دیگری اشاره می‌کند (`profileId`، `taskId`، `attachmentIds`، `mentorId`، `reviewerId`، `assigneeId`، `ownerId`، `studentId`، `studentIds`، `stageId`، `toStageId`، `platformId`، `primaryPlatformId`، `trackId`، `templateId`، `typeId`، `cannedResponseId`) مثل منبع اصلی بررسی می‌شود و اگر به هنرجو وابسته است باید مال **همان هنرجو** باشد. شرط هر شناسه در جدول ADR-0004 بخش ۱-۱؛ پیاده‌سازی با `assertRefs` درون تراکنش نوشتن. رد شدن ← **`422 VALIDATION_FAILED`** با `fields.<نام> = "مقدار نامعتبر است"`، یکسان برای ناموجود، خارج از دامنه، مال هنرجوی دیگر و غیرفعال. `404` فقط برای شناسه‌ی **مسیر** است. فیلترهای query در `GET`ها با دامنه `AND` می‌شوند و فیلتر خارج از دامنه فقط فهرست خالی می‌دهد |
| schema ورودی (امنیت C3، SEC-A7) | همه‌ی schemaهای zod با `.strict()`؛ کلید ناشناخته یا فیلد ممنوع برای آن نقش ← `422` |
| هم‌زمانی ویرایش | منابع قابل‌ویرایش `updatedAt` برمی‌گردانند. PATCH می‌تواند `ifUpdatedAt` بفرستد؛ اگر نابرابر بود ← `409 CONFLICT` (مثلاً دو مشاور هم‌زمان یک پرونده را ویرایش کنند) |
| DTOها | پاسخ‌های مسیرهای `S` نوع‌های جدا دارند و فیلدهای داخلی را **ندارند** (ADR-0004 بخش ۳) |

---

## ۲. احراز هویت و نشست (`identity`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `POST /auth/login` | عمومی | `{ phone, password }` | `200 { user: MeDTO }` + کوکی نشست + کوکی دستگاه `__Host-uc_dev`. `401 INVALID_CREDENTIALS`، `429 TOO_MANY_ATTEMPTS { retryAfterSeconds }`. (امنیت C2) قفل سه‌لایه (موبایل + IP، سراسری موبایل با عبور کوکی دستگاه، IP)، IP فقط از `getClientIp`، رمز پس از `normalizePassword`؛ ADR-0003 بخش ۳–۴ |
| `POST /auth/logout` | * | — | `204`؛ نشست فعلی باطل؛ `Clear-Site-Data: "cache"` |
| `GET /auth/me` | * | — | `MeDTO = { id, displayName, role, phone }` |
| `POST /auth/change-password` | * | `{ currentPassword, newPassword }` | `204`؛ همه‌ی نشست‌های دیگر باطل و نشست جاری چرخانده می‌شود (کوکی تازه). (امنیت C2) حداقل طول: هنرجو ۸، کارکنان ۱۲؛ قفل `pwchange:u:<userId>` ۵ در ۱۵ دقیقه |
| `GET /auth/sessions` | * | — | `[{ id, createdAt, lastUsedAt, userAgent, ip, current }]` (فقط نشست‌های خودش) |
| `DELETE /auth/sessions/:id` | * | — | `204`. شرط `user_id = actor`؛ نشست دیگران ← `404` |
| `POST /auth/tokens/lookup` | عمومی | `{ token }` | (امنیت C1) `200 { purpose: 'invite' \| 'password_reset', displayName, expiresAt }`. **موبایل (حتی پوشانده) برنمی‌گردد.** ناموجود، مصرف‌شده، باطل یا منقضی ← `410 TOKEN_EXPIRED`. محدودیت `token:ip` (۳۰ ناموفق در ۱۵ دقیقه). `Cache-Control: no-store` |
| `POST /auth/tokens/accept` | عمومی | `{ token, phone, password }` | (امنیت C1) `200 { user: MeDTO }` + کوکی. هم دعوت و هم بازنشانی. `phone` باید پس از نرمال‌سازی برابر `users.phone` باشد؛ وگرنه `422 VALIDATION_FAILED { fields: { phone } }` و پس از ۵ بار توکن باطل ← `410`. مصرف اتمی توکن، ابطال همه‌ی نشست‌های قبلی و نشست کوکی ورودی (اگر هست)؛ ADR-0003 بخش ۲ |

(امنیت C1) **هیچ مسیری (صفحه یا API) پارامتر `:token` ندارد.** توکن فقط در fragment لینک (`/invite#t=…`، `/reset#t=…`) و در بدنه‌ی این دو POST است. مسیرهای قدیمی `GET /auth/tokens/:token` و `POST /auth/tokens/:token/accept` **حذف شدند**.

## ۳. کاربران و دعوت (`identity`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /users?role=mentor\|admin\|student&status=` | A | — | فهرست کارکنان و کاربران. هر ردیف `inviteAcceptedAt` و `inviteAcceptedDevice` (از `auth_tokens.used_at` و `used_user_agent`؛ امنیت C1، SEC-T5) و `erasedAt` (امنیت C5) دارد |
| `GET /mentors` | A، M | — | `[{ id, displayName, role }]` نقش‌های admin و mentor با `status=active`؛ برای انتخاب مشاور و فیلتر |
| `POST /invitations` | A | `{ role: 'mentor' \| 'admin', displayName, phone }` | `201 { userId, inviteUrl, expiresAt }`. **`inviteUrl` فقط همین یک بار برمی‌گردد** (`Cache-Control: no-store`). (امنیت C1) شکل: `${APP_BASE_URL}/invite#t=<token>`. هنرجو از مسیر `POST /students` ساخته می‌شود |
| `POST /users/:id/invite-link` | A؛ M (امنیت C3: فقط اگر کاربر هدف **`role = 'student'`**، `status = 'invited'` و در دامنه‌ی خودش است) | — | `201 { inviteUrl, expiresAt }` (شکل `…/invite#t=…`؛ `no-store`)؛ لینک قبلی باطل می‌شود. A: فقط برای `status=invited` (وگرنه `409`). **M برای هر کاربر دیگر، از جمله کاربر `invited` با نقش `admin` یا `mentor`، ← `404`.** شرط نقش صریح بررسی می‌شود، نه از راه «اگر ردیف `students` هست». `audit_log(user.invite_link_created)` با نقش سازنده، بدون لینک |
| `POST /users/:id/reset-link` | A | — | `201 { resetUrl, expiresAt }` (۲۴ ساعت؛ `no-store`). (امنیت C1) شکل: `${APP_BASE_URL}/reset#t=<token>`. در `audit_log` بدون لینک |
| `PATCH /users/:id` | A | `{ displayName?, phone?, status?: 'active' \| 'disabled' }` | غیرفعال‌سازی و تغییر موبایل همه‌ی نشست‌ها را باطل می‌کنند (`user.phone_changed` در `audit_log`) |
| `PATCH /users/:id/role` | A | `{ role }` | برداشتن آخرین مدیر ← `409`. هنرجو نقش عوض نمی‌کند (`409`). همه‌ی نشست‌ها باطل |

(امنیت C5) **حذف حساب در 0.1 endpoint ندارد.** درخواست حذف از راه پیام به مربی می‌رسد و مدیر آن را با CLI `pnpm admin:erase-user` اجرا می‌کند (`data-model.md` بخش ۶-۲، ADR-0010). روی کاربری که `erasedAt` دارد، همه‌ی مسیرهای نوشتنی این بخش (`PATCH /users/:id`، `/role`، `/invite-link`، `/reset-link`) ← `409 CONFLICT`.

## ۴. هنرجو و پرونده (`students`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /students` | A، M | query: `q`، `stageId`، `mentorId` (فقط A)، `tag`، `platformId`، `health=green\|yellow\|red\|paused`، `lifecycle=active\|paused\|graduated\|dropped` (پیش‌فرض active+paused)، `cohort`، `sort=health\|lastActivity\|stageDays\|name`، cursor | `StudentListItem = { id, displayName, mentor:{id,displayName}, stage:{id,name,displayCode}, daysInStage, health:{status, reasons, churnRisk, snoozedUntil}, nextTask:{id,title,dueAt,overdue}, openTaskCount, overdueTaskCount, lastActivityAt, tags, primaryProfile:{platformName,url,headline} }` |
| `POST /students` | A؛ M اگر `mentorsCanInviteStudents` | `{ displayName, phone, mentorId?, stageId?, trackId?, primaryPlatformId?, tags?, initialNote? }`. M: `mentorId` نادیده و برابر خودش. پیش‌فرض `stageId` = اولین مرحله | `201 { student: StaffStudentDTO, inviteUrl, expiresAt }`. ثبت در کمتر از ۱ دقیقه (F2) با فقط نام و موبایل |
| `GET /students/:id` | A، M | — | `StaffStudentDTO`: همه‌ی فیلدهای `students` + سربرگ (`health`، `nextTask`، `daysInStage`، شمارش کارها، `primaryProfile`، `mentor`) |
| `PATCH /students/:id` | A، M | هر فیلد قابل‌ویرایش `students` جز `primaryMentorId`، `currentStageId` و `lifecycleStatus` (مسیرهای جدا دارند) + `ifUpdatedAt` | `StaffStudentDTO`؛ رویداد `student.updated` با فهرست فیلدها |
| `PUT /students/:id/mentor` | A | `{ mentorId, reason? }` | ADR-0004 بخش ۲ (انتقال یادآورها و سؤال‌های باز) |
| `PUT /students/:id/lifecycle` | A، M | `{ status: 'active' \| 'paused' \| 'graduated' \| 'dropped', pausedUntil?: 'YYYY-MM-DD', reason? }` | `paused` بدون `pausedUntil` ← `422`. یادآور سیستمی یک روز قبل از بازگشت |
| `GET /students/:id/timeline` | A، M | `types=note,stage,task,question,milestone,health,…`، cursor | `[{ kind: 'event' \| 'note', type, occurredAt, actor, data \| note }]` |
| `GET /students/:id/summary` | A، M در دامنه، یا M که `assignee` یک سؤال **باز** این هنرجوست | — | خلاصه‌ی کنار سؤال (F8): `{ displayName, stage, profiles[], openTasks[] }`. (امنیت C3) برای assignee خارج از دامنه فقط تا وقتی رشته‌ای با `status IN ('open','answered')` و `assigneeId = actor` هست؛ پس از آن `404` |
| `GET /me/student` | S | — | `SelfStudentDTO` (بدون سلامت، پرچم، برچسب‌ها و کوهورت) |
| `PATCH /me/student` | S | فقط فیلدهای فهرست سفید (`data-model.md` ۲-۳) | `SelfStudentDTO` |

### پروفایل‌های پلتفرم
| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /students/:id/profiles` | A، M | — | `ProfileDTO[]` |
| `GET /me/profiles` | S | — | `ProfileDTO[]` |
| `POST /students/:id/profiles` · `POST /me/profiles` | A، M · S | `{ platformId, kind, publicUrl?, headline?, rateAmount?, rateCurrency?, rateUnit?, status?, niche?, notes?, isPrimary? }` | `201 ProfileDTO`. `publicUrl` فقط `https://`. **فیلد رمز وجود ندارد** |
| `PATCH /profiles/:id` | A، M، S (مال خودش) | همان فیلدها | — |
| `DELETE /profiles/:id` | A، M، S (مال خودش) | — | حذف نرم |
| `POST /profiles/:id/approve` | A، M | — | `mentorApprovedAt` |
| `GET /profiles/:id/snapshots` · `POST /profiles/:id/snapshots` | A، M، S (مال خودش) | `{ headline?, bodyText, rateText? }` | — |

## ۵. مسیر، مرحله و کانبان (`path`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /stages` | * | — | `[{ id, displayCode, name, sortOrder, expectedDays, isOpenEnded, studentDescription, contentLinks }]` (فقط فعال‌ها؛ A با `?includeInactive=1`) |
| `POST /stages` | A | فیلدهای `stages` | — |
| `PATCH /stages/:id` | A | فیلدهای `stages` | تغییر `expectedDays` ← `health.sweep` فوری |
| `PUT /stages/order` | A | `{ stageIds: [...] }` | ترتیب جدید در یک تراکنش |
| `POST /stages/:id/deactivate` | A | — | اگر هنرجوی فعالی در این مرحله است ← `409` |
| `PUT /students/:id/stage` | A، M | `{ toStageId, kind: 'advance' \| 'skip_by_assessment' \| 'advance_with_exception' \| 'regress', note? }` | `{ student, suggestedTemplates: TaskTemplateDTO[] }`. `note` برای exception و regress الزامی. «یک کلیک» در UI = `advance` به مرحله‌ی بعد |
| `GET /students/:id/stage-history` | A، M | — | `[{ from, to, kind, note, actor, createdAt }]` |
| `GET /board` | A، M | `mentorId?` (A)، `tag?`، `health?` | `{ columns: [{ stage, students: [{ id, displayName, daysInStage, overExpected: 'none' \| 'warn' \| 'over', health }] }] }`. `overExpected`: بیش از `expectedDays` ← `warn`، بیش از ۲ برابر ← `over` (F3) |
| `GET /me/path` | S | — | `{ stages: [{ id, name, displayCode, state: 'passed' \| 'current' \| 'locked', contentLinks }], current, next }` |

## ۶. کارها، تحویل و بازبینی (`tasks`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /students/:id/tasks` | A، M | `status?`، `stageId?` | `StaffTaskDTO[]` با `overdue` و `overdueDays` |
| `GET /me/tasks` | S | `status?` | `StudentTaskDTO[]`؛ مرتب: معوق‌ها اول، بعد بر اساس `dueAt` (F4) |
| `POST /students/:id/tasks` | A، M | `{ title, description?, kind, submissionType, stageId?, requiredForGate?, priority?, dueDate: 'YYYY-MM-DD', reviewerId?, templateId?, profileId? }` | `201 StaffTaskDTO`. `dueDate` ← `due_at` = پایان آن روز تهران. (امنیت C3) `profileId` باید مال **همین** هنرجو و حذف‌نشده باشد؛ `reviewerId` کاربر فعال admin یا mentor؛ `stageId` و `templateId` فعال؛ وگرنه `422` |
| `POST /tasks/bulk` (Should) | A، M | `{ studentIds: [...], templateId? \| fields, dueDate }` | `201 { batchId, created: n }`. (امنیت C3) **همه‌ی** `studentIds` باید در دامنه باشند؛ اگر یکی نبود (یا ناموجود بود)، کل درخواست `422` و **هیچ** کاری ساخته نمی‌شود |
| `GET /tasks/:id` | A، M، S (مال خودش) | — | `StaffTaskDTO` یا `StudentTaskDTO`، همراه `submissions[]` و `review` هر نسخه و `extensions[]` |
| `PATCH /tasks/:id` | A، M | `{ title?, description?, priority?, reviewerId?, stageId?, requiredForGate? }` | تغییر مهلت از این مسیر **ممکن نیست**. (امنیت C3) `reviewerId` و `stageId` مثل ساخت کار بررسی می‌شوند |
| `POST /tasks/:id/extend` | A، M | `{ newDueDate, reason }` | `extensionCount += 1`؛ رویداد؛ بازمحاسبه‌ی سلامت |
| `POST /tasks/:id/cancel` | A، M | `{ reason }` | `INVALID_TRANSITION` اگر نهایی است |
| `POST /tasks/:id/start` | S | — | `open` ← `in_progress` |
| `POST /tasks/:id/submissions` | S | `{ bodyText?, links?: [{url,label}], attachmentIds?, platformId?, jobPostText?, proposalText?, profileText?, aiUseConsent?: boolean }` | `201 SubmissionDTO`. فقط از `open`، `in_progress` و `changes_requested`. برای `proposal_review`، `platformId` و `jobPostText` و `proposalText` الزامی‌اند. برای `checkbox` بدنه لازم نیست و کار مستقیم `accepted` می‌شود. اگر کار `profileId` دارد، `profile_snapshot` ساخته می‌شود (پروفایل از خود کار خوانده می‌شود، نه از ورودی). (امنیت C4) `attachmentIds` فقط پیوست‌های `pending` خود هنرجو؛ وصل کردن اتمی در همان تراکنش (`data-model.md` ۲-۵)؛ وگرنه `422` |
| `POST /submissions/:id/review` | A، M | `{ outcome: 'accepted' \| 'changes_requested', feedbackText, score?: 1..5 }` | فقط آخرین نسخه و فقط وقتی کار `submitted` است. `changes_requested` ← `revisionCount += 1` |
| `PATCH /reviews/:id` | A؛ M (امنیت C3: بازبین همان بازبینی **و** هنرجو در دامنه‌ی فعلی) | `{ feedbackText?, score? }` | فقط تا ۲۴ ساعت. بیرون از دامنه ← `404` |
| `GET /review-queue` | A، M | `mentorId?` (A) | کارهای `submitted` در دامنه، مرتب بر `lastSubmittedAt` و با `slaRemainingHours` |
| `GET /task-templates` | A، M | `stageId?` | — |
| `POST /task-templates` · `PATCH /task-templates/:id` | A | فیلدهای `task_templates` | — |

**DTO هنرجو** (`StudentTaskDTO`): `{ id, title, description, kind, submissionType, stage, priority, status, dueAt, overdue, overdueDays, submissions: [{ version, createdAt, bodyText, links, attachments, review: { outcome, feedbackText, score, createdAt } }] }`. **بدون** `reviewerId`، `createdBy`، `revisionCount` و `extensionCount`.

## ۷. یادداشت و تایم‌لاین (`timeline`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /students/:id/notes` | A، M | `visibility?`، `kind?`، cursor | `NoteDTO[]` |
| `POST /students/:id/notes` | A، M | `{ kind?, visibility?: 'internal' \| 'shared', body, tags?, occurredAt? }` | پیش‌فرض `internal` |
| `PATCH /notes/:id` | A؛ M (امنیت C3: نویسنده **و** هنرجو در دامنه‌ی فعلی) | `{ body?, tags?, visibility?, kind?, occurredAt? }` | بیرون از دامنه (مثلاً مشاور سابق) ← `404`. تغییر `visibility` از `internal` به `shared` در `audit_log(note.visibility_changed)` |
| `DELETE /notes/:id` | A؛ M (نویسنده **و** در دامنه) | — | حذف نرم |
| `GET /me/shared-notes` | S | cursor | `SharedNoteDTO = { id, kind, body, occurredAt, author: { displayName } }`. **تنها مسیری که هنرجو یادداشت می‌بیند** |

## ۸. یادآور و «امروز» (`reminders`، `today`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /reminders` | A، M | `scope=today\|upcoming\|done`، `ownerId?` (A؛ M فقط خودش) | `ReminderDTO[]` |
| `POST /reminders` | A، M | `{ text, dueAt \| dueDate, studentId?, ownerId? }` | M: `ownerId` = خودش و `studentId` در دامنه. A: `ownerId` هر کاربر **فعال admin یا mentor** (امنیت C3: نه هنرجو)؛ وگرنه `422` |
| `PATCH /reminders/:id` | مالک، A | `{ text?, dueAt? }` | — |
| `POST /reminders/:id/done` | مالک، A | — | — |
| `POST /reminders/:id/snooze` | مالک، A | `{ days: 1 \| 3 \| 7 }` | F6 |
| `DELETE /reminders/:id` | مالک، A | — | `cancelled` |
| `GET /today` | A، M | `mentorId?` (A؛ پیش‌فرض: همه) | `{ reminders: ReminderDTO[], reviewQueue: [...], unansweredQuestions: [...], stuckStudents: StudentListItem[], waitingOnUs: [{ kind: 'review' \| 'question' \| 'red_no_action', studentId, refId, since, slaHours, elapsedHours, breached }], generatedAt }`. هر مورد شناسه‌ی لازم برای «یک کلیک تا پرونده یا کار» را دارد (F6) |
| `GET /stuck` | A، M | `mentorId?`، `level=yellow\|red`، `includeSnoozed=0\|1` | `StudentListItem[]`، مرتب: قرمز ← زرد، سپس `statusSince` قدیمی‌تر. بدون `paused`، `graduated` و `dropped` (F7) |

## ۹. سلامت و پرچم (`health`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /students/:id/health` | A، M | — | `{ status, reasons, churnRisk, statusSince, redSince, computedAt, snoozedUntil, snoozeReason }` |
| `PUT /students/:id/health/snooze` | A، M | `{ until: 'YYYY-MM-DD', reason }` | — |
| `DELETE /students/:id/health/snooze` | A، M | — | — |
| `GET /students/:id/flags` | A، M | `active=1` | — |
| `POST /students/:id/flags` | A، M | `{ category, level, note?, expiresAt? }` | بازمحاسبه‌ی سلامت |
| `POST /flags/:id/clear` | A، M | — | — |
| `POST /admin/health/recompute` | A | `{ studentId? }` | برای اشکال‌زدایی؛ بدون `studentId` = sweep کامل |

## ۱۰. سؤال و پاسخ (`questions`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /questions` | A، M | `status?`، `awaiting=team\|student`، `assigneeId?` (A)، `studentId?`، cursor | در دامنه **یا** `assignee` = خودش. هر ردیف `slaRemainingHours` دارد |
| `GET /me/questions` | S | `status?` | `StudentQuestionDTO[]` + `expectedResponseText` |
| `POST /me/questions` | S | `{ subject, body, links?, attachmentIds?, taskId?, priority? }` | `201`. `assignee` = مشاور اصلی؛ اگر نیست، اولین مدیر. (امنیت C3) `taskId` باید کار **خود** هنرجو باشد؛ `attachmentIds` فقط پیوست‌های `pending` خودش (C4)؛ وگرنه `422` |
| `GET /questions/:id` | A، M (دامنه یا assignee)، S (مال خودش) | — | رشته + پیام‌ها. برای A و M، `studentSummary` هم دارد |
| `POST /questions/:id/messages` | A، M، S (مال خودش) | `{ body, links?, attachmentIds?, cannedResponseId? }` | گذارهای `data-model.md` ۲-۸. (امنیت C3/C4) `attachmentIds` فقط پیوست‌های `pending` خود فرستنده؛ `cannedResponseId` فعال |
| `POST /questions/:id/close` | A، M، S (مال خودش) | — | — |
| `PUT /questions/:id/assignee` | A | `{ assigneeId }` | (امنیت C3) `assigneeId` کاربر فعال admin یا mentor؛ وگرنه `422` |
| `GET /canned-responses` | A، M | — | — |
| `POST /canned-responses` · `PATCH /canned-responses/:id` | A | `{ title, body, category, isActive }` | — |

## ۱۱. check-in هفتگی (`checkins`، Should)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /me/checkins/current` | S | — | `{ weekStart, open: boolean, existing?: CheckinDTO, weekSummary: { tasksSubmitted, tasksAccepted } }` |
| `POST /me/checkins` | S | `{ activityText?, blocker?, mood: 1..5, nextWeekPlan?, needsHelp: boolean }` | `201`. اگر `needsHelp`، یک سؤال با `source=checkin` ساخته می‌شود. ارسال دوم در همان هفته ← `409` |
| `GET /students/:id/checkins` | A، M | cursor | — |

اگر `settings.checkin.enabled = false` باشد، این مسیرها `404` می‌دهند.

## ۱۲. نقطه‌ی عطف (`milestones`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /milestone-types` | * | — | — |
| `POST /milestone-types` · `PATCH /milestone-types/:id` | A | فیلدهای `milestone_types` | — |
| `GET /students/:id/milestones` | A، M | — | — |
| `GET /me/milestones` | S | — | فقط `approved` و `proposed` خودش |
| `POST /students/:id/milestones` | A، M | `{ typeId, occurredOn, platformId?, amount?, currency?, evidenceText?, attachmentIds? }` | مستقیم `approved` |
| `POST /me/milestones` | S | همان، **بدون** `status` (کلید اضافه ← `422`) | `proposed`. اگر نوع `requiresEvidence` است و نه متن و نه پیوست دارد ← `422`. (امنیت C3/C4) `typeId` و `platformId` فعال؛ `attachmentIds` فقط پیوست‌های `pending` خودش |
| `POST /milestones/:id/approve` | A، M | — | تأیید تکراری برای نوع `uniquePerStudent` ← `409` |
| `POST /milestones/:id/reject` | A، M | `{ reason }` | — |
| `GET /dashboard/north-star` | A | `from`، `to` (روزهای `YYYY-MM-DD`؛ UI ماه شمسی جاری را به این بازه تبدیل می‌کند) | `{ approvedInRange, approvedTotal, medianDaysToFirst, labeledProposalCount }`. `labeledProposalCount` = تعداد جفت‌های «پروپوزال + نقد» با رضایت (G4) |

## ۱۳. فهرست‌ها، تنظیمات، ورود و خروج (`catalog`، `admin`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `GET /platforms` · `GET /tracks` | * | — | فقط فعال‌ها (A با `includeInactive`) |
| `POST /platforms` · `PATCH /platforms/:id` | A | `{ name, trackId?, sortOrder?, isActive? }` | افزودن پلتفرم بدون تغییر کد (F2) |
| `GET /settings` | A | — | همه‌ی کلیدها |
| `GET /settings/public` | * | — | فقط `questions.expectedResponseText` و `checkin.enabled` |
| `PUT /settings/:key` | A | `value` طبق schema آن کلید | `{ key, value, version }`. تغییر `health.rules` ← sweep فوری. `audit_log` |
| `GET /exports/students.csv` · `tasks.csv` · `milestones.csv` (Should) | A | — | CSV با UTF-8 BOM؛ تاریخ‌ها **شمسی و میلادی** هر دو. `audit_log` |
| `POST /imports/students` (Should) | A | multipart CSV/XLSX + `dryRun=true\|false` | `{ rows: [{ line, ok, errors[], studentId?, inviteUrl? }] }`. ستون‌ها: نام، موبایل، مشاور (موبایل یا نام)، مرحله (`displayCode`)، شاخه، پلتفرم اصلی، لینک و تیتر پروفایل، آخرین کار و مهلت، یادداشت (`progress-tracking.md` ۲-۹). اول `dryRun` |

## ۱۴. پیوست (`files`)

| متد و مسیر | نقش | ورودی | خروجی و نکته |
|---|---|---|---|
| `POST /attachments` | * | multipart: `file` (jpeg/png/webp، حداکثر ۵ مگابایت) | `201 { id, mimeType, sizeBytes, width, height }` با `status=pending`. با فرستادن `attachmentIds` در تحویل، پیام یا نقطه‌ی عطف به آن وصل می‌شود. (امنیت C4) خطاها: حجم بیشتر ← `413` **پیش از** بافر شدن بدنه؛ نوع (تشخیص از **محتوا**، نه `Content-Type` یا پسوند) غیر از jpeg/png/webp ← `415`؛ بیش از ۴۰ مگاپیکسل ← `422`؛ ۲۰ پیوست `pending` یا ۱۰۰ آپلود در ۲۴ ساعت گذشته ← `429`. فایل با `.rotate()` و بدون متادیتا بازکدگذاری و حداکثر ۴۰۹۶ پیکسل می‌شود؛ اصل فایل ذخیره نمی‌شود. جزئیات: `data-model.md` ۲-۵ |
| `GET /attachments/:id` | هر کس که به والد دسترسی دارد (از `loadInScope`)؛ یا آپلودکننده تا وقتی `pending` است | — | جریان فایل از سرور (بدون لینک مستقیم به storage). (امنیت C4) سرآیندها: `Content-Type` از قالب ذخیره‌شده؛ `X-Content-Type-Options: nosniff`؛ `Content-Disposition: inline; filename*=UTF-8''<نام پاک‌شده>`؛ `Content-Security-Policy: default-src 'none'; img-src 'self'; sandbox`؛ **`Cache-Control: private, no-cache`** (نه فقط `private`، تا پس از خروج روی دستگاه مشترک از cache دیده نشود). بیرون از دسترسی ← `404` |

**وصل کردن پیوست (امنیت C4):** هر endpointی که `attachmentIds` می‌گیرد (تحویل، پیام سؤال، نقطه‌ی عطف، از جمله `POST /students/:id/milestones` کارکنان) پیوست‌ها را **فقط** با `UPDATE … WHERE id = ANY($ids) AND status = 'pending' AND uploaded_by = $actor RETURNING id` و درون تراکنش ساخت والد وصل می‌کند. اگر تعداد ردیف‌ها با تعداد شناسه‌ها برابر نبود ← rollback و `422 VALIDATION_FAILED { fields: { attachmentIds } }`. حداکثر ۱۰ پیوست در هر درخواست.

## ۱۵. داخلی و عملیاتی

| متد و مسیر | دسترسی | نکته |
|---|---|---|
| `GET /healthz` (بیرون از `/api/v1`) | عمومی | `{ ok, db: 'ok', lastHealthSweepAt, version }`؛ بدون داده‌ی حساس |
| `POST /api/internal/jobs/:name` | سرآیند `X-Job-Secret` | فقط وقتی `JOBS_MODE=http-trigger` (ADR-0007)؛ وگرنه `404` |

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
`/api/v1/opportunities/**` (F12)، `/api/v1/ai/runs/**` (F13 تا F15؛ ADR-0006)، `/api/v1/me/quota` (F17)، `/api/v1/me/notification-preferences` (F18)، `/api/v1/auth/otp/**` (F16). مسیرهای 0.1 تغییر نمی‌کنند.

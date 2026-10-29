# ADR-0012 — مدل برنامه: قالب، اجرا، عضویت، بسته، جلسه و هدف

- **وضعیت:** پذیرفته‌شده (پیاده‌سازی expand: اسپرینت ۳ Coach Office؛ تفاوت‌ها در بخش آخر)
- **تاریخ:** ۶ آبان ۱۴۰۵ (2026-10-28)
- **منبع الزامات:** `docs/08-saas-evolution/prd-coach-office.md` بخش ۳ و ۴؛ سند بنیان‌گذار بند ۴-۲ تا ۴-۴، ۷، ۸، ۹؛ پاسخ‌های بنیان‌گذار (Q5، «پلن» = بسته‌ی قابل‌فروش، زمان‌بندی ساده در MVP)
- **وابسته به:** ADR-0011 (همه‌ی جدول‌ها `organization_id` دارند و کلید خارجی ترکیبی می‌گیرند)
- **اثر روی ADRهای قبلی:** مدل «یک مسیر سراسری + مرحله‌ی جاری روی هنرجو + مربی اصلی» (data-model.md 2-2 و 2-3، ADR-0004 بند ۱) با این مدل جایگزین می‌شود. منطق گیت مرحله، تحویل نسخه‌دار، بازبینی و سلامت **حفظ** می‌شود؛ فقط کلیدشان عوض می‌شود.

## زمینه
امروز:
- `learning_paths` یک ردیف پیش‌فرض دارد؛ `stages` مراحل آن است؛ `task_templates` کارهای پیشنهادی هر مرحله.
- هر هنرجو یک `current_stage_id` و یک `primary_mentor_id` دارد؛ `mentor_assignments` فقط تاریخچه است (`secondary` و `backup` استفاده نمی‌شوند).
- کار مستقیم به `student_id` وصل است و یک `reviewer_id` دارد.
- «cohort» فقط یک فیلد متنی آزاد است. جلسه فقط یک نوع یادداشت (`notes.kind = 'session'`) است، بدون زمان‌بندی.

لازم است: چند برنامه و قالب قابل‌استفاده‌ی دوباره؛ اجرای گروهی و تک‌نفره روی یک هسته؛ هنرجو در چند برنامه با مشاوران مختلف؛ تغییر قالب بدون اثر روی اجراهای فعال؛ بسته‌های قابل‌فروش (تک‌به‌تک با سهمیه‌ی جلسه، یا دوره‌ای)؛ جلسه‌ی ساده؛ قالب خصوصی مشاور با تأیید مدیر.

## گزینه‌ها
| موضوع | گزینه‌ها | انتخاب |
|---|---|---|
| تغییر قالب و اجراهای فعال | (الف) جدول نسخه‌ی قالب؛ (ب) کپی گره‌های قالب هنگام ساخت اجرا | **ب**: همان نتیجه با یک جدول کمتر و بدون منطق «کدام نسخه»؛ قالب می‌تواند `revision` شمارشی داشته باشد برای نمایش |
| cohort | (الف) جدول جدای cohort داخل اجرا؛ (ب) هر اجرای گروهی یک cohort است | **ب** برای MVP؛ زیرگروه داخل اجرا به P2 |
| تک‌به‌تک | (الف) سیستم جدا؛ (ب) نوعی اجرا با `kind = 'one_on_one'` | **ب** (بند ۴-۲ سند: یک هسته) |
| رابطه‌ی مشاور و هنرجو | (الف) ستون مربی روی هنرجو؛ (ب) جدول تخصیص در سطح عضویت + کادر اجرا | **ب** |
| بسته و قیمت | (الف) جدول محصول و قیمت؛ (ب) سهمیه و اعتبار روی قالب، فروش بیرون از سیستم | **ب** (پرداخت بیرون از دامنه، تصمیم ۱۴۰۵/۰۷/۲۷) |

## تصمیم

### ۱. جدول‌ها
```
program_templates
  id, organization_id,
  kind text ('program' | 'one_on_one'),
  title, description, source_locale ('fa'),
  status text ('draft' | 'published' | 'archived'),
  visibility text ('private' | 'pending_approval' | 'organization'),
  owner_membership_id, approved_by, approved_at,
  -- بسته (همه اختیاری):
  session_quota int, session_minutes int, validity_days int, duration_weeks int,
  extensions jsonb ('{"freelancing": true}' ...),   -- افزونه‌ها، مثل بخش ۸
  revision int, created_at, updated_at

curriculum_nodes                     -- محتوای قالب
  id, organization_id, template_id,
  parent_id (null = فاز)، node_type ('phase' | 'lesson' | 'assignment' | 'checklist' | 'resource' | 'milestone'),
  title, body, content_links jsonb, sort_order,
  is_required bool, is_gate bool (فقط فاز: عبور با تأیید مشاور),
  expected_days int, is_open_ended bool (فاز؛ همان رفتار stages فعلی),
  due_offset_days int (تکلیف: نسبت به شروع اجرا یا ورود به فاز),
  submission_type (تکلیف؛ همان enum فعلی), milestone_type_id (نقطه‌ی عطف),
  checklist_items jsonb

program_runs
  id, organization_id, template_id (null برای تک‌به‌تکِ بدون قالب),
  kind ('program' | 'one_on_one'), mode ('group' | 'individual'),
  title, status ('draft' | 'active' | 'completed' | 'archived'),
  starts_on date, ends_on date, source_locale,
  template_revision int, created_by, created_at, updated_at

run_nodes                            -- کپی curriculum_nodes در لحظه‌ی ساخت اجرا (snapshot)
  همان ستون‌های curriculum_nodes + run_id + source_node_id

run_staff
  run_id, membership_id, role ('manager' | 'mentor'), started_at, ended_at

enrollments                          -- عضویت هنرجو در یک اجرا
  id, organization_id, run_id, mentee_membership_id,
  status ('active' | 'paused' | 'completed' | 'dropped'), paused_until,
  current_phase_node_id (run_nodes), phase_entered_at,
  session_quota int, valid_until date,  -- کپی از قالب در لحظه‌ی ثبت؛ مدیر می‌تواند تغییر دهد
  enrolled_by, enrolled_at, completed_at
  UNIQUE (run_id, mentee_membership_id)

enrollment_mentors
  enrollment_id, membership_id, role ('primary' | 'secondary'), started_at, ended_at, assigned_by
  -- حداکثر یک primary فعال

node_completions                     -- درس، منبع و چک‌لیست که «انجام شد» می‌خورند
  enrollment_id, run_node_id, completed_at, completed_by, checklist_state jsonb

mentoring_sessions
  id, organization_id, run_id, enrollment_id (null = جلسه‌ی گروهی کل اجرا),
  mentor_membership_id, scheduled_at timestamptz, duration_minutes,
  location_text (لینک یا محل؛ لینک فقط https), status ('scheduled' | 'held' | 'cancelled' | 'no_show'),
  counts_toward_quota bool, cancelled_reason, created_by, created_at, updated_at

goals
  id, organization_id, enrollment_id, title, description, target_date,
  status ('open' | 'achieved' | 'dropped'), achieved_at, approved_by
```

**تغییر جدول‌های موجود:**
- `tasks`: `enrollment_id` و `run_node_id` (اختیاری برای کارهای آزاد) و `session_id` (اختیاری: «اقدام بعدی» یک جلسه). `student_id` تا گام contract می‌ماند. `reviewer_id` می‌ماند (پیش‌فرض: مشاور primary آن عضویت).
- `stage_transitions`: `enrollment_id`، و مرحله‌ها به `run_nodes` (فاز) اشاره می‌کنند.
- `milestones`: `enrollment_id` اختیاری (نقطه‌ی عطف همچنان مال هنرجو است؛ اتصال به برنامه برای پیشرفت).
- `notes`، `question_threads`، `checkins`، `reminders`: `enrollment_id` **اختیاری** (پرونده‌ی هنرجو در سازمان کافی است).
- `students`: «پرونده‌ی هنرجو در سازمان» می‌شود. `primary_mentor_id`، `current_stage_id`، `stage_entered_at` و `cohort` در گام contract حذف می‌شوند. فیلدهای ویژه‌ی فریلنسری (نیچ، انگلیسی، ساعت در هفته و …) می‌مانند و فقط وقتی افزونه‌ی فریلنسری سازمان روشن است در فرم دیده می‌شوند.

### ۲. قالب و تأیید (پاسخ Q5)
- **admin/owner:** قالب با `visibility = 'organization'` می‌سازد و منتشر می‌کند.
- **mentor:** قالب `private` می‌سازد و فقط برای هنرجوهای خودش اجرا می‌سازد. «ارسال برای استفاده‌ی سازمانی» آن را `pending_approval` می‌کند؛ admin تأیید (`organization`) یا رد (`private` با دلیل) می‌کند.
- ویرایش قالب منتشرشده `revision` را یک واحد بالا می‌برد و **روی اجراهای موجود اثری ندارد** (snapshot). مدیر می‌تواند به‌صورت صریح «اعمال تغییرات روی اجرای X» را بزند (P2؛ در MVP نیست).
- «تکثیر قالب» و «بایگانی» مجازند؛ حذف فقط برای پیش‌نویسی که هیچ اجرایی ندارد.

### ۳. اجرا، گروه و تک‌نفره
- **اجرای گروهی (cohort):** چند enrollment، کادر مشترک در `run_staff`، جلسه‌ی گروهی با `enrollment_id = null`.
- **اجرای تک‌نفره از یک قالب برنامه:** همان مسیر برای یک هنرجو.
- **تک‌به‌تک (`kind = 'one_on_one'`):** قالب اختیاری؛ محور آن هدف‌ها، جلسه‌ها و اقدام‌ها است.
- ساخت اجرا: admin/owner هر نوع؛ mentor فقط اجرای تک‌نفره یا تک‌به‌تک از قالب‌هایی که می‌بیند، و خودش `run_staff.mentor` می‌شود. (اگر تکانش بخواهد مشاورها گروه هم بسازند، یک تنظیم سازمانی.)
- «اختصاص تکلیف به کل گروه» = ساخت یک کار برای هر enrollment فعال از یک `run_node` (همان الگوی `batch_id` فعلی).

### ۴. بسته‌ها (پلن‌های قابل‌فروش)
- بسته = قالب با `session_quota`، `session_minutes`، `validity_days`.
- ثبت هنرجو در بسته = ساخت یک اجرای تک‌نفره یا تک‌به‌تک + enrollment، که سهمیه و `valid_until` را از قالب **کپی** می‌کند.
- مصرف = تعداد جلسه‌های این enrollment با `status IN ('held', 'no_show') AND counts_toward_quota`. آیا «غیبت» از سهمیه کم شود یک تنظیم سازمانی است (پیش‌فرض: بله).
- پایان اعتبار یا سهمیه **ثبت جلسه را قفل نمی‌کند**؛ فقط هشدار می‌دهد و در داشبورد مدیر دیده می‌شود (فروش تمدید، بیرون از سیستم).
- **هیچ ستون قیمت، سفارش یا پرداختی وجود ندارد.** وقتی مدل درآمد مشخص شد، جدول سفارش به `enrollments` اشاره خواهد کرد؛ این ساختار جایش را باز گذاشته است.

### ۵. دسترسی مشاور (جایگزین `primary_mentor_id` در ADR-0004)
مشاور m هنرجوی s را در سازمان o می‌بیند اگر یکی از این‌ها درست باشد:
1. m در `enrollment_mentors` فعالِ یکی از enrollmentهای s باشد؛
2. m در `run_staff` فعالِ اجرایی باشد که s در آن enrollment دارد؛
3. تنظیم سازمانی `access.mentorScope = 'all'` باشد.

دامنه به‌صورت یک subquery `EXISTS` در `scopeCondition` پیاده می‌شود (ایندکس روی `enrollment_mentors(membership_id) WHERE ended_at IS NULL` و `run_staff(membership_id) WHERE ended_at IS NULL`). مدیر برنامه (`run_staff.role = 'manager'`) هنرجوهای همان اجرا را می‌بیند و می‌تواند کار، جلسه و تخصیص آن اجرا را مدیریت کند. داده‌های در سطح پرونده (یادداشت بدون enrollment، سؤال‌ها) برای هر مشاوری که طبق قاعده‌های بالا هنرجو را می‌بیند قابل‌دسترسی است، با رعایت سطح دید یادداشت (ADR-0011 بند ۶).

### ۶. پیشرفت (تابع خالص، یک منبع حقیقت)
```
برنامه‌محور:
  progress(enrollment) = تکمیل‌شده(الزامی) / کل(الزامی)  در run_nodes این اجرا (به‌جز فازها)
    تکلیف     → تکمیل اگر task.status = 'accepted'  (submitted کافی نیست)
    درس/منبع → تکمیل اگر ردیف node_completions دارد
    چک‌لیست   → تکمیل اگر همه‌ی آیتم‌ها تیک خورده‌اند
    نقطه‌ی عطف → تکمیل اگر milestone با این نوع برای هنرجو approved است
  اگر کل(الزامی) = 0 → پیشرفت «نامشخص» (نه ۰٪ و نه ۱۰۰٪)

تک‌به‌تک:
  progress = goals.achieved / (goals - dropped)؛ مصرف جلسه جدا: used / session_quota
```
داشبوردها، خروجی‌ها و گزارش‌ها **فقط** همین تابع را صدا می‌زنند. سلامت (ADR-0005) جدا می‌ماند؛ قاعده‌ها بر پایه‌ی enrollmentهای فعال هنرجو محاسبه و بدترین نتیجه برای هنرجو ثبت می‌شود (R-STALL بر اساس `phase_entered_at` هر enrollment).

### ۷. جلسه‌ها (زمان‌بندی ساده)
- ثبت، ویرایش و لغو: مشاورِ در دامنه یا admin. هنرجو فقط جلسه‌های خودش (و گروهی‌های اجرای خودش) را می‌بیند.
- زمان در UTC ذخیره و با منطقه‌ی زمانی سازمان نمایش داده می‌شود (ADR-0013).
- پس از جلسه: وضعیت (`held`/`no_show`)، یادداشت (با سطح دید)، و «اقدام بعدی» = کار با `session_id`.
- نمایش در «امروز»، داشبورد مشاور و داشبورد هنرجو؛ یادآور داخلی ۲۴ ساعت قبل برای مشاور.
- **نیست:** همگام‌سازی تقویم، رزرو با ساعت آزاد، تشخیص تداخل پیشرفته (فقط هشدار ساده‌ی هم‌پوشانی برای یک مشاور)، فایل ics (P2).

### ۸. افزونه‌ی فریلنسری
`platforms`، `platform_profiles`، `profile_snapshots`، نوع‌های تحویل `proposal_review` و `profile_review`، و North Star «اولین قرارداد» حذف نمی‌شوند. با `program_templates.extensions.freelancing` و یک تنظیم سازمانی روشن می‌شوند. برای تکانش روشن است.

### ۹. مهاجرت داده‌ی موجود
1. `learning_paths` پیش‌فرض → یک `program_template` («منتورینگ فریلنسری»، `kind = 'program'`، `published`، `organization`، افزونه‌ی فریلنسری روشن).
2. هر `stage` → یک گره `phase` (همان ترتیب، `expected_days`، `is_open_ended`، `content_links`، توضیح هنرجو). هر `task_template` → یک گره `assignment` زیر فاز خودش.
3. یک `program_run` («اجرای پیش‌فرض»، گروهی، `active`) با `run_nodes` کپی‌شده.
4. برای هر هنرجو یک `enrollment` با `current_phase_node_id` نگاشت‌شده از `current_stage_id` و همان `stage_entered_at`؛ وضعیت از `lifecycle_status`.
5. `primary_mentor_id` → `enrollment_mentors (primary)`؛ تاریخچه‌ی `mentor_assignments` حفظ می‌شود.
6. `tasks.enrollment_id`، `stage_transitions.enrollment_id` و `run_node_id` (برای کارهای از قالب) پر می‌شوند.
7. `students.cohort` (متن آزاد) به `tags` اضافه می‌شود تا از دست نرود؛ ستون در contract حذف می‌شود.
8. بعد از migration، همه‌ی تست‌های فعلی path، tasks، health و today باید بدون تغییر رفتار سبز باشند.

## پیامدها
**مثبت:** یک هسته برای گروهی، تک‌نفره و تک‌به‌تک؛ بسته بدون ورود به پرداخت؛ تغییر قالب بی‌خطر؛ دسترسی مشاور از رابطه‌ی واقعی، نه یک ستون.

**منفی:** بزرگ‌ترین migration پروژه (اسپرینت ۳)؛ کانبان، «امروز»، سلامت و North Star باید روی enrollment بازنویسی شوند؛ query دامنه‌ی مشاور با `EXISTS` سنگین‌تر از مقایسه‌ی یک ستون است (با ایندکس برای چند هزار هنرجو کافی است؛ اندازه‌گیری در اسپرینت ۶).

**تست الزامی:** تست migration با کپی داده‌ی واقعی؛ تابع پیشرفت (جدول حالت‌ها)؛ ماتریس دسترسی با سه حالت مشاور (مستقیم، کادر اجرا، همه)؛ snapshot (ویرایش قالب، اجرای قبلی تغییر نکند)؛ شمارش سهمیه‌ی جلسه؛ قالب خصوصی مشاور برای مشاور دیگر دیده نشود.

## تطبیق با پیاده‌سازی (اسپرینت ۳ Coach Office، ۱۴۰۵/۰۸/۰۶)
این بخش «expand» مدل است: جدول‌های تازه کنار مدل 0.1 ساخته شده‌اند و مسیر قدیمی همچنان منبع حقیقت هنرجوهای موجود است. حذف ستون‌های قدیمی (contract) و بازنویسی کانبان، «امروز» و سلامت روی enrollment کار اسپرینت‌های بعد است.

**ساخته‌شده (مهاجرت `0008_programs`، ماژول `src/modules/programs`):**
- جدول‌های `program_templates`، `curriculum_nodes`، `program_runs`، `run_nodes`، `run_staff`، `enrollments` و `enrollment_transitions`؛ جدول‌های فرزند `organization_id` را با همان trigger `set_organization_id` (ADR-0011) از والد می‌گیرند و trigger جدا جلوی enrollment هنرجوی سازمان دیگر را می‌گیرد.
- قالب: ساخت، ویرایش جزئیات و بسته، فاز و فعالیت (درس، تکلیف، چک‌لیست، منبع، نقطه‌ی عطف)، ترتیب، انتشار، بایگانی و برگرداندن، کپی، حذف پیش‌نویس بدون اجرا؛ مشاور: قالب خصوصی، «فرستادن برای سازمان»، تأیید یا رد مدیر با دلیل (Q5). ویرایش قالب منتشرشده `revision` را بالا می‌برد.
- اجرا: از قالب منتشرشده با کپی کامل گره‌ها (`run_nodes.source_node_id`، `template_revision`)، یا تک‌به‌تک بدون قالب؛ گروهی (فقط مدیر) و تک‌نفره (یک جای فعال)؛ وضعیت draft → active → completed و بایگانی؛ کادر اجرا (مدیر اجرا، مشاور). اجرا هنگام ساخت `active` است.
- عضویت: ثبت گروهی یا تکی، کپی `session_quota` و `valid_until` (امروزِ منطقه‌ی سازمان + `validity_days`)، توقف (با «تا تاریخ»)، ادامه، پایان، انصراف و فعال‌سازی دوباره؛ تغییر فاز با همان قاعده‌های تغییر مرحله (`checkTransition`: عبور یکی‌یکی، پرش با ارزیابی، استثنا و برگشت با یادداشت).
- صفحه‌ها (کاملاً fa/en): «برنامه‌ها» (`/programs`)، ویرایشگر قالب، صفحه‌ی اجرا، «برنامه‌های من» برای هنرجو (`/my/programs`؛ فاز قفل فقط عنوان دارد).
- ۲۱ مسیر API تازه در manifest و ماتریس دسترسی.

**تفاوت با متن بالا (عمداً):**
- **کلید افراد:** به‌جای `*_membership_id` از شناسه‌ی کاربر استفاده شد (`owner_id`، `run_staff.user_id`، `enrollments.student_id` → `students.user_id`)؛ هر کاربر در هر سازمان یک عضویت دارد و همه‌ی کد فعلی (دامنه، ممیزی، سرویس‌ها) با شناسه‌ی کاربر کار می‌کند. سازمان هر ردیف را `organization_id` تعیین می‌کند.
- **دامنه‌ی مشاور هنوز `students.primary_mentor_id` است** (بند ۵ اجرا نشد): مشاور اجرایی را می‌بیند که در کادرش است یا هنرجوی خودش در آن ثبت شده؛ در اجرایی که فقط هنرجوی خودش در آن است، فقط همان هنرجوها را می‌بیند. `enrollment_mentors` ساخته نشد.
- **`enrollment_transitions`** (جدول تازه) تاریخچه‌ی تغییر فاز اجراهای تازه است؛ `stage_transitions` دست نخورد.
- **پل مسیر قدیمی (trigger، نه کپی یک‌باره):** تابع `ensure_legacy_program(org)` (idempotent) برای هر سازمان قالب «منتورینگ فریلنسری» (منتشرشده، سازمانی، افزونه‌ی فریلنسری)، یک اجرای گروهی فعال و برای هر هنرجو یک enrollment می‌سازد؛ مهاجرت ۰۰۰۸ و seed (پس از هر `db:migrate` و `org:create`) آن را صدا می‌زنند. trigger روی `stages` فازهای قالب و اجرای قدیمی را هم‌زمان نگه می‌دارد و trigger روی `students` (مرحله، زمان ورود، وضعیت چرخه) enrollment قدیمی را؛ `graduated` → `completed`. `task_templates` فقط یک بار به گره تکلیف تبدیل می‌شوند.
- **قاعده‌های اجرای قدیمی:** قالبش فقط‌خواندنی است (کپی و اجرا آزاد)؛ در اجرایش ثبت، تغییر وضعیت و کادر بسته است (از پرونده‌ی هنرجو انجام می‌شود) و تغییر فاز همان `changeStage` مسیر است، پس `students.current_stage_id`، کانبان و سلامت همان‌طور کار می‌کنند. معیار پذیرش «هنرجوی فعلی همان مرحله و همان کارها را می‌بیند» به همین دلیل برقرار است (تست `programs.test.ts`).
- **ساخت اجرای گروهی برای مشاور** فعلاً ۴۰۳ است (تنظیم سازمانی بند ۳ ساخته نشد).

**مانده برای اسپرینت‌های بعد:** `enrollment_mentors` و دامنه‌ی بند ۵؛ `node_completions` و تابع پیشرفت (بند ۶)؛ `mentoring_sessions` و `goals`؛ `tasks.enrollment_id` و `run_node_id` (کار از گره، «اختصاص به کل گروه»)؛ `milestone_type_id` روی گره‌ی نقطه‌ی عطف؛ پیوندهای محتوا در ویرایشگر (API دارد، فرم ندارد)؛ «اعمال تغییرات قالب روی اجرای X» (P2)؛ انتقال `cohort` به برچسب‌ها؛ گام contract (حذف `current_stage_id`، `primary_mentor_id`، `stage_entered_at`، `cohort`).

**تست:** `tests/integration/programs.test.ts` (۱۴ تست: پل مسیر قدیمی، قالب ۸ هفته‌ای در دو اجرای گروهی و تک‌نفره، ثابت ماندن اجرا پس از ویرایش قالب، قاعده‌های فاز، جای تک‌نفره، وضعیت اجرا، حذف پیش‌نویس، تک‌به‌تک، قالب خصوصی مشاور و تأیید/رد، اجرای مشاور، کادر، جداسازی سازمان)، به‌اضافه‌ی ماتریس دسترسی برای ۲۱ مسیر تازه.


## تطبیق با پیاده‌سازی (اسپرینت ۴ Coach Office، ۱۴۰۵/۰۸/۰۷)
- **`enrollment_mentors`** (نقش `primary|secondary`، `started_at`/`ended_at`، `assigned_by`، `reason`) با حداکثر یک مشاور اصلی فعال برای هر عضویت (unique index جزئی). مهاجرت `0009` تاریخچه‌ی `mentor_assignments` را منتقل کرد (`backup` ← `secondary`).
- **پل مسیر قدیمی:** دو trigger (`enrollments_sync_legacy_mentor`، `students_sync_legacy_mentor`) مشاور اصلی مسیر «منتورینگ فریلنسری» را با `students.primary_mentor_id` هم‌زمان نگه می‌دارند. تعیین مشاور اصلی در این مسیر از `changeMentor` می‌گذرد.
- **`mentor_profiles`** (ماژول mentors): تخصص، معرفی، ظرفیت (فقط هشدار)، `accepting_students`.
- **اجرای گروهی برای مشاور:** با تنظیم `access.mentorsCanCreateGroupRuns` (پیش‌فرض خاموش) ممکن است و مشاور سازنده `manager` اجرا می‌شود. بند «فعلاً ۴۰۳» بالا با این تنظیم برداشته شد.

## تطبیق با پیاده‌سازی (اسپرینت ۵ Coach Office، ۱۴۰۵/۰۸/۰۸)
- **`node_completions`** (کلید عضویت + گره‌ی اجرا، `checklist_state`، `completed_at`) با trigger سازمان از عضویت. هنرجو درس، منبع و چک‌لیست خودش را علامت می‌زند، ولی نه در فاز قفل. نقطه‌ی عطف بدون نوع را فقط کارکنان علامت می‌زنند.
- **`milestone_type_id`** روی `curriculum_nodes` و `run_nodes` (فقط برای نقطه‌ی عطف). نقطه‌ی عطف دارای نوع با دستاورد تأییدشده از همان نوع انجام‌شده است، نه با علامت.
- **پیوند کار و برنامه:** `tasks.enrollment_id` و `tasks.node_id` (نام `node_id` به‌جای `run_node_id` بند ۶). یکتایی جزئی (عضویت، گره) برای کارهای لغونشده.
- **تابع پیشرفت** همان بند ۶ است: `programs/progress.ts` با تست واحد. درصد به پایین گرد می‌شود و وقتی هیچ فعالیت الزامی نیست `null` («نامعلوم») است.
- **مهلت نسبی:** شروع اجرا + `expected_days` فازهای قبلی (فاز بی‌پایان صفر) + `due_offset_days`. بدون offset، ۷ روز است. مهلت گذشته امروز می‌شود.
- مسیر قدیمی واگذاری و پیشرفت ندارد (۴۰۹ `legacyRun`).

## تطبیق با پیاده‌سازی (اسپرینت ۵ب Coach Office، ۱۴۰۵/۰۸/۰۸)
- **ماژول تازه‌ی `mentoring`:** جدول‌های `mentoring_sessions` و `goals` را می‌نویسد. اجرا و عضویت را از programs می‌خواند. اقدام بعدی را ماژول tasks می‌سازد (`insertSessionAction`).
- **`mentoring_sessions`** (بند ۷):
  - `enrollment_id` خالی یعنی جلسه‌ی گروهی کل اجرا؛ فقط برای اجرای گروهی غیرقدیمی.
  - ستون `counts_toward_quota` (پیش‌فرض true) جای تنظیم سازمانی «غیبت شمرده شود» را گرفت.
  - `organization_id` با trigger از اجرا گرفته می‌شود.
- **`goals`** (بند ۶): عضویت، عنوان، `target_date` و وضعیت (`open`، `achieved`، `dropped`)؛ برای وضعیت نهایی، `decided_at` و `decided_by` ثبت می‌شوند.
- **پیشرفت تک‌به‌تک** = هدف‌های محقق‌شده ÷ هدف‌های کنارگذاشته‌نشده. **مصرف بسته** (بند ۴) = جلسه‌های برگزارشده و غیبت با `counts_toward_quota`. هر دو در `programs/progress.ts` با تست واحد.
- **`tasks.session_id`** با `ON DELETE SET NULL`.
- **یادآور ۲۴ ساعته:** برچسب روی کارت جلسه‌های «امروز»، بدون job.
- **هم‌پوشانی** جلسه‌های یک مشاور فقط هشدار است.
- **حذف داده:** هدف‌ها پاک می‌شوند و محل و دلیل لغو جلسه‌ها خالی می‌شوند.

## تطبیق با پیاده‌سازی (اسپرینت ۵ج Coach Office، ۱۴۰۵/۰۸/۰۷)
- **فاز هر دوره، منبع صفحه‌های روزانه:** کانبان «مراحل» (با `?run=`)، فهرست هنرجوها (`runId` و `phaseId`) و «امروز» فاز را از `enrollments.current_phase_node_id` و `run_nodes` می‌خوانند. مسیر اصلی همان `stages` و کانبان قدیمی را نگه می‌دارد.
- **سلامت (ADR-0005):** ورودی قواعد به‌جای یک مرحله، فهرست فاز عضویت‌های فعال است (`enteredAt`، `expectedDays`، `isOpenEnded`). R-STALL بدترین نسبت را می‌گیرد. R-NOTASK فقط وقتی همه‌ی فازها بی‌پایان‌اند کنار می‌رود.
- **مهاجرت ندارد.** تغییر فاز همان `PUT /enrollments/:id/phase` اسپرینت ۳ است.

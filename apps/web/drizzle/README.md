# drizzle — مهاجرت‌های SQL

فایل‌ها با `pnpm db:generate` از روی `schema.ts`ها ساخته می‌شوند و در گیت می‌مانند. پیش از کامیت SQL را بخوانید.
مهاجرت اعمال‌شده ویرایش نمی‌شود؛ تغییر تازه = مهاجرت تازه. اجرا: `pnpm db:migrate` (جدول ردگیری: `drizzle.__drizzle_migrations`).
`0000` جدول زیرساختی `_health`. `0001_identity_auth`: `users`، `auth_tokens`، `sessions`، `auth_throttle` (ماژول identity)، `audit_log` (admin) و `settings` (catalog) — اسپرینت ۱.
`0002_students_path`: `CREATE EXTENSION pg_trgm` (روی Azure Flexible Server باید در `azure.extensions` مجاز باشد)، `tracks`، `platforms`، `learning_paths`، `stages` (catalog)، `students`، `mentor_assignments`، `platform_profiles`، `profile_snapshots` (students)، `stage_transitions` (path) — اسپرینت ۲.
`0003_tasks_timeline_reminders`: `task_templates` (catalog)، `tasks`، `task_extensions`، `submissions`، `reviews` (tasks)، `attachments` (files؛ CHECK «دقیقاً یک والد پس از وصل شدن»)، `notes`، `timeline_events` (timeline)، `reminders` (reminders) — اسپرینت ۳. آخرین دستور (FK `profile_snapshots.source_submission_id`) دستی نوشته شده تا چرخه‌ی import بین schemaها پیش نیاید. seed اکنون ۱۶ قالب کار پیش‌فرض مرحله‌ها (`progress-tracking.md` ۴-۳) را هم با شناسه‌ی ثابت می‌افزاید.

`0004_health_questions_checkins_milestones`: `milestone_types`، `canned_responses` (catalog)، `question_threads`، `question_messages` (questions)، `checkins`، `milestones`، `student_flags`، `student_health` (health)، و FK پیوست‌ها به پیام سؤال و نقطه‌ی عطف — اسپرینت ۴. seed اکنون ۵ نوع نقطه‌ی عطف (فقط «اولین قرارداد یا سفارش پولی» با `counts_for_north_star`)، پاسخ استاندارد «خطوط قرمز» و ردیف تنظیمات `checkin = { enabled: true }` (تصمیم E5) را هم می‌افزاید؛ ردیف تنظیماتی که مدیر ذخیره کرده بازنویسی نمی‌شود.

**داده‌ی پیش‌فرض (seed):** `pnpm db:migrate` پس از مهاجرت‌ها `src/modules/catalog/seed.ts` را هم اجرا می‌کند (۳ شاخه، ۸ پلتفرم، مسیر پیش‌فرض و ۹ مرحله‌ی `learning-path.md`). جدا: `pnpm db:seed`. idempotent است: شناسه‌ها ثابت‌اند و درج با `ON CONFLICT DO NOTHING`، پس اجرای دوباره چیزی اضافه نمی‌کند و ویرایش‌های مدیر (نام، ترتیب، غیرفعال‌سازی) را بازنویسی نمی‌کند.

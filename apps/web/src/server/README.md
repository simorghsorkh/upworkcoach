# server — زیرساخت سمت سرور

| مسیر | چیست |
|---|---|
| `env.ts` | قرارداد متغیرهای محیطی با zod؛ `getEnv()` تنبل است تا `next build` به اسرار نیاز نداشته باشد |
| `db/` | Drizzle روی `pg` با `DATABASE_URL`؛ `getDb()` برای برنامه، `createDb()` برای تست و اسکریپت؛ `migrate.ts` اجرای مهاجرت‌ها |
| `logger.ts` | pino، JSON روی stdout؛ رمز، توکن و کوکی redact می‌شوند |
| `jobs/` | pg-boss در schema `pgboss`؛ با `JOBS_MODE` روشن/خاموش (ADR-0007)؛ از `src/instrumentation.ts` شروع می‌شود |
| `storage/` | رابط `FileStorage`؛ آداپتور `local` کامل، `azure-blob` و `s3` فعلاً stub |
| `auth/` | `current-user.ts` (قرارداد مشترک با frontend: `getCurrentUser`، `requireUser`)، کوکی‌ها، خواندن نشست از درخواست |
| `http/` | `route()` (CSRF ← نشست ← zod ← service)، خطاهای ساختاریافته با پیام فارسی، `getClientIp`، هدرهای امنیتی و CSP، `routes.manifest.ts` (ماتریس دسترسی) |
| `concurrency.ts` | صف هم‌زمانی ساده (حداکثر ۲ عملیات argon2، SEC-P5) |

هر endpoint تازه باید در `http/routes.manifest.ts` ثبت شود؛ وگرنه تست ماتریس دسترسی شکست می‌خورد.
فقط کد سمت سرور اینجاست؛ از کامپوننت کلاینت import نشود.

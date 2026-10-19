# server — زیرساخت سمت سرور

| مسیر | چیست |
|---|---|
| `env.ts` | قرارداد متغیرهای محیطی با zod؛ `getEnv()` تنبل است تا `next build` به اسرار نیاز نداشته باشد |
| `db/` | Drizzle روی `pg` با `DATABASE_URL`؛ `getDb()` برای برنامه، `createDb()` برای تست و اسکریپت؛ `migrate.ts` اجرای مهاجرت‌ها |
| `logger.ts` | pino، JSON روی stdout؛ رمز، توکن و کوکی redact می‌شوند |
| `jobs/` | pg-boss در schema `pgboss`؛ با `JOBS_MODE` روشن/خاموش (ADR-0007)؛ از `src/instrumentation.ts` شروع می‌شود |
| `storage/` | رابط `FileStorage`؛ آداپتور `local` کامل، `azure-blob` و `s3` فعلاً stub |

بعداً اضافه می‌شود: `auth/` (نشست و argon2id، ADR-0003) و `http/` (خطا و اعتبارسنجی مشترک route‌ها).
فقط کد سمت سرور اینجاست؛ از کامپوننت کلاینت import نشود.

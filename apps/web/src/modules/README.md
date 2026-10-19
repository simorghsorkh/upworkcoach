# modules — ماژول‌های دامنه

یک پوشه برای هر ماژول (`identity`، `students`، `tasks`، … — overview.md بخش ۳) با این فایل‌ها:

| فایل | نقش |
|---|---|
| `schema.ts` | جدول‌های Drizzle همین ماژول؛ فقط import نسبی (drizzle-kit نام مستعار `@/` را نمی‌خواند)؛ از `src/server/db/schema.ts` هم re-export شود |
| `contracts.ts` | schemaهای zod و DTOها |
| `policy.ts` | قواعد دسترسی |
| `service.ts` | تنها نقطه‌ی ورود از بیرون ماژول؛ اولین پارامتر `actor` |
| `repo.ts` | پرس‌وجوها؛ فقط داخل ماژول |

ماژول جدول ماژول دیگر را نمی‌نویسد. بعد از تغییر `schema.ts`: `pnpm db:generate` و بررسی SQL تولیدشده در `drizzle/`.
نام‌گذاری ستون‌ها: camelCase در TypeScript، snake_case در دیتابیس (`casing: 'snake_case'`).

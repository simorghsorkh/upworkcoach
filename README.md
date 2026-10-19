# UpworkCoach

پلتفرم مربیگری فریلنسری و آپورک. نسخه‌ی فعلی: **0.1 «دفتر مربی»** (در حال ساخت).
زمینه‌ی محصول: [`CLAUDE.md`](CLAUDE.md) و [`docs/STATUS.md`](docs/STATUS.md). معماری: [`docs/04-architecture/`](docs/04-architecture/).

## ساختار مخزن

| مسیر | چیست |
|---|---|
| `apps/web` | تنها برنامه‌ی 0.1: Next.js (رابط فارسی RTL + REST API + کارهای زمان‌بندی‌شده) |
| `apps/web/src/app` | صفحه‌ها: `(auth)`، `(staff)`، `(student)`، `api/v1`، و `healthz` |
| `apps/web/src/modules` | ماژول‌های دامنه (هنوز خالی) |
| `apps/web/src/server` | env، db (Drizzle)، logger (pino)، jobs (pg-boss)، storage |
| `apps/web/drizzle` | مهاجرت‌های SQL |
| `apps/web/tests` | تست یکپارچه و e2e |
| `apps/web/scripts` | `db:start` / `db:stop` / `db:migrate` |
| `packages/config` | tsconfig و Biome مشترک |

هر پوشه یک README کوتاه دارد که قاعده‌هایش را می‌گوید.

## پیش‌نیازها

| ابزار | نسخه | نکته |
|---|---|---|
| Node.js | **22 یا بالاتر** (`engines: >=22`) | تولید و CI روی **Node 24 LTS** اجرا می‌شوند (Dockerfile و `ci.yml`). دستگاه توسعه‌ی فعلی Node 22.17 دارد و همه‌چیز روی آن آزموده شده است. اگر رفتاری فقط در یکی دیده شد، Node 24 مرجع است |
| pnpm | **12.14.0** (ثابت در `packageManager`) | نصب سراسری لازم نیست: `npx pnpm@12.14.0 …`. corepack همراه Node 22 (نسخه‌ی 0.33) pnpm 12 را اجرا نمی‌کند |
| Docker | **لازم نیست** | فقط برای استقرار. دیتابیس محلی و تست با Postgres جاسازی‌شده از npm کار می‌کنند ([ADR-0009](docs/04-architecture/adr/0009-local-dev-without-docker.md)) |
| PostgreSQL | **لازم نیست** | با `pnpm install` باینری Postgres 16.14 برای سیستم‌عامل شما می‌آید |

برای کوتاه‌تر شدن فرمان‌ها می‌توانید در شل خودتان یک alias بسازید (مثلاً در Git Bash: `alias pnpm='npx -y pnpm@12.14.0'`). در ادامه `pnpm` یعنی همین.

## راه‌اندازی از صفر

```bash
npx -y pnpm@12.14.0 install     # وابستگی‌ها + باینری Postgres 16
cp .env.example .env            # تنظیمات محلی (فقط ریشه‌ی مخزن؛ در گیت نمی‌رود)
pnpm db:start                   # Postgres محلی در پس‌زمینه؛ داده در .data/pg
pnpm db:migrate                 # اعمال مهاجرت‌ها
pnpm dev                        # http://localhost:3000
```

بررسی سریع: `http://localhost:3000/healthz` باید `{"status":"ok","db":"ok"}` برگرداند.
پایان کار: `pnpm db:stop` (Postgres را تمیز می‌بندد). اگر سیستم ری‌استارت شد، دوباره `pnpm db:start`.

همه‌ی داده‌ی محلی در `.data/` است (`pg/` دیتابیس، `pg.log` لاگ دیتابیس، `uploads/` فایل‌ها). برای شروع از صفر: `pnpm db:stop`، پوشه‌ی `.data` را پاک کنید و دوباره `db:start` و `db:migrate`.

## فرمان‌ها (از ریشه‌ی مخزن)

| فرمان | کار |
|---|---|
| `pnpm dev` | سرور توسعه‌ی Next.js |
| `pnpm build` / `pnpm start` | ساخت production (`output: 'standalone'`) و اجرای آن |
| `pnpm lint` / `pnpm lint:fix` | Biome (lint + قالب‌بندی) |
| `pnpm typecheck` | `next typegen` + `tsc --noEmit` |
| `pnpm test` | Vitest: تست‌های واحد (`src/**/*.test.ts`) و یکپارچه (`tests/integration`) |
| `pnpm test:e2e` | Playwright در دو اندازه: دسکتاپ ۱۴۴۰ و موبایل ۳۷۵ |
| `pnpm db:start` / `pnpm db:stop` | روشن و خاموش کردن Postgres محلی |
| `pnpm db:generate` | ساخت فایل مهاجرت SQL از روی `schema.ts`ها |
| `pnpm db:migrate` | اعمال مهاجرت‌ها روی `DATABASE_URL` |

## تست

- **واحد و یکپارچه:** `pnpm test`. تست یکپارچه **به دیتابیس توسعه وصل نمی‌شود**؛ یک Postgres 16 موقت روی پورت آزاد می‌سازد، مهاجرت‌ها را اجرا می‌کند و بعد پاکش می‌کند (حدود ۱۵ ثانیه). اگر `TEST_DATABASE_URL` در شل تنظیم باشد (مثل CI)، از همان دیتابیس استفاده می‌شود؛ هرگز آن را به داده‌ی واقعی وصل نکنید.
- **e2e:** یک بار مرورگر را بگیرید (حدود ۱۲۰ مگابایت در `%LOCALAPPDATA%\ms-playwright`، نه در پروژه):
  ```bash
  pnpm --filter @upworkcoach/web exec playwright install chromium
  pnpm test:e2e
  ```
  Playwright خودش `next dev` را روی پورت 3100 با `JOBS_MODE=off` بالا می‌آورد. اگر سرور dev دیگری در همین پوشه باز است، اول آن را ببندید.

## مهاجرت دیتابیس

1. جدول‌ها را در `apps/web/src/modules/<module>/schema.ts` تعریف کنید (فقط import نسبی) و از `src/server/db/schema.ts` re-export کنید.
2. `pnpm db:generate --name <short_name>` ← فایل SQL تازه در `apps/web/drizzle/`. **SQL را بخوانید** و با کد کامیت کنید.
3. `pnpm db:migrate`.

مهاجرت اعمال‌شده ویرایش نمی‌شود. نام ستون‌ها در TypeScript camelCase و در دیتابیس snake_case است. فعلاً فقط جدول زیرساختی `_health` وجود دارد.

## متغیرهای محیطی

فهرست کامل با توضیح در [`.env.example`](.env.example)؛ قرارداد در `docs/04-architecture/tech-stack.md` بخش ۵؛ اعتبارسنجی در `apps/web/src/server/env.ts`.

| متغیر | محلی | توضیح |
|---|---|---|
| `DATABASE_URL` | `postgres://upworkcoach:upworkcoach@localhost:5432/upworkcoach` | `db:start` همین را می‌سازد |
| `APP_BASE_URL` | `http://localhost:3000` | برای ساخت لینک دعوت |
| `SESSION_COOKIE_NAME` | `__Host-uc_session` | — |
| `DEVICE_COOKIE_SECRET` | خالی | راز HMAC کوکی دستگاه در سیاست قفل ورود (ADR-0003)؛ ۳۲ بایت تصادفی؛ **در production الزامی** است و بدون آن برنامه بالا نمی‌آید |
| `TRUSTED_PROXY_HOPS` | `0` | تعداد پراکسی‌های مورد اعتماد برای خواندن IP واقعی از `X-Forwarded-For` (ADR-0003). محلی `0` (سرآیند نادیده گرفته می‌شود)، Azure App Service `1` |
| `STORAGE_DRIVER` | `local` | `local` \| `azure-blob` \| `s3` (دو تای آخر هنوز stub هستند) |
| `LOCAL_STORAGE_DIR` | `.data/uploads` | فقط برای `local`؛ مسیر نسبی از ریشه‌ی مخزن |
| `AZURE_STORAGE_*`، `S3_*` | خالی | فقط برای driver مربوط |
| `JOBS_MODE` | `in-process` | `in-process` \| `http-trigger` \| `off` (ADR-0007) |
| `JOB_TRIGGER_SECRET` | خالی | برای `http-trigger` الزامی (حداقل ۳۲ نویسه) |
| `LOG_LEVEL` | `info` | — |
| `MAX_UPLOAD_BYTES` | `5242880` | ۵ مگابایت |

**اسرار هرگز در مخزن نیستند.** `.env` و `.data/` در `.gitignore` هستند. مقادیر تولید فقط در تنظیمات میزبان (App Service) یا `.env` روی خود سرور. ساخت راز: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

## CI

`.github/workflows/ci.yml` روی هر push به `main` و هر PR: نصب با `--frozen-lockfile`، lint، typecheck، تست (تست یکپارچه روی service container رسمی `postgres:16`)، build. Node 24.

## استقرار (Docker)

- `apps/web/Dockerfile`: چندمرحله‌ای روی `node:24-alpine`؛ هدف `runner` (image کوچک standalone، کاربر غیر root، HEALTHCHECK روی `/healthz`) و هدف `migrator` (اجرای یک‌باره‌ی مهاجرت‌ها).
- `docker-compose.yml`: Postgres 16 + migrate + web برای یک سرور (مثلاً VPS ایرانی)؛ نیازمند `POSTGRES_PASSWORD` و `DEVICE_COOKIE_SECRET` در `.env`.

> **هنوز اجرا نشده‌اند:** روی دستگاه توسعه Docker نصب نیست. اولین ساخت واقعی در CI یا روی سرور استقرار انجام می‌شود. خروجی standalone همان build به‌صورت محلی با Node آزموده شده است (صفحه‌ی اصلی و `/healthz` پاسخ ۲۰۰ دادند).

جزئیات استقرار، پشتیبان‌گیری و rollback در `docs/07-launch/runbook.md` می‌آید.

## نکته‌ها و محدودیت‌های شناخته‌شده

- **TypeScript 6.0** عمداً به‌جای 7.0 استفاده شده است: بسته‌ی `typescript@7` (کامپایلر بومی) API برنامه‌نویسی پایدار ندارد و `next build` به آن وابسته است.
- `next dev` فایل `apps/web/AGENTS.md` را می‌سازد و نگه می‌دارد (راهنمای Next.js برای ایجنت‌های کدنویس). عمداً در مخزن می‌ماند.
- روی لینوکس، `db:start` با کاربر root اجرا نمی‌شود (محدودیت `initdb`).

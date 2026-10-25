# استک فنی — UpworkCoach نسخه‌ی 0.1

> فاز ۳ — ۲۷ مهر ۱۴۰۵ — نویسنده: software-architect — وضعیت: پیش‌نویس برای گیت بنیان‌گذار
> تصمیم رسمی: [ADR-0001](adr/0001-tech-stack.md). میزبانی: [ADR-0002](adr/0002-hosting-0.1.md).
> اصل راهنما: **یک توسعه‌دهنده‌ی فول‌استک باید کل سیستم را در ذهن نگه دارد.** یک زبان، یک برنامه، یک دیتابیس، بدون سرویس جانبی.

---

## ۱. خلاصه

| لایه | انتخاب | چرا این | چرا نه آن |
|---|---|---|---|
| زبان | **TypeScript** (strict) روی **Node.js 24 LTS** | یک زبان در فرانت و بک؛ تایپ مشترک بین API و UI | Python/Django یا PHP/Laravel: زبان دوم برای فرانت لازم می‌شود |
| مخزن | **pnpm workspace**: `apps/web` + `packages/config` | 1.0 بدون جابه‌جایی پوشه‌ها `packages/ai` یا `apps/worker` اضافه می‌کند | Turborepo/Nx: برای یک برنامه زیادی است؛ بعداً قابل‌افزودن |
| فریم‌ورک | **Next.js** (App Router، آخرین نسخه‌ی پایدار) با `output: 'standalone'` | UI و API در یک برنامه و یک استقرار؛ رندر سرور برای بارگذاری سریع روی اینترنت ضعیف (F10: کمتر از ۳ ثانیه) | Next.js + NestJS جدا: دو برنامه، دو استقرار، دو بار احراز هویت. Vite SPA + API: رندر سرور و مسیریابی را باید خودمان بسازیم |
| API | **REST JSON** در Route Handlerهای `app/api/v1/**`؛ اعتبارسنجی با **zod** | قرارداد صریح و قابل‌تست (`api.md`)؛ بعداً ربات تلگرام یا اپ موبایل از همان API استفاده می‌کند | Server Actions برای mutationها: قرارداد صریح ندارد و تست دسترسی سخت‌تر است. tRPC: قفل به کلاینت TS |
| دیتابیس | **PostgreSQL 16+** | رابطه‌ای، استاندارد، همه‌جا (Azure، Neon، هر VPS ایرانی)؛ `pg_trgm` برای جستجوی فارسی؛ صف هم داخل همین | MySQL: جستجوی trigram و JSONB ضعیف‌تر. MongoDB: داده‌ی ما رابطه‌ای است |
| ORM و مهاجرت | **Drizzle ORM** + **drizzle-kit** (فایل‌های SQL مهاجرت در گیت) | نزدیک به SQL؛ index جزئی، check constraint، ستون generated و SQL خام راحت است؛ بدون موتور باینری؛ image کوچک | Prisma: گزینه‌ی خوبی است، ولی قیدها و indexهای Postgres-محور را باید با SQL خام کنار schema نگه داشت. با دلیل قابل‌تعویض است |
| احراز هویت | **نشست در دیتابیس + کوکی httpOnly**؛ هش رمز با **argon2id** (`@node-rs/argon2`) | جریان ما (دعوت ← موبایل + رمز) ساده و غیراستاندارد است؛ کد کم و قابل‌فهم (ADR-0003) | Auth.js: credentials را با نشست دیتابیسی خوب پشتیبانی نمی‌کند. Better Auth: محور ایمیل است و وابستگی سنگین‌تری می‌آورد. سرویس بیرونی (Clerk و …): تحریم و قطعی |
| صف و زمان‌بند | **pg-boss** (روی همان Postgres) | بدون Redis؛ cron با منطقه‌ی زمانی؛ زمان‌بندی تک‌نمونه‌ای حتی با چند نمونه‌ی برنامه؛ صف 1.0 برای LLM (ADR-0007) | BullMQ: Redis می‌خواهد. Vercel Cron یا Azure Functions: قفل به میزبان |
| UI | **React** + **Tailwind CSS v4** + **shadcn/ui** (روی Radix) | کلاس‌های منطقی (`ms-*`، `pe-*`، `start-*`) برای RTL؛ Radix با `DirectionProvider dir="rtl"`؛ کامپوننت‌ها در مخزن خودمان کپی می‌شوند، نه وابستگی | MUI: سنگین و RTL آن با emotion پیچیده است. Ant Design: حجم زیاد |
| فرم | **react-hook-form** + همان schemaهای zod | یک schema برای کلاینت و سرور | — |
| فونت | **Vazirmatn** self-host با `next/font/local` | PRD: بدون فونت از سرویس خارجی | Google Fonts: دامنه‌ی خارجی، فیلتر و قطعی |
| تاریخ | ذخیره‌ی **UTC** (`timestamptz`)؛ نمایش شمسی با `Intl.DateTimeFormat('fa-IR-u-ca-persian', {timeZone: 'Asia/Tehran'})`؛ انتخابگر تاریخ و محاسبه‌ی شمسی با **date-fns-jalali** | Intl بومی است و کتابخانه نمی‌خواهد؛ date-fns-jalali برای «پنجشنبه‌ی این هفته» و «۳ روز بعد» در تقویم شمسی | moment-jalaali: moment منسوخ و سنگین است (ADR-0008) |
| فایل | رابط **`FileStorage`** با آداپتورهای `local` (توسعه و VPS تک‌سرور)، `azure-blob` و `s3`؛ پردازش تصویر با **sharp** (بازکدگذاری و حذف EXIF) | قابل‌انتقال (ADR-0002)؛ حذف مکان و مشخصات دستگاه از عکس‌ها (حریم خصوصی) | ذخیره در دیتابیس: پشتیبان‌ها را بزرگ می‌کند |
| CSV | **papaparse** | ورود و خروج CSV (F11) با UTF-8 BOM تا اکسل فارسی را درست نشان دهد | — |
| لاگ | **pino** (JSON به stdout) | هر میزبانی می‌خواند | SDK مانیتورینگ اختصاصی: قفل به میزبان |
| تست | **Vitest** (واحد و یکپارچه با Postgres واقعی: محلی از **embedded-postgres**، در CI از service container؛ [ADR-0009](adr/0009-local-dev-without-docker.md))؛ **Playwright** (e2e در اندازه‌ی موبایل و دسکتاپ) | قواعد سلامت تابع خالص‌اند و تست واحد می‌خورند؛ ماتریس دسترسی روی دیتابیس واقعی تست می‌شود (ADR-0004) | Jest: کندتر و تنظیم ESM آن دردسر دارد |
| کیفیت کد | **Biome** (lint + format) + `tsc --noEmit` در CI | یک ابزار سریع به‌جای ESLint + Prettier | — |
| استقرار | **Docker** (image چندمرحله‌ای) ← GHCR ← Azure App Service | ADR-0002 | — |
| PWA | manifest + نصب‌پذیری؛ service worker فقط برای cache کردن assetهای ثابت | PRD: وب‌اپ واکنش‌گرا (D1). داده‌ی آفلاین در 0.1 نداریم | آفلاین کامل: پیچیدگی همگام‌سازی |

**عمداً نداریم:** Redis، Kubernetes، میکروسرویس، GraphQL، سرویس احراز هویت بیرونی، CDN خارجی، Sentry یا هر SDK بیرونی در مرورگر (اضافه کردن Sentry یا GlitchTip self-host پس از 0.1 بررسی می‌شود؛ تصمیم با devops-engineer).

---

## ۲. ساختار مخزن

```
upworkcoach/
├─ apps/
│  └─ web/                         # تنها برنامه‌ی 0.1 (UI + API + jobs)
│     ├─ src/
│     │  ├─ app/
│     │  │  ├─ (auth)/             # ورود، پذیرش دعوت، تنظیم رمز
│     │  │  ├─ (staff)/            # امروز، هنرجوها، کانبان، پرونده، تنظیمات (admin|mentor)
│     │  │  ├─ (student)/          # خانه، کارها، سؤال‌ها، پروفایل‌ها (student)
│     │  │  └─ api/v1/**/route.ts  # REST — فقط لایه‌ی نازک HTTP
│     │  ├─ modules/               # ماژول‌های دامنه (overview.md بخش ۳)
│     │  │  └─ <module>/
│     │  │     ├─ schema.ts        # جدول‌های Drizzle همین ماژول
│     │  │     ├─ contracts.ts     # schemaهای zod و DTOها (ورودی/خروجی API)
│     │  │     ├─ policy.ts        # قواعد دسترسی همین ماژول
│     │  │     ├─ service.ts       # منطق دامنه؛ تنها نقطه‌ی ورود از بیرون ماژول
│     │  │     └─ repo.ts          # پرس‌وجوها (فقط داخل ماژول)
│     │  ├─ server/                # db، auth، http (خطا، اعتبارسنجی)، jobs (pg-boss)، storage
│     │  └─ lib/                   # jalali، text-fa (نرمال‌سازی)، phone، business-hours
│     ├─ drizzle/                  # فایل‌های مهاجرت SQL
│     ├─ tests/                    # integration (access matrix) و e2e
│     └─ Dockerfile
├─ packages/
│  └─ config/                      # tsconfig و biome مشترک
└─ docs/
```

در 1.0 اضافه می‌شود (بدون جابه‌جایی کد موجود): `apps/web/src/modules/ai`، `modules/opportunities`، `modules/notifications`. اگر بار LLM زیاد شد، `apps/worker` همان image را با دستور دیگری اجرا می‌کند (`node dist/worker.js`).

---

## ۳. قواعد کدنویسی که معماری به آن‌ها وابسته است

1. **Route Handler نازک است:** احراز هویت ← اعتبارسنجی zod ← فراخوانی `service` ← تبدیل به DTO. منطق کسب‌وکار و بررسی دسترسی **داخل service** است، نه در route.
2. **هر service اولین پارامترش `actor`** است (`{ userId, role }`) و دسترسی را خودش بررسی می‌کند (ADR-0004). صفحه‌های RSC هم همان serviceها را صدا می‌زنند، پس دو مسیر دسترسی نداریم.
3. **ماژول جدول ماژول دیگر را مستقیم نمی‌نویسد.** خواندن بین ماژول‌ها فقط از service ماژول صاحب داده است. استثنا: `today`، `health` و (هماهنگ با کد، اسپرینت ۲) `access` read-model هستند و پرس‌وجوی فقط-خواندنی SQL روی چند جدول دارند (`overview.md` بخش ۳، قاعده‌ی ۲).
4. **DTOهای هنرجو جدا هستند** (`SelfStudentDTO`، `StudentTaskDTO`، …) و فیلدهای داخلی (سلامت، پرچم، یادداشت داخلی، شناسه‌ی بازبین) را **ندارند**. یعنی نشت به‌صورت ساختاری ناممکن است، نه با فیلتر.
5. **زمان:** همه‌ی `timestamptz` در UTC. هیچ‌جا `new Date().getDay()` یا `toLocaleDateString()` بدون `timeZone: 'Asia/Tehran'` استفاده نشود. فقط توابع `lib/jalali` (ADR-0008).
6. **متن فارسی ورودی** پیش از ذخیره نرمال می‌شود: `ي`→`ی`، `ك`→`ک`، ارقام فارسی/عربی در فیلدهای عددی و موبایل ← لاتین، فاصله‌های اضافه و نیم‌فاصله‌ی تکراری (ADR-0008).
7. **نام مرحله‌ها و پلتفرم‌ها در کد نمی‌آید.** رفتار خاص از پرچم‌های داده می‌آید (`stage.is_open_ended`، `milestone_type.counts_for_north_star`).
8. **هیچ فیلدی به نام password برای اکانت پلتفرم‌ها وجود ندارد** (PRD بخش ۶). فرم‌های پروفایل هشدار می‌دهند.

---

## ۴. محیط‌ها

| محیط | کجا | دیتابیس |
|---|---|---|
| local | `pnpm db:start` + `pnpm dev`، بدون Docker ([ADR-0009](adr/0009-local-dev-without-docker.md)) | Postgres 16 جاسازی‌شده (npm) در `.data/pg` |
| staging | اختیاری در 0.1؛ اگر لازم شد یک slot در App Service | دیتابیس جدا، داده‌ی ساختگی |
| production | Azure App Service B1 + Flexible Server B1ms (ADR-0002) | — |

`docker-compose.yml` (Postgres 16 + migrate + برنامه) برای استقرار تک‌سرور و مهاجرت به میزبان ایرانی است، نه توسعه‌ی محلی. چون روی دستگاه توسعه Docker نیست، مسیر انتقال دیگر هر روز تست نمی‌شود؛ جبرانش ساخت image در CI و تمرین فصلی runbook است (ADR-0009).

---

## ۵. متغیرهای محیطی (قرارداد)

| نام | مثال | توضیح |
|---|---|---|
| `DATABASE_URL` | `postgres://…?sslmode=require` | — |
| `APP_BASE_URL` | `https://app.example.ir` | برای ساخت لینک دعوت |
| `SESSION_COOKIE_NAME` | `__Host-uc_session` | — |
| `DEVICE_COOKIE_SECRET` | — (۳۲ بایت تصادفی) | راز HMAC کوکی دستگاه در سیاست قفل ورود (ADR-0003)؛ در production الزامی |
| `TRUSTED_PROXY_HOPS` | `0` محلی، `1` روی App Service | تعداد پراکسی‌های مورد اعتماد برای خواندن IP از `X-Forwarded-For` (ADR-0003) |
| `STORAGE_DRIVER` | `local` \| `azure-blob` \| `s3` | `local` برای توسعه و VPS تک‌سرور (ADR-0009) |
| `LOCAL_STORAGE_DIR` | `.data/uploads` | فقط برای `local`؛ نسبی = از ریشه‌ی مخزن در توسعه |
| `AZURE_STORAGE_CONNECTION_STRING`، `AZURE_STORAGE_CONTAINER` | — | فقط برای `azure-blob` |
| `S3_ENDPOINT`، `S3_BUCKET`، `S3_ACCESS_KEY`، `S3_SECRET_KEY`، `S3_REGION` | — | فقط برای `s3` |
| `JOBS_MODE` | `in-process` \| `http-trigger` \| `off` (و در 1.0 `worker-only`) | ADR-0007 |
| `JOB_TRIGGER_SECRET` | — | برای `POST /api/internal/jobs/:name` |
| `LOG_LEVEL` | `info` | — |
| `MAX_UPLOAD_BYTES` | `5242880` | ۵ مگابایت |
| (1.0) `LLM_PROVIDER`، `LLM_BASE_URL`، `LLM_API_KEY` | — | ADR-0006 |

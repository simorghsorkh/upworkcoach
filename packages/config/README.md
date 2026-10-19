# @upworkcoach/config

پیکربندی مشترک همه‌ی بسته‌های مخزن:

- `tsconfig/base.json` — TypeScript سخت‌گیر (`strict` + `noUncheckedIndexedAccess`).
- `tsconfig/nextjs.json` — همان، به‌علاوه‌ی DOM و JSX برای برنامه‌های Next.js.
- `biome.base.json` — قواعد lint و قالب‌بندی. فایل `biome.json` ریشه‌ی مخزن از این فایل ارث می‌برد.

بسته‌ی تازه (مثلاً `packages/ai` در 1.0) فقط `extends` می‌کند و قاعده‌ی جدا نمی‌سازد.

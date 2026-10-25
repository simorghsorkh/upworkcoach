# (staff) — صفحه‌های مدیر و مشاور

قاب: `src/components/shell/staff-shell.tsx` (سایدبار تیره‌ی دسکتاپ، نوار پایین موبایل با «+»). `layout.tsx` با `requireUser(['admin', 'mentor'])`؛ زیرگروه `(admin)` (نتایج، تنظیمات) فقط `admin`.
دسترسی در serviceها هم بررسی می‌شود، نه فقط در layout (ADR-0004). صفحه‌های اسپرینت‌های بعد فعلاً «به‌زودی» هستند.

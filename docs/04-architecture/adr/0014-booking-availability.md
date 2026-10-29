# ADR-0014 — رزرو جلسه: ساعت‌های آزاد مشاور، نوع جلسه و درخواست با تأیید مشاور

- **وضعیت:** پذیرفته‌شده (پیاده‌سازی: اسپرینت ۷ Coach Office)
- **تاریخ:** ۷ آبان ۱۴۰۵ (2026-10-29)
- **منبع الزامات:** درخواست بنیان‌گذار (۷ آبان ۱۴۰۵)؛ `docs/08-saas-evolution/booking-design.md` و جدول تصمیم‌های بنیان‌گذار در همان سند
- **اثر روی ADRهای قبلی:** ADR-0012 «رزرو خودکار با ساعت آزاد مشاور» را بیرون از MVP گذاشته بود؛ این ADR آن را به دامنه می‌آورد. جلسه همان `mentoring_sessions` ADR-0012 می‌ماند و رزرو فقط راه تازه‌ای برای ساختنش است.

## زمینه
- جلسه را تا امروز فقط مشاور یا مدیر دستی ثبت می‌کرد (`POST /sessions`). هم‌پوشانی فقط هشدار بود (`overlaps` در پاسخ).
- بسته‌ی تک‌به‌تک (`one_on_one`) سهمیه و اعتبار دارد و مصرفش از جلسه‌های `held` و `no_show` حساب می‌شود (`packageUsage`).
- پرداخت در سیستم نیست (تصمیم ۱۴۰۵/۰۷/۲۷)؛ پس «حق رزرو» فقط از بسته‌ی ثبت‌شده می‌آید.

## تصمیم
### ۱. یک تقویم برای هر مشاور، با برچسب نوع روی هر بازه
- `availability_rules`: روز هفته، شروع و پایان به دقیقه از نیمه‌شب (به ساعت دیواری منطقه‌ی زمانی سازمان؛ `24:00` = پایان روز) و `template_ids` (خالی = همه‌ی انواع).
- `availability_exceptions`: یک روز مشخص، `off` (کل روز یا یک بازه) یا `extra` (بازه‌ی اضافه).
- `mentor_offerings`: کلید `(mentor_id, template_id)`؛ فعال بودن، فاصله‌ی بین جلسه‌ها (پیش‌فرض ۱۵ دقیقه)، حداقل فاصله تا جلسه (۱۲ ساعت)، افق (۲۱ روز)، مهلت لغو هنرجو (۲۴ ساعت) و محل یا لینک. مدت جلسه از خود قالب می‌آید (`session_minutes`، پیش‌فرض ۶۰).
- **نوع قابل‌ارائه:** قالب تک‌به‌تکِ منتشرشده که یا برای سازمان است یا مال خود مشاور.
- **چرا یک تقویم:** هر جلسه، از هر نوع، آن ساعت را برای همه‌ی انواع پر می‌کند. تقویم جدا برای هر نوع یا یک ساعت را دو بار می‌فروخت یا مشاور را مجبور به ورود تکراری می‌کرد.

### ۲. ساعت آزاد حساب می‌شود، ذخیره نمی‌شود
`modules/scheduling/slots.ts` (تابع خالص، با تست واحد):

```
پنجره‌ها = قاعده‌های آن روز هفته که این نوع را می‌پذیرند + استثنای extra − استثنای off
            (off کل‌روز همه را خالی می‌کند)
اسلات    = هر ۳۰ دقیقه از شروع هر پنجره، تا جایی که جلسه کامل جا شود
آزاد      = نه زودتر از حداقل فاصله، نه دیرتر از افق، و با فاصله‌ی بین جلسه‌ها
            از هر بازه‌ی مشغول (جلسه‌ی scheduled یا held از هر نوع + درخواست در انتظارِ زنده)
```
ساعت هر اسلات با offset همان لحظه‌ی منطقه‌ی زمانی سازمان به UTC تبدیل می‌شود (`lib/org-day`)، پس روزهای تغییر ساعت درست‌اند.

### ۳. هر رزرو اول درخواست است (تصمیم بنیان‌گذار: تأیید مشاور لازم)
- جدول جدای `booking_requests` (نه وضعیت تازه روی `mentoring_sessions` که طرح اولیه گفته بود): `pending` → `approved` | `declined` | `cancelled`. وضعیت `expired` ذخیره نمی‌شود؛ `pending` که `hold_until`اش گذشته در DTO «منقضی» گزارش می‌شود.
- درخواست ساعت را تا `hold_until = min(اکنون + ۴۸ ساعت، شروع جلسه)` نگه می‌دارد. بعد از آن خودبه‌خود آزاد است؛ کار پس‌زمینه لازم نیست.
- هر هنرجو حداکثر ۳ درخواست زنده دارد.
- **تأیید** (مشاور همان درخواست یا مدیر): بسته دوباره پیدا می‌شود، ظرفیت و هم‌پوشانی دوباره بررسی می‌شود و جلسه‌ی معمولی با `insertBookedSession` ماژول mentoring ساخته می‌شود. `session_id` روی درخواست می‌ماند.
- **رد:** با دلیل اختیاری که هنرجو می‌بیند؛ ساعت آزاد می‌شود.

### ۴. حق رزرو از بسته
- **بسته** = جدیدترین عضویت فعال هنرجو در اجرای باز (`draft` یا `active`) تک‌به‌تکِ همان قالب، که مشاور در کادر اجرا یا مشاور همان عضویت است، با اعتبار تمام‌نشده.
- **قابل رزرو** = باقی‌مانده‌ی بسته − جلسه‌های `scheduled` − درخواست‌های زنده‌ی گره‌خورده به همان بسته (`null` = بی‌سقف).
- هنرجوی بی‌بسته هم درخواست می‌دهد (مدیرها هم اعلان می‌گیرند). مشاور فقط وقتی می‌تواند تأیید کند که مدیر او را ثبت‌نام کرده باشد (پرداخت بیرون از سیستم). در غیر این صورت ۴۰۹ با پیام روشن.

### ۵. لغو
- هنرجو درخواست در انتظار را همیشه لغو می‌کند، و جلسه‌ی تأییدشده را تا `cancel_notice_hours` پیش از شروع. با لغو، جلسه `cancelled` می‌شود (`cancelBookedSession`) و مشاور اعلان می‌گیرد.
- دیرتر فقط مشاور، از همان «ویرایش جلسه»ی ADR-0012، و خودش تصمیم می‌گیرد از بسته کم شود یا نه (`countsTowardQuota`).

### ۶. هم‌زمانی
ساختن و تأیید درخواست در تراکنش با `pg_advisory_xact_lock(hashtext('scheduling.mentor:'||mentor_id))` انجام می‌شود و اسلات داخل همان قفل دوباره با `isFreeSlot` بررسی می‌شود. دو هنرجو نمی‌توانند یک ساعت را بگیرند (پاسخ دومی ۴۰۹ است و صفحه تقویم را تازه می‌کند).

### ۷. دسترسی
| مسیر | نقش |
|---|---|
| `GET`، `PUT /mentors/:id/availability` و `PUT /mentors/:id/offerings/:templateId` | مدیر برای هر کادر؛ مشاور فقط برای خودش (دیگری ۴۰۴) |
| `GET /mentors/:id/slots?templateId=` | هنرجو فقط برای مشاوری که «پذیرش هنرجو» دارد؛ مشاور فقط تقویم خودش؛ مدیر همه |
| `GET /booking/mentors` | فقط هنرجو |
| `GET /booking-requests` | هنرجو مال خودش، مشاور مال خودش، مدیر همه (`status=open` پیش‌فرض کادر) |
| `POST /booking-requests`، `POST /booking-requests/:id/cancel` | فقط هنرجو (لغو فقط مال خودش) |
| `POST /booking-requests/:id/approve` و `decline` | مشاور همان درخواست یا مدیر |

همه در ماتریس دسترسی (`routes.manifest.ts`) ثبت‌اند.

### ۸. اعلان و حذف حساب
- سه نوع اعلان تازه روی سیستم ۶ب: `booking_requested` (مشاور، و مدیرها وقتی بسته نیست)، `booking_decided` (هنرجو؛ `outcome` = approved یا declined)، `booking_cancelled` (مشاور).
- حذف حساب (ADR-0010): ساعت‌ها، استثناها، انواع و درخواست‌های آن شخص (به‌عنوان هنرجو یا مشاور) پاک می‌شوند. جلسه‌های ساخته‌شده طبق ADR-0012 می‌مانند.

## پیامدها
- مهاجرت `0013_scheduling`: چهار جدول تازه و بازسازی CHECK نوع اعلان. به داده‌ی موجود دست نمی‌زند.
- ماژول mentoring دو تابع داخلی تازه دارد (`insertBookedSession`، `cancelBookedSession`)؛ scheduling جدول جلسه را مستقیم نمی‌نویسد (قاعده‌ی ماژول).
- ثبت دستی جلسه مثل قبل است و هم‌پوشانی آن‌جا فقط هشدار می‌ماند (مشاور ممکن است عمداً جلسه‌ی گروهی را روی ساعت آزادش بگذارد). ساعت آن جلسه از تقویم رزرو کم می‌شود.

## بیرون از این تصمیم
همگام‌سازی Google Calendar (OAuth و تحریم)، فایل `.ics`، ساخت خودکار لینک جلسه، یادآور پیامکی یا ایمیلی، فهرست انتظار، جابه‌جایی درخواست به‌وسیله‌ی هنرجو (فعلاً: لغو و درخواست تازه)، منطقه‌ی زمانی جدا برای هر مشاور.

## Amendment — sprint 7b (2026-10-29): dates replace the weekly hours
**Request (founder, 2026-10-29):** a calendar that opens like Google Calendar, where the mentor says which dates they can meet; mentors set days and hours month by month, not the same every week.

**Decision**
- `availability_exceptions` becomes the **hours of one date**. `kind` is `off` (closed that date, no range) or `hours` (one bookable window, with its own `template_ids`; empty = every offering). `extra` and partial `off` are gone.
- A date with rows of its own **replaces** the weekly hours of that date; any other date uses `availability_rules`. Weekly rules are now optional: a mentor can plan only by dates.

```
windows(date) = date has rows ? (an off row ? none : its hours rows open to the offering)
                               : the weekly rules of that weekday open to the offering
```
- API: `PUT /mentors/:id/availability` takes `{ rules, dates: [{ day, windows: [{ start, end, templateIds? }] }] }` (empty `windows` = closed; each date at most once, otherwise 422). `GET` returns `dates` in the same shape, today and later. Template ids in date windows must be the mentor's offerings, like rules.
- Offering horizon: default 60 days (was 21), allowed 1–180, so a mentor can open next month and the one after.
- UI: a Saturday-first Jalali month grid (Gregorian in English) for the mentor (multi-select days, select a weekday of the month, set/close/back to weekly) and for the mentee's slot picker.

**Consequences**
- Migration `0014_date_hours`: adds `template_ids`, converts `extra` rows to `hours`, deletes partial `off` rows, rebuilds the CHECKs, new horizon default and range.
- `subtractRanges` was removed from `slots.ts` (no longer needed).
- Everything else in this ADR (offerings, requests, approval, packages, cancellation, locking, access) is unchanged.

# مجموعه‌ی ارزیابی — بررسی جاب و تشخیص اسکم

> **نمونه‌ی ساختگی — باید با نمونه‌های واقعی بنیان‌گذار کالیبره شود.**
> همه‌ی آگهی‌ها، کارفرماها و عددها (از جمله `connects_required`) ساختگی‌اند و هزینه‌ی واقعی Connects را نشان نمی‌دهند. rubric مرجع: `../job-analysis.md` (v0.1).
> upwork-domain-expert — ۲۷ مهر ۱۴۰۵

## نحوه‌ی استفاده در ارزیابی خودکار
خروجی ابزار وقتی «قبول» است که:
1. `verdict` دقیقاً برابر مقدار مورد انتظار باشد (مهم‌ترین شرط)؛
2. همه‌ی `red_flags` مورد انتظار وجود داشته باشند (**recall پرچم قرمز باید ۱۰۰٪ باشد**) و هیچ پرچم قرمز اضافه‌ای نباشد؛
3. پرچم‌های زرد «الزامی» وجود داشته باشند (پرچم زرد اضافه، اگر شاهد درست داشته باشد، مجاز است)؛
4. `overall_score` در بازه باشد (برای نمونه‌هایی که پرچم قرمز دارند بررسی نمی‌شود)؛
5. موارد «باید بگوید» آمده باشند و موارد «نباید بگوید» نیامده باشند.

---

## JA-01 — خوب (اپلای کن)

| فیلد | مقدار |
|---|---|
| امتیاز مورد انتظار | **۸۵ تا ۹۸** |
| حکم | `apply` |
| پرچم قرمز / زرد الزامی | ندارد / ندارد |
| confidence | `high` |

### ورودی
```yaml
client:
  payment_verified: true
  phone_verified: true
  country: United States (Austin, TX)
  member_since: 2019-03
  jobs_posted: 41
  hire_rate_pct: 78
  open_jobs: 2
  total_spent: 48000
  total_hires: 37
  active_hires: 3
  avg_hourly_rate_paid: 38.50
  total_hours: 820
  rating: 4.9
  reviews_count: 29
  recent_reviews_text:
    - "Clear brief, fast feedback, paid a bonus at the end."
    - "Great to work with, knows exactly what she wants."
    - "Communication was excellent throughout."
job:
  title: "Set up 4 core Klaviyo flows for our Shopify skincare store"
  description: |
    We're a Shopify skincare brand (~$40K/month revenue, ~6,000 subscribers). We moved
    from Mailchimp to Klaviyo last month and need these flows built:
    - Welcome series (3 emails)
    - Abandoned cart (3 emails)
    - Browse abandonment (2 emails)
    - Post-purchase (3 emails)
    We have brand guidelines and product photos. You draft the copy, we review it.
    Timeline: 3 weeks. Please share a flow you've built and the results it got.
  job_type: fixed
  budget: 1200
  experience_level: Intermediate
  project_length: Less than 1 month
  posted_ago: 2 hours
  proposals_bucket: "5 to 10"
  last_viewed_by_client: 30 minutes ago
  interviewing: 0
  invites_sent: 1
  unanswered_invites: 1
  hires: 0
  connects_required: 14   # example value entered by user
  screening_questions:
    - "Which flow would you build first and why?"
student:
  niche: Klaviyo email marketing for Shopify stores
  stage: few_contracts   # 2 contracts on Upwork
  target_hourly_rate: 30
  min_acceptable_rate: 20
  portfolio_items:
    - "Welcome + abandoned cart flows for a candle store (Klaviyo) – abandoned cart recovered 9% of carts in month 1"
    - "Newsletter templates for a coffee brand"
  connects_balance: 60
```

### سطح مورد انتظار معیارها
| معیار | سطح | بازه | دلیل |
|---|---|---|---|
| A1 | ۴ | ۴ | تأیید شده |
| A2 | ۴ | ۴ | ۴۸ هزار دلار، ۳۷ استخدام |
| A3 | ۳ | ۳ | ۷۸٪ |
| A4 | ۴ | ۴ | ۴٫۹ از ۲۹ نظر، متن مثبت درباره‌ی ارتباط و پرداخت |
| A5 | ۴ | ۴ | ۳۸٫۵ بیشتر از نرخ هدف ۳۰ |
| B1 | ۴ | ۳ تا ۴ | خروجی‌ها، زمینه و زمان‌بندی مشخص |
| B2 | ۴ | ۳ تا ۴ | ۱۱ ایمیل + راه‌اندازی، تخمین حدود ۳۰ تا ۴۵ ساعت → نرخ مؤثر حدود ۲۷ تا ۴۰ دلار |
| B3 | ۴ | ۳ تا ۴ | انتظارات معقول، فرایند بازبینی روشن |
| C1 | ۳ | ۳ تا ۴ | ۲ ساعت، ۵ تا ۱۰ پروپوزال |
| C2 | ۴ | ۴ | فعال، بدون مصاحبه |
| D1 | ۴ | ۴ | دقیقاً نیچ هنرجو |
| D2 | ۴ | ۳ تا ۴ | flow مشابه با نتیجه‌ی عددی |
| D3 | ۴ | ۴ | Intermediate و بودجه مناسب |

محاسبه با سطح‌های مرکزی: ۳۳٫۲۵ + ۲۵ + ۱۳ + ۲۵ = **۹۶٫۲۵**

### بازخورد مورد انتظار
**باید بگوید:**
- حکم «اپلای کن» با ۳ دلیل: کارفرمای خوش‌سابقه با پرداخت بالاتر از نرخ تو، شرح کار کاملاً روشن، و تناسب دقیق با نمونه‌کار candle store.
- نکات پروپوزال: (۱) در hook به مهاجرت تازه از Mailchimp و ۶ هزار مشترک اشاره کن؛ (۲) نمونه‌ی candle store را با عدد ۹٪ بیاور، چون آگهی صریحاً «results» خواسته؛ (۳) جواب سؤال screening را مشخص بده (مثلاً چرا welcome یا abandoned cart اول) و دلیلش را به درآمد و تعداد مشترک‌ها وصل کن؛ (۴) زود اپلای کن، چون آگهی تازه است.
- یادداشت Connects: فقط هزینه را اعلام کند (۱۴ از ۶۰).

**نباید بگوید:**
- پیشنهاد Boost به‌عنوان توصیه‌ی پیش‌فرض.
- عدد قیمت Connects از حافظه.
- هر اشاره‌ی منفی به کشور.

---

## JA-02 — متوسط (با احتیاط)

| فیلد | مقدار |
|---|---|
| امتیاز مورد انتظار | **۵۰ تا ۶۸** |
| حکم | `caution` |
| پرچم قرمز | ندارد |
| پرچم زرد الزامی | `Y5_bad_reviews` (scope creep) |
| پرچم زرد مجاز | `Y4_vague_urgent` |

### ورودی
```yaml
client:
  payment_verified: true
  country: United Kingdom
  member_since: 2023-11
  jobs_posted: 9
  hire_rate_pct: 44
  open_jobs: 3
  total_spent: 2900
  total_hires: 5
  avg_hourly_rate_paid: 14.20
  rating: 4.4
  reviews_count: 4
  recent_reviews_text:
    - "Good client, but the project grew a lot beyond the original scope."
    - "Paid on time."
job:
  title: "Fix WooCommerce checkout issues + small design changes"
  description: |
    Our WooCommerce store has some checkout problems (sometimes payment fails, and
    shipping options don't show for some countries). We also need some small design
    changes on product pages and maybe a new landing page later.
    Need someone ASAP who can also help with other tasks on an ongoing basis.
  job_type: hourly
  hourly_range: "10-18"
  experience_level: Intermediate
  project_length: 1 to 3 months, less than 30 hrs/week
  posted_ago: 9 hours
  proposals_bucket: "15 to 20"
  last_viewed_by_client: 1 hour ago
  interviewing: 2
  invites_sent: 3
  hires: 0
  connects_required: 10   # example value entered by user
student:
  niche: WordPress / WooCommerce development
  stage: few_contracts   # 1 contract, 5 stars
  target_hourly_rate: 25
  min_acceptable_rate: 15
  portfolio_items:
    - "WooCommerce store for a family business (real client, off-Upwork) with custom shipping rules per region"
  connects_balance: 30
```

### سطح مورد انتظار معیارها
| معیار | سطح | بازه | دلیل |
|---|---|---|---|
| A1 | ۴ | ۴ | |
| A2 | ۳ | ۲ تا ۳ | ۲٬۹۰۰ دلار، ۵ استخدام |
| A3 | ۲ | ۲ | ۴۴٪ |
| A4 | ۲ | ۱ تا ۲ | ۴٫۴؛ یک نظر درباره‌ی scope creep |
| A5 | ۱ | ۱ | ۱۴٫۲ ≈ ۵۷٪ نرخ هدف |
| B1 | ۲ | ۱ تا ۲ | مشکل چک‌اوت روشن است؛ «small design changes»، «landing page later» و «other tasks» مبهم‌اند |
| B2 | ۳ | ۲ تا ۳ | سقف ۱۸ بین حداقل ۱۵ و هدف ۲۵ |
| B3 | ۲ | ۱ تا ۲ | ASAP + «other tasks ongoing» = ریسک scope creep |
| C1 | ۱ | ۱ | ۹ ساعت، ۱۵ تا ۲۰ پروپوزال |
| C2 | ۲ | ۲ | ۲ مصاحبه |
| D1 | ۳ | ۳ تا ۴ | مهارت اصلی |
| D2 | ۳ | ۳ تا ۴ | قانون حمل‌ونقل سفارشی در WooCommerce = بسیار مرتبط با مشکل shipping |
| D3 | ۳ | ۲ تا ۳ | سطح مناسب؛ نرخ کمی پایین |

محاسبه با سطح‌های مرکزی: ۲۰٫۷۵ + ۱۵ + ۵٫۵ + ۱۸٫۷۵ = **۶۰**

### بازخورد مورد انتظار
**باید بگوید:**
- حکم «با احتیاط» با دلیل: نمونه‌کار تو با مشکل shipping عالی جور است (نقطه‌ی قوت)، ولی کارفرما کم‌پرداخت است (میانگین ۱۴ دلار)، رقابت متوسط تا زیاد است و یک نظر قبلی از بزرگ شدن کار خبر می‌دهد.
- پرچم `Y5` با نقل همان نظر.
- نکات پروپوزال اگر اپلای کرد: (۱) hook را روی دو مشکل مشخص چک‌اوت بگذار (پرداخت‌های ناموفق گاه‌به‌گاه، و shipping برای بعضی کشورها) و نمونه‌ی custom shipping rules را بیاور؛ (۲) بپرس کدام درگاه پرداخت و کدام کشورها مشکل دارند؛ (۳) پیشنهاد کن رفع چک‌اوت **جدا** و اول انجام شود و کارهای طراحی بعد از آن تعریف شوند، تا scope کنترل شود.
- یادداشت Connects: ۱۰ از ۳۰ (یک‌سوم موجودی). اگر جاب بهتری در نیچت می‌بینی، Connects را برای آن نگه دار.

**نباید بگوید:**
- «اپلای نکن» به‌خاطر کشور یا hire rate به‌تنهایی.
- اینکه کارفرما اسکم است (هیچ شاهدی نیست).

---

## JA-03 — بد / اسکم (اپلای نکن)

| فیلد | مقدار |
|---|---|
| امتیاز | بررسی نمی‌شود (پرچم قرمز) |
| حکم | `do_not_apply` |
| پرچم قرمز الزامی | `R1_off_platform_contact`، `R2_off_platform_payment`، `R3_freelancer_pays`، `R5_malicious_file` |
| پرچم زرد الزامی | `Y1_payment_unverified`، `Y3_too_good` |
| پرچم زرد مجاز | `Y2_new_empty_client` |
| `report_suggested` | `true` |
| `proposal_tips_fa` | **خالی** |

### ورودی
```yaml
client:
  payment_verified: false
  country: United States
  member_since: 2026-10-18
  jobs_posted: 1
  hire_rate_pct: 0
  open_jobs: 1
  total_spent: 0
  total_hires: 0
  rating: null
  reviews_count: 0
job:
  title: "Remote Data Entry Assistant – $45/hr – No experience needed"
  description: |
    We are a fast growing US company looking for data entry assistants to work
    20 hrs/week. No experience needed, we provide full training. Pay is $45/hr.
    To speed up the process, please contact our HR manager on Telegram
    @hr_jessica_recruit with your full name and email.
    Selected candidates will receive a check to purchase work equipment from our
    approved vendor.
    Please download the attached Job_Details.zip and run the file inside to view
    the full job description.
  job_type: hourly
  hourly_range: "40-50"
  experience_level: Entry
  posted_ago: 20 minutes
  proposals_bucket: "50+"
  interviewing: 0
  invites_sent: 0
  connects_required: 8   # example value entered by user
  attachments: ["Job_Details.zip"]
student:
  niche: Virtual assistant / data entry
  stage: newcomer
  target_hourly_rate: 10
  min_acceptable_rate: 6
  connects_balance: 20
```

### بازخورد مورد انتظار
**باید بگوید:**
- حکم «اپلای نکن» در خط اول، با لحن صریح: این آگهی الگوی شناخته‌شده‌ی اسکم دارد.
- هر پرچم قرمز با نقل‌قول:
  - `R1`: «contact our HR manager on Telegram» → ارتباط بیرون از آپورک پیش از قرارداد ممنوع است.
  - `R2` و `R3`: «receive a check to purchase work equipment from our approved vendor» → الگوی «چک جعلی»: چک برگشت می‌خورد و پولی که برای «تجهیزات» فرستاده‌ای از دست می‌رود.
  - `R5`: «download the attached Job_Details.zip and run the file» → **فایل را باز نکن**؛ ممکن است بدافزار باشد. اگر باز کرده‌ای، اینترنت را قطع کن، آنتی‌ویروس کامل اجرا کن و رمزها را عوض کن.
- پرچم‌های زرد: پرداخت تأییدنشده، حساب یک‌روزه، ۴۵ دلار برای ورود داده بدون تجربه.
- پیشنهاد گزارش آگهی با «Flag as inappropriate».
- هیچ Connectی خرج نکن.

**نباید بگوید:**
- هیچ نکته‌ی پروپوزال یا «اگر خواستی با احتیاط اپلای کن».
- هیچ راهنمایی برای پیام دادن در Telegram «برای اطمینان».
- امتیاز عددی به‌عنوان معیار تصمیم.

---

## JA-04 — مورد مرزی: تست رایگان (دو نسخه)
هدف: آزمودن مرز `R6_unpaid_real_work` (قرمز) و `Y7_small_unpaid_test` (زرد اطلاع‌رسانی).

### ورودی مشترک
```yaml
client:
  payment_verified: true
  country: United States
  member_since: 2021-05
  jobs_posted: 22
  hire_rate_pct: 82
  open_jobs: 1
  total_spent: 21000
  total_hires: 19
  avg_hourly_rate_paid: 32
  rating: 4.8
  reviews_count: 15
  recent_reviews_text: ["Great editorial feedback.", "Paid promptly, clear briefs."]
job:
  title: "SEO writer for a real estate tech blog"
  description_base: |
    We publish 6 articles/month about CRMs and marketing tools for real estate agents.
    Looking for a writer who understands real estate or SaaS. Briefs provided.
    1,200-1,800 words per article.
  job_type: hourly
  hourly_range: "30-40"
  experience_level: Intermediate
  posted_ago: 4 hours
  proposals_bucket: "10 to 15"
  last_viewed_by_client: 1 hour ago
  interviewing: 0
  invites_sent: 0
  hires: 0
student:
  niche: SaaS content writing
  stage: few_contracts
  target_hourly_rate: 30
  min_acceptable_rate: 20
  portfolio_items: ["Two CRM comparison articles for a SaaS client (off-Upwork)"]
```

### JA-04a — تست = کار واقعی رایگان
متن اضافه به آگهی:
```text
As part of our selection, all applicants must write a complete 1,500-word article on
"Best CRMs for Real Estate Agents in 2026". We'll publish the best one on our blog.
This test is unpaid.
```
| مورد انتظار | مقدار |
|---|---|
| حکم | `do_not_apply` |
| پرچم قرمز | `R6_unpaid_real_work` (فقط همین) |
| باید بگوید | «we'll publish the best one» یعنی کار کامل و قابل‌انتشار بدون پرداخت. کارفرما در بقیه‌ی شاخص‌ها خوب است و اسکمر نیست، ولی این شرط کار مجانی است. اگر می‌خواهی، در یک پیام کوتاه و مؤدب قرارداد آزمایشی کوچک و پولی پیشنهاد بده |
| نباید بگوید | که کارفرما کلاهبردار است؛ `R1` تا `R5` |

### JA-04b — تست کوچک و معقول
متن اضافه به آگهی:
```text
Shortlisted writers will be asked to write a 100-word intro for one of our topics
(unpaid, about 15 minutes) before we hire.
```
| مورد انتظار | مقدار |
|---|---|
| حکم | `apply` |
| امتیاز | **۸۰ تا ۹۵** (مرکزی حدود ۹۰) |
| پرچم | `Y7_small_unpaid_test` (اطلاع‌رسانی؛ حکم را محدود نمی‌کند) |
| باید بگوید | تست کوچک و معقول است؛ مرزش را بدان (اگر بعداً مقاله‌ی کامل خواستند، قرارداد پولی پیشنهاد بده). نکته‌ی پروپوزال: نمونه‌ی مقایسه‌ی CRM را در hook بیاور و یک جمله درباره‌ی شناختت از کار مشاوران املاک بگو، **فقط اگر واقعی است** |
| نباید بگوید | «اپلای نکن» یا «با احتیاط» فقط به‌خاطر تست |

> «[قضاوت مربی]» مرز بین JA-04a و JA-04b (چند دقیقه یا چند کلمه کار رایگان قابل‌قبول است) باید با نظر بنیان‌گذار تنظیم شود (`job-analysis.md` بخش ۹، ردیف ۵).

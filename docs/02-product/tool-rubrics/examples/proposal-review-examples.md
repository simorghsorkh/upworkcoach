# مجموعه‌ی ارزیابی — بررسی پروپوزال

> **نمونه‌ی ساختگی — باید با نمونه‌های واقعی بنیان‌گذار کالیبره شود.**
> همه‌ی آگهی‌ها، نام‌ها و عددها ساختگی‌اند. rubric مرجع: `../proposal-review.md` (v0.1).
> upwork-domain-expert — ۲۷ مهر ۱۴۰۵

## نحوه‌ی استفاده در ارزیابی خودکار
- هر نمونه یک **بازه‌ی امتیاز قابل‌قبول** دارد، نه یک عدد دقیق. خروجی ابزار وقتی «قبول» است که:
  1. `overall_score` در بازه باشد؛
  2. `verdict` دقیقاً برابر مقدار مورد انتظار باشد؛
  3. همه‌ی `critical_flags` مورد انتظار (و نه بیشتر) وجود داشته باشند؛
  4. سطح هر معیار در بازه‌ی جدول باشد (حداکثر یک معیار با اختلاف ۱ سطح بیرون از بازه مجاز است)؛
  5. همه‌ی موارد «باید بگوید» در بازخورد فارسی آمده باشند (ارزیابی با LLM-as-judge یا مشاور)؛
  6. هیچ‌کدام از موارد «نباید بگوید» نیامده باشد.
- بعد از جمع‌آوری نمونه‌های واقعی، این سه نمونه می‌مانند و به‌عنوان «تست دود» (smoke test) استفاده می‌شوند.

---

## PR-01 — خوب

| فیلد | مقدار |
|---|---|
| برچسب | good |
| امتیاز مورد انتظار | **۸۵ تا ۹۷** |
| حکم مورد انتظار | `ready` |
| خطای حیاتی | ندارد |

### ورودی: آگهی
```text
Title: Shopify store speed optimization – mobile PageSpeed score is 28

We sell handmade leather bags (DTC, ~40 products) on Shopify using the Dawn theme.
Since we added a reviews app (Judge.me) and an upsell popup two months ago, our mobile
PageSpeed score dropped from ~60 to 28 and mobile conversion went down.

We need someone to find what's slowing the site down and fix it without breaking the
apps we rely on. Please don't just compress images – we've already done that.

Deliverables: audit, fixes, before/after report.
In your proposal, tell us which 2 things you'd check first.

Fixed price: $400 · Experience level: Intermediate
– Emma

Screening question: Have you worked with the Dawn theme before? Share a store you optimized.
```

### ورودی: پروپوزال
```text
Hi Emma,

A drop from ~60 to 28 right after adding Judge.me and an upsell popup usually points to
app scripts loading on every page, not images, which fits what you've already ruled out.
In August I took a Dawn store with a similar setup from 31 to 74 on mobile by deferring
5 app embeds and lazy-loading the reviews widget below the fold.

The 2 things I'd check first:
1. Which app embeds load on every template, and how much main-thread time each one
   costs in Lighthouse.
2. Whether the upsell popup script loads before the product page content, and whether
   it can load after the first user interaction instead.

Plan: audit and a short written report on day 1, fixes on days 2-3 (nothing gets removed
without your OK), then before/after scores for the home, collection and product pages.

One question: is the 28 from the homepage or a product page? Since mobile conversion is
what hurts, I'd measure product pages first.

Best,
Reza

Screening answer: Yes. The store I mentioned above runs Dawn 12; the before/after report
is in my profile portfolio ("Dawn store: mobile 31 → 74").
```

### ورودی: پروفایل هنرجو
```text
Niche: Shopify performance & theme development. Stage: 3 contracts on Upwork.
Portfolio: "Dawn store: mobile 31 → 74" (real client, Aug 2026); "Custom product page sections".
```

### سطح مورد انتظار معیارها
| معیار | سطح | بازه‌ی مجاز | دلیل |
|---|---|---|---|
| hook | ۴ | ۳ تا ۴ | عدد ۲۸، نام اپ‌ها و یک تشخیص اولیه + نتیجه‌ی مشابه در دو جمله |
| personalization | ۴ | ۴ | به محدودیت «تصویر را فشرده کرده‌ایم» و «اپ‌ها نباید خراب شوند» پاسخ داده |
| client_focus | ۴ | ۳ تا ۴ | برنامه‌ی سه‌مرحله‌ای؛ سابقه فقط در خدمت اثبات |
| proof | ۳ | ۳ تا ۴ | یک نمونه‌ی بسیار مرتبط با عدد؛ لینک مستقیم ندارد |
| requirements | ۴ | ۳ تا ۴ | «۲ چیز اول» و سؤال screening هر دو جواب مشخص دارند |
| cta | ۴ | ۳ تا ۴ | سؤال مشخص و آسان + قدم بعدی |
| length_structure | ۳ | ۳ تا ۴ | حدود ۱۹۰ کلمه برای آگهی فنی؛ قابل‌اسکن |
| tone | ۴ | ۳ تا ۴ | هم‌سطح و مشاوره‌ای |
| language | ۴ | ۳ تا ۴ | بی‌خطا |
| authenticity | ۴ | ۳ تا ۴ | جزئیات فنی که فقط کسی که کار را کرده می‌داند؛ بدون عبارت کلیشه‌ای |

### بازخورد مورد انتظار
**باید بگوید:**
- نقطه‌ی قوت: شروع با عدد ۲۸ و تشخیص اولیه‌ی اسکریپت اپ‌ها، که دقیقاً به آگهی وصل است.
- اصلاح اختیاری: لینک مستقیم نمونه‌کار را در جواب screening بگذار، یا اسم دقیق آیتم پورتفولیو را برجسته کن تا کارفرما مجبور به جستجو نشود.
- (اختیاری) جمله‌ی «nothing gets removed without your OK» نقطه‌ی قوت است و با نگرانی کارفرما درباره‌ی اپ‌ها جور است.

**نباید بگوید:**
- پیشنهاد اضافه کردن فهرست مهارت‌ها یا «years of experience».
- پیشنهاد کوتاه کردن شدید (طول برای این آگهی مناسب است).
- هر ایراد ساختگی برای پر کردن «۳ اصلاح». اگر اصلاح مهمی نیست، ابزار باید همین را بگوید.

---

## PR-02 — متوسط

| فیلد | مقدار |
|---|---|
| برچسب | medium |
| امتیاز مورد انتظار | **۵۰ تا ۶۴** |
| حکم مورد انتظار | `revise` |
| خطای حیاتی | ندارد |

### ورودی: آگهی
```text
Title: B2B SaaS blog writer – cybersecurity topics for small business owners

We're a B2B SaaS company selling a password manager for small businesses (10-200
employees). We need a writer for 4 SEO blog posts per month, 1,200-1,500 words each,
on topics like password policies, SSO and phishing, written for non-technical SMB owners.
You'll get a keyword and a brief from our SEO lead.

You must have written about cybersecurity or B2B SaaS before. Please share 2 relevant
samples and tell us your rate per article.

Hourly: $25-$45 (or per-article quote) · Experience level: Intermediate
– Daniel

Screening questions:
1. Share 2 samples of B2B or cybersecurity writing.
2. What is your rate per 1,200-word article?
```

### ورودی: پروپوزال
```text
Hi Daniel,

I write SEO blog posts for B2B SaaS companies, and two of my recent articles cover
exactly your topics: phishing and SSO for small business owners (links in my answers below).

I have 3 years of experience in SEO writing and I can deliver high quality, engaging
content that drives organic traffic. I always follow the brief and keyword strategy
provided by the SEO team, and I research every topic carefully using reliable sources.

What you can expect from me:
- SEO optimized articles
- Plagiarism free content
- On time delivery
- Unlimited revisions

I would be happy to discuss your project further. Looking forward to hearing from you.

Best regards,
Sara

Screening answers:
1. "7 Ways to Protect Your Small Business from Phishing" (published on a SaaS client's
   blog) – [link]; "What Is SSO? A Plain-English Guide for Startup Founders" – [link]
2. $90 per 1,200-word article.
```

### ورودی: پروفایل هنرجو
```text
Niche: B2B SaaS content writing. Stage: 2 contracts on Upwork, plus off-Upwork clients.
Portfolio: the two articles above (real, published).
```

### سطح مورد انتظار معیارها
| معیار | سطح | بازه‌ی مجاز | دلیل |
|---|---|---|---|
| hook | ۳ | ۲ تا ۳ | موضوع‌های مشخص و اشاره به نمونه‌ها؛ ولی زاویه‌ای درباره‌ی «مخاطب غیرفنی» ندارد |
| personalization | ۲ | ۱ تا ۲ | بعد از خط اول، متن برای هر آگهی نویسندگی SEO قابل‌ارسال است |
| client_focus | ۲ | ۱ تا ۲ | درباره‌ی «من» و ویژگی‌ها؛ هیچ ایده‌ای درباره‌ی نوشتن برای صاحب کسب‌وکار کوچک ندارد |
| proof | ۲ | ۲ تا ۳ | نمونه‌های مرتبط در جواب‌ها هست، ولی هیچ نتیجه‌ای (ترافیک، رتبه) گفته نشده |
| requirements | ۳ | ۳ تا ۴ | هر دو سؤال مشخص جواب داده شده |
| cta | ۱ | ۱ | «Looking forward to hearing from you» |
| length_structure | ۳ | ۲ تا ۳ | طول مناسب |
| tone | ۲ | ۲ | مؤدب و خنثی |
| language | ۳ | ۳ | تقریباً بی‌خطا («SEO optimized»، «Plagiarism free» بدون خط تیره، جزئی) |
| authenticity | ۱ | ۰ تا ۱ | `high quality, engaging content`، `drives organic traffic`، بولت‌های «What you can expect»، `Looking forward to hearing from you` |

محاسبه با سطح‌های مرکزی: ۱۵ + ۷٫۵ + ۵ + ۷٫۵ + ۷٫۵ + ۱٫۲۵ + ۳٫۷۵ + ۲٫۵ + ۳٫۷۵ + ۲٫۵ = **۵۶٫۲۵**

### بازخورد مورد انتظار
**باید بگوید (به ترتیب اولویت):**
1. **اثبات:** نمونه‌ها عالی و مرتبط‌اند، ولی نتیجه ندارند. اگر داده‌ی واقعی (رتبه، ترافیک، تعداد share) داری، یک عدد کنار هر نمونه بنویس؛ با جای خالی، نه عدد ساختگی.
2. **پاراگراف دوم و بولت‌ها:** این بخش عمومی و AI‌گونه است (نقل همان عبارت‌ها). به‌جایش یک جمله درباره‌ی **چطور برای صاحب کسب‌وکار غیرفنی درباره‌ی SSO می‌نویسی** بگذار؛ نکته‌ای که آگهی روی آن تأکید کرده.
3. **CTA:** با یک سؤال مشخص تمام کن، مثلاً درباره‌ی اینکه brief تیم SEO شامل internal linking هست یا نه، یا پیشنهاد یک outline برای اولین موضوع.
- نکته‌ی جانبی (خارج از امتیاز): «Unlimited revisions» برای همکاری ماهانه ریسک کاری دارد؛ تعداد بازبینی را مشخص کن.

**نباید بگوید:**
- که hook بد است (خط اول نسبتاً خوب است).
- که سؤال‌ها بی‌جواب مانده‌اند.
- نظر قطعی درباره‌ی بالا یا پایین بودن ۹۰ دلار، جز یک اشاره‌ی کوتاه (قیمت‌گذاری ابزار جداگانه دارد).

---

## PR-03 — بد

| فیلد | مقدار |
|---|---|
| برچسب | bad |
| امتیاز مورد انتظار | **۰ تا ۲۰** (سقف C1) |
| حکم مورد انتظار | `do_not_send` |
| خطای حیاتی | `C1_off_platform`، `C2_wrong_job`، `C3_unanswered_required`، `C4_inconsistent_claim`، `C5_unpaid_work_offer` |

### ورودی: آگهی
```text
Title: Logo for a small organic coffee roaster

Looking for a logo for "Hill & Hearth", a small organic coffee roaster in Vermont.
We want something warm with a hand-drawn feel that works on coffee bags and a small
shop sign. Please share 3 logo samples from food or beverage brands.
Start your proposal with the word "roast" so we know you read this.

Fixed price: $300 · Experience level: Intermediate
– Megan
```

### ورودی: پروپوزال
```text
Dear Sir/Madam,

I hope this message finds you well. I am a highly skilled graphic designer with 10+ years
of experience in logo design, branding, web design, UI/UX, video editing and social media
marketing. I have completed 500+ projects with 100% client satisfaction.

I have carefully read your requirements for your website and I am confident I am the
perfect fit for this project. I will deliver top-notch quality, unlimited revisions and
source files.

I can also do the first 3 concepts for free so you can see my skills.

For faster communication please add me on WhatsApp: +98 912 000 0000

Kindly give me a chance, I will not disappoint you.

Thanks
```

### ورودی: پروفایل هنرجو
```text
Niche: logo & brand identity. Stage: newcomer, no client work yet, ~1 year of practice.
Portfolio: 4 practice logos for fictional tech startups.
```

### سطح مورد انتظار معیارها
| معیار | سطح | بازه‌ی مجاز |
|---|---|---|
| hook | ۰ | ۰ |
| personalization | ۰ | ۰ |
| client_focus | ۰ | ۰ |
| proof | ۰ | ۰ |
| requirements | ۰ | ۰ |
| cta | ۰ | ۰ |
| length_structure | ۲ | ۱ تا ۲ |
| tone | ۰ | ۰ تا ۱ |
| language | ۲ | ۲ تا ۳ |
| authenticity | ۰ | ۰ |

### بازخورد مورد انتظار
**باید بگوید (به ترتیب):**
1. **خط قرمز:** شماره‌ی WhatsApp را حذف کن. دادن اطلاعات تماس پیش از قرارداد خلاف قوانین آپورک است و می‌تواند به محدودیت یا بسته شدن حساب منجر شود. (همچنین هشدار حریم خصوصی: شماره‌ی شخصی در متنی که برای غریبه‌ها می‌رود.)
2. **ادعای ناسازگار:** «10+ years» و «500+ projects» با پرونده‌ات (تازه‌کار، نمونه‌های تمرینی) نمی‌خواند. کارفرما در مصاحبه یا از روی پروفایل متوجه می‌شود. فقط آنچه واقعی است بنویس. لحن غیراتهامی.
3. **دستورهای آگهی:** آگهی خواسته بود با کلمه‌ی «roast» شروع کنی و ۳ نمونه‌ی food/beverage بفرستی؛ هیچ‌کدام انجام نشده. همچنین به «website» اشاره کرده‌ای در حالی که آگهی درباره‌ی لوگوست (نشانه‌ی کپی).
- همچنین: پیشنهاد ۳ کانسپت رایگان ارزش کارت را پایین می‌آورد؛ پیشنهاد «Dear Sir/Madam» در حالی که نام کارفرما Megan است؛ «Kindly give me a chance» لحن التماسی دارد.
- پیشنهاد سازنده: hook نمونه با جای خالی، مثلاً `Roast – a hand-drawn mark for Hill & Hearth needs to read clearly at bag size and on a small sign, so I'd start with [your approach].` و اینکه نمونه‌های تمرینی را صادقانه به‌عنوان «concept work» معرفی کند یا پیش از اپلای یک نمونه‌ی مرتبط با food/beverage بسازد.

**نباید بگوید:**
- هیچ راه جایگزینی برای «ارتباط سریع‌تر» بیرون از آپورک.
- بازنویسی کامل پروپوزال آماده‌ی ارسال.
- نقد کشور یا پیش‌شماره‌ی تلفن. مشکل اطلاعات تماس است، نه ملیت.
- عدد ساختگی جایگزین (مثلاً «بنویس 3 years»).

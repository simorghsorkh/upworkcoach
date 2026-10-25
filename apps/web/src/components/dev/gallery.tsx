'use client';

import Link from 'next/link';
import { useState } from 'react';
import { faNumber } from '@/components/format/fa';
import { Icon } from '@/components/icons/icon';
import { type IconName, iconPaths } from '@/components/icons/paths';
import { Avatar } from '@/components/ui/avatar';
import {
  Ball,
  Count,
  type Health,
  HealthBadge,
  RuleCode,
  Tag,
  type TaskStatus,
  TaskStatusChip,
} from '@/components/ui/badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, CardHead } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { Dialog } from '@/components/ui/dialog';
import { SelectField, TextareaField, TextField } from '@/components/ui/field';
import { PageHead } from '@/components/ui/page-head';
import { PathBar } from '@/components/ui/path-bar';
import { Alert, EmptyState, ErrorState, SkeletonRows } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';

/**
 * Development-only gallery of the UI kit, rendered inside the real shells by
 * /dev/shell. Mirrors docs/03-ux/mockups/states.html for side-by-side review.
 */
export function Gallery({ role }: { role: 'admin' | 'mentor' | 'student' }) {
  const toast = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const people = [
    'امیر رستمی',
    'زهرا کریمی',
    'سارا احمدی',
    'رضا محمدی',
    'لیلا نوری',
    'مهدی صالحی',
    'نگار حسینی',
    'پویا کاظمی',
  ];

  return (
    <>
      <PageHead
        eyebrow="فقط محیط توسعه"
        title="قاب و کامپوننت‌ها"
        sub={
          <span>نقش فعلی: {role === 'admin' ? 'مدیر' : role === 'mentor' ? 'مشاور' : 'هنرجو'}</span>
        }
        actions={
          <>
            <nav
              aria-label="نقش نمونه"
              className="flex gap-1 rounded-[10px] border border-line bg-surface-3 p-[3px]"
            >
              {(
                [
                  ['admin', 'مدیر'],
                  ['mentor', 'مشاور'],
                  ['student', 'هنرجو'],
                ] as const
              ).map(([r, label]) => (
                <Link
                  key={r}
                  href={`/dev/shell?role=${r}`}
                  aria-current={r === role ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-8 items-center rounded-btn-sm px-3 text-sm font-semibold text-fg-2',
                    r === role && 'bg-surface text-fg shadow-sm',
                  )}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <Button className="max-md:hidden">
              <Icon name="plus" size={16} />
              افزودن
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-5">
        <Card aria-labelledby="g-btn">
          <CardHead title="دکمه‌ها" titleId="g-btn" icon="zap" />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary">اقدام اصلی</Button>
            <Button variant="soft">اقدام ردیف</Button>
            <Button>ثانویه</Button>
            <Button variant="ghost">متنی</Button>
            <Button variant="link">پیوند</Button>
            <Button variant="danger">مخرب</Button>
            <Button variant="danger-solid">لغو کار</Button>
            <Button variant="primary" loading>
              در حال ثبت…
            </Button>
            <Button disabled>غیرفعال</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm">
              <Icon name="check" size={16} />
              کوچک
            </Button>
            <ButtonLink href="/dev/shell?role=student" size="lg" variant="primary">
              بزرگ (هنرجو)
              <Icon name="next" size={16} />
            </ButtonLink>
          </div>
        </Card>

        <Card aria-labelledby="g-badge">
          <CardHead title="نشان‌ها و برچسب‌ها" titleId="g-badge" icon="flag" />
          <div className="flex flex-wrap items-center gap-2">
            {(['green', 'yellow', 'red', 'churn', 'paused'] as Health[]).map((h) => (
              <HealthBadge key={h} health={h}>
                {h === 'paused' ? 'متوقف تا ۶ آبان' : undefined}
              </HealthBadge>
            ))}
            <HealthBadge health="red" muted>
              هشدار خاموش تا ۵ آبان
            </HealthBadge>
            <HealthBadge health="yellow" dot />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <HealthBadge health="red" />
            <span className="text-sm text-fg-2">۲ کار معوق · ۹ روز بی‌فعالیت</span>
            <RuleCode>R-OVERDUE, R-INACT</RuleCode>
            <Ball>توپ: هنرجو</Ball>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(
              [
                'open',
                'in_progress',
                'submitted',
                'changes',
                'accepted',
                'cancelled',
              ] as TaskStatus[]
            ).map((s) => (
              <TaskStatusChip key={s} status={s}>
                {s === 'changes' ? 'نیاز به اصلاح · دور ۲' : undefined}
              </TaskStatusChip>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Tag variant="overdue">معوق · ۴ روز</Tag>
            <Tag variant="late">دیر · ۵۲ ساعت</Tag>
            <Tag variant="urgent">فوری</Tag>
            <Tag variant="new">جدید</Tag>
            <Tag variant="gate">اجباری برای عبور</Tag>
            <Tag>برچسب آزاد</Tag>
            <Count value={12} />
            <Count value={5} tone="brand" />
            <Count value={3} tone="alert" label="۳ سؤال بی‌پاسخ" />
          </div>
        </Card>

        <Card aria-labelledby="g-people">
          <CardHead title="آواتار و مسیر" titleId="g-people" icon="users" />
          <div className="flex flex-wrap items-center gap-2">
            {people.map((name) => (
              <span key={name} className="inline-flex items-center gap-2 text-ui font-semibold">
                <Avatar id={name} name={name} />
                {name}
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Avatar id="x" name="امیر" size="xs" />
            <Avatar id="x" name="امیر" size="sm" />
            <Avatar id="x" name="امیر" />
            <Avatar id="x" name="امیر" size="lg" />
            <Avatar id="x" name="امیر" size="xl" />
          </div>
          <ul className="mt-4 flex flex-col gap-3">
            {[0, 3, 5, 8].map((stage) => (
              <li key={stage} className="flex items-center gap-3 text-ui">
                <PathBar current={stage} />
                <span className="text-fg-2">مرحله‌ی {faNumber(stage)}</span>
              </li>
            ))}
          </ul>
          <PathBar current={2} large className="mt-4" />
        </Card>

        <Card aria-labelledby="g-form">
          <CardHead title="فرم" titleId="g-form" icon="pen" />
          <div className="grid gap-x-6 md:grid-cols-2">
            <TextField label="نام هنرجو" placeholder="مثلاً زهرا کریمی" />
            <TextField
              label="شماره‌ی موبایل"
              dir="ltr"
              inputMode="tel"
              defaultValue="0912"
              error="این شماره‌ی موبایل درست به نظر نمی‌رسد."
            />
            <SelectField label="مشاور" defaultValue="reza">
              <option value="reza">رضا</option>
              <option value="leila">لیلا</option>
            </SelectField>
            <TextField label="آیدی تلگرام" optional hint="بدون @ هم قبول است." />
          </div>
          <TextareaField label="یادداشت" placeholder="بعد از جلسه یا پیام تلگرامی…" />
        </Card>

        <div className="grid gap-5 xl:grid-cols-2">
          <Card aria-labelledby="g-empty">
            <CardHead title="حالت‌های خالی" titleId="g-empty" icon="inbox" />
            <EmptyState icon="check-circle" tone="ok" title="امروز کار عقب‌مانده‌ای نیست.">
              مرور هفتگی: ۱۲ هنرجو تا شنبه
            </EmptyState>
            <EmptyState
              icon="users"
              tone="brand"
              title="هنوز هنرجویی نساخته‌ای"
              action={
                <Button variant="primary">
                  <Icon name="plus" size={16} />
                  هنرجوی جدید
                </Button>
              }
            >
              اولین نفر را اضافه کن و لینک دعوتش را در تلگرام بفرست.
            </EmptyState>
          </Card>
          <Card aria-labelledby="g-load">
            <CardHead title="بارگذاری و خطا" titleId="g-load" icon="refresh" />
            <SkeletonRows rows={3} />
            <ErrorState onRetry={() => toast.show({ message: 'دوباره تلاش شد' })} />
          </Card>
        </div>

        <Card aria-labelledby="g-alert">
          <CardHead title="هشدارها، پیام موقت، پنجره" titleId="g-alert" icon="bell" />
          <Alert tone="warn" icon="lock" title="توجه:">
            رمز یا کد ورود هیچ حسابی را این‌جا ننویس.
          </Alert>
          <Alert tone="error" title="ذخیره نشد.">
            متنت سر جایش است؛ دوباره بزن.
          </Alert>
          <Alert tone="neutral" icon="wifi-off" title="اتصال قطع است.">
            آخرین اطلاعات را می‌بینی؛ ثبت‌ها بعد از وصل شدن ارسال می‌شوند.
          </Alert>
          <Alert tone="info" title="توجه:">
            ۱ کار باز مرحله‌ی ۵ دارد.
          </Alert>
          <Alert tone="ok" title="تحویل شد.">
            رضا معمولاً تا ۴۸ ساعت نگاه می‌کند.
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                toast.show({ message: 'امیر به مرحله‌ی ۶ رفت', onUndo: () => undefined })
              }
            >
              نمایش پیام موقت
            </Button>
            <Button variant="soft" onClick={() => setDialogOpen(true)}>
              باز کردن پنجره
            </Button>
          </div>
        </Card>

        <Card aria-labelledby="g-icons">
          <CardHead
            title="آیکن‌ها"
            titleId="g-icons"
            icon="grid"
            count={Object.keys(iconPaths).length}
          />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
            {(Object.keys(iconPaths) as IconName[]).map((name) => (
              <div
                key={name}
                dir="ltr"
                className="flex flex-col items-center gap-1.5 rounded-sm border border-line px-1 py-3 text-2xs text-fg-3"
              >
                <Icon name={name} className="text-fg" />
                {name}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="تغییر مرحله‌ی امیر"
        description="مرحله‌ی فعلی: ۵ · پروپوزال و ارسال"
        footer={
          <>
            <Button onClick={() => setDialogOpen(false)}>منصرف شدم</Button>
            <Button variant="primary" onClick={() => setDialogOpen(false)}>
              ثبت
            </Button>
          </>
        }
      >
        <SelectField label="مرحله‌ی تازه" defaultValue="6">
          <option value="6">۶ · مصاحبه و اولین قرارداد</option>
          <option value="4">۴ · پیدا کردن فرصت</option>
        </SelectField>
        <TextareaField label="یادداشت" optional />
      </Dialog>
    </>
  );
}

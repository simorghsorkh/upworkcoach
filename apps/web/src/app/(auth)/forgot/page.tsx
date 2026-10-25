import type { Metadata } from 'next';
import { Icon } from '@/components/icons/icon';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = { title: 'فراموشی رمز' };

/**
 * G4 — no OTP in 0.1 and no public reset endpoint: the page only explains that the
 * coach creates a reset link (`POST /users/:id/reset-link`) and sends it.
 */
export default function ForgotPage() {
  return (
    <>
      <span
        aria-hidden="true"
        className="mb-4 grid size-14 place-items-center rounded-[18px] bg-primary-weak-2 text-primary-text"
      >
        <Icon name="lock" size={26} />
      </span>
      <h1 className="mb-2 text-xl">رمزت را فراموش کرده‌ای؟</h1>
      <p className="mb-4 text-md text-fg-2">
        اشکالی ندارد. به مربی‌ات پیام بده (در تلگرام یا هر راهی که با او در تماسی) و بگو رمزت یادت
        رفته. او یک لینک تازه برایت می‌فرستد که ۲۴ ساعت معتبر است و با آن رمز تازه می‌گذاری.
      </p>
      <ol className="mb-6 flex list-none flex-col gap-2 p-0 text-ui">
        {[
          'به مربی‌ات پیام بده.',
          'لینکی را که می‌فرستد روی همین دستگاه باز کن.',
          'شماره‌ی موبایلت و رمز تازه را بنویس.',
        ].map((step, i) => (
          <li
            key={step}
            className="flex items-center gap-3 rounded-md border border-line bg-bg p-3"
          >
            <span className="grid size-7 flex-none place-items-center rounded-full border-[1.5px] border-line-2 bg-surface text-sm font-extrabold text-fg-2">
              {(i + 1).toLocaleString('fa-IR')}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <p className="mb-6 flex items-start gap-2 text-sm text-fg-3">
        <Icon name="info" size={16} className="mt-0.5" />
        هیچ‌کس از طرف ما رمزت را نمی‌پرسد؛ رمز را برای کسی نفرست.
      </p>
      <ButtonLink href="/login" block>
        <Icon name="back" size={16} />
        بازگشت به ورود
      </ButtonLink>
    </>
  );
}

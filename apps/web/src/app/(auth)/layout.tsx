import type { ReactNode } from 'react';
import { BrandMark } from '@/components/shell/brand';

/** Signed-out pages: one centred card on the paper background. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 pt-10 pb-8 md:justify-center md:pt-8">
      <div className="w-full max-w-auth">
        <div className="mb-6 flex items-center justify-center gap-3">
          <BrandMark />
          <span>
            <span className="block text-h2 leading-[22px] font-extrabold">UpworkCoach</span>
            <span className="block text-xs leading-4 font-medium text-fg-3">دفتر مربی</span>
          </span>
        </div>
        <main id="main" className="rounded-lg border border-line bg-surface p-5 shadow-md md:p-7">
          {children}
        </main>
      </div>
    </div>
  );
}

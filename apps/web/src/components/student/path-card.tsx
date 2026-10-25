import Link from 'next/link';
import { faNumber } from '@/components/format/fa';
import { Icon } from '@/components/icons/icon';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import type { ContentLinkDTO } from '@/modules/catalog/contracts';
import type { MyPathDTO, MyPathStageDTO } from '@/modules/path/contracts';

/** Full stepper (mockups §7 `.stepper`): done = filled with a check, current = ringed + «اینجایی». */
export function PathStepper({ stages }: { stages: MyPathStageDTO[] }) {
  return (
    <ol
      aria-label="مراحل مسیر"
      className="-mx-2 my-4 flex snap-x snap-proximity overflow-x-auto pt-1 pb-2 [scrollbar-width:thin]"
    >
      {stages.map((s) => {
        const done = s.state === 'passed';
        const current = s.state === 'current';
        return (
          <li
            key={s.id}
            aria-current={current ? 'step' : undefined}
            className={cn(
              'relative flex-[1_0_68px] snap-center px-0.5 text-center text-xs leading-4',
              'before:absolute before:-start-1/2 before:top-[15px] before:z-0 before:h-0.5 before:w-full first:before:hidden',
              done || current ? 'before:bg-primary' : 'before:bg-line-2',
              done ? 'text-fg-2' : current ? 'font-bold text-fg' : 'text-fg-3',
            )}
          >
            <span
              className={cn(
                'relative z-[1] mx-auto grid place-items-center rounded-full border-2 font-bold',
                current
                  ? '-mt-0.5 mb-1 size-9 border-primary bg-primary-weak text-md text-primary-text shadow-ring'
                  : 'mb-1.5 size-8 text-sm',
                done && 'border-primary bg-primary text-white',
                !done && !current && 'border-line-2 bg-surface text-fg-3',
              )}
            >
              {done ? (
                <>
                  <Icon name="check" size={16} />
                  <span className="sr-only">انجام‌شده:</span>
                </>
              ) : (
                s.displayCode
              )}
            </span>
            {s.name}
            {current ? (
              <>
                <br />
                <span className="mt-1 inline-block rounded-full bg-primary px-2 py-0.5 text-2xs font-bold text-white">
                  اینجایی
                </span>
              </>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Content links of a stage: open in a new tab, no referrer (SEC-X6). */
export function ContentLinks({ links }: { links: ContentLinkDTO[] }) {
  if (!links.length) {
    return <p className="mt-4 text-sm text-fg-3">محتوای این مرحله را مشاورت برایت می‌فرستد.</p>;
  }
  return (
    <div className="mt-4 flex flex-col gap-2">
      {links.map((l) => (
        <a
          key={l.url}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-md border border-line p-3 text-ui font-medium text-fg hover:border-primary-line hover:bg-primary-weak"
        >
          <span
            aria-hidden="true"
            className="grid size-9 flex-none place-items-center rounded-[10px] bg-surface-2 text-fg-2"
          >
            <Icon name="checklist" />
          </span>
          <span className="min-w-0 flex-1">
            {l.title}
            <span className="block text-xs font-normal text-fg-3">در صفحه‌ی جدید باز می‌شود</span>
          </span>
          <Icon name="external" size={16} className="text-fg-3" />
        </a>
      ))}
    </div>
  );
}

/** S1 «مسیر من» card (mockups/student-home.html): stepper, this stage's output, next, links. */
export function PathCard({ path, showAllLink = true }: { path: MyPathDTO; showAllLink?: boolean }) {
  return (
    <Card aria-labelledby="h-path">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="h-path" className="flex items-center gap-2 text-h2">
          <Icon name="route" className="text-fg-3" />
          مسیر من
        </h2>
        {showAllLink ? (
          <Link
            href="/my/path"
            className="inline-flex items-center gap-1 text-sm font-semibold text-link hover:underline"
          >
            کل مسیر
            <Icon name="chev-next" size={16} />
          </Link>
        ) : null}
      </div>
      <PathStepper stages={path.stages} />
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-line bg-bg px-4 py-3 text-ui leading-[22px]">
          <span className="mb-0.5 block text-xs font-semibold text-fg-3">خروجی این مرحله</span>
          {path.current.studentDescription ? (
            <span className="whitespace-pre-line">{path.current.studentDescription}</span>
          ) : (
            <span className="text-fg-2">{`${path.current.displayCode} ${path.current.name}`}</span>
          )}
        </div>
        <div className="rounded-md border border-line bg-bg px-4 py-3 text-ui leading-[22px]">
          <span className="mb-0.5 block text-xs font-semibold text-fg-3">بعدی</span>
          {path.next ? path.next.name : 'این آخرین مرحله‌ی مسیر است؛ از این‌جا رشد ادامه دارد.'}
        </div>
      </div>
      <ContentLinks links={path.current.contentLinks} />
    </Card>
  );
}

/** «مرحله‌ی ۱ از ۸: انتخاب نیچ» */
export function stageLine(path: MyPathDTO): string {
  const last = path.stages.at(-1);
  return last
    ? `مرحله‌ی ${path.current.displayCode} از ${last.displayCode}: ${path.current.name}`
    : `مرحله‌ی ${path.current.displayCode}: ${path.current.name}`;
}

export function stageCountText(path: MyPathDTO): string {
  const passed = path.stages.filter((s) => s.state === 'passed').length;
  return `${faNumber(passed)} مرحله پشت سر گذاشته‌ای`;
}

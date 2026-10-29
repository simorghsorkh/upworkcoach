import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { faNumber } from '@/components/format/fa';
import { Icon } from '@/components/icons/icon';
import { ContentLinks, PathCard } from '@/components/student/path-card';
import { ButtonLink } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { PageHead } from '@/components/ui/page-head';
import { NoRecord } from '../../_components';
import { loadOwn } from '../../_load';

export const metadata: Metadata = { title: 'مسیر من' };

const stateText = { passed: 'پشت سر گذاشتی', current: 'اینجایی', locked: 'بعداً' } as const;

/** S6 — my path: the home stepper, opened up with every stage's output and links. */
export default async function MyPathPage() {
  const [{ path }, t] = await Promise.all([loadOwn(), getTranslations('nav')]);
  if (!path) return <NoRecord />;
  return (
    <>
      <PageHead
        title="مسیر من"
        sub={`${faNumber(path.stages.length)} مرحله؛ مشاورت عبور از هر مرحله را تأیید می‌کند.`}
        actions={
          <ButtonLink href="/my/programs" variant="soft" size="sm" className="md:hidden">
            <Icon name="flag" size={14} />
            {t('programs')}
          </ButtonLink>
        }
      />
      <div className="flex flex-col gap-4 md:gap-5">
        <PathCard path={path} showAllLink={false} />
        <Card aria-labelledby="h-all-stages">
          <h2 id="h-all-stages" className="mb-2 text-h2">
            همه‌ی مراحل
          </h2>
          <ol className="-mx-4 md:-mx-5">
            {path.stages.map((s) => (
              <li
                key={s.id}
                className={cn(
                  'border-t border-line px-4 py-3 first:border-t-0 md:px-5',
                  s.state === 'current' && 'bg-primary-weak',
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'grid size-8 flex-none place-items-center rounded-full border-2 text-sm font-bold',
                      s.state === 'passed' && 'border-primary bg-primary text-white',
                      s.state === 'current' && 'border-primary bg-surface text-primary-text',
                      s.state === 'locked' && 'border-line-2 text-fg-3',
                    )}
                  >
                    {s.state === 'passed' ? <Icon name="check" size={16} /> : s.displayCode}
                  </span>
                  <span className="min-w-0 flex-1 font-semibold">{s.name}</span>
                  <span className="text-xs text-fg-3">{stateText[s.state]}</span>
                </div>
                {s.studentDescription ? (
                  <p className="ms-11 mt-1 text-sm whitespace-pre-line text-fg-2">
                    {s.studentDescription}
                  </p>
                ) : null}
                {s.state !== 'locked' && s.contentLinks.length ? (
                  <div className="ms-11">
                    <ContentLinks links={s.contentLinks} />
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}

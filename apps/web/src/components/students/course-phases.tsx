'use client';

import { useTranslations } from 'next-intl';
import { Icon } from '@/components/icons/icon';
import { cn } from '@/components/ui/cn';
import type { CoursePhaseDTO } from '@/modules/programs/contracts';

/**
 * A mentee's place in each course other than the main path (sprint 5c): "Course · phase 2 of 4:
 * title · 12 days", coloured like the stage days when longer than usual. Nothing without courses.
 */
export function CoursePhases({
  courses,
  className,
}: {
  courses: readonly CoursePhaseDTO[];
  className?: string;
}) {
  const t = useTranslations('courseBoard');
  if (!courses.length) return null;
  return (
    <ul aria-label={t('coursesOf')} className={cn('flex flex-col gap-0.5 text-xs', className)}>
      {courses.map((c) => (
        <li key={c.enrollmentId} className="flex flex-wrap items-center gap-x-1 text-fg-2">
          <Icon name="flag" size={12} className="text-fg-3" />
          <bdi className="font-semibold text-fg">{c.run.title}</bdi>
          {c.phase ? (
            <>
              <span>
                {' · '}
                {t('phaseLabel', {
                  position: c.phase.position,
                  count: c.phaseCount,
                  title: c.phase.title,
                })}
              </span>
              {c.status === 'paused' ? (
                <span className="text-fg-3">· {t('paused')}</span>
              ) : c.daysInPhase !== null ? (
                <span
                  className={cn(
                    c.overExpected === 'warn' && 'font-bold text-h-yellow-fg',
                    c.overExpected === 'over' && 'font-bold text-h-red-fg',
                  )}
                >
                  · {t('days', { count: c.daysInPhase })}
                </span>
              ) : null}
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useFormat } from '@/components/format/use-format';
import { Icon } from '@/components/icons/icon';
import { PhaseDialog } from '@/components/programs/phase-dialog';
import { HealthPill } from '@/components/students/health';
import { Avatar } from '@/components/ui/avatar';
import { Tag } from '@/components/ui/badge';
import { cn } from '@/components/ui/cn';
import { useToast } from '@/components/ui/toast';
import type { HealthSummary } from '@/modules/health/summary';
import type { EnrollmentDTO } from '@/modules/programs/contracts';

export type BoardPhase = {
  id: string;
  title: string;
  expectedDays: number | null;
  isOpenEnded: boolean;
  isGate: boolean;
};

type Card = EnrollmentDTO & {
  health: HealthSummary | null;
  overExpected: 'none' | 'warn' | 'over';
};

const VISIBLE = 6;

/**
 * Course board (Coach Office sprint 5c): one column per phase of the chosen course, a card per
 * member who holds a seat. Same look as the main-path kanban; "Change phase" on each card opens
 * the stage-change rules of the course (no drag, WCAG 2.5.7).
 */
export function PhaseBoard({
  phases,
  cards,
  canMove,
}: {
  phases: BoardPhase[];
  cards: Card[];
  canMove: boolean;
}) {
  const t = useTranslations('courseBoard');
  const tp = useTranslations('programs');
  const format = useFormat();
  const router = useRouter();
  const toast = useToast();
  const [moving, setMoving] = useState<Card | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const expectedLabel = (p: BoardPhase) =>
    p.isOpenEnded
      ? t('openEnded')
      : p.expectedDays === null
        ? t('expectedVariable')
        : t('expected', { count: p.expectedDays });

  return (
    <>
      <nav
        aria-label={t('jump')}
        className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pt-0.5 pb-1 [scrollbar-width:none] md:hidden"
      >
        {phases.map((p, i) => (
          <a
            key={p.id}
            href={`#col-${p.id}`}
            className="inline-flex min-h-[34px] flex-none items-center gap-1.5 rounded-full border border-line-2 bg-surface px-3 text-sm font-medium text-fg"
          >
            <b className="font-extrabold text-fg-3">{format.number(i + 1)}</b>
            <bdi>{p.title}</bdi>
            {` · ${format.number(cards.filter((c) => c.phase?.id === p.id).length)}`}
          </a>
        ))}
      </nav>
      <section
        aria-label={t('columns')}
        className="relative grid snap-x snap-proximity auto-cols-[272px] grid-flow-col items-start gap-3 overflow-x-auto pb-4 [scrollbar-color:var(--c-border-2)_transparent] [scrollbar-width:thin] max-md:-mx-4 max-md:auto-cols-[85%] max-md:snap-mandatory max-md:scroll-px-4 max-md:px-4"
      >
        {phases.map((phase, index) => {
          const here = cards
            .filter((c) => c.phase?.id === phase.id)
            .sort((a, b) => (b.daysInPhase ?? 0) - (a.daysInPhase ?? 0));
          const open = expanded[phase.id];
          const shown = open ? here : here.slice(0, VISIBLE);
          const hidden = here.length - shown.length;
          const headingId = `pk-${phase.id}`;
          return (
            <section
              key={phase.id}
              id={`col-${phase.id}`}
              aria-labelledby={headingId}
              className="relative min-h-60 snap-start rounded-lg border border-line bg-surface-2 p-2"
            >
              <header className="px-2 pt-2 pb-3">
                <div className="flex items-center gap-2">
                  <span className="inline-grid size-6 flex-none place-items-center rounded-[7px] border border-line-2 bg-surface text-xs font-extrabold text-fg-2">
                    {format.number(index + 1)}
                  </span>
                  <h2 id={headingId} className="min-w-0 flex-1 text-ui leading-[22px]">
                    <bdi>{phase.title}</bdi>
                  </h2>
                  {phase.isGate ? <Tag variant="gate">{tp('gate')}</Tag> : null}
                  <span className="inline-flex h-[22px] min-w-[26px] items-center justify-center rounded-full border border-line-2 bg-surface px-[7px] text-xs font-bold">
                    <span aria-hidden="true">{format.number(here.length)}</span>
                    <span className="sr-only">{t('people', { count: here.length })}</span>
                  </span>
                </div>
                <span className="mt-1.5 flex items-center gap-1 text-xs text-fg-3">
                  <Icon name="clock" size={14} />
                  {expectedLabel(phase)}
                </span>
              </header>
              <ul className="flex flex-col gap-2">
                {shown.map((c) => (
                  <li key={c.id}>
                    <CourseCard
                      card={c}
                      canMove={canMove && c.status === 'active' && phases.length > 1}
                      onMove={() => setMoving(c)}
                    />
                  </li>
                ))}
              </ul>
              {here.length === 0 ? (
                <p className="rounded-md border border-dashed border-line-2 px-3 py-4 text-center text-sm text-fg-3">
                  {t('emptyColumn')}
                </p>
              ) : null}
              {hidden > 0 || open ? (
                <button
                  type="button"
                  aria-expanded={Boolean(open)}
                  onClick={() => setExpanded((e) => ({ ...e, [phase.id]: !open }))}
                  className="mt-2 flex min-h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-line-2 text-sm font-semibold text-fg-2 hover:border-solid hover:bg-surface hover:text-fg"
                >
                  {open ? '−' : `+ ${format.number(hidden)}`}
                  <Icon name="chev-down" size={16} className={open ? 'rotate-180' : undefined} />
                </button>
              ) : null}
            </section>
          );
        })}
      </section>
      {moving ? (
        <PhaseDialog
          enrollmentId={moving.id}
          studentName={moving.student.displayName}
          phases={phases}
          currentPosition={moving.phase?.position ?? null}
          onClose={() => setMoving(null)}
          onSaved={() => {
            setMoving(null);
            toast.show({ message: tp('toast.phaseChanged') });
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function CourseCard({
  card: c,
  canMove,
  onMove,
}: {
  card: Card;
  canMove: boolean;
  onMove: () => void;
}) {
  const t = useTranslations('courseBoard');
  const days = c.daysInPhase ?? 0;
  const daysText =
    c.overExpected === 'over'
      ? t('over', { count: days })
      : c.overExpected === 'warn'
        ? t('warn', { count: days })
        : t('days', { count: days });
  return (
    <article
      className={cn(
        'group relative rounded-md border border-line bg-surface p-3 text-fg shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-primary-line hover:shadow-md focus-within:border-focus',
        c.overExpected !== 'none' &&
          'before:absolute before:-start-px before:top-2.5 before:bottom-2.5 before:w-[3px] before:rounded-[3px]',
        c.overExpected === 'warn' && 'before:bg-h-yellow-bd',
        c.overExpected === 'over' && 'before:bg-h-red-fg',
      )}
    >
      <div className="flex items-center gap-2">
        <Avatar id={c.student.id} name={c.student.displayName} size="sm" />
        <Link
          href={`/students/${c.student.id}`}
          className="min-w-0 flex-1 truncate text-ui font-bold text-fg after:absolute after:inset-0 after:rounded-[inherit] hover:text-link focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus"
        >
          {c.student.displayName}
        </Link>
        {canMove ? (
          <button
            type="button"
            onClick={onMove}
            aria-haspopup="dialog"
            aria-label={t('move', { name: c.student.displayName })}
            className="relative z-[2] inline-grid size-7 flex-none cursor-pointer place-items-center rounded-sm border border-line-2 bg-surface text-fg-2 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-fg focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <Icon name="next" size={16} />
          </button>
        ) : null}
      </div>
      {c.status === 'paused' ? (
        <div className="mt-2">
          <Tag variant="outline" icon="pause">
            {t('paused')}
          </Tag>
        </div>
      ) : c.health && c.health.status !== 'untracked' ? (
        <div className="mt-2">
          <HealthPill health={c.health} />
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-fg-2">
        <span
          className={cn(
            'inline-flex items-center gap-1 font-medium',
            c.overExpected === 'warn' && 'font-bold text-h-yellow-fg',
            c.overExpected === 'over' && 'font-bold text-h-red-fg',
          )}
        >
          <Icon
            name="clock"
            size={14}
            className={c.overExpected === 'none' ? 'text-fg-3' : undefined}
          />
          {daysText}
        </span>
      </div>
    </article>
  );
}

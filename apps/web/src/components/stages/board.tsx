'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { faDays, faNumber } from '@/components/format/fa';
import { reasonText } from '@/components/health/reasons';
import { Icon } from '@/components/icons/icon';
import { HealthPill } from '@/components/students/health';
import { Avatar } from '@/components/ui/avatar';
import { HealthBadge, Tag } from '@/components/ui/badge';
import { cn } from '@/components/ui/cn';
import type { BoardDTO, BoardStudentDTO } from '@/modules/path/contracts';
import {
  ChangeStageDialog,
  type PathStage,
  type StageMoveTarget,
  type SuggestedTemplate,
} from './change-stage-dialog';

type Column = BoardDTO['columns'][number];

const VISIBLE = 5;

function expectedLabel(stage: Column['stage']): string {
  if (stage.isOpenEnded) return 'پیوسته';
  if (stage.expectedDays === null) return 'معمول: متغیر';
  return `معمول: تا ${faDays(stage.expectedDays)}`;
}

function daysLabel(s: BoardStudentDTO): string {
  if (s.overExpected === 'over') return `${faDays(s.daysInStage)} · ۲ برابر معمول`;
  if (s.overExpected === 'warn') return `${faDays(s.daysInStage)} · بیش از معمول`;
  return faDays(s.daysInStage);
}

/**
 * M4 kanban (mockups/kanban.html, design-system §3-3): 272px columns scrolling inside the
 * board (never the page); on mobile one column ≈ 85% wide with mandatory snap and a row of
 * stage chips. "Move to…" on every card is the accessible way to move (WCAG 2.5.7); no drag.
 */
export function Board({
  columns,
  templates,
}: {
  columns: Column[];
  /** Task templates, for "Default tasks" of the target stage. */
  templates?: readonly SuggestedTemplate[];
}) {
  const [moving, setMoving] = useState<StageMoveTarget | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [current, setCurrent] = useState<string | null>(columns[0]?.stage.id ?? null);
  const boardRef = useRef<HTMLElement>(null);

  const pathStages: PathStage[] = columns
    .filter((c) => c.stage.isActive)
    .map((c) => ({ id: c.stage.id, name: c.stage.name, displayCode: c.stage.displayCode }));

  // Highlight the stage chip of the column in view (mobile).
  useEffect(() => {
    const board = boardRef.current;
    if (!board || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const id = visible?.target.getAttribute('data-stage');
        if (id) setCurrent(id);
      },
      { root: board, threshold: [0.6] },
    );
    for (const el of board.querySelectorAll('[data-stage]')) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div
        role="note"
        aria-label="راهنما"
        className="mb-4 hidden flex-wrap items-center gap-x-5 gap-y-2 text-xs text-fg-3 md:flex"
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-flex h-1 w-6 gap-[2px] overflow-hidden rounded-[2px]">
            <span className="flex-1 bg-h-red-fg" />
            <span className="flex-1 bg-h-yellow-bd" />
            <span className="flex-1 bg-h-green-fg" />
          </span>
          نوار هر ستون: گیرکرده، نیاز به توجه، روبه‌راه
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-[3px] rounded-[2px] bg-h-yellow-bd" />
          بیش از زمان معمول مرحله
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-[3px] rounded-[2px] bg-h-red-fg" />۲ برابر زمان
          معمول
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Icon name="info" size={14} />
          جابه‌جایی: دکمه‌ی «انتقال» روی هر کارت
        </span>
      </div>

      <nav
        aria-label="پرش به مرحله"
        className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pt-0.5 pb-1 [scrollbar-width:none] md:hidden"
      >
        {columns.map((c) => (
          <a
            key={c.stage.id}
            href={`#col-${c.stage.id}`}
            aria-current={current === c.stage.id ? 'true' : undefined}
            onClick={(e) => {
              e.preventDefault();
              document
                .getElementById(`col-${c.stage.id}`)
                ?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
              setCurrent(c.stage.id);
            }}
            className={cn(
              'inline-flex min-h-[34px] flex-none items-center gap-1.5 rounded-full border px-3 text-sm font-medium',
              current === c.stage.id
                ? 'border-fg bg-fg text-surface'
                : 'border-line-2 bg-surface text-fg',
            )}
          >
            <b
              className={cn('font-extrabold', current === c.stage.id ? 'opacity-70' : 'text-fg-3')}
            >
              {c.stage.displayCode}
            </b>
            {`${c.stage.name} · ${faNumber(c.students.length)}`}
          </a>
        ))}
      </nav>

      <section
        ref={boardRef}
        aria-label="ستون‌های مراحل"
        className="relative grid snap-x snap-proximity auto-cols-[272px] grid-flow-col items-start gap-3 overflow-x-auto pb-4 [scrollbar-color:var(--c-border-2)_transparent] [scrollbar-width:thin] max-md:-mx-4 max-md:auto-cols-[85%] max-md:snap-mandatory max-md:scroll-px-4 max-md:px-4"
      >
        {columns.map((col) => {
          // Column health bar (mockups `.kcol-bar`): red, yellow, green; paused students and
          // not-yet-computed ones are left out of the bar.
          const red = col.students.filter((s) => s.health?.status === 'red').length;
          const yellow = col.students.filter((s) => s.health?.status === 'yellow').length;
          const green = col.students.filter((s) => s.health?.status === 'green').length;
          const barLabel = `${faNumber(red)} گیرکرده، ${faNumber(yellow)} نیاز به توجه، ${faNumber(green)} روبه‌راه`;
          const open = expanded[col.stage.id];
          const shown = open ? col.students : col.students.slice(0, VISIBLE);
          const hidden = col.students.length - shown.length;
          const headingId = `k-${col.stage.id}`;
          return (
            <section
              key={col.stage.id}
              id={`col-${col.stage.id}`}
              data-stage={col.stage.id}
              aria-labelledby={headingId}
              className="relative min-h-60 snap-start rounded-lg border border-line bg-surface-2 p-2"
            >
              <header className="px-2 pt-2 pb-3">
                <div className="flex items-center gap-2">
                  <span className="inline-grid size-6 flex-none place-items-center rounded-[7px] border border-line-2 bg-surface text-xs font-extrabold text-fg-2">
                    {col.stage.displayCode}
                  </span>
                  <h2 id={headingId} className="flex-1 text-ui leading-[22px]">
                    {col.stage.name}
                    {!col.stage.isActive ? (
                      <span className="ms-1 text-xs font-medium text-fg-3">(غیرفعال)</span>
                    ) : null}
                  </h2>
                  <span className="inline-flex h-[22px] min-w-[26px] items-center justify-center rounded-full border border-line-2 bg-surface px-[7px] text-xs font-bold">
                    <span aria-hidden="true">{faNumber(col.students.length)}</span>
                    <span className="sr-only">{`${faNumber(col.students.length)} هنرجو`}</span>
                  </span>
                </div>
                <span className="mt-1.5 flex items-center gap-1 text-xs text-fg-3">
                  <Icon name="clock" size={14} />
                  {expectedLabel(col.stage)}
                </span>
                <div
                  role="img"
                  aria-label={`سلامت این مرحله: ${barLabel}`}
                  title={barLabel}
                  className="mt-2 flex h-1 gap-[3px] overflow-hidden rounded-[2px] bg-surface-3"
                >
                  {red ? <span className="block h-full bg-h-red-fg" style={{ flex: red }} /> : null}
                  {yellow ? (
                    <span className="block h-full bg-h-yellow-bd" style={{ flex: yellow }} />
                  ) : null}
                  {green ? (
                    <span className="block h-full bg-h-green-fg" style={{ flex: green }} />
                  ) : null}
                </div>
              </header>
              <ul className="flex flex-col gap-2">
                {shown.map((s) => (
                  <li key={s.id}>
                    <KanbanCard
                      student={s}
                      onMove={() =>
                        setMoving({
                          id: s.id,
                          displayName: s.displayName,
                          daysInStage: s.daysInStage,
                          stage: {
                            id: col.stage.id,
                            name: col.stage.name,
                            displayCode: col.stage.displayCode,
                          },
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
              {col.students.length === 0 ? (
                <p className="rounded-md border border-dashed border-line-2 px-3 py-4 text-center text-sm text-fg-3">
                  کسی در این مرحله نیست
                </p>
              ) : null}
              {hidden > 0 || open ? (
                <button
                  type="button"
                  aria-expanded={Boolean(open)}
                  onClick={() => setExpanded((e) => ({ ...e, [col.stage.id]: !open }))}
                  className="mt-2 flex min-h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-line-2 text-sm font-semibold text-fg-2 hover:border-solid hover:bg-surface hover:text-fg"
                >
                  {open ? 'جمع کردن' : `+ ${faNumber(hidden)} نفر دیگر`}
                  <Icon name="chev-down" size={16} className={open ? 'rotate-180' : undefined} />
                </button>
              ) : null}
            </section>
          );
        })}
      </section>

      <ChangeStageDialog
        student={moving}
        stages={pathStages}
        open={moving !== null}
        onClose={() => setMoving(null)}
        templates={templates}
      />
    </>
  );
}

function KanbanCard({ student: s, onMove }: { student: BoardStudentDTO; onMove: () => void }) {
  return (
    <article
      className={cn(
        'group relative rounded-md border border-line bg-surface p-3 text-fg shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-primary-line hover:shadow-md focus-within:border-focus',
        s.overExpected !== 'none' &&
          'before:absolute before:-start-px before:top-2.5 before:bottom-2.5 before:w-[3px] before:rounded-[3px]',
        s.overExpected === 'warn' && 'before:bg-h-yellow-bd',
        s.overExpected === 'over' && 'before:bg-h-red-fg',
      )}
    >
      <div className="flex items-center gap-2">
        <Avatar id={s.id} name={s.displayName} size="sm" />
        <Link
          href={`/students/${s.id}`}
          className="min-w-0 flex-1 truncate text-ui font-bold text-fg after:absolute after:inset-0 after:rounded-[inherit] hover:text-link focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus"
        >
          {s.displayName}
        </Link>
        <button
          type="button"
          onClick={onMove}
          aria-haspopup="dialog"
          aria-label={`انتقال ${s.displayName} به مرحله‌ی دیگر`}
          className="relative z-[2] inline-grid size-7 flex-none cursor-pointer place-items-center rounded-sm border border-line-2 bg-surface text-fg-2 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-fg focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <Icon name="next" size={16} />
        </button>
      </div>
      {s.health && s.health.status !== 'untracked' ? (
        <div className="mt-2 flex flex-col items-start gap-1">
          <HealthPill health={s.health} />
          {s.health.reasons.length && s.health.status !== 'green' ? (
            <p className="text-xs leading-[18px] text-fg-2">
              {s.health.reasons
                .slice(0, 2)
                .map((r) => reasonText(r))
                .join(' · ')}
            </p>
          ) : null}
        </div>
      ) : s.lifecycleStatus === 'paused' ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <HealthBadge health="paused">متوقف</HealthBadge>
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-fg-2">
        <span
          className={cn(
            'inline-flex items-center gap-1 font-medium',
            s.overExpected === 'warn' && 'font-bold text-h-yellow-fg',
            s.overExpected === 'over' && 'font-bold text-h-red-fg',
          )}
        >
          <Icon
            name="clock"
            size={14}
            className={s.overExpected === 'none' ? 'text-fg-3' : undefined}
          />
          {daysLabel(s)}
        </span>
        {s.accountStatus === 'invited' ? <Tag variant="outline">هنوز وارد نشده</Tag> : null}
      </div>
    </article>
  );
}

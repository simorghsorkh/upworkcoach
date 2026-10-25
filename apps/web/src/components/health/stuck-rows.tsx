import Link from 'next/link';
import { faNumber, tehranDaysBetween } from '@/components/format/fa';
import { Icon } from '@/components/icons/icon';
import { BallChip, HealthPill, HealthReasonLine } from '@/components/students/health';
import { Avatar } from '@/components/ui/avatar';
import { Tag } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { PathBar } from '@/components/ui/path-bar';
import type { StudentListItemDTO } from '@/modules/students/contracts';
import { ruleAdvice } from './reasons';

export type RedNoAction = { escalated: boolean; breached: boolean };

/**
 * «هنرجوهای گیرکرده» rows (mockups/today.html #stuck, user-flows §7): badge, the reason in
 * plain Persian with the rule code, «توپ در زمین …», «قرمز از N روز · بدون اقدام» and the
 * escalation tag. Churn risk always comes first.
 */
export function StuckRows({
  items,
  viewerId,
  positions,
  redNoAction,
  now,
}: {
  items: StudentListItemDTO[];
  viewerId: string;
  positions: Map<string, number>;
  /** studentId → red without a recorded action (from `waitingOnUs`). */
  redNoAction: Map<string, RedNoAction>;
  now: Date;
}) {
  const sorted = [...items]
    .map((s, i) => ({ s, i }))
    .sort(
      (a, b) =>
        Number(Boolean(b.s.health?.churnRisk)) - Number(Boolean(a.s.health?.churnRisk)) ||
        a.i - b.i,
    )
    .map(({ s }) => s);
  return (
    <ul className="-mx-4 md:-mx-5">
      {sorted.map((s) => {
        const h = s.health;
        const noAction = redNoAction.get(s.id);
        const redDays =
          h && h.status === 'red' ? tehranDaysBetween(new Date(h.statusSince), now) : null;
        const advice = h?.reasons.map((r) => ruleAdvice[r.rule]).find(Boolean);
        const noTask = h?.reasons.some((r) => r.rule === 'R-NOTASK');
        return (
          <li
            key={s.id}
            className={cn(
              'relative flex items-start gap-3 border-t border-line px-4 py-3 first:border-t-0 max-md:flex-wrap md:px-5',
              noAction &&
                'before:absolute before:start-0 before:top-2.5 before:bottom-2.5 before:w-[3px] before:rounded-[3px] before:bg-h-red-fg',
            )}
          >
            <Avatar id={s.id} name={s.displayName} className="mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/students/${s.id}`} className="font-semibold text-fg hover:text-link">
                  {s.displayName}
                </Link>
                {h ? <HealthPill health={h} /> : null}
              </div>
              {h ? <HealthReasonLine health={h} className="mt-1" /> : null}
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-fg-2">
                <PathBar current={positions.get(s.stage.id) ?? 0} total={positions.size} />
                <span>{`${s.stage.displayCode} ${s.stage.name}`}</span>
                {s.mentor ? (
                  <span>{`مشاور: ${s.mentor.id === viewerId ? 'خودم' : s.mentor.displayName}`}</span>
                ) : null}
                {h?.ball ? <BallChip ball={h.ball} /> : null}
                {noAction ? (
                  <Tag variant="late">
                    {redDays && redDays > 0
                      ? `قرمز از ${faNumber(redDays)} روز پیش · بدون اقدام`
                      : 'تازه قرمز · بدون اقدام'}
                  </Tag>
                ) : null}
                {noAction?.escalated ? (
                  <Tag variant="overdue" icon="flag">
                    ارجاع به بنیان‌گذار
                  </Tag>
                ) : null}
              </div>
              {advice && h?.status !== 'green' ? (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-fg-2">
                  <Icon name="phone" size={14} className="text-fg-3" />
                  {`پیشنهاد: ${advice}`}
                </p>
              ) : null}
            </div>
            <div className="flex flex-none items-center gap-2 max-md:w-full max-md:ps-12">
              {noAction ? (
                <Link
                  href={`/students/${s.id}?add=note`}
                  className={buttonClass({
                    size: 'sm',
                    variant: 'soft',
                    className: 'max-md:flex-1',
                  })}
                  aria-label={`ثبت اقدام برای ${s.displayName}`}
                >
                  <Icon name="pen" size={16} />
                  ثبت اقدام
                </Link>
              ) : noTask ? (
                <Link
                  href={`/students/${s.id}?add=task`}
                  className={buttonClass({
                    size: 'sm',
                    variant: 'soft',
                    className: 'max-md:flex-1',
                  })}
                  aria-label={`کار تازه برای ${s.displayName}`}
                >
                  <Icon name="plus" size={16} />
                  کار
                </Link>
              ) : null}
              <Link
                href={`/students/${s.id}`}
                className={buttonClass({ size: 'sm', className: 'max-md:flex-1' })}
                aria-label={`پرونده‌ی ${s.displayName}`}
              >
                پرونده
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

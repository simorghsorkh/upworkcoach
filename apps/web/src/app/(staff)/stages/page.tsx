import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { faNumber } from '@/components/format/fa';
import { Board } from '@/components/stages/board';
import { CoursePicker } from '@/components/stages/course-picker';
import { MentorFilter } from '@/components/stages/mentor-filter';
import { PhaseBoard } from '@/components/stages/phase-board';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { SegNav } from '@/components/ui/seg';
import { EmptyState } from '@/components/ui/states';
import { listTaskTemplates } from '@/modules/catalog/service';
import { healthSummariesOf } from '@/modules/health/service';
import { listMentors } from '@/modules/identity/service';
import { boardQuery } from '@/modules/path/contracts';
import { getBoard } from '@/modules/path/service';
import { getRun, listRuns } from '@/modules/programs/service';
import { overExpected } from '@/modules/students/policy';
import { requireUser, toActor } from '@/server/auth/current-user';
import { param } from '../_data';

export const metadata: Metadata = { title: 'مراحل مسیر' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * M4 — stages kanban (mockups/kanban.html). Sprint 5c: every course has its own phases; the
 * course select (`run`) shows the board of one course, the empty value the main path.
 */
export default async function StagesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['admin', 'mentor']);
  const actor = toActor(user);
  const isAdmin = user.role === 'admin';
  const sp = await searchParams;
  const [tb, runs] = await Promise.all([getTranslations('courseBoard'), listRuns(actor)]);
  const openRuns = runs.filter((r) => r.status === 'draft' || r.status === 'active');
  const mainPath = openRuns.find((r) => r.isLegacy);
  const courses = openRuns.filter((r) => !r.isLegacy && r.kind === 'program');
  const selected = courses.find((r) => r.id === param(sp.run)) ?? null;
  const picker = courses.length ? (
    <CoursePicker
      label={tb('course')}
      value={selected?.id ?? ''}
      options={[
        { id: '', label: tb('mainPath', { title: mainPath?.title ?? '' }) },
        ...courses.map((r) => ({ id: r.id, label: r.title })),
      ]}
    />
  ) : null;
  const viewNav = (
    <SegNav
      label="نوع نما"
      current="/stages"
      items={[
        { href: '/students', label: 'فهرست', icon: 'list' },
        { href: '/stages', label: 'مراحل', icon: 'board' },
      ]}
    />
  );

  if (selected) {
    const run = await getRun(actor, selected.id);
    const seated = run.enrollments.filter((e) => e.status === 'active' || e.status === 'paused');
    const health = await healthSummariesOf(
      actor,
      seated.map((e) => e.student.id),
    );
    const cards = seated.map((e) => {
      const phase = run.phases.find((p) => p.id === e.phase?.id);
      return {
        ...e,
        health: health.get(e.student.id) ?? null,
        overExpected:
          phase && e.status === 'active' && e.daysInPhase !== null
            ? overExpected(e.daysInPhase, phase)
            : ('none' as const),
      };
    });
    return (
      <>
        <PageHead
          title={<bdi>{run.title}</bdi>}
          sub={tb('sub', {
            active: seated.filter((e) => e.status === 'active').length,
            paused: seated.filter((e) => e.status === 'paused').length,
          })}
          actions={
            <>
              {viewNav}
              {picker}
              <Link
                href={`/programs/runs/${run.id}`}
                className={buttonClass({ variant: 'secondary' })}
              >
                {tb('openRun')}
              </Link>
            </>
          }
        />
        <p className="mb-3 text-sm text-fg-3">{tb('hint')}</p>
        {run.phases.length === 0 ? (
          <Card>
            <EmptyState icon="board" tone="brand" title={tb('noPhases')} headingLevel={2} />
          </Card>
        ) : (
          <>
            {seated.length === 0 ? <p className="mb-3 text-sm text-fg-2">{tb('empty')}</p> : null}
            <PhaseBoard
              phases={run.phases.map((p) => ({
                id: p.id,
                title: p.title,
                expectedDays: p.expectedDays,
                isOpenEnded: p.isOpenEnded,
                isGate: p.isGate,
              }))}
              cards={cards}
              canMove
            />
          </>
        )}
      </>
    );
  }

  const mentorId = isAdmin ? param(sp.mentorId) : '';
  const parsed = boardQuery.safeParse(mentorId ? { mentorId } : {});
  const [board, mentors, templates] = await Promise.all([
    getBoard(actor, parsed.success ? parsed.data : {}),
    isAdmin ? listMentors(actor) : Promise.resolve([]),
    listTaskTemplates(actor, {}).catch(() => []),
  ]);

  const all = board.columns.flatMap((c) => c.students);
  const active = all.filter((s) => s.lifecycleStatus === 'active').length;
  const paused = all.filter((s) => s.lifecycleStatus === 'paused').length;

  return (
    <>
      <PageHead
        title="مراحل مسیر"
        sub={`${faNumber(active)} هنرجوی فعال · ${faNumber(paused)} متوقف`}
        actions={
          <>
            {viewNav}
            {picker}
            {isAdmin ? (
              <MentorFilter
                value={parsed.success ? mentorId : ''}
                mentors={mentors.map((m) => ({
                  id: m.id,
                  label: m.id === user.id ? 'خودم' : m.displayName,
                }))}
              />
            ) : null}
          </>
        }
      />
      {all.length === 0 && !mentorId ? (
        <Card>
          <EmptyState
            icon="board"
            tone="brand"
            title="هنوز هنرجویی در مسیر نیست"
            headingLevel={2}
            action={
              <Link href="/students?new=1" className={buttonClass({ variant: 'primary' })}>
                هنرجوی جدید
              </Link>
            }
          >
            وقتی هنرجو بسازی، این‌جا می‌بینی هر کس در کدام مرحله است و چند روز مانده.
          </EmptyState>
        </Card>
      ) : (
        <Board columns={board.columns} templates={templates} />
      )}
    </>
  );
}

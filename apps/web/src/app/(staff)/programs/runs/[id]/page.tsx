import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { GoalsCard } from '@/components/mentoring/goals-card';
import { SessionsCard } from '@/components/mentoring/sessions-card';
import { RunManager } from '@/components/programs/run-manager';
import { listMentors } from '@/modules/identity/service';
import { listGoals, listSessions } from '@/modules/mentoring/service';
import { getRun } from '@/modules/programs/service';
import { listStudents } from '@/modules/students/service';
import { requireUser, toActor } from '@/server/auth/current-user';
import { ApiError } from '@/server/http/errors';

type Params = Promise<{ id: string }>;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('pageTitle'))('programRun') };
}

/**
 * One program run: its phases (a snapshot), staff and enrollments (ADR-0012); sprint 5b: its
 * mentoring sessions and, for one-on-one mentoring, each member's goals.
 */
export default async function ProgramRunPage({ params }: { params: Params }) {
  const user = await requireUser(['admin', 'mentor']);
  const actor = toActor(user);
  const t = await getTranslations('mentoring.goals');
  const { id } = await params;
  let run: Awaited<ReturnType<typeof getRun>>;
  try {
    run = await getRun(actor, id);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 422)) notFound();
    throw err;
  }
  const enrolled = new Set(run.enrollments.map((e) => e.student.id));
  const seated = run.enrollments.filter((e) => e.status === 'active' || e.status === 'paused');
  const oneOnOne = run.kind === 'one_on_one' && !run.isLegacy;
  const [mentors, students, upcoming, past, goals] = await Promise.all([
    run.can.manageStaff ? listMentors(actor) : Promise.resolve([]),
    run.can.enroll ? listStudents(actor, { limit: 100 }) : Promise.resolve({ items: [] }),
    listSessions(actor, { runId: run.id, when: 'upcoming' }),
    listSessions(actor, { runId: run.id, when: 'past' }),
    oneOnOne
      ? Promise.all(
          run.enrollments
            .filter((e) => e.status !== 'dropped')
            .map(async (e) => {
              try {
                return { enrollment: e, list: await listGoals(actor, e.id) };
              } catch (err) {
                if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
                  return null;
                }
                throw err;
              }
            }),
        )
      : Promise.resolve([]),
  ]);
  const open = run.status === 'draft' || run.status === 'active';
  return (
    <>
      <RunManager
        run={run}
        viewerId={user.id}
        staffOptions={mentors.map((m) => ({ id: m.id, label: m.displayName }))}
        studentOptions={students.items
          .filter((s) => !enrolled.has(s.id))
          .map((s) => ({ id: s.id, label: s.displayName }))}
      />
      <div className="mt-4 grid items-start gap-4 md:mt-5 md:gap-5 lg:grid-cols-[2fr_1fr]">
        <SessionsCard
          runId={run.id}
          members={seated.map((e) => ({
            enrollmentId: e.id,
            studentId: e.student.id,
            name: e.student.displayName,
          }))}
          allowGroup={run.mode === 'group' && !run.isLegacy}
          canBook={open}
          defaultMinutes={60}
          initial={{ upcoming, past }}
        />
        {oneOnOne ? (
          <div className="flex flex-col gap-4 md:gap-5">
            {goals
              .flatMap((g) => (g ? [g] : []))
              .map(({ enrollment, list }) => (
                <GoalsCard
                  key={enrollment.id}
                  enrollmentId={enrollment.id}
                  title={t('goalsOf', { name: enrollment.student.displayName })}
                  initial={list.goals}
                  canEdit={list.can.edit && enrollment.status !== 'dropped'}
                />
              ))}
          </div>
        ) : null}
      </div>
    </>
  );
}

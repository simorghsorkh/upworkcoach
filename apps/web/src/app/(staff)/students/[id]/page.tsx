import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { CheckinList } from '@/components/checkins/checkin-list';
import { faDate, faDayMonth, faDays, faNumber, faRelativeDay } from '@/components/format/fa';
import { FlagsList } from '@/components/health/health-dialogs';
import { Icon, type IconName } from '@/components/icons/icon';
import { StudentProgramsCard } from '@/components/mentors/student-programs-card';
import { StaffMilestones } from '@/components/milestones/staff-milestones';
import { NoteForm } from '@/components/notes/note-form';
import { Timeline } from '@/components/notes/timeline';
import { formatRate, ProfileStatusChip } from '@/components/profiles/profile-display';
import { ProfilesManager } from '@/components/profiles/profiles-manager';
import { QuestionRows } from '@/components/questions/question-rows';
import { ReminderList } from '@/components/reminders/reminder-list';
import { QuickAddTarget } from '@/components/shell/quick-add';
import { ChangeStageButton } from '@/components/stages/change-stage-dialog';
import { EditInfoDialog } from '@/components/students/edit-info-dialog';
import { BallChip, HealthPill, HealthReasonList } from '@/components/students/health';
import {
  completenessFieldLabel,
  levelLabel,
  lifecycleLabel,
  priorExperienceLabel,
} from '@/components/students/labels';
import { StudentActions } from '@/components/students/student-actions';
import { NewTaskButton } from '@/components/tasks/new-task-dialog';
import { DueText, TaskStatusBadge } from '@/components/tasks/task-bits';
import { Avatar } from '@/components/ui/avatar';
import { HealthBadge, Tag } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Card, CardHead } from '@/components/ui/card';
import { cn } from '@/components/ui/cn';
import { ExternalLink } from '@/components/ui/ltr';
import { PathBar } from '@/components/ui/path-bar';
import { PlatformBadge } from '@/components/ui/platform';
import { EmptyState } from '@/components/ui/states';
import { toLocalMobile } from '@/lib/phone';
import {
  listMilestoneTypes,
  listPlatforms,
  listStages,
  listTaskTemplates,
  listTracks,
} from '@/modules/catalog/service';
import type { CheckinListDTO } from '@/modules/checkins/contracts';
import { listStudentCheckins } from '@/modules/checkins/service';
import { getStudentHealth, listFlags } from '@/modules/health/service';
import { listMentors } from '@/modules/identity/service';
import { listMentorDirectory } from '@/modules/mentors/service';
import { listStudentMilestones } from '@/modules/milestones/service';
import { getStageHistory } from '@/modules/path/service';
import { listStudentEnrollments } from '@/modules/programs/service';
import { listQuestions } from '@/modules/questions/service';
import { listReminders } from '@/modules/reminders/service';
import type { StaffStudentDTO } from '@/modules/students/contracts';
import { getStudent, listStudentProfiles } from '@/modules/students/service';
import type { StaffTaskDTO } from '@/modules/tasks/contracts';
import { listStudentTasks } from '@/modules/tasks/service';
import { getTimeline } from '@/modules/timeline/service';
import { requireUser, toActor } from '@/server/auth/current-user';
import { ApiError } from '@/server/http/errors';
import { param } from '../../_data';

type Params = Promise<{ id: string }>;

async function load(id: string) {
  const user = await requireUser(['admin', 'mentor']);
  const actor = toActor(user);
  try {
    const student = await getStudent(actor, id);
    const [
      profiles,
      history,
      stages,
      platforms,
      tracks,
      mentors,
      tasks,
      timeline,
      templates,
      reminders,
      healthDetail,
      flags,
      questions,
      checkins,
      milestones,
      milestoneTypes,
      enrollments,
      mentorCards,
    ] = await Promise.all([
      listStudentProfiles(actor, id),
      getStageHistory(actor, id),
      listStages(actor),
      listPlatforms(actor),
      listTracks(actor),
      user.role === 'admin' ? listMentors(actor) : Promise.resolve([]),
      listStudentTasks(actor, id),
      getTimeline(actor, id, { limit: 20 }),
      listTaskTemplates(actor, {}),
      Promise.all([
        listReminders(actor, { scope: 'today', studentId: id }),
        listReminders(actor, { scope: 'upcoming', studentId: id }),
      ]).then(([a, b]) => [...a, ...b]),
      getStudentHealth(actor, id).catch(() => null),
      listFlags(actor, id, { active: true }).catch(() => []),
      listQuestions(actor, { studentId: id, limit: 10 }).catch(() => ({
        items: [],
        nextCursor: null,
      })),
      // 404 = weekly check-in is turned off in the settings.
      listStudentCheckins(actor, id, { limit: 4 }).catch((): CheckinListDTO | null => null),
      listStudentMilestones(actor, id).catch(() => []),
      listMilestoneTypes(actor).catch(() => []),
      listStudentEnrollments(actor, id),
      user.role === 'admin' ? listMentorDirectory(actor).then((d) => d.items) : Promise.resolve([]),
    ]);
    return {
      user,
      student,
      profiles,
      history,
      stages,
      platforms,
      tracks,
      mentors,
      tasks,
      timeline,
      templates,
      reminders,
      healthDetail,
      flags,
      questions,
      checkins,
      milestones,
      milestoneTypes,
      enrollments,
      mentorCards,
    };
  } catch (err) {
    // Missing and out-of-scope look the same (ADR-0004): one «پیدا نشد» page.
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  try {
    const user = await requireUser(['admin', 'mentor']);
    const student = await getStudent(toActor(user), id);
    return { title: student.displayName };
  } catch {
    return { title: 'پرونده‌ی هنرجو' };
  }
}

function Meta({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon name={icon} size={16} className="text-fg-3" />
      {children}
    </span>
  );
}

function Tile({ icon, q, children }: { icon: IconName; q: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-md border border-line bg-bg p-3 md:p-4">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-fg-3">
        <Icon name={icon} size={14} />
        {q}
      </span>
      {children}
    </div>
  );
}

function expectedText(stage: StaffStudentDTO['stage']): string {
  if (stage.isOpenEnded) return 'پیوسته';
  if (stage.expectedDays === null) return 'معمول: متغیر';
  return `معمول: تا ${faDays(stage.expectedDays)}`;
}

const overText = { warn: 'بیش از معمول', over: '۲ برابر معمول' } as const;

/** M3 — student record (mockups/student-profile.html). */
export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const {
    user,
    student: s,
    profiles,
    history,
    stages,
    platforms,
    tracks,
    mentors,
    tasks,
    timeline,
    templates,
    reminders,
    healthDetail,
    flags,
    questions,
    checkins,
    milestones,
    milestoneTypes,
    enrollments,
    mentorCards,
  } = await load(id);
  const sp = await searchParams;
  const add = param(sp.add);
  const initial = (['note', 'task', 'reminder', 'stage'] as const).find((x) => x === add);
  const isAdmin = user.role === 'admin';
  const openTasks = tasks.filter((t) => t.status !== 'accepted' && t.status !== 'cancelled');
  const closedTasks = tasks.filter((t) => t.status === 'accepted' || t.status === 'cancelled');
  const lastTask = [...tasks].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  const openRefs = openTasks.map((t) => ({
    id: t.id,
    title: t.title,
    stageId: t.stage?.id ?? null,
  }));
  const taskContext = {
    templates,
    stages: stages.map((x) => ({ id: x.id, label: `${x.displayCode} — ${x.name}` })),
    reviewers: isAdmin
      ? mentors.map((m) => ({ id: m.id, label: m.id === user.id ? 'خودم' : m.displayName }))
      : [],
  };
  const lookups = {
    tasks: Object.fromEntries(tasks.map((t) => [t.id, t.title])),
    stageNotes: Object.fromEntries(
      history.filter((h) => h.note).map((h) => [h.id, h.note as string]),
    ),
    profiles: Object.fromEntries(profiles.map((p) => [p.id, p.platform.name])),
    platforms: Object.fromEntries(platforms.map((p) => [p.id, p.name])),
  };
  const now = new Date();
  const pathStages = stages.map((x) => ({ id: x.id, name: x.name, displayCode: x.displayCode }));
  const stageIndex = Math.max(
    0,
    stages.findIndex((x) => x.id === s.stage.id),
  );
  const firstName = s.displayName.trim().split(/\s+/)[0] ?? s.displayName;
  const primary = profiles.find((p) => p.isPrimary) ?? null;
  const target = {
    id: s.id,
    displayName: s.displayName,
    stage: s.stage,
    daysInStage: s.daysInStage,
  };
  const daysClass =
    s.overExpected === 'over'
      ? 'text-h-red-fg'
      : s.overExpected === 'warn'
        ? 'text-h-yellow-fg'
        : '';

  return (
    <>
      <nav
        aria-label="مسیر"
        className="mb-3 hidden flex-wrap items-center gap-1.5 text-sm text-fg-3 md:flex"
      >
        <Link href="/students" className="font-medium text-fg-2 hover:text-link">
          هنرجوها
        </Link>
        <Icon name="chev-next" size={14} />
        <span aria-current="page" className="font-semibold text-fg">
          {s.displayName}
        </span>
        <span>·</span>
        <Link href="/stages" className="font-medium text-fg-2 hover:text-link">
          کانبان مراحل
        </Link>
      </nav>

      <Card aria-labelledby="h-name" className="md:p-6">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-x-5 lg:gap-y-1">
          <Avatar
            id={s.id}
            name={s.displayName}
            size="xl"
            className="max-md:size-[52px]! max-md:rounded-2xl! max-md:text-[22px] lg:row-span-2"
          />
          <div className="min-w-0 self-center lg:self-start">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 id="h-name" className="w-full text-xl md:w-auto md:text-[24px] md:leading-[34px]">
                {s.displayName}
              </h1>
              {s.health && s.health.status !== 'paused' && s.health.status !== 'untracked' ? (
                <HealthPill health={s.health} />
              ) : null}
              {s.lifecycleStatus === 'paused' ? (
                <HealthBadge health="paused">
                  {s.pausedUntil
                    ? `متوقف تا ${faDayMonth(new Date(`${s.pausedUntil}T12:00:00Z`))}`
                    : lifecycleLabel.paused}
                </HealthBadge>
              ) : s.lifecycleStatus !== 'active' ? (
                <Tag variant="outline">{lifecycleLabel[s.lifecycleStatus]}</Tag>
              ) : null}
              {s.health?.ball && s.health.status !== 'green' ? (
                <BallChip ball={s.health.ball} />
              ) : null}
              {s.accountStatus === 'invited' ? <Tag variant="outline">هنوز وارد نشده</Tag> : null}
            </div>
            {s.health ? <HealthReasonList health={s.health} now={now} /> : null}
            {healthDetail?.snoozedUntil ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-2">
                <Icon name="bell-off" size={14} className="text-fg-3" />
                <strong className="font-semibold">{`هشدار تا ${faDayMonth(new Date(healthDetail.snoozedUntil))} خاموش است`}</strong>
                {healthDetail.snoozeReason ? <span>{`· ${healthDetail.snoozeReason}`}</span> : null}
                {healthDetail.snoozedBy ? (
                  <span className="text-fg-3">{`· ${healthDetail.snoozedBy.id === user.id ? 'خودم' : healthDetail.snoozedBy.displayName}`}</span>
                ) : null}
              </p>
            ) : null}
          </div>
          <div className="col-span-2 min-w-0 lg:col-span-1 lg:col-start-2">
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-2 lg:mt-3">
              <span className="inline-flex items-center gap-1.5">
                {s.mentor ? (
                  <Avatar id={s.mentor.id} name={s.mentor.displayName} size="xs" />
                ) : null}
                مشاور:{' '}
                <strong className="font-semibold text-fg">
                  {s.mentor ? (s.mentor.id === user.id ? 'خودم' : s.mentor.displayName) : 'ندارد'}
                </strong>
              </span>
              <Meta icon="target">
                سطح:{' '}
                <strong className="font-semibold text-fg">
                  {s.level ? levelLabel[s.level] : '—'}
                </strong>
              </Meta>
              <Meta icon="tasks">
                <strong className="font-semibold text-fg">{`${faNumber(s.openTaskCount)} کار باز`}</strong>
                {' · '}
                <span className={s.overdueTaskCount ? 'font-semibold text-h-red-fg' : undefined}>
                  {`${faNumber(s.overdueTaskCount)} معوق`}
                </span>
              </Meta>
              <Meta icon="clock">
                آخرین فعالیت:{' '}
                <strong className="font-semibold text-fg">
                  {s.lastActivityAt ? faRelativeDay(new Date(s.lastActivityAt), now) : 'هنوز نه'}
                </strong>
              </Meta>
              {s.tags.length ? (
                <span className="flex flex-wrap items-center gap-1.5">
                  {s.tags.map((t) => (
                    <Tag key={t}>{t}</Tag>
                  ))}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-fg-2">
              نیچ:{' '}
              {s.nicheStatement ? (
                <bdi dir="auto" className="font-semibold text-fg">
                  {s.nicheStatement}
                </bdi>
              ) : (
                <span className="text-fg-3">هنوز ثبت نشده</span>
              )}
            </p>
          </div>
          <div className="col-span-2 lg:col-span-1 lg:col-start-3 lg:row-span-2 lg:row-start-1">
            <StudentActions
              student={s}
              stages={pathStages}
              mentors={mentors}
              isAdmin={isAdmin}
              viewerId={user.id}
              taskContext={taskContext}
              templates={templates}
              openTasks={openRefs}
              initial={initial}
              milestones={{ types: milestoneTypes, platforms }}
            />
          </div>
        </div>

        {s.completeness.percent < 80 ? (
          <div className="mt-4 rounded-md border border-primary-line bg-primary-weak px-4 py-3 text-sm text-primary-text">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <strong className="font-bold">{`پرونده ${faNumber(s.completeness.percent)}٪ کامل`}</strong>
              <span
                aria-hidden="true"
                className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-primary-weak-2"
              >
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${s.completeness.percent}%` }}
                />
              </span>
            </div>
            {s.completeness.missing.length ? (
              <p className="mt-1">
                {`جای خالی: ${s.completeness.missing.map((f) => completenessFieldLabel[f] ?? f).join('، ')}`}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 grid gap-2 md:mt-5 md:gap-3 lg:grid-cols-3">
          <Tile icon="briefcase" q="چه ویترینی دارد؟">
            {primary ? (
              <>
                <span className="flex flex-wrap items-center gap-2 text-md font-bold">
                  <PlatformBadge name={primary.platform.name} />
                  <ProfileStatusChip status={primary.status} />
                  {formatRate(primary) ? (
                    <span className="text-sm font-medium text-fg-2">{formatRate(primary)}</span>
                  ) : null}
                </span>
                {primary.publicUrl ? <ExternalLink href={primary.publicUrl} /> : null}
              </>
            ) : (
              <span className="text-md font-bold text-fg-3">
                {profiles.length
                  ? `${faNumber(profiles.length)} ویترین، بدون ویترین اصلی`
                  : 'هنوز ویترینی ندارد'}
              </span>
            )}
          </Tile>
          <Tile icon="tasks" q="آخرین کار خواسته‌شده">
            {lastTask ? (
              <>
                <Link
                  href={`/tasks/${lastTask.id}`}
                  className="text-md font-bold text-fg hover:text-link"
                >
                  <bdi>{lastTask.title}</bdi>
                  {lastTask.revisionCount ? ` (دور ${faNumber(lastTask.revisionCount + 1)})` : ''}
                </Link>
                <span className="flex flex-wrap items-center gap-1.5 text-xs">
                  <TaskStatusBadge status={lastTask.status} />
                  {lastTask.overdue ? (
                    <Tag variant="overdue">{`معوق · ${faNumber(lastTask.overdueDays)} روز`}</Tag>
                  ) : null}
                </span>
              </>
            ) : (
              <>
                <span className="text-md font-bold text-fg-3">هنوز کاری خواسته نشده</span>
                <span className="text-xs text-fg-3">با «کار» اولین کار را تعریف کن.</span>
              </>
            )}
          </Tile>
          <Tile icon="route" q="کجای مسیر است؟">
            <span className="text-md font-bold">
              {`${s.stage.displayCode} ${s.stage.name} · `}
              <span className={daysClass}>{faDays(s.daysInStage)}</span>
            </span>
            <PathBar current={stageIndex} total={stages.length} large />
            <span className="flex flex-wrap items-center gap-x-1 text-xs text-fg-2">
              {s.overExpected !== 'none' ? (
                <strong className={daysClass}>{`${overText[s.overExpected]} · `}</strong>
              ) : null}
              {expectedText(s.stage)}
              {' · '}
              <ChangeStageButton
                student={target}
                stages={pathStages}
                variant="link"
                className="min-h-0! px-0! text-xs"
                templates={templates}
                openTasks={openRefs}
              />
            </span>
          </Tile>
        </div>
      </Card>

      <nav
        aria-label="بخش‌های پرونده"
        className="sticky top-topbar z-20 -mx-4 mt-5 flex gap-1 overflow-x-auto border-b border-line bg-bg px-4 [scrollbar-width:none] md:static md:mx-0 md:px-0"
      >
        {[
          ['#tasks', 'کارها', openTasks.length],
          ['#timeline', 'تایم‌لاین'],
          ['#profiles', 'ویترین‌ها', profiles.length],
          ['#questions', 'سؤال‌ها', questions.items.length || undefined],
          [
            '#milestones',
            'نقاط عطف',
            milestones.filter((m) => m.status !== 'rejected').length || undefined,
          ],
          ['#info', 'اطلاعات'],
        ].map(([href, label, count]) => (
          <a
            key={href as string}
            href={href as string}
            className="-mb-px inline-flex min-h-tap items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 text-ui font-medium text-fg-2 hover:border-line-2 hover:text-fg"
          >
            {label}
            {typeof count === 'number' ? (
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-surface-3 px-[5px] text-2xs font-bold">
                {faNumber(count)}
              </span>
            ) : null}
          </a>
        ))}
      </nav>

      <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4 md:gap-5">
          <Card id="tasks" aria-labelledby="h-tasks" className="scroll-mt-28">
            <CardHead
              title="کارها"
              titleId="h-tasks"
              icon="tasks"
              actions={
                <NewTaskButton
                  context={taskContext}
                  student={{ id: s.id, displayName: s.displayName }}
                  defaultStageId={s.stage.id}
                  label="کار"
                  variant="secondary"
                  size="sm"
                />
              }
            />
            <StudentTasks open={openTasks} closed={closedTasks} now={now} firstName={firstName} />
          </Card>

          <Card id="timeline" aria-labelledby="h-tl" className="scroll-mt-28">
            <CardHead title="تایم‌لاین" titleId="h-tl" icon="clock" />
            <div className="max-md:hidden">
              <NoteForm student={{ id: s.id, displayName: s.displayName }} variant="inline" />
            </div>
            <Timeline
              studentId={s.id}
              studentFirstName={firstName}
              initial={timeline}
              lookups={lookups}
            />
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4 md:gap-5 lg:sticky lg:top-6">
          <StudentProgramsCard
            studentName={s.displayName}
            enrollments={enrollments}
            mentors={mentorCards}
            canAssign={user.role === 'admin'}
          />

          {reminders.length ? (
            <Card id="reminders" aria-labelledby="h-rm" className="scroll-mt-28">
              <CardHead
                title="یادآورها"
                titleId="h-rm"
                icon="bell"
                link={{ href: '/reminders', label: 'همه' }}
              />
              <ReminderList reminders={reminders} viewerId={user.id} showOwner={isAdmin} compact />
            </Card>
          ) : null}

          <Card id="profiles" aria-labelledby="h-pr" className="scroll-mt-28">
            <ProfilesManager
              mode="staff"
              profiles={profiles}
              platforms={platforms}
              createUrl={`/api/v1/students/${s.id}/profiles`}
              ownerName={firstName}
              headingId="h-pr"
            />
          </Card>

          {flags.length ? (
            <Card id="flags" aria-labelledby="h-fl" className="scroll-mt-28">
              <CardHead title="پرچم‌های دستی" titleId="h-fl" icon="flag" count={flags.length} />
              <FlagsList flags={flags} viewerId={user.id} />
            </Card>
          ) : null}

          <Card id="questions" aria-labelledby="h-qs" className="scroll-mt-28">
            <CardHead
              title="سؤال‌ها"
              titleId="h-qs"
              icon="chat"
              link={
                questions.items.length
                  ? { href: `/questions?view=all`, label: 'صف سؤال‌ها' }
                  : undefined
              }
            />
            {questions.items.length ? (
              <QuestionRows
                items={questions.items}
                now={now}
                viewerId={user.id}
                showStudent={false}
              />
            ) : (
              <EmptyState icon="chat" title="سؤالی نپرسیده" className="py-5">
                {`سؤال‌های ${firstName} و وضعیت پاسخ‌شان این‌جا می‌آید.`}
              </EmptyState>
            )}
          </Card>

          <Card id="milestones" aria-labelledby="h-ms" className="scroll-mt-28">
            <StaffMilestones
              studentId={s.id}
              firstName={firstName}
              items={milestones}
              types={milestoneTypes}
              platforms={platforms}
              viewerId={user.id}
            />
          </Card>

          {checkins ? (
            <Card id="checkins" aria-labelledby="h-ci" className="scroll-mt-28">
              <CardHead
                title={
                  <>
                    <bdi>check-in</bdi> هفتگی
                  </>
                }
                titleId="h-ci"
                icon="checkin"
              />
              <CheckinList items={checkins.items} firstName={firstName} />
            </Card>
          ) : null}

          <Card id="info" aria-labelledby="h-info" className="scroll-mt-28">
            <CardHead
              title="اطلاعات"
              titleId="h-info"
              icon="info"
              actions={<EditInfoDialog student={s} tracks={tracks} platforms={platforms} />}
            />
            <InfoList student={s} />
          </Card>
        </div>
      </div>

      <div aria-hidden="true" className="h-[76px] md:hidden" />
      <QuickAddTarget
        student={{ id: s.id, displayName: s.displayName, stage: `مرحله‌ی ${s.stage.displayCode}` }}
      />
    </>
  );
}

function InfoList({ student: s }: { student: StaffStudentDTO }) {
  const dash = <span className="text-fg-3">—</span>;
  const scale = (n: number | null) => (n === null ? null : `${faNumber(n)} از ۵`);
  const rows: Array<[string, ReactNode]> = [
    [
      'موبایل',
      s.phone ? (
        <bdi key="phone" dir="ltr" className="text-sm">
          {toLocalMobile(s.phone)}
        </bdi>
      ) : null,
    ],
    [
      'پیام‌رسان',
      s.messengerHandle ? (
        <bdi key="messenger" dir="ltr" className="text-sm">
          {s.messengerHandle}
        </bdi>
      ) : null,
    ],
    ['شاخه', s.track ? `${s.track.code} ${s.track.name}` : null],
    ['پلتفرم اصلی', s.primaryPlatform ? <bdi key="platform">{s.primaryPlatform.name}</bdi> : null],
    [
      'مهارت اصلی',
      s.primarySkill ? [s.primarySkill, scale(s.skillLevel)].filter(Boolean).join(' · ') : null,
    ],
    [
      'انگلیسی',
      s.englishWriting !== null || s.englishSpeaking !== null
        ? `نوشتاری ${s.englishWriting === null ? '—' : faNumber(s.englishWriting)} · گفتاری ${s.englishSpeaking === null ? '—' : faNumber(s.englishSpeaking)}`
        : null,
    ],
    ['وقت در هفته', s.hoursPerWeek === null ? null : `${faNumber(s.hoursPerWeek)} ساعت`],
    [
      'هدف درآمد',
      s.incomeGoalUsd === null
        ? null
        : `${faNumber(s.incomeGoalUsd, { grouped: true })} دلار در ماه`,
    ],
    ['هدف ۹۰ روزه', s.goal90d],
    ['تجربه‌ی قبلی', s.priorExperience ? priorExperienceLabel[s.priorExperience] : null],
    ['مانع اصلی', s.selfReportedBlocker ? `«${s.selfReportedBlocker}»` : null],
    ['کوهورت', s.cohort],
    ['عضویت', faDate(new Date(s.joinedAt))],
  ];
  return (
    <dl className="m-0 grid grid-cols-1 text-ui leading-[22px] md:grid-cols-[max-content_minmax(0,1fr)] md:gap-x-5 md:gap-y-2.5">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-xs text-fg-3 md:text-ui">{k}</dt>
          <dd className="m-0 mb-3 min-w-0 font-medium whitespace-pre-line md:mb-0">{v ?? dash}</dd>
        </div>
      ))}
    </dl>
  );
}

function StudentTasks({
  open,
  closed,
  now,
  firstName,
}: {
  open: StaffTaskDTO[];
  closed: StaffTaskDTO[];
  now: Date;
  firstName: string;
}) {
  const sorted = [...open].sort(
    (a, b) =>
      Number(b.status === 'submitted') - Number(a.status === 'submitted') ||
      Number(b.overdue) - Number(a.overdue) ||
      Date.parse(a.dueAt) - Date.parse(b.dueAt),
  );
  return (
    <>
      {sorted.length ? (
        <ul className="-mx-4 md:-mx-5">
          {sorted.map((t) => (
            <TaskItem key={t.id} task={t} now={now} />
          ))}
        </ul>
      ) : (
        <EmptyState icon="tasks" tone="brand" title="کار بازی ندارد" className="py-5">
          {`برای ${firstName} یک کار بعدی تعریف کن تا مسیرش متوقف نشود.`}
        </EmptyState>
      )}
      {closed.length ? (
        <details className="group -mx-4 -mb-4 mt-2 border-t border-line px-4 py-2 md:-mx-5 md:-mb-5 md:px-5">
          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-sm px-2 text-ui font-semibold text-fg-2 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
            پذیرفته و لغوشده
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-surface-3 px-[5px] text-2xs font-bold">
              {faNumber(closed.length)}
            </span>
            <Icon
              name="chev-down"
              size={16}
              className="transition-transform group-open:rotate-180"
            />
          </summary>
          <ul className="-mx-4 mt-1 md:-mx-5">
            {[...closed]
              .sort(
                (a, b) =>
                  Date.parse(b.closedAt ?? b.updatedAt) - Date.parse(a.closedAt ?? a.updatedAt),
              )
              .map((t) => (
                <TaskItem key={t.id} task={t} now={now} />
              ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

function TaskItem({ task: t, now }: { task: StaffTaskDTO; now: Date }) {
  return (
    <li
      className={cn(
        'relative flex items-start gap-3 border-t border-line px-4 py-3 first:border-t-0 hover:bg-hover md:px-5',
        t.overdue &&
          'before:absolute before:start-0 before:top-2.5 before:bottom-2.5 before:w-[3px] before:rounded-[3px] before:bg-h-red-fg',
      )}
    >
      <div className="min-w-0 flex-1">
        <Link
          href={`/tasks/${t.id}`}
          className="block leading-6 font-semibold text-fg hover:text-link"
        >
          <bdi>{t.title}</bdi>
        </Link>
        <div className="mt-[3px] flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-fg-2">
          <TaskStatusBadge status={t.status} round={t.revisionCount} />
          {t.priority === 'urgent' ? <Tag variant="urgent">فوری</Tag> : null}
          <DueText
            dueAt={t.dueAt}
            status={t.status}
            overdue={t.overdue}
            overdueDays={t.overdueDays}
            now={now}
            extensions={t.extensionCount}
          />
          {t.stage ? <span>{`مرحله‌ی ${t.stage.displayCode}`}</span> : null}
        </div>
      </div>
      {t.status === 'submitted' ? (
        <Link
          href={`/tasks/${t.id}`}
          className={buttonClass({ size: 'sm', variant: 'primary', className: 'flex-none' })}
        >
          بازبینی
        </Link>
      ) : null}
    </li>
  );
}

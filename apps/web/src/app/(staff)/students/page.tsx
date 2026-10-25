import type { Metadata } from 'next';
import Link from 'next/link';
import { faNumber } from '@/components/format/fa';
import { attentionRank } from '@/components/health/reasons';
import { Icon } from '@/components/icons/icon';
import { ExportButton, ImportStudentsButton } from '@/components/students/csv-tools';
import { lifecycleLabel } from '@/components/students/labels';
import { NewStudentDialog } from '@/components/students/new-student-dialog';
import { type FilterValues, StudentFilters } from '@/components/students/student-filters';
import { type StudentRow, StudentsTable } from '@/components/students/students-table';
import { type Health, HealthShape } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { ChipLink, SegNav } from '@/components/ui/seg';
import { Alert, EmptyState } from '@/components/ui/states';
import { getStaffSettings, listPlatforms, listStages } from '@/modules/catalog/service';
import { listMentors } from '@/modules/identity/service';
import {
  type ListStudentsQuery,
  listStudentsQuery,
  type StudentCountsDTO,
} from '@/modules/students/contracts';
import { listStudents, listStudentTags } from '@/modules/students/service';
import { getReviewQueue } from '@/modules/tasks/service';
import { requireUser, toActor } from '@/server/auth/current-user';
import { ApiError } from '@/server/http/errors';
import { param, stagePositions } from '../_data';

export const metadata: Metadata = { title: 'هنرجوها' };

const KEYS = [
  'q',
  'stageId',
  'mentorId',
  'platformId',
  'tag',
  'lifecycle',
  'health',
  'sort',
  'cursor',
] as const;

/** Default: «نیاز به رسیدگی» = red → yellow → waiting submission → green (progress-tracking §8). */
const DEFAULT_SORT = 'health';

const SORTS = [
  { value: 'health', label: 'نیاز به رسیدگی' },
  { value: 'name', label: 'نام' },
  { value: 'lastActivity', label: 'آخرین فعالیت' },
  { value: 'stageDays', label: 'روز در مرحله' },
  { value: 'joined', label: 'تاریخ عضویت' },
];

const LIFECYCLE_CHIPS = [
  { value: '', label: 'در جریان' },
  { value: 'active', label: lifecycleLabel.active },
  { value: 'paused', label: lifecycleLabel.paused },
  { value: 'graduated', label: lifecycleLabel.graduated },
  { value: 'dropped', label: lifecycleLabel.dropped },
] as const;

const HEALTH_CHIPS: Array<{ value: '' | Exclude<Health, 'churn'>; label: string }> = [
  { value: '', label: 'همه' },
  { value: 'red', label: 'گیرکرده' },
  { value: 'yellow', label: 'نیاز به توجه' },
  { value: 'green', label: 'روبه‌راه' },
  { value: 'paused', label: 'متوقف' },
];

const EMPTY_COUNTS: StudentCountsDTO = {
  total: 0,
  byLifecycle: { active: 0, paused: 0, graduated: 0, dropped: 0 },
  byHealth: { green: 0, yellow: 0, red: 0, paused: 0, untracked: 0, none: 0 },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** M2 — students list (mockups/students.html). */
export default async function StudentsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['admin', 'mentor']);
  const actor = toActor(user);
  const isAdmin = user.role === 'admin';
  const sp = await searchParams;

  const raw: Record<string, string> = {};
  for (const key of KEYS) {
    const value = param(sp[key]);
    // Mentors only ever see their own students: no mentor filter for them.
    if (value && !(key === 'mentorId' && !isAdmin)) raw[key] = value;
  }
  const parsed = listStudentsQuery.safeParse(raw);
  const query: ListStudentsQuery = parsed.success ? parsed.data : {};
  const values: FilterValues = {
    q: parsed.success ? (raw.q ?? '') : '',
    stageId: parsed.success ? (raw.stageId ?? '') : '',
    mentorId: parsed.success ? (raw.mentorId ?? '') : '',
    platformId: parsed.success ? (raw.platformId ?? '') : '',
    tag: parsed.success ? (raw.tag ?? '') : '',
    lifecycle: parsed.success ? (raw.lifecycle ?? '') : '',
    health: parsed.success ? (raw.health ?? '') : '',
    sort: parsed.success ? (raw.sort ?? DEFAULT_SORT) : DEFAULT_SORT,
  };
  const sort = (query.sort ?? DEFAULT_SORT) as NonNullable<ListStudentsQuery['sort']>;

  const [stages, platforms, mentors, tags, waiting, staffSettings] = await Promise.all([
    listStages(actor),
    listPlatforms(actor),
    listMentors(actor),
    listStudentTags(actor, { lifecycle: ['active', 'paused', 'graduated', 'dropped'] }),
    getReviewQueue(actor).catch(() => []),
    getStaffSettings(actor).catch(() => null),
  ]);
  const waitingIds = new Set(waiting.map((w) => w.student.id));

  let list: Awaited<ReturnType<typeof listStudents>> = { items: [], nextCursor: null };
  let listError: string | null = parsed.success
    ? null
    : 'بعضی از فیلترها نامعتبر بودند و نادیده گرفته شدند.';
  try {
    list = await listStudents(actor, { ...query, sort, limit: 50 });
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 422) throw err;
    listError = 'این صفحه از فهرست دیگر معتبر نیست؛ از اول فهرست ببین.';
    list = await listStudents(actor, { ...query, sort, cursor: undefined, limit: 50 });
  }
  const counts = list.counts ?? EMPTY_COUNTS;

  const positions = stagePositions(stages);
  let rows: StudentRow[] = list.items.map((s) => ({
    ...s,
    stageIndex: positions.get(s.stage.id) ?? 0,
    stageTotal: stages.length,
    waitingReview: waitingIds.has(s.id),
  }));
  if (sort === 'health') {
    // The API ranks red → yellow → green → paused; a waiting submission goes before green
    // (progress-tracking §8). Stable within each rank, so the API's «oldest status» order stays.
    rows = rows
      .map((r, i) => ({ r, i }))
      .sort(
        (a, b) =>
          attentionRank(a.r.health?.status, Boolean(a.r.waitingReview)) -
            attentionRank(b.r.health?.status, Boolean(b.r.waitingReview)) || a.i - b.i,
      )
      .map(({ r }) => r);
  }

  const inFlow = counts.byLifecycle.active + counts.byLifecycle.paused;
  const healthTotal = Object.values(counts.byHealth).reduce((a, b) => a + b, 0);
  const hasFilters = Boolean(
    values.q ||
      values.stageId ||
      values.mentorId ||
      values.platformId ||
      values.tag ||
      values.lifecycle ||
      values.health,
  );
  const canInvite = isAdmin || (staffSettings?.access.mentorsCanInviteStudents ?? true);
  const stageOptions = stages.map((s) => ({ id: s.id, name: s.name, displayCode: s.displayCode }));
  const viewer = { id: user.id, role: user.role as 'admin' | 'mentor' };

  const chipHref = (health: string) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (key !== 'health' && value && !(key === 'sort' && value === DEFAULT_SORT))
        params.set(key, value);
    }
    if (health) params.set('health', health);
    const q = params.toString();
    return q ? `/students?${q}` : '/students';
  };
  const chipCount = (value: string) =>
    faNumber(value === '' ? healthTotal : counts.byHealth[value as keyof typeof counts.byHealth]);

  const sortLabel = SORTS.find((s) => s.value === values.sort)?.label ?? 'نیاز به رسیدگی';
  const nextHref = list.nextCursor
    ? `${chipHref(values.health)}${chipHref(values.health).includes('?') ? '&' : '?'}cursor=${encodeURIComponent(list.nextCursor)}`
    : null;
  const dist: Array<{ key: Exclude<Health, 'churn'>; label: string; tone: string }> = [
    { key: 'red', label: 'گیرکرده', tone: 'text-h-red-fg' },
    { key: 'yellow', label: 'نیاز به توجه', tone: 'text-h-yellow-fg' },
    { key: 'green', label: 'روبه‌راه', tone: 'text-h-green-fg' },
    { key: 'paused', label: 'متوقف', tone: 'text-h-paused-fg' },
  ];

  return (
    <>
      <PageHead
        title={
          <>
            هنرجوها{' '}
            <span className="ms-2 text-md font-medium text-fg-3 md:text-lg">{`${faNumber(inFlow)} در جریان`}</span>
          </>
        }
        sub={
          <span className="flex flex-wrap items-center gap-3">
            <span className="sr-only">توزیع وضعیت:</span>
            {dist.map((d) => (
              <span
                key={d.key}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-fg"
              >
                <span className={`inline-flex ${d.tone}`}>
                  <HealthShape health={d.key} />
                </span>
                {`${faNumber(counts.byHealth[d.key])} ${d.label}`}
              </span>
            ))}
            {counts.byLifecycle.graduated ? (
              <span className="text-xs font-bold text-fg-2">{`${faNumber(counts.byLifecycle.graduated)} فارغ‌التحصیل`}</span>
            ) : null}
          </span>
        }
        actions={
          <>
            <SegNav
              label="نوع نما"
              current="/students"
              items={[
                { href: '/students', label: 'فهرست', icon: 'list' },
                { href: '/stages', label: 'مراحل', icon: 'board' },
              ]}
            />
            {isAdmin ? (
              <>
                <ImportStudentsButton />
                <ExportButton />
              </>
            ) : null}
            {canInvite ? (
              <NewStudentDialog
                viewer={viewer}
                mentors={mentors}
                stages={stageOptions}
                platforms={platforms}
                initiallyOpen={param(sp.new) === '1'}
              />
            ) : null}
          </>
        }
      />

      <StudentFilters
        values={values}
        options={{
          stages: stages.map((s) => ({ id: s.id, label: `${s.displayCode} — ${s.name}` })),
          mentors: isAdmin
            ? mentors.map((m) => ({ id: m.id, label: m.id === user.id ? 'خودم' : m.displayName }))
            : null,
          platforms: platforms.map((p) => ({ id: p.id, label: p.name })),
          tags: tags.tags.map((t) => t.tag),
          lifecycles: LIFECYCLE_CHIPS.map((c) => ({ value: c.value, label: c.label })),
          healths: HEALTH_CHIPS.filter((c) => c.value).map((c) => ({
            value: c.value,
            label: c.label,
          })),
          sorts: SORTS,
        }}
      >
        <nav aria-label="سلامت" className="flex flex-wrap items-center gap-2">
          {HEALTH_CHIPS.map((chip) => (
            <ChipLink
              key={chip.value || 'all'}
              href={chipHref(chip.value)}
              active={values.health === chip.value}
              count={chipCount(chip.value)}
            >
              {chip.value ? (
                <span className="inline-flex items-center gap-1.5">
                  <HealthShape health={chip.value} />
                  {chip.label}
                </span>
              ) : (
                chip.label
              )}
            </ChipLink>
          ))}
        </nav>
      </StudentFilters>

      {listError ? <Alert tone="warn" title={listError} /> : null}

      {rows.length === 0 ? (
        <Card>
          {healthTotal === 0 && !hasFilters ? (
            <EmptyState icon="users" tone="brand" title="هنوز هنرجویی نساخته‌ای" headingLevel={2}>
              {canInvite
                ? 'اولین نفر را با دکمه‌ی «هنرجوی جدید» اضافه کن و لینک دعوتش را در تلگرام بفرست.'
                : 'وقتی مدیر هنرجویی را به تو بسپارد، این‌جا می‌آید.'}
            </EmptyState>
          ) : (
            <EmptyState
              icon="filter"
              title="هنرجویی با این فیلترها نیست"
              headingLevel={2}
              action={
                <Link href="/students" className={buttonClass({ variant: 'ghost' })}>
                  پاک کردن فیلترها
                </Link>
              }
            />
          )}
        </Card>
      ) : (
        <>
          <StudentsTable
            rows={rows}
            viewerId={user.id}
            showMentor={isAdmin}
            caption={`فهرست هنرجوها، مرتب بر اساس ${sortLabel}`}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-fg-3">
            <p>{`${faNumber(rows.length)} هنرجو در این صفحه · مرتب‌سازی: ${sortLabel}`}</p>
            <span className="flex-1" />
            {raw.cursor ? (
              <Link
                href={chipHref(values.lifecycle)}
                className={buttonClass({ size: 'sm', variant: 'ghost' })}
              >
                از اول فهرست
              </Link>
            ) : null}
            {nextHref ? (
              <Link href={nextHref} className={buttonClass({ size: 'sm' })}>
                صفحه‌ی بعد
                <Icon name="chev-next" size={16} />
              </Link>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}

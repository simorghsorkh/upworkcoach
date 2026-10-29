'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPatch } from '@/components/api/client';
import { faDayMonth, faDayTime, faNumber } from '@/components/format/fa';
import { flagCategoryLabel } from '@/components/health/reasons';
import { Icon } from '@/components/icons/icon';
import { lifecycleLabel, transitionKindLabel } from '@/components/students/labels';
import { COMPOSER_KINDS, noteKindLabel, taskStatusLabel } from '@/components/tasks/labels';
import { Button } from '@/components/ui/button';
import { ChipButton, MenuButton } from '@/components/ui/choice';
import { cn } from '@/components/ui/cn';
import { Dialog, DialogActions } from '@/components/ui/dialog';
import { SelectField, TextareaField } from '@/components/ui/field';
import { Alert, EmptyState, ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import type { FlagCategory } from '@/modules/health/contracts';
import type { LifecycleStatus } from '@/modules/students/contracts';
import type { TaskStatus } from '@/modules/tasks/contracts';
import type {
  NoteDTO,
  NoteKind,
  TimelineCategory,
  TimelineDTO,
  TimelineItemDTO,
} from '@/modules/timeline/contracts';

type Filter = { key: string; label: string; types: TimelineCategory[] | null };

/** mockups/student-profile.html `.filter-chips` (F5 «فیلتر نوع»). */
const FILTERS: Filter[] = [
  { key: 'all', label: 'همه', types: null },
  { key: 'notes', label: 'یادداشت و جلسه', types: ['note'] },
  { key: 'tasks', label: 'کارها', types: ['task'] },
  { key: 'stage', label: 'مرحله', types: ['stage'] },
  { key: 'profile', label: 'ویترین و پرونده', types: ['profile', 'student'] },
  { key: 'questions', label: 'سؤال', types: ['question'] },
  { key: 'milestones', label: 'نقطه‌ی عطف', types: ['milestone'] },
  { key: 'checkins', label: 'check-in', types: ['checkin'] },
  { key: 'health', label: 'سلامت و پرچم', types: ['health', 'flag'] },
];

const HEALTH_WORD: Record<string, string> = {
  green: 'روبه‌راه',
  yellow: 'نیاز به توجه',
  red: 'گیرکرده',
  paused: 'متوقف',
  untracked: 'بدون پیگیری',
};

export type TimelineLookups = {
  /** taskId → title (the student's tasks, so task events read «… «سند نیچ»»). */
  tasks: Record<string, string>;
  /** stage transition id → the note written with it. */
  stageNotes: Record<string, string>;
  /** profile id → platform name. */
  profiles: Record<string, string>;
  /** platform id → name. */
  platforms: Record<string, string>;
};

/**
 * F5 record timeline (mockups/student-profile.html #timeline): automatic events as small grey
 * dots, notes as cards — internal = dashed with a lock and «داخلی — هنرجو نمی‌بیند», shared =
 * indigo with an eye and «اشتراکی — هنرجو می‌بیند». Filter chips and «موارد قدیمی‌تر» read
 * `GET /students/:id/timeline`. The author (or an admin) can edit, delete or change the
 * visibility of a note; internal → shared asks first (SEC-F6).
 */
export function Timeline({
  studentId,
  studentFirstName,
  initial,
  lookups,
}: {
  studentId: string;
  studentFirstName: string;
  initial: TimelineDTO;
  lookups: TimelineLookups;
}) {
  const [filter, setFilter] = useState('all');
  const [data, setData] = useState<TimelineDTO>(initial);
  const [state, setState] = useState<'idle' | 'loading' | 'more' | 'error'>('idle');

  // A new note (router.refresh) brings a fresh first page.
  useEffect(() => {
    if (filter === 'all') setData(initial);
  }, [initial, filter]);

  async function load(key: string, cursor?: string) {
    const f = FILTERS.find((x) => x.key === key) ?? FILTERS[0];
    const params = new URLSearchParams({ limit: '20' });
    if (f?.types) params.set('types', f.types.join(','));
    if (cursor) params.set('cursor', cursor);
    setState(cursor ? 'more' : 'loading');
    const res = await apiGet<TimelineDTO>(`/api/v1/students/${studentId}/timeline?${params}`);
    if (!res.ok) {
      setState('error');
      return;
    }
    setState('idle');
    setData((prev) =>
      cursor
        ? {
            items: [...prev.items, ...res.data.items],
            nextCursor: res.data.nextCursor,
            refs: {
              stages: { ...prev.refs.stages, ...res.data.refs.stages },
              users: { ...prev.refs.users, ...res.data.refs.users },
            },
          }
        : res.data,
    );
  }

  function choose(key: string) {
    setFilter(key);
    if (key === 'all') {
      setData(initial);
      setState('idle');
      return;
    }
    void load(key);
  }

  const now = new Date();

  return (
    <>
      <fieldset className="mt-4 flex flex-wrap gap-1.5">
        <legend className="sr-only">فیلتر تایم‌لاین</legend>
        {FILTERS.map((f) => (
          <ChipButton key={f.key} small pressed={filter === f.key} onClick={() => choose(f.key)}>
            {f.label}
          </ChipButton>
        ))}
      </fieldset>
      {state === 'error' ? (
        <ErrorState onRetry={() => void load(filter)} className="py-5" />
      ) : state === 'loading' ? (
        <p role="status" className="py-6 text-center text-sm text-fg-3">
          در حال بارگذاری…
        </p>
      ) : data.items.length === 0 ? (
        <EmptyState icon="clock" title="چیزی ثبت نشده" className="py-6">
          {filter === 'all'
            ? `اولین یادداشت درباره‌ی ${studentFirstName} را بالا بنویس.`
            : 'در این دسته هنوز رویدادی نیست.'}
        </EmptyState>
      ) : (
        <ol className="relative mt-4 before:absolute before:start-[13px] before:top-2 before:bottom-2 before:w-0.5 before:bg-line">
          {data.items.map((item) => (
            <TimelineRow
              key={`${item.kind}-${item.id}`}
              item={item}
              refs={data.refs}
              lookups={lookups}
              now={now}
              studentFirstName={studentFirstName}
            />
          ))}
        </ol>
      )}
      {data.nextCursor && state !== 'error' ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-3"
          loading={state === 'more'}
          onClick={() => void load(filter, data.nextCursor ?? undefined)}
        >
          موارد قدیمی‌تر
          <Icon name="chev-down" size={14} />
        </Button>
      ) : null}
    </>
  );
}

function TimelineRow({
  item,
  refs,
  lookups,
  now,
  studentFirstName,
}: {
  item: TimelineItemDTO;
  refs: TimelineDTO['refs'];
  lookups: TimelineLookups;
  now: Date;
  studentFirstName: string;
}) {
  const when = faDayTime(new Date(item.occurredAt), now);
  if (item.kind === 'note') {
    return <NoteRow note={item.note} when={when} studentFirstName={studentFirstName} />;
  }
  const actor = item.actor?.displayName ?? 'سیستم';
  return (
    <li className="relative ps-11 pb-5 last:pb-0">
      <span
        aria-hidden="true"
        className="absolute start-[7px] top-1.5 size-3.5 rounded-full border-[3px] border-surface bg-surface-3"
      />
      <div className="text-sm text-fg-3">{`${when} · ${actor}`}</div>
      <div className="mt-0.5 text-sm text-fg-2">{describeEvent(item, refs, lookups)}</div>
      {item.type === 'stage.changed' && item.subject && lookups.stageNotes[item.subject.id] ? (
        <p
          dir="auto"
          className="mt-1.5 rounded-md border border-line bg-surface px-3 py-2 text-ui whitespace-pre-line"
        >
          {lookups.stageNotes[item.subject.id]}
        </p>
      ) : null}
    </li>
  );
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' ? v : null);

function TaskLink({
  id,
  lookups,
  fallback,
}: {
  id: string;
  lookups: TimelineLookups;
  fallback?: string;
}) {
  const title = lookups.tasks[id] ?? fallback;
  return (
    <Link href={`/tasks/${id}`} className="font-semibold text-fg hover:text-link">
      {title ? (
        <>
          «<bdi>{title}</bdi>»
        </>
      ) : (
        'یک کار'
      )}
    </Link>
  );
}

/** Persian sentence for an automatic event (names from `refs` and the page's lookups). */
export function describeEvent(
  item: Extract<TimelineItemDTO, { kind: 'event' }>,
  refs: TimelineDTO['refs'],
  lookups: TimelineLookups,
): ReactNode {
  const d = item.data;
  const stage = (id: unknown) => {
    const s = refs.stages[str(id)];
    return s ? `${s.displayCode} ${s.name}` : '—';
  };
  const user = (id: unknown) => (id ? (refs.users[str(id)]?.displayName ?? 'کاربر') : 'بدون مشاور');
  const taskId = item.subject?.type === 'task' ? item.subject.id : str(d.taskId);
  switch (item.type) {
    case 'student.created':
      return (
        <>
          پرونده ساخته شد؛ شروع در <strong className="text-fg">{stage(d.stageId)}</strong>
        </>
      );
    case 'invite.accepted':
      return 'هنرجو دعوت را پذیرفت و وارد شد.';
    case 'student.updated':
      return 'اطلاعات پرونده به‌روز شد.';
    case 'student.lifecycle_changed':
      return `وضعیت: ${lifecycleLabel[str(d.from) as LifecycleStatus] ?? '—'} ← ${lifecycleLabel[str(d.to) as LifecycleStatus] ?? '—'}`;
    case 'mentor.changed':
      return `مشاور: ${user(d.from)} ← ${user(d.to)}`;
    case 'stage.changed': {
      const kind = str(d.kind) as keyof typeof transitionKindLabel;
      return (
        <>
          {`مرحله${transitionKindLabel[kind] ? ` (${transitionKindLabel[kind]})` : ''}: ${stage(d.from)} ← `}
          <strong className="text-fg">{stage(d.to)}</strong>
        </>
      );
    }
    case 'profile.added':
      return `ویترین تازه: ${str(d.platformName) || lookups.platforms[str(d.platformId)] || 'پلتفرم'}`;
    case 'profile.updated':
      return `ویترین ${str(d.platformName) || lookups.profiles[item.subject?.id ?? ''] || ''} ویرایش شد.`.replace(
        '  ',
        ' ',
      );
    case 'profile.removed':
      return str(d.platformName) ? `ویترین ${str(d.platformName)} حذف شد.` : 'یک ویترین حذف شد.';
    case 'profile.approved':
      return `ویترین ${str(d.platformName) || lookups.profiles[item.subject?.id ?? ''] || ''} تأیید شد.`.replace(
        '  ',
        ' ',
      );
    case 'task.created':
      return (
        <>
          کار ساخته شد:{' '}
          <TaskLink id={taskId} lookups={lookups} fallback={str(d.title) || undefined} />
          {str(d.dueAt) ? ` · مهلت ${faDayMonth(new Date(str(d.dueAt)))}` : ''}
        </>
      );
    case 'task.updated':
      return (
        <>
          کار <TaskLink id={taskId} lookups={lookups} /> ویرایش شد.
        </>
      );
    case 'task.due_extended':
      return (
        <>
          تمدید مهلت <TaskLink id={taskId} lookups={lookups} />:{' '}
          {`${str(d.from) ? faDayMonth(new Date(str(d.from))) : '—'} ← ${str(d.to) ? faDayMonth(new Date(str(d.to))) : '—'}`}
        </>
      );
    case 'task.status_changed':
      return (
        <>
          <TaskLink id={taskId} lookups={lookups} />
          {`: ${taskStatusLabel[str(d.from) as TaskStatus] ?? '—'} ← `}
          <strong className="text-fg">{taskStatusLabel[str(d.to) as TaskStatus] ?? '—'}</strong>
        </>
      );
    case 'submission.created':
      return (
        <>
          {`تحویل نسخه‌ی ${faNumber(num(d.version) ?? 1)}: `}
          <TaskLink id={taskId} lookups={lookups} />
        </>
      );
    case 'review.created': {
      const accepted = str(d.outcome) === 'accepted';
      const score = num(d.score);
      return (
        <>
          {'بازبینی '}
          <TaskLink id={taskId} lookups={lookups} />
          {`: ${accepted ? 'پذیرفته' : 'نیاز به اصلاح'}`}
          {score ? ` · امتیاز ${faNumber(score)} از ۵` : ''}
        </>
      );
    }
    case 'question.created':
      return (
        <>
          {str(d.source) === 'checkin' ? 'سؤال از check-in: ' : 'سؤال تازه: '}
          <QuestionLink id={item.subject?.id} />
          {str(d.priority) === 'urgent' ? ' · فوری' : ''}
        </>
      );
    case 'question.answered':
      return (
        <>
          {d.first ? 'اولین پاسخ به ' : 'پاسخ به '}
          <QuestionLink id={item.subject?.id} />
        </>
      );
    case 'question.closed':
      return (
        <>
          <QuestionLink id={item.subject?.id} />
          {str(d.by) === 'student' ? ' را هنرجو بست (حل شد).' : ' بسته شد.'}
        </>
      );
    case 'checkin.submitted':
      return `check-in هفتگی: حال ${faNumber(num(d.mood) ?? 0)} از ۵${d.needsHelp ? ' · کمک خواست' : ''}`;
    case 'milestone.proposed':
      return 'هنرجو یک نقطه‌ی عطف پیشنهاد داد.';
    case 'milestone.approved':
      return 'نقطه‌ی عطف تأیید شد.';
    case 'milestone.rejected':
      return 'پیشنهاد نقطه‌ی عطف رد شد.';
    case 'flag.added':
      return `پرچم دستی ${str(d.level) === 'red' ? 'قرمز' : 'زرد'}: ${flagCategoryLabel[str(d.category) as FlagCategory] ?? 'سایر'}`;
    case 'flag.cleared':
      return 'پرچم دستی برداشته شد.';
    case 'health.changed':
      return (
        <>
          {`سلامت: ${HEALTH_WORD[str(d.from)] ?? '—'} ← `}
          <strong className="text-fg">{HEALTH_WORD[str(d.to)] ?? '—'}</strong>
          {d.churnRisk ? ' · خطر ریزش' : ''}
        </>
      );
    case 'health.snoozed':
      return str(d.until)
        ? `هشدار تا ${faDayMonth(new Date(str(d.until)))} خاموش شد.`
        : 'هشدار دوباره روشن شد.';
    default:
      return 'رویداد ثبت شد.';
  }
}

function QuestionLink({ id }: { id: string | undefined }) {
  if (!id) return <>یک سؤال</>;
  return (
    <Link href={`/questions/${id}`} className="font-semibold text-fg hover:text-link">
      یک سؤال
    </Link>
  );
}

const VIS_ICON = { internal: 'lock', shared: 'eye', private: 'user' } as const;

function VisTag({ visibility }: { visibility: NoteDTO['visibility'] }) {
  const t = useTranslations('notes.tag');
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-bold',
        visibility === 'shared' ? 'bg-primary-weak-2 text-primary-text' : 'bg-fg text-surface',
      )}
    >
      <Icon name={VIS_ICON[visibility]} size={12} strokeWidth={2.6} />
      {t(visibility)}
    </span>
  );
}

function NoteRow({
  note,
  when,
  studentFirstName,
}: {
  note: NoteDTO;
  when: string;
  studentFirstName: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations('notes');
  const shared = note.visibility === 'shared';
  const [panel, setPanel] = useState<'edit' | 'share' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>, message: string) {
    setBusy(true);
    setError(null);
    const res = await apiPatch<NoteDTO>(`/api/v1/notes/${note.id}`, {
      ...body,
      ifUpdatedAt: note.updatedAt,
    });
    setBusy(false);
    if (!res.ok) {
      setError(
        res.error.status === 409
          ? 'کس دیگری این یادداشت را تغییر داده؛ صفحه را تازه کن.'
          : res.error.message,
      );
      return false;
    }
    setPanel(null);
    toast.show({ message });
    router.refresh();
    return true;
  }

  async function remove() {
    setBusy(true);
    const res = await apiDelete(`/api/v1/notes/${note.id}`);
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setPanel(null);
    toast.show({ message: 'یادداشت حذف شد.' });
    router.refresh();
  }

  return (
    <li className="relative ps-11 pb-5 last:pb-0">
      <span
        aria-hidden="true"
        className={cn(
          'absolute start-0 top-0 grid size-7 place-items-center rounded-full border',
          shared
            ? 'border-primary-line bg-primary-weak-2 text-primary-text'
            : 'border-fg bg-fg text-surface',
        )}
      >
        <Icon name={VIS_ICON[note.visibility]} size={14} strokeWidth={2.5} />
      </span>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-fg-3">
        <strong className="font-semibold text-fg">{note.author.displayName}</strong>
        <span>{`${noteKindLabel[note.kind]} · ${when}`}</span>
        <VisTag visibility={note.visibility} />
        {note.canEdit ? (
          <span className="ms-auto">
            <MenuButton
              label={
                <>
                  <Icon name="more" size={16} />
                  <span className="sr-only">کارهای این یادداشت</span>
                </>
              }
              buttonClassName="inline-grid size-8 cursor-pointer place-items-center rounded-sm text-fg-2 hover:bg-surface-2"
              items={[
                { label: 'ویرایش', onSelect: () => setPanel('edit') },
                note.visibility === 'private'
                  ? {
                      label: t('makeInternal'),
                      onSelect: () => void patch({ visibility: 'internal' }, t('madeInternal')),
                    }
                  : shared
                    ? {
                        label: 'داخلی کن',
                        onSelect: () => void patch({ visibility: 'internal' }, t('madeInternal')),
                      }
                    : {
                        label: `اشتراکی کن (${studentFirstName} می‌بیند)`,
                        onSelect: () => setPanel('share'),
                      },
                ...(note.isAuthor && note.visibility !== 'private'
                  ? [
                      {
                        label: t('makePrivate'),
                        onSelect: () => void patch({ visibility: 'private' }, t('madePrivate')),
                      },
                    ]
                  : []),
                { label: 'حذف', onSelect: () => setPanel('delete') },
              ]}
            />
          </span>
        ) : null}
      </div>
      <p
        dir="auto"
        className={cn(
          'mt-1.5 rounded-md border px-4 py-3 text-ui leading-6 whitespace-pre-line [overflow-wrap:anywhere]',
          shared ? 'border-primary-line bg-primary-weak' : 'border-dashed border-line-strong bg-bg',
        )}
      >
        {note.body}
      </p>
      {error && !panel ? <Alert tone="error" role="alert" className="mt-2" title={error} /> : null}

      <Dialog
        open={panel === 'share'}
        onClose={() => setPanel(null)}
        title="این یادداشت اشتراکی شود؟"
        description={`${studentFirstName} از این به بعد متن کامل آن را در خانه‌اش می‌بیند.`}
        footer={
          <>
            <Button onClick={() => setPanel(null)}>انصراف</Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={() =>
                void patch(
                  { visibility: 'shared' },
                  `یادداشت اشتراکی شد؛ ${studentFirstName} آن را می‌بیند.`,
                )
              }
            >
              بله، اشتراکی کن
            </Button>
          </>
        }
      >
        {error ? <Alert tone="error" role="alert" title={error} /> : null}
        <p
          dir="auto"
          className="rounded-md border border-dashed border-line-strong bg-bg px-4 py-3 text-ui whitespace-pre-line"
        >
          {note.body}
        </p>
      </Dialog>

      <Dialog
        open={panel === 'delete'}
        onClose={() => setPanel(null)}
        title="این یادداشت حذف شود؟"
        footer={
          <>
            <Button onClick={() => setPanel(null)}>انصراف</Button>
            <Button variant="danger-solid" loading={busy} onClick={() => void remove()}>
              حذف
            </Button>
          </>
        }
      >
        {error ? <Alert tone="error" role="alert" title={error} /> : null}
        <p className="text-ui text-fg-2">از تایم‌لاین برداشته می‌شود.</p>
      </Dialog>

      <Dialog open={panel === 'edit'} onClose={() => setPanel(null)} title="ویرایش یادداشت">
        {panel === 'edit' ? (
          <EditNoteForm
            note={note}
            busy={busy}
            error={error}
            onCancel={() => setPanel(null)}
            onSave={(body, kind) => void patch({ body, kind }, 'یادداشت ویرایش شد.')}
          />
        ) : null}
      </Dialog>
    </li>
  );
}

function EditNoteForm({
  note,
  busy,
  error,
  onCancel,
  onSave,
}: {
  note: NoteDTO;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (body: string, kind: NoteKind) => void;
}) {
  const [body, setBody] = useState(note.body);
  const [kind, setKind] = useState<NoteKind>(note.kind);
  const [local, setLocal] = useState<string | null>(null);
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!body.trim()) {
      setLocal('متن یادداشت را بنویس.');
      return;
    }
    onSave(body.trim(), kind);
  }
  return (
    <form noValidate onSubmit={onSubmit}>
      {error ? <Alert tone="error" role="alert" title={error} /> : null}
      <SelectField label="نوع" value={kind} onChange={(e) => setKind(e.target.value as NoteKind)}>
        {[...new Set([...COMPOSER_KINDS, note.kind])].map((k) => (
          <option key={k} value={k}>
            {noteKindLabel[k]}
          </option>
        ))}
      </SelectField>
      <TextareaField
        label="متن"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        error={local}
      />
      <DialogActions>
        <Button onClick={onCancel}>انصراف</Button>
        <Button type="submit" variant="primary" loading={busy}>
          ذخیره
        </Button>
      </DialogActions>
    </form>
  );
}

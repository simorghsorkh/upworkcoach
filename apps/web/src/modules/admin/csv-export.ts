import { toCsv } from '@/lib/csv';
import { toLocalMobile } from '@/lib/phone';
import { jalaliDate, tehranDateTime } from '@/lib/tehran-day';
import type { Actor } from '@/server/auth/current-user';
import { type DbOrTx, getDb } from '@/server/db';
import { errors } from '@/server/http/errors';
import { listMilestonesForExport } from '../milestones/service';
import { listStudentsForExport } from '../students/service';
import { listTasksForExport } from '../tasks/service';
import { recordAudit } from './service';

/**
 * CSV exports (PRD F11 Should, api.md section 13, security.md SEC-V2/V3). Admin only;
 * audited with the row count. Columns are explicit and minimal: no internal note, flag,
 * health reason or submission text ever goes into a file. Dates are given in both
 * calendars (Jalali `YYYY/MM/DD` and Gregorian `YYYY-MM-DD`, Tehran day). Phones are in
 * the `0912…` form (never starting with `+`). Cells are formula-neutralised by `toCsv`.
 */

const LIFECYCLE_FA = { active: 'فعال', paused: 'متوقف', graduated: 'فارغ‌التحصیل', dropped: 'ریزش' };
const STATUS_FA = {
  open: 'باز',
  in_progress: 'در حال انجام',
  submitted: 'تحویل‌شده',
  changes_requested: 'نیاز به اصلاح',
  accepted: 'تأییدشده',
  cancelled: 'لغوشده',
};

const both = (d: Date | null): [string, string] =>
  d ? [jalaliDate(d), d.toISOString().slice(0, 10)] : ['', ''];

export type CsvFile = { filename: string; content: string; rows: number };

/** GET /exports/students.csv (A). */
export async function exportStudentsCsv(
  actor: Actor,
  meta: { ip?: string | null } = {},
  db: DbOrTx = getDb(),
): Promise<CsvFile> {
  if (actor.role !== 'admin') throw errors.forbidden();
  const rows = await listStudentsForExport(db, actor.organizationId);
  await recordAudit(db, {
    actorId: actor.userId,
    action: 'export.students',
    data: { rows: rows.length },
    ip: meta.ip ?? null,
  });
  const content = toCsv(
    [
      'نام',
      'موبایل',
      'مشاور',
      'کد مرحله',
      'مرحله',
      'روز در مرحله',
      'وضعیت',
      'شاخه',
      'پلتفرم اصلی',
      'لینک ویترین اصلی',
      'تیتر ویترین اصلی',
      'تاریخ ورود (شمسی)',
      'تاریخ ورود (میلادی)',
      'آخرین فعالیت (شمسی)',
      'آخرین فعالیت (میلادی)',
      'کارهای باز',
      'کارهای عقب‌افتاده',
    ],
    rows.map((r) => [
      r.displayName,
      r.phone?.startsWith('+') ? toLocalMobile(r.phone) : '',
      r.mentorName ?? '',
      r.stageCode,
      r.stageName,
      r.daysInStage,
      LIFECYCLE_FA[r.lifecycleStatus],
      r.trackName ?? '',
      r.primaryPlatformName ?? '',
      r.primaryProfileUrl ?? '',
      r.primaryProfileHeadline ?? '',
      ...both(r.joinedAt),
      ...both(r.lastActivityAt),
      r.openTaskCount,
      r.overdueTaskCount,
    ]),
  );
  return { filename: 'students.csv', content, rows: rows.length };
}

/** GET /exports/tasks.csv (A). */
export async function exportTasksCsv(
  actor: Actor,
  meta: { ip?: string | null } = {},
  db: DbOrTx = getDb(),
): Promise<CsvFile> {
  if (actor.role !== 'admin') throw errors.forbidden();
  const rows = await listTasksForExport(db, actor.organizationId);
  await recordAudit(db, {
    actorId: actor.userId,
    action: 'export.tasks',
    data: { rows: rows.length },
    ip: meta.ip ?? null,
  });
  const content = toCsv(
    [
      'هنرجو',
      'عنوان',
      'نوع',
      'نوع تحویل',
      'کد مرحله',
      'وضعیت',
      'مهلت (شمسی)',
      'مهلت (میلادی)',
      'عقب‌افتاده',
      'روز تأخیر',
      'دور اصلاح',
      'تمدید',
      'بازبین',
      'ساخت (شمسی)',
      'ساخت (میلادی)',
      'بسته‌شدن (شمسی)',
      'بسته‌شدن (میلادی)',
    ],
    rows.map((r) => [
      r.studentName,
      r.title,
      r.kind,
      r.submissionType,
      r.stageCode ?? '',
      STATUS_FA[r.status],
      ...both(r.dueAt),
      r.overdue ? 'بله' : 'خیر',
      r.overdueDays,
      r.revisionCount,
      r.extensionCount,
      r.reviewerName,
      ...both(r.createdAt),
      ...both(r.closedAt),
    ]),
  );
  return { filename: 'tasks.csv', content, rows: rows.length };
}

const MILESTONE_STATUS_FA = { proposed: 'پیشنهادشده', approved: 'تأییدشده', rejected: 'ردشده' };

/** GET /exports/milestones.csv (A; F11 Should). No evidence text (SEC-V3). */
export async function exportMilestonesCsv(
  actor: Actor,
  meta: { ip?: string | null } = {},
  db: DbOrTx = getDb(),
): Promise<CsvFile> {
  if (actor.role !== 'admin') throw errors.forbidden();
  const rows = await listMilestonesForExport(db, actor.organizationId);
  await recordAudit(db, {
    actorId: actor.userId,
    action: 'export.milestones',
    data: { rows: rows.length },
    ip: meta.ip ?? null,
  });
  // Noon of the Tehran day: the Jalali date of that same day.
  const day = (d: string) => both(tehranDateTime(d, 12));
  const content = toCsv(
    [
      'هنرجو',
      'نوع',
      'North Star',
      'تاریخ (شمسی)',
      'تاریخ (میلادی)',
      'پلتفرم',
      'مبلغ',
      'ارز',
      'وضعیت',
      'تصمیم (شمسی)',
      'تصمیم (میلادی)',
    ],
    rows.map((r) => [
      r.studentName,
      r.typeName,
      r.countsForNorthStar ? 'بله' : 'خیر',
      day(r.occurredOn)[0],
      r.occurredOn,
      r.platformName ?? '',
      r.amount ?? '',
      r.currency ?? '',
      MILESTONE_STATUS_FA[r.status],
      ...both(r.decidedAt),
    ]),
  );
  return { filename: 'milestones.csv', content, rows: rows.length };
}

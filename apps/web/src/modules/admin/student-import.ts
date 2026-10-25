import Papa from 'papaparse';
import type { z } from 'zod';
import { parseAnyCalendarDay } from '@/lib/jalali';
import { tehranDay } from '@/lib/tehran-day';
import { normalizeFa, toLatinDigits } from '@/lib/text-fa';
import type { Actor } from '@/server/auth/current-user';
import { type Db, getDb } from '@/server/db';
import { ApiError, errors } from '@/server/http/errors';
import { httpsUrl, longText, requiredShortText, shortText } from '@/server/http/schemas';
import { listPlatforms, listStages, listTracks } from '../catalog/service';
import { displayNameInput, phoneInput } from '../identity/contracts';
import { findActiveStaffByPhone, isPhoneTaken, listMentors } from '../identity/service';
import { createStudent, createStudentProfile } from '../students/service';
import { createTask } from '../tasks/service';
import { recordAudit } from './service';

/**
 * Bulk import of existing students from CSV (PRD F11 Should, api.md section 13,
 * progress-tracking.md 2-9, security.md C6 / SEC-V4 / SEC-V5).
 *
 * - CSV only (UTF-8, with or without BOM), at most 1 MB and 500 rows; XLSX → 415.
 * - Every cell goes through the same zod schemas as the normal routes; formula-like input is
 *   stored as text (exports neutralise it).
 * - `dryRun` (default) writes nothing and reports every row. A real run imports the valid
 *   rows only, one student at a time through the normal services (`createStudent`, profile,
 *   task, initial note), and reports the invalid ones.
 * - Errors give the line and the column, never the value (SEC-V5). The response contains
 *   invite links: `no-store` (route) and never logged.
 */

export const MAX_IMPORT_BYTES = 1024 * 1024;
export const MAX_IMPORT_ROWS = 500;

type Column =
  | 'name'
  | 'phone'
  | 'mentor'
  | 'stage'
  | 'track'
  | 'platform'
  | 'profileUrl'
  | 'profileHeadline'
  | 'lastTask'
  | 'lastTaskDue'
  | 'note';

/** Accepted header names (Persian or English; compared after normalisation). */
const HEADERS: Record<Column, string[]> = {
  name: ['نام', 'نام و نام خانوادگی', 'name'],
  phone: ['موبایل', 'شماره موبایل', 'تلفن', 'phone', 'mobile'],
  mentor: ['مشاور', 'mentor'],
  stage: ['مرحله', 'stage'],
  track: ['شاخه', 'track'],
  platform: ['پلتفرم اصلی', 'پلتفرم', 'platform'],
  profileUrl: ['لینک پروفایل', 'لینک ویترین', 'لینک', 'profile url', 'profile'],
  profileHeadline: ['تیتر پروفایل', 'تیتر ویترین', 'تیتر', 'headline'],
  lastTask: ['آخرین کار', 'کار', 'task', 'last task'],
  lastTaskDue: ['مهلت', 'مهلت کار', 'due', 'due date'],
  note: ['یادداشت', 'note'],
};

/** Column labels in error messages. */
const LABEL: Record<Column, string> = {
  name: 'نام',
  phone: 'موبایل',
  mentor: 'مشاور',
  stage: 'مرحله',
  track: 'شاخه',
  platform: 'پلتفرم اصلی',
  profileUrl: 'لینک پروفایل',
  profileHeadline: 'تیتر پروفایل',
  lastTask: 'آخرین کار',
  lastTaskDue: 'مهلت',
  note: 'یادداشت',
};

const headerKey = (h: string) => normalizeFa(h).toLowerCase();

function columnOf(header: string): Column | null {
  const key = headerKey(header);
  for (const [column, names] of Object.entries(HEADERS) as Array<[Column, string[]]>) {
    if (names.some((n) => headerKey(n) === key)) return column;
  }
  return null;
}

export type ImportRowError = { column: string; message: string };

export type ImportRowDTO = {
  /** Line in the file (the header is line 1). */
  line: number;
  ok: boolean;
  errors: ImportRowError[];
  studentId?: string;
  /** Only after a real run; shown once (no-store). */
  inviteUrl?: string;
};

export type ImportResultDTO = {
  dryRun: boolean;
  total: number;
  valid: number;
  imported: number;
  rows: ImportRowDTO[];
};

type ParsedRow = {
  line: number;
  errors: ImportRowError[];
  value?: {
    displayName: string;
    phone: string;
    mentorId: string | null;
    stageId?: string;
    trackId?: string;
    platformId?: string;
    profileUrl: string | null;
    profileHeadline: string | null;
    lastTask: string | null;
    lastTaskDue?: string;
    note: string | null;
  };
};

/** Turns the uploaded bytes into rows of `{ column → cell }`; file-level problems throw. */
export function readCsv(bytes: Uint8Array): Array<Partial<Record<Column, string>>> {
  if (bytes.byteLength > MAX_IMPORT_BYTES) throw new ApiError('PAYLOAD_TOO_LARGE');
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    throw new ApiError('UNSUPPORTED_MEDIA_TYPE', {
      message: 'فقط فایل CSV پذیرفته می‌شود؛ در اکسل «Save as → CSV UTF-8» را بزن.',
    });
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw errors.validation({ file: 'فایل باید با کدگذاری UTF-8 ذخیره شده باشد (CSV UTF-8).' });
  }
  if (text.startsWith('﻿')) text = text.slice(1);
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
  });
  const fields = parsed.meta.fields ?? [];
  const map = new Map<string, Column>();
  for (const field of fields) {
    const column = columnOf(field);
    if (column && ![...map.values()].includes(column)) map.set(field, column);
  }
  const present = new Set(map.values());
  if (!present.has('name') || !present.has('phone')) {
    throw errors.validation({ file: 'ستون‌های «نام» و «موبایل» لازم‌اند.' });
  }
  if (parsed.data.length > MAX_IMPORT_ROWS) {
    throw errors.validation({ file: 'حداکثر ۵۰۰ ردیف در هر فایل.' });
  }
  return parsed.data.map((record) => {
    const row: Partial<Record<Column, string>> = {};
    for (const [field, column] of map) {
      const cell = record[field];
      if (typeof cell === 'string' && cell.trim() !== '') row[column] = cell.trim();
    }
    return row;
  });
}

function firstMessage(result: z.ZodSafeParseResult<unknown>): string {
  if (result.success) return '';
  const issue = result.error.issues[0];
  return issue?.code === 'custom' ? issue.message : 'مقدار نامعتبر است';
}

const sameName = (a: string, b: string) => headerKey(a) === headerKey(b);

/** Validates every row (no writes). */
async function validateRows(
  actor: Actor,
  rows: Array<Partial<Record<Column, string>>>,
  db: Db,
): Promise<ParsedRow[]> {
  const [mentors, stages, tracks, platforms] = await Promise.all([
    listMentors(actor, db),
    listStages(actor, {}, db),
    listTracks(actor, {}, db),
    listPlatforms(actor, {}, db),
  ]);
  const today = tehranDay();
  const seenPhones = new Set<string>();
  const out: ParsedRow[] = [];
  for (const [index, row] of rows.entries()) {
    const line = index + 2;
    const errs: ImportRowError[] = [];
    const fail = (column: Column, message: string) => errs.push({ column: LABEL[column], message });

    const name = displayNameInput.safeParse(row.name ?? '');
    if (!name.success) fail('name', row.name ? firstMessage(name) : 'این فیلد را پر کن.');
    const phone = phoneInput.safeParse(row.phone ?? '');
    let phoneValue = '';
    if (!phone.success) {
      fail('phone', row.phone ? 'شماره‌ی موبایل معتبر نیست.' : 'این فیلد را پر کن.');
    } else {
      phoneValue = phone.data;
      if (seenPhones.has(phoneValue)) fail('phone', 'این شماره در فایل تکراری است.');
      else if (await isPhoneTaken(db, phoneValue)) fail('phone', 'این شماره قبلاً ثبت شده است.');
      seenPhones.add(phoneValue);
    }

    let mentorId: string | null = null;
    if (row.mentor) {
      const asPhone = phoneInput.safeParse(row.mentor);
      const byPhone = asPhone.success ? await findActiveStaffByPhone(db, asPhone.data) : null;
      const byName = mentors.filter((m) => sameName(m.displayName, row.mentor ?? ''));
      if (byPhone) mentorId = byPhone.id;
      else if (byName.length === 1) mentorId = byName[0]?.id ?? null;
      else if (byName.length > 1) fail('mentor', 'چند مشاور با این نام هست؛ موبایلش را بنویس.');
      else fail('mentor', 'مشاوری با این نام یا موبایل پیدا نشد.');
    }

    const stage = row.stage
      ? stages.find(
          (s) =>
            toLatinDigits(s.displayCode) === toLatinDigits(row.stage ?? '') ||
            sameName(s.name, row.stage ?? ''),
        )
      : undefined;
    if (row.stage && !stage) fail('stage', 'مرحله‌ای با این کد پیدا نشد.');
    const track = row.track
      ? tracks.find((t) => sameName(t.code, row.track ?? '') || sameName(t.name, row.track ?? ''))
      : undefined;
    if (row.track && !track) fail('track', 'شاخه‌ای با این نام پیدا نشد.');
    const platform = row.platform
      ? platforms.find((p) => sameName(p.name, row.platform ?? ''))
      : undefined;
    if (row.platform && !platform) fail('platform', 'پلتفرمی با این نام پیدا نشد.');

    let profileUrl: string | null = null;
    if (row.profileUrl) {
      const url = httpsUrl.safeParse(row.profileUrl);
      if (!url.success) fail('profileUrl', 'آدرس کامل را با https بنویس.');
      else profileUrl = url.data;
    }
    const headline = shortText(200).safeParse(row.profileHeadline ?? '');
    if (!headline.success) fail('profileHeadline', firstMessage(headline));
    if ((profileUrl || row.profileHeadline) && !platform) {
      fail('platform', 'برای ویترین، پلتفرم اصلی را هم بنویس.');
    }

    let lastTask: string | null = null;
    if (row.lastTask) {
      const title = requiredShortText(200).safeParse(row.lastTask);
      if (!title.success) fail('lastTask', firstMessage(title));
      else lastTask = title.data;
    }
    let due: string | undefined;
    if (row.lastTaskDue) {
      // ADR-0008 exception (sprint-3 open question): the founder's sheet may hold Jalali
      // dates; this import path accepts 1405/08/01 as well as 2026-10-23.
      const day = parseAnyCalendarDay(row.lastTaskDue);
      if (!day) {
        fail('lastTaskDue', 'تاریخ را به شکل ۱۴۰۵/۰۸/۰۱ (شمسی) یا 2026-10-23 (میلادی) بنویس.');
      } else if (day < today) fail('lastTaskDue', 'مهلت گذشته است؛ امروز یا بعد را بنویس.');
      else due = day;
      if (!row.lastTask) fail('lastTask', 'برای مهلت، عنوان کار را هم بنویس.');
    }
    const note = longText(10_000).safeParse(row.note ?? '');
    if (!note.success) fail('note', firstMessage(note));

    out.push({
      line,
      errors: errs,
      value:
        errs.length === 0 && name.success && note.success && headline.success
          ? {
              displayName: name.data,
              phone: phoneValue,
              mentorId,
              stageId: stage?.id,
              trackId: track?.id,
              platformId: platform?.id,
              profileUrl,
              profileHeadline: headline.data,
              lastTask,
              lastTaskDue: due,
              note: note.data,
            }
          : undefined,
    });
  }
  return out;
}

/** POST /imports/students (A). */
export async function importStudents(
  actor: Actor,
  input: { bytes: Uint8Array; dryRun: boolean },
  meta: { ip?: string | null } = {},
  db: Db = getDb(),
): Promise<ImportResultDTO> {
  if (actor.role !== 'admin') throw errors.forbidden();
  const parsed = await validateRows(actor, readCsv(input.bytes), db);
  const rows: ImportRowDTO[] = parsed.map((p) => ({
    line: p.line,
    ok: p.errors.length === 0,
    errors: p.errors,
  }));
  const valid = rows.filter((r) => r.ok).length;
  let imported = 0;
  if (!input.dryRun) {
    for (const [index, p] of parsed.entries()) {
      const row = rows[index];
      if (!p.value || !row) continue;
      try {
        const created = await createStudent(
          actor,
          {
            displayName: p.value.displayName,
            phone: p.value.phone,
            mentorId: p.value.mentorId,
            stageId: p.value.stageId,
            trackId: p.value.trackId ?? null,
            primaryPlatformId: p.value.platformId ?? null,
            initialNote: p.value.note,
          },
          meta,
          db,
        );
        row.studentId = created.student.id;
        row.inviteUrl = created.inviteUrl;
        if (p.value.platformId && (p.value.profileUrl || p.value.profileHeadline)) {
          await createStudentProfile(
            actor,
            created.student.id,
            {
              platformId: p.value.platformId,
              kind: 'profile',
              publicUrl: p.value.profileUrl,
              headline: p.value.profileHeadline,
              isPrimary: true,
            },
            db,
          );
        }
        if (p.value.lastTask) {
          await createTask(
            actor,
            created.student.id,
            { title: p.value.lastTask, dueDate: p.value.lastTaskDue },
            db,
          );
        }
        imported += 1;
      } catch (err) {
        row.ok = false;
        const fields = err instanceof ApiError ? Object.keys(err.fields ?? {}) : [];
        row.errors.push(
          ...(fields.length > 0
            ? fields.map((f) => ({ column: f, message: 'مقدار نامعتبر است' }))
            : [{ column: '-', message: 'ثبت این ردیف کامل نشد؛ پرونده را دستی بررسی کن.' }]),
        );
      }
    }
    await recordAudit(db, {
      actorId: actor.userId,
      action: 'import.students',
      data: { rows: rows.length, valid, imported },
      ip: meta.ip ?? null,
    });
  }
  return { dryRun: input.dryRun, total: rows.length, valid, imported, rows };
}

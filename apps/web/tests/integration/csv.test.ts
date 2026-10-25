import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { gregorianToJalali } from '@/lib/jalali';
import { toLocalMobile } from '@/lib/phone';
import { tehranDayEnd } from '@/lib/tehran-day';
import { auditLog } from '@/modules/admin/schema';
import { users } from '@/modules/identity/schema';
import { platformProfiles, students } from '@/modules/students/schema';
import { tasks } from '@/modules/tasks/schema';
import { notes } from '@/modules/timeline/schema';
import { getDb } from '@/server/db';
import { dayFromToday, noteFixture, taskFixture } from './fixtures';
import { call, createUser, loginAs, SEEDED, type TestUser, uniquePhone } from './helpers';

/** CSV import (C6, SEC-V4/V5) and exports (SEC-V2/V3, T-CSV) — PRD F11 Should. */

let admin: TestUser;
let mentor: TestUser;
const c: Record<string, Record<string, string>> = {};

beforeAll(async () => {
  admin = await createUser('admin');
  mentor = await createUser('mentor', { displayName: 'مشاور واردات' });
  c.admin = (await loginAs(admin)).cookies;
  c.mentor = (await loginAs(mentor)).cookies;
});

function csvForm(content: string | Uint8Array, dryRun?: 'true' | 'false'): FormData {
  const form = new FormData();
  form.set('file', new File([content as BlobPart], 'students.csv', { type: 'text/csv' }));
  if (dryRun) form.set('dryRun', dryRun);
  return form;
}

const importAs = (who: string, form: FormData) =>
  call('POST', '/imports/students', { cookies: c[who], form });

describe('POST /imports/students', () => {
  it('dry run validates every row (line + column, never the value) and writes nothing', async () => {
    const good = uniquePhone();
    const taken = await createUser('student');
    const bad = '0912abc';
    const csv = [
      '﻿نام,موبایل,مشاور,مرحله,پلتفرم اصلی,لینک پروفایل,آخرین کار,مهلت,یادداشت',
      `علی رضایی,${toLocalMobile(good)},مشاور واردات,۳,Upwork,https://upwork.com/fl/ali,بازنویسی تیتر,${dayFromToday(5)},=HYPERLINK("x")`,
      `,${bad},ناشناس,۹۹,Unknown,http://x.com,,1404/12/30,`,
      `دوباره,${toLocalMobile(good)},,,,,,,`,
      `قدیمی,${toLocalMobile(taken.phone)},,,,,,,`,
    ].join('\r\n');
    const res = await importAs('admin', csvForm(csv));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.body).toMatchObject({ dryRun: true, total: 4, valid: 1, imported: 0 });
    expect(res.body.rows[0]).toEqual({ line: 2, ok: true, errors: [] });
    const columns = res.body.rows[1].errors.map((e: { column: string }) => e.column);
    expect(columns).toEqual(
      expect.arrayContaining([
        'نام',
        'موبایل',
        'مشاور',
        'مرحله',
        'پلتفرم اصلی',
        'لینک پروفایل',
        'مهلت',
        'آخرین کار',
      ]),
    );
    expect(JSON.stringify(res.body)).not.toContain(bad);
    expect(res.body.rows[2].errors[0]).toEqual({
      column: 'موبایل',
      message: 'این شماره در فایل تکراری است.',
    });
    expect(res.body.rows[3].errors[0].message).toBe('این شماره قبلاً ثبت شده است.');
    expect(await getDb().select().from(users).where(eq(users.phone, good))).toHaveLength(0);
  });

  it('Jalali deadlines are accepted in the import (ADR-0008 exception; Persian digits too)', async () => {
    const day = dayFromToday(6);
    const { jy, jm, jd } = gregorianToJalali(day);
    const jalali = `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
    const persian = jalali.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] ?? d);
    const phone = uniquePhone();
    const csv = [
      'نام,موبایل,آخرین کار,مهلت',
      `مهلت شمسی,${toLocalMobile(phone)},کار شمسی,${persian}`,
      `گذشته,${toLocalMobile(uniquePhone())},کار,1400/01/01`,
    ].join('\n');
    const res = await importAs('admin', csvForm(csv, 'false'));
    expect(res.body).toMatchObject({ total: 2, valid: 1, imported: 1 });
    expect(res.body.rows[1].errors).toEqual([
      { column: 'مهلت', message: 'مهلت گذشته است؛ امروز یا بعد را بنویس.' },
    ]);
    const [task] = await getDb()
      .select({ dueAt: tasks.dueAt })
      .from(tasks)
      .where(eq(tasks.studentId, res.body.rows[0].studentId));
    expect(task?.dueAt.toISOString()).toBe(tehranDayEnd(day).toISOString());
  });

  it('a real run imports valid rows with mentor, stage, profile, task and an internal note', async () => {
    const phone = uniquePhone();
    const csv = [
      'name,phone,mentor,stage,platform,profile url,headline,task,due,note',
      `سارا,${toLocalMobile(phone)},${toLocalMobile(mentor.phone)},2,Fiverr,https://fiverr.com/sara,Logo designer,نمونه‌کار اول,${dayFromToday(4)},=1+1`,
      `,0000,,,,,,,,`,
    ].join('\n');
    const res = await importAs('admin', csvForm(csv, 'false'));
    expect(res.body).toMatchObject({ dryRun: false, total: 2, valid: 1, imported: 1 });
    const row = res.body.rows[0];
    expect(row.ok).toBe(true);
    expect(row.inviteUrl).toMatch(/\/invite#t=/);
    const [student] = await getDb()
      .select({ mentor: students.primaryMentorId, stage: students.currentStageId })
      .from(students)
      .where(eq(students.userId, row.studentId));
    expect(student).toEqual({ mentor: mentor.id, stage: SEEDED.stages[2] });
    const profiles = await getDb()
      .select({ url: platformProfiles.publicUrl, primary: platformProfiles.isPrimary })
      .from(platformProfiles)
      .where(eq(platformProfiles.studentId, row.studentId));
    expect(profiles).toEqual([{ url: 'https://fiverr.com/sara', primary: true }]);
    expect(
      await getDb()
        .select({ t: tasks.title })
        .from(tasks)
        .where(eq(tasks.studentId, row.studentId)),
    ).toEqual([{ t: 'نمونه‌کار اول' }]);
    // Formula-like input is stored as text (exports neutralise it); the note is internal.
    expect(
      await getDb()
        .select({ v: notes.visibility, b: notes.body })
        .from(notes)
        .where(eq(notes.studentId, row.studentId)),
    ).toEqual([{ v: 'internal', b: '=1+1' }]);
    const audits = await getDb()
      .select({ data: auditLog.data })
      .from(auditLog)
      .where(eq(auditLog.action, 'import.students'));
    expect(audits.at(-1)?.data).toEqual({ rows: 2, valid: 1, imported: 1 });
    expect(JSON.stringify(audits)).not.toContain('invite');
  });

  it('XLSX → 415; non-UTF-8 → 422; missing name/phone headers → 422; mentors → 403', async () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    expect((await importAs('admin', csvForm(zip))).status).toBe(415);
    const latin1 = new Uint8Array([0x6e, 0x61, 0x6d, 0x65, 0x2c, 0xe9, 0xff, 0x0a]);
    expect((await importAs('admin', csvForm(latin1))).status).toBe(422);
    expect((await importAs('admin', csvForm('foo,bar\n1,2\n'))).status).toBe(422);
    const many = ['نام,موبایل', ...Array.from({ length: 501 }, (_, i) => `n${i},0912000${i}`)];
    expect((await importAs('admin', csvForm(many.join('\n')))).status).toBe(422);
    expect((await importAs('mentor', csvForm('نام,موبایل\n'))).status).toBe(403);
  });
});

describe('GET /exports/*.csv (T-CSV)', () => {
  it('students.csv: BOM, neutralised cells, 0912 phones, no internal note; audited', async () => {
    const s = await createUser('student', { mentorId: mentor.id, displayName: '=cmd|calc' });
    await noteFixture(s.id, mentor.id, { body: 'CANARY-CSV-NOTE' });
    await taskFixture(s.id, mentor.id, { title: '@SUM(A1)' });
    const res = await call('GET', '/exports/students.csv', { cookies: c.admin });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="students.csv"');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect([...res.bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(res.bytes);
    expect(text.startsWith('"نام"')).toBe(true);
    expect(text).toContain(`"'=cmd|calc"`);
    expect(text).toContain(`"${toLocalMobile(s.phone)}"`);
    expect(text).not.toContain(s.phone);
    expect(text).not.toContain('CANARY-CSV-NOTE');
    const tasksCsv = new TextDecoder().decode(
      (await call('GET', '/exports/tasks.csv', { cookies: c.admin })).bytes,
    );
    expect(tasksCsv).toContain(`"'@SUM(A1)"`);
    const actions = (
      await getDb()
        .select({ a: auditLog.action })
        .from(auditLog)
        .where(eq(auditLog.actorId, admin.id))
    ).map((r) => r.a);
    expect(actions).toEqual(expect.arrayContaining(['export.students', 'export.tasks']));
    expect((await call('GET', '/exports/students.csv', { cookies: c.mentor })).status).toBe(403);
  });
});

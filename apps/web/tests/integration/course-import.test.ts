import { beforeAll, describe, expect, it } from 'vitest';
import { messagesFor } from '@/i18n/messages';
import { toLocalMobile } from '@/lib/phone';
import { call, createUser, loginAs, type TestUser, uniquePhone } from './helpers';

/**
 * Coach Office sprint 6: CSV import into one course (`runId`), with the optional «فاز» column;
 * a mentee already registered with the row's mobile is only enrolled.
 */

const MI = messagesFor('fa').studentImport;

let admin: TestUser;
let old: TestUser;
let member: TestUser;
let ac: Record<string, string>;
let runId = '';
let phases: Array<{ id: string; title: string }> = [];

function form(csv: string, fields: Record<string, string>): FormData {
  const f = new FormData();
  f.set('file', new File([csv], 'students.csv', { type: 'text/csv' }));
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const importAs = (fields: Record<string, string>, csv: string) =>
  call('POST', '/imports/students', { cookies: ac, form: form(csv, fields) });

async function inPhase(phaseId: string): Promise<string[]> {
  const res = await call('GET', '/students', { cookies: ac, query: { runId, phaseId } });
  expect(res.status).toBe(200);
  return (res.body.items as Array<{ id: string }>).map((i) => i.id);
}

beforeAll(async () => {
  admin = await createUser('admin');
  old = await createUser('student', { displayName: 'هنرجوی قدیمی' });
  member = await createUser('student', { displayName: 'عضو فعلی' });
  ac = (await loginAs(admin)).cookies;
  const tpl = await call('POST', '/program-templates', {
    cookies: ac,
    body: { kind: 'program', title: 'دوره‌ی ورود گروهی' },
  });
  const templateId = tpl.body.id as string;
  for (const title of ['شروع', 'پروپوزال', 'پیگیری']) {
    await call('POST', '/program-templates/[id]/nodes', {
      cookies: ac,
      params: { id: templateId },
      body: { nodeType: 'phase', title },
    });
  }
  await call('POST', '/program-templates/[id]/publish', {
    cookies: ac,
    params: { id: templateId },
  });
  const run = await call('POST', '/program-runs', {
    cookies: ac,
    body: { templateId, mode: 'group', title: 'گروه ورود CSV' },
  });
  expect(run.status).toBe(201);
  runId = run.body.id as string;
  phases = run.body.phases as Array<{ id: string; title: string }>;
  const joined = await call('POST', '/program-runs/[id]/enrollments', {
    cookies: ac,
    params: { id: runId },
    body: { studentIds: [member.id] },
  });
  expect(joined.status).toBe(200);
});

describe('POST /imports/students with a course', () => {
  const fresh = uniquePhone();
  const csv = () =>
    [
      'نام,موبایل,مشاور,فاز',
      `هنرجوی تازه,${toLocalMobile(fresh)},,۲`,
      `هنرجوی قدیمی,${toLocalMobile(old.phone)},مشاور ناشناس,پیگیری`,
      `عضو فعلی,${toLocalMobile(member.phone)},,`,
      `فاز اشتباه,${toLocalMobile(uniquePhone())},,9`,
    ].join('\r\n');

  it('dry run: phases by number or title, existing mentees, members already in the course', async () => {
    const res = await importAs({ runId }, csv());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      dryRun: true,
      total: 4,
      imported: 0,
      enrolled: 0,
      course: { id: runId, title: 'گروه ورود CSV' },
    });
    const [fresh_, old_, member_, wrong] = res.body.rows;
    expect(fresh_).toEqual({ line: 2, ok: true, errors: [] });
    // An existing mentee is only enrolled: the unknown mentor of that row still fails.
    expect(old_).toMatchObject({ line: 3, ok: false, existing: true });
    expect(member_.errors).toEqual([{ column: 'موبایل', message: MI.alreadyInCourse }]);
    expect(wrong.errors).toEqual([{ column: MI.phaseColumn, message: MI.phaseNotFound }]);
  });

  it('the phase column needs a course; only open group courses take an import', async () => {
    const noCourse = await importAs({}, csv());
    expect(noCourse.body.rows[0].errors).toEqual([
      { column: MI.phaseColumn, message: MI.phaseNeedsCourse },
    ]);
    const runs = await call('GET', '/program-runs', { cookies: ac });
    const list = (Array.isArray(runs.body) ? runs.body : runs.body.items) as Array<{
      id: string;
      isLegacy: boolean;
    }>;
    const legacy = list.find((r) => r.isLegacy);
    expect(legacy).toBeDefined();
    const res = await importAs({ runId: legacy?.id ?? '' }, csv());
    expect(res.status).toBe(422);
    expect(res.body.error.fields.runId).toBe(MI.courseInvalid);
    expect((await importAs({ runId: 'nope' }, csv())).status).toBe(422);
  });

  it('a real run creates the new mentees and enrolls everyone valid at their phase', async () => {
    const real = [
      'نام,موبایل,فاز',
      `هنرجوی تازه,${toLocalMobile(fresh)},۲`,
      `هنرجوی قدیمی,${toLocalMobile(old.phone)},پیگیری`,
      `بی‌فاز,${toLocalMobile(uniquePhone())},`,
    ].join('\r\n');
    const res = await importAs({ runId, dryRun: 'false' }, real);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ dryRun: false, valid: 3, imported: 2, enrolled: 3 });
    const [created, existing, plain] = res.body.rows;
    expect(created.inviteUrl).toEqual(expect.any(String));
    expect(existing).toMatchObject({ ok: true, existing: true, studentId: old.id });
    expect(existing.inviteUrl).toBeUndefined();
    expect(await inPhase(phases[1]?.id ?? '')).toEqual([created.studentId]);
    expect(await inPhase(phases[2]?.id ?? '')).toEqual([old.id]);
    expect((await inPhase(phases[0]?.id ?? '')).sort()).toEqual(
      [member.id, plain.studentId].sort(),
    );
  });
});

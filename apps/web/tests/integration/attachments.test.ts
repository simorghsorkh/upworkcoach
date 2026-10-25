import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { attachments } from '@/modules/files/schema';
import { cleanupPendingAttachments } from '@/modules/files/service';
import { submissions, tasks } from '@/modules/tasks/schema';
import { getDb } from '@/server/db';
import { getStorage } from '@/server/storage';
import { formWith, imageBytes, pendingAttachmentFixture, taskFixture } from './fixtures';
import { call, createUser, loginAs, type TestUser } from './helpers';

/**
 * Attachments (api.md section 14, security.md C4, T-UPLOAD): content-type sniffing, size and
 * pixel limits, EXIF removal, quota, atomic linking to a submission, download access and
 * headers, and `files.cleanup`.
 */

let mentor: TestUser;
let otherMentor: TestUser;
let student: TestUser;
let otherStudent: TestUser;
const c: Record<string, Record<string, string>> = {};

beforeAll(async () => {
  mentor = await createUser('mentor');
  otherMentor = await createUser('mentor');
  student = await createUser('student', { mentorId: mentor.id });
  otherStudent = await createUser('student', { mentorId: otherMentor.id });
  for (const [key, user] of Object.entries({ mentor, otherMentor, student, otherStudent })) {
    c[key] = (await loginAs(user)).cookies;
  }
});

const upload = (who: string, form: FormData) =>
  call('POST', '/attachments', { cookies: c[who], form });

describe('upload (T-UPLOAD)', () => {
  it('a PNG becomes a pending attachment with re-encoded metadata', async () => {
    const res = await upload('student', formWith(await imageBytes('png'), 'C:\\fake\\screen.png'));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'pending',
      mimeType: 'image/png',
      width: 16,
      height: 12,
      originalName: 'screen.png',
    });
    expect(res.body.href).toBe(`/api/v1/attachments/${res.body.id}`);
    const [row] = await getDb()
      .select({ key: attachments.storageKey })
      .from(attachments)
      .where(eq(attachments.id, res.body.id));
    // Random storage key: neither the row id nor the user's file name.
    expect(row?.key).toMatch(/^attachments\/[0-9a-f-]{36}$/);
    expect(row?.key).not.toContain(res.body.id);
  });

  it('a JPEG with EXIF comes back without it (SEC-U5)', async () => {
    const jpeg = await sharp({
      create: { width: 20, height: 10, channels: 3, background: '#00aa00' },
    })
      .jpeg()
      .withExif({ IFD0: { Artist: 'CANARY-GPS-77' } })
      .toBuffer();
    const res = await upload('student', formWith(jpeg, 'a.jpg', 'image/jpeg'));
    expect(res.status).toBe(201);
    const file = await call('GET', '/attachments/[id]', {
      cookies: c.student,
      params: { id: res.body.id },
    });
    expect(file.status).toBe(200);
    expect(Buffer.from(file.bytes).includes(Buffer.from('CANARY-GPS-77'))).toBe(false);
    expect((await sharp(file.bytes).metadata()).exif).toBeUndefined();
  });

  it('HTML disguised as PNG and SVG → 415; over 5 MB → 413; no file → 422', async () => {
    const html = new TextEncoder().encode('<html><script>alert(1)</script></html>');
    expect((await upload('student', formWith(html, 'x.png', 'image/png'))).status).toBe(415);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect((await upload('student', formWith(svg, 'x.svg', 'image/svg+xml'))).status).toBe(415);
    const big = new Uint8Array(6 * 1024 * 1024);
    expect((await upload('student', formWith(big, 'big.png'))).status).toBe(413);
    const empty = new FormData();
    empty.set('other', 'x');
    expect((await upload('student', empty)).status).toBe(422);
  });

  it('quota: 20 pending uploads → 429 (SEC-U7)', async () => {
    const busy = await createUser('student');
    for (let i = 0; i < 20; i += 1) await pendingAttachmentFixture(busy.id);
    const res = await call('POST', '/attachments', {
      cookies: (await loginAs(busy)).cookies,
      form: formWith(await imageBytes()),
    });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('TOO_MANY_ATTEMPTS');
  });
});

describe('linking to a submission (C4) and download access', () => {
  it('another user’s, already linked and missing ids give one 422 and nothing is written', async () => {
    const theirs = (await upload('otherStudent', formWith(await imageBytes()))).body.id as string;
    const mine = (await upload('student', formWith(await imageBytes()))).body.id as string;
    const taskId = await taskFixture(student.id, mentor.id, { submissionType: 'file' });
    const bodies: unknown[] = [];
    for (const ids of [[mine, theirs], ['01900000-0000-7000-8000-00000000f00d']]) {
      const res = await call('POST', '/tasks/[id]/submissions', {
        cookies: c.student,
        params: { id: taskId },
        body: { attachmentIds: ids },
      });
      expect(res.status).toBe(422);
      bodies.push(res.body);
    }
    expect(bodies[0]).toEqual(bodies[1]);
    expect((bodies[0] as { error: { fields: Record<string, string> } }).error.fields).toEqual({
      attachmentIds: 'مقدار نامعتبر است',
    });
    // Rolled back: no version, task still open, my attachment still pending.
    expect(
      await getDb()
        .select({ id: submissions.id })
        .from(submissions)
        .where(eq(submissions.taskId, taskId)),
    ).toHaveLength(0);
    const [task] = await getDb()
      .select({ s: tasks.status })
      .from(tasks)
      .where(eq(tasks.id, taskId));
    expect(task?.s).toBe('open');
    const [att] = await getDb()
      .select({ s: attachments.status })
      .from(attachments)
      .where(eq(attachments.id, mine));
    expect(att?.s).toBe('pending');

    const ok = await call('POST', '/tasks/[id]/submissions', {
      cookies: c.student,
      params: { id: taskId },
      body: { attachmentIds: [mine, mine], bodyText: 'اسکرین‌شات' },
    });
    expect(ok.status).toBe(201);
    // A linked attachment can never move to another parent.
    const other = await taskFixture(student.id, mentor.id, { submissionType: 'file' });
    expect(
      (
        await call('POST', '/tasks/[id]/submissions', {
          cookies: c.student,
          params: { id: other },
          body: { attachmentIds: [mine] },
        })
      ).status,
    ).toBe(422);

    // Download: the owner student and the mentor in scope; nobody else.
    for (const who of ['student', 'mentor']) {
      const res = await call('GET', '/attachments/[id]', { cookies: c[who], params: { id: mine } });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('content-security-policy')).toBe(
        "default-src 'none'; img-src 'self'; sandbox",
      );
      expect(res.headers.get('cache-control')).toBe('private, no-store');
      expect(res.headers.get('content-disposition')).toMatch(/^inline; filename\*=UTF-8''/);
    }
    for (const who of ['otherStudent', 'otherMentor']) {
      expect(
        (await call('GET', '/attachments/[id]', { cookies: c[who], params: { id: mine } })).status,
      ).toBe(404);
    }
    // The staff task detail lists the attachment.
    const detail = await call('GET', '/tasks/[id]', { cookies: c.mentor, params: { id: taskId } });
    expect(detail.body.submissions[0].attachments.map((a: { id: string }) => a.id)).toEqual([mine]);
  });

  it('a pending attachment is visible only to its uploader', async () => {
    const id = (await upload('student', formWith(await imageBytes()))).body.id as string;
    expect(
      (await call('GET', '/attachments/[id]', { cookies: c.student, params: { id } })).status,
    ).toBe(200);
    expect(
      (await call('GET', '/attachments/[id]', { cookies: c.mentor, params: { id } })).status,
    ).toBe(404);
  });
});

describe('files.cleanup (ADR-0007)', () => {
  it('removes pending uploads older than 24 hours (object and row), keeps linked ones', async () => {
    const stale = (await upload('student', formWith(await imageBytes()))).body.id as string;
    const fresh = (await upload('student', formWith(await imageBytes()))).body.id as string;
    await getDb()
      .update(attachments)
      .set({ createdAt: new Date(Date.now() - 25 * 3600_000) })
      .where(eq(attachments.id, stale));
    const [row] = await getDb()
      .select({ key: attachments.storageKey })
      .from(attachments)
      .where(eq(attachments.id, stale));
    expect(await getStorage().exists(row?.key ?? '')).toBe(true);
    const result = await cleanupPendingAttachments();
    expect(result.deleted).toBeGreaterThanOrEqual(1);
    expect(await getStorage().exists(row?.key ?? '')).toBe(false);
    const left = await getDb().select({ id: attachments.id }).from(attachments);
    expect(left.map((r) => r.id)).not.toContain(stale);
    expect(left.map((r) => r.id)).toContain(fresh);
  });
});

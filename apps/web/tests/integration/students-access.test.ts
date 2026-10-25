import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { users } from '@/modules/identity/schema';
import { platformProfiles, students } from '@/modules/students/schema';
import { getDb } from '@/server/db';
import { ROUTES } from '@/server/http/routes.manifest';
import {
  type CallOptions,
  call,
  createUser,
  loginAs,
  SEEDED,
  type TestUser,
  uniquePhone,
} from './helpers';

/**
 * Student-scope roles of T-MATRIX (ADR-0004 section 4, security.md C3): M-owner, M-other,
 * M-former (after a mentor change), S-owner, S-other; missing and out-of-scope ids give one
 * identical 404. Plus T-REF (reference ids → 422, nothing written), T-ESC (mass assignment
 * → 422), and the student DTO canary (no internal field reaches /me routes).
 */

const MISSING = '01900000-0000-7000-8000-00000000abcd';

let admin: TestUser;
let owner: TestUser;
let other: TestUser;
let student: TestUser;
let otherStudent: TestUser;
let profileId: string;
const c: Record<string, Record<string, string>> = {};

beforeAll(async () => {
  admin = await createUser('admin');
  owner = await createUser('mentor');
  other = await createUser('mentor');
  student = await createUser('student', { mentorId: owner.id });
  otherStudent = await createUser('student', { mentorId: other.id });
  for (const [key, user] of Object.entries({ admin, owner, other, student, otherStudent })) {
    c[key] = (await loginAs(user)).cookies;
  }
  const [row] = await getDb()
    .insert(platformProfiles)
    .values({
      studentId: student.id,
      platformId: SEEDED.platforms.upwork,
      kind: 'profile',
      createdBy: student.id,
    })
    .returning({ id: platformProfiles.id });
  profileId = row?.id ?? '';
});

/** Every staff route that takes a student id in the path (from the manifest). */
const studentRoutes = ROUTES.filter((r) => r.path.startsWith('/students/[id]'));
const profileRoutes = ROUTES.filter((r) => r.path.startsWith('/profiles/[id]'));

function bodyFor(method: string, path: string): unknown {
  switch (`${method} ${path}`) {
    case 'PATCH /students/[id]':
      return { hoursPerWeek: 3 };
    case 'PUT /students/[id]/mentor':
      return { mentorId: null };
    case 'PUT /students/[id]/lifecycle':
      return { status: 'active' };
    case 'POST /students/[id]/profiles':
      return { platformId: SEEDED.platforms.upwork, kind: 'other' };
    case 'PUT /students/[id]/stage':
      return { toStageId: SEEDED.stages[1], kind: 'advance' };
    case 'POST /students/[id]/tasks':
      return { title: 'x' };
    case 'POST /students/[id]/notes':
      return { body: 'x' };
    case 'PUT /students/[id]/health/snooze':
      return {
        until: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
        reason: 'x',
      };
    case 'POST /students/[id]/flags':
      return { category: 'other', level: 'yellow' };
    case 'POST /students/[id]/milestones':
      return { typeId: SEEDED.milestoneTypes.profileReady, occurredOn: '2026-01-01' };
    case 'PATCH /profiles/[id]':
      return { niche: 'x' };
    case 'POST /profiles/[id]/snapshots':
      return { bodyText: 'x' };
    default:
      return undefined;
  }
}

async function as(who: string, method: string, path: string, id: string) {
  const options: CallOptions = { cookies: c[who], params: { id } };
  const body = bodyFor(method, path);
  if (body !== undefined) options.body = body;
  return call(method, path, options);
}

describe('student routes: M-other, missing id and S get the right answer', () => {
  for (const entry of studentRoutes) {
    it(`${entry.method} ${entry.path}`, async () => {
      const missing = await as('other', entry.method, entry.path, MISSING);
      const outOfScope = await as('other', entry.method, entry.path, student.id);
      if (
        entry.access !== 'any' &&
        Array.isArray(entry.access) &&
        !entry.access.includes('mentor')
      ) {
        // Admin-only (mentor change): 403 for every mentor.
        expect(missing.status).toBe(403);
        expect(outOfScope.status).toBe(403);
      } else {
        expect(missing.status).toBe(404);
        expect(outOfScope.status).toBe(404);
        expect(outOfScope.body).toEqual(missing.body);
      }
      // Students never use staff routes, not even for their own id.
      expect((await as('student', entry.method, entry.path, student.id)).status).toBe(403);
    });
  }

  it('M-owner and A read the record; a non-UUID id is a plain 404', async () => {
    for (const who of ['owner', 'admin']) {
      expect((await as(who, 'GET', '/students/[id]', student.id)).status).toBe(200);
    }
    expect((await as('admin', 'GET', '/students/[id]', 'abc')).status).toBe(404);
  });
});

describe('profile routes: S-other and M-other get the same 404 as a missing id', () => {
  for (const entry of profileRoutes) {
    it(`${entry.method} ${entry.path}`, async () => {
      for (const who of ['other', 'otherStudent']) {
        const missing = await as(who, entry.method, entry.path, MISSING);
        const res = await as(who, entry.method, entry.path, profileId);
        if (who === 'otherStudent' && entry.path === '/profiles/[id]/approve') {
          expect(res.status).toBe(403);
          continue;
        }
        expect(missing.status).toBe(404);
        expect(res.status).toBe(404);
        expect(res.body).toEqual(missing.body);
      }
    });
  }

  it('S-owner and M-owner may read and edit the profile', async () => {
    for (const who of ['student', 'owner', 'admin']) {
      expect((await as(who, 'GET', '/profiles/[id]/snapshots', profileId)).status).toBe(200);
      expect((await as(who, 'PATCH', '/profiles/[id]', profileId)).status).toBe(200);
    }
  });
});

describe('M-former: after a mentor change the old mentor loses access at once', () => {
  it('404 on every student and profile route; the new mentor gets in', async () => {
    const moved = await createUser('student', { mentorId: owner.id });
    const [profile] = await getDb()
      .insert(platformProfiles)
      .values({
        studentId: moved.id,
        platformId: SEEDED.platforms.upwork,
        kind: 'profile',
        createdBy: moved.id,
      })
      .returning({ id: platformProfiles.id });
    expect((await as('owner', 'GET', '/students/[id]', moved.id)).status).toBe(200);

    expect(
      (
        await call('PUT', '/students/[id]/mentor', {
          cookies: c.owner,
          params: { id: moved.id },
          body: { mentorId: other.id },
        })
      ).status,
    ).toBe(403);
    const changed = await call('PUT', '/students/[id]/mentor', {
      cookies: c.admin,
      params: { id: moved.id },
      body: { mentorId: other.id, reason: 'تقسیم بار' },
    });
    expect(changed.status).toBe(200);
    expect(changed.body.mentor.id).toBe(other.id);

    for (const entry of studentRoutes.filter(
      (r) => r.access !== 'any' && (r.access as readonly string[]).includes('mentor'),
    )) {
      expect((await as('owner', entry.method, entry.path, moved.id)).status).toBe(404);
    }
    for (const entry of profileRoutes) {
      expect((await as('owner', entry.method, entry.path, profile?.id ?? '')).status).toBe(404);
    }
    const list = await call('GET', '/students', { cookies: c.owner, query: { lifecycle: 'all' } });
    expect(list.body.items.map((s: { id: string }) => s.id)).not.toContain(moved.id);
    expect((await as('other', 'GET', '/students/[id]', moved.id)).status).toBe(200);
  });
});

describe('reference ids (T-REF, C3): 422 and nothing written', () => {
  it('POST /students: a student as mentorId, inactive/unknown stage, unknown platform', async () => {
    const phone = uniquePhone();
    const res = await call('POST', '/students', {
      cookies: c.admin,
      body: {
        displayName: 'ارجاع بد',
        phone,
        mentorId: student.id,
        stageId: MISSING,
        primaryPlatformId: MISSING,
        trackId: MISSING,
      },
    });
    expect(res.status).toBe(422);
    expect(res.body.error.fields).toEqual({
      mentorId: 'مقدار نامعتبر است',
      stageId: 'مقدار نامعتبر است',
      primaryPlatformId: 'مقدار نامعتبر است',
      trackId: 'مقدار نامعتبر است',
    });
    const created = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phone, phone));
    expect(created).toEqual([]);
  });

  it('PUT /students/:id/mentor with a disabled mentor or a student id → 422', async () => {
    const disabled = await createUser('mentor', { status: 'disabled' });
    for (const mentorId of [disabled.id, otherStudent.id, MISSING]) {
      const res = await call('PUT', '/students/[id]/mentor', {
        cookies: c.admin,
        params: { id: student.id },
        body: { mentorId },
      });
      expect(res.status).toBe(422);
      expect(res.body.error.fields).toEqual({ mentorId: 'مقدار نامعتبر است' });
    }
    const [row] = await getDb()
      .select({ m: students.primaryMentorId })
      .from(students)
      .where(eq(students.userId, student.id));
    expect(row?.m).toBe(owner.id);
  });

  it('PUT /students/:id/stage with an unknown stage → 422; PATCH with an unknown track → 422', async () => {
    const stage = await call('PUT', '/students/[id]/stage', {
      cookies: c.owner,
      params: { id: student.id },
      body: { toStageId: MISSING, kind: 'advance' },
    });
    expect(stage.status).toBe(422);
    expect(stage.body.error.fields).toEqual({ toStageId: 'مقدار نامعتبر است' });
    const patch = await call('PATCH', '/students/[id]', {
      cookies: c.owner,
      params: { id: student.id },
      body: { trackId: MISSING },
    });
    expect(patch.status).toBe(422);
  });
});

describe('mass assignment (T-ESC, SEC-A7): forbidden fields are not in the schema → 422', () => {
  it('student: primaryMentorId, currentStageId, lifecycleStatus, tags, level on /me/student', async () => {
    for (const key of [
      'primaryMentorId',
      'currentStageId',
      'lifecycleStatus',
      'tags',
      'level',
      'studentId',
    ]) {
      const res = await call('PATCH', '/me/student', {
        cookies: c.student,
        body: { [key]: key === 'tags' ? ['x'] : owner.id },
      });
      expect(res.status).toBe(422);
      expect(res.body.error.fields[key]).toBe('فیلد ناشناخته');
    }
  });

  it('staff: primaryMentorId, currentStageId, lifecycleStatus on PATCH /students/:id', async () => {
    for (const key of ['primaryMentorId', 'currentStageId', 'lifecycleStatus', 'searchText']) {
      const res = await call('PATCH', '/students/[id]', {
        cookies: c.owner,
        params: { id: student.id },
        body: { [key]: other.id },
      });
      expect(res.status).toBe(422);
    }
    const [row] = await getDb()
      .select({ m: students.primaryMentorId })
      .from(students)
      .where(eq(students.userId, student.id));
    expect(row?.m).toBe(owner.id);
  });

  it('a student cannot pass a studentId to /me/profiles', async () => {
    const res = await call('POST', '/me/profiles', {
      cookies: c.student,
      body: { platformId: SEEDED.platforms.upwork, kind: 'other', studentId: otherStudent.id },
    });
    expect(res.status).toBe(422);
  });
});

describe('student DTOs carry no internal field (ADR-0004 section 3, canary)', () => {
  it('/me/* responses contain neither the canary nor internal keys', async () => {
    const CANARY = 'CANARY-7f3a';
    await call('PATCH', '/students/[id]', {
      cookies: c.owner,
      params: { id: student.id },
      body: { tags: [CANARY], cohort: CANARY, level: 'advanced' },
    });
    await call('PUT', '/students/[id]/lifecycle', {
      cookies: c.owner,
      params: { id: student.id },
      body: { status: 'active', reason: CANARY },
    });
    const staff = await call('GET', '/students/[id]', {
      cookies: c.owner,
      params: { id: student.id },
    });
    expect(JSON.stringify(staff.body)).toContain(CANARY);

    for (const path of [
      '/me/student',
      '/me/profiles',
      '/me/path',
      '/stages',
      '/platforms',
      '/tracks',
    ]) {
      const res = await call('GET', path, { cookies: c.student });
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(CANARY);
    }
    const me = (await call('GET', '/me/student', { cookies: c.student })).body;
    for (const key of [
      'tags',
      'cohort',
      'level',
      'health',
      'statusReason',
      'lifecycleStatus',
      'lastActivityAt',
      'completeness',
      'primaryMentorId',
      'searchText',
    ]) {
      expect(me).not.toHaveProperty(key);
    }
    expect(me.mentor).toEqual({ displayName: owner.displayName });
  });
});

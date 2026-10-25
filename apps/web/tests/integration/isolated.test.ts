import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { platforms, stages } from '@/modules/catalog/schema';
import { SEED_IDS, seedCatalogDefaults } from '@/modules/catalog/seed';
import { listStages, putAccessSettings, reorderStages } from '@/modules/catalog/service';
import { hashPassword } from '@/modules/identity/password';
import { users } from '@/modules/identity/schema';
import { CliError, eraseUser } from '@/modules/identity/service';
import { stageTransitions } from '@/modules/path/schema';
import { changeStage } from '@/modules/path/service';
import {
  mentorAssignments,
  platformProfiles,
  profileSnapshots,
  students,
} from '@/modules/students/schema';
import {
  changeMentor,
  createProfileSnapshot,
  createStudent,
  createStudentProfile,
  getStudent,
  listStudents,
  updateStudent,
} from '@/modules/students/service';
import type { Actor } from '@/server/auth/current-user';
import { ApiError } from '@/server/http/errors';
import { uniquePhone } from './helpers';
import { createIsolatedDb } from './isolated-db';

/**
 * Tests that change global state run in their own database (createIsolatedDb), calling the
 * services directly: settings.access (mentorScope, mentorsCanInviteStudents), stage order,
 * the seed, and account erasure of students and mentors (ADR-0010).
 */

let iso: Awaited<ReturnType<typeof createIsolatedDb>>;
let admin: Actor;
let mentorA: Actor;
let mentorB: Actor;

async function staff(role: 'admin' | 'mentor', name: string): Promise<Actor> {
  const [row] = await iso.db
    .insert(users)
    .values({
      role,
      status: 'active',
      phone: uniquePhone(),
      displayName: name,
      passwordHash: await hashPassword('irrelevant-long-pass-1'),
    })
    .returning({ id: users.id });
  return { userId: row?.id ?? '', role };
}

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (err) {
    if (err instanceof ApiError) return err.code;
    if (err instanceof CliError) return 'CLI';
    throw err;
  }
}

beforeAll(async () => {
  iso = await createIsolatedDb('uc_iso');
  admin = await staff('admin', 'مدیر');
  mentorA = await staff('mentor', 'مشاور الف');
  mentorB = await staff('mentor', 'مشاور ب');
});

afterAll(async () => {
  await iso?.drop();
});

describe('seed (idempotent, never overwrites edits)', () => {
  it('a second run adds nothing and keeps renamed / deactivated rows as they are', async () => {
    await iso.db
      .update(stages)
      .set({ name: 'نام تازه‌ی مربی' })
      .where(eq(stages.id, SEED_IDS.stages[1] ?? ''));
    await iso.db
      .update(platforms)
      .set({ isActive: false })
      .where(eq(platforms.id, SEED_IDS.platforms.contra));
    const again = await iso.db.transaction((tx) => seedCatalogDefaults(tx));
    expect(again).toEqual({
      tracks: 0,
      platforms: 0,
      paths: 0,
      stages: 0,
      taskTemplates: 0,
      milestoneTypes: 0,
      cannedResponses: 0,
      settings: 0,
    });
    const [stage] = await iso.db
      .select({ name: stages.name })
      .from(stages)
      .where(eq(stages.id, SEED_IDS.stages[1] ?? ''));
    expect(stage?.name).toBe('نام تازه‌ی مربی');
    const [platform] = await iso.db
      .select({ a: platforms.isActive })
      .from(platforms)
      .where(eq(platforms.id, SEED_IDS.platforms.contra));
    expect(platform?.a).toBe(false);
    const all = await listStages(admin, {}, iso.db);
    expect(all).toHaveLength(9);
    expect(all.map((s) => s.expectedDays)).toEqual([4, 10, 10, 14, 5, 42, null, null, null]);
    expect(all.filter((s) => s.isOpenEnded).map((s) => s.id)).toEqual([SEED_IDS.stages[8]]);
  });
});

describe('settings.access (ADR-0004 section 4 test 4)', () => {
  it("mentorScope = 'all' lets a mentor see every student; back to 'assigned' hides them again", async () => {
    const created = await createStudent(
      admin,
      { displayName: 'هنرجوی ب', phone: uniquePhone(), mentorId: mentorB.userId },
      {},
      iso.db,
    );
    const id = created.student.id;
    expect(await codeOf(getStudent(mentorA, id, iso.db))).toBe('NOT_FOUND');
    expect((await listStudents(mentorA, {}, iso.db)).items).toHaveLength(0);

    await putAccessSettings(
      iso.db,
      { mentorScope: 'all', mentorsCanInviteStudents: true },
      admin.userId,
    );
    expect((await getStudent(mentorA, id, iso.db)).id).toBe(id);
    expect((await listStudents(mentorA, {}, iso.db)).items.map((s) => s.id)).toContain(id);

    await putAccessSettings(
      iso.db,
      { mentorScope: 'assigned', mentorsCanInviteStudents: true },
      admin.userId,
    );
    expect(await codeOf(getStudent(mentorA, id, iso.db))).toBe('NOT_FOUND');
  });

  it('mentorsCanInviteStudents = false → a mentor gets 403 on POST /students; admin still can', async () => {
    await putAccessSettings(
      iso.db,
      { mentorScope: 'assigned', mentorsCanInviteStudents: false },
      admin.userId,
    );
    expect(
      await codeOf(createStudent(mentorA, { displayName: 'نه', phone: uniquePhone() }, {}, iso.db)),
    ).toBe('FORBIDDEN');
    expect(
      (await createStudent(admin, { displayName: 'بله', phone: uniquePhone() }, {}, iso.db)).student
        .id,
    ).toBeTruthy();
    await putAccessSettings(
      iso.db,
      { mentorScope: 'assigned', mentorsCanInviteStudents: true },
      admin.userId,
    );
  });
});

describe('stage order (PUT /stages/order)', () => {
  it('reorders in one transaction; the kanban order and "next" follow sort order', async () => {
    const before = await listStages(admin, { includeInactive: true }, iso.db);
    const ids = before.map((s) => s.id);
    const swapped = [ids[1], ids[0], ...ids.slice(2)].filter((x): x is string => x !== undefined);
    const after = await reorderStages(admin, { stageIds: swapped }, {}, iso.db);
    expect(after.map((s) => s.id)).toEqual(swapped);
    expect(await codeOf(reorderStages(mentorA, { stageIds: swapped }, {}, iso.db))).toBe(
      'FORBIDDEN',
    );
    expect(
      await codeOf(reorderStages(admin, { stageIds: [...swapped, ids[0] ?? ''] }, {}, iso.db)),
    ).toBe('VALIDATION_FAILED');
    await reorderStages(admin, { stageIds: ids }, {}, iso.db);
  });
});

describe('admin:erase-user for the new tables (ADR-0010, data-model.md 6-2)', () => {
  it('student: record anonymised, profiles and snapshots deleted, notes and reasons marked', async () => {
    const created = await createStudent(
      admin,
      { displayName: 'حذفی', phone: uniquePhone(), mentorId: mentorA.userId, tags: ['حساس'] },
      {},
      iso.db,
    );
    const id = created.student.id;
    await updateStudent(
      admin,
      id,
      { messengerHandle: '@secret', goal90d: 'هدف', nicheStatement: 'نیچ', cohort: 'ک' },
      iso.db,
    );
    const profile = await createStudentProfile(
      admin,
      id,
      {
        platformId: SEED_IDS.platforms.upwork,
        kind: 'profile',
        publicUrl: 'https://www.upwork.com/freelancers/~x',
      },
      iso.db,
    );
    await createProfileSnapshot(admin, profile.id, { bodyText: 'متن' }, iso.db);
    await changeStage(
      admin,
      id,
      { toStageId: SEED_IDS.stages[3] ?? '', kind: 'skip_by_assessment', note: 'یادداشت شخصی' },
      iso.db,
    );
    await changeMentor(admin, id, { mentorId: mentorB.userId, reason: 'دلیل شخصی' }, {}, iso.db);

    expect(
      await eraseUser(
        { userId: id, confirmDisplayName: 'حذفی', requestedOn: '2026-10-20' },
        iso.db,
      ),
    ).toBe('erased');

    const [row] = await iso.db
      .select({
        messengerHandle: students.messengerHandle,
        goal90d: students.goal90d,
        niche: students.nicheStatement,
        cohort: students.cohort,
        tags: students.tags,
        searchText: students.searchText,
        lifecycle: students.lifecycleStatus,
        stage: students.currentStageId,
      })
      .from(students)
      .where(eq(students.userId, id));
    expect(row).toEqual({
      messengerHandle: null,
      goal90d: null,
      niche: null,
      cohort: null,
      tags: [],
      searchText: 'کاربر حذف‌شده',
      lifecycle: 'dropped',
      stage: SEED_IDS.stages[3],
    });
    expect(
      await iso.db.select().from(platformProfiles).where(eq(platformProfiles.studentId, id)),
    ).toEqual([]);
    expect(
      await iso.db
        .select()
        .from(profileSnapshots)
        .where(eq(profileSnapshots.profileId, profile.id)),
    ).toEqual([]);
    const notes = await iso.db
      .select({ note: stageTransitions.note })
      .from(stageTransitions)
      .where(eq(stageTransitions.studentId, id));
    expect(notes.map((n) => n.note).filter((n) => n !== null)).toEqual(['[حذف شد]']);
    const reasons = await iso.db
      .select({ reason: mentorAssignments.reason })
      .from(mentorAssignments)
      .where(eq(mentorAssignments.studentId, id));
    expect(reasons.map((r) => r.reason).filter((r) => r !== null)).toEqual(['[حذف شد]']);
    // The staff view shows the erased record without a phone; it is out of default lists.
    const view = await getStudent(admin, id, iso.db);
    expect(view).toMatchObject({ phone: null, erased: true, displayName: 'کاربر حذف‌شده' });
    expect((await listStudents(admin, {}, iso.db)).items.map((s) => s.id)).not.toContain(id);
  });

  it('a mentor who is still primary mentor of a student cannot be erased', async () => {
    const [m] = await iso.db
      .select({ name: users.displayName })
      .from(users)
      .where(eq(users.id, mentorB.userId));
    expect(
      await codeOf(
        eraseUser(
          { userId: mentorB.userId, confirmDisplayName: m?.name ?? '', requestedOn: '2026-10-20' },
          iso.db,
        ),
      ),
    ).toBe('CLI');
    const [still] = await iso.db
      .select({ erasedAt: users.erasedAt })
      .from(users)
      .where(eq(users.id, mentorB.userId));
    expect(still?.erasedAt).toBeNull();
  });
});

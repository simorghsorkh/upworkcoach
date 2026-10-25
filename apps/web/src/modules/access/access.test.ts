import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import type { Actor } from '@/server/auth/current-user';
import type { DbOrTx } from '@/server/db';
import { ApiError } from '@/server/http/errors';
import { users } from '../identity/schema';
import { assertRefs, type RefDeps } from './refs';
import {
  isInScope,
  loadInScope,
  resolveStaffStudentScope,
  type ScopeResolver,
  scopeCondition,
} from './scope';

const admin: Actor = { userId: '00000000-0000-7000-8000-00000000000a', role: 'admin' };
const mentor: Actor = { userId: '00000000-0000-7000-8000-00000000000b', role: 'mentor' };
const otherMentorId = '00000000-0000-7000-8000-00000000000c';
const student: Actor = { userId: '00000000-0000-7000-8000-00000000000d', role: 'student' };

/** Minimal fake of the settings query: `select().from().where()` → rows. */
function fakeDb(accessValue?: unknown): DbOrTx {
  const rows = accessValue === undefined ? [] : [{ value: accessValue }];
  return {
    select: () => ({ from: () => ({ where: async () => rows }) }),
  } as unknown as DbOrTx;
}
const assignedDb = fakeDb();
const allDb = fakeDb({ mentorScope: 'all', mentorsCanInviteStudents: true });

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (err) {
    return err instanceof ApiError ? err.code : `THROWN:${(err as Error).message}`;
  }
}

describe('resolveStaffStudentScope (ADR-0004 section 1)', () => {
  const assigned = { mentorScope: 'assigned', mentorsCanInviteStudents: true } as const;
  const all = { mentorScope: 'all', mentorsCanInviteStudents: true } as const;

  it('admin → all, student → none', () => {
    expect(resolveStaffStudentScope(admin, assigned)).toEqual({ kind: 'all' });
    expect(resolveStaffStudentScope(student, all)).toEqual({ kind: 'none' });
  });

  it('mentor → own students, or all when mentorScope = all', () => {
    expect(resolveStaffStudentScope(mentor, assigned)).toEqual({
      kind: 'mentor',
      mentorId: mentor.userId,
    });
    expect(resolveStaffStudentScope(mentor, all)).toEqual({ kind: 'all' });
  });
});

describe('isInScope', () => {
  it('matches only the own primary mentor', () => {
    const scope = { kind: 'mentor', mentorId: mentor.userId } as const;
    expect(isInScope(scope, mentor.userId)).toBe(true);
    expect(isInScope(scope, otherMentorId)).toBe(false);
    expect(isInScope(scope, null)).toBe(false);
    expect(isInScope({ kind: 'all' }, null)).toBe(true);
    expect(isInScope({ kind: 'none' }, mentor.userId)).toBe(false);
  });
});

describe('scopeCondition (SEC-A2: the scope is SQL, not a post-filter)', () => {
  const dialect = new PgDialect({ casing: 'snake_case' });
  // Any uuid column works as a stand-in until students.primary_mentor_id exists.
  const column = users.createdBy;

  it('renders true / false / column = mentor', () => {
    expect(dialect.sqlToQuery(scopeCondition({ kind: 'all' }, column)).sql).toBe('true');
    expect(dialect.sqlToQuery(scopeCondition({ kind: 'none' }, column)).sql).toBe('false');
    const q = dialect.sqlToQuery(
      scopeCondition({ kind: 'mentor', mentorId: mentor.userId }, column),
    );
    expect(q.sql).toBe('"users"."created_by" = $1');
    expect(q.params).toEqual([mentor.userId]);
  });
});

describe('loadInScope (SEC-A1)', () => {
  const studentId = '00000000-0000-7000-8000-0000000000aa';
  const resolvers: Partial<Record<'task', ScopeResolver>> = {
    task: async (_db, id) =>
      id === 'task-of-mentor'
        ? { studentId, primaryMentorId: mentor.userId, resource: { id } }
        : id === 'task-of-other'
          ? { studentId, primaryMentorId: otherMentorId, resource: { id } }
          : null,
  };

  it('returns the resource inside the scope', async () => {
    const result = await loadInScope(assignedDb, mentor, 'task', 'task-of-mentor', resolvers);
    expect(result).toEqual({ studentId, resource: { id: 'task-of-mentor' } });
    await expect(
      loadInScope(assignedDb, admin, 'task', 'task-of-other', resolvers),
    ).resolves.toBeTruthy();
  });

  it('gives the same 404 for missing and out-of-scope resources', async () => {
    expect(await codeOf(loadInScope(assignedDb, mentor, 'task', 'task-of-other', resolvers))).toBe(
      'NOT_FOUND',
    );
    expect(await codeOf(loadInScope(assignedDb, mentor, 'task', 'missing', resolvers))).toBe(
      'NOT_FOUND',
    );
  });

  it('follows mentorScope = all', async () => {
    expect(await codeOf(loadInScope(allDb, mentor, 'task', 'task-of-other', resolvers))).toBeNull();
  });

  it('never lets a student through a staff path', async () => {
    expect(
      await codeOf(loadInScope(assignedDb, student, 'task', 'task-of-mentor', resolvers)),
    ).toBe('NOT_FOUND');
  });

  it('fails loudly when a kind has no resolver', async () => {
    expect(await codeOf(loadInScope(assignedDb, admin, 'note', 'x', resolvers))).toMatch(
      /no resolver/,
    );
  });
});

describe('assertRefs (C3, T-REF)', () => {
  const activeStaff = new Set([admin.userId, mentor.userId, otherMentorId]);
  const students = new Map([
    ['s-mine', mentor.userId],
    ['s-other', otherMentorId],
  ]);
  const deps: Partial<RefDeps> = {
    isActiveStaffUser: async (_db, id) => activeStaff.has(id),
    isExistingStudent: async (_db, id) => students.has(id),
    lookupPrimaryMentor: async (_db, id) => students.get(id) ?? null,
  };

  it('accepts valid references', async () => {
    await expect(
      assertRefs(
        assignedDb,
        mentor,
        [
          { field: 'reviewerId', kind: 'staffUser', id: otherMentorId },
          { field: 'ownerId', kind: 'staffUser', id: mentor.userId, mentorActorMustBeSelf: true },
          { field: 'studentIds', kind: 'studentsInScope', ids: ['s-mine', 's-mine'] },
        ],
        deps,
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects a student id as reviewer and a mentor setting someone else as owner', async () => {
    try {
      await assertRefs(
        assignedDb,
        mentor,
        [
          { field: 'reviewerId', kind: 'staffUser', id: student.userId },
          { field: 'ownerId', kind: 'staffUser', id: otherMentorId, mentorActorMustBeSelf: true },
        ],
        deps,
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(422);
      expect((err as ApiError).fields).toEqual({
        reviewerId: 'مقدار نامعتبر است',
        ownerId: 'مقدار نامعتبر است',
      });
    }
  });

  it('admin may set any active staff as owner', async () => {
    await expect(
      assertRefs(
        assignedDb,
        admin,
        [{ field: 'ownerId', kind: 'staffUser', id: otherMentorId, mentorActorMustBeSelf: true }],
        deps,
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects the whole list when one student is out of scope or missing', async () => {
    for (const ids of [
      ['s-mine', 's-other'],
      ['s-mine', 'nope'],
    ]) {
      expect(
        await codeOf(
          assertRefs(
            assignedDb,
            mentor,
            [{ field: 'studentIds', kind: 'studentsInScope', ids }],
            deps,
          ),
        ),
      ).toBe('VALIDATION_FAILED');
    }
    expect(
      await codeOf(
        assertRefs(
          allDb,
          mentor,
          [{ field: 'studentIds', kind: 'studentsInScope', ids: ['s-mine', 's-other'] }],
          deps,
        ),
      ),
    ).toBeNull();
  });

  it('students can never reference students through staff refs', async () => {
    expect(
      await codeOf(
        assertRefs(
          assignedDb,
          student,
          [{ field: 'studentId', kind: 'studentsInScope', ids: ['s-mine'] }],
          deps,
        ),
      ),
    ).toBe('VALIDATION_FAILED');
  });

  it('catalog ids must be active; profiles must belong to the same student (sprint 2)', async () => {
    const withCatalog: Partial<RefDeps> = {
      ...deps,
      isActiveCatalogRef: async (_db, kind, id) => kind === 'stage' && id === 'stage-active',
      isProfileOfStudent: async (_db, profileId, studentId) =>
        profileId === 'p1' && studentId === 's-mine',
    };
    await expect(
      assertRefs(
        assignedDb,
        mentor,
        [
          { field: 'toStageId', kind: 'catalog', catalog: 'stage', id: 'stage-active' },
          { field: 'profileId', kind: 'profileOfStudent', id: 'p1', studentId: 's-mine' },
        ],
        withCatalog,
      ),
    ).resolves.toBeUndefined();
    try {
      await assertRefs(
        assignedDb,
        admin,
        [
          { field: 'platformId', kind: 'catalog', catalog: 'platform', id: 'stage-active' },
          { field: 'profileId', kind: 'profileOfStudent', id: 'p1', studentId: 's-other' },
        ],
        withCatalog,
      );
      expect.unreachable();
    } catch (err) {
      expect((err as ApiError).fields).toEqual({
        platformId: 'مقدار نامعتبر است',
        profileId: 'مقدار نامعتبر است',
      });
    }
  });

  it('a reference kind without a rule is an error, never "allowed"', async () => {
    expect(
      await codeOf(
        assertRefs(
          assignedDb,
          admin,
          [{ field: 'profileId', kind: 'todo', reason: 'profiles' }],
          deps,
        ),
      ),
    ).toMatch(/no rule/);
  });
});

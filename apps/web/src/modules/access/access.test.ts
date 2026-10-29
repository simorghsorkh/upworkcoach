import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import type { Actor } from '@/server/auth/current-user';
import type { DbOrTx } from '@/server/db';
import { ApiError } from '@/server/http/errors';
import { users } from '../identity/schema';
import { assertRefs, type RefDeps } from './refs';
import {
  loadInScope,
  type MentorLinkCheck,
  mentoredStudentIds,
  resolveStaffStudentScope,
  type ScopeResolver,
  scopeCondition,
  studentInScope,
} from './scope';

const org = '00000000-0000-7000-8000-0000000000f1';
const admin: Actor = {
  userId: '00000000-0000-7000-8000-00000000000a',
  role: 'admin',
  organizationId: org,
  organizationRole: 'admin',
};
const mentor: Actor = {
  userId: '00000000-0000-7000-8000-00000000000b',
  role: 'mentor',
  organizationId: org,
  organizationRole: 'mentor',
};
const otherMentorId = '00000000-0000-7000-8000-00000000000c';
const otherOrg = '00000000-0000-7000-8000-0000000000f2';
const student: Actor = {
  userId: '00000000-0000-7000-8000-00000000000d',
  role: 'student',
  organizationId: org,
  organizationRole: 'mentee',
};

/** Minimal fake of the settings query: `select().from().where()` → rows. */
function fakeDb(accessValue?: unknown): DbOrTx {
  const rows = accessValue === undefined ? [] : [{ value: accessValue }];
  return {
    select: () => ({ from: () => ({ where: async () => rows }) }),
  } as unknown as DbOrTx;
}
const assignedDb = fakeDb();
const allDb = fakeDb({ mentorScope: 'all', mentorsCanInviteStudents: true });

/** Stand-in for the enrollment_mentors / run_staff query: which mentor works with whom. */
const links = new Map([
  ['s-mine', [mentor.userId]],
  ['s-shared', [mentor.userId, otherMentorId]],
  ['s-other', [otherMentorId]],
]);
const linked: MentorLinkCheck = async (_db, mentorId, _org, studentId) =>
  links.get(studentId)?.includes(mentorId) ?? false;

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
    expect(resolveStaffStudentScope(admin, assigned)).toEqual({ kind: 'all', organizationId: org });
    expect(resolveStaffStudentScope(student, all)).toEqual({ kind: 'none' });
  });

  it('mentor → own students, or all when mentorScope = all', () => {
    expect(resolveStaffStudentScope(mentor, assigned)).toEqual({
      kind: 'mentor',
      mentorId: mentor.userId,
      organizationId: org,
    });
    expect(resolveStaffStudentScope(mentor, all)).toEqual({ kind: 'all', organizationId: org });
  });
});

describe('studentInScope', () => {
  const scope = { kind: 'mentor', mentorId: mentor.userId, organizationId: org } as const;

  it('matches the students the mentor works with (primary, secondary or run staff)', async () => {
    expect(await studentInScope(assignedDb, scope, 's-mine', org, linked)).toBe(true);
    expect(await studentInScope(assignedDb, scope, 's-shared', org, linked)).toBe(true);
    expect(await studentInScope(assignedDb, scope, 's-other', org, linked)).toBe(false);
    const all = { kind: 'all', organizationId: org } as const;
    expect(await studentInScope(assignedDb, all, 's-other', org, linked)).toBe(true);
    expect(await studentInScope(assignedDb, { kind: 'none' }, 's-mine', org, linked)).toBe(false);
  });

  it('never matches a student of another organization (ADR-0011)', async () => {
    expect(await studentInScope(assignedDb, scope, 's-mine', otherOrg, linked)).toBe(false);
    const all = { kind: 'all', organizationId: org } as const;
    expect(await studentInScope(assignedDb, all, 's-mine', otherOrg, linked)).toBe(false);
  });
});

describe('scopeCondition (SEC-A2: the scope is SQL, not a post-filter)', () => {
  const dialect = new PgDialect({ casing: 'snake_case' });
  // Any uuid columns work as stand-ins for students.user_id / organization_id.
  const column = users.createdBy;
  const orgColumn = users.id;

  it("renders org = x / false / (org = x AND student IN the mentor's students)", () => {
    const all = dialect.sqlToQuery(
      scopeCondition({ kind: 'all', organizationId: org }, column, orgColumn),
    );
    expect(all.sql).toBe('"users"."id" = $1');
    expect(all.params).toEqual([org]);
    expect(dialect.sqlToQuery(scopeCondition({ kind: 'none' }, column, orgColumn)).sql).toBe(
      'false',
    );
    const q = dialect.sqlToQuery(
      scopeCondition(
        { kind: 'mentor', mentorId: mentor.userId, organizationId: org },
        column,
        orgColumn,
      ),
    );
    const sub = dialect.sqlToQuery(mentoredStudentIds(mentor.userId, org));
    expect(q.sql).toBe(
      `("users"."id" = $1 AND "users"."created_by" IN ${sub.sql.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 1}`)})`,
    );
    expect(q.params).toEqual([org, org, mentor.userId, mentor.userId]);
  });

  it('reaches students through enrollment_mentors and run_staff, never past a drop-out', () => {
    const sub = dialect.sqlToQuery(mentoredStudentIds(mentor.userId, org)).sql;
    expect(sub).toContain('FROM enrollments scope_e');
    expect(sub).toContain('scope_em.ended_at IS NULL');
    expect(sub).toContain("scope_e.status <> 'dropped' AND EXISTS (SELECT 1 FROM run_staff");
    expect(sub).toContain('scope_rs.ended_at IS NULL');
  });
});

describe('loadInScope (SEC-A1)', () => {
  const resolvers: Partial<Record<'task', ScopeResolver>> = {
    task: async (_db, id) =>
      id === 'task-of-mentor'
        ? { studentId: 's-mine', organizationId: org, resource: { id } }
        : id === 'task-of-other'
          ? { studentId: 's-other', organizationId: org, resource: { id } }
          : id === 'task-of-other-org'
            ? { studentId: 's-mine', organizationId: otherOrg, resource: { id } }
            : null,
  };

  it('returns the resource inside the scope', async () => {
    const result = await loadInScope(
      assignedDb,
      mentor,
      'task',
      'task-of-mentor',
      resolvers,
      linked,
    );
    expect(result).toEqual({ studentId: 's-mine', resource: { id: 'task-of-mentor' } });
    await expect(
      loadInScope(assignedDb, admin, 'task', 'task-of-other', resolvers, linked),
    ).resolves.toBeTruthy();
  });

  it('gives the same 404 for missing and out-of-scope resources', async () => {
    expect(
      await codeOf(loadInScope(assignedDb, mentor, 'task', 'task-of-other', resolvers, linked)),
    ).toBe('NOT_FOUND');
    expect(
      await codeOf(loadInScope(assignedDb, mentor, 'task', 'missing', resolvers, linked)),
    ).toBe('NOT_FOUND');
  });

  it('gives 404 for a resource of another organization, even to an admin', async () => {
    for (const actor of [admin, mentor]) {
      expect(
        await codeOf(loadInScope(allDb, actor, 'task', 'task-of-other-org', resolvers, linked)),
      ).toBe('NOT_FOUND');
    }
  });

  it('follows mentorScope = all', async () => {
    expect(
      await codeOf(loadInScope(allDb, mentor, 'task', 'task-of-other', resolvers, linked)),
    ).toBeNull();
  });

  it('never lets a student through a staff path', async () => {
    expect(
      await codeOf(loadInScope(assignedDb, student, 'task', 'task-of-mentor', resolvers, linked)),
    ).toBe('NOT_FOUND');
  });

  it('fails loudly when a kind has no resolver', async () => {
    expect(await codeOf(loadInScope(assignedDb, admin, 'note', 'x', resolvers, linked))).toMatch(
      /no resolver/,
    );
  });
});

describe('assertRefs (C3, T-REF)', () => {
  const activeStaff = new Set([admin.userId, mentor.userId, otherMentorId]);
  const deps: Partial<RefDeps> = {
    isActiveStaffUser: async (_db, _org, id) => activeStaff.has(id),
    isExistingStudent: async (_db, id) => links.has(id),
    lookupStudentOrganization: async (_db, id) => (links.has(id) ? { organizationId: org } : null),
    mentorWorksWithStudent: linked,
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
      isActiveCatalogRef: async (_db, _org, kind, id) => kind === 'stage' && id === 'stage-active',
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

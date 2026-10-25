import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/server/db';
import { users } from '../identity/schema';
import { buildSearchText } from './policy';
import { students } from './schema';

/**
 * Internal (identity, PATCH /users/:id — followup F-02): rebuilds `students.search_text`
 * after the name or phone of a student changed, inside the caller's transaction
 * (data-model.md 2-3; decision for the open question of sprint 2). Does not touch
 * `students.updated_at`, so an open record form is not reported as stale.
 */
export async function rebuildStudentSearchText(db: DbOrTx, studentId: string): Promise<void> {
  const [row] = await db
    .select({
      displayName: users.displayName,
      phone: users.phone,
      erasedAt: users.erasedAt,
      messengerHandle: students.messengerHandle,
      tags: students.tags,
    })
    .from(students)
    .innerJoin(users, eq(users.id, students.userId))
    .where(eq(students.userId, studentId));
  if (!row) return;
  await db
    .update(students)
    .set({
      searchText: buildSearchText({
        displayName: row.displayName,
        phone: row.erasedAt ? null : row.phone,
        messengerHandle: row.messengerHandle,
        tags: row.tags,
      }),
    })
    .where(eq(students.userId, studentId));
}

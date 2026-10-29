import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/server/db';
import { mentorProfiles } from './schema';

/** Account erasure (ADR-0010): an erased staff member's directory cards go. Schema-only imports. */
export async function eraseMentorProfiles(db: DbOrTx, userId: string): Promise<void> {
  await db.delete(mentorProfiles).where(eq(mentorProfiles.userId, userId));
}

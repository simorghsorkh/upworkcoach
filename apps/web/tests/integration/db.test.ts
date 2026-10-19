import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { createDb } from '@/server/db';
import { healthCheck } from '@/server/db/schema';

describe('database (real Postgres)', () => {
  const { db, pool } = createDb(inject('databaseUrl'), { max: 2 });

  afterAll(async () => {
    await pool.end();
  });

  it('answers select 1', async () => {
    const result = await db.execute<{ one: number }>(sql`select 1 as one`);
    expect(result.rows[0]?.one).toBe(1);
  });

  it('runs Postgres 16 or newer', async () => {
    const result = await db.execute<{ server_version_num: string }>(sql`show server_version_num`);
    expect(Number(result.rows[0]?.server_version_num)).toBeGreaterThanOrEqual(160000);
  });

  it('has applied migrations (_health table is writable)', async () => {
    const [row] = await db.insert(healthCheck).values({ note: 'integration test' }).returning();
    expect(row?.id).toBeGreaterThan(0);
    expect(row?.createdAt).toBeInstanceOf(Date);
  });
});

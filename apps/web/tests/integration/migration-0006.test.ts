import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

/**
 * ADR-0011 section 8: migration 0006 on a database that already holds 0.1 data (production
 * has real students). Applies 0000–0005, inserts rows the 0.1 way, applies 0006 and checks
 * the backfill: one organization, one membership per user, organization_id everywhere.
 */

const DEFAULT_ORG = '01920000-0000-7000-8000-00000000f001';
const ids = {
  owner: '01900000-0000-7000-8000-000000000001',
  admin2: '01900000-0000-7000-8000-000000000002',
  mentor: '01900000-0000-7000-8000-000000000003',
  student: '01900000-0000-7000-8000-000000000004',
  disabledStudent: '01900000-0000-7000-8000-000000000005',
  invited: '01900000-0000-7000-8000-000000000006',
  path: '01900000-0000-7000-8000-0000000000a1',
  stage: '01900000-0000-7000-8000-0000000000a2',
  task: '01900000-0000-7000-8000-0000000000b1',
  note: '01900000-0000-7000-8000-0000000000c1',
};

const dir = new URL('../../drizzle/', import.meta.url);
const files = fs
  .readdirSync(dir)
  .filter((f) => /^\d{4}_.*\.sql$/.test(f))
  .sort();

async function apply(client: pg.Client, file: string) {
  const text = fs.readFileSync(new URL(file, dir), 'utf8');
  for (const statement of text.split('--> statement-breakpoint')) {
    if (statement.trim()) await client.query(statement);
  }
}

let client: pg.Client;
let name = '';
let baseUrl = '';

async function admin(statement: string) {
  const url = new URL(baseUrl);
  url.pathname = '/postgres';
  const c = new pg.Client({ connectionString: url.toString() });
  await c.connect();
  try {
    await c.query(statement);
  } finally {
    await c.end();
  }
}

beforeAll(async () => {
  baseUrl = inject('databaseUrl');
  name = `mig0006_${randomBytes(4).toString('hex')}`;
  await admin(`CREATE DATABASE ${name}`);
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  client = new pg.Client({ connectionString: url.toString() });
  await client.connect();

  for (const file of files.filter((f) => f < '0006')) await apply(client, file);

  // 0.1 data: the earliest admin is the founder; one student was disabled by the admin.
  const user = (id: string, role: string, status: string, at: string, hash: string | null) =>
    client.query(
      `INSERT INTO users (id, phone, display_name, role, status, password_hash, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, `+98912${id.slice(-7)}`, `user ${id.slice(-1)}`, role, status, hash, at],
    );
  await user(ids.owner, 'admin', 'active', '2026-01-01T00:00:00Z', 'h');
  await user(ids.admin2, 'admin', 'active', '2026-02-01T00:00:00Z', 'h');
  await user(ids.mentor, 'mentor', 'active', '2026-02-02T00:00:00Z', 'h');
  await user(ids.student, 'student', 'active', '2026-03-01T00:00:00Z', 'h');
  await user(ids.disabledStudent, 'student', 'disabled', '2026-03-02T00:00:00Z', 'h');
  await user(ids.invited, 'mentor', 'invited', '2026-03-03T00:00:00Z', null);
  await client.query(`INSERT INTO learning_paths (id, name) VALUES ($1, 'مسیر')`, [ids.path]);
  await client.query(
    `INSERT INTO stages (id, path_id, display_code, name, sort_order) VALUES ($1, $2, '0', 'شروع', 0)`,
    [ids.stage, ids.path],
  );
  for (const s of [ids.student, ids.disabledStudent]) {
    await client.query(
      `INSERT INTO students (user_id, current_stage_id, stage_entered_at, primary_mentor_id)
       VALUES ($1, $2, now(), $3)`,
      [s, ids.stage, ids.mentor],
    );
  }
  await client.query(
    `INSERT INTO tasks (id, student_id, title, kind, submission_type, due_at, original_due_at,
       reviewer_id, created_by, status_changed_at)
     VALUES ($1, $2, 'کار', 'path_assignment', 'text', now(), now(), $3, $3, now())`,
    [ids.task, ids.student, ids.mentor],
  );
  await client.query(
    `INSERT INTO notes (id, student_id, author_id, body, occurred_at) VALUES ($1, $2, $3, 'یادداشت', now())`,
    [ids.note, ids.student, ids.mentor],
  );
  await client.query(
    `INSERT INTO settings (key, value) VALUES ('access', '{"mentorScope":"all","mentorsCanInviteStudents":true}')`,
  );
  await client.query(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at)
     VALUES (gen_random_uuid(), $1, 'hash-1', now() + interval '1 day')`,
    [ids.mentor],
  );

  await apply(client, files.find((f) => f.startsWith('0006')) ?? '');
}, 120_000);

afterAll(async () => {
  await client?.end();
  if (name) await admin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
});

describe('migration 0006 on 0.1 data (ADR-0011 section 8)', () => {
  it('creates the default organization', async () => {
    const { rows } = await client.query('SELECT id, slug, status FROM organizations');
    expect(rows).toEqual([{ id: DEFAULT_ORG, slug: 'default', status: 'active' }]);
  });

  it('one membership per user: earliest admin → owner, disabled → disabled membership', async () => {
    const { rows } = await client.query(
      `SELECT user_id, organization_id, role, status, disabled_at IS NOT NULL AS has_disabled_at
       FROM organization_memberships ORDER BY user_id`,
    );
    expect(rows.map((r) => [r.user_id, r.role, r.status])).toEqual([
      [ids.owner, 'owner', 'active'],
      [ids.admin2, 'admin', 'active'],
      [ids.mentor, 'mentor', 'active'],
      [ids.student, 'mentee', 'active'],
      [ids.disabledStudent, 'mentee', 'disabled'],
      [ids.invited, 'mentor', 'active'],
    ]);
    expect(rows.every((r) => r.organization_id === DEFAULT_ORG)).toBe(true);
    expect(rows.find((r) => r.user_id === ids.disabledStudent)?.has_disabled_at).toBe(true);
  });

  it('users.status becomes the account state', async () => {
    const { rows } = await client.query('SELECT id, status FROM users ORDER BY id');
    const status = Object.fromEntries(rows.map((r) => [r.id, r.status]));
    expect(status[ids.disabledStudent]).toBe('active');
    expect(status[ids.invited]).toBe('invited');
    expect(status[ids.owner]).toBe('active');
  });

  it('fills organization_id of every existing row', async () => {
    for (const [table, key] of [
      ['students', 'user_id'],
      ['tasks', 'id'],
      ['notes', 'id'],
      ['stages', 'id'],
      ['learning_paths', 'id'],
      ['sessions', 'user_id'],
      ['settings', 'key'],
    ] as const) {
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM ${table} WHERE organization_id IS DISTINCT FROM $1`,
        [DEFAULT_ORG],
      );
      expect({ table, key, n: rows[0]?.n }).toEqual({ table, key, n: 0 });
    }
    // The admin's access setting survives under the new key (organization_id, key).
    const { rows } = await client.query(
      `SELECT value->>'mentorScope' AS scope FROM settings WHERE organization_id = $1 AND key = 'access'`,
      [DEFAULT_ORG],
    );
    expect(rows[0]?.scope).toBe('all');
  });

  it('new child rows take the organization of their parent (trigger)', async () => {
    await client.query(
      `INSERT INTO notes (id, student_id, author_id, body, occurred_at)
       VALUES (gen_random_uuid(), $1, $2, 'بعد از مهاجرت', now())`,
      [ids.student, ids.mentor],
    );
    const { rows } = await client.query(
      `SELECT DISTINCT organization_id FROM notes WHERE student_id = $1`,
      [ids.student],
    );
    expect(rows).toEqual([{ organization_id: DEFAULT_ORG }]);
    await expect(
      client.query(
        `INSERT INTO notes (id, student_id, author_id, body, occurred_at)
         VALUES (gen_random_uuid(), gen_random_uuid(), $1, 'بی‌والد', now())`,
        [ids.mentor],
      ),
    ).rejects.toThrow(/set_organization_id|foreign key/);
  });
});

import { asc, eq } from 'drizzle-orm';
import { DEFAULT_LOCALE, isLocale, SUPPORTED_LOCALES } from '@/i18n/config';
import { normalizeIranMobile } from '@/lib/phone';
import { type Db, type DbOrTx, getDb } from '@/server/db';
import { recordAudit } from '../admin/service';
import { type SeedResult, seedCatalogDefaults } from '../catalog/seed';
import * as repo from './repo';
import { organizations } from './schema';
import { CliError } from './service';

/**
 * Organization CLIs (ADR-0011): there is no organization UI in the pilot, so the platform
 * operator creates and renames organizations and adds existing accounts to them from the
 * server console. Every change is audited with actor null.
 */

const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;

export type OrganizationSummary = {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'suspended';
  members: number;
};

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 120) {
    throw new CliError('--name must be 2–120 characters.');
  }
  return trimmed;
}

function checkSlug(slug: string): string {
  if (!SLUG.test(slug)) {
    throw new CliError('--slug: lower-case latin letters, digits and dashes (2–63 characters).');
  }
  return slug;
}

async function findBySlug(db: DbOrTx, slug: string) {
  const [row] = await db
    .select({ id: organizations.id, slug: organizations.slug, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.slug, slug));
  if (!row) throw new CliError(`No organization with slug "${slug}". See \`pnpm org:list\`.`);
  return row;
}

/** Organization id of a slug (for `admin:create --org`). */
export async function organizationIdBySlug(slug: string, db: Db = getDb()): Promise<string> {
  return (await findBySlug(db, slug)).id;
}

/** `pnpm org:list`. */
export async function listOrganizations(db: Db = getDb()): Promise<OrganizationSummary[]> {
  const rows = await db
    .select({
      id: organizations.id,
      slug: organizations.slug,
      name: organizations.name,
      status: organizations.status,
    })
    .from(organizations)
    .orderBy(asc(organizations.createdAt), asc(organizations.id));
  return Promise.all(
    rows.map(async (row) => ({ ...row, members: await repo.countMembers(db, row.id) })),
  );
}

/**
 * `pnpm org:create --slug … --name …`: the organization and its default catalog (stages,
 * tracks, platforms, settings…), in one transaction. Its first admin comes next with
 * `pnpm admin:create --org <slug>`.
 */
export async function createOrganization(
  input: { slug: string; name: string; locale?: string },
  db: Db = getDb(),
): Promise<{ id: string; seeded: SeedResult }> {
  const slug = checkSlug(input.slug);
  const name = cleanName(input.name);
  const defaultLocale = input.locale ?? DEFAULT_LOCALE;
  if (!isLocale(defaultLocale)) {
    throw new CliError(
      `Unknown locale "${defaultLocale}"; use one of: ${SUPPORTED_LOCALES.join(', ')}.`,
    );
  }
  return db.transaction(async (tx) => {
    const [taken] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug));
    if (taken) throw new CliError(`The slug "${slug}" is taken.`);
    const [row] = await tx
      .insert(organizations)
      .values({ slug, name, defaultLocale })
      .returning({ id: organizations.id });
    if (!row) throw new Error('organization insert returned nothing');
    const seeded = await seedCatalogDefaults(tx, row.id);
    await recordAudit(tx, {
      actorId: null,
      organizationId: row.id,
      action: 'organization.created',
      targetType: 'organization',
      targetId: row.id,
      data: { via: 'cli', slug, locale: defaultLocale },
    });
    return { id: row.id, seeded };
  });
}

/**
 * `pnpm org:rename --slug … [--name …] [--new-slug …]` — e.g. the default organization of
 * the 0.1 data becomes the pilot academy.
 */
export async function renameOrganization(
  input: { slug: string; name?: string; newSlug?: string },
  db: Db = getDb(),
): Promise<{ id: string; slug: string; name: string }> {
  if (input.name === undefined && input.newSlug === undefined) {
    throw new CliError('Nothing to change: pass --name and/or --new-slug.');
  }
  const name = input.name === undefined ? undefined : cleanName(input.name);
  const newSlug = input.newSlug === undefined ? undefined : checkSlug(input.newSlug);
  return db.transaction(async (tx) => {
    const current = await findBySlug(tx, input.slug);
    if (newSlug !== undefined && newSlug !== current.slug) {
      const [taken] = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, newSlug));
      if (taken) throw new CliError(`The slug "${newSlug}" is taken.`);
    }
    const next = { slug: newSlug ?? current.slug, name: name ?? current.name };
    await tx
      .update(organizations)
      .set({ ...next, updatedAt: new Date() })
      .where(eq(organizations.id, current.id));
    await recordAudit(tx, {
      actorId: null,
      organizationId: current.id,
      action: 'organization.renamed',
      targetType: 'organization',
      targetId: current.id,
      data: { via: 'cli', fromSlug: current.slug, toSlug: next.slug },
    });
    return { id: current.id, ...next };
  });
}

/**
 * `pnpm org:add-member --org … --phone … --role admin|mentor`: an EXISTING account (e.g. a
 * mentor who already works for another academy) joins one more organization as staff. New
 * people are invited from the app instead. Mentees belong to exactly one organization
 * (ADR-0011), so neither a mentee account nor the mentee role is accepted here.
 */
export async function addOrganizationMember(
  input: { org: string; phone: string; role: string },
  db: Db = getDb(),
): Promise<{ userId: string; organizationId: string }> {
  if (input.role !== 'admin' && input.role !== 'mentor') {
    throw new CliError('--role must be admin or mentor (mentees are invited from the app).');
  }
  const role = input.role;
  const phone = normalizeIranMobile(input.phone);
  if (!phone) throw new CliError('Invalid Iranian mobile number.');
  return db.transaction(async (tx) => {
    const org = await findBySlug(tx, input.org);
    const user = await repo.findUserByPhone(tx, phone);
    if (!user || user.erasedAt) {
      throw new CliError('No account with this phone; invite the person from the app instead.');
    }
    const memberships = await repo.listMembershipsOfUser(tx, user.id);
    if (memberships.some((m) => m.role === 'mentee')) {
      throw new CliError('This account is a mentee; a mentee belongs to one organization only.');
    }
    if (memberships.some((m) => m.organizationId === org.id)) {
      throw new CliError('This account is already a member; change the role in the app.');
    }
    await repo.insertMembership(tx, {
      organizationId: org.id,
      userId: user.id,
      role,
      invitedBy: null,
    });
    await recordAudit(tx, {
      actorId: null,
      organizationId: org.id,
      action: 'organization.member_added',
      targetType: 'user',
      targetId: user.id,
      data: { via: 'cli', role },
    });
    return { userId: user.id, organizationId: org.id };
  });
}

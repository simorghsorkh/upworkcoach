import { type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { organizationMemberships, users } from './schema';

/**
 * SQL fragments other modules use to ask about a user's membership (ADR-0011) without
 * joining `organization_memberships` themselves. `org` is a column (e.g.
 * `students.organization_id`) or an organization id.
 */
type Org = AnyPgColumn | SQL | string;

const memberRow = (userId: AnyPgColumn | SQL, org: Org) =>
  sql`${organizationMemberships.userId} = ${userId} AND ${organizationMemberships.organizationId} = ${org}`;

/** The account state as one organization sees it: a disabled membership reads `disabled`. */
export function memberAccountStatus(userId: AnyPgColumn | SQL, org: Org) {
  return sql<
    'invited' | 'active' | 'disabled'
  >`CASE WHEN EXISTS (SELECT 1 FROM ${organizationMemberships} WHERE ${memberRow(userId, org)} AND ${organizationMemberships.status} = 'disabled') THEN 'disabled' ELSE ${users.status} END`;
}

/** The user is an active owner, admin or mentor of the organization (account active too). */
export function isActiveStaffOf(userId: AnyPgColumn | SQL, org: Org): SQL {
  return sql`EXISTS (SELECT 1 FROM ${organizationMemberships} WHERE ${memberRow(userId, org)} AND ${organizationMemberships.status} = 'active' AND ${organizationMemberships.role} IN ('owner', 'admin', 'mentor'))`;
}

/** The user is an active owner or admin of the organization. */
export function isActiveAdminOf(userId: AnyPgColumn | SQL, org: Org): SQL {
  return sql`EXISTS (SELECT 1 FROM ${organizationMemberships} WHERE ${memberRow(userId, org)} AND ${organizationMemberships.status} = 'active' AND ${organizationMemberships.role} IN ('owner', 'admin'))`;
}

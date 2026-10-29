import { z } from 'zod';
import { SUPPORTED_LOCALES } from '@/i18n/config';
import { normalizeIranMobile } from '@/lib/phone';
import { normalizeFa } from '@/lib/text-fa';
import type { MeDTO, OrganizationRole, Role } from '@/server/auth/current-user';
import { isoInstantInput } from '@/server/http/schemas';
import { USER_ROLES, USER_STATUSES } from './schema';

/**
 * identity — API input schemas and DTOs (api.md sections 2 and 3).
 * All input objects are `.strict()` (SEC-A7): unknown keys → 422.
 */

export const PHONE_INVALID_MESSAGE = 'شماره‌ی موبایل معتبر نیست';

/** Accepts Persian/Arabic digits, 09…, +98…, 0098…; outputs E.164. */
export const phoneInput = z
  .string()
  .max(40)
  .transform((value, ctx) => {
    const normalized = normalizeIranMobile(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: PHONE_INVALID_MESSAGE });
      return z.NEVER;
    }
    return normalized;
  });

/** Raw password: length rules depend on the role and are checked in the service. */
const passwordInput = z.string().min(1).max(1024);

export const displayNameInput = z
  .string()
  .max(200)
  .transform((value) => normalizeFa(value))
  .pipe(z.string().min(1, 'نام را وارد کن.').max(100, 'نام حداکثر ۱۰۰ نویسه می‌تواند باشد.'));

export const tokenInput = z.string().min(1).max(200);

export const loginInput = z.strictObject({
  phone: z.string().max(40),
  password: passwordInput,
});

export const tokenLookupInput = z.strictObject({ token: tokenInput });

export const tokenAcceptInput = z.strictObject({
  token: tokenInput,
  phone: z.string().max(40),
  password: passwordInput,
});

export const changePasswordInput = z.strictObject({
  currentPassword: passwordInput,
  newPassword: passwordInput,
});

export const createInvitationInput = z.strictObject({
  role: z.enum(['mentor', 'admin']),
  displayName: displayNameInput,
  phone: phoneInput,
});

/**
 * PATCH /users/:id (A; api.md section 3, followup F-02). At least one field. Disabling and
 * changing the phone revoke every session; a student's `search_text` is rebuilt.
 */
export const updateUserInput = z
  .strictObject({
    displayName: displayNameInput.optional(),
    phone: phoneInput.optional(),
    status: z.enum(['active', 'disabled']).optional(),
    ifUpdatedAt: isoInstantInput.optional(),
  })
  .refine((v) => v.displayName !== undefined || v.phone !== undefined || v.status !== undefined, {
    message: 'دست‌کم یک مورد را تغییر بده.',
    path: ['_'],
  });
export type UpdateUserInput = z.infer<typeof updateUserInput>;

/** PATCH /users/:id/role (A). Only staff roles; students never change role (409). */
export const changeRoleInput = z.strictObject({
  role: z.enum(['admin', 'mentor']),
});

/** POST /auth/reauth (SEC-S7, followup F-06). */
export const reauthInput = z.strictObject({
  password: passwordInput,
});

/** PATCH /auth/preferences (ADR-0013). */
export const updatePreferencesInput = z.strictObject({
  locale: z.enum(SUPPORTED_LOCALES),
});

/** POST /auth/organization (ADR-0011 section 2). */
export const switchOrganizationInput = z.strictObject({
  organizationId: z.string().max(64),
});

export const listUsersQuery = z.strictObject({
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
});

// ---- DTOs ----------------------------------------------------------------------------

export type { MeDTO, Role };

export type TokenLookupDTO = {
  purpose: 'invite' | 'password_reset';
  displayName: string;
  expiresAt: string;
};

export type InviteLinkDTO = { inviteUrl: string; expiresAt: string };
export type ResetLinkDTO = { resetUrl: string; expiresAt: string };
export type InvitationCreatedDTO = InviteLinkDTO & { userId: string };

/** GET /users row (admin only). */
export type UserListItemDTO = {
  id: string;
  displayName: string;
  phone: string | null;
  role: Role;
  status: 'invited' | 'active' | 'disabled';
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  /**
   * SEC-T5: when and on what device (raw User-Agent, ≤ 512 characters) the invite was
   * accepted. From `users.invite_accepted_*` (F-01), so it no longer disappears after 7 days.
   */
  inviteAcceptedAt: string | null;
  inviteAcceptedDevice: string | null;
  erasedAt: string | null;
  /** For `ifUpdatedAt` of PATCH /users/:id (F-02). */
  updatedAt: string;
};

/** POST /auth/reauth → 200: sensitive admin actions are allowed on this session until then. */
export type ReauthDTO = { validUntil: string };

/** GET /auth/sessions row ("my devices"). */
export type SessionDTO = {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  userAgent: string | null;
  ip: string | null;
  current: boolean;
};

/** GET /auth/organizations row. */
export type OrganizationOptionDTO = {
  id: string;
  name: string;
  role: OrganizationRole;
  current: boolean;
};

/** GET /mentors row. */
export type MentorOptionDTO = { id: string; displayName: string; role: 'admin' | 'mentor' };

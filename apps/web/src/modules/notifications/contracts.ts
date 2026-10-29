import { z } from 'zod';
import { uuidInput } from '@/server/http/schemas';
import type { NotificationData, NotificationKind } from './schema';

/** GET /notifications (A, M, S): the caller's own notices in the active organization. */
export const listNotificationsQuery = z.strictObject({
  /** `createdAt|id` of the last item of the previous page. */
  cursor: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuery>;

/** POST /notifications/read: these ids, or every unread one when `ids` is absent. */
export const markNotificationsReadInput = z.strictObject({
  ids: z.array(uuidInput).min(1).max(100).optional(),
});
export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadInput>;

export type NotificationDTO = {
  id: string;
  kind: NotificationKind;
  /** Where the notice leads, for the recipient's role. */
  href: string;
  data: NotificationData;
  student: { id: string; displayName: string } | null;
  actor: { displayName: string } | null;
  read: boolean;
  createdAt: string;
};

export type NotificationListDTO = {
  items: NotificationDTO[];
  unread: number;
  nextCursor: string | null;
};

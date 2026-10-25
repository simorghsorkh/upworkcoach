import type { ReactNode } from 'react';
import { requireUser } from '@/server/auth/current-user';

/** Admin-only pages (results, settings). Mentors do not see them in the menu either. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireUser(['admin']);
  return children;
}

import { redirect } from 'next/navigation';
import { homeFor } from '@/components/auth/redirects';
import { getCurrentUser } from '@/server/auth/current-user';

/** `/`: signed out → /login; signed in → the role's first page (sitemap §2). */
export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(user ? homeFor(user.role) : '/login');
}

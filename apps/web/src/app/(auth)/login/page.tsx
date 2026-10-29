import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LoginForm } from '@/components/auth/login-form';
import { homeFor, safeNext } from '@/components/auth/redirects';
import { getCurrentUser } from '@/server/auth/current-user';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('pageTitle'))('login') };
}

/** G1 — sign in with mobile + password. */
export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const next = typeof params.next === 'string' ? safeNext(params.next) : null;
  const user = await getCurrentUser();
  if (user) redirect(next ?? homeFor(user.role));
  return <LoginForm next={next} />;
}

import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { NotificationList } from '@/components/notifications/notification-list';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { listNotifications } from '@/modules/notifications/service';
import { requireUser, toActor } from '@/server/auth/current-user';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('pageTitle'))('notifications') };
}

/** Coach Office sprint 6b — the caller's in-app notifications. */
export default async function StaffNotificationsPage() {
  const user = await requireUser(['admin', 'mentor']);
  const [t, list] = await Promise.all([
    getTranslations('notifications'),
    listNotifications(toActor(user)),
  ]);
  return (
    <>
      <PageHead title={t('title')} sub={t('sub')} />
      <Card>
        <NotificationList initial={list} />
      </Card>
    </>
  );
}

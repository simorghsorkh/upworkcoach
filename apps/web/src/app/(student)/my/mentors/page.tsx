import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BookingList } from '@/components/scheduling/booking-list';
import { MentorCards } from '@/components/scheduling/mentee-booking';
import { Card, CardHead } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { EmptyState } from '@/components/ui/states';
import { listBookableMentors, listBookings } from '@/modules/scheduling/service';
import { requireUser, toActor } from '@/server/auth/current-user';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('pageTitle'))('booking') };
}

/**
 * Coach Office sprint 7 — the mentee picks a mentor taking bookings (with their session types
 * and the mentee's own package of each) and follows their session requests.
 */
export default async function MyMentorsPage() {
  const user = await requireUser(['student']);
  const actor = toActor(user);
  const [t, mentors, requests] = await Promise.all([
    getTranslations('scheduling.mentee'),
    listBookableMentors(actor),
    listBookings(actor),
  ]);
  return (
    <>
      <PageHead title={t('title')} sub={t('sub')} />
      <div className="flex flex-col gap-4 md:gap-5">
        {mentors.length ? (
          <MentorCards mentors={mentors} />
        ) : (
          <Card>
            <EmptyState icon="calendar" title={t('empty')} headingLevel={2} />
          </Card>
        )}
        {requests.length ? (
          <Card aria-labelledby="h-my-requests">
            <CardHead title={t('myRequests')} titleId="h-my-requests" icon="inbox" />
            <BookingList initial={requests} view="mentee" empty={t('noRequests')} />
          </Card>
        ) : null}
      </div>
    </>
  );
}

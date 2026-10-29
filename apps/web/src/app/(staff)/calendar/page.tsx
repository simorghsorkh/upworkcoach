import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AvailabilityEditor } from '@/components/scheduling/availability-editor';
import { BookingList } from '@/components/scheduling/booking-list';
import { Card, CardHead } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { ChipLink } from '@/components/ui/seg';
import { getAvailability, listBookings, listCalendarMentors } from '@/modules/scheduling/service';
import { requireUser, toActor } from '@/server/auth/current-user';
import { ApiError } from '@/server/http/errors';

type SearchParams = Promise<{ mentor?: string | string[] }>;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('pageTitle'))('calendar') };
}

/**
 * Coach Office sprint 7 — a mentor's bookable calendar: requests waiting for them, the session
 * types they take bookings for, weekly hours and exceptions. An admin opens anyone's with
 * `?mentor=`.
 */
export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['admin', 'mentor']);
  const actor = toActor(user);
  const { mentor } = await searchParams;
  const mentorId = (actor.role === 'admin' && typeof mentor === 'string' && mentor) || user.id;
  let availability: Awaited<ReturnType<typeof getAvailability>>;
  try {
    availability = await getAvailability(actor, mentorId);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 422)) notFound();
    throw err;
  }
  const [t, mentors, requests] = await Promise.all([
    getTranslations('scheduling'),
    actor.role === 'admin' ? listCalendarMentors(actor) : Promise.resolve([]),
    listBookings(actor, { status: 'open', mentorId }),
  ]);
  const own = mentorId === user.id;
  return (
    <>
      <PageHead
        title={
          own ? (
            t('calendar.title')
          ) : (
            <bdi>{t('calendar.titleOf', { name: availability.mentor.displayName })}</bdi>
          )
        }
        sub={t('calendar.sub')}
      />
      {mentors.length > 1 ? (
        <nav aria-label={t('calendar.mentor')} className="mb-4 flex flex-wrap gap-2">
          {mentors.map((m) => (
            <ChipLink key={m.id} href={`/calendar?mentor=${m.id}`} active={m.id === mentorId}>
              <bdi>{m.displayName}</bdi>
            </ChipLink>
          ))}
        </nav>
      ) : null}
      <div className="flex flex-col gap-4">
        <Card aria-labelledby="h-requests">
          <CardHead
            title={t('calendar.requests')}
            titleId="h-requests"
            icon="inbox"
            count={requests.length || undefined}
          />
          <BookingList
            key={mentorId}
            initial={requests}
            view="staff"
            empty={t('calendar.noRequests')}
          />
        </Card>
        <AvailabilityEditor key={mentorId} initial={availability} />
      </div>
    </>
  );
}

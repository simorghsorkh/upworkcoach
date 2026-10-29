import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { BookingForm } from '@/components/scheduling/mentee-booking';
import { PageHead } from '@/components/ui/page-head';
import { getSlots, listBookableMentors } from '@/modules/scheduling/service';
import { requireUser, toActor } from '@/server/auth/current-user';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ type?: string | string[] }>;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('pageTitle'))('booking') };
}

/** Coach Office sprint 7 — one mentor's session types and free slots; the mentee requests one. */
export default async function BookMentorPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const user = await requireUser(['student']);
  const actor = toActor(user);
  const [{ id }, { type }] = await Promise.all([params, searchParams]);
  const mentor = (await listBookableMentors(actor)).find((m) => m.id === id);
  if (!mentor) notFound();
  const offering = mentor.offerings.find((o) => o.templateId === type) ?? mentor.offerings[0];
  if (!offering) notFound();
  const [t, slots] = await Promise.all([
    getTranslations('scheduling.mentee'),
    getSlots(actor, mentor.id, offering.templateId),
  ]);
  return (
    <>
      <PageHead
        eyebrow={
          <Link href="/my/mentors" className="hover:text-link">
            {t('back')}
          </Link>
        }
        title={<bdi>{mentor.displayName}</bdi>}
        sub={mentor.specialties.length ? mentor.specialties.join(' · ') : undefined}
      />
      <BookingForm mentor={mentor} templateId={offering.templateId} slots={slots} />
    </>
  );
}

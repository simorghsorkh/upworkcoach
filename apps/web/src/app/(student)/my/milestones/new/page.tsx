import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/icons/icon';
import { ProposeMilestone } from '@/components/milestones/propose-milestone';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { listMilestoneTypes, listPlatforms } from '@/modules/catalog/service';
import { NoRecord } from '../../../_components';
import { loadOwn } from '../../../_load';

export const metadata: Metadata = { title: 'ثبت خبر خوب' };

/** S8 — propose a milestone with evidence; the mentor approves it (F9). */
export default async function NewMilestonePage() {
  const { actor, student } = await loadOwn();
  if (!student) return <NoRecord />;
  const [types, platforms] = await Promise.all([listMilestoneTypes(actor), listPlatforms(actor)]);
  return (
    <>
      <nav aria-label="مسیر" className="mb-3 hidden items-center gap-1.5 text-sm text-fg-3 md:flex">
        <Link href="/home" className="font-medium text-fg-2 hover:text-link">
          خانه
        </Link>
        <Icon name="chev-next" size={14} />
        <span aria-current="page" className="font-semibold text-fg">
          ثبت خبر خوب
        </span>
      </nav>
      <PageHead
        title="ثبت خبر خوب"
        sub={`اولین پاسخ کارفرما، اولین قرارداد یا درآمد تازه را ثبت کن تا ${student.mentor?.displayName ?? 'مشاورت'} تأییدش کند.`}
      />
      <Card>
        <ProposeMilestone
          types={types.filter((t) => t.isActive)}
          platforms={platforms.map((p) => ({ id: p.id, name: p.name }))}
        />
      </Card>
    </>
  );
}

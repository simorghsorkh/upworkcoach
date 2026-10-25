'use client';

import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import type { MilestoneTypeDTO } from '@/modules/catalog/contracts';
import { MilestoneForm } from './milestone-form';

/** S8 wrapper: after a proposal, back to the home page where it shows «منتظر تأیید». */
export function ProposeMilestone({
  types,
  platforms,
}: {
  types: MilestoneTypeDTO[];
  platforms: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const toast = useToast();
  return (
    <MilestoneForm
      mode="student"
      types={types}
      platforms={platforms}
      onCancel={() => router.back()}
      onDone={() => {
        toast.show({ message: 'فرستاده شد. وقتی مشاورت تأیید کند، در خانه می‌بینی‌اش.' });
        router.push('/home');
        router.refresh();
      }}
    />
  );
}

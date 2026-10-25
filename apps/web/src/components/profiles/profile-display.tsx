import { faNumber } from '@/components/format/fa';
import { Icon } from '@/components/icons/icon';
import { profileStatusLabel, rateUnitSuffix } from '@/components/students/labels';
import { cn } from '@/components/ui/cn';
import type { ProfileDTO, ProfileStatus } from '@/modules/students/contracts';

/** Shared (server and client) display helpers for platform showcases. */

const statusChip: Record<ProfileStatus, string> = {
  building: 'bg-st-open-bg text-st-open-fg',
  active: 'bg-h-green-bg text-h-green-fg',
  restricted: 'bg-h-yellow-bg text-h-yellow-fg',
  suspended: 'bg-h-red-bg text-h-red-fg',
};

/** «۲۵ USD/ساعت» — the amount comes as a decimal string («25.00»). */
export function formatRate(p: Pick<ProfileDTO, 'rateAmount' | 'rateCurrency' | 'rateUnit'>) {
  if (!p.rateAmount) return null;
  const amount = Number(p.rateAmount);
  const currency = p.rateCurrency === 'USD' || !p.rateCurrency ? 'دلار' : p.rateCurrency;
  const n = Number.isInteger(amount) ? faNumber(amount) : amount.toLocaleString('fa-IR');
  return `${n} ${currency}${p.rateUnit ? rateUnitSuffix[p.rateUnit] : ''}`;
}

export function ProfileStatusChip({ status }: { status: ProfileStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[5px] whitespace-nowrap rounded-xs px-2 py-[3px] text-xs leading-4 font-semibold',
        statusChip[status],
      )}
    >
      {status === 'active' ? <Icon name="check" size={14} /> : null}
      {profileStatusLabel[status]}
    </span>
  );
}

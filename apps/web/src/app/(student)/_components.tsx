import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';

/** Shown when a student account has no record yet (should not happen after an invite). */
export function NoRecord() {
  return (
    <Card>
      <EmptyState icon="user" tone="brand" title="پرونده‌ات هنوز آماده نیست" headingLevel={1}>
        به مربی‌ات پیام بده تا پرونده‌ات را کامل کند.
      </EmptyState>
    </Card>
  );
}

/** «به‌زودی» card for home sections that arrive in later sprints. */
export function SoonCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: 'tasks' | 'chat';
  children: string;
}) {
  return (
    <Card aria-label={title}>
      <h2 className="mb-1 text-h2">{title}</h2>
      <EmptyState icon={icon} tone="brand" title="به‌زودی" className="py-5">
        {children}
      </EmptyState>
    </Card>
  );
}

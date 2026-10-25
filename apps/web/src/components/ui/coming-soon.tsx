import type { IconName } from '@/components/icons/icon';
import { Card } from './card';
import { PageHead } from './page-head';
import { EmptyState } from './states';

/**
 * Temporary page for routes built in later sprints, so navigation works end to end.
 * (Not for AI tools or payments: those must not appear at all in 0.1 — design-system §10.)
 */
export function ComingSoon({
  title,
  icon,
  children,
}: {
  title: string;
  icon: IconName;
  /** One sentence on what this page will do. */
  children: string;
}) {
  return (
    <>
      <PageHead title={title} />
      <Card>
        <EmptyState icon={icon} tone="brand" title="به‌زودی" headingLevel={2}>
          {children}
        </EmptyState>
      </Card>
    </>
  );
}
